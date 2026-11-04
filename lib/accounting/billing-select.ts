import type { Prisma } from '@prisma/client'

// Every BillingAccount scalar except the stored PDF, which only the download endpoints read.
export const accountSelect = {
  id: true, customerId: true, number: true, templateId: true, period: true, concept: true, total: true, snapshot: true,
  status: true, publicToken: true, publicEnabled: true, issuedAt: true, dueAt: true, voidedAt: true, voidReason: true,
  createdById: true, createdAt: true, updatedAt: true,
  customer: { select: { id: true, name: true, email: true, businessName: true, taxId: true } },
  template: { select: { id: true, concept: true } },
} satisfies Prisma.BillingAccountSelect
