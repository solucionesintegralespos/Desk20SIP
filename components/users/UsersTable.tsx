'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { UserRole } from '@prisma/client'
import { useRouter } from 'next/navigation'
import { Mail, Phone, MapPin, Ticket, UserCog, Power } from 'lucide-react'
import { toast } from 'react-hot-toast'
import UserFilters from './UserFilters'
import { DirectoryView } from '../ViewToggle'
import EditUserModal from './EditUserModal'

interface User {
  id: string
  name: string | null
  email: string | null
  avatar: string | null
  dailyEntryGoal: number | null
  dailyClosureGoal: number | null
  role: UserRole
  phone: string | null
  location: string | null
  active: boolean
  createdAt: Date
  _count: {
    createdTickets: number
    assignedTickets: number
  }
}

interface UsersTableProps {
  users: User[]
  currentRole?: string
  currentUserId?: string
}

const roleLabels = {
  ADMIN: 'Administrador',
  AGENT: 'Agente',
  CUSTOMER: 'Cliente',
}

const roleColors = {
  ADMIN: 'bg-purple-100 text-purple-800',
  AGENT: 'bg-blue-100 text-blue-800',
  CUSTOMER: 'bg-green-100 text-green-800',
}

export default function UsersTable({ users, currentRole, currentUserId }: UsersTableProps) {
  const router = useRouter()
  const [view, setView] = useState<DirectoryView>('cards')
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  // Deactivating keeps the user and their history; they cannot sign in and leave scheduling and assignment lists.
  async function toggleActive(user: User) {
    const name = user.name || user.email || 'este usuario'
    if (user.active && !confirm(`¿Desactivar a ${name}? No podrá iniciar sesión y dejará de aparecer en la programación y en las asignaciones. Sus datos se conservan y puedes reactivarlo cuando quieras.`)) return
    setToggling(user.id)
    try {
      const response = await fetch(`/api/users/${user.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !user.active }) })
      const result = await response.json()
      if (!response.ok) throw Error(result.error || 'No se pudo cambiar el estado')
      toast.success(user.active ? `${name} quedó inactivo` : `${name} está activo de nuevo`)
      router.refresh()
    } catch (error) { toast.error((error as Error).message) }
    finally { setToggling(null) }
  }
  const toggleButton = (user: User) => user.id === currentUserId ? null : <button type="button" disabled={toggling === user.id} onClick={() => void toggleActive(user)}
    aria-label={`${user.active ? 'Desactivar' : 'Activar'} a ${user.name || user.email}`} title={user.active ? 'Desactivar usuario' : 'Activar usuario'}
    className={`inline-flex items-center gap-1 rounded-lg p-2 text-xs font-medium disabled:opacity-50 ${user.active ? 'text-gray-500 hover:bg-red-50 hover:text-red-700' : 'text-green-700 hover:bg-green-50'}`}>
    <Power className="h-4 w-4" /><span>{user.active ? 'Desactivar' : 'Activar'}</span>
  </button>
  const inactiveBadge = <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-700">Inactivo</span>

  return (
    <>
      <UserFilters currentRole={currentRole} view={view} onViewChange={setView} />
      {!users.length && <p className="p-6 bg-white rounded-lg">No se encontraron usuarios</p>}
      {view === 'list' ? <div className="overflow-x-auto bg-white rounded-lg"><table className="w-full text-sm text-left">
        <thead><tr className="border-b"><th className="p-4">Usuario</th><th>Correo</th><th>Rol</th><th>Teléfono</th><th>Tickets asignados</th><th>Acciones</th></tr></thead>
        <tbody>{users.map(user => <tr key={user.id} className="border-b"><td className="p-4">{user.name || 'Sin nombre'} {!user.active && inactiveBadge}</td><td>{user.email}</td><td>{roleLabels[user.role]}</td><td>{user.phone || '—'}</td><td>{user._count.assignedTickets}</td><td className="whitespace-nowrap"><button aria-label="Editar usuario" onClick={() => setEditingUser(user)} className="p-2"><UserCog size={18} /></button>{toggleButton(user)}</td></tr>)}</tbody>
      </table></div> : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {users.map((user) => (
          <div key={user.id} className={`bg-white rounded-lg shadow hover:shadow-md transition ${user.active ? '' : 'opacity-70'}`}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="h-12 w-12 rounded-full bg-primary-100 flex items-center justify-center">
                    {user.avatar ? <img src={user.avatar} alt={user.name || 'Usuario'} className="h-12 w-12 rounded-full object-cover" /> : <span className="text-primary-600 font-medium text-lg">
                      {user.name?.[0] || (user.email?.[0]?.toUpperCase() || "?")}
                    </span>}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {user.name || 'Sin nombre'}
                    </h3>
                    <div className="flex flex-wrap gap-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${roleColors[user.role]}`}>
                        {roleLabels[user.role]}
                      </span>
                      {!user.active && inactiveBadge}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center">
                  {toggleButton(user)}
                  <button
                    onClick={() => setEditingUser(user)}
                    aria-label="Editar usuario"
                    className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                  >
                    <UserCog className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center text-sm text-gray-600">
                  <Mail className="h-4 w-4 mr-2" />
                  <span className="truncate">{user.email}</span>
                </div>
                
                {user.phone && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Phone className="h-4 w-4 mr-2" />
                    <span>{user.phone}</span>
                  </div>
                )}
                
                {user.location && (
                  <div className="flex items-center text-sm text-gray-600">
                    <MapPin className="h-4 w-4 mr-2" />
                    <span>{user.location}</span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center text-xs text-gray-500">
                    <Ticket className="h-3 w-3 mr-1" />
                    Tickets creados
                  </div>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {user._count.createdTickets}
                  </p>
                </div>
                
                {user.role === 'AGENT' && (
                  <div>
                    <div className="flex items-center text-xs text-gray-500">
                      <Ticket className="h-3 w-3 mr-1" />
                      Tickets asignados
                    </div>
                    <p className="text-lg font-semibold text-gray-900 mt-1">
                      {user._count.assignedTickets}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-4 text-xs text-gray-500">
                <p className="mb-2">Metas mensuales · Digitación: {user.dailyEntryGoal ?? 'Sin meta'} · Cierres: {user.dailyClosureGoal ?? 'Sin meta'}</p>
                Registrado: {format(new Date(user.createdAt), 'PP', { locale: es })}
              </div>
            </div>
          </div>
        ))}
      </div>}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
        />
      )}
    </>
  )
}
