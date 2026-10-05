// Order email flow through the real route handler with in-memory Prisma and SMTP doubles.
// No database or mail server is used, and .env is not loaded.
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), Module = require('module'), ts = require('typescript');
Object.assign(process.env, { SMTP_HOST: 'smtp.test', SMTP_PORT: '587', SMTP_USER: 'mailer@test', SMTP_PASSWORD: 'secret', SMTP_FROM: 'SIP <mailer@test>', NEXTAUTH_SECRET: 'x'.repeat(40), NEXTAUTH_URL: 'http://localhost:5185' });
delete process.env.APP_PUBLIC_URL;

let ticketQuery, listRecords = [];
const users = new Map(), records = new Map(), tickets = new Map(), settings = [], audit = [], sent = [];
let smtpFailure = null, actor;
const clone = value => JSON.parse(JSON.stringify(value));
const pick = (row, select) => row && (select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : row);
let counter = 0;
const db = {
  user: {
    findUnique: async ({ where, select }) => pick(users.get(where.id), select),
    findMany: async ({ where, select }) => (where.id ? where.id.in.map(id => users.get(id)) : [...users.values()].filter(u => where.role === u.role || where.role?.in?.includes(u.role))).filter(Boolean).map(u => pick(u, select)),
    count: async ({ where }) => where.id.in.filter(id => ['ADMIN', 'AGENT'].includes(users.get(id)?.role)).length,
  },
  ticket: {
    findUnique: async ({ where }) => tickets.get(where.id) || null,
    findMany: async args => { ticketQuery = args; return [...tickets.values()]; },
    updateMany: async ({ where, data }) => { const t = tickets.get(where.id); if (!t || !where.status.in.includes(t.status)) return { count: 0 }; Object.assign(t, data); return { count: 1 }; },
  },
  message: { create: async () => ({}) },
  ticketAssignee: { findUnique: async ({ where }) => tickets.get(where.ticketId_userId.ticketId)?.assignees.includes(where.ticketId_userId.userId) ? {} : null },
  setting: { findMany: async () => settings },
  serviceAuditEvent: { create: async ({ data }) => audit.push(data) },
  serviceRecord: {
    findUnique: async ({ where }) => records.get(where.id) || null,
    findFirst: async ({ where }) => { const r = records.get(where.id); return r && r.kind === where.kind ? r : null; },
    // Mirrors the PostgreSQL trigger that assigns OS-numbers on insert.
    create: async ({ data }) => { const payload = clone(data.payload); if (data.kind === 'orders') payload.number = `OS-${String(++counter).padStart(6, '0')}`; const row = { ...data, payload, revision: 1, createdAt: new Date() }; records.set(data.id, row); return row; },
    updateMany: async ({ where, data }) => { const row = records.get(where.id); if (!row || row.revision !== where.revision) return { count: 0 }; row.payload = { ...clone(data.payload), number: row.payload.number }; row.revision++; return { count: 1 }; },
    upsert: async ({ where, create, update }) => { const row = records.get(where.id); if (row) { row.payload = clone(update.payload); row.revision++; return row; } const created = { ...create, payload: clone(create.payload), revision: 1, createdAt: new Date() }; records.set(where.id, created); return created; },
  },
  $transaction: fn => fn(db),
};
class ServiceError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const original = Module._load;
Module._load = function (name, parent, ...rest) {
  if (name === '@/lib/prisma') return { prisma: db };
  if (name === '@/lib/support/list') return { serviceList: async () => listRecords };
  if (name === '@/lib/support/server') return { serviceUser: async () => actor, ServiceError, serviceError: e => Response.json({ error: e.message }, { status: e.status || 500 }) };
  if (name === 'nodemailer') return { __esModule: true, default: { createTransport: () => ({ sendMail: async mail => { if (smtpFailure) throw smtpFailure; sent.push(mail); return { messageId: `<${sent.length}@test>` }; } }) } };
  if (name.startsWith('@/')) name = path.resolve(name.slice(2));
  return original.call(this, name, parent, ...rest);
};
require.extensions['.ts'] = require.extensions['.tsx'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename);
const { POST } = require('../app/api/service/[entity]/route.ts');
const { GET: openOrder } = require('../app/api/service/[entity]/[id]/route.ts');
const { GET: publicPdf } = require('../app/api/public/orders/[id]/pdf/route.ts');
const { orderPdfUrl, verifyOrderLink } = require('../lib/order-link.ts');
const { getServiceOrderEmailTemplate, escapeHtml } = require('../lib/email.ts');
const { pdfText } = require('../lib/order-pdf.ts');

const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const order = (clientId, extra = {}) => ({ id: crypto.randomUUID(), number: 'forged', clientId, techId: 'tech', serviceName: 'Mantenimiento POS', status: 'completed', startTime: '2026-09-01T20:00:00.000Z', diagnosis: 'Impresora sin respuesta', workDone: 'Cambio de cable', observations: 'Limpieza trimestral', signerName: 'Juan Gómez', consent: true, signature, ...extra });
async function create(data) {
  const response = await POST(new Request('http://localhost/api/service/orders', { method: 'POST', body: JSON.stringify(data) }), { params: { entity: 'orders' } });
  return { status: response.status, body: await response.json() };
}
const log = id => records.get(`order-email:${id}`)?.payload;

(async () => {
  users.set('tech', { id: 'tech', name: 'Ana Pérez', email: 'ana@sip.test', role: 'AGENT' });
  users.set('client', { id: 'client', name: 'Restaurante <script>alert(1)</script> & Cía', email: 'cliente@example.com', phone: '3001234567', address: 'Cra 7 # 45-12', location: 'Bogotá', role: 'CUSTOMER', emailNotifications: true });
  users.set('no-mail', { id: 'no-mail', name: 'Sin correo', email: null, role: 'CUSTOMER', emailNotifications: true });
  users.set('bad-mail', { id: 'bad-mail', name: 'Correo inválido', email: 'no-es-correo', role: 'CUSTOMER', emailNotifications: true });
  users.set('opt-out', { id: 'opt-out', name: 'Sin notificaciones', email: 'optout@example.com', role: 'CUSTOMER', emailNotifications: false });
  actor = users.get('tech');

  // 1. Successful creation: PDF generated, HTML email sent to the order's client with the PDF attached.
  const ok = order('client');
  let result = await create(ok);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(records.get(ok.id).kind, 'orders');
  assert.equal(result.body.email.status, 'sent');
  assert.equal(sent.length, 1);
  const mail = sent[0];
  assert.equal(mail.to, 'cliente@example.com');
  assert.match(mail.subject, /OS-000001/);
  const pdf = mail.attachments.find(a => a.contentType === 'application/pdf');
  assert.ok(pdf && pdf.filename === 'orden-OS-000001.pdf');
  assert.equal(pdf.content.subarray(0, 5).toString(), '%PDF-');
  assert.ok(mail.attachments.some(a => a.cid === 'org-logo'), 'logo embedded inline');
  assert.ok(!mail.html.includes('<script>alert(1)</script>') && mail.html.includes('&lt;script&gt;'), 'customer name is escaped');
  assert.ok(mail.html.includes('Ver orden de servicio') && mail.html.includes('/api/public/orders/'));
  assert.ok(mail.text.includes('Orden OS-000001'));
  assert.equal(log(ok.id).status, 'sent'); assert.equal(log(ok.id).recipient, 'cliente@example.com'); assert.ok(log(ok.id).sentAt);
  assert.ok(audit.some(e => e.entityId === ok.id && e.action === 'orders:email-sent'));
  fs.mkdirSync('tmp/pdfs', { recursive: true }); fs.writeFileSync('tmp/pdfs/order-email-preview.pdf', pdf.content); fs.writeFileSync('tmp/pdfs/order-email-preview.html', mail.html);
  console.log('PASS: order created, PDF generated and attached, HTML email sent to the order client, result logged.');

  // 1b. Several technicians: all are stored (responsible first) and listed in the email; customers are rejected.
  users.set('tech2', { id: 'tech2', name: 'Luis Mora', email: 'luis@sip.test', role: 'AGENT' });
  const shared = order('client', { techIds: ['tech2', 'tech2'] });
  result = await create(shared);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual(records.get(shared.id).payload.techIds, ['tech', 'tech2']);
  assert.match(sent.at(-1).html, /Técnicos<\/td>[\s\S]*Ana Pérez, Luis Mora/);
  assert.equal((await create(order('client', { techIds: ['client'] }))).status, 400);
  console.log('PASS: orders keep several technicians, the responsible always included, and reject non-staff.');

  // 1c. Added technicians can open the order; others cannot.
  users.set('tech3', { id: 'tech3', name: 'Otro', email: 'otro@sip.test', role: 'AGENT' });
  const view = async who => { actor = users.get(who); const r = await openOrder(new Request('http://localhost'), { params: { entity: 'orders', id: shared.id } }); actor = users.get('tech'); return r.status; };
  assert.equal(await view('tech2'), 200, 'added technician sees the order');
  assert.equal(await view('tech3'), 404, 'unrelated technician does not');
  // 1d. Only open or pending tickets of the client can be linked, whatever their date.
  tickets.set('closed', { id: 'closed', customerId: 'client', status: 'CLOSED', number: 7, subject: 'Viejo', priority: 'NORMAL', assignees: ['tech'] });
  tickets.set('pending', { id: 'pending', customerId: 'client', status: 'PENDING', number: 8, subject: 'Pendiente', priority: 'HIGH', assignees: ['tech'] });
  result = await create(order('client', { ticketId: 'closed' }));
  assert.equal(result.status, 400); assert.match(result.body.error, /abiertos o pendientes/);
  assert.equal((await create(order('client', { ticketId: 'pending' }))).status, 200);
  assert.equal(tickets.get('pending').status, 'CLOSED', 'confirming the order closes the linked ticket');
  // The order form receives open/pending tickets of any date, plus tickets linked to the listed orders.
  const { GET: loadService } = require('../app/api/service/route.ts');
  listRecords = [{ id: 'o1', kind: 'orders', revision: 1, payload: { ticketId: 'closed' } }];
  const state = await (await loadService(new Request('http://localhost/api/service?scope=orders'))).json();
  const [linkable, linked] = ticketQuery.where.OR;
  assert.deepEqual(linkable.status, { in: ['OPEN', 'PENDING'] }); assert.equal(linkable.createdAt, undefined, 'no creation-date limit');
  assert.deepEqual(linkable.assignments, { some: { userId: 'tech' } }, 'agents only get their assigned tickets');
  assert.deepEqual(linked, { id: { in: ['closed'] } });
  assert.equal(state.state.tickets.find(t => t.id === 'closed').status, 'closed');
  assert.equal(state.state.tickets.find(t => t.id === 'pending').number, 'TK-8');
  console.log('PASS: added technicians can open the order; only open or pending tickets of any date can be linked.');

  // 2. SMTP failure: the order stays, the error is logged, staff get a safe message.
  smtpFailure = new Error('535 Invalid login: secret-detail');
  const failing = order('client');
  result = await create(failing);
  assert.equal(result.status, 200);
  assert.ok(records.get(failing.id), 'order kept after SMTP failure');
  assert.equal(result.body.email.status, 'failed');
  assert.ok(!result.body.email.message.includes('secret-detail'), 'SMTP details are not exposed');
  assert.match(result.body.email.message, /La orden sigue registrada correctamente/);
  assert.equal(log(failing.id).status, 'failed'); assert.match(log(failing.id).errorMessage, /Invalid login/);
  smtpFailure = null;
  // 3. Missing SMTP configuration behaves the same way.
  const password = process.env.SMTP_PASSWORD; delete process.env.SMTP_PASSWORD;
  const unconfigured = order('client');
  result = await create(unconfigured);
  assert.equal(result.body.email.status, 'failed'); assert.ok(records.get(unconfigured.id));
  process.env.SMTP_PASSWORD = password;
  console.log('PASS: SMTP errors and missing configuration keep the order, log the failure and return a safe message.');

  // 4. Clients without a valid address or with notifications disabled are skipped without SMTP.
  const before = sent.length;
  for (const clientId of ['no-mail', 'bad-mail', 'opt-out']) {
    const draft = order(clientId);
    result = await create(draft);
    assert.equal(result.status, 200); assert.equal(result.body.email.status, 'skipped'); assert.equal(log(draft.id).status, 'skipped');
  }
  assert.equal(sent.length, before);
  // 5. Editing an order does not send the creation email again.
  const inProgress = order('client', { status: 'in_progress', signature: undefined, consent: false });
  await create(inProgress);
  const sentAfterCreate = sent.length;
  result = await create({ ...records.get(inProgress.id).payload, observations: 'Editada', _revision: 1 });
  assert.equal(result.status, 200); assert.equal(result.body.email, undefined); assert.equal(sent.length, sentAfterCreate);
  console.log('PASS: invalid or opted-out recipients are skipped; edits do not resend the creation email.');

  // 6. Signed PDF link: valid, tampered, other order and expired.
  const url = new URL(orderPdfUrl(ok.id));
  const [exp, sig] = [url.searchParams.get('exp'), url.searchParams.get('sig')];
  assert.ok(verifyOrderLink(ok.id, exp, sig));
  assert.ok(!verifyOrderLink(failing.id, exp, sig));
  assert.ok(!verifyOrderLink(ok.id, exp, sig.slice(0, -2) + 'AA'));
  assert.ok(!verifyOrderLink(ok.id, String(Number(exp) + 1), sig));
  assert.ok(!verifyOrderLink(ok.id, exp, sig, (Number(exp) + 1) * 1000));
  const opened = await publicPdf(new Request(url), { params: { id: ok.id } });
  assert.equal(opened.status, 200); assert.equal(opened.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await opened.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  assert.equal((await publicPdf(new Request(`http://localhost/api/public/orders/${ok.id}/pdf`), { params: { id: ok.id } })).status, 404);
  console.log('PASS: signed PDF links verify order, signature and expiry.');

  // 7. Escaping and PDF text normalisation.
  assert.equal(escapeHtml(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  const html = getServiceOrderEmailTemplate({ orgName: '<b>Org</b>', customerName: '"><img src=x onerror=alert(1)>', orderNumber: 'OS-1', serviceName: 's', status: 'Completada', serviceDate: 'hoy', technician: 't', viewUrl: 'https://x.test/?a=1&b="2"' }).html;
  assert.ok(!html.includes('<img src=x') && !html.includes('<b>Org</b>') && html.includes('a=1&amp;b=&quot;2&quot;'));
  assert.equal(pdfText('Café “POS” — 3:00 p. m. 😀'), 'Café "POS" - 3:00 p. m.');
  console.log('PASS: HTML email and PDF text escaping.');
})().catch(error => { console.error(error); process.exitCode = 1; });
