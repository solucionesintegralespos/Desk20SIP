import { cache } from 'react'
import { prisma } from '@/lib/prisma'
export const getBranding = cache(async () => {
  const settings = await prisma.setting.findMany({where:{key:{in:['org_name','org_logo']}},select:{key:true,value:true}})
  return {orgName:settings.find(s=>s.key==='org_name')?.value||'SIP SOPORTE',orgLogo:settings.find(s=>s.key==='org_logo')?.value||''}
})
