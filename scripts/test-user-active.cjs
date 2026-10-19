// Inactive users: sign-in, open sessions and the activate/deactivate API, with in-memory doubles.
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), Module = require('module'), ts = require('typescript');
const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('secreto123', 4);
const users = new Map([
  ['admin', { id: 'admin', email: 'admin@sip.test', name: 'Admin', role: 'ADMIN', password: hash, active: true }],
  ['agent', { id: 'agent', email: 'agent@sip.test', name: 'Agente', role: 'AGENT', password: hash, active: true }],
]);
let dbDown = false, sessionEmail = 'admin@sip.test';
const pick = (row, select) => row && (select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : row);
const db = { user: {
  findUnique: async ({ where, select }) => {
    if (dbDown) throw new Error('connection refused');
    const row = where.id ? users.get(where.id) : [...users.values()].find(u => u.email === where.email);
    return pick(row, select) || null;
  },
  count: async ({ where }) => [...users.values()].filter(u => u.role === where.role && u.active === where.active && u.id !== where.id.not).length,
  update: async ({ where, data, select }) => { Object.assign(users.get(where.id), data); return pick(users.get(where.id), select); },
} };
const original = Module._load;
Module._load = function (name, parent, ...rest) {
  if (name === '@/lib/prisma') return { prisma: db };
  if (name === 'next-auth') return { getServerSession: async () => ({ user: { email: sessionEmail } }) };
  if (name.startsWith('@/')) name = path.resolve(name.slice(2));
  return original.call(this, name, parent, ...rest);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { authOptions, INACTIVE_USER } = require('../lib/auth.ts');
const { PATCH } = require('../app/api/users/[id]/route.ts');
const jwt = token => authOptions.callbacks.jwt({ token });
const authorize = (email, password) => authOptions.providers[0].options.authorize({ email, password });
const setActive = async (id, active) => { const r = await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ active }) }), { params: { id } }); return { status: r.status, body: await r.json() }; };

(async () => {
  // Sign-in: an inactive user is told so only after the password is right.
  users.get('agent').active = false;
  await assert.rejects(authorize('agent@sip.test', 'secreto123'), new RegExp(INACTIVE_USER));
  assert.equal(await authorize('agent@sip.test', 'incorrecta'), null, 'wrong password does not reveal the state');
  users.get('agent').active = true;
  assert.equal((await authorize('agent@sip.test', 'secreto123')).id, 'agent');
  console.log('PASS: inactive users cannot sign in; wrong passwords keep the generic error.');

  // Open sessions are re-checked on every request.
  assert.equal((await jwt({ id: 'agent' })).id, 'agent');
  users.get('agent').active = false;
  await assert.rejects(jwt({ id: 'agent' }), new RegExp(INACTIVE_USER), 'deactivation ends open sessions');
  await assert.rejects(jwt({ id: 'deleted' }), new RegExp(INACTIVE_USER), 'deleted users lose their session');
  dbDown = true; assert.equal((await jwt({ id: 'admin' })).id, 'admin', 'a database outage does not sign everyone out'); dbDown = false;
  users.get('agent').active = true;
  console.log('PASS: deactivating or deleting a user ends their open sessions.');

  // API: admins toggle others; never themselves nor the last active admin.
  let result = await setActive('agent', false);
  assert.equal(result.status, 200); assert.equal(users.get('agent').active, false);
  assert.equal((await setActive('agent', true)).status, 200); assert.equal(users.get('agent').active, true, 'reactivation');
  result = await setActive('admin', false);
  assert.equal(result.status, 403); assert.match(result.body.error, /propia cuenta/);
  users.set('admin2', { id: 'admin2', email: 'admin2@sip.test', role: 'ADMIN', active: true });
  assert.equal((await setActive('admin2', false)).status, 200, 'one of two admins can be deactivated');
  // Now "admin" is the only active admin: nobody can deactivate them.
  sessionEmail = 'admin2@sip.test';
  result = await setActive('admin', false);
  assert.equal(result.status, 409); assert.match(result.body.error, /al menos un administrador activo/);
  sessionEmail = 'admin@sip.test';
  assert.equal((await setActive('agent', 'no')).status, 400);
  console.log('PASS: API deactivates and reactivates, never the own account or the last active admin.');
})().catch(error => { console.error(error); process.exitCode = 1; });
