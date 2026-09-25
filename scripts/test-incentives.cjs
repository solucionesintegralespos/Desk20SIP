const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { calculatePlan, initialPlan, ticketAt, planSchema } = require('../lib/incentives.ts');
const categories = [{ id: 'fe', name: 'FE ALDELO' }, { id: 'pos', name: 'ALDELO POS' }, { id: 'soft', name: 'SOPORTE SOFTLOGY' }];
const base = initialPlan('2026-09', 'helpdesk', ['agent'], categories);
const metric = { ...base.indicators[0], confirmed: true, categoryIds: ['fe'] };
const plan = i => ({ ...base, indicators: [i] });
const ticket = (number, created, closed, extras = {}) => ({ id: String(number), number, createdAt: new Date(created), closedAt: closed ? new Date(closed) : null, status: closed ? 'CLOSED' : 'OPEN', type: 'INCIDENT', priority: 'HIGH', categoryId: 'fe', tags: [], assigneeId: 'agent', assignments: [{ userId: 'agent' }], ...extras });
const now = new Date('2026-10-01T05:00:00Z');
const dayTickets = [
 ticket(1, '2026-09-02T04:00:00Z', '2026-09-02T04:50:00Z'),
 ticket(2, '2026-09-02T04:00:00Z', '2026-09-02T05:01:00Z'),
 ticket(3, '2026-09-02T06:00:00Z', '2026-09-03T04:59:59Z'),
 ticket(4, '2026-09-01T04:59:59Z', '2026-09-01T05:01:00Z'),
 ticket(5, '2026-09-02T06:00:00Z', '2026-09-02T07:00:00Z', { categoryId: 'pos' }),
 ticket(6, '2026-09-02T06:00:00Z', '2026-09-02T07:00:00Z', { assigneeId: 'other', assignments: [] }),
];
let result = calculatePlan(plan(metric), dayTickets, now).rows[0];
assert.equal(result.numerator, 2); assert.equal(result.denominator, 3); assert.deepEqual(result.ticketNumbers, [1, 3]);
const backlog = { ...metric, source: 'backlog', direction: 'at_most', denominator: 10, target: 50 };
result = calculatePlan(plan(backlog), [ticket(1, '2026-08-01T05:00:00Z'), ticket(2, '2026-09-01T05:00:00Z'), ticket(3, '2026-08-01T05:00:00Z', '2026-09-15T05:00:00Z')], now).rows[0];
assert.equal(result.numerator, 1); assert.equal(result.payout, 25000);
const reopened = ticket(8, '2026-08-01T05:00:00Z', null, { messages: [
 { content: 'Estado cambiado de OPEN a CLOSED', createdAt: new Date('2026-09-15T05:00:00Z') },
 { content: 'Estado cambiado de CLOSED a OPEN', createdAt: new Date('2026-10-02T05:00:00Z') },
] });
assert.equal(ticketAt(reopened, now).status, 'CLOSED');
assert.equal(ticketAt(reopened, new Date('2026-09-10T05:00:00Z')).status, 'OPEN');
const autoClosed = ticket(9, '2026-09-01T05:00:00Z', null, { messages: [
 { content: 'Ticket cerrado automáticamente al confirmar la orden de servicio: prueba', createdAt: new Date('2026-09-01T06:00:00Z') },
 { content: 'Estado cambiado de CLOSED a OPEN', createdAt: new Date('2026-10-02T05:00:00Z') },
] });
assert.equal(ticketAt(autoClosed, now).status, 'CLOSED');
const project = { ...metric, source: 'projects', days: 7, strictDays: true };
const projectTickets = [ticket(1, '2026-09-01T05:00:00Z', '2026-09-08T05:00:00Z', { type: 'PROJECT' })];
assert.equal(calculatePlan(plan(project), projectTickets, now).rows[0].numerator, 0);
assert.equal(calculatePlan(plan({ ...project, strictDays: false }), projectTickets, now).rows[0].numerator, 1);
const weekend = { ...metric, source: 'weekend', denominator: 10 };
assert.equal(calculatePlan(plan(weekend), [ticket(1, '2026-09-05T04:59:00Z'), ticket(2, '2026-09-05T05:00:00Z')], now).rows[0].numerator, 1);
assert.equal(calculatePlan(plan({ ...metric, confirmed: false }), dayTickets, now).rows[0].payout, 0);
assert.equal(base.indicators[7].direction, 'at_most');
assert.equal(base.indicators.length, 14);
assert.equal(initialPlan('2026-09', 'fe', ['agent'], categories).indicators.length, 0);
assert.equal(initialPlan('2026-09', 'cizaro', ['agent'], categories).indicators.length, 0);
assert.equal(planSchema.safeParse(base).success, true);
assert.equal(planSchema.safeParse({ ...base, indicators: [metric, metric] }).success, false);
console.log('PASS: first-contact Colombia day, category/team scope, strict deadlines, weekends, >30-day backlog, historical reopenings, roles and validation');
