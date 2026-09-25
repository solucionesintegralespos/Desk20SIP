require('@next/env').loadEnvConfig(process.cwd());
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), Module = require('module'), ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const users = [crypto.randomUUID(), crypto.randomUUID()];
let user;
const original = Module._load;
Module._load = function(name, parent, ...rest) {
  if (name === '@/lib/prisma') return { prisma: db };
  if (name === '@/lib/dashboard-data') return { getDashboardUser: async () => user };
  return original.call(this, name, parent, ...rest);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { PUT } = require('../app/api/preferences/theme/route.ts');
const save = body => PUT(new Request('http://localhost/api/preferences/theme', { method: 'PUT', body: JSON.stringify(body) }));
async function main() {
  assert.equal((await save({ theme: 'dark' })).status, 401);
  user = { id: users[0] };
  assert.equal((await save({ theme: 'invalid' })).status, 400);
  assert.equal((await save({ theme: 'dark', userId: users[1] })).status, 200);
  user = { id: users[1] };
  assert.equal((await save({ theme: 'light' })).status, 200);
  assert.equal((await db.setting.findUnique({ where: { key: `user:${users[0]}:theme` } })).value, 'dark');
  assert.equal((await db.setting.findUnique({ where: { key: `user:${users[1]}:theme` } })).value, 'light');
  assert.equal((await save({ theme: 'dark' })).status, 200);
  assert.equal((await db.setting.findUnique({ where: { key: `user:${users[1]}:theme` } })).value, 'dark');
  console.log('Tema: autenticación, validación, persistencia y preferencias independientes correctas.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await db.setting.deleteMany({ where: { key: { in: users.map(id => `user:${id}:theme`) } } });
  await db.$disconnect();
});
