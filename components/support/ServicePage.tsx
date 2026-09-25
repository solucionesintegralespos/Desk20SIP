import { redirect } from 'next/navigation';
import { getDashboardUser } from '@/lib/dashboard-data';
import { SupportProvider } from '@/lib/support/context';
export default async function ServicePage({ children }: {
    children: React.ReactNode;
}) {
    const user = await getDashboardUser();
    if (!user || user.role === 'CUSTOMER')
        redirect('/dashboard');
    return <div className="h-full overflow-y-auto p-4 md:p-8 service-module"><SupportProvider>{children}</SupportProvider></div>;
}
