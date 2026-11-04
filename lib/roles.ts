import type { UserRole } from '@prisma/client'

// Contabilidad (ACCOUNTING) has every administrator capability plus the accounting
// modules. Every "is this an administrator?" check goes through here so the role is
// honoured consistently in pages, route handlers, menus and SQL.
export const ADMIN_ROLES: UserRole[] = ['ADMIN', 'ACCOUNTING']
export const STAFF_ROLES: UserRole[] = ['ADMIN', 'AGENT', 'ACCOUNTING']
/** Roles that can be assigned from the Users screen (customers are managed in Clientes). */
export const MANAGED_ROLES: UserRole[] = ['ADMIN', 'AGENT', 'ACCOUNTING']

export const isManagedRole = (role: unknown): role is UserRole => typeof role === 'string' && (MANAGED_ROLES as string[]).includes(role)
export const isAdmin = (role?: string | null) => role === 'ADMIN' || role === 'ACCOUNTING'
export const isStaff = (role?: string | null) => role === 'ADMIN' || role === 'AGENT' || role === 'ACCOUNTING'
/** Accounting modules: quotes, products, taxes and billing accounts. */
export const canUseAccounting = (role?: string | null) => isAdmin(role)

export const roleLabels: Record<string, string> = {
  ADMIN: 'Administrador',
  AGENT: 'Agente',
  CUSTOMER: 'Cliente',
  ACCOUNTING: 'Contabilidad',
}
