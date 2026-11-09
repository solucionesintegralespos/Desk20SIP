import { Prisma } from '@prisma/client'
import { loanAge } from './stock'

// Shared by the loan routes (list, return, report). Route files may only export handlers.
export const loanInclude = {
  product: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true, email: true, businessName: true } },
  technician: { select: { id: true, name: true, email: true } },
} satisfies Prisma.EquipmentLoanInclude
export type LoanRow = Prisma.EquipmentLoanGetPayload<{ include: typeof loanInclude }>

export const loanNumberLabel = (number: number) => `PR-${String(number).padStart(4, '0')}`

export function serializeLoan(loan: LoanRow) {
  const age = loanAge(loan.outAt, loan.returnedAt || new Date())
  return {
    id: loan.id, number: loan.number, numberLabel: loanNumberLabel(loan.number),
    product: { id: loan.product.id, name: loan.product.name }, quantity: loan.quantity,
    customer: { id: loan.customer.id, name: loan.customer.name || loan.customer.email || 'Cliente', businessName: loan.customer.businessName },
    technician: { id: loan.technician.id, name: loan.technician.name || loan.technician.email || 'Técnico' },
    status: loan.status, outAt: loan.outAt.toISOString(), outNotes: loan.outNotes, outPhotos: loan.outPhotos,
    returnedAt: loan.returnedAt ? loan.returnedAt.toISOString() : null, returnNotes: loan.returnNotes, returnPhotos: loan.returnPhotos,
    ageLabel: age.label, days: age.days,
  }
}
export type SerializedLoan = ReturnType<typeof serializeLoan>
