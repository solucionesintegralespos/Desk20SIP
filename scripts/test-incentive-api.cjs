// Isolated route tests: no connection to the application database.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
class ServiceError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
let role = 'ADMIN', tickets = [], audits = [];
const records = new Map();
const staff = [{ id: 'leader', name: 'Test leader', role: 'ADMIN' }];
const db = {
 user: { findMany: async () => staff }, category: { findMany: async () => [], count: async () => 0 },
 ticket: { findMany: async () => tickets },
 serviceRecord: {
  findMany: async ({ where }) => [...records.values()].filter(r => r.id.startsWith(where.id.startsWith)),
  findUnique: async ({ where }) => records.get(where.id) || null,
  create: async ({ data }) => { const r = { ...data, revision: 1 }; records.set(data.id, r); return r; },
  updateMany: async ({ where, data }) => { const r = records.get(where.id); if (!r || r.revision !== where.revision) return { count: 0 }; records.set(r.id, { ...r, payload: data.payload, revision: r.revision + 1 }); return { count: 1 }; },
 }, serviceAuditEvent: { create: async ({ data }) => { audits.push(data); } },
 $transaction: async fn => fn(db),
};
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
 if (request === '@/lib/prisma') return { prisma: db };
 if (request === '@/lib/support/server') return { ServiceError, serviceUser: async () => { if (!role) throw new ServiceError('No autorizado', 401); return { id: 'leader', role, name: 'Test leader' }; }, serviceError: e => Response.json({ error: e.message }, { status: e.status || 503 }) };
 if (request.startsWith('@/')) request = path.join(__dirname, '..', request.slice(2));
 return originalLoad.call(this, request, parent, isMain);
};
const { GET, POST } = require('../app/api/incentives/route.ts');
const { initialPlan } = require('../lib/incentives.ts');
const plan = initialPlan('2026-01', 'helpdesk', ['leader'], []);
plan.leaderId = 'leader';
plan.indicators = [{ ...plan.indicators[0], source: 'manual', confirmed: true, numerator: 80, denominator: 100 }];
const request = (action, revision, value = plan) => new Request('http://localhost/api/incentives', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, revision, plan: value }) });
(async () => {
 role = null; assert.equal((await GET(new Request('http://localhost/api/incentives?month=2026-01'))).status, 401);
 for (const deniedRole of ['AGENT', 'CUSTOMER']) {
  role = deniedRole;
  assert.equal((await GET(new Request('http://localhost/api/incentives?month=2026-01'))).status, 403);
  assert.equal((await POST(request('save', 0))).status, 403);
  assert.equal((await POST(request('close', 0))).status, 403);
 }
 role = 'ADMIN'; assert.equal((await GET(new Request('http://localhost/api/incentives?month=bad'))).status, 400);
 assert.equal((await POST(request('save', 0))).status, 200);
 assert.equal((await POST(request('save', 0))).status, 409);
 assert.equal((await POST(request('close', 1, { ...plan, indicators: [{ ...plan.indicators[0], confirmed: false }] }))).status, 400);
 assert.equal((await POST(request('close', 1, { ...plan, leaderId: '' }))).status, 400);
 assert.equal((await POST(request('close', 1))).status, 200);
 const saved = records.get('incentive:2026-01:helpdesk');
 assert.equal(saved.payload.snapshot.total, 25000);
 assert.ok(saved.payload.closedAt); assert.equal(saved.revision, 2);
 assert.equal((await POST(request('save', 2))).status, 409);
 const response = await GET(new Request('http://localhost/api/incentives?month=2026-01'));
 const data = await response.json(); assert.equal(data.plans.length, 3);
 assert.equal(data.plans[0].results.total, 25000);
 assert.equal(data.plans[1].indicators.length, 0);
 assert.equal(audits.length, 2);
 assert.equal((await POST(request('save', 0, { ...plan, month: '2100-01' }))).status, 400);
 console.log('PASS: admin authorization, input validation, monthly persistence, revision conflicts, pending closure rejection, immutable snapshots and audit');
})().catch(error => { console.error(error); process.exitCode = 1; });
