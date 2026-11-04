import AccountingPage from '@/components/accounting/AccountingPage'
import BillingAccounts from '@/components/accounting/BillingAccounts'

export const metadata = { title: 'Cuentas de cobro | SIP SOPORTE' }
export default function Page() { return <AccountingPage><BillingAccounts /></AccountingPage> }
