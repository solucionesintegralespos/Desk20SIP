// Repeated schedule events: date generation, conflict skipping and the API, with an in-memory Prisma double.
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), Module = require('module'), ts = require('typescript');
class ServiceError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const users = [{ id: 'ana', role: 'AGENT' }, { id: 'luis', role: 'AGENT' }];
let records = [], actor = { id: 'ana', role: 'AGENT' };
const db = {
  user: { count: async ({ where }) => users.filter(u => where.id.in.includes(u.id)).length, findFirst: async () => null },
  serviceRecord: {
    findMany: async ({ where }) => records.filter(r => r.kind === where.kind && r.payload.date.startsWith(where.payload.string_starts_with)),
    create: async ({ data }) => { records.push(data); return data; },
  },
  serviceAuditEvent: { create: async () => ({}) },
  $transaction: fn => fn(db),
};
const original = Module._load;
Module._load = function (name, parent, ...rest) {
  if (name === '@/lib/prisma') return { prisma: db };
  if (name === '@/lib/support/server') return { serviceUser: async () => actor, ServiceError, serviceError: e => Response.json({ error: e.message }, { status: e.status || 500 }) };
  if (name.startsWith('@/')) name = path.resolve(name.slice(2));
  return original.call(this, name, parent, ...rest);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { repeatDates, repeatConflict, eventSchema } = require('../lib/schedule.ts');
const { POST } = require('../app/api/schedule/route.ts');
const post = async body => { const r = await POST(new Request('http://localhost/api/schedule', { method: 'POST', body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; };

(async () => {
  // Weekly: next matching weekday from the start, every 7 days until December 31.
  const weekly = repeatDates('2026-10-06', { mode: 'weekly', weekday: 5 }); // Tuesday start, Fridays
  assert.equal(weekly[0], '2026-10-09'); assert.equal(weekly.at(-1), '2026-12-25'); assert.equal(weekly.length, 12);
  assert.equal(repeatDates('2026-10-06', { mode: 'weekly', weekday: 2 })[0], '2026-10-06', 'same weekday starts on the event date');
  // Monthly: same day each month; months without it are skipped.
  assert.deepEqual(repeatDates('2026-08-31', { mode: 'monthly' }), ['2026-08-31', '2026-10-31', '2026-12-31']);
  assert.deepEqual(repeatDates('2026-12-15', { mode: 'monthly' }), ['2026-12-15']);
  console.log('PASS: weekly and monthly dates until December 31, skipping months without that day.');

  const busy = [
    { date: '2026-10-16', start: '09:00', status: 'planned', techId: 'luis', techIds: ['luis', 'ana'] },
    { date: '2026-10-23', start: '14:00', status: 'vacation', techId: 'ana' },
    { date: '2026-10-30', start: '09:00', status: 'planned', techId: 'luis' },
  ];
  assert.equal(repeatConflict(busy, '2026-10-16', '09:00', ['ana']), 'time', 'shared event at the same time');
  assert.equal(repeatConflict(busy, '2026-10-23', '09:00', ['ana']), 'vacation', 'vacation any hour');
  assert.equal(repeatConflict(busy, '2026-10-30', '09:00', ['ana']), null, 'other engineers do not block');
  assert.equal(repeatConflict(busy, '2026-10-16', '10:00', ['ana']), null, 'different time is allowed');
  console.log('PASS: conflicts by same start time or vacation, only for the engineers of the event.');

  assert.ok(eventSchema.safeParse({ title: 'x', techId: 'ana', clientId: null, date: '2026-10-06', start: '09:00', status: 'permission', description: '' }).success);
  assert.ok(eventSchema.safeParse({ title: 'x', techId: 'ana', clientId: null, date: '2026-10-06', start: '09:00', status: 'medical', description: '' }).success);
  console.log('PASS: Permiso and Cita médica are valid statuses.');

  records = busy.map((payload, i) => ({ id: `b${i}`, kind: 'schedule', payload }));
  const base = { title: 'Visita semanal', techId: 'ana', techIds: ['ana'], clientId: null, date: '2026-10-09', start: '09:00', status: 'planned', description: '' };
  let result = await post({ ...base, repeat: { mode: 'weekly', weekday: 5 } });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual(result.body.skipped, [{ date: '2026-10-16', reason: 'time' }, { date: '2026-10-23', reason: 'vacation' }]);
  assert.equal(result.body.created.length, 10);
  const series = records.filter(r => r.payload.seriesId === result.body.seriesId);
  assert.equal(series.length, 10); assert.ok(series.every(r => r.payload.start === '09:00' && r.techId === 'ana'));
  // Repeating again at the same time collides with the series just created.
  result = await post({ ...base, repeat: { mode: 'weekly', weekday: 5 } });
  assert.equal(result.status, 409); assert.match(result.body.error, /No se creó ningún evento/);
  assert.equal((await post({ ...base, repeat: { mode: 'yearly' } })).status, 400);
  console.log('PASS: API creates the series in one transaction, skips conflicts and reports them.');
})().catch(error => { console.error(error); process.exitCode = 1; });
