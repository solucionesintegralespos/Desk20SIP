const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { monthlyRange } = require('../lib/monthly-performance.ts');
for (const [now, start, end] of [
 ['2026-10-01T04:59:59Z', '2026-09-01T05:00:00.000Z', '2026-10-01T05:00:00.000Z'],
 ['2026-10-01T05:00:00Z', '2026-10-01T05:00:00.000Z', '2026-11-01T05:00:00.000Z'],
 ['2026-12-31T20:00:00Z', '2026-12-01T05:00:00.000Z', '2027-01-01T05:00:00.000Z'],
 ['2024-02-29T20:00:00Z', '2024-02-01T05:00:00.000Z', '2024-03-01T05:00:00.000Z'],
]) {
 const range = monthlyRange(new Date(now));
 assert.equal(range.gte.toISOString(), start);
 assert.equal(range.lt.toISOString(), end);
 assert.ok(new Date(now) >= range.gte && new Date(now) < range.lt);
}
assert.match(monthlyRange(new Date('2026-09-23T12:00:00Z')).label, /septiembre.*2026/);
console.log('PASS: monthly Colombia boundaries, year rollover, leap year and period label.');
