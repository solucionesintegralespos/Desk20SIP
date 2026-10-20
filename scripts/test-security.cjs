// Security rules with in-memory doubles: attempt limits, server-side 2FA, message access by
// ticket, public links for staff only, contact escaping, upload limits and the schedule range.
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), Module = require('module'), ts = require('typescript');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const hash = bcrypt.hashSync('secreto123', 4), secret = authenticator.generateSecret();
const users = new Map([
  ['admin', { id: 'admin', email: 'admin@sip.test', role: 'ADMIN', password: hash, active: true, twoFactorEnabled: false }],
  ['agent', { id: 'agent', email: 'agent@sip.test', role: 'AGENT', password: hash, active: true, twoFactorEnabled: true, twoFactorSecret: secret }],
  ['c1', { id: 'c1', email: 'c1@sip.test', role: 'CUSTOMER', password: hash, active: true, emailNotifications: false }],
  ['c2', { id: 'c2', email: 'c2@sip.test', role: 'CUSTOMER', password: hash, active: true, emailNotifications: false }],
]);
const tickets = new Map([['t1', { id: 't1', customerId: 'c1', number: 1, subject: 'Uno' }]]);
const messages = [{ id: 'm1', ticketId: 't1', isInternal: true, authorId: 'agent', content: 'nota interna', createdAt: new Date() }, { id: 'm2', ticketId: 't1', isInternal: false, authorId: 'agent', content: 'pública', createdAt: new Date() }];
let sessionUser = 'admin', sent = [], rawQuery;
const pick = (row, select) => row && (select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : row);
const db = {
  user: {
    findUnique: async ({ where, select }) => pick(where.id ? users.get(where.id) : [...users.values()].find(u => u.email === where.email), select) || null,
    update: async ({ where, data, select }) => { Object.assign(users.get(where.id), data); return pick(users.get(where.id), select); },
    findMany: async () => [], count: async () => 1,
  },
  ticket: { findUnique: async ({ where, select }) => pick(tickets.get(where.id), select) || null, update: async () => ({}) },
  message: {
    findMany: async ({ where }) => messages.filter(m => m.ticketId === where.ticketId && (where.isInternal === undefined || m.isInternal === where.isInternal)).map(m => ({ ...m, author: users.get(m.authorId) })),
    create: async ({ data }) => { const m = { id: `m${messages.length + 1}`, createdAt: new Date(), ...data }; messages.push(m); return { ...m, author: users.get(m.authorId), ticket: { ...tickets.get(m.ticketId), customer: users.get(tickets.get(m.ticketId).customerId) } }; },
  },
  setting: { findMany: async () => [] },
  // The route passes a Prisma.sql object (strings + values).
  $queryRaw: async query => { rawQuery = { sql: query.strings.join('?'), values: query.values }; return []; },
};
const original = Module._load;
Module._load = function (name, parent, ...rest) {
  if (name === '@/lib/prisma') return { prisma: db };
  if (name === 'next-auth') return { getServerSession: async () => sessionUser ? { user: { id: sessionUser, email: users.get(sessionUser).email } } : null };
  if (name === '@/lib/support/server') return { serviceUser: async () => users.get(sessionUser), ServiceError: class extends Error { constructor(m, s = 400) { super(m); this.status = s; } }, serviceError: e => Response.json({ error: e.message }, { status: e.status || 500 }) };
  if (name === 'nodemailer') return { __esModule: true, default: { createTransport: () => ({ sendMail: async mail => { sent.push(mail); return { messageId: 'x' }; } }) } };
  if (name.startsWith('@/')) name = path.resolve(name.slice(2));
  return original.call(this, name, parent, ...rest);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
Object.assign(process.env, { SMTP_HOST: 'smtp.test', SMTP_USER: 'u', SMTP_PASSWORD: 'p' });

const { rateLimit, rateLimitAll } = require('../lib/rate-limit.ts');
const { authOptions, TWO_FACTOR_REQUIRED, TOO_MANY_ATTEMPTS } = require('../lib/auth.ts');
const messagesRoute = require('../app/api/messages/route.ts');
const tokenRoute = require('../app/api/customers/[id]/token/route.ts');
const contactRoute = require('../app/api/contact/route.ts');
const { acceptFiles, MAX_UPLOAD_BYTES } = require('../lib/upload-limits.ts');
const { uploadPath, contentMatches } = require('../lib/uploads.ts');
const scheduleRoute = require('../app/api/schedule/route.ts');
const authorize = (c, ip = 'ip1') => authOptions.providers[0].options.authorize(c, { headers: { 'x-forwarded-for': ip } });
const json = async (promise) => { const r = await promise; return { status: r.status, body: await r.json() }; };
const post = (route, body, params) => json(route.POST(new Request('http://localhost', { method: 'POST', headers: { 'x-forwarded-for': '9.9.9.9' }, body: JSON.stringify(body) }), params));

(async () => {
  // Attempt limits: fixed window per key.
  for (let i = 0; i < 3; i++) assert.ok(rateLimit('k', 3, 1000, 0).ok);
  assert.equal(rateLimit('k', 3, 1000, 500).ok, false);
  assert.ok(rateLimit('k', 3, 1000, 1001).ok, 'window resets');
  assert.equal(rateLimitAll([['a', 1, 1000], ['b', 5, 1000]], 0).ok, true);
  assert.equal(rateLimitAll([['a', 1, 1000], ['b', 5, 1000]], 1).ok, false, 'one exhausted key blocks');
  console.log('PASS: attempt limiter counts per key and resets after the window.');

  // Two-factor is enforced inside the sign-in itself.
  await assert.rejects(authorize({ email: 'agent@sip.test', password: 'secreto123' }), new RegExp(TWO_FACTOR_REQUIRED), 'password alone is not enough');
  await assert.rejects(authorize({ email: 'agent@sip.test', password: 'secreto123', twoFactorCode: '000000' }), new RegExp(TWO_FACTOR_REQUIRED));
  const code = authenticator.generate(secret);
  assert.equal((await authorize({ email: 'agent@sip.test', password: 'secreto123', twoFactorCode: code })).id, 'agent');
  assert.equal((await authorize({ email: 'admin@sip.test', password: 'secreto123' })).id, 'admin', 'no 2FA: password only');
  assert.equal(await authorize({ email: 'agent@sip.test', password: 'mal', twoFactorCode: code }), null, 'wrong password stays generic');
  let last;
  for (let i = 0; i < 25; i++) { try { await authorize({ email: 'admin@sip.test', password: 'mal' }, 'ip2'); last = 'null'; } catch (e) { last = e.message; } }
  assert.equal(last, TOO_MANY_ATTEMPTS, 'repeated failures are blocked');
  console.log('PASS: 2FA codes are verified during sign-in and brute force is limited.');

  // Messages: customers see only their own tickets and never internal notes; types are controlled.
  const get = id => json(messagesRoute.GET(new Request(`http://localhost/api/messages?ticketId=${id}`)));
  sessionUser = 'c2'; assert.equal((await get('t1')).status, 404, 'other customer gets not found');
  assert.equal((await post(messagesRoute, { ticketId: 't1', content: 'hola' })).status, 404);
  sessionUser = 'c1'; let r = await get('t1');
  assert.equal(r.status, 200); assert.deepEqual(r.body.map(m => m.id), ['m2'], 'internal notes hidden');
  r = await post(messagesRoute, { ticketId: 't1', content: 'mi mensaje', isInternal: true, type: 'SYSTEM' });
  assert.equal(r.status, 201); assert.equal(r.body.isInternal, false); assert.equal(r.body.type, 'COMMENT', 'customers cannot write internal or system messages');
  sessionUser = 'agent'; r = await get('t1'); assert.equal(r.body.length, 3, 'staff see everything');
  assert.equal((await post(messagesRoute, { ticketId: 't1', content: 'x', attachments: ['/etc/passwd'] })).status, 400);
  assert.equal((await post(messagesRoute, { ticketId: 'nope', content: 'x' })).status, 404);
  console.log('PASS: message access is checked per ticket; internal notes stay internal.');

  // Public ticket links: staff only.
  sessionUser = 'c1';
  assert.equal((await json(tokenRoute.GET(new Request('http://localhost'), { params: { id: 'c2' } }))).status, 403);
  assert.equal((await json(tokenRoute.POST(new Request('http://localhost', { method: 'POST' }), { params: { id: 'c2' } }))).status, 403);
  sessionUser = 'agent';
  assert.equal((await json(tokenRoute.GET(new Request('http://localhost'), { params: { id: 'c2' } }))).status, 200);
  console.log('PASS: customers cannot read or regenerate public links.');

  // Contact form: escaped, validated, limited, and the confirmation echoes nothing.
  sent = [];
  r = await post(contactRoute, { name: '<img src=x onerror=alert(1)>', email: 'visitante@x.co', subject: 'Hola\r\nBcc: spam@x.co', message: '<script>1</script>' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(!sent[0].html.includes('<img src=x') && sent[0].html.includes('&lt;img'), 'admin mail escaped');
  assert.ok(!sent[0].subject.includes('\n'), 'no header injection');
  assert.ok(!sent[1].html.includes('script') && !sent[1].html.includes('&lt;img'), 'confirmation repeats nothing from the visitor');
  assert.equal((await post(contactRoute, { name: 'a', email: 'no-es-correo', subject: 's', message: 'm' })).status, 400);
  for (let i = 0; i < 6; i++) r = await post(contactRoute, { name: 'a', email: `v${i}@x.co`, subject: 's', message: 'm' });
  assert.equal(r.status, 429, 'per-address limit');
  console.log('PASS: contact form escapes content, validates input and limits submissions.');

  // Uploads: 30 MB, known types, content signature, private store.
  // acceptFiles only reads name and size, so a plain object stands in for File.
  const file = (name, size) => ({ name, size });
  let result = acceptFiles([file('ok.pdf', 10), file('grande.pdf', MAX_UPLOAD_BYTES + 1), file('script.svg', 10), file('page.html', 10)]);
  assert.deepEqual(result.accepted.map(f => f.name), ['ok.pdf']);
  assert.equal(result.rejected.length, 3); assert.match(result.rejected[0], /30 MB/);
  assert.ok(contentMatches('pdf', Buffer.from('%PDF-1.4')) && !contentMatches('pdf', Buffer.from('<html>')) && !contentMatches('png', Buffer.from('GIF89a')));
  assert.equal(uploadPath('../.env'), null); assert.equal(uploadPath('..%2F.env'), null); assert.equal(uploadPath('.htaccess'), null);
  console.log('PASS: upload limits, allowed types and path checks.');

  // Schedule: the API returns one date range, plus one event by id.
  sessionUser = 'admin';
  r = await json(scheduleRoute.GET(new Request('http://localhost/api/schedule?from=2026-10-19&to=2026-10-25&include=abc')));
  assert.equal(r.status, 200); assert.deepEqual(rawQuery.values, ['2026-10-19', '2026-10-25', 'abc']);
  assert.ok(rawQuery.sql.includes(`"payload"->>'date' >=`) && rawQuery.sql.includes('"kind" = \'schedule\''));
  r = await json(scheduleRoute.GET(new Request('http://localhost/api/schedule?from=2026-10-25&to=2026-10-19')));
  assert.equal(r.status, 400);
  r = await json(scheduleRoute.GET(new Request('http://localhost/api/schedule?from=hoy')));
  assert.equal(r.status, 200); assert.equal(rawQuery.values[0], rawQuery.values[1], 'invalid dates fall back to today');
  console.log('PASS: schedule loads only the requested dates.');
})().catch(error => { console.error(error); process.exitCode = 1; });
