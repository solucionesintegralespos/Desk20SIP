import { prisma } from '@/lib/prisma'

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
 * Google Gemini keys typically start with "AIzaSy" (length ~39 chars).
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

  // Fallback: Si no empieza por sk- y contiene caracteres típicos de clave de Google (como AQ. o AIza)
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
    model = provider === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini'
  }

  return { provider, apiKey, model, source }
}

/**
 * Calls the Google Gemini Generative Language REST API.
 * Supports automatic fallback across recommended models (gemini-1.5-flash, gemini-2.0-flash, gemini-2.5-flash, gemini-1.5-pro).
 */
export async function callGemini(
  apiKey: string,
  model: string,
  userPrompt: string,
  systemPrompt?: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const candidateModels = [
    model,
    'gemini-1.5-flash',
    'gemini-2.0-flash',
    'gemini-2.5-flash',
    'gemini-1.5-pro'
  ].filter((m, i, arr) => m && arr.indexOf(m) === i)

  let lastError: Error | null = null

  for (const currentModel of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json()

      if (!res.ok) {
        const errorInfo = data?.error
        const status = errorInfo?.status || res.status
        const rawMessage = errorInfo?.message || `Error ${res.status} al consultar Google Gemini`

        // If the model is not found / deprecated in this API version, try the next model
        if (res.status === 404 || rawMessage.toLowerCase().includes('not found')) {
          lastError = new Error(`El modelo ${currentModel} no está disponible en Google Gemini.`)
          continue
        }

        if (status === 'INVALID_ARGUMENT' || rawMessage.toLowerCase().includes('api key not valid')) {
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
    } catch (err: any) {
      if (
        err.message?.includes('API Key de Google Gemini inválida') ||
        err.message?.includes('Límite de cuota excedido') ||
        err.message?.includes('Permisos denegados') ||
        err.message?.includes('filtros de seguridad')
      ) {
        throw err
      }
      lastError = err
    }
  }

  throw lastError || new Error('No se pudo obtener respuesta de Google Gemini')
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
  const model = (params.model || '').trim() || (provider === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini')

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
