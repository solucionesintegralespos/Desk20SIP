// Integration tests execute Next route handlers against PostgreSQL with test actors.
process.loadEnvFile('.env');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),Module=require('module'),ts=require('typescript');
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
let actor;const ids=[];const userIds=[];const ticketIds=[];const categoryIds=[];
let initialOrderCounter;
class ServiceError extends Error{constructor(message,status=400){super(message);this.status=status}}
const original=Module._load;
Module._load=function(name,parent,...rest){
 if(name==='@/lib/prisma')return {prisma:db};
 if(name==='@/lib/support/server')return {serviceUser:async()=>{if(!actor||actor.role==='CUSTOMER')throw new ServiceError('Forbidden',403);return actor},ServiceError,serviceError:e=>Response.json({error:e.message},{status:e.status||500})};
 if(name.startsWith('@/'))name=path.resolve(name.slice(2));
 return original.call(this,name,parent,...rest);
};
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const {POST}=require('../app/api/service/[entity]/route.ts');
const {GET}=require('../app/api/service/route.ts');
const uid=()=>{const id=crypto.randomUUID();ids.push(id);return id};
async function save(kind,data,status=200){const response=await POST(new Request(`http://localhost/api/service/${kind}`,{method:'POST',body:JSON.stringify(data)}),{params:{entity:kind}});const body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return body}
async function load(id){const record=await db.serviceRecord.findUniqueOrThrow({where:{id}});return {...record.payload,_revision:record.revision}}
(async()=>{
 initialOrderCounter=(await db.serviceCounter.findUnique({where:{key:'orders'}}))?.value || 0;
 for(const role of ['ADMIN','AGENT','CUSTOMER']){const id=crypto.randomUUID();userIds.push(id);await db.user.create({data:{id,name:`Test ${role}`,role}})}
 const [admin,agent,client]=await Promise.all(userIds.map(id=>db.user.findUniqueOrThrow({where:{id}})));actor=admin;
 const template={id:uid(),name:'Test process',active:true,version:0,items:[{id:crypto.randomUUID(),category:'Backup',label:'Backup',required:true,evidenceRequired:true,isBackup:true}]};
 await save('templates',template);let storedTemplate=await load(template.id);assert.equal(storedTemplate.version,1);
 const run={id:uid(),number:'forged',templateId:template.id,templateVersion:999,clientId:client.id,techId:agent.id,serviceName:'Test process',status:'in_progress',responses:template.items.map(item=>({item:{...item,required:false,evidenceRequired:false},checked:false,notes:'',evidence:[]}))};
 await save('checklists',run,403);actor=agent;
 await save('checklists',run);let checklist=await load(run.id);assert.equal(checklist.templateVersion,1);assert.equal(checklist.responses[0].item.required,true);assert.notEqual(checklist.number,'forged');
 await save('checklists',{...checklist,status:'completed'},400);
 actor=admin;
 await save('templates',{...storedTemplate,name:'Changed',items:[{...template.items[0],label:'New step'}]});assert.equal((await load(template.id)).version,2);assert.equal((await load(run.id)).responses[0].item.label,'Backup');
 const evidence={id:crypto.randomUUID(),name:'backup.pdf',type:'application/pdf',dataUrl:'data:application/pdf;base64,'+Buffer.from('%PDF-1.4\n'+ 'x'.repeat(1024*1024) +'\n%%EOF').toString('base64')};
 checklist.responses[0]={...checklist.responses[0],checked:true,evidence:[evidence]};
 actor=agent;
 await save('checklists',checklist,400);
 // Existing attachments remain readable; new uploads are rejected.
 await db.serviceRecord.update({where:{id:run.id},data:{payload:checklist}});
 await save('checklists',{...checklist,status:'completed'});await save('checklists',await load(run.id),409);
 const noFiles={...run,id:uid(),responses:run.responses.map(r=>({...r,checked:true})),status:'completed'};
 await save('checklists',noFiles);
 actor=agent;await save('templates',{...storedTemplate,name:'Forbidden'},403);
 const order={id:uid(),number:'forged',clientId:client.id,techId:agent.id,serviceName:'Repair',status:'in_progress',diagnosis:'Test',workDone:'',observations:'',signerName:'',consent:false,checklistId:run.id};
 await save('orders',order);let savedOrder=await load(order.id);
 actor=admin;await save('orders',savedOrder,403);await save('orders',{...order,id:uid()},403);actor=agent;
 const category=await db.category.create({data:{name:'Service closure test'}});categoryIds.push(category.id);
 const linkedTicket=await db.ticket.create({data:{subject:'Order closure test',type:'INCIDENT',categoryId:category.id,assigneeId:agent.id,customerId:client.id,status:'OPEN',tags:[],attachments:[],assignments:{createMany:{data:[{userId:agent.id}],skipDuplicates:true}}}});ticketIds.push(linkedTicket.id);
 savedOrder.ticketId=linkedTicket.id;
 await save('orders',{...savedOrder,status:'completed'},400);
 assert.equal((await db.ticket.findUniqueOrThrow({where:{id:linkedTicket.id}})).status,'OPEN');
 await save('orders',{...savedOrder,techId:admin.id},403);
 await save('orders',{...savedOrder,observations:'Updated'});await save('orders',savedOrder,409);savedOrder=await load(order.id);
 const signature='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
 await save('orders',{...savedOrder,status:'completed',workDone:'Repaired',signerName:'Client',consent:true,signature});await save('orders',await load(order.id),409);
 assert.equal((await db.ticket.findUniqueOrThrow({where:{id:linkedTicket.id}})).status,'CLOSED');
 assert.equal(await db.message.count({where:{ticketId:linkedTicket.id,type:'SYSTEM'}}),1);
 const state=await (await GET(new Request('http://localhost/api/service'))).json();assert(state.state.orders.some(o=>o.id===order.id));assert(!state.state.users.some(u=>'password' in u));
 assert(!state.state.orders.find(o=>o.id===order.id).signature);
 assert.equal(state.state.checklists.find(c=>c.id===run.id).responses[0].evidence.length,0);
 const {GET:detail}=require('../app/api/service/[entity]/[id]/route.ts');
 const opened=await (await detail(new Request('http://localhost'),{params:{entity:'checklists',id:run.id}})).json();assert.equal(opened.responses[0].evidence[0].dataUrl,evidence.dataUrl);
 const listSize=Buffer.byteLength(JSON.stringify(state.state.checklists.find(c=>c.id===run.id)));const fullSize=Buffer.byteLength(JSON.stringify(opened));assert(listSize<fullSize/100);
 const templatesOnly=await (await GET(new Request('http://localhost/api/service?scope=templates'))).json();assert.equal(templatesOnly.state.checklists.length,0);assert.equal(templatesOnly.state.orders.length,0);assert.equal(templatesOnly.state.clients.length,0);
 actor=admin;const privateOrder={...order,id:uid(),techId:admin.id};await save('orders',privateOrder);actor=agent;assert.equal((await detail(new Request('http://localhost'),{params:{entity:'orders',id:privateOrder.id}})).status,404);
 const agentList=await (await GET(new Request('http://localhost/api/service?scope=orders'))).json();assert(!agentList.state.orders.some(o=>o.id===privateOrder.id));
 // An old order created by an administrator for an agent belongs to its creator.
 const legacy=await load(privateOrder.id);delete legacy.createdById;delete legacy._revision;legacy.techId=agent.id;
 await db.serviceRecord.update({where:{id:legacy.id},data:{techId:agent.id,payload:legacy}});
 assert.equal((await detail(new Request('http://localhost'),{params:{entity:'orders',id:legacy.id}})).status,404);
 const legacyList=await (await GET(new Request('http://localhost/api/service?scope=orders'))).json();assert(!legacyList.state.orders.some(o=>o.id===legacy.id));
 await save('orders',await load(legacy.id),403);
 actor=admin;
 const adminList=await (await GET(new Request('http://localhost/api/service?scope=orders'))).json();assert(adminList.state.orders.some(o=>o.id===order.id));assert.equal(adminList.state.orders.find(o=>o.id===legacy.id).createdById,admin.id);
 await save('orders',{...await load(legacy.id),observations:'Creator can edit legacy order'});
 const adminRun={...run,id:uid(),techId:admin.id};await save('checklists',adminRun);
 await save('checklists',{...await load(adminRun.id),techId:agent.id},403);
 console.log(`Checklist list payload: ${listSize} bytes versus ${fullSize} bytes with evidence (${(100*(1-listSize/fullSize)).toFixed(2)}% smaller).`);
 actor=admin;
 order.techId=admin.id;
 const counterBefore=(await db.serviceCounter.findUniqueOrThrow({where:{key:'orders'}})).value;
 await save('orders',{...order,id:uid(),startTime:'invalid-date'},400);
 assert.equal((await db.serviceCounter.findUniqueOrThrow({where:{key:'orders'}})).value,counterBefore);
 const serviceAt='2026-09-10T15:30:00.000Z';
 const parallelOrders=Array.from({length:4},()=>({...order,id:uid(),startTime:serviceAt}));
 await Promise.all(parallelOrders.map(o=>save('orders',o)));
 const storedOrders=await db.serviceRecord.findMany({where:{id:{in:parallelOrders.map(o=>o.id)}},orderBy:{orderNumber:'asc'}});
 assert.deepEqual(storedOrders.map(o=>o.orderNumber),[1,2,3,4].map(n=>counterBefore+n));
 for(const stored of storedOrders){assert.match(stored.payload.number,/^OS-\d{6,}$/);assert.equal(stored.payload.startTime,serviceAt)}
 let editable=await load(parallelOrders[0].id);const stableNumber=editable.number;
 await save('orders',{...editable,number:'forged-again',startTime:'2026-09-11T14:00:00.000Z'});
 editable=await load(editable.id);assert.equal(editable.number,stableNumber);assert.equal(editable.startTime,'2026-09-11T14:00:00.000Z');
 const {serviceDate}=require('../lib/support/order-display.ts');assert.match(serviceDate(serviceAt),/10:30/);assert.equal(serviceDate('invalid'),'Sin fecha registrada');
 console.log('PASS: concurrent consecutive order numbers, stable numbering on edits, rollback on invalid saves, editable service date and Bogotá display time.');
 actor=client;await save('orders',order,403);
 assert((await db.serviceAuditEvent.count({where:{entityId:{in:ids}}}))>=6);
 console.log('PASS: session ownership, administrator read-only orders, no checklist uploads, completion without evidence, atomic ticket closure, signatures, immutable completion, role permissions, stale writes, audit and PostgreSQL persistence.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await db.serviceAuditEvent.deleteMany({where:{entityId:{in:ids}}});await db.serviceRecord.deleteMany({where:{id:{in:[...ids,...ids.map(id=>`order-email:${id}`)]}}});await db.ticket.deleteMany({where:{id:{in:ticketIds}}});await db.user.deleteMany({where:{id:{in:userIds}}});await db.category.deleteMany({where:{id:{in:categoryIds}}});
 if(initialOrderCounter!==undefined)await db.$transaction(async tx=>{const rows=await tx.$queryRaw`SELECT value FROM "ServiceCounter" WHERE key='orders' FOR UPDATE`;if(rows.length && !await tx.serviceRecord.count({where:{orderNumber:{gt:initialOrderCounter}}}))await tx.serviceCounter.update({where:{key:'orders'},data:{value:initialOrderCounter}})});
 await db.$disconnect()});
