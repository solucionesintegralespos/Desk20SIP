// Inventory stock movements and equipment loans against the real PostgreSQL database
// (DATABASE_URL from .env). Creates throw-away rows and removes them afterwards.
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
  if (request === '@/lib/dashboard-data') return { getDashboardSession: async () => null, getDashboardUser: async () => null };
  if (request.startsWith('@/')) request = path.join(__dirname, '..', request.slice(2));
  return originalLoad.call(this, request, parent, isMain);
};
const { prisma } = require('../lib/prisma.ts');
const stock = require('../lib/inventory/stock.ts');

const tag = `inventory-test-${Date.now()}`;
const ids = { products: [], users: [] };
async function cleanup() {
  await prisma.inventoryMovement.deleteMany({ where: { productId: { in: ids.products } } });
  await prisma.equipmentLoan.deleteMany({ where: { items: { some: { productId: { in: ids.products } } } } });
  await prisma.product.deleteMany({ where: { id: { in: ids.products } } });
  await prisma.serviceAuditEvent.deleteMany({ where: { actorId: tag } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
}
const move = input => prisma.$transaction(tx => stock.applyMovement(tx, { actorId: tag, ...input }));
(async () => {
  const product = await prisma.product.create({ data: { name: `${tag} Impresora`, price: 100000 } });
  ids.products.push(product.id);
  const customer = await prisma.user.create({ data: { name: `${tag} cliente`, email: `${tag}-c@example.test`, role: 'CUSTOMER' } });
  const tech = await prisma.user.create({ data: { name: `${tag} tecnico`, email: `${tag}-t@example.test`, role: 'AGENT' } });
  ids.users.push(customer.id, tech.id);

  // Purchases and entries add; write-offs subtract; the kardex keeps the running balance.
  assert.equal((await move({ productId: product.id, type: 'PURCHASE', quantity: 5, unitCostCents: 8000000, reference: 'Factura 1' })).stock, 5);
  assert.equal((await move({ productId: product.id, type: 'ENTRY', quantity: 2 })).stock, 7);
  assert.equal((await move({ productId: product.id, type: 'WRITE_OFF', quantity: 1, notes: 'Dañada' })).stock, 6);
  // A physical count records the difference, not the counted value.
  const count = await move({ productId: product.id, type: 'COUNT', quantity: 4 });
  assert.equal(count.stock, 4); assert.equal(count.movement.quantity, -2); assert.equal(count.movement.countedQuantity, 4);
  // Never below zero.
  await assert.rejects(move({ productId: product.id, type: 'WRITE_OFF', quantity: 10 }), /Existencias insuficientes/);
  assert.equal((await prisma.product.findUnique({ where: { id: product.id } })).stock, 4);

  // Ten simultaneous write-offs of one unit on four units: exactly four succeed, stock ends at zero.
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => move({ productId: product.id, type: 'WRITE_OFF', quantity: 1 })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 4);
  assert.equal((await prisma.product.findUnique({ where: { id: product.id } })).stock, 0);
  const kardex = await prisma.inventoryMovement.findMany({ where: { productId: product.id }, orderBy: { createdAt: 'asc' } });
  assert.equal(kardex.length, 8);
  assert.equal(kardex[kardex.length - 1].balanceAfter, 0);

  // Loans: one exit order with several pieces of equipment discounts each stock; the return restores all of them
  // and closes the order; an order cannot be returned twice; a return always needs an existing exit order.
  const cable = await prisma.product.create({ data: { name: `${tag} Cable`, price: 1000, stock: 5 } });
  ids.products.push(cable.id);
  await move({ productId: product.id, type: 'ENTRY', quantity: 3 });
  const loan = await prisma.$transaction(tx => stock.issueLoan(tx, { items: [{ productId: product.id, quantity: 2 }, { productId: cable.id, quantity: 4 }], customerId: customer.id, technicianId: tech.id, notes: 'Demo', photos: ['/uploads/foto-1.jpg'] }, tag));
  assert.equal(loan.status, 'OUT'); assert.ok(loan.number >= 1);
  const items = await prisma.equipmentLoanItem.findMany({ where: { loanId: loan.id }, orderBy: { position: 'asc' } });
  assert.deepEqual(items.map(item => [item.productId, item.quantity]), [[product.id, 2], [cable.id, 4]]);
  assert.equal((await prisma.product.findUnique({ where: { id: product.id } })).stock, 1);
  assert.equal((await prisma.product.findUnique({ where: { id: cable.id } })).stock, 1);
  // Insufficient stock on any line rolls the whole exit back (no partial orders).
  await assert.rejects(prisma.$transaction(tx => stock.issueLoan(tx, { items: [{ productId: cable.id, quantity: 1 }, { productId: product.id, quantity: 2 }], customerId: customer.id, technicianId: tech.id, notes: '', photos: [] }, tag)), /Existencias insuficientes/);
  assert.equal((await prisma.product.findUnique({ where: { id: cable.id } })).stock, 1, 'rolled back');
  assert.equal(await prisma.equipmentLoan.count({ where: { items: { some: { productId: { in: ids.products } } } } }), 1);
  await assert.rejects(prisma.$transaction(tx => stock.issueLoan(tx, { items: [{ productId: product.id, quantity: 1 }], customerId: tech.id, technicianId: tech.id, notes: '', photos: [] }, tag)), /cliente válido/);
  assert.equal(stock.loanOutSchema.safeParse({ items: [], customerId: 'c', technicianId: 't' }).success, false, 'at least one piece of equipment');
  assert.equal(stock.loanOutSchema.safeParse({ items: [{ productId: 'a', quantity: 1 }, { productId: 'a', quantity: 2 }], customerId: 'c', technicianId: 't' }).success, false, 'no duplicated products');
  assert.equal(stock.loanReturnSchema.safeParse({ notes: 'sin salida' }).success, false, 'a return requires its exit order');
  await assert.rejects(prisma.$transaction(tx => stock.returnLoan(tx, { loanId: 'missing-order', notes: '', photos: [] }, tag)), /no existe/);
  const returned = await prisma.$transaction(tx => stock.returnLoan(tx, { loanId: loan.id, notes: 'Todo bien', photos: ['/uploads/foto-2.jpg'] }, tag));
  assert.equal(returned.status, 'RETURNED'); assert.ok(returned.returnedAt); assert.deepEqual(returned.returnPhotos, ['/uploads/foto-2.jpg']);
  assert.equal((await prisma.product.findUnique({ where: { id: product.id } })).stock, 3);
  assert.equal((await prisma.product.findUnique({ where: { id: cable.id } })).stock, 5);
  await assert.rejects(prisma.$transaction(tx => stock.returnLoan(tx, { loanId: loan.id, notes: '', photos: [] }, tag)), /ya fue devuelta/);
  const loanMoves = await prisma.inventoryMovement.findMany({ where: { loanId: loan.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  assert.deepEqual(loanMoves.map(m => [m.type, m.productId === product.id ? 'printer' : 'cable', m.quantity]).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])), [['LOAN_IN', 'cable', 4], ['LOAN_IN', 'printer', 2], ['LOAN_OUT', 'cable', -4], ['LOAN_OUT', 'printer', -2]]);
  assert.equal(stock.loanAge(new Date(Date.now() - 3 * 86400000)).label, '3 días');
  assert.equal(stock.loanAge(new Date(Date.now() - 2 * 3600000)).label, '2 horas');

  console.log('PASS: purchases/entries/write-offs/counts with running balance, no negative stock under 10 concurrent write-offs, multi-equipment loans discount and restore every stock atomically, returns require an exit order, double return rejected, kardex links loan movements');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await cleanup(); await prisma.$disconnect(); });
