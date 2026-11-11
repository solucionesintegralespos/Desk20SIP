// Shapes returned by the inventory API, shared by the inventory screens.
export type StockProduct = {
  id: string; name: string; description: string | null; price: number; active: boolean
  stock: number; loaned: number; available: number; total: number; lastMovementAt: string | null
}
export type StockResponse = { products: StockProduct[]; totals: { products: number; units: number; loaned: number }; permissions: { writeOff: boolean } }

export type MovementType = 'PURCHASE' | 'ENTRY' | 'WRITE_OFF' | 'COUNT' | 'LOAN_OUT' | 'LOAN_IN'
export type Movement = {
  id: string; productId: string; productName: string; type: MovementType; typeLabel: string
  quantity: number; balanceAfter: number; unitCost: number | null; countedQuantity: number | null
  reference: string | null; notes: string | null; loanId: string | null; loanNumber: number | null
  createdBy: { id: string; name: string } | null; createdAt: string
}
export type MovementsResponse = { movements: Movement[]; total: number; page: number; perPage: number }

export const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
