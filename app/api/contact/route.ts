import { NextResponse } from 'next/server'
import { z } from 'zod'
import { sendEmail, escapeHtml } from '@/lib/email'
import { rateLimitAll, clientIp, tooManyRequests, MINUTE } from '@/lib/rate-limit'

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
})

export async function POST(request: Request) {
  try {
    // Public form: limit submissions per address and per destination email.
    const body = await request.json().catch(() => null)
    const parsed = contactSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Todos los campos son requeridos' },
        { status: 400 }
      )
    }
    const limit = rateLimitAll([[`contact:ip:${clientIp(request.headers)}`, 5, 60 * MINUTE], [`contact:email:${parsed.data.email.toLowerCase()}`, 3, 60 * MINUTE]])
    if (!limit.ok) return tooManyRequests(limit.retryAfter)
    // Everything typed by the visitor is escaped before it goes into HTML.
    const name = escapeHtml(parsed.data.name), email = escapeHtml(parsed.data.email), subject = escapeHtml(parsed.data.subject)
    const message = escapeHtml(parsed.data.message)

    // Email para el administrador (notificación)
    const adminEmailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
            .info-row { margin: 15px 0; padding: 10px; background: white; border-radius: 4px; }
            .label { font-weight: bold; color: #2563eb; }
            .message-box { background: white; padding: 20px; border-left: 4px solid #2563eb; margin-top: 20px; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">Nuevo Mensaje de Contacto</h1>
            </div>
            <div class="content">
              <p>Has recibido un nuevo mensaje desde el formulario de contacto:</p>
              
              <div class="info-row">
                <span class="label">Nombre:</span> ${name}
              </div>
              
              <div class="info-row">
                <span class="label">Email:</span> ${email}
              </div>
              
              <div class="info-row">
                <span class="label">Asunto:</span> ${subject}
              </div>
              
              <div class="message-box">
                <p class="label">Mensaje:</p>
                <p>${message.replace(/\n/g, '<br>')}</p>
              </div>
            </div>
            <div class="footer">
              <p>Este es un mensaje automático de SIP SOPORTE</p>
            </div>
          </div>
        </body>
      </html>
    `

    // Email de confirmación para el usuario
    const userEmailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
            .message-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
            .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">Gracias por Contactarnos</h1>
            </div>
            <div class="content">
              <p>Hola,</p>
              <p>Hemos recibido tu mensaje y te responderemos lo antes posible.</p>
              
              <p>Nuestro equipo revisará tu consulta y te contactaremos pronto.</p>
              
              <p style="margin-top: 30px;">
                Saludos,<br>
                <strong>El equipo de SIP SOPORTE</strong>
              </p>
            </div>
            <div class="footer">
              <p>Este es un mensaje automático, por favor no respondas a este correo.</p>
            </div>
          </div>
        </body>
      </html>
    `

    // Enviar email al administrador
    await sendEmail({
      to: process.env.SMTP_USER || '',
      subject: `Nuevo mensaje de contacto: ${parsed.data.subject.replace(/[\r\n]+/g, ' ')}`,
      html: adminEmailHtml,
    })

    // Enviar email de confirmación al usuario
    await sendEmail({
      to: parsed.data.email,
      subject: 'Confirmación de tu mensaje - SIP SOPORTE',
      html: userEmailHtml,
    })

    return NextResponse.json({ 
      message: 'Mensaje enviado correctamente' 
    }, { status: 200 })

  } catch (error) {
    console.error('Error sending contact email:', error)
    return NextResponse.json(
      { error: 'Error al enviar el mensaje' },
      { status: 500 }
    )
  }
}
