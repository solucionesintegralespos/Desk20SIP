// Pure helpers of the accounting module: money in cents, billing number format,
// amounts in words, periods and role helpers. No database.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.startsWith('@/')) request = path.join(__dirname, '..', request.slice(2));
  return originalLoad.call(this, request, parent, isMain);
};
const format = require('../lib/accounting/format.ts');
const words = require('../lib/accounting/number-words.ts');
const roles = require('../lib/roles.ts');
const schedule = require('../lib/schedule.ts');
const { xlsx } = require('../lib/xlsx.ts');

// Billing numbers: digits only, two digits minimum.
assert.equal(format.formatBillingNumber(1), '01');
assert.equal(format.formatBillingNumber(9), '09');
assert.equal(format.formatBillingNumber(10), '10');
assert.equal(format.formatBillingNumber(99), '99');
assert.equal(format.formatBillingNumber(100), '100');
assert.equal(format.formatBillingNumber(1234), '1234');
assert.ok(/^\d+$/.test(format.formatBillingNumber(15)), 'no letters, prefixes or dashes');
assert.equal(format.formatQuoteNumber(7), 'COT-0007');

// Money: cents arithmetic, never floats.
assert.equal(format.toCents('520000'), 52000000);
assert.equal(format.toCents(0.1 + 0.2), 30);
assert.equal(format.toCents('1234,56'), 123456);
assert.equal(format.lineTotalCents(3, 1050), 3150);
assert.equal(format.lineTotalCents(0.1, 3), 0);
assert.equal(format.lineTotalCents(1.5, 12345), 18518);
const totals = format.quoteTotals([{ quantity: 1, unitPriceCents: 52000000 }], 19);
assert.deepEqual(totals, { lines: [52000000], subtotalCents: 52000000, taxCents: 9880000, totalCents: 61880000 });
const noTax = format.quoteTotals([{ quantity: 2, unitPriceCents: 15000 }, { quantity: 3, unitPriceCents: 20000 }], null);
assert.equal(noTax.subtotalCents, 90000); assert.equal(noTax.taxCents, 0); assert.equal(noTax.totalCents, 90000);
// 19 % of 1,00 = 0,19; 19 % of 0,07 = 0,0133 -> 0,01 (rounded once).
assert.equal(format.quoteTotals([{ quantity: 1, unitPriceCents: 7 }], 19).taxCents, 1);
assert.equal(format.quoteTotals([{ quantity: 1, unitPriceCents: 100 }], 19.5).taxCents, 20);
assert.equal(format.formatMoney(52000000), '$ 520.000');
assert.equal(format.formatMoney(123456), '$ 1.234,56');
assert.equal(format.formatMoney(0), '$ 0');

// Amount in words (cuentas de cobro).
assert.equal(words.amountInWords(17600000), 'Ciento setenta y seis mil pesos m/c');
assert.equal(words.amountInWords(61880000), 'Seiscientos dieciocho mil ochocientos pesos m/c');
assert.equal(words.numberToWords(1000000), 'un millón');
assert.equal(words.numberToWords(2500000), 'dos millones quinientos mil');
assert.equal(words.numberToWords(21000), 'veintiún mil');
assert.equal(words.numberToWords(101), 'ciento uno');
assert.equal(words.numberToWords(100), 'cien');
assert.equal(words.numberToWords(31), 'treinta y uno');
assert.equal(words.numberToWords(1000), 'mil');
assert.equal(words.amountInWords(100), 'Un peso m/c');
assert.equal(words.amountInWords(150), 'Un peso con cincuenta centavos m/c');
assert.equal(words.amountInWords(0), 'Cero pesos m/c');

// Periods (Colombia).
assert.equal(format.currentPeriod(new Date('2026-11-01T03:30:00Z')), '2026-10', 'UTC midnight is still the previous day in Bogota');
assert.equal(format.currentPeriod(new Date('2026-11-04T15:00:00Z')), '2026-11');
assert.equal(format.previousPeriod('2026-01'), '2025-12');
assert.equal(format.nextPeriod('2026-12'), '2027-01');
assert.equal(format.periodLabel('2026-11'), 'Noviembre de 2026');
assert.ok(format.isPeriod('2026-02')); assert.ok(!format.isPeriod('2026-13')); assert.ok(!format.isPeriod('2026-1'));

// Roles: Contabilidad is staff (agent access) plus the accounting modules; only ADMIN administers.
assert.ok(roles.isAdmin('ADMIN')); assert.ok(!roles.isAdmin('ACCOUNTING')); assert.ok(!roles.isAdmin('AGENT')); assert.ok(!roles.isAdmin('CUSTOMER')); assert.ok(!roles.isAdmin(undefined));
assert.ok(roles.isStaff('AGENT')); assert.ok(roles.isStaff('ACCOUNTING')); assert.ok(!roles.isStaff('CUSTOMER'));
assert.ok(roles.canUseAccounting('ACCOUNTING')); assert.ok(roles.canUseAccounting('ADMIN')); assert.ok(!roles.canUseAccounting('AGENT'));
assert.ok(roles.isManagedRole('ACCOUNTING')); assert.ok(!roles.isManagedRole('CUSTOMER')); assert.ok(!roles.isManagedRole('ROOT'));
assert.deepEqual(roles.STAFF_ROLES, ['ADMIN', 'AGENT', 'ACCOUNTING']); assert.deepEqual(roles.ADMIN_ROLES, ['ADMIN']); assert.deepEqual(roles.ACCOUNTING_ROLES, ['ADMIN', 'ACCOUNTING']);
assert.equal(roles.roleLabels.ACCOUNTING, 'Contabilidad');
// Inventory write-offs: administrators always; other staff only with the user flag; never customers.
assert.ok(roles.canWriteOffInventory({ role: 'ADMIN', canWriteOffInventory: false }));
assert.ok(roles.canWriteOffInventory({ role: 'AGENT', canWriteOffInventory: true })); assert.ok(roles.canWriteOffInventory({ role: 'ACCOUNTING', canWriteOffInventory: true }));
assert.ok(!roles.canWriteOffInventory({ role: 'AGENT', canWriteOffInventory: false })); assert.ok(!roles.canWriteOffInventory({ role: 'AGENT' }));
assert.ok(!roles.canWriteOffInventory({ role: 'CUSTOMER', canWriteOffInventory: true })); assert.ok(!roles.canWriteOffInventory(null));

// Pasajes: events on or before the paid-until date are frozen; a fare exists only with a positive amount.
assert.ok(schedule.fareLocked('2026-10-31', '2026-10-31')); assert.ok(schedule.fareLocked('2026-09-01', '2026-10-31'));
assert.ok(!schedule.fareLocked('2026-11-01', '2026-10-31')); assert.ok(!schedule.fareLocked('2026-11-01', null)); assert.ok(!schedule.fareLocked('2026-11-01', undefined));
assert.ok(schedule.hasFare({ fareCents: 1200000 })); assert.ok(!schedule.hasFare({ fareCents: 0 })); assert.ok(!schedule.hasFare({ fareCents: null })); assert.ok(!schedule.hasFare({}));
assert.equal(schedule.eventSchema.safeParse({ title: 'Visita', techId: 'a', clientId: null, date: '2026-11-09', start: '08:00', status: 'planned', description: '', fareCents: 850000, fareReason: 'Transporte' }).success, true);
assert.equal(schedule.eventSchema.safeParse({ title: 'Visita', techId: 'a', clientId: null, date: '2026-11-09', start: '08:00', status: 'planned', description: '', fareCents: -1 }).success, false);
// Excel export: a valid zip with the sheet and numeric cells.
const book = xlsx({ name: 'Pasajes', columns: [{ header: 'Fecha' }, { header: 'Valor' }], rows: [['2026-11-01', 12000], ['Total', 12000]] });
assert.equal(book.subarray(0, 2).toString(), 'PK'); assert.ok(book.length > 1000);
assert.ok(book.includes(Buffer.from('xl/worksheets/sheet1.xml')));

console.log('PASS: billing number format, cents arithmetic, tax rounding, amounts in words, periods and role helpers');
