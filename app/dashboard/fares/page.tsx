import AccountingPage from '@/components/accounting/AccountingPage'
import FaresReport from '@/components/fares/FaresReport'

export const metadata = { title: 'Pasajes | SIP SOPORTE' }

export default function Page() {
  return <AccountingPage><FaresReport /></AccountingPage>
}
