const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { incentiveResult, incentiveMonth } = require('../lib/incentive-calculation.ts');
const calculate = (numerator, denominator, target, direction = 'at_least', amount = 25000) => incentiveResult({ numerator, denominator, target, direction, amount });
assert.equal(calculate(281, 356, 80).payout, 0);
assert.equal(calculate(205, 205, 75).payout, 25000);
assert.equal(calculate(356, 329, 95).status, 'met');
assert.equal(calculate(3, 10, 50, 'at_most').payout, 25000);
assert.equal(calculate(4, 93, 7, 'at_least').status, 'unmet');
assert.equal(calculate(4, 93, 7, 'at_most').status, 'met');
assert.equal(calculate(80, 100, 80).status, 'met');
assert.equal(calculate(79999, 100000, 80).status, 'unmet');
assert.equal(calculate(null, 100, 80).status, 'pending');
assert.equal(calculate(0, 0, 80, 'at_most').status, 'pending');
assert.equal(calculate(0, 10, 50, 'at_most').status, 'met');
assert.throws(() => calculate(-1, 10, 80));
assert.throws(() => calculate(1, Infinity, 80));
assert.throws(() => calculate(1, 10, 80, 'at_least', 1.5));
assert.equal(incentiveMonth('2024-02').end - incentiveMonth('2024-02').start, 29 * 86400000);
assert.equal(incentiveMonth('2026-12').end.toISOString(), '2027-01-01T05:00:00.000Z');
assert.throws(() => incentiveMonth('2026-13'));
const sheet = [
 [281,356,80,'at_least',25000], [205,205,75,'at_least',25000], [356,329,95,'at_least',25000],
 [1,3,75,'at_least',25000], [3,10,50,'at_most',25000], [1,114,80,'at_least',25000],
 [21,22,85,'at_least',25000], [4,93,7,'at_most',25000], [243,291,80,'at_least',33333],
 [1,4,75,'at_least',33333], [291,386,90,'at_least',33333], [3,3,75,'at_least',33333],
 [2,5,70,'at_most',33333], [141,200,80,'at_least',33333],
];
assert.equal(sheet.slice(0,8).reduce((sum, args) => sum + calculate(...args).payout, 0), 125000);
assert.equal(sheet.slice(8).reduce((sum, args) => sum + calculate(...args).payout, 0), 99999);
console.log('PASS: incentive thresholds, missing data, zero denominators, COP amounts and Colombia month boundaries');
