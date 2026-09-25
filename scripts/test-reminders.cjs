// Task reminders: Bogotá time conversion, due detection, deduplication, snooze and the API scope.
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), Module = require('module'), ts = require('typescript');
process.env.TZ = 'Asia/Tokyo'; // A device far from Colombia must still get the right instant.
class ServiceError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
let actor, query;
const records = [
  { id: 'a', clientId: 'c1', payload: { title: 'Visitar cliente ABC', date: '2026-09-25', start: '15:00', status: 'planned' } },
];
const db = {
  serviceRecord: { findMany: async args => { query = args; return records; } },
  user: { findMany: async () => [{ id: 'c1', name: 'Cliente ABC', email: 'abc@test' }] },
};
const original = Module._load;
Module._load = function (name, parent, ...rest) {
  if (name === '@/lib/prisma') return { prisma: db };
  if (name === '@/lib/support/server') return { serviceUser: async () => { if (!actor || actor.role === 'CUSTOMER') throw new ServiceError('Acceso restringido', 403); return actor; }, ServiceError, serviceError: e => Response.json({ error: e.message }, { status: e.status || 503 }) };
  if (name.startsWith('@/')) name = path.resolve(name.slice(2));
  return original.call(this, name, parent, ...rest);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { scheduledAt } = require('../lib/schedule.ts');
const { takeDueReminders, snoozeReminder, reminderKey } = require('../lib/reminders.ts');
const { GET } = require('../app/api/schedule/reminders/route.ts');

(async () => {
  assert.equal(scheduledAt('2026-09-25', '15:00').toISOString(), '2026-09-25T20:00:00.000Z');
  assert.equal(scheduledAt('2026-12-31', '23:30').toISOString(), '2027-01-01T04:30:00.000Z');
  console.log('PASS: 15:00 in Colombia is 20:00 UTC on any device time zone.');

  const task = (id, date, start) => ({ id, title: id, date, start, scheduledAt: scheduledAt(date, start).toISOString(), clientName: null });
  const tasks = [task('t1000', '2026-09-25', '10:00'), task('t1005', '2026-09-25', '10:05'), task('tomorrow', '2026-09-26', '10:00')];
  const at = time => scheduledAt('2026-09-25', time).getTime();
  let marks = {}, result;
  result = takeDueReminders(tasks, marks, at('09:59')); assert.deepEqual(result.due, []);
  result = takeDueReminders(tasks, marks, at('10:00')); assert.deepEqual(result.due.map(d => d.task.id), ['t1000']); marks = result.marks;
  result = takeDueReminders(tasks, marks, at('10:01')); assert.deepEqual(result.due, [], 'same task is not repeated');
  result = takeDueReminders(tasks, marks, at('10:05')); assert.deepEqual(result.due.map(d => d.task.id), ['t1005']); marks = result.marks;
  // Reload: marks come back from localStorage (JSON) and nothing repeats.
  marks = JSON.parse(JSON.stringify(marks));
  result = takeDueReminders(tasks, marks, at('10:30')); assert.deepEqual(result.due, [], 'no repeats after reload');
  assert.ok(!Object.keys(marks).some(key => key.startsWith('tomorrow')), 'tomorrow task not shown');
  // Snooze: hidden for 10 minutes, then shown once more.
  marks = snoozeReminder(marks, reminderKey(tasks[1]), 10 * 60000, at('10:30'));
  assert.deepEqual(takeDueReminders(tasks, marks, at('10:39')).due, []);
  result = takeDueReminders(tasks, marks, at('10:40')); assert.deepEqual(result.due.map(d => d.task.id), ['t1005']); marks = result.marks;
  // Rescheduling to a later time reminds again at the new time.
  const moved = [{ ...tasks[0], start: '11:00', scheduledAt: scheduledAt('2026-09-25', '11:00').toISOString() }];
  assert.deepEqual(takeDueReminders(moved, marks, at('10:50')).due, []);
  assert.deepEqual(takeDueReminders(moved, marks, at('11:00')).due.map(d => d.task.id), ['t1000']);
  // Old marks are pruned after three days.
  assert.deepEqual(takeDueReminders([], marks, at('10:00') + 4 * 86400000).marks, {});
  console.log('PASS: 10:00 and 10:05 reminded on time, tomorrow not shown, no repeats (also after reload), snooze and reschedule.');

  actor = { id: 'customer', role: 'CUSTOMER' };
  assert.equal((await GET()).status, 403);
  actor = { id: 'engineer', role: 'AGENT' };
  const response = await GET(); const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(query.where.kind, 'schedule'); assert.equal(query.where.techId, 'engineer', 'only the signed-in engineer');
  assert.deepEqual(query.where.AND[0], { payload: { path: ['status'], equals: 'planned' } });
  const dates = query.where.AND[1].OR.map(c => c.payload.equals);
  assert.equal(dates.length, 2); assert.equal(dates[0], body.today);
  assert.equal(new Date(dates[1] + 'T12:00:00Z') - new Date(dates[0] + 'T12:00:00Z'), 86400000);
  assert.deepEqual(body.tasks[0], { id: 'a', title: 'Visitar cliente ABC', date: '2026-09-25', start: '15:00', scheduledAt: '2026-09-25T20:00:00.000Z', clientName: 'Cliente ABC' });
  console.log('PASS: reminders API restricted to staff, scoped to own planned tasks for today and tomorrow in Bogotá.');
})().catch(error => { console.error(error); process.exitCode = 1; });
