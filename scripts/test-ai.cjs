const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');

// Mock next-auth and prisma for testing AI module
let mockSettings = {};
const mockPrisma = {
  setting: {
    findMany: async ({ where }) => {
      const keys = where?.key?.in || [];
      return keys
        .filter(k => mockSettings[k] !== undefined)
        .map(k => ({ key: k, value: mockSettings[k] }));
    },
    upsert: async ({ where, update, create }) => {
      const key = where.key;
      const value = update.value ?? create.value;
      mockSettings[key] = value;
      return { key, value };
    }
  }
};

const originalLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request === '@/lib/prisma') return { prisma: mockPrisma };
  if (request === 'next-auth') return { getServerSession: async () => ({ user: { id: 'admin1', email: 'admin@test.com', role: 'ADMIN' } }) };
  if (request === '@/lib/auth') return { authOptions: {} };
  if (request.startsWith('@/')) {
    const rel = path.resolve(request.slice(2));
    return originalLoad.call(this, rel, parent, ...rest);
  }
  return originalLoad.call(this, request, parent, ...rest);
};

require.extensions['.ts'] = (module, filename) => {
  const content = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  });
  module._compile(transpiled.outputText, filename);
};

const { detectProvider, getAIConfig } = require('../lib/ai.ts');

async function runTests() {
  console.log('--- Probando detección de proveedores ---');
  
  // Gemini keys
  assert.equal(detectProvider('AIzaSyC1234567890abcdef'), 'gemini', 'Clave que empieza con AIza debe ser gemini');
  assert.equal(detectProvider('AIzaSyD-abc_1234567890123456789012345678'), 'gemini');
  assert.equal(detectProvider('AQ.Ab8RN1234567890abcdefHYEQ'), 'gemini', 'Clave que empieza con AQ. debe ser gemini');
  
  // OpenAI keys
  assert.equal(detectProvider('sk-proj-1234567890'), 'openai', 'Clave que empieza con sk- debe ser openai');
  assert.equal(detectProvider('sk-1234567890'), 'openai');
  
  // Preferred provider overrides
  assert.equal(detectProvider('random_key', 'gemini'), 'gemini');
  assert.equal(detectProvider('random_key', 'openai'), 'openai');
  
  console.log('✓ Detección de proveedores exitosa');

  console.log('--- Probando resolución de configuración de IA ---');
  
  // Caso 1: Usuario guardó clave Gemini en el campo antiguo chatgpt_api_key
  mockSettings = {
    chatgpt_api_key: 'AIzaSyExistingGeminiKeyInDatabase123456'
  };
  let config = await getAIConfig();
  assert.equal(config.provider, 'gemini', 'Debe detectar automáticamente Gemini aunque esté guardada en chatgpt_api_key');
  assert.equal(config.apiKey, 'AIzaSyExistingGeminiKeyInDatabase123456');
  assert.equal(config.model, 'gemini-1.5-flash');
  console.log('✓ Detección retroactiva de Gemini en chatgpt_api_key exitosa');

  // Caso 2: Configuración explícita de Gemini
  mockSettings = {
    ai_provider: 'gemini',
    ai_api_key: 'AIzaSyNewGeminiKey',
    ai_model: 'gemini-2.0-flash'
  };
  config = await getAIConfig();
  assert.equal(config.provider, 'gemini');
  assert.equal(config.apiKey, 'AIzaSyNewGeminiKey');
  assert.equal(config.model, 'gemini-2.0-flash');
  console.log('✓ Configuración explícita de Gemini exitosa');

  // Caso 3: Configuración explícita de OpenAI
  mockSettings = {
    ai_provider: 'openai',
    ai_api_key: 'sk-proj-openai-key-test',
    ai_model: 'gpt-4o-mini'
  };
  config = await getAIConfig();
  assert.equal(config.provider, 'openai');
  assert.equal(config.apiKey, 'sk-proj-openai-key-test');
  assert.equal(config.model, 'gpt-4o-mini');
  console.log('✓ Configuración explícita de OpenAI exitosa');

  console.log('--- Probando llamada a Google Gemini con clave de prueba ---');
  const { testAIConnection } = require('../lib/ai.ts');
  try {
    await testAIConnection({ apiKey: 'AIzaSyTestInvalidKey123456789012345678' });
    assert.fail('Debió arrojar error de clave inválida');
  } catch (err) {
    assert(err.message.includes('API Key de Google Gemini inválida'), 'El mensaje debe indicar que la API Key de Gemini es inválida');
    console.log('✓ Error capturado y traducido correctamente:', err.message);
  }

  console.log('\nTODAS LAS PRUEBAS DE IA PASARON SATISFACTORIAMENTE (PASS)');
}

runTests().catch(err => {
  console.error('ERROR EN PRUEBAS:', err);
  process.exit(1);
});
