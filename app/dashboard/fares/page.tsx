import StaffPage from '@/components/inventory/StaffPage'
import FaresReport from '@/components/fares/FaresReport'

export const metadata = { title: 'Pasajes | SIP SOPORTE' }

// Every staff member can open the report; the API limits agents to their own fares.
export default function Page() {
  return <StaffPage><FaresReport /></StaffPage>
}
