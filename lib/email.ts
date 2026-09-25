import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

let transporter: Transporter | null = null
// Created on first use so scripts and tests read the configuration they load.
function mailer() {
  if (!transporter) {
    const port = parseInt(process.env.SMTP_PORT || '587')
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      // An unreachable server must not hold the request that saved the record.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    })
  }
  return transporter
}

export interface EmailAttachment {
  filename: string
  content: Buffer
  contentType: string
  cid?: string
}

interface SendEmailParams {
  to: string | null
  subject: string
  html: string
  text?: string
  attachments?: EmailAttachment[]
}

export type SendEmailResult =
  | { success: true; messageId: string }
  | { success: false; message: string; error?: unknown }

export async function sendEmail({ to, subject, html, text, attachments }: SendEmailParams): Promise<SendEmailResult> {
  try {
    if (!to) return { success: false, message: "El cliente no tiene correo" };
    // Skip sending if no SMTP configuration
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
      console.log('Email skipped - No SMTP configuration')
      return { success: false, message: 'No SMTP configuration' }
    }

    const info = await mailer().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text: text || html.replace(/<[^>]*>/g, ''),
      html,
      attachments,
    })

    console.log('Email sent:', info.messageId)
    return { success: true, messageId: info.messageId }
  } catch (error) {
    console.error('Error sending email:', error)
    return { success: false, message: error instanceof Error ? error.message : 'Error SMTP', error }
  }
}

const htmlEntities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, char => htmlEntities[char])
}
// Plain text from users keeps its line breaks without allowing markup.
const multiline = (value: unknown) => escapeHtml(value).replace(/\r?\n/g, '<br>')

export function getTicketCreatedEmailTemplate(data: {
  customerName: string | null
  ticketNumber: number
  subject: string
  description: string
}) {
  return {
    subject: `Ticket #${data.ticketNumber} creado - ${data.subject}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #3b82f6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .ticket-info { background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Ticket Creado</h1>
          </div>
          <div class="content">
            <p>Hola <strong>${escapeHtml(data.customerName)}</strong>,</p>
            <p>Tu ticket ha sido creado exitosamente. Nuestro equipo de soporte lo revisará pronto.</p>

            <div class="ticket-info">
              <h2>Ticket #${data.ticketNumber}</h2>
              <p><strong>Asunto:</strong> ${escapeHtml(data.subject)}</p>
              <p><strong>Descripción:</strong></p>
              <p>${multiline(data.description)}</p>
            </div>

            <p>Te notificaremos por email cuando haya actualizaciones en tu ticket.</p>
            <p>Gracias por contactarnos.</p>
          </div>
          <div class="footer">
            <p>SIP SOPORTE - Sistema de Soporte Técnico</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }
}

export function getTicketReplyEmailTemplate(data: {
  customerName: string | null
  ticketNumber: number
  subject: string
  replyContent: string
  agentName: string
}) {
  return {
    subject: `Re: Ticket #${data.ticketNumber} - ${data.subject}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .reply-box { background-color: white; padding: 20px; border-left: 4px solid #10b981; margin: 20px 0; border-radius: 4px; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Nueva Respuesta en tu Ticket</h1>
          </div>
          <div class="content">
            <p>Hola <strong>${escapeHtml(data.customerName)}</strong>,</p>
            <p>Has recibido una nueva respuesta en tu ticket <strong>#${data.ticketNumber}</strong>.</p>

            <div class="reply-box">
              <p><strong>${escapeHtml(data.agentName)}</strong> respondió:</p>
              <p>${multiline(data.replyContent)}</p>
            </div>

            <p>Puedes responder directamente a este ticket desde tu portal de soporte.</p>
          </div>
          <div class="footer">
            <p>SIP SOPORTE - Sistema de Soporte Técnico</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }
}

// Table layout with inline styles: Outlook, Gmail and mobile clients ignore most modern CSS.
export function getServiceOrderEmailTemplate(data: {
  orgName: string
  customerName: string
  orderNumber: string
  serviceName: string
  status: string
  serviceDate: string
  technician: string
  viewUrl?: string
  logoCid?: string
}) {
  const e = escapeHtml
  const row = (label: string, value: string) => `<tr>
    <td style="padding:6px 0;color:#64748b;font-size:14px;width:40%;vertical-align:top;">${e(label)}</td>
    <td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:bold;vertical-align:top;">${e(value)}</td></tr>`
  const year = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'America/Bogota' }).format(new Date())
  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${e(data.orderNumber)}</title></head>
<body style="margin:0;padding:0;background-color:#f4f6fb;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6fb;">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #dbe6fa;">
    <tr><td align="center" style="background-color:#063d92;padding:28px 24px;">
      ${data.logoCid ? `<img src="cid:${e(data.logoCid)}" alt="${e(data.orgName)}" height="56" style="display:block;height:56px;max-width:200px;border:0;margin:0 auto 12px;">` : ''}
      <p style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">${e(data.orgName)}</p>
      <p style="margin:4px 0 0;color:#dbe6fa;font-size:13px;">Sistema de Soporte Técnico</p>
    </td></tr>
    <tr><td style="font-size:0;line-height:0;height:4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td height="4" style="background-color:#ff514f;width:34%;"></td><td height="4" style="background-color:#ffbf00;width:33%;"></td><td height="4" style="background-color:#86c449;width:33%;"></td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:32px 32px 8px;color:#0f172a;">
      <p style="margin:0 0 12px;font-size:18px;">Hola, <strong>${e(data.customerName)}</strong></p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">Tu orden de servicio ha sido creada correctamente.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef3fc;border-left:4px solid #063d92;border-radius:6px;">
        <tr><td style="padding:16px 20px;">
          <p style="margin:0 0 8px;font-size:18px;font-weight:bold;color:#063d92;">Orden ${e(data.orderNumber)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${row('Servicio', data.serviceName)}
            ${row('Estado', data.status)}
            ${row('Fecha del servicio', data.serviceDate)}
            ${row('Técnico', data.technician)}
          </table>
        </td></tr>
      </table>
    </td></tr>
    ${data.viewUrl ? `<tr><td align="center" style="padding:24px 32px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#063d92" style="border-radius:8px;">
        <a href="${e(data.viewUrl)}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">Ver orden de servicio</a>
      </td></tr></table>
    </td></tr>` : ''}
    <tr><td style="padding:16px 32px 32px;">
      <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">Encontrarás el PDF de la orden adjunto a este correo.</p>
    </td></tr>
    <tr><td align="center" style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 24px;">
      <p style="margin:0 0 4px;font-size:12px;color:#64748b;">© ${year} ${e(data.orgName)}</p>
      <p style="margin:0;font-size:12px;color:#94a3b8;">Este correo fue generado automáticamente. Por favor no respondas a este mensaje.</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`
  const text = [
    `Hola, ${data.customerName}`, '', 'Tu orden de servicio ha sido creada correctamente.', '',
    `Orden ${data.orderNumber}`, `Servicio: ${data.serviceName}`, `Estado: ${data.status}`,
    `Fecha del servicio: ${data.serviceDate}`, `Técnico: ${data.technician}`, '',
    ...(data.viewUrl ? [`Ver orden de servicio: ${data.viewUrl}`, ''] : []),
    'Encontrarás el PDF de la orden adjunto a este correo.', '', `© ${year} ${data.orgName}`,
  ].join('\n')
  return { subject: `Orden de servicio ${data.orderNumber} - ${data.orgName}`, html, text }
}
