process.loadEnvFile('.env');
const {PrismaClient}=require('@prisma/client');
const bcrypt=require('bcryptjs');
const crypto=require('crypto');
const db=new PrismaClient();
(async()=>{
 let email='admin@desk20.local';
 if(await db.user.findUnique({where:{email}}))email=`admin.${Date.now()}@desk20.local`;
 const password='D20!'+crypto.randomBytes(12).toString('base64url');
 await db.user.create({data:{email,name:'Administrador SIP SOPORTE',role:'ADMIN',password:await bcrypt.hash(password,12)}});
 const saved=await db.user.findUnique({where:{email}});
 if(!saved||!await bcrypt.compare(password,saved.password))throw Error('No se pudo verificar la contraseña');
 console.log(JSON.stringify({email,password,role:saved.role}));
})().catch(e=>{console.error('No se pudo crear el administrador:',e.message);process.exitCode=1}).finally(()=>db.$disconnect());
