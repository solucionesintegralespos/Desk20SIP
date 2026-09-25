require('@next/env').loadEnvConfig(process.cwd());
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), Module = require('module'), ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
let actor, eventId;
const userId = crypto.randomUUID();
class ServiceError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const original = Module._load;
Module._load = function(name, parent, ...rest) {
  if (name === '@/lib/prisma') return { prisma: db };
  if (name === '@/lib/support/server') return {
    serviceUser: async () => { if (!actor || actor.role === 'CUSTOMER') throw new ServiceError('Forbidden', 403); return actor; },
    ServiceError, serviceError: error => Response.json({ error: error.message }, { status: error.status || 500 }),
  };
  if (name.startsWith('@/')) name = path.resolve(name.slice(2));
  return original.call(this, name, parent, ...rest);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const route = require('../app/api/schedule/route.ts');
const request = (body, method = 'POST') => new Request('http://localhost/api/schedule', { method, body: JSON.stringify(body) });
async function main() {
  actor = await db.user.create({ data: { id: userId, name: 'Schedule integration test', role: 'AGENT' } });
  const draft = { title: 'Test visit', techId: userId, clientId: null, date: '2026-09-22', start: '08:00', status: 'planned', description: 'Integration test' };
  assert.equal((await route.POST(request({ ...draft, start: '25:00' }))).status, 400);
  const created = await route.POST(request(draft));
  assert.equal(created.status, 200); eventId = (await created.json()).id;
  const loaded = (await (await route.GET()).json()).events.find(event => event.id === eventId);
  assert.equal(loaded.title, draft.title); assert.equal(loaded.revision, 1);
  assert.equal((await route.POST(request({ ...loaded, status: 'completed' }))).status, 200);
  assert.equal((await route.POST(request(loaded))).status, 409);
  actor = { id: userId, role: 'CUSTOMER' };
  assert.equal((await route.GET()).status, 403);
  assert.equal((await route.POST(request(draft))).status, 403);
  actor = { id: userId, role: 'AGENT' };
  assert.equal((await route.DELETE(request({ id: eventId, revision: 2 }, 'DELETE'))).status, 200);
  assert.equal(await db.serviceRecord.findUnique({ where: { id: eventId } }), null);
  console.log('Programación: creación, lectura, edición, eliminación, validación, permisos y conflicto de revisión correctos.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (eventId) { await db.serviceRecord.deleteMany({ where: { id: eventId, kind: 'schedule' } }); await db.serviceAuditEvent.deleteMany({ where: { entityId: eventId, actorId: userId } }); }
  await db.user.deleteMany({ where: { id: userId } }); await db.$disconnect();
});
