const assert = require('node:assert/strict'), fs = require('fs'), vm = require('vm'), path = require('path'), Module = require('module'), ts = require('typescript');
const { webcrypto } = require('node:crypto');
const source = ts.transpileModule(fs.readFileSync('lib/support/client-id.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const sandbox = { exports: {}, crypto: { getRandomValues: bytes => webcrypto.getRandomValues(bytes) }, Uint8Array };
vm.runInNewContext(source, sandbox);
const uid = sandbox.exports.clientId;
const ids = new Set(Array.from({ length: 1000 }, () => uid()));
assert.equal(ids.size, 1000);
for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
let secureCalls = 0;
sandbox.crypto.randomUUID = () => { secureCalls++; return 'native-uuid'; };
assert.equal(uid(), 'native-uuid'); assert.equal(secureCalls, 1); delete sandbox.crypto.randomUUID;

// Exercise the actual button handler with a browser crypto lacking randomUUID.
const React = require('react');
const state = []; let cursor = 0;
const original = Module._load;
Module._load = function(name, parent, ...rest) {
  if (name === 'react') return { ...React, useEffect() {}, useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; } };
  if (name === '@/lib/support/context') return { uid, useSupport: () => ({ user: { id: 'field-tech', role: 'tech' }, state: { users: [{ id: 'field-tech', name: 'Técnico de campo' }], clients: [{ id: 'client', businessName: 'Cliente' }], orders: [], tickets: [], checklists: [] }, save: async () => {}, detail: async () => {} }) };
  if (name.startsWith('@/')) name = path.resolve(name.slice(2));
  return original.call(this, name, parent, ...rest);
};
require.extensions['.tsx'] = require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { Orders } = require('../components/support/orders.tsx');
let tree = Orders();
tree.props.children[0].props.children[1].props.onClick();
assert.match(state[0].id, /^[0-9a-f-]{36}$/); assert.equal(state[0].techId, 'field-tech'); assert.equal(state[0].clientId, 'client');
cursor = 0; tree = Orders();
const dialog = tree.props.children.find(child => child?.type?.name === 'Dialog');
assert(dialog); assert.equal(dialog.props.open, true);
console.log('PASS: LAN HTTP UUID fallback, native HTTPS UUID and field technician new-order button opens the form.');
