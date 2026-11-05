import AccountingPage from '@/components/accounting/AccountingPage'
import QuoteEditor from '@/components/accounting/QuoteEditor'

export const metadata = { title: 'Editar cotización | SIP SOPORTE' }

export default function Page({ params }: { params: { id: string } }) {
  return <AccountingPage><QuoteEditor quoteId={params.id} /></AccountingPage>
}
