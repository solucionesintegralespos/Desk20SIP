import AccountingPage from '@/components/accounting/AccountingPage'
import QuotesList from '@/components/accounting/QuotesList'

export const metadata = { title: 'Cotizaciones | SIP SOPORTE' }

export default function Page() {
  return <AccountingPage><QuotesList /></AccountingPage>
}
