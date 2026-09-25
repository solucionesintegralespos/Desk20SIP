import { redirect } from 'next/navigation';
import { getDashboardUser } from '@/lib/dashboard-data';
import EngineerSchedule from '@/components/schedule/EngineerSchedule';

export const metadata = { title: 'Programación de ingenieros | SIP SOPORTE' };
export default async function Page() {
  const user = await getDashboardUser();
  if (!user || user.role === 'CUSTOMER') redirect('/dashboard');
  return <EngineerSchedule />;
}
