#!/usr/bin/env node
/**
 * Script de utilidad para listar todos los modelos de Google Gemini disponibles
 * para una API Key específica o la guardada en la base de datos.
 *
 * Uso:
 *   node scripts/list-gemini-models.cjs [TU_API_KEY] [--test]
 *   npm run list-models [TU_API_KEY]
 */

const fs = require('fs');
const path = require('path');

// Cargar .env si existe
try {
  if (typeof process.loadEnvFile === 'function' && fs.existsSync('.env')) {
    process.loadEnvFile('.env');
  }
} catch (e) {}

async function getApiKeyFromDb() {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const settings = await prisma.setting.findMany({
      where: {
        key: { in: ['ai_api_key', 'gemini_api_key', 'chatgpt_api_key'] }
      }
    });
    await prisma.$disconnect();

    const map = settings.reduce((acc, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {});

    return map.ai_api_key || map.gemini_api_key || map.chatgpt_api_key || '';
  } catch (err) {
    return '';
  }
}

async function listModelsFromApi(apiKey) {
  const versions = ['v1beta', 'v1'];
  for (const ver of versions) {
    try {
      const url = `https://generativelanguage.googleapis.com/${ver}/models?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        }
      });

      const data = await res.json();

      if (!res.ok) {
        const errorInfo = data?.error;
        const msg = errorInfo?.message || `Error ${res.status}`;
        throw new Error(`Google API (${ver}): ${msg}`);
      }

      if (Array.isArray(data.models) && data.models.length > 0) {
        return { version: ver, models: data.models };
      }
    } catch (err) {
      if (err.message.includes('API key not valid') || err.message.includes('UNAUTHENTICATED')) {
        throw err;
      }
      // Probar siguiente versión
    }
  }

  throw new Error('No se encontraron modelos disponibles o la API Key no tiene permisos suficientes.');
}

async function testSingleModel(apiKey, modelName) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Hola, di OK' }] }],
        generationConfig: { maxOutputTokens: 10 }
      })
    });
    const data = await res.json();
    if (res.ok) {
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'OK';
      return { success: true, text: text.trim() };
    }
    return { success: false, error: data?.error?.message || `HTTP ${res.status}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function main() {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const shouldTest = process.argv.includes('--test');

  let apiKey = args[0];

  if (!apiKey) {
    console.log('Buscando API Key en base de datos o .env...');
    apiKey = (await getApiKeyFromDb()) || process.env.GEMINI_API_KEY || '';
  }

  if (!apiKey || !apiKey.trim()) {
    console.error('\n❌ No se proporcionó ninguna API Key.');
    console.error('Uso: node scripts/list-gemini-models.cjs [TU_API_KEY] [--test]');
    console.error('Ejemplo: node scripts/list-gemini-models.cjs AQ.Ab8RN... --test\n');
    process.exit(1);
  }

  const cleanKey = apiKey.trim();
  const maskedKey = cleanKey.length > 10
    ? `${cleanKey.slice(0, 7)}...${cleanKey.slice(-4)}`
    : '***';

  console.log(`\n======================================================`);
  console.log(`  CONSULTA DE MODELOS DISPONIBLES EN GOOGLE GEMINI`);
  console.log(`  API Key: ${maskedKey}`);
  console.log(`======================================================\n`);

  try {
    console.log('Consultando API de Google Generative Language...');
    const { version, models } = await listModelsFromApi(cleanKey);

    console.log(`\n✓ Se encontraron ${models.length} modelos en la versión de API "${version}":\n`);

    const generateModels = models.filter(m =>
      Array.isArray(m.supportedGenerationMethods) &&
      m.supportedGenerationMethods.includes('generateContent')
    );

    console.log(`--- MODELOS QUE SOPORTAN GENERACIÓN DE TEXTO (${generateModels.length}) ---`);
    console.log(
      'Nombre'.padEnd(34) +
      'Métodos'.padEnd(25) +
      'Límite Entrada'.padEnd(16) +
      'Límite Salida'
    );
    console.log('-'.repeat(90));

    for (const m of generateModels) {
      const shortName = m.name.replace(/^models\//, '');
      const methods = (m.supportedGenerationMethods || []).slice(0, 2).join(', ');
      const inTokens = m.inputTokenLimit ? `${(m.inputTokenLimit / 1000).toFixed(0)}k` : 'N/A';
      const outTokens = m.outputTokenLimit ? `${(m.outputTokenLimit / 1000).toFixed(0)}k` : 'N/A';

      console.log(
        shortName.padEnd(34) +
        methods.padEnd(25) +
        inTokens.padEnd(16) +
        outTokens
      );
    }

    if (shouldTest) {
      console.log('\n--- PROBANDO RESPUESTA EN VIVO CON CADA MODELO ---');
      for (const m of generateModels.slice(0, 8)) {
        const shortName = m.name.replace(/^models\//, '');
        process.stdout.write(`Probando ${shortName.padEnd(32)} ... `);
        const testRes = await testSingleModel(cleanKey, shortName);
        if (testRes.success) {
          console.log(`✓ OK (Respuesta: "${testRes.text.slice(0, 25)}")`);
        } else {
          console.log(`✗ Error: ${testRes.error}`);
        }
      }
    } else {
      console.log('\n💡 Consejo: Ejecuta con --test para verificar cuáles responden en vivo:');
      console.log(`   node scripts/list-gemini-models.cjs ${cleanKey} --test\n`);
    }

    // Modelos recomendados encontrados
    const names = generateModels.map(m => m.name.replace(/^models\//, ''));
    const recommended = names.find(n => n.includes('3.8-flash')) ||
                        names.find(n => n.includes('3.5-flash')) ||
                        names.find(n => n.includes('2.0-flash')) ||
                        names.find(n => n.includes('flash')) ||
                        names[0];

    console.log(`======================================================`);
    console.log(`⭐ Modelo recomendado para tu configuración: "${recommended}"`);
    console.log(`======================================================\n`);

  } catch (err) {
    console.error(`\n❌ Error al consultar Google Gemini:`);
    console.error(`   ${err.message}\n`);
    process.exit(1);
  }
}

main();
