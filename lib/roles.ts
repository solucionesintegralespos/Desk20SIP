import type { UserRole } from '@prisma/client'

// Role model:
// - ADMIN: everything, including the accounting modules.
// - AGENT: support staff (tickets, schedule, orders, checklists, customers).
// - ACCOUNTING (Contabilidad): the same access as an agent plus the accounting modules
//   (catalog, quotes, billing accounts). It is NOT an administrator.
// - CUSTOMER: own tickets only.
// Every role check goes through these helpers so pages, route handlers, menus and SQL agree.
export const ADMIN_ROLES: UserRole[] = ['ADMIN']
export const STAFF_ROLES: UserRole[] = ['ADMIN', 'AGENT', 'ACCOUNTING']
export const ACCOUNTING_ROLES: UserRole[] = ['ADMIN', 'ACCOUNTING']
/** Roles that can be assigned from the Users screen (customers are managed in Clientes). */
export const MANAGED_ROLES: UserRole[] = ['ADMIN', 'AGENT', 'ACCOUNTING']

export const isManagedRole = (role: unknown): role is UserRole => typeof role === 'string' && (MANAGED_ROLES as string[]).includes(role)
export const isAdmin = (role?: string | null) => role === 'ADMIN'
export const isStaff = (role?: string | null) => role === 'ADMIN' || role === 'AGENT' || role === 'ACCOUNTING'
/** Accounting modules: catalog, quotes and billing accounts. */
export const canUseAccounting = (role?: string | null) => role === 'ADMIN' || role === 'ACCOUNTING'

export const roleLabels: Record<string, string> = {
  ADMIN: 'Administrador',
  AGENT: 'Agente',
  CUSTOMER: 'Cliente',
  ACCOUNTING: 'Contabilidad',
}
