import AccountingPage from '@/components/accounting/AccountingPage'
import Catalog from '@/components/accounting/Catalog'

export const metadata = { title: 'Catálogo | SIP SOPORTE', description: 'Productos e impuestos para cotizaciones' }

export default function Page() {
  return <AccountingPage><Catalog /></AccountingPage>
}
