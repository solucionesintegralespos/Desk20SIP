import AccountingPage from '@/components/accounting/AccountingPage'
import QuoteEditor from '@/components/accounting/QuoteEditor'

export const metadata = { title: 'Nueva cotización | SIP SOPORTE' }

// `?from=<id>` starts the draft with the customer, products and texts of an existing quote.
export default function Page({ searchParams }: { searchParams: { from?: string } }) {
  const from = typeof searchParams.from === 'string' && searchParams.from.trim() ? searchParams.from.trim() : undefined
  return <AccountingPage><QuoteEditor duplicateFrom={from} /></AccountingPage>
}
