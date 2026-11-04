import AccountingPage from '@/components/accounting/AccountingPage'
import QuoteDetail from '@/components/accounting/QuoteDetail'

export const metadata = { title: 'Cotización | SIP SOPORTE' }

export default function Page({ params }: { params: { id: string } }) {
  return <AccountingPage><QuoteDetail id={params.id} /></AccountingPage>
}
