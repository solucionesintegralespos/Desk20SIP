import { Prisma } from '@prisma/client'
import { loanAge } from './stock'

// Shared by the loan routes (list, return, report). Route files may only export handlers.
export const loanInclude = {
  items: { include: { product: { select: { id: true, name: true } } }, orderBy: { position: 'asc' as const } },
  customer: { select: { id: true, name: true, email: true, businessName: true } },
  technician: { select: { id: true, name: true, email: true } },
} satisfies Prisma.EquipmentLoanInclude
export type LoanRow = Prisma.EquipmentLoanGetPayload<{ include: typeof loanInclude }>

export const loanNumberLabel = (number: number) => `PR-${String(number).padStart(4, '0')}`

/** "Impresora × 2, Cable HDMI × 1" */
export const loanItemsLabel = (items: { product: { name: string }; quantity: number }[]) => items.map(item => `${item.product.name} × ${item.quantity}`).join(', ')

export function serializeLoan(loan: LoanRow) {
  const age = loanAge(loan.outAt, loan.returnedAt || new Date())
  const items = loan.items.map(item => ({ id: item.id, productId: item.product.id, name: item.product.name, quantity: item.quantity }))
  return {
    id: loan.id, number: loan.number, numberLabel: loanNumberLabel(loan.number),
    items, units: items.reduce((sum, item) => sum + item.quantity, 0), itemsLabel: loanItemsLabel(loan.items),
    customer: { id: loan.customer.id, name: loan.customer.name || loan.customer.email || 'Cliente', businessName: loan.customer.businessName },
    technician: { id: loan.technician.id, name: loan.technician.name || loan.technician.email || 'Técnico' },
    status: loan.status, outAt: loan.outAt.toISOString(), outNotes: loan.outNotes, outPhotos: loan.outPhotos,
    returnedAt: loan.returnedAt ? loan.returnedAt.toISOString() : null, returnNotes: loan.returnNotes, returnPhotos: loan.returnPhotos,
    ageLabel: age.label, days: age.days,
  }
}
export type SerializedLoan = ReturnType<typeof serializeLoan>
