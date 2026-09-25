BEGIN;
CREATE TABLE IF NOT EXISTS public."TicketAssignee" (
  "ticketId" TEXT NOT NULL REFERENCES public."Ticket"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT,
  PRIMARY KEY ("ticketId", "userId")
);
CREATE INDEX IF NOT EXISTS "TicketAssignee_userId_idx" ON public."TicketAssignee"("userId");
INSERT INTO public."TicketAssignee" ("ticketId", "userId")
SELECT "id", "assigneeId" FROM public."Ticket" WHERE "assigneeId" IS NOT NULL
ON CONFLICT DO NOTHING;
-- Prisma accesses PostgreSQL through the server. No browser access to this table.
ALTER TABLE public."TicketAssignee" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.ticket_assignment_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'DELETE' THEN
    PERFORM id FROM "User" WHERE id = NEW."userId" AND role IN ('ADMIN', 'AGENT') FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Solo se pueden asignar técnicos o administradores'; END IF;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    PERFORM id FROM "Ticket" WHERE id = OLD."ticketId" FOR UPDATE;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DROP TRIGGER IF EXISTS ticket_assignment_guard ON public."TicketAssignee";
CREATE TRIGGER ticket_assignment_guard BEFORE INSERT OR UPDATE OR DELETE ON public."TicketAssignee"
FOR EACH ROW EXECUTE FUNCTION public.ticket_assignment_guard();

CREATE OR REPLACE FUNCTION public.ticket_technician_role_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.role = 'CUSTOMER' AND EXISTS (SELECT 1 FROM "TicketAssignee" WHERE "userId" = NEW.id) THEN
    RAISE EXCEPTION 'Un técnico asignado no puede convertirse en cliente';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ticket_technician_role_guard ON public."User";
CREATE TRIGGER ticket_technician_role_guard BEFORE UPDATE OF role ON public."User"
FOR EACH ROW EXECUTE FUNCTION public.ticket_technician_role_guard();

CREATE OR REPLACE FUNCTION public.ticket_primary_assignment() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW."assigneeId" IS NOT NULL THEN
    INSERT INTO "TicketAssignee" ("ticketId", "userId") VALUES (NEW.id, NEW."assigneeId") ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ticket_primary_assignment ON public."Ticket";
CREATE TRIGGER ticket_primary_assignment AFTER INSERT OR UPDATE OF "assigneeId" ON public."Ticket"
FOR EACH ROW EXECUTE FUNCTION public.ticket_primary_assignment();

CREATE OR REPLACE FUNCTION public.ticket_creation_required() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.type IS NULL OR NEW."categoryId" IS NULL THEN
    RAISE EXCEPTION 'El tipo y la categoría son obligatorios';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ticket_creation_required ON public."Ticket";
CREATE TRIGGER ticket_creation_required BEFORE INSERT ON public."Ticket"
FOR EACH ROW EXECUTE FUNCTION public.ticket_creation_required();

CREATE OR REPLACE FUNCTION public.ticket_minimum_assignment() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE target_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'Ticket' THEN target_id := NEW.id; ELSE target_id := OLD."ticketId"; END IF;
  IF EXISTS (SELECT 1 FROM "Ticket" WHERE id = target_id)
     AND NOT EXISTS (SELECT 1 FROM "TicketAssignee" WHERE "ticketId" = target_id) THEN
    RAISE EXCEPTION 'El ticket debe tener al menos un técnico';
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS ticket_minimum_assignment ON public."Ticket";
CREATE CONSTRAINT TRIGGER ticket_minimum_assignment AFTER INSERT ON public."Ticket"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.ticket_minimum_assignment();
DROP TRIGGER IF EXISTS ticket_keep_assignment ON public."TicketAssignee";
CREATE CONSTRAINT TRIGGER ticket_keep_assignment AFTER DELETE OR UPDATE ON public."TicketAssignee"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.ticket_minimum_assignment();
COMMIT;
