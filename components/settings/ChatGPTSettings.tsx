'use client'

import { useState, useEffect } from 'react'
import { Sparkles, Key, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, ExternalLink, RefreshCw } from 'lucide-react'

interface ChatGPTSettingsProps {
  initialApiKey?: string
  initialProvider?: string
  initialModel?: string
}

export default function ChatGPTSettings({
  initialApiKey = '',
  initialProvider = 'auto',
  initialModel = ''
}: ChatGPTSettingsProps) {
  const [apiKey, setApiKey] = useState(initialApiKey)
  const [provider, setProvider] = useState<'gemini' | 'openai' | 'auto'>(
    (initialProvider as any) || 'auto'
  )
  const [model, setModel] = useState(initialModel)
  const [showApiKey, setShowApiKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [detectingModels, setDetectingModels] = useState(false)
  const [customGeminiModels, setCustomGeminiModels] = useState<Array<{ value: string; label: string }>>([])
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Determina el placeholder según el proveedor
  const getPlaceholder = () => {
    if (provider === 'gemini') return 'AIzaSy... o AQ.Ab8RN...'
    if (provider === 'openai') return 'sk-proj-... o sk-...'
    return 'AIzaSy... / AQ... (Google Gemini) o sk-... (OpenAI)'
  }

  // Modelos disponibles según proveedor
  const getModelOptions = () => {
    if (provider === 'openai') {
      return [
        { value: 'gpt-4o-mini', label: 'gpt-4o-mini (Recomendado, rápido y económico)' },
        { value: 'gpt-4o', label: 'gpt-4o (Mayor capacidad)' },
        { value: 'gpt-3.5-turbo', label: 'gpt-3.5-turbo' }
      ]
    }

    if (customGeminiModels.length > 0) {
      return customGeminiModels
    }

    return [
      { value: 'gemini-3.8-flash', label: 'gemini-3.8-flash (Recomendado, rápido y equilibrado)' },
      { value: 'gemini-3.5-flash-lite', label: 'gemini-3.5-flash-lite (Ultra veloz y económico)' },
      { value: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite (Ligero y alta frecuencia)' },
      { value: 'gemini-4-argon', label: 'gemini-4-argon (Máxima capacidad y razonamiento)' }
    ]
  }

    const handleDetectModels = async (silent = false) => {
      if (!apiKey.trim()) {
        if (!silent) {
          setMessage({ type: 'error', text: 'Ingresa primero la API Key para detectar los modelos disponibles.' })
        }
        return
      }

      setDetectingModels(true)
      if (!silent) setMessage(null)

      try {
        const res = await fetch('/api/ai/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: apiKey.trim() })
        })

        const data = await res.json()

        if (res.ok && Array.isArray(data.models) && data.models.length > 0) {
          const formatted = data.models.map((m: any) => ({
            value: m.name,
            label: `${m.name}${m.displayName && m.displayName !== m.name ? ` (${m.displayName})` : ''}`
          }))
          setCustomGeminiModels(formatted)
          if (data.defaultModel && (!model || !formatted.some((f: any) => f.value === model))) {
            setModel(data.defaultModel)
          }
          if (!silent) {
            setMessage({
              type: 'success',
              text: `Se detectaron ${formatted.length} modelos disponibles en tu cuenta de Google.`
            })
          }
        } else if (!silent) {
          setMessage({
          type: 'error',
            text: data.error || 'No se pudieron consultar los modelos de Google Gemini.'
          })
        }
      } catch (err: any) {
        if (!silent) {
          setMessage({
            type: 'error',
          text: err?.message || 'Error de red al consultar modelos.'
          })
        }
      } finally {
        setDetectingModels(false)
        if (!silent) {
          setTimeout(() => setMessage(null), 6000)
        }
      }
    }

    // Cargar modelos automáticamente al cargar la pantalla si hay una API Key
    useEffect(() => {
      if (apiKey.trim() && provider !== 'openai') {
        handleDetectModels(true)
      }
    }, [provider])

    const handleTestConnection = async () => {
      if (!apiKey.trim()) {
        setTestResult({
          success: false,
          message: 'Por favor ingresa primero la API Key para probar.'
        })
        return
      }

      setTesting(true)
      setTestResult(null)

      try {
        const res = await fetch('/api/ai/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: apiKey.trim(),
            provider,
            model: model || undefined
          })
        })

        const data = await res.json()

        if (res.ok && data.success) {
          setTestResult({
            success: true,
            message: data.message || 'Conexión exitosa con la Inteligencia Artificial.'
          })
        } else {
          setTestResult({
            success: false,
            message: data.error || 'Error al conectar con la API de IA.'
          })
        }
      } catch (error: any) {
        setTestResult({
          success: false,
          message: error?.message || 'Error de red al probar conexión con IA.'
        })
      } finally {
        setTesting(false)
      }
    }

    const handleSave = async () => {
      setSaving(true)
      setMessage(null)

      try {
        const settingsPayload: Record<string, string> = {
          ai_provider: provider,
          ai_api_key: apiKey.trim(),
          ai_model: model.trim(),
          // Compatibilidad retroactiva:
          chatgpt_api_key: apiKey.trim(),
          gemini_api_key: apiKey.trim()
        }

        const response = await fetch('/api/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ settings: settingsPayload }),
        })

        if (response.ok) {
          setMessage({
            type: 'success',
            text: 'Configuración de Inteligencia Artificial guardada correctamente.'
          })
        } else {
          const data = await response.json()
          setMessage({ type: 'error', text: data.error || 'Error al guardar la configuración' })
        }
      } catch (error) {
        setMessage({ type: 'error', text: 'Error al guardar la configuración' })
      } finally {
        setSaving(false)
        setTimeout(() => setMessage(null), 5000)
      }
    }

    return (
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-indigo-50 rounded-lg">
                <Sparkles className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Inteligencia Artificial (IA)</h2>
                <p className="text-xs text-gray-500">Google Gemini & OpenAI ChatGPT</p>
              </div>
            </div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
              Gemini Soportado
            </span>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {message && (
            <div
              className={`px-4 py-3 rounded-lg flex items-center space-x-2 text-sm ${message.type === 'success'
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
                }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* Selector de Proveedor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Proveedor de IA
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setProvider('gemini')
                  if (!model.startsWith('gemini')) setModel('gemini-3.8-flash')
                }}
                className={`p-3 rounded-lg border text-left transition relative ${provider === 'gemini'
                    ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                    : 'border-gray-200 hover:border-gray-300'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm text-gray-900">Google Gemini</span>
                  <span className="text-[10px] bg-green-100 text-green-700 font-semibold px-1.5 py-0.5 rounded">
                    Gratis
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Clave AIza... o AQ...</p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setProvider('openai')
                  if (!model.startsWith('gpt')) setModel('gpt-4o-mini')
                }}
                className={`p-3 rounded-lg border text-left transition ${provider === 'openai'
                    ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                    : 'border-gray-200 hover:border-gray-300'
                  }`}
              >
                <span className="font-medium text-sm text-gray-900">OpenAI ChatGPT</span>
                <p className="text-xs text-gray-500 mt-1">Clave sk-...</p>
              </button>

              <button
                type="button"
                onClick={() => setProvider('auto')}
                className={`p-3 rounded-lg border text-left transition ${provider === 'auto'
                    ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                    : 'border-gray-200 hover:border-gray-300'
                  }`}
              >
                <span className="font-medium text-sm text-gray-900">Auto-detección</span>
                <p className="text-xs text-gray-500 mt-1">Detecta por formato de clave</p>
              </button>
            </div>
          </div>

          {/* Campo API Key */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                API Key {provider === 'gemini' ? 'de Google Gemini' : provider === 'openai' ? 'de OpenAI' : ''}
              </label>
              {provider !== 'openai' ? (
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium"
                >
                  Obtener gratis en Google AI Studio <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium"
                >
                  Obtener en OpenAI <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={getPlaceholder()}
                className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                title={showApiKey ? 'Ocultar' : 'Mostrar'}
              >
                {showApiKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {apiKey.startsWith('AIza') || apiKey.startsWith('AQ.') ? (
                <span className="text-emerald-600 font-medium">✓ Formato Google Gemini detectado</span>
              ) : apiKey.startsWith('sk-') ? (
                <span className="text-blue-600 font-medium">✓ Formato OpenAI ChatGPT detectado</span>
              ) : (
                'Ingresa tu clave de Google Gemini (inicia con AIzaSy... o AQ...) o de OpenAI (inicia con sk-...)'
              )}
            </p>
          </div>

          {/* Selector de Modelo con botón para detectar modelos */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">
                Modelo
              </label>
              {provider !== 'openai' && (
                <button
                  type="button"
                  onClick={() => handleDetectModels(false)}
                  disabled={detectingModels || !apiKey.trim()}
                  className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium disabled:opacity-50"
                >
                  {detectingModels ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Detectando...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3 w-3" />
                      <span>Detectar modelos disponibles</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">Por defecto (Recomendado según proveedor: gemini-3.8-flash)</option>
              {getModelOptions().map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Modelos detectados en vivo */}
            {customGeminiModels.length > 0 && provider !== 'openai' && (
              <div className="mt-2.5 p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg text-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-indigo-950 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Modelos activos en tu cuenta de Google ({customGeminiModels.length}):
                  </span>
                  <span className="text-[10px] text-indigo-600">Haz clic en uno para seleccionarlo</span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {customGeminiModels.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setModel(m.value)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition shadow-sm ${model === m.value
                          ? 'bg-indigo-600 text-white font-medium ring-2 ring-indigo-400'
                          : 'bg-white border border-gray-200 text-gray-700 hover:border-indigo-400 hover:bg-indigo-50/30'
                        }`}
                    >
                      {m.value}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Resultado de prueba de conexión */}
          {testResult && (
            <div
              className={`p-3 rounded-lg text-xs flex items-start space-x-2 ${testResult.success
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
                }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 break-words">{testResult.message}</div>
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || !apiKey.trim()}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 text-sm font-medium"
            >
              {testing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                  <span>Probando conexión...</span>
                </>
              ) : (
                <>
                  <Key className="h-4 w-4" />
                  <span>Probar Conexión</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !apiKey.trim()}
              className="flex-1 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 text-sm font-medium"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>Guardar Configuración de IA</span>
              )}
            </button>
          </div>

          {/* Nota informativa */}
          <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg p-3 text-xs text-indigo-900 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
              ¿Dónde se utiliza la Inteligencia Artificial?
            </p>
            <ul className="list-disc list-inside text-indigo-800 space-y-0.5 pl-1">
              <li>Botón <strong>&quot;Mejorar con IA&quot;</strong> al crear o editar tickets.</li>
              <li>Asistente virtual al escribir <strong>@ia</strong> en las notas o mensajes de tickets.</li>
            </ul>
          </div>
        </div>
      </div>
    )
  }
