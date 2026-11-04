import AccountingPage from '@/components/accounting/AccountingPage'
import QuoteEditor from '@/components/accounting/QuoteEditor'

export const metadata = { title: 'Nueva cotización | SIP SOPORTE' }

export default function Page() {
  return <AccountingPage><QuoteEditor /></AccountingPage>
}
