// Per-customer billing numbering against a real PostgreSQL database (DATABASE_URL from .env).
// Creates throw-away customers, issues accounts concurrently and cleans up afterwards.
// Run: node scripts/test-billing-numbering.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
if (!process.env.DATABASE_URL) {
  for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z_]+)=("?)(.*)\2$/.exec(line.trim());
    if (match && !process.env[match[1]]) process.env[match[1]] = match[3];
  }
}
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  // React's cache() only exists inside a server render; the numbering code never uses the session.
  if (request === '@/lib/dashboard-data') return { getDashboardSession: async () => null, getDashboardUser: async () => null };
  if (request.startsWith('@/')) request = path.join(__dirname, '..', request.slice(2));
  return originalLoad.call(this, request, parent, isMain);
};
const { prisma } = require('../lib/prisma.ts');
const billing = require('../lib/accounting/billing.ts');
const { formatBillingNumber } = require('../lib/accounting/format.ts');

const tag = `billing-test-${Date.now()}`;
const ids = { customers: [], templates: [] };
async function customer(name, billingStartNumber) {
  const user = await prisma.user.create({ data: { name: `${tag} ${name}`, email: `${tag}-${name}@example.test`, role: 'CUSTOMER', businessName: `${name} SAS`, taxId: '900.000.000-1', billingStartNumber } });
  ids.customers.push(user.id);
  return user;
}
async function cleanup() {
  await prisma.billingAccount.deleteMany({ where: { customerId: { in: ids.customers } } });
  await prisma.billingTemplate.deleteMany({ where: { customerId: { in: ids.customers } } });
  await prisma.customerBillingSequence.deleteMany({ where: { customerId: { in: ids.customers } } });
  await prisma.serviceAuditEvent.deleteMany({ where: { actorId: tag } });
  await prisma.user.deleteMany({ where: { id: { in: ids.customers } } });
}
(async () => {
  const [a, b, c] = await Promise.all([customer('A', 1), customer('B', 15), customer('C', 1)]);
  const issue = (user, concept, totalCents, extra = {}) => billing.issueBillingAccount({ customerId: user.id, concept, totalCents, actorId: tag, ...extra });

  // Two different customers can both have 01; customer B starts at 15.
  const [a1, b1, c1] = await Promise.all([issue(a, 'Adaptador y cable de red', 17600000), issue(b, 'Soporte mensual', 10000000), issue(c, 'Visita técnica', 5000000)]);
  assert.equal(formatBillingNumber(a1.number), '01'); assert.equal(formatBillingNumber(b1.number), '15'); assert.equal(formatBillingNumber(c1.number), '01');
  assert.ok(a1.pdf && a1.pdf.length > 1000 && Buffer.from(a1.pdf).subarray(0, 5).toString() === '%PDF-', 'stores the generated PDF');
  assert.equal(a1.snapshot.amountInWords, 'Ciento setenta y seis mil pesos m/c');
  assert.equal(a1.snapshot.customer.businessName, 'A SAS');
  assert.ok(a1.publicToken.length >= 40 && !a1.publicToken.includes(a1.id), 'random public token');

  // Twelve simultaneous issues for the same customer: consecutive numbers, no duplicates, no gaps.
  const burst = await Promise.all(Array.from({ length: 12 }, (_, index) => issue(a, `Concurrente ${index + 1}`, 100000 * (index + 1))));
  const numbers = burst.map(account => account.number).sort((x, y) => x - y);
  assert.deepEqual(numbers, Array.from({ length: 12 }, (_, index) => index + 2));
  assert.equal(new Set(numbers).size, 12);
  assert.equal(formatBillingNumber(numbers[numbers.length - 1]), '13');

  // Recurring template shares the customer's sequence and is unique per period.
  const template = await prisma.billingTemplate.create({ data: { customerId: a.id, concept: 'Mantenimiento mensual', total: 250000, createdById: tag } });
  ids.templates.push(template.id);
  const first = await billing.generateFromTemplates([template.id], '2026-10', tag);
  assert.equal(first[0].status, 'generated'); assert.equal(first[0].number, '14');
  const again = await billing.generateFromTemplates([template.id, 'missing-template'], '2026-10', tag);
  assert.equal(again[0].status, 'duplicate'); assert.match(again[0].message, /14/);
  assert.equal(again[1].status, 'error');
  const nextMonth = await billing.generateFromTemplates([template.id], '2026-11', tag);
  assert.equal(nextMonth[0].status, 'generated'); assert.equal(nextMonth[0].number, '15');
  // Concurrent generation of the same period yields exactly one account.
  const race = await Promise.all([1, 2, 3].map(() => billing.generateFromTemplates([template.id], '2026-12', tag)));
  assert.equal(race.flat().filter(result => result.status === 'generated').length, 1);
  assert.equal(race.flat().filter(result => result.status === 'duplicate').length, 2);
  assert.equal(await prisma.billingAccount.count({ where: { templateId: template.id } }), 3);
  // Editing the template never changes issued accounts.
  await prisma.billingTemplate.update({ where: { id: template.id }, data: { total: 999999, concept: 'Cambiado' } });
  const stored = await prisma.billingAccount.findFirst({ where: { templateId: template.id, period: '2026-10' } });
  assert.equal(Number(stored.total), 250000); assert.equal(stored.concept, 'Mantenimiento mensual'); assert.equal(stored.snapshot.concept, 'Mantenimiento mensual');

  // Voided numbers are not reused, and changing the start number does not restart a running sequence.
  await prisma.billingAccount.update({ where: { id: a1.id }, data: { status: 'VOID', voidedAt: new Date() } });
  await prisma.user.update({ where: { id: a.id }, data: { billingStartNumber: 1 } });
  const afterVoid = await issue(a, 'Después de anular', 1000);
  assert.equal(afterVoid.number, 17);
  const peek = await billing.peekBillingNumber(a.id);
  assert.deepEqual(peek, { next: 18, started: true });
  assert.deepEqual(await billing.peekBillingNumber(c.id), { next: 2, started: true });

  // Failed transactions do not consume numbers: an invalid template for the customer rolls back.
  await assert.rejects(issue(c, 'Plantilla ajena', 1000, { templateId: template.id, period: '2027-01' }), /no corresponde/);
  assert.equal((await issue(c, 'Siguiente', 1000)).number, 2);

  // Database guard: the unique index rejects a duplicate (customer, number) even without the sequence.
  await assert.rejects(prisma.billingAccount.create({ data: { customerId: c.id, number: 2, concept: 'Duplicado', total: 1, snapshot: {}, publicToken: `${tag}-dup` } }), /Unique constraint/);

  console.log('PASS: independent numbering per customer (01/15/01), 12 concurrent issues without duplicates or gaps, shared sequence for recurring accounts, one account per template and period under concurrency, immutable snapshots, no reuse after void, rollback on failure, unique index');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await cleanup(); await prisma.$disconnect(); });
