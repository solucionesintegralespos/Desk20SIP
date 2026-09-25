'use client'

import Link from 'next/link'
import { MessageSquare, Clock, Circle, XCircle } from 'lucide-react'

interface StatsCardsProps {
  date: string
  stats: {
    open: number
    pending: number
    closed: number
    total: number
  }
}

export default function StatsCards({ stats, date }: StatsCardsProps) {
  const cards = [
    {
      title: 'Abiertos',
      value: stats.open,
      icon: Circle,
      color: 'text-brand-coral-dark',
      bgColor: 'bg-brand-coral-light',
      accent: 'border-t-brand-coral',
      link: '/dashboard/tickets?status=OPEN',
    },
    {
      title: 'Pendientes',
      value: stats.pending,
      icon: Clock,
      color: 'text-brand-amber-dark',
      bgColor: 'bg-brand-amber-light',
      accent: 'border-t-brand-amber',
      link: '/dashboard/tickets?status=PENDING',
    },
    {
      title: 'Cerrados',
      value: stats.closed,
      icon: XCircle,
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
      accent: 'border-t-primary-300',
      link: '/dashboard/tickets?status=CLOSED',
    },
    {
      title: 'Total',
      value: stats.total,
      icon: MessageSquare,
      color: 'text-primary-600',
      bgColor: 'bg-primary-50',
      accent: 'border-t-primary-600',
      link: '/dashboard/tickets',
    },
  ]

  return (
    <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 gap-5">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <Link 
            key={card.title} 
            href={`${card.link}${card.link.includes('?') ? '&' : '?'}mine=1&date=${date}`}
            className={`flex min-w-0 flex-col justify-center bg-white rounded-xl shadow-sm border border-primary-100 border-t-4 ${card.accent} p-5 hover:shadow-lg transition-shadow cursor-pointer`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{card.title}</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{card.value}</p>
              </div>
              <div className={`${card.bgColor} p-3 rounded-lg`}>
                <Icon className={`h-6 w-6 ${card.color}`} />
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
