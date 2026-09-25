'use client'
import Image from "next/image"

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { 
  Home, 
  MessageSquare, 
  Users, 
  Settings, 
  LogOut, 
  Headphones,
  UserCircle,
  Tag,
  Menu,
  X,
  BarChart2,
  ClipboardCheck,
  CalendarDays,
  FileSignature
} from 'lucide-react'
import { useOrg } from '@/components/OrgProvider'
import { ThemeToggle } from '@/components/ThemeProvider'
import { TICKETS_PATH, useTicketsListHref } from '@/lib/tickets-list-query'
import { NotificationToggle } from '@/components/reminders/TaskReminders'

interface SidebarProps {
  user?: {
    name?: string | null
    email?: string | null
    role?: string
  }
  openTicketsCount?: number
}

export default function Sidebar({ user, openTicketsCount }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [desktopCollapsed, setDesktopCollapsed] = useState(false)
  const { orgName, orgLogo } = useOrg()
  const pathname = usePathname()
  const userRole = user?.role || 'CUSTOMER'
  // The tickets entry returns to the list with its last filters.
  const ticketsListHref = useTicketsListHref()
  const linkHref = (href: string) => href === TICKETS_PATH ? ticketsListHref : href


  // Definir navegación según el rol
  const allNavigation = [
    { name: 'Dashboard', href: '/dashboard', icon: Home, roles: ['CUSTOMER', 'AGENT', 'ADMIN'] },
    { name: 'Tickets', href: '/dashboard/tickets', icon: MessageSquare, roles: ['CUSTOMER', 'AGENT', 'ADMIN'] },
    { name: 'Programación', href: '/dashboard/schedule', icon: CalendarDays, roles: ['AGENT', 'ADMIN'] },
    { name: 'Órdenes de servicio', href: '/dashboard/orders', icon: FileSignature, roles: ['AGENT', 'ADMIN'] },
    { name: 'Checklists', href: '/dashboard/checklists', icon: ClipboardCheck, roles: ['AGENT', 'ADMIN'] },
    { name: 'Reportes', href: '/dashboard/reports', icon: BarChart2, roles: ['ADMIN'] },
    { name: 'Incentivos', href: '/dashboard/incentives', icon: BarChart2, roles: ['ADMIN'] },
    { name: 'Categorías', href: '/dashboard/categories', icon: Tag, roles: ['ADMIN'] },
    { name: 'Clientes', href: '/dashboard/customers', icon: Users, roles: ['AGENT', 'ADMIN'] },
    { name: 'Usuarios', href: '/dashboard/users', icon: Users, roles: ['ADMIN'] },
    { name: 'Configuración', href: '/dashboard/settings', icon: Settings, roles: ['ADMIN'] },
  ]

  // Filtrar navegación por rol
  const navigation = allNavigation.filter(item => item.roles.includes(userRole))

  return (
    <>
      {desktopCollapsed && <div className="hidden md:flex w-14 shrink-0 min-h-0 flex-col items-center border-r bg-white py-3">
        <button type="button" onClick={() => setDesktopCollapsed(false)} aria-label="Mostrar barra lateral" title="Mostrar barra lateral" aria-expanded={false} aria-controls="dashboard-sidebar" className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-primary-500">
          <Menu className="h-5 w-5" />
        </button>
        <nav aria-label="Menú compacto" className="flex-1 min-h-0 overflow-y-auto w-full px-1 mt-3 space-y-1">
          {navigation.map(item => {
            const Icon = item.icon
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))
            return <Link key={item.href} href={linkHref(item.href)} title={item.name} aria-label={item.name} aria-current={active ? 'page' : undefined}
              className={`relative flex items-center justify-center h-11 rounded-lg border-l-2 focus-visible:ring-2 focus-visible:ring-primary-500 ${active ? 'bg-primary-100 text-primary-600 border-primary-600' : 'text-gray-600 hover:bg-gray-100 border-transparent'}`}>
              <Icon className="h-5 w-5" />
              {item.href === '/dashboard/tickets' && !!openTicketsCount && <span aria-label={`${openTicketsCount} tickets abiertos`} className="absolute top-1 right-0 min-w-4 px-0.5 rounded-full bg-red-600 text-white text-[9px] text-center">{openTicketsCount > 99 ? '99+' : openTicketsCount}</span>}
            </Link>
          })}
        </nav>
        <div className="border-t mt-2 pt-2 flex flex-col items-center gap-1">
          <ThemeToggle compact />
          <NotificationToggle compact />
          <Link href="/dashboard/profile" title="Mi perfil" aria-label="Mi perfil" aria-current={pathname === '/dashboard/profile' ? 'page' : undefined} className={`p-3 rounded-lg focus-visible:ring-2 focus-visible:ring-primary-500 ${pathname === '/dashboard/profile' ? 'bg-primary-100 text-primary-600' : 'text-gray-600 hover:bg-gray-100'}`}><UserCircle className="h-5 w-5" /></Link>
          <button type="button" onClick={() => signOut()} title="Cerrar sesión" aria-label="Cerrar sesión" className="p-3 rounded-lg text-gray-600 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-primary-500"><LogOut className="h-5 w-5" /></button>
        </div>
      </div>}
      {/* Mobile Top Header */}
      <div className="md:hidden flex flex-shrink-0 items-center justify-between bg-white border-b p-4 w-full">
        <div className="flex items-center space-x-2">
          {orgLogo ? (
            <Image width={112} height={112} sizes="(max-width: 768px) 40px, 56px" unoptimized={!orgLogo.startsWith("/")} src={orgLogo} alt={orgName} className="h-8 object-contain" />
          ) : (
            <Headphones className="h-6 w-6 text-primary-600" />
          )}
          <span className="text-xl font-bold text-gray-900">{orgName}</span>
        </div>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
        >
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-gray-900/50 z-40 md:hidden" 
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Content */}
      <div id="dashboard-sidebar" className={`
        fixed inset-y-0 left-0 z-50 w-64 shrink-0 brand-sidebar text-white border-r border-primary-800 flex flex-col transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0
        ${desktopCollapsed ? 'md:hidden' : ''}
      `}>
        <div className="px-4 py-3 border-b border-white/10 hidden md:block">
          <button type="button" onClick={() => setDesktopCollapsed(true)} aria-label="Ocultar barra lateral" title="Ocultar barra lateral" aria-expanded={true} aria-controls="dashboard-sidebar" className="flex items-center gap-2 text-xs text-primary-100 hover:bg-white/10 rounded-lg px-2 py-1.5 mb-2 -ml-2 focus-visible:ring-2 focus-visible:ring-white">
            <Menu className="h-4 w-4" /> Ocultar menú
          </button>
          <div className="flex items-center gap-2 min-w-0">
            {orgLogo ? (
              <Image width={80} height={80} sizes="40px" src={orgLogo} alt={orgName} className="h-10 w-10 rounded-lg object-contain shrink-0" />
            ) : (
              <Headphones className="h-7 w-7 shrink-0 text-brand-amber" />
            )}
            <span className="text-base font-bold text-white truncate">{orgName}</span>
          </div>
        </div>

        {/* Mobile header inside sidebar */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between md:hidden">
          <div className="flex items-center space-x-2">
            {orgLogo ? (
              <Image width={112} height={112} sizes="(max-width: 768px) 40px, 56px" src={orgLogo} alt={orgName} className="h-10 w-10 rounded-lg object-contain" />
            ) : (
              <Headphones className="h-6 w-6 text-brand-amber" />
            )}
            <span className="text-lg font-bold text-white">{orgName}</span>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-2 text-white hover:bg-white/10 rounded-lg transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="brand-stripe mx-4 mt-3 rounded-full shrink-0" aria-hidden="true" />
        <nav className="flex-1 min-h-0 px-3 py-3 space-y-0.5 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"))
            const isTickets = item.href === '/dashboard/tickets'
            
            return (
              <Link
                key={item.name}
                href={linkHref(item.href)}
                onClick={() => setIsOpen(false)}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border-l-4 text-sm transition ${
                  isActive
                    ? 'bg-white/10 text-white border-brand-amber'
                    : 'text-primary-100 hover:bg-white/10 border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span className="font-medium truncate">{item.name}</span>
                </div>
                {isTickets && openTicketsCount !== undefined && openTicketsCount > 0 && (
                  <span className="inline-flex shrink-0 items-center justify-center min-w-5 px-1.5 py-0.5 text-[11px] font-bold leading-none bg-brand-coral text-primary-950 rounded-full">
                    {openTicketsCount}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="shrink-0 px-3 py-3 border-t border-white/10 space-y-0.5">
          <ThemeToggle />
          <NotificationToggle />
          <div className="my-2 border-t border-white/10" aria-hidden="true" />
          <Link
            href="/dashboard/profile"
            onClick={() => setIsOpen(false)}
            title="Mi perfil"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg border-l-4 transition w-full ${
              pathname === '/dashboard/profile'
                ? 'bg-white/10 text-white border-brand-amber'
                : 'text-primary-100 hover:bg-white/10 border-transparent'
            }`}
          >
            <UserCircle className="h-8 w-8 shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-white truncate">{user?.name || 'Mi perfil'}</span>
              <span className="block text-xs text-primary-200 truncate">{user?.email}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => signOut()}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg border-l-4 border-transparent text-sm font-medium text-left text-primary-100 hover:bg-white/10 transition focus-visible:ring-2 focus-visible:ring-white"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </div>
    </>
  )
}
