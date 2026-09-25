const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
process.loadEnvFile('.env');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const original = Module._load;
Module._load = function(name, parent, ...rest) {
  if (name === '@/lib/prisma') return { prisma: db };
  if (name.startsWith('@/')) name = path.resolve(name.slice(2));
  return original.call(this, name, parent, ...rest);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { dailyRange } = require('../lib/daily-filter.ts');
const { serviceList } = require('../lib/support/list.ts');
(async () => {
  const before = dailyRange(null, null, new Date('2026-09-23T04:59:59Z'));
  assert.equal(before.dateFrom, '2026-09-22');
  const today = dailyRange(null, null, new Date('2026-09-23T05:00:00Z'));
  assert.equal(today.dateFrom, '2026-09-23');
  assert.equal(today.gte.toISOString(), '2026-09-23T05:00:00.000Z');
  assert.equal(today.lt.toISOString(), '2026-09-24T05:00:00.000Z');
  assert.equal(dailyRange('2026-02-30', null, new Date('2026-09-23T12:00:00Z')).dateFrom, '2026-09-23');
  const history = dailyRange('2026-09-01', '2026-09-02');
  assert.equal(history.lt.toISOString(), '2026-09-03T05:00:00.000Z');
  // Read-only integration: real PostgreSQL query and calendar boundaries.
  for (const range of [dailyRange(), history]) {
    const records = await serviceList(['orders', 'checklists', 'templates'], { id: 'date-filter-validation', role: 'ADMIN' }, range);
    for (const record of records) {
      if (record.kind === 'templates') continue;
      const value = record.kind === 'orders' ? record.payload.startTime : record.payload.completedAt || record.payload.createdAt;
      const date = new Date(value);
      assert.ok(date >= range.gte && date < range.lt, 'Record outside requested day/range');
    }
  }
  console.log('PASS: Colombia midnight, invalid dates, historical ranges, database date filtering.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
