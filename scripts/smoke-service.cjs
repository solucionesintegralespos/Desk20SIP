// Usage: node scripts/smoke-service.cjs EMAIL PASSWORD [BASE_URL]
const assert=require('node:assert/strict');
const jar=new Map();
async function request(base,url,options={}){const r=await fetch(base+url,{...options,headers:{...options.headers,Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')},redirect:'manual',signal:AbortSignal.timeout(60000)});for(const c of r.headers.getSetCookie()){if(new URL(base).protocol==='http:'&&/;\s*Secure(?:;|$)/i.test(c))throw Error('La cookie Secure impide el login por HTTP: '+c.split('=')[0]);const first=c.split(';')[0];const eq=first.indexOf('=');jar.set(first.slice(0,eq),first.slice(eq+1))}return r}
(async()=>{
 const [email,password,base='http://localhost:5185']=process.argv.slice(2);
 if(!email||!password)throw Error('Indica correo y contraseña de un administrador de prueba');
 const csrf=await (await request(base,'/api/auth/csrf')).json();
 await request(base,'/api/auth/callback/credentials',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email,password,csrfToken:csrf.csrfToken,json:'true',callbackUrl:base+'/dashboard'})});
 const session=await (await request(base,'/api/auth/session')).json();assert.equal(session.user?.email,email);assert.equal(session.user?.role,'ADMIN');
 for(const route of ['/dashboard/orders','/dashboard/checklists','/dashboard/settings']){const r=await request(base,route);assert.equal(r.status,200,route);assert((await r.text()).includes('SIP SOPORTE'));}
 const r=await request(base,'/api/service');assert.equal(r.status,200);const data=await r.json();assert(data.state.templates.some(t=>t.name==='Formateo y recuperación'));assert(data.state.templates.some(t=>t.name==='Implementación nueva'));
 console.log('PASS: real administrator login, orders/checklists/settings pages and imported templates API.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
