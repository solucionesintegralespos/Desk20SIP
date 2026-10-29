import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generateAIResponse } from '@/lib/ai'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    const { text, subject } = await request.json()

    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: 'El texto es requerido' },
        { status: 400 }
      )
    }

    const result = await generateAIResponse({
      systemPrompt:
        'Eres un asistente experto en redactar tickets de soporte técnico. Tu tarea es mejorar la descripción del ticket haciéndola más clara, profesional y detallada, manteniendo toda la información relevante. Usa un tono profesional pero amigable. Responde SOLO con el texto mejorado, sin agregar comentarios adicionales ni introducciones.',
      userPrompt: `Asunto del ticket: ${subject || 'Sin asunto'}\n\nDescripción actual:\n${text}\n\nMejora esta descripción haciendo que sea más clara, estructurada y profesional. Mantén toda la información importante.`,
      temperature: 0.7,
      maxTokens: 500
    })

    const improvedText = result.text || text

    return NextResponse.json({
      improvedText,
      provider: result.provider,
      model: result.model
    })
  } catch (error: any) {
    console.error('Error al mejorar texto con IA:', error)
    return NextResponse.json(
      { error: error?.message || 'Error al mejorar el texto con IA. Verifica tu API Key en Configuración.' },
      { status: 500 }
    )
  }
}
