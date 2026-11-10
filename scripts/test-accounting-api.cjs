// Isolated route tests for the accounting module: in-memory Prisma stand-in, no database.
// Covers authorization (Contabilidad = administrator), catalog rules, quote totals and
// snapshots, billing accounts (void, public link) and recurring templates.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { Prisma } = require('@prisma/client');

// ---------------------------------------------------------------------------
// Minimal in-memory Prisma: enough of the query API for these routes.
// ---------------------------------------------------------------------------
let counter = 0;
const newId = () => `id-${++counter}`;
const tables = { user: [], product: [], tax: [], quote: [], quoteItem: [], billingAccount: [], billingTemplate: [], customerBillingSequence: [], setting: [], serviceAuditEvent: [], serviceRecord: [] };
const relations = {
  quote: { items: row => tables.quoteItem.filter(item => item.quoteId === row.id).sort((a, b) => a.position - b.position), customer: row => tables.user.find(user => user.id === row.customerId) || null, tax: row => tables.tax.find(tax => tax.id === row.taxId) || null },
  billingAccount: { customer: row => tables.user.find(user => user.id === row.customerId) || null, template: row => tables.billingTemplate.find(template => template.id === row.templateId) || null },
  billingTemplate: { customer: row => tables.user.find(user => user.id === row.customerId) || null, accounts: row => tables.billingAccount.filter(account => account.templateId === row.id) },
  quoteItem: { product: row => tables.product.find(product => product.id === row.productId) || null },
};
const isScalar = value => value === null || typeof value !== 'object' || value instanceof Date || value instanceof Prisma.Decimal || Buffer.isBuffer(value);
const same = (a, b) => a instanceof Prisma.Decimal || b instanceof Prisma.Decimal ? Number(a) === Number(b) : a instanceof Date || b instanceof Date ? new Date(a).getTime() === new Date(b).getTime() : a === b;
function matches(table, row, where) {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (cond === undefined) return true;
    if (key === 'OR') return cond.some(c => matches(table, row, c));
    if (key === 'AND') return (Array.isArray(cond) ? cond : [cond]).every(c => matches(table, row, c));
    if (key === 'NOT') return !matches(table, row, cond);
    const relation = relations[table]?.[key];
    if (relation) {
      const related = relation(row);
      if (Array.isArray(related)) {
        if ('some' in cond) return related.some(r => matches(key === 'accounts' ? 'billingAccount' : key, r, cond.some));
        if ('none' in cond) return !related.some(r => matches(key, r, cond.none));
        return true;
      }
      return related ? matches(key === 'customer' ? 'user' : key, related, cond) : false;
    }
    const value = row[key];
    if (isScalar(cond)) return same(value, cond);
    if ('in' in cond) return cond.in.some(option => same(value, option));
    if ('notIn' in cond) return !cond.notIn.some(option => same(value, option));
    if ('equals' in cond) return cond.mode === 'insensitive' ? String(value ?? '').toLowerCase() === String(cond.equals).toLowerCase() : same(value, cond.equals);
    if ('contains' in cond) return String(value ?? '').toLowerCase().includes(String(cond.contains).toLowerCase());
    if ('startsWith' in cond) return String(value ?? '').startsWith(cond.startsWith);
    if ('path' in cond) { const nested = (cond.path || []).reduce((acc, part) => acc?.[part], value); return 'string_contains' in cond ? String(nested ?? '').includes(cond.string_contains) : same(nested, cond.equals); }
    if ('not' in cond) return !same(value, cond.not);
    let ok = true;
    if ('gte' in cond) ok = ok && value >= cond.gte;
    if ('gt' in cond) ok = ok && value > cond.gt;
    if ('lte' in cond) ok = ok && value <= cond.lte;
    if ('lt' in cond) ok = ok && value < cond.lt;
    return ok;
  });
}
function project(table, row, args) {
  if (!row) return null;
  const out = { ...row };
  const include = args?.include || {};
  const select = args?.select;
  if (select) {
    const picked = {};
    for (const [key, value] of Object.entries(select)) {
      if (!value) continue;
      const relation = relations[table]?.[key];
      if (relation) {
        const related = relation(row);
        picked[key] = Array.isArray(related) ? related.filter(r => matches(key === 'accounts' ? 'billingAccount' : key, r, value.where)).map(r => project(key === 'accounts' ? 'billingAccount' : key === 'customer' ? 'user' : key, r, value === true ? undefined : value)) : project(key === 'customer' ? 'user' : key, related, value === true ? undefined : value);
      } else if (key === '_count') picked._count = Object.fromEntries(Object.keys(value.select).map(name => [name, relations[table][name](row).length]));
      else picked[key] = row[key];
    }
    return picked;
  }
  for (const [key, value] of Object.entries(include)) {
    if (!value) continue;
    if (key === '_count') { out._count = Object.fromEntries(Object.keys(value.select).map(name => [name, relations[table][name](row).length])); continue; }
    const relation = relations[table][key];
    const related = relation(row);
    const sub = value === true ? undefined : value;
    out[key] = Array.isArray(related) ? related.filter(r => matches(key === 'accounts' ? 'billingAccount' : key, r, sub?.where)).map(r => project(key === 'accounts' ? 'billingAccount' : key, r, sub)) : project(key === 'customer' ? 'user' : key, related, sub);
  }
  return out;
}
function orderRows(rows, orderBy) {
  if (!orderBy) return rows;
  const rules = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const rule of rules) {
      const [key, dir] = Object.entries(rule)[0];
      const direction = typeof dir === 'string' ? dir : dir.sort;
      const av = a[key], bv = b[key];
      if (same(av, bv)) continue;
      const result = av > bv ? 1 : -1;
      return direction === 'desc' ? -result : result;
    }
    return 0;
  });
}
function applyData(table, row, data) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && !isScalar(value) && 'increment' in value) row[key] = (row[key] || 0) + value.increment;
    else if (value && typeof value === 'object' && !isScalar(value) && 'create' in value && Array.isArray(value.create)) {
      for (const child of value.create) tables.quoteItem.push({ id: newId(), quoteId: row.id, ...child });
    } else row[key] = value;
  }
  row.updatedAt = new Date();
}
const uniqueViolation = (table, row) => {
  if (table === 'billingAccount') {
    if (tables.billingAccount.some(other => other !== row && other.customerId === row.customerId && other.number === row.number)) return ['customerId', 'number'];
    if (row.templateId && tables.billingAccount.some(other => other !== row && other.templateId === row.templateId && other.period === row.period)) return ['templateId', 'period'];
  }
  return null;
};
function model(table) {
  const defaults = () => ({ id: newId(), createdAt: new Date(), updatedAt: new Date() });
  const find = where => tables[table].filter(row => matches(table, row, where));
  return {
    findMany: async args => { let rows = orderRows(find(args?.where), args?.orderBy); if (args?.skip) rows = rows.slice(args.skip); if (args?.take) rows = rows.slice(0, args.take); return rows.map(row => project(table, row, args)); },
    findFirst: async args => project(table, orderRows(find(args?.where), args?.orderBy)[0] || null, args),
    findUnique: async args => project(table, find(args.where)[0] || null, args),
    findUniqueOrThrow: async args => { const row = find(args.where)[0]; if (!row) throw new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: 'test' }); return project(table, row, args); },
    findFirstOrThrow: async args => { const row = orderRows(find(args?.where), args?.orderBy)[0]; if (!row) throw new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: 'test' }); return project(table, row, args); },
    count: async args => find(args?.where).length,
    aggregate: async args => { const rows = find(args?.where); const out = {}; if (args?._count) out._count = { _all: rows.length }; if (args?._sum) out._sum = Object.fromEntries(Object.keys(args._sum).map(key => [key, rows.length ? rows.reduce((sum, row) => sum + Number(row[key] || 0), 0) : null])); return out; },
    create: async args => {
      const row = { ...defaults(), ...(table === 'quote' ? { number: tables.quote.length + 1 } : {}), ...(table === 'product' || table === 'tax' || table === 'billingTemplate' ? { active: true } : {}), ...(table === 'billingAccount' ? { status: 'ISSUED', publicEnabled: true, issuedAt: new Date() } : {}), ...(table === 'serviceRecord' ? { revision: 1 } : {}) };
      applyData(table, row, args.data);
      const violation = uniqueViolation(table, row);
      if (violation) throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test', meta: { target: violation } });
      tables[table].push(row);
      return project(table, row, args);
    },
    update: async args => { const row = find(args.where)[0]; if (!row) throw new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: 'test' }); applyData(table, row, args.data); return project(table, row, args); },
    updateMany: async args => { const rows = find(args.where); rows.forEach(row => applyData(table, row, args.data)); return { count: rows.length }; },
    upsert: async args => { const row = find(args.where)[0]; if (row) { applyData(table, row, args.update); return row; } return model(table).create({ data: { ...args.where, ...args.create } }); },
    deleteMany: async args => { const rows = find(args?.where); tables[table] = tables[table].filter(row => !rows.includes(row)); return { count: rows.length }; },
  };
}
const db = Object.fromEntries(Object.keys(tables).map(table => [table, model(table)]));
db.$transaction = async fn => fn(db);
// The numbering UPSERT used by issueBillingAccount, emulated on the sequence table.
db.$queryRaw = async (first, ...rest) => {
  // Tagged template (prisma.$queryRaw`...`) or a Prisma.sql object (prisma.$queryRaw(Prisma.sql`...`)).
  const strings = first && first.strings ? first.strings : first, values = first && first.strings ? first.values : rest;
  const sql = strings.join('?');
  if (sql.includes('CustomerBillingSequence')) {
    const [customerId, start] = values;
    let row = tables.customerBillingSequence.find(sequence => sequence.customerId === customerId);
    if (row) row.lastNumber += 1; else { row = { customerId, lastNumber: start }; tables.customerBillingSequence.push(row); }
    return [{ lastNumber: row.lastNumber }];
  }
  // Schedule events with a fare (lib/fares.ts): date range for the report, cutoff date for payments.
  if (sql.includes('FROM "ServiceRecord"')) {
    const rows = tables.serviceRecord.filter(r => r.kind === 'schedule' && (r.payload.fareCents || 0) > 0);
    if (sql.includes("'date' >= ?")) { const [from, to] = values; return rows.filter(r => r.payload.date >= from && r.payload.date <= to).map(r => ({ id: r.id, revision: r.revision, payload: r.payload })); }
    const [until] = values; return rows.filter(r => r.payload.date <= until && (r.payload.fareStatus || 'pending') !== 'paid').map(r => ({ id: r.id, revision: r.revision, payload: r.payload }));
  }
  throw new Error(`Unexpected raw query: ${sql}`);
};

// ---------------------------------------------------------------------------
// Module wiring: fake session and prisma, real route handlers and libraries.
// ---------------------------------------------------------------------------
let sessionUserId = 'accounting';
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@/lib/prisma') return { prisma: db };
  if (request === '@/lib/dashboard-data') return { getDashboardSession: async () => sessionUserId ? { user: { id: sessionUserId } } : null, getDashboardUser: async () => null };
  if (request === '@/lib/email') return { sendEmail: async () => ({ success: true, messageId: 'test' }), escapeHtml: value => String(value ?? '') };
  if (request === '@/lib/order-email') return { brandLogo: async () => undefined };
  if (request === '@/lib/support/server') {
    // Unexpected (non-ServiceError) failures are printed so a 503 in a test is diagnosable.
    const real = originalLoad.call(this, path.join(__dirname, '..', 'lib/support/server'), parent, isMain);
    const serviceUser = async () => { const user = tables.user.find(u => u.id === sessionUserId); if (!user) throw new real.ServiceError('No autorizado', 401); if (user.role === 'CUSTOMER') throw new real.ServiceError('Acceso restringido', 403); return user; };
    return { ...real, serviceUser, serviceError: error => { if (!(error instanceof real.ServiceError)) console.error('[unexpected]', error); return real.serviceError(error); } };
  }
  if (request.startsWith('@/')) request = path.join(__dirname, '..', request.slice(2));
  return originalLoad.call(this, request, parent, isMain);
};
const products = require('../app/api/products/route.ts');
const productById = require('../app/api/products/[id]/route.ts');
const taxes = require('../app/api/taxes/route.ts');
const quotes = require('../app/api/quotes/route.ts');
const quoteById = require('../app/api/quotes/[id]/route.ts');
const quotePdf = require('../app/api/quotes/[id]/pdf/route.ts');
const quoteEmail = require('../app/api/quotes/[id]/email/route.ts');
const billing = require('../app/api/billing/route.ts');
const billingById = require('../app/api/billing/[id]/route.ts');
const billingLink = require('../app/api/billing/[id]/link/route.ts');
const billingPdf = require('../app/api/billing/[id]/pdf/route.ts');
const publicBilling = require('../app/api/public/billing/[token]/route.ts');
const templates = require('../app/api/billing/templates/route.ts');
const generate = require('../app/api/billing/templates/generate/route.ts');
const schedule = require('../app/api/schedule/route.ts');
const fares = require('../app/api/fares/route.ts');
const fareById = require('../app/api/fares/[id]/route.ts');
const farePay = require('../app/api/fares/pay/route.ts');
const fareExport = require('../app/api/fares/export/route.ts');
const productExport = require('../app/api/products/export/route.ts');
const productImport = require('../app/api/products/import/route.ts');
const productTemplate = require('../app/api/products/import/template/route.ts');
const { xlsx: buildXlsx } = require('../lib/xlsx.ts');
const { readXlsx } = require('../lib/xlsx-read.ts');

const json = (url, method, body) => new Request(`http://localhost${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = id => ({ params: { id, token: id } });

tables.user.push(
  { id: 'admin', name: 'Admin', email: 'admin@test', role: 'ADMIN', active: true },
  { id: 'accounting', name: 'Conta', email: 'conta@test', role: 'ACCOUNTING', active: true, jobTitle: 'Asistente contable', phone: '317 000 0000' },
  { id: 'agent', name: 'Agente', email: 'agent@test', role: 'AGENT', active: true },
  { id: 'customer-a', name: 'Cliente A', email: 'a@test', role: 'CUSTOMER', active: true, businessName: 'A SAS', taxId: '900.1', billingStartNumber: 1, emailNotifications: true },
  { id: 'customer-b', name: 'Cliente B', email: null, role: 'CUSTOMER', active: true, businessName: null, taxId: null, billingStartNumber: 50, emailNotifications: true },
);

(async () => {
  // Authorization: Contabilidad and administrators pass; agents, customers and anonymous are rejected.
  sessionUserId = null; assert.equal((await products.GET(json('/api/products', 'GET'))).status, 401);
  for (const denied of ['agent', 'customer-a']) {
    sessionUserId = denied;
    // The product list is shared with Inventario, so agents may read it; the accounting modules stay closed.
    assert.equal((await products.GET(json('/api/products', 'GET'))).status, denied === 'agent' ? 200 : 403);
    assert.equal((await quotes.POST(json('/api/quotes', 'POST', {}))).status, 403);
    assert.equal((await billing.POST(json('/api/billing', 'POST', {}))).status, 403);
    assert.equal((await templates.GET(json('/api/billing/templates', 'GET'))).status, 403);
  }
  for (const allowed of ['admin', 'accounting']) { sessionUserId = allowed; assert.equal((await products.GET(json('/api/products', 'GET'))).status, 200); }
  // Contabilidad is not an administrator: pages and routes guarded by isAdmin stay closed to it.
  const rolesLib = require('../lib/roles.ts');
  assert.ok(!rolesLib.isAdmin('ACCOUNTING') && rolesLib.isStaff('ACCOUNTING') && rolesLib.canUseAccounting('ACCOUNTING'));
  sessionUserId = 'accounting';

  // Catalog: products are never deleted, duplicates are rejected, inactive ones are hidden from quotes.
  assert.equal(products.DELETE, undefined); assert.equal(productById.DELETE, undefined); assert.equal(taxes.DELETE, undefined);
  let response = await products.POST(json('/api/products', 'POST', { name: 'Impresora POS', description: 'Puerto de red 80mm', price: 520000, loanable: true }));
  assert.equal(response.status, 201); const printer = await response.json(); assert.equal(printer.price, 520000); assert.equal(printer.loanable, true, 'loan equipment flag stored');
  assert.equal((await products.POST(json('/api/products', 'POST', { name: 'impresora pos', price: 1 }))).status, 409);
  assert.equal((await (await products.POST(json('/api/products', 'POST', { name: 'Cable HDMI', price: 25000 }))).json()).loanable, false, 'not loanable by default');
  assert.equal((await products.POST(json('/api/products', 'POST', { name: 'Cable', price: -5 }))).status, 400);
  response = await products.POST(json('/api/products', 'POST', { name: 'Producto viejo', price: 1000 })); const old = await response.json();
  assert.equal((await productById.PATCH(json(`/api/products/${old.id}`, 'PATCH', { active: false }), ctx(old.id))).status, 200);
  assert.deepEqual((await (await products.GET(json('/api/products?active=1', 'GET'))).json()).map(p => p.name), ['Cable HDMI', 'Impresora POS']);
  assert.equal((await (await products.GET(json('/api/products', 'GET'))).json()).length, 3);

  // Taxes: IVA 19 % seeded and default; only one default at a time.
  let taxList = await (await taxes.GET(json('/api/taxes', 'GET'))).json();
  assert.equal(taxList.length, 1); assert.equal(taxList[0].rate, 19); assert.ok(taxList[0].isDefault);
  response = await taxes.POST(json('/api/taxes', 'POST', { name: 'IVA 5%', rate: 5, isDefault: true })); assert.equal(response.status, 201);
  taxList = await (await taxes.GET(json('/api/taxes', 'GET'))).json();
  assert.deepEqual(taxList.map(tax => [tax.name, tax.isDefault]), [['IVA 5%', true], ['IVA 19%', false]]);
  const iva19 = taxList.find(tax => tax.name === 'IVA 19%');

  // Quotes: totals in cents, edited price does not touch the catalog, snapshots frozen, inactive product rejected.
  response = await quotes.POST(json('/api/quotes', 'POST', { customerId: 'customer-a', taxId: iva19.id, items: [{ productId: printer.id, name: 'Impresora POS', description: 'Puerto de red 80mm', quantity: 1, unitPrice: 500000 }, { name: 'Instalación', quantity: 2, unitPrice: 30000.5 }] }));
  assert.equal(response.status, 201); const quote = await response.json();
  assert.equal(quote.numberLabel, 'COT-0001'); assert.equal(quote.subtotalCents, 56000100); assert.equal(quote.taxCents, 10640019); assert.equal(quote.totalCents, 66640119);
  assert.equal(quote.taxName, 'IVA 19%'); assert.equal(quote.taxRate, 19);
  assert.equal(quote.items[0].unitPrice, 500000, 'quote keeps the edited price');
  assert.equal((await (await products.GET(json('/api/products', 'GET'))).json()).find(p => p.id === printer.id).price, 520000, 'catalog price untouched');
  assert.equal(quote.snapshotCustomer.businessName, 'A SAS'); assert.equal(quote.snapshotCustomer.taxId, '900.1');
  assert.equal((await quotes.POST(json('/api/quotes', 'POST', { customerId: 'customer-a', taxId: null, items: [{ productId: old.id, name: 'Viejo', quantity: 1, unitPrice: 1 }] }))).status, 400, 'inactive product');
  assert.equal((await quotes.POST(json('/api/quotes', 'POST', { customerId: 'customer-a', items: [] }))).status, 400);
  assert.equal((await quotes.POST(json('/api/quotes', 'POST', { customerId: 'agent', items: [{ name: 'x', quantity: 1, unitPrice: 1 }] }))).status, 400, 'only customers');
  response = await quotes.POST(json('/api/quotes', 'POST', { customerId: 'customer-b', taxId: null, items: [{ name: 'Sin impuesto', quantity: 3, unitPrice: 10000 }] }));
  const noTax = await response.json(); assert.equal(noTax.taxCents, 0); assert.equal(noTax.totalCents, 3000000); assert.equal(noTax.taxName, null);
  // Editing the catalog afterwards leaves the quote untouched.
  await productById.PATCH(json(`/api/products/${printer.id}`, 'PATCH', { price: 999, name: 'Renombrado' }), ctx(printer.id));
  const stored = await (await quoteById.GET(json(`/api/quotes/${quote.id}`, 'GET'), ctx(quote.id))).json();
  assert.equal(stored.items[0].name, 'Impresora POS'); assert.equal(stored.items[0].unitPrice, 500000);
  const list = await (await quotes.GET(json('/api/quotes?q=COT-0001', 'GET'))).json(); assert.equal(list.total, 1);
  assert.equal(list.quotes[0].createdBy.name, 'Conta', 'creator name attached to each row');
  assert.equal((await (await quotes.GET(json('/api/quotes?createdBy=accounting', 'GET'))).json()).total, 2);
  assert.equal((await (await quotes.GET(json('/api/quotes?createdBy=admin', 'GET'))).json()).total, 0);
  // Editing replaces lines, totals and customer; number, date and signer are kept.
  response = await quoteById.PUT(json(`/api/quotes/${quote.id}`, 'PUT', { customerId: 'customer-b', taxId: null, notes: 'Editada', items: [{ name: 'Nuevo ítem', quantity: 2, unitPrice: 1000 }] }), ctx(quote.id));
  assert.equal(response.status, 200); const edited = await response.json();
  assert.equal(edited.numberLabel, 'COT-0001'); assert.equal(edited.createdAt, quote.createdAt); assert.equal(edited.customer.id, 'customer-b');
  assert.equal(edited.items.length, 1); assert.equal(edited.items[0].name, 'Nuevo ítem'); assert.equal(edited.subtotalCents, 200000); assert.equal(edited.taxCents, 0); assert.equal(edited.totalCents, 200000); assert.equal(edited.notes, 'Editada');
  assert.equal(edited.issuer.name, 'Conta'); assert.equal(tables.quoteItem.filter(item => item.quoteId === quote.id).length, 1, 'old lines removed');
  assert.equal((await quoteById.PUT(json('/api/quotes/nope', 'PUT', { customerId: 'customer-b', items: [{ name: 'x', quantity: 1, unitPrice: 1 }] }), ctx('nope'))).status, 404);
  assert.equal((await quoteById.PUT(json(`/api/quotes/${quote.id}`, 'PUT', { customerId: 'customer-b', items: [] }), ctx(quote.id))).status, 400);
  // Restore the original content so the later assertions keep their expectations.
  await quoteById.PUT(json(`/api/quotes/${quote.id}`, 'PUT', { customerId: 'customer-a', taxId: iva19.id, items: [{ productId: printer.id, name: 'Impresora POS', description: 'Puerto de red 80mm', quantity: 1, unitPrice: 500000 }, { name: 'Instalación', quantity: 2, unitPrice: 30000.5 }] }), ctx(quote.id));
  // Signer: the user who created the quote (name, job title, email, phone) is frozen with the document.
  assert.deepEqual(stored.issuer, { id: 'accounting', name: 'Conta', jobTitle: 'Asistente contable', email: 'conta@test', phone: '317 000 0000' });
  assert.equal(stored.registered, true);
  // Unregistered customer: a typed name is enough; no customer row, no email to send to.
  response = await quotes.POST(json('/api/quotes', 'POST', { customerName: 'Tienda Nueva', taxId: null, items: [{ name: 'Visita', quantity: 1, unitPrice: 50000 }] }));
  assert.equal(response.status, 201); const free = await response.json();
  assert.equal(free.customerId, null); assert.equal(free.registered, false); assert.equal(free.customer.name, 'Tienda Nueva'); assert.equal(free.customer.email, null);
  assert.equal((await quotePdf.GET(json(`/api/quotes/${free.id}/pdf`, 'GET'), ctx(free.id))).status, 200);
  assert.equal((await quotes.POST(json('/api/quotes', 'POST', { customerName: '   ', items: [{ name: 'x', quantity: 1, unitPrice: 1 }] }))).status, 400, 'a name or a customer is required');
  // Unregistered customer with an email: the quote can be sent to it; without one it is skipped.
  let sent = await (await quoteEmail.POST(json(`/api/quotes/${free.id}/email`, 'POST'), ctx(free.id))).json(); assert.equal(sent.email.status, 'skipped');
  response = await quotes.POST(json('/api/quotes', 'POST', { customerName: 'Tienda con correo', customerEmail: 'Tienda@Ejemplo.com', items: [{ name: 'Visita', quantity: 1, unitPrice: 50000 }] }));
  const withEmail = await response.json(); assert.equal(withEmail.customer.email, 'tienda@ejemplo.com');
  sent = await (await quoteEmail.POST(json(`/api/quotes/${withEmail.id}/email`, 'POST'), ctx(withEmail.id))).json(); assert.equal(sent.email.status, 'sent'); assert.equal(sent.email.recipient, 'tienda@ejemplo.com');
  assert.equal((await quotes.POST(json('/api/quotes', 'POST', { customerName: 'Mal correo', customerEmail: 'no-es-correo', items: [{ name: 'x', quantity: 1, unitPrice: 1 }] }))).status, 400);
  assert.equal((await (await quotes.GET(json('/api/quotes?q=Tienda', 'GET'))).json()).total, 2, 'unregistered names are searchable');
  const pdf = await quotePdf.GET(json(`/api/quotes/${quote.id}/pdf`, 'GET'), ctx(quote.id));
  assert.equal(pdf.headers.get('Content-Type'), 'application/pdf'); assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  assert.equal((await quoteById.GET(json('/api/quotes/nope', 'GET'), ctx('nope'))).status, 404);

  // Billing accounts: only customer, concept and total; numbering per customer; void keeps the number.
  response = await billing.POST(json('/api/billing', 'POST', { customerId: 'customer-a', concept: 'Adaptador y cable de red', total: 176000 }));
  assert.equal(response.status, 201); const account = await response.json();
  assert.equal(account.numberLabel, '01'); assert.equal(account.totalCents, 17600000); assert.equal(account.amountInWords, 'Ciento setenta y seis mil pesos m/c');
  assert.ok(account.publicUrl && account.publicUrl.includes('/api/public/billing/') && !account.publicUrl.includes(account.id));
  const second = await (await billing.POST(json('/api/billing', 'POST', { customerId: 'customer-a', concept: 'Segunda', total: 1 }))).json(); assert.equal(second.numberLabel, '02');
  const other = await (await billing.POST(json('/api/billing', 'POST', { customerId: 'customer-b', concept: 'Inicio en 50', total: 1 }))).json(); assert.equal(other.numberLabel, '50');
  assert.equal((await billing.POST(json('/api/billing', 'POST', { customerId: 'customer-a', concept: '', total: 1 }))).status, 400);
  assert.equal((await billing.POST(json('/api/billing', 'POST', { customerId: 'customer-a', concept: 'x', total: -1 }))).status, 400);
  assert.equal((await billing.POST(json('/api/billing', 'POST', { customerId: 'agent', concept: 'x', total: 1 }))).status, 400);
  // Public link: token only, disabled links stop working, regeneration invalidates the old token.
  const token = new URL(account.publicUrl, 'http://localhost').pathname.split('/').pop();
  let publicPdf = await publicBilling.GET(json(`/api/public/billing/${token}`, 'GET'), { params: { token } });
  assert.equal(publicPdf.status, 200); assert.equal(publicPdf.headers.get('Content-Type'), 'application/pdf');
  assert.equal((await publicBilling.GET(json('/api/public/billing/wrong', 'GET'), { params: { token: 'wrong' } })).status, 404);
  assert.equal((await publicBilling.GET(json(`/api/public/billing/${account.id}`, 'GET'), { params: { token: account.id } })).status, 404, 'ids are not accepted');
  response = await billingLink.POST(json(`/api/billing/${account.id}/link`, 'POST', { action: 'disable' }), ctx(account.id)); assert.equal(response.status, 200);
  assert.equal((await response.json()).publicUrl, null);
  assert.equal((await publicBilling.GET(json(`/api/public/billing/${token}`, 'GET'), { params: { token } })).status, 404);
  response = await billingLink.POST(json(`/api/billing/${account.id}/link`, 'POST', { action: 'enable' }), ctx(account.id)); assert.equal(response.status, 200);
  response = await billingLink.POST(json(`/api/billing/${account.id}/link`, 'POST', { action: 'regenerate' }), ctx(account.id));
  const regenerated = new URL((await response.json()).publicUrl, 'http://localhost').pathname.split('/').pop();
  assert.notEqual(regenerated, token);
  assert.equal((await publicBilling.GET(json(`/api/public/billing/${token}`, 'GET'), { params: { token } })).status, 404);
  assert.equal((await publicBilling.GET(json(`/api/public/billing/${regenerated}`, 'GET'), { params: { token: regenerated } })).status, 200);
  // Staff PDF and void.
  const staffPdf = await billingPdf.GET(json(`/api/billing/${account.id}/pdf`, 'GET'), ctx(account.id)); assert.equal(staffPdf.status, 200);
  response = await billingById.PATCH(json(`/api/billing/${account.id}`, 'PATCH', { action: 'void', reason: 'Error en el valor' }), ctx(account.id)); assert.equal(response.status, 200);
  assert.equal((await billingById.PATCH(json(`/api/billing/${account.id}`, 'PATCH', { action: 'void' }), ctx(account.id))).status, 409);
  const voided = await (await billingById.GET(json(`/api/billing/${account.id}`, 'GET'), ctx(account.id))).json(); assert.equal(voided.status, 'VOID'); assert.equal(voided.numberLabel, '01');
  const third = await (await billing.POST(json('/api/billing', 'POST', { customerId: 'customer-a', concept: 'Tras anular', total: 1 }))).json(); assert.equal(third.numberLabel, '03', 'voided numbers are not reused');
  const accounts = await (await billing.GET(json('/api/billing?customer=customer-a', 'GET'))).json(); assert.equal(accounts.total, 3);
  // Totals of the filtered list: voided accounts are counted apart and excluded from the issued amount.
  assert.deepEqual(accounts.totals, { count: 3, issuedCount: 2, voidCount: 1, issuedCents: 200, voidCents: 17600000 });
  assert.equal(accounts.accounts[0].createdBy.name, 'Conta');
  assert.equal((await (await billing.GET(json('/api/billing?createdBy=admin', 'GET'))).json()).total, 0);
  assert.equal((await (await billing.GET(json('/api/billing?createdBy=accounting', 'GET'))).json()).totals.count, 4);
  assert.ok(accounts.accounts.every(item => /^\d+$/.test(item.numberLabel)));

  // Recurring templates: no numbers consumed until generated, one per period, selectable generation with per-item results.
  response = await templates.POST(json('/api/billing/templates', 'POST', { customerId: 'customer-a', concept: 'Mantenimiento mensual', total: 250000, frequency: 'MONTHLY', active: true }));
  assert.equal(response.status, 201); const template = await response.json();
  response = await templates.POST(json('/api/billing/templates', 'POST', { customerId: 'customer-b', concept: 'Hosting', total: 90000 })); const templateB = await response.json();
  assert.equal(tables.customerBillingSequence.find(s => s.customerId === 'customer-a').lastNumber, 3, 'templates do not consume numbers');
  response = await generate.POST(json('/api/billing/templates/generate', 'POST', { templateIds: [template.id, templateB.id], period: '2026-11' }));
  assert.equal(response.status, 200); let results = (await response.json()).results;
  assert.deepEqual(results.map(r => [r.status, r.number]), [['generated', '04'], ['generated', '51']]);
  results = (await (await generate.POST(json('/api/billing/templates/generate', 'POST', { templateIds: [template.id, templateB.id, 'missing'], period: '2026-11' }))).json()).results;
  assert.deepEqual(results.map(r => r.status), ['duplicate', 'duplicate', 'error']);
  results = (await (await generate.POST(json('/api/billing/templates/generate', 'POST', { templateIds: [template.id], period: '2026-10' }))).json()).results;
  assert.equal(results[0].status, 'generated'); assert.equal(results[0].number, '05');
  assert.equal((await generate.POST(json('/api/billing/templates/generate', 'POST', { templateIds: [], period: '2026-10' }))).status, 400);
  assert.equal((await generate.POST(json('/api/billing/templates/generate', 'POST', { templateIds: [template.id], period: '2099-01' }))).status, 400, 'future periods are rejected');
  assert.equal((await generate.POST(json('/api/billing/templates/generate', 'POST', { templateIds: [template.id], period: '2026-13' }))).status, 400);
  const listed = await (await templates.GET(json('/api/billing/templates?period=2026-11', 'GET'))).json();
  const row = listed.templates.find(item => item.id === template.id);
  assert.equal(row.generated.numberLabel, '04'); assert.equal(listed.templates.find(item => item.id === templateB.id).generated.numberLabel, '51');
  assert.equal((await (await templates.GET(json('/api/billing/templates?period=2027-01', 'GET'))).json()).templates.find(item => item.id === template.id).generated, null);
  assert.equal(templates.DELETE, undefined);

  // Pasajes: entered on events, reported, accepted, paid in bulk and frozen afterwards.
  sessionUserId = 'agent';
  const event = { title: 'Visita cliente', techId: 'agent', techIds: ['agent'], clientId: 'customer-a', date: '2026-11-03', start: '08:00', status: 'planned', description: '' };
  assert.equal((await schedule.POST(json('/api/schedule', 'POST', { ...event, fareCents: 1200000 }))).status, 400, 'a fare needs its reason');
  response = await schedule.POST(json('/api/schedule', 'POST', { ...event, fareCents: 1200000, fareReason: 'Transporte ida y vuelta', fareStatus: 'paid' }));
  assert.equal(response.status, 200); const eventId = (await response.json()).id;
  let record = tables.serviceRecord.find(r => r.id === eventId);
  assert.equal(record.payload.fareCents, 1200000); assert.equal(record.payload.fareStatus, 'pending', 'client cannot set the status');
  await schedule.POST(json('/api/schedule', 'POST', { ...event, date: '2026-11-05', fareCents: 800000, fareReason: 'Taxi' }));
  await schedule.POST(json('/api/schedule', 'POST', { ...event, date: '2026-11-20', fareCents: 500000, fareReason: 'Bus' }));
  await schedule.POST(json('/api/schedule', 'POST', { ...event, date: '2026-11-21' }));
  // Every staff member opens the report, but agents only see their own fares (the tech filter is ignored).
  await schedule.POST(json('/api/schedule', 'POST', { ...event, techId: 'accounting', techIds: ['accounting'], date: '2026-12-02', fareCents: 300000, fareReason: 'Otro técnico' }));
  let own = await (await fares.GET(json('/api/fares?from=2026-11-01&to=2026-12-31&tech=accounting', 'GET'))).json();
  assert.equal(own.canManage, false); assert.equal(own.fares.length, 3); assert.ok(own.fares.every(row => row.technicians.some(t => t.id === 'agent')), 'agents see only their fares');
  assert.deepEqual(own.technicians, []);
  sessionUserId = 'accounting';
  own = await (await fares.GET(json('/api/fares?from=2026-12-01&to=2026-12-31', 'GET'))).json();
  assert.equal(own.canManage, true); assert.equal(own.fares.length, 1, 'accounting sees everyone');
  let report = await (await fares.GET(json('/api/fares?from=2026-11-01&to=2026-11-30', 'GET'))).json();
  assert.equal(report.fares.length, 3); assert.equal(report.totals.totalCents, 2500000); assert.equal(report.totals.pendingCents, 2500000); assert.equal(report.paidUntil, null);
  assert.equal((await (await fares.GET(json('/api/fares?from=2026-11-01&to=2026-11-04', 'GET'))).json()).totals.count, 1);
  // Only administration and accounting manage fares.
  sessionUserId = 'agent';
  assert.equal((await fareById.POST(json(`/api/fares/${eventId}`, 'POST', { action: 'accept', revision: record.revision }), ctx(eventId))).status, 403);
  assert.equal((await farePay.POST(json('/api/fares/pay', 'POST', { until: '2026-11-05' }))).status, 403);
  sessionUserId = 'accounting';
  assert.equal((await fareById.POST(json(`/api/fares/${eventId}`, 'POST', { action: 'accept', revision: record.revision }), ctx(eventId))).status, 200);
  record = tables.serviceRecord.find(r => r.id === eventId); assert.equal(record.payload.fareStatus, 'accepted');
  const laterFare = tables.serviceRecord.find(r => r.payload.date === '2026-11-20');
  assert.equal((await fareById.POST(json(`/api/fares/${laterFare.id}`, 'POST', { action: 'remove', revision: laterFare.revision }), ctx(laterFare.id))).status, 200);
  assert.equal(tables.serviceRecord.find(r => r.id === laterFare.id).payload.fareCents, null, 'removed fare');
  assert.equal((await farePay.POST(json('/api/fares/pay', 'POST', { until: '2099-01-01' }))).status, 400, 'no future cutoffs');
  response = await farePay.POST(json('/api/fares/pay', 'POST', { until: '2026-11-05' })); assert.equal(response.status, 200);
  const paid = await response.json(); assert.equal(paid.count, 2); assert.equal(paid.totalCents, 2000000); assert.equal(paid.paidUntil, '2026-11-05');
  report = await (await fares.GET(json('/api/fares?from=2026-11-01&to=2026-11-30', 'GET'))).json();
  assert.equal(report.paidUntil, '2026-11-05'); assert.equal(report.totals.paidCents, 2000000); assert.equal(report.totals.pendingCents, 0);
  assert.equal((await fareById.POST(json(`/api/fares/${eventId}`, 'POST', { action: 'remove', revision: tables.serviceRecord.find(r => r.id === eventId).revision }), ctx(eventId))).status, 409, 'paid fares cannot be removed');
  // Frozen: events up to the cutoff cannot change their fare, but the rest of the event can still be edited.
  sessionUserId = 'agent';
  record = tables.serviceRecord.find(r => r.id === eventId);
  assert.equal((await schedule.POST(json('/api/schedule', 'POST', { ...record.payload, id: eventId, revision: record.revision, fareCents: 999900 }))).status, 400);
  assert.equal((await schedule.POST(json('/api/schedule', 'POST', { ...record.payload, id: eventId, revision: record.revision, title: 'Visita reprogramada' }))).status, 200);
  record = tables.serviceRecord.find(r => r.id === eventId); assert.equal(record.payload.fareStatus, 'paid'); assert.equal(record.payload.title, 'Visita reprogramada');
  assert.equal((await schedule.POST(json('/api/schedule', 'POST', { ...event, date: '2026-11-04', fareCents: 100, fareReason: 'x' }))).status, 400, 'no new fares before the cutoff');
  assert.equal((await schedule.POST(json('/api/schedule', 'POST', { ...event, date: '2026-11-06', fareCents: 100, fareReason: 'x' }))).status, 200, 'after the cutoff fares are allowed');
  assert.equal((await fareExport.GET(json('/api/fares/export?from=2026-11-01&to=2026-11-30', 'GET'))).status, 200, 'agents export their own fares');
  sessionUserId = 'accounting';
  const sheet = await fareExport.GET(json('/api/fares/export?from=2026-11-01&to=2026-11-30', 'GET'));
  assert.equal(sheet.status, 200); assert.ok(sheet.headers.get('Content-Type').includes('spreadsheetml'));
  assert.equal(Buffer.from(await sheet.arrayBuffer()).subarray(0, 2).toString(), 'PK');
  sessionUserId = 'accounting';

  // Catalog <-> Excel: round trip, template examples ignored, create/update by name, apply.
  sessionUserId = 'accounting';
  const exported = await productExport.GET(); assert.equal(exported.status, 200);
  const exportedRows = readXlsx(Buffer.from(await exported.arrayBuffer()));
  assert.deepEqual(exportedRows[0], ['Nombre', 'Descripción', 'Precio sugerido', 'Activo', 'Equipo de préstamo', 'Existencias']);
  assert.ok(exportedRows.some(row => row[0] === 'Renombrado' && row[2] === 999 && row[4] === 'Sí'), 'exported products keep price and loan flag');
  const templateFile = Buffer.from(await (await productTemplate.GET()).arrayBuffer());
  const upload = (buffer, name = 'productos.xlsx') => { const form = new FormData(); form.append('file', new File([buffer], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); return new Request('http://localhost/api/products/import', { method: 'POST', body: form }); };
  let plan = await (await productImport.POST(upload(templateFile))).json();
  assert.equal(plan.summary.create + plan.summary.update, 0, 'template examples are never imported');
  assert.ok(plan.rows.filter(r => r.message === 'Fila de ejemplo o instrucciones').length >= 3);
  const workbook = buildXlsx({ name: 'Productos', columns: [{ header: 'Nombre' }, { header: 'Descripción' }, { header: 'Precio sugerido' }, { header: 'Activo' }, { header: 'Equipo de préstamo' }], rows: [
    ['Monitor táctil 15"', 'Pantalla POS', 1250000, 'Sí', 'Sí'],
    ['renombrado', 'Precio nuevo', 1000, 'No', ''],
    ['Cable HDMI', '', 25000, 'Sí', 'No'],
    ['', '', 10, '', ''],
    ['Sin precio', 'x', '', '', ''],
    ['Monitor táctil 15"', 'duplicado', 1, '', ''],
  ] });
  plan = await (await productImport.POST(upload(workbook))).json();
  assert.deepEqual(plan.rows.map(r => r.action), ['create', 'update', 'skip', 'error', 'error', 'error']);
  assert.deepEqual(plan.rows[1].changes, ['descripción', 'precio', 'desactivar']);
  assert.equal((await productImport.POST(upload(Buffer.from('not a workbook'), 'x.xlsx'))).status, 400);
  assert.equal((await productImport.POST(upload(workbook, 'productos.csv'))).status, 400);
  response = await productImport.PUT(json('/api/products/import', 'PUT', { rows: plan.rows })); assert.equal(response.status, 200);
  const applied = await response.json(); assert.equal(applied.created, 1); assert.equal(applied.updated, 1);
  const monitor = tables.product.find(p => p.name === 'Monitor táctil 15"'); assert.ok(monitor && monitor.loanable === true && Number(monitor.price) === 1250000);
  const renamed = tables.product.find(p => p.name === 'Renombrado'); assert.equal(renamed.active, false); assert.equal(Number(renamed.price), 1000);
  sessionUserId = 'agent'; assert.equal((await productImport.POST(upload(workbook))).status, 403, 'import is accounting-only'); sessionUserId = 'accounting';

  console.log('PASS: authorization for Contabilidad/administrators, catalog without deletion, default tax, quote totals and frozen snapshots, per-customer numbering, void without reuse, public link token lifecycle, recurring templates with per-period duplicates and per-item results');
})().catch(error => { console.error(error); process.exitCode = 1; });
