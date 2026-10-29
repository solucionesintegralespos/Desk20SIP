// Integration checks against PostgreSQL; no production users or tickets are changed.
process.loadEnvFile('.env');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
let actor;
const users = [], tickets = [], categories = [];
const original = Module._load;
Module._load = function(name, parent, ...rest) {
  if (name === '@/lib/prisma') return { prisma: db };
  if (name === 'next-auth') return { getServerSession: async () => actor ? { user: actor } : null };
  if (name === '@/lib/auth') return { authOptions: {} };
  if (name === '@/lib/email') return { sendEmail: async () => {}, getTicketCreatedEmailTemplate: () => ({ subject: '', html: '' }) };
  if (name.startsWith('@/')) name = path.resolve(name.slice(2));
  return original.call(this, name, parent, ...rest);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { POST, GET } = require('../app/api/tickets/route.ts');
const { PATCH } = require('../app/api/tickets/[id]/route.ts');
const { GET: listUsers } = require('../app/api/users/route.ts');
const { GET: options } = require('../app/api/tickets/options/route.ts');
const { PATCH: editCustomer } = require('../app/api/customers/[id]/route.ts');
const { POST: createCustomerApi } = require('../app/api/customers/route.ts');
const { PATCH: editUser } = require('../app/api/users/[id]/route.ts');
const { personalDashboardWhere } = require('../lib/personal-dashboard.ts');
const { GET: report } = require('../app/api/reports/route.ts');
const categoryApi = require('../app/api/categories/route.ts');
const categoryDetailApi = require('../app/api/categories/[id]/route.ts');
const settingsApi = require('../app/api/settings/route.ts');
const usersApi = require('../app/api/users/route.ts');
const legacyUsersApi = require('../app/api/users/[id]/route.ts');
async function create(data, expected = 201) {
  const response = await POST(new Request('http://localhost/api/tickets', { method: 'POST', body: JSON.stringify(data) }));
  const body = await response.json();
  if (response.status === 201) tickets.push(body.id);
  assert.equal(response.status, expected, JSON.stringify(body));
  return body;
}
async function patch(id, data, expected = 200) {
  const response = await PATCH(new Request('http://localhost/api/tickets/' + id, { method: 'PATCH', body: JSON.stringify(data) }), { params: { id } });
  const body = await response.json(); assert.equal(response.status, expected, JSON.stringify(body)); return body;
}
(async () => {
  for (const role of ['ADMIN', 'AGENT', 'AGENT', 'CUSTOMER']) {
    const id = crypto.randomUUID(); users.push(id);
    await db.user.create({ data: { id, name: 'Ticket test ' + role, email: id + '@ticket-test.invalid', role, publicToken: crypto.randomUUID(), emailNotifications: false } });
  }
  const [admin, tech1, tech2, customer] = await Promise.all(users.map(id => db.user.findUniqueOrThrow({ where: { id } })));
  actor = admin;
  const userRequest = data => new Request('http://localhost/api/users/' + tech1.id, { method: 'PATCH', body: JSON.stringify(data) });
  assert.equal((await editUser(userRequest({ dailyEntryGoal: 10, dailyClosureGoal: 5, avatar: '/uploads/test-avatar.png' }), { params: { id: tech1.id } })).status, 200);
  let profile = await db.user.findUniqueOrThrow({ where: { id: tech1.id } });
  assert.equal(profile.dailyEntryGoal, 10); assert.equal(profile.dailyClosureGoal, 5); assert.equal(profile.avatar, '/uploads/test-avatar.png');
  for (const value of [-1, 0, 1.5, '10']) assert.equal((await editUser(userRequest({ dailyEntryGoal: value }), { params: { id: tech1.id } })).status, 400);
  assert.equal((await editUser(userRequest({ avatar: 'javascript:alert(1)' }), { params: { id: tech1.id } })).status, 400);
  actor = tech1;
  assert.equal((await editUser(userRequest({ dailyEntryGoal: 1 }), { params: { id: tech1.id } })).status, 403);
  actor = admin;
  assert.equal((await editUser(userRequest({ dailyEntryGoal: null, dailyClosureGoal: null, avatar: '' }), { params: { id: tech1.id } })).status, 200);
  profile = await db.user.findUniqueOrThrow({ where: { id: tech1.id } });
  assert.equal(profile.dailyEntryGoal, null); assert.equal(profile.avatar, null);
  const category = await db.category.create({ data: { id: crypto.randomUUID(), name: 'Ticket integration test' } }); categories.push(category.id);
  const valid = { customerId: customer.id, subject: 'Integration ticket', priority: 'HIGH', type: 'INCIDENT', categoryId: category.id, assigneeIds: [tech1.id, tech2.id] };
  for (const field of ['priority', 'type', 'categoryId', 'assigneeIds']) { const data = { ...valid }; delete data[field]; await create(data, 400); }
  await create({ ...valid, assigneeIds: [] }, 400);
  await create({ ...valid, assigneeIds: [customer.id] }, 400);
  await create({ ...valid, categoryId: crypto.randomUUID() }, 400);
  await create({ ...valid, priority: 'INVALID' }, 400);
  await create({ ...valid, hours: -1 }, 400);
  const ticket = await create({ ...valid, assigneeIds: [tech1.id, tech2.id, tech1.id] });
  assert.equal(ticket.assignments.length, 2);
  assert.equal(ticket.enteredById, admin.id);
  assert.equal(await db.ticket.count({ where: { ...personalDashboardWhere(admin), id: ticket.id } }), 0);
  assert.equal(await db.ticket.count({ where: { ...personalDashboardWhere(tech2), id: ticket.id } }), 1);
  for (const tech of [tech1, tech2]) assert.equal(await db.ticket.count({ where: { id: ticket.id, assignments: { some: { userId: tech.id } } } }), 1);
  actor = tech2;
  for (const handler of [categoryApi.GET, categoryApi.POST, settingsApi.GET, settingsApi.POST, usersApi.GET, usersApi.POST, legacyUsersApi.POST, report]) {
    assert.equal((await handler(new Request('http://localhost/api/test', { method: 'POST', body: '{}' }))).status, 403);
  }
  for (const handler of [categoryDetailApi.GET, categoryDetailApi.PUT, categoryDetailApi.DELETE]) {
    assert.equal((await handler(new Request('http://localhost/api/categories/' + category.id, { method: 'POST', body: '{}' }), { params: { id: category.id } })).status, 403);
  }
  assert.ok((await (await options()).json()).categories.some(c => c.id === category.id));
  assert.equal((await options()).status, 200);
  await patch(ticket.id, { status: 'SOLVED' }, 400);
  await patch(ticket.id, { assignments: { deleteMany: {} } }, 400);
  // Non-admin (tech2 is AGENT) cannot change assigned users:
  await patch(ticket.id, { assigneeIds: [tech2.id] }, 403);
  await patch(ticket.id, { assigneeId: tech1.id }, 403);
  // Admin can change assigned users:
  actor = admin;
  await patch(ticket.id, { assigneeIds: [] }, 400);
  await patch(ticket.id, { assigneeId: null }, 400);
  await patch(ticket.id, { assigneeIds: [customer.id] }, 400);
  let updated = await patch(ticket.id, { assigneeIds: [tech2.id] }); assert.equal(updated.assignments.length, 1); assert.equal(updated.assigneeId, tech2.id);
  const assignLog = await db.message.findFirst({ where: { ticketId: ticket.id, type: 'SYSTEM', content: { startsWith: 'Usuarios asignados cambiados' } } });
  assert.ok(assignLog, 'Assignment change log should be created');
  assert.equal(assignLog.authorId, admin.id);
  assert.ok(assignLog.content.includes('Antes:') && assignLog.content.includes('Después:'));
  updated = await patch(ticket.id, { assigneeId: tech1.id }); assert.equal(updated.assignments.length, 2);
  actor = tech2;
  updated = await patch(ticket.id, { status: 'PENDING' }); assert.equal(updated.status, 'PENDING');
  assert.equal(await db.message.count({ where: { ticketId: ticket.id, type: 'SYSTEM' } }), 1);
  const closed = await patch(ticket.id, { status: 'CLOSED' }); assert.equal(closed.status, 'CLOSED');
  assert.equal(closed.closedById, tech2.id); assert.ok(closed.closedAt);
  actor = admin;
  const reportRequest = new Request('http://localhost/api/reports?category=' + category.id);
  const reportResponse = await report(reportRequest); assert.equal(reportResponse.status, 200);
  const reportData = await reportResponse.json();
  assert.equal(reportData.summary.entered, 1); assert.equal(reportData.summary.closed, 1);
  assert.equal(reportData.rows.find(r => r.id === admin.id).entered, 1);
  assert.equal(reportData.rows.find(r => r.id === tech2.id).closed, 1);
  assert.equal(reportData.activity.reduce((n,r) => n+r.entered,0), 1);
  assert.equal(reportData.byCategory[0].count, 1);
  assert.equal((await report(new Request('http://localhost/api/reports?month=2026-99'))).status, 400);
  const originalDate = new Date(ticket.createdAt);
  await db.ticket.update({ where: { id: ticket.id }, data: { createdAt: new Date('2001-01-01T12:00:00Z') } });
  const crossMonth = await (await report(reportRequest)).json();
  assert.equal(crossMonth.summary.entered, 0); assert.equal(crossMonth.summary.closed, 1);
  await db.ticket.update({ where: { id: ticket.id }, data: { createdAt: originalDate } });
  actor = tech2;
  console.log('PASS: admin-only reports/settings/users/categories, ticket category options, monthly authorship and cross-month closures.');
  const reopened = await patch(ticket.id, { status: 'OPEN' }); assert.equal(reopened.closedById, null); assert.equal(reopened.closedAt, null);
  console.log('PASS: user photo and monthly goals, validation, admin permissions, ticket authorship, closure attribution and personal dashboard isolation.');
  await assert.rejects(db.ticketAssignee.deleteMany({ where: { ticketId: ticket.id } }));
  assert.equal(await db.ticketAssignee.count({ where: { ticketId: ticket.id } }), 2);
  await assert.rejects(db.ticketAssignee.create({ data: { ticketId: ticket.id, userId: customer.id } }));
  await assert.rejects(db.user.update({ where: { id: tech1.id }, data: { role: 'CUSTOMER' } }));
  for (const missing of ['type', 'categoryId', 'assigneeId']) {
    const data = { id: crypto.randomUUID(), customerId: customer.id, subject: 'Invalid DB insertion', priority: 'NORMAL', type: 'INCIDENT', categoryId: category.id, assigneeId: tech1.id, tags: [], attachments: [] }; tickets.push(data.id); delete data[missing];
    await assert.rejects(db.ticket.create({ data }));
  }
  actor = customer;
  await patch(ticket.id, { assigneeIds: [admin.id] }, 403);
  const mine = await (await GET(new Request('http://localhost/api/tickets'))).json(); assert(mine.every(t => t.customerId === customer.id));
  actor = undefined;
  await create(valid, 401);
  const publicTicket = await create({ ...valid, customerId: admin.id, publicToken: customer.publicToken }); assert.equal(publicTicket.customerId, customer.id);
  await create({ ...valid, publicToken: 'invalid-token' }, 403);
  actor = admin;
  for (const query of ['', '?role=CUSTOMER', '?role=ADMIN,AGENT,CUSTOMER']) {
    const response = await listUsers(new Request('http://localhost/api/users' + query)); assert.equal(response.status, 200);
    const result = await response.json(); assert(result.every(u => ['ADMIN', 'AGENT'].includes(u.role))); assert(!result.some(u => 'password' in u));
  }
  async function customerPatch(data, expected = 200) {
    const response = await editCustomer(new Request('http://localhost/api/customers/' + customer.id, { method: 'PATCH', body: JSON.stringify(data) }), { params: { id: customer.id } });
    const body = await response.json(); assert.equal(response.status, expected, JSON.stringify(body)); return body;
  }
  const updatedEmail = crypto.randomUUID() + '@ticket-test.invalid';
  let edited = await customerPatch({ name: customer.name, email: updatedEmail, phone: '111' }); assert.equal(edited.email, updatedEmail);
  actor = tech1;
  edited = await customerPatch({ name: customer.name, phone: '222' }); assert.equal(edited.phone, '222'); assert.equal(edited.email, updatedEmail);
  await customerPatch({ email: admin.email }, 409);
  await customerPatch({ email: 'invalid' }, 400);
  const dupNameRes = await createCustomerApi(new Request('http://localhost/api/customers', { method: 'POST', body: JSON.stringify({ name: customer.name }) }));
  assert.equal(dupNameRes.status, 409);
  const dupNameBody = await dupNameRes.json();
  assert.equal(dupNameBody.error, 'Ya existe un cliente con este nombre');
  edited = await customerPatch({ name: customer.name, email: '' }); assert.equal(edited.email, null);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: customer.id } })).email, null);
  assert.equal((await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).customerId, customer.id);
  actor = customer; await customerPatch({ phone: '333' }, 403);
  actor = admin;
  console.log('PASS: repeated customer edits by administrators and technicians, editable email, duplicate-email protection and preserved ticket relationships.');
  if (process.argv[2]) {
    const base = process.argv[2], password = crypto.randomUUID();
    await db.user.update({ where: { id: admin.id }, data: { password: await require('bcryptjs').hash(password, 10) } });
    const jar = new Map();
    async function http(url, options = {}) {
      const response = await fetch(base + url, { ...options, headers: { ...options.headers, Cookie: [...jar].map(([k, v]) => k + '=' + v).join('; ') }, redirect: 'manual', signal: AbortSignal.timeout(60000) });
      for (const cookie of response.headers.getSetCookie()) { const first = cookie.split(';')[0], pos = first.indexOf('='); jar.set(first.slice(0, pos), first.slice(pos + 1)); }
      return response;
    }
    const csrf = await (await http('/api/auth/csrf')).json();
    await http('/api/auth/callback/credentials', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: admin.email, password, csrfToken: csrf.csrfToken, json: 'true', callbackUrl: base + '/dashboard' }) });
    const session = await (await http('/api/auth/session')).json(); assert.equal(session.user?.id, admin.id);
    for (const route of ['/dashboard', '/dashboard/reports', '/dashboard/users', '/dashboard/users/new', '/dashboard/customers', '/dashboard/orders', '/dashboard/tickets/new', '/dashboard/tickets/' + ticket.id, '/dashboard/tickets?assignee=' + tech2.id]) {
      const response = await http(route); assert.equal(response.status, 200, route);
      const html = await response.text(); assert(html.includes('SIP SOPORTE'));
      if (route === '/dashboard') { assert(html.includes('Mi rendimiento del mes')); assert(html.includes('Sin meta')); assert(html.includes('Cierre de tickets')); }
      if (route === '/dashboard/users/new') { assert(html.includes('Foto de perfil')); assert(html.includes('Meta de digitación')); assert(html.includes('Meta de cierres')); }
      if (route === '/dashboard/users') { assert(html.includes('Tarjetas')); assert(html.includes('Lista')); assert(!html.includes('Ticket test CUSTOMER')); }
      if (route === '/dashboard/customers') assert(html.includes('Ticket test CUSTOMER'));
    }
    const response = await http('/api/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...valid, assigneeIds: [] }) }); assert.equal(response.status, 400);
    const publicPage = await fetch(base + '/public/ticket/' + customer.publicToken); assert.equal(publicPage.status, 200); assert((await publicPage.text()).includes('Seleccionar categoría'));
    const ordersResponse = await http('/api/service?scope=orders'); assert.equal(ordersResponse.status, 200);
    const ordersState = (await ordersResponse.json()).state;
    for (const order of ordersState.orders) { assert.match(order.number, /^OS-\d{6,}$/); assert(Number.isFinite(Date.parse(order.startTime))); assert(ordersState.users.some(u => u.id === order.techId)); }
    console.log('PASS: real HTTP login, ticket creation validation, directory and ticket pages, secondary-technician filter and public form.');
    assert.equal((await http('/api/reports')).status, 200);
    await db.user.update({ where: { id: tech1.id }, data: { password: await require('bcryptjs').hash(password, 10) } });
    jar.clear();
    const agentCsrf = await (await http('/api/auth/csrf')).json();
    await http('/api/auth/callback/credentials', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: tech1.email, password, csrfToken: agentCsrf.csrfToken, json: 'true', callbackUrl: base + '/dashboard' }) });
    for (const section of ['settings','users','categories','reports']) {
      const denied = await http('/dashboard/' + section);
      const deniedHtml = await denied.text();
      assert.ok([307,308].includes(denied.status) || (denied.status === 200 && deniedHtml.includes('NEXT_REDIRECT') && deniedHtml.includes('/dashboard')), section + ': ' + denied.status);
      assert.equal((await http('/api/' + section)).status, 403);
    }
    assert.equal((await http('/api/tickets/options')).status, 200);
    const agentDashboard = await (await http('/dashboard')).text();
    for (const section of ['settings','users','categories','reports']) assert.ok(!agentDashboard.includes('href="/dashboard/' + section + '"'));
    console.log('PASS: real HTTP agent direct-page redirects, forbidden APIs and hidden navigation; administrator reports available.');
  }
  console.log('PASS: mandatory ticket fields, multiple technicians, team replacement, take-ticket preservation, filters, permissions, public token, internal users only and database constraints.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await db.ticket.deleteMany({ where: { id: { in: tickets } } });
  await db.category.deleteMany({ where: { id: { in: categories } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});
