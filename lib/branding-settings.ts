import { prisma } from '@/lib/prisma'
// Uncached read for route handlers and scripts running outside a React render.
export async function loadBranding() {
  const settings = await prisma.setting.findMany({where:{key:{in:['org_name','org_logo']}},select:{key:true,value:true}})
  return {orgName:settings.find(s=>s.key==='org_name')?.value||'SIP SOPORTE',orgLogo:settings.find(s=>s.key==='org_logo')?.value||''}
}
