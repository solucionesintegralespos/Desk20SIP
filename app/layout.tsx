import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import SessionProvider from '@/components/SessionProvider'
import { OrgProvider } from '@/components/OrgProvider'
import { getBranding } from '@/lib/branding'
import { Toaster } from 'react-hot-toast'

const inter = Inter({ subsets: ['latin'] })

export async function generateMetadata(): Promise<Metadata> {
  const {orgName} = await getBranding()
  
  return {
    title: `${orgName} - Sistema de Soporte Técnico`,
    description: 'Plataforma de gestión de tickets y soporte al cliente',
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const {orgName,orgLogo} = await getBranding()

  return (
    <html lang="es">
      <body className={inter.className}>
        <SessionProvider>
          <OrgProvider orgName={orgName} orgLogo={orgLogo}>
            {children}
            <Toaster position="top-right" />
          </OrgProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
