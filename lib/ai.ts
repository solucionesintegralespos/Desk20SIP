import { prisma } from '@/lib/prisma'
import { GoogleGenAI } from '@google/genai'

export type AIProvider = 'gemini' | 'openai' | 'auto'

export interface AIConfig {
  provider: 'gemini' | 'openai'
  apiKey: string
  model: string
  source: 'database' | 'env'
}

export interface AIOptions {
  systemPrompt?: string
  userPrompt: string
  temperature?: number
  maxTokens?: number
  model?: string
}

export interface AIResult {
  text: string
  provider: 'gemini' | 'openai'
  model: string
}

/**
 * Detects whether the given API key belongs to Google Gemini or OpenAI ChatGPT.
 * Google Gemini keys start with "AIzaSy" or "AQ." (new Google AI Studio authorization keys).
 * OpenAI keys start with "sk-".
 */
export function detectProvider(
  apiKey: string,
  preferred?: string | null
): 'gemini' | 'openai' {
  const cleanKey = (apiKey || '').trim()
  const cleanPref = (preferred || '').trim().toLowerCase()

  if (cleanPref === 'gemini') return 'gemini'
  if (cleanPref === 'openai') return 'openai'

  // Automatic detection by key pattern
  if (cleanKey.startsWith('AIza') || cleanKey.startsWith('AQ.')) {
    return 'gemini'
  }
  if (cleanKey.startsWith('sk-')) {
    return 'openai'
  }

  // Fallback: Si no empieza por sk-, asumir Google Gemini
  if (!cleanKey.startsWith('sk-')) {
    return 'gemini'
  }

  return 'openai'
}

/**
 * Loads the active AI configuration from the database or environment variables.
 */
export async function getAIConfig(): Promise<AIConfig> {
  let map: Record<string, string> = {}

  try {
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: ['ai_provider', 'ai_api_key', 'gemini_api_key', 'chatgpt_api_key', 'ai_model']
        }
      }
    })
    map = settings.reduce((acc, s) => {
      acc[s.key] = s.value
      return acc
    }, {} as Record<string, string>)
  } catch (err) {
    console.warn('Advertencia al consultar configuración de IA en BD:', err)
  }

  const preferredProvider = map.ai_provider as AIProvider | undefined

  let apiKey = ''
  let source: 'database' | 'env' = 'database'

  if (map.ai_api_key?.trim()) {
    apiKey = map.ai_api_key.trim()
  } else if (preferredProvider === 'gemini' && map.gemini_api_key?.trim()) {
    apiKey = map.gemini_api_key.trim()
  } else if (preferredProvider === 'openai' && map.chatgpt_api_key?.trim()) {
    apiKey = map.chatgpt_api_key.trim()
  } else if (map.gemini_api_key?.trim()) {
    apiKey = map.gemini_api_key.trim()
  } else if (map.chatgpt_api_key?.trim()) {
    apiKey = map.chatgpt_api_key.trim()
  }

  // Fallback to environment variables
  if (!apiKey) {
    if (process.env.GEMINI_API_KEY?.trim()) {
      apiKey = process.env.GEMINI_API_KEY.trim()
      source = 'env'
    } else if (process.env.OPENAI_API_KEY?.trim()) {
      apiKey = process.env.OPENAI_API_KEY.trim()
      source = 'env'
    } else if (process.env.CHATGPT_API_KEY?.trim()) {
      apiKey = process.env.CHATGPT_API_KEY.trim()
      source = 'env'
    }
  }

  if (!apiKey) {
    throw new Error('API Key de IA no configurada. Por favor configúrala en Configuración > Inteligencia Artificial.')
  }

  const provider = detectProvider(apiKey, preferredProvider)

  let model = (map.ai_model || process.env.AI_MODEL || '').trim()
  if (!model) {
    model = provider === 'gemini' ? 'gemini-3.8-flash' : 'gpt-4o-mini'
  }

  return { provider, apiKey, model, source }
}

let cachedGeminiModels: { models: string[]; timestamp: number } | null = null
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutos de caché en memoria

/**
 * Lists the available Gemini models for a given API Key directly from Google Generative Language API.
 */
export async function listGeminiModels(apiKey: string): Promise<string[]> {
  const cleanKey = apiKey.trim()
  const versions = ['v1beta', 'v1']

  for (const ver of versions) {
    try {
      const url = `https://generativelanguage.googleapis.com/${ver}/models?key=${encodeURIComponent(cleanKey)}`
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': cleanKey
        }
      })

      if (!res.ok) continue
      const data = await res.json()

      if (Array.isArray(data?.models)) {
        const supported = data.models
          .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
          .map((m: any) => String(m.name || '').replace(/^models\//, ''))
          .filter(Boolean)

        if (supported.length > 0) {
          return supported
        }
      }
    } catch (e) {
      console.warn(`Error al consultar modelos Gemini en ${ver}:`, e)
    }
  }

  return []
}

/**
 * Obtains the live models with cache to avoid unnecessary round-trips.
 */
export async function getLiveGeminiModels(apiKey: string, force = false): Promise<string[]> {
  const now = Date.now()
  if (!force && cachedGeminiModels && (now - cachedGeminiModels.timestamp < CACHE_TTL_MS)) {
    return cachedGeminiModels.models
  }

  const live = await listGeminiModels(apiKey)
  if (live.length > 0) {
    cachedGeminiModels = { models: live, timestamp: now }
    return live
  }

  return cachedGeminiModels?.models || []
}

/**
 * Resolves the best active model available in Google for this API Key.
 * If the requested model is deprecated or unavailable, it automatically picks the latest active model.
 */
export async function resolveActiveGeminiModel(apiKey: string, requestedModel?: string): Promise<string> {
  const cleanReq = (requestedModel || '').trim().replace(/^models\//, '')
  const liveModels = await getLiveGeminiModels(apiKey)

  // 1. Si el modelo solicitado existe y está activo en Google, usarlo
  if (cleanReq && liveModels.includes(cleanReq)) {
    return cleanReq
  }

  // 2. Si no existe o está retirado, seleccionar dinámicamente el mejor modelo disponible en vivo
  if (liveModels.length > 0) {
    const preferredOrder = [
      'gemini-3.8-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-2.0-flash',
      'gemini-2.5-flash',
      'gemini-1.5-flash-latest'
    ]
    for (const pref of preferredOrder) {
      if (liveModels.includes(pref)) return pref
    }
    const anyFlash = liveModels.find(m => m.includes('flash'))
    if (anyFlash) return anyFlash
    return liveModels[0]
  }

  // 3. Fallback seguro
  return cleanReq || 'gemini-3.8-flash'
}

/**
 * Returns detailed model information for the UI model selector.
 */
export async function getAvailableGeminiModelsDetailed(apiKey: string): Promise<{
  models: Array<{ name: string; displayName: string }>
  defaultModel: string
}> {
  const cleanKey = apiKey.trim()
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': cleanKey
    }
  })

  const data = await res.json()

  if (!res.ok) {
    const errorInfo = data?.error
    const msg = errorInfo?.message || `Error ${res.status} al consultar modelos`
    if (msg.toLowerCase().includes('api key not valid') || errorInfo?.status === 'UNAUTHENTICATED' || errorInfo?.status === 'INVALID_ARGUMENT') {
      throw new Error('API Key de Google Gemini inválida. Por favor verifica tu clave en Google AI Studio.')
    }
    throw new Error(msg)
  }

  const rawModels: any[] = Array.isArray(data?.models) ? data.models : []
  const filtered = rawModels
    .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
    .map((m: any) => ({
      name: String(m.name || '').replace(/^models\//, ''),
      displayName: m.displayName || String(m.name || '').replace(/^models\//, '')
    }))

  const preferredDefaults = [
    'gemini-3.8-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash'
  ]

  let defaultModel = filtered.find(m => preferredDefaults.includes(m.name))?.name
  if (!defaultModel && filtered.length > 0) {
    defaultModel = filtered.find(m => m.name.includes('flash'))?.name || filtered[0].name
  }

  return {
    models: filtered,
    defaultModel: defaultModel || 'gemini-3.8-flash'
  }
}

/**
 * Executes a REST call to Google Gemini with automatic model & version fallback.
 */
async function attemptGenerateREST(
  apiKey: string,
  model: string,
  apiVer: string,
  userPrompt: string,
  systemPrompt?: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string | null> {
  const url = `https://generativelanguage.googleapis.com/${apiVer}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`

  const payload: Record<string, any> = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }]
      }
    ],
    generationConfig: {
      temperature: options?.temperature ?? 0.7,
      maxOutputTokens: options?.maxTokens ?? 1000
    }
  }

  if (systemPrompt?.trim()) {
    payload.system_instruction = {
      parts: [{ text: systemPrompt.trim() }]
    }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(payload)
  })

  const data = await res.json()

  if (!res.ok) {
    const errorInfo = data?.error
    const status = errorInfo?.status || res.status
    const rawMessage = errorInfo?.message || `Error ${res.status} al consultar Google Gemini`

    if (res.status === 404 || rawMessage.toLowerCase().includes('not found') || rawMessage.toLowerCase().includes('not supported')) {
      return null
    }

    if (
      status === 'UNAUTHENTICATED' ||
      status === 'INVALID_ARGUMENT' ||
      rawMessage.toLowerCase().includes('api key not valid')
    ) {
      throw new Error('API Key de Google Gemini inválida. Por favor verifica tu clave en Configuración.')
    }

    if (status === 'RESOURCE_EXHAUSTED' || res.status === 429) {
      throw new Error('Límite de cuota excedido en Google Gemini. Intenta más tarde o revisa tu cuota en Google AI Studio.')
    }

    if (status === 'PERMISSION_DENIED') {
      throw new Error('Permisos denegados en Google Gemini. Verifica que la API Generative Language esté activa para tu clave.')
    }

    throw new Error(rawMessage)
  }

  const candidate = data?.candidates?.[0]
  const text = candidate?.content?.parts?.[0]?.text

  if (!text) {
    if (candidate?.finishReason === 'SAFETY') {
      throw new Error('La respuesta fue bloqueada por los filtros de seguridad de Gemini.')
    }
    throw new Error('Google Gemini no devolvió texto de respuesta.')
  }

  return text.trim()
}

/**
 * Calls Google Gemini using the official @google/genai SDK (Interactions API / generateContent)
 * with automatic fallback to native REST API.
 */
export async function callGemini(
  apiKey: string,
  model: string,
  userPrompt: string,
  systemPrompt?: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const cleanKey = apiKey.trim()
  const cleanTargetModel = (model || '').trim().replace(/^models\//, '')

  // Resolver dinámicamente el modelo activo en Google para esta clave
  const activeModel = await resolveActiveGeminiModel(cleanKey, cleanTargetModel)

  const candidateModels = [
    activeModel,
    cleanTargetModel,
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-4-argon'
  ].filter((m, i, arr) => m && arr.indexOf(m) === i)

  let lastError: Error | null = null

  // 1. Intentar con el SDK oficial @google/genai
  try {
    const ai = new GoogleGenAI({ apiKey: cleanKey })

    for (const currentModel of candidateModels) {
      // Método A: Interactions API (@google/genai)
      try {
        const fullInput = systemPrompt
          ? `[Instrucciones del sistema]: ${systemPrompt}\n\n${userPrompt}`
          : userPrompt

        const interaction: any = await (ai as any).interactions.create({
          model: currentModel,
          input: fullInput
        })

        const outputText = interaction?.output_text || interaction?.outputText
        if (outputText && typeof outputText === 'string' && outputText.trim()) {
          return outputText.trim()
        }
      } catch (interactionErr: any) {
        lastError = interactionErr
      }

      // Método B: generateContent via @google/genai SDK
      try {
        const response: any = await ai.models.generateContent({
          model: currentModel,
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt ? systemPrompt : undefined,
            temperature: options?.temperature ?? 0.7,
            maxOutputTokens: options?.maxTokens ?? 1000
          }
        })

        const text = response?.text
        if (text && typeof text === 'string' && text.trim()) {
          return text.trim()
        }
      } catch (genErr: any) {
        lastError = genErr
      }
    }
  } catch (sdkInitErr: any) {
    lastError = sdkInitErr
  }

  // 2. Fallback a llamada REST nativa directa con fetch
  for (const currentModel of candidateModels) {
    for (const ver of ['v1beta', 'v1']) {
      try {
        const result = await attemptGenerateREST(cleanKey, currentModel, ver, userPrompt, systemPrompt, options)
        if (result) return result
      } catch (restErr: any) {
        lastError = restErr
      }
    }
  }

  // 3. Si fallaron, consultar dinámicamente qué modelos tiene activos la clave
  try {
    const discovered = await listGeminiModels(cleanKey)
    for (const discoveredModel of discovered) {
      if (candidateModels.includes(discoveredModel)) continue
      for (const ver of ['v1beta', 'v1']) {
        try {
          const result = await attemptGenerateREST(cleanKey, discoveredModel, ver, userPrompt, systemPrompt, options)
          if (result) return result
        } catch (err: any) {
          lastError = err
        }
      }
    }
  } catch {}

  const errStr = lastError?.message || String(lastError || '')
  if (errStr.includes('API_KEY_INVALID') || errStr.toLowerCase().includes('api key not valid')) {
    throw new Error('API Key de Google Gemini inválida. Por favor verifica tu clave en Google AI Studio.')
  }
  if (errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('429')) {
    throw new Error('Límite de cuota excedido en Google Gemini. Intenta más tarde o revisa tu cuota en Google AI Studio.')
  }

  throw lastError || new Error('No se pudo obtener respuesta de Google Gemini. Verifica tu clave y modelos disponibles.')
}

/**
 * Calls OpenAI Chat Completions API.
 */
export async function callOpenAI(
  apiKey: string,
  model: string,
  userPrompt: string,
  systemPrompt?: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const url = 'https://api.openai.com/v1/chat/completions'

  const messages: Array<{ role: string; content: string }> = []
  if (systemPrompt?.trim()) {
    messages.push({ role: 'system', content: systemPrompt.trim() })
  }
  messages.push({ role: 'user', content: userPrompt })

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1000
    })
  })

  const data = await res.json()

  if (!res.ok) {
    const rawMessage = data?.error?.message || `Error ${res.status} al consultar OpenAI`
    if (res.status === 401 || data?.error?.code === 'invalid_api_key') {
      throw new Error('API Key de OpenAI inválida. Por favor verifica tu clave en Configuración.')
    }
    if (res.status === 429) {
      throw new Error('Límite de cuota excedido en OpenAI. Verifica tu saldo o plan en platform.openai.com.')
    }
    throw new Error(rawMessage)
  }

  const text = data?.choices?.[0]?.message?.content
  if (!text) {
    throw new Error('OpenAI no devolvió texto de respuesta.')
  }
  return text.trim()
}

/**
 * Unified entry point to generate an AI response using the configured provider.
 */
export async function generateAIResponse(options: AIOptions): Promise<AIResult> {
  const config = await getAIConfig()
  const chosenModel = options.model || config.model

  let text = ''
  if (config.provider === 'gemini') {
    text = await callGemini(
      config.apiKey,
      chosenModel,
      options.userPrompt,
      options.systemPrompt,
      { temperature: options.temperature, maxTokens: options.maxTokens }
    )
  } else {
    text = await callOpenAI(
      config.apiKey,
      chosenModel,
      options.userPrompt,
      options.systemPrompt,
      { temperature: options.temperature, maxTokens: options.maxTokens }
    )
  }

  return {
    text,
    provider: config.provider,
    model: chosenModel
  }
}

/**
 * Tests an API Key and provider without saving.
 */
export async function testAIConnection(params: {
  apiKey: string
  provider?: string
  model?: string
}): Promise<{ success: boolean; message: string; provider: 'gemini' | 'openai'; model: string }> {
  if (!params.apiKey?.trim()) {
    throw new Error('La API Key no puede estar vacía.')
  }

  const provider = detectProvider(params.apiKey, params.provider)
  const model = (params.model || '').trim() || (provider === 'gemini' ? 'gemini-3.8-flash' : 'gpt-4o-mini')

  const testPrompt = 'Por favor responde únicamente con la palabra OK si puedes leer este mensaje.'

  let responseText = ''
  if (provider === 'gemini') {
    responseText = await callGemini(
      params.apiKey.trim(),
      model,
      testPrompt,
      'Eres un asistente de prueba.',
      { maxTokens: 20 }
    )
  } else {
    responseText = await callOpenAI(
      params.apiKey.trim(),
      model,
      testPrompt,
      'Eres un asistente de prueba.',
      { maxTokens: 20 }
    )
  }

  return {
    success: true,
    message: `Conexión exitosa con ${provider === 'gemini' ? 'Google Gemini' : 'OpenAI ChatGPT'} (${model}). Respuesta: "${responseText}"`,
    provider,
    model
  }
}
