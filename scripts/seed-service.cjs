process.loadEnvFile('.env');
const {PrismaClient}=require('@prisma/client');
const templates=require('../lib/support/templates.json');
const db=new PrismaClient();
(async()=>{for(const template of templates)await db.serviceRecord.upsert({where:{id:template.id},update:{},create:{id:template.id,kind:'templates',payload:template}});console.log('Plantillas de checklist importadas.');})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
