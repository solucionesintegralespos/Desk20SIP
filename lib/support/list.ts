import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { dailyRange } from '@/lib/daily-filter'
type ListRecord={id:string;kind:string;revision:number;payload:Prisma.JsonValue}
// Keep binary evidence and signatures out of list responses, including the DB read.
// The detail endpoint reads the complete immutable document when it is opened.
export function serviceList(kinds:string[],user:{id:string;role:string}, range = dailyRange()) {
  return prisma.$queryRaw<ListRecord[]>(Prisma.sql`
    SELECT "id", "kind", "revision",
      CASE
        WHEN "kind" = 'orders' THEN ("payload" - 'signature') || jsonb_build_object('createdById', "creatorId")
        WHEN "kind" = 'checklists' THEN jsonb_set("payload", '{responses}',
          (SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'item', r->'item', 'checked', r->'checked', 'notes', '', 'evidence', '[]'::jsonb
          )), '[]'::jsonb) FROM jsonb_array_elements("payload"->'responses') r))
        ELSE "payload"
      END AS "payload"
    FROM "ServiceRecord"
    CROSS JOIN LATERAL (SELECT COALESCE("payload"->>'createdById',
      (SELECT "actorId" FROM "ServiceAuditEvent" WHERE "entityId"="ServiceRecord"."id"
       AND "action" IN ('orders:created','orders:completed') ORDER BY "createdAt", "id" LIMIT 1), "techId") AS "creatorId") owner
    WHERE "kind" IN (${Prisma.join(kinds)})
      AND ("kind" = 'templates' OR (
        (CASE WHEN "kind" = 'orders' THEN NULLIF("payload"->>'startTime', '')::timestamptz
          ELSE COALESCE(NULLIF("payload"->>'completedAt', ''), NULLIF("payload"->>'createdAt', ''))::timestamptz END) >= ${range.gte}
        AND (CASE WHEN "kind" = 'orders' THEN NULLIF("payload"->>'startTime', '')::timestamptz
          ELSE COALESCE(NULLIF("payload"->>'completedAt', ''), NULLIF("payload"->>'createdAt', ''))::timestamptz END) < ${range.lt}
      ))
      -- Agents see the orders they created or took part in (payload techIds).
      AND (${user.role==='ADMIN'} OR "kind"='templates' OR
        CASE WHEN "kind"='orders' THEN "creatorId"=${user.id}
          OR COALESCE("payload"->'techIds','[]'::jsonb) @> jsonb_build_array(${user.id}::text)
        ELSE "techId"=${user.id} END)
    ORDER BY "updatedAt" DESC
  `)
}
