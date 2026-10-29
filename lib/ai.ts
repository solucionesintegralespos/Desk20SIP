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
  const cleanKey = (apiKey || '').trim().replace(/^["']|["']$/g, '')
  const cleanPref = (preferred || '').trim().toLowerCase()

  if (cleanPref === 'gemini') return 'gemini'
  if (cleanPref === 'openai') return 'openai'

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

  // Limpiar posibles comillas pegadas por accidente
  apiKey = apiKey.replace(/^["']|["']$/g, '')

  const provider = detectProvider(apiKey, preferredProvider)

  let model = (map.ai_model || process.env.AI_MODEL || '').trim()
  if (!model) {
    model = provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o-mini'
  }

  return { provider, apiKey, model, source }
}

/**
 * Returns detailed model information for the UI model selector.
 * If the key has restricted permissions that prevent ListModels, falls back to standard supported models.
 */
  export async function getAvailableGeminiModelsDetailed(apiKey: string): Promise<{
    models: Array<{ name: string; displayName: string }>
    defaultModel: string
  }> {
    const cleanKey = apiKey.trim().replace(/^["']|["']$/g, '')

      // Intentar consultar modelos de Google con timeout de 8s
      let lastErrorMsg = ''
      let lastReason = ''

      for (const ver of ['v1beta', 'v1']) {
        try {
            // 1. Probar vía x-goog-api-key header
            const res = await fetch(`https://generativelanguage.googleapis.com/${ver}/models`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': cleanKey
            },
              signal: AbortSignal.timeout(8000)
      })

          const data = await res.json()

            if (res.ok && Array.isArray(data?.models) && data.models.length > 0) {
              const filtered = data.models
                .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
                .map((m: any) => ({
                  name: String(m.name || '').replace(/^models\//, ''),
                  displayName: m.displayName || String(m.name || '').replace(/^models\//, '')
                }))

                const preferredDefaults = [
                  'gemini-2.0-flash',
                  'gemini-1.5-flash-latest',
                  'gemini-1.5-flash',
                  'gemini-2.0-flash-lite'
                ]

                let defaultModel = filtered.find((m: any) => preferredDefaults.includes(m.name))?.name
                if (!defaultModel && filtered.length > 0) {
                  defaultModel = filtered.find((m: any) => m.name.includes('flash'))?.name || filtered[0].name
                }

                return {
                  models: filtered,
                  defaultModel: defaultModel || 'gemini-2.0-flash'
                }
              }

              if (data?.error) {
                lastErrorMsg = data.error.message || `Error ${res.status}`
                lastReason = data.error.details?.[0]?.reason || data.error.status || ''
              }
            } catch (e: any) {
              lastErrorMsg = e.message
            }
          }

        // Si Google rechaza ListModels (por ejemplo, ACCESS_TOKEN_TYPE_UNSUPPORTED en claves AQ. restringidas),
        // proporcionamos los modelos estándar funcionales para que el usuario no quede bloqueado
        const standardFallback = [
          { name: 'gemini-2.0-flash', displayName: 'gemini-2.0-flash (Recomendado, rápido y última generación)' },
          { name: 'gemini-1.5-flash-latest', displayName: 'gemini-1.5-flash-latest (Estable)' },
          { name: 'gemini-1.5-flash', displayName: 'gemini-1.5-flash' },
          { name: 'gemini-2.0-flash-lite', displayName: 'gemini-2.0-flash-lite (Ultra veloz)' }
        ]

  if(lastReason === 'ACCESS_TOKEN_TYPE_UNSUPPORTED' || lastErrorMsg.includes('API key not valid')) {
              // Si la clave es un formato AQ. que no soporta ListModels en este endpoint, retornar la lista estándar
              return {
                models: standardFallback,
                defaultModel: 'gemini-2.0-flash'
    }
          }

          const detailInfo = lastReason ? ` [${lastReason}]` : ''
          throw new Error(`Google Gemini no autorizó la consulta de modelos: ${lastErrorMsg}${detailInfo}`)
        }

        /**
         * Calls Google Gemini REST API directly with strict timeout (10s) and fast fallback.
         * Solves 504 Gateway Timeouts by never exceeding proxy limits.
         */
          export async function callGemini(
            apiKey: string,
            model: string,
            userPrompt: string,
            systemPrompt?: string,
            options?: { temperature?: number; maxTokens?: number }
): Promise < string > {
            const cleanKey = apiKey.trim().replace(/^["']|["']$/g, '')
  const cleanTargetModel = (model || '').trim().replace(/^models\//, '') || 'gemini-2.0-flash'

            // Modelos candidatos rápidos (máximo 2 intentos)
            const candidateModels = [cleanTargetModel]
            if (cleanTargetModel !== 'gemini-2.0-flash' && cleanTargetModel !== 'gemini-1.5-flash') {
              candidateModels.push('gemini-2.0-flash')
            }
              if (!candidateModels.includes('gemini-1.5-flash')) {
                candidateModels.push('gemini-1.5-flash')
              }

              let lastError: Error | null = null

              // Intentar con cada modelo candidato con un timeout estricto de 10s
              for (const currentModel of candidateModels) {
                try {
                  // Método principal: fetch directo a la API de Google (rápido y sin bloqueos de SDK)
                  const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${encodeURIComponent(cleanKey)}`

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
                        'x-goog-api-key': cleanKey
                      },
                      body: JSON.stringify(payload),
                      signal: AbortSignal.timeout(10000) // Timeout estricto de 10 segundos
                    })

                    const data = await res.json()

                    if (res.ok) {
                      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
                      if (text && typeof text === 'string' && text.trim()) {
                        return text.trim()
                      }
                    }

                  const errorInfo = data?.error
                  const rawMsg = errorInfo?.message || `HTTP ${res.status}`
                  const reason = errorInfo?.details?.[0]?.reason || errorInfo?.status || ''

                  // Si el modelo da 404 (retirado), probar el siguiente candidato
                  if (res.status === 404 || rawMsg.toLowerCase().includes('not found')) {
                    lastError = new Error(`El modelo "${currentModel}" no está disponible en Google Gemini. (${rawMsg})`)
                    continue
                  }

                      if (res.status === 401 || reason === 'API_KEY_INVALID' || rawMsg.toLowerCase().includes('api key not valid')) {
                        throw new Error(`API Key de Google Gemini inválida o no autorizada. Revisa tu clave en Google AI Studio. (${rawMsg})`)
                      }

                      if (res.status === 429 || reason === 'RESOURCE_EXHAUSTED') {
                        throw new Error('Límite de cuota excedido en Google Gemini. Intenta más tarde o revisa tu cuota en Google AI Studio.')
                      }

                      throw new Error(`Google Gemini (${res.status}): ${rawMsg} ${reason ? `[${reason}]` : ''}`)
                    } catch (err: any) {
                      if (err.name === 'TimeoutError' || err.message?.includes('timeout') || err.message?.includes('aborted')) {
                        throw new Error('Tiempo de espera agotado al conectar con Google Gemini. La API tardó más de 10 segundos.')
                      }
                      if (err.message?.includes('Google Gemini (') || err.message?.includes('API Key de Google Gemini inválida')) {
                        throw err
                      }
                      lastError = err
                    }
                  }

                  // Fallback rápido con SDK oficial @google/genai si fetch dio error de modelo
                  try {
                    const ai = new GoogleGenAI({ apiKey: cleanKey })
                    for (const currentModel of candidateModels) {
                      try {
                        const response: any = await ai.models.generateContent({
                          model: currentModel,
                          contents: userPrompt,
                          config: {
                            systemInstruction: systemPrompt || undefined,
                            temperature: options?.temperature ?? 0.7,
                            maxOutputTokens: options?.maxTokens ?? 1000
                          }
                        })
                        const text = response?.text
                        if (text && typeof text === 'string' && text.trim()) {
                          return text.trim()
                        }
                      } catch (sdkErr: any) {
                        lastError = sdkErr
                      }
                    }
                  } catch (sdkInitErr: any) {
                    lastError = sdkInitErr
                  }

                  throw lastError || new Error('No se pudo obtener respuesta de Google Gemini. Verifica tu API Key y conexión.')
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
                  const cleanKey = apiKey.trim().replace(/^["']|["']$/g, '')
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
      Authorization: `Bearer ${cleanKey}`
                    },
                    body: JSON.stringify({
                      model: model || 'gpt-4o-mini',
                      messages,
                      temperature: options?.temperature ?? 0.7,
                      max_tokens: options?.maxTokens ?? 1000
                  }),
                    signal: AbortSignal.timeout(12000)
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

                const cleanKey = params.apiKey.trim().replace(/^["']|["']$/g, '')
                const provider = detectProvider(cleanKey, params.provider)
                const model = (params.model || '').trim() || (provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o-mini')

                const testPrompt = 'Por favor responde únicamente con la palabra OK si puedes leer este mensaje.'

                let responseText = ''
                if (provider === 'gemini') {
                  responseText = await callGemini(
                    cleanKey,
                    model,
                    testPrompt,
                    'Eres un asistente de prueba.',
                    { maxTokens: 20 }
                  )
                } else {
                  responseText = await callOpenAI(
                    cleanKey,
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
