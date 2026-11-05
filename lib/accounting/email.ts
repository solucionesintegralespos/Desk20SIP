import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { sendEmail, escapeHtml, type EmailAttachment } from '@/lib/email'
import { brandLogo } from '@/lib/order-email'
import { formatMoney, formatDateCO, periodLabel } from './format'
import { billingPdfBuffer, billingFileName, publicBillingUrl, type BillingSnapshot } from './billing'
import { quotePdfBuffer, quoteFileName, quoteInclude } from './quotes'
import { formatQuoteNumber } from './format'

// Email delivery of quotes and billing accounts: same SMTP transport and the same PDF
// that the download endpoints serve. Never throws; the result is shown to the user.
export interface DocumentEmailResult { status: 'sent' | 'failed' | 'skipped'; recipient: string | null; message: string }
const emailSchema = z.string().trim().email().max(254)

interface TemplateInput {
  orgName: string; customerName: string; heading: string; intro: string; documentTitle: string
  rows: Array<[string, string]>; viewUrl?: string; viewLabel?: string; logoCid?: string; closing: string
}
// Table layout with inline styles: Outlook, Gmail and mobile clients ignore most modern CSS.
export function getDocumentEmailTemplate(data: TemplateInput) {
  const e = escapeHtml
  const row = (label: string, value: string) => `<tr>
    <td style="padding:6px 0;color:#64748b;font-size:14px;width:40%;vertical-align:top;">${e(label)}</td>
    <td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:bold;vertical-align:top;">${e(value)}</td></tr>`
  const year = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'America/Bogota' }).format(new Date())
  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${e(data.documentTitle)}</title></head>
<body style="margin:0;padding:0;background-color:#f4f6fb;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6fb;">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #dbe6fa;">
    <tr><td align="center" style="background-color:#063d92;padding:28px 24px;">
      ${data.logoCid ? `<img src="cid:${e(data.logoCid)}" alt="${e(data.orgName)}" height="56" style="display:block;height:56px;max-width:200px;border:0;margin:0 auto 12px;">` : ''}
      <p style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">${e(data.orgName)}</p>
      <p style="margin:4px 0 0;color:#dbe6fa;font-size:13px;">${e(data.heading)}</p>
    </td></tr>
    <tr><td style="font-size:0;line-height:0;height:4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td height="4" style="background-color:#ff514f;width:34%;"></td><td height="4" style="background-color:#ffbf00;width:33%;"></td><td height="4" style="background-color:#86c449;width:33%;"></td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:32px 32px 8px;color:#0f172a;">
      <p style="margin:0 0 12px;font-size:18px;">Hola, <strong>${e(data.customerName)}</strong></p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">${e(data.intro)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef3fc;border-left:4px solid #063d92;border-radius:6px;">
        <tr><td style="padding:16px 20px;">
          <p style="margin:0 0 8px;font-size:18px;font-weight:bold;color:#063d92;">${e(data.documentTitle)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${data.rows.map(([label, value]) => row(label, value)).join('')}</table>
        </td></tr>
      </table>
    </td></tr>
    ${data.viewUrl ? `<tr><td align="center" style="padding:24px 32px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#063d92" style="border-radius:8px;">
        <a href="${e(data.viewUrl)}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">${e(data.viewLabel || 'Ver documento')}</a>
      </td></tr></table>
    </td></tr>` : ''}
    <tr><td style="padding:16px 32px 32px;">
      <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">${e(data.closing)}</p>
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
  const text = [`Hola, ${data.customerName}`, '', data.intro, '', data.documentTitle, ...data.rows.map(([label, value]) => `${label}: ${value}`), '',
    ...(data.viewUrl ? [`${data.viewLabel || 'Ver documento'}: ${data.viewUrl}`, ''] : []), data.closing, '', `© ${year} ${data.orgName}`].join('\n')
  return { html, text }
}

async function logoAttachment(logoUrl: string): Promise<EmailAttachment | undefined> {
  const logo = await brandLogo(logoUrl)
  return logo ? { filename: `logo.${logo.ext}`, content: logo.data, contentType: logo.contentType, cid: 'org-logo' } : undefined
}
const failure = (error: unknown) => { console.error('[ACCOUNTING_EMAIL]', error); return 'No fue posible enviar el correo. El documento sigue registrado correctamente.' }

export async function sendQuoteEmail(quoteId: string, actorId: string): Promise<DocumentEmailResult> {
  const finish = async (status: DocumentEmailResult['status'], recipient: string | null, message: string) => {
    try { await prisma.serviceAuditEvent.create({ data: { actorId, entityId: quoteId, action: `quotes:email-${status}` } }) } catch { /* The audit trail must not hide the send result. */ }
    return { status, recipient, message }
  }
  try {
    const quote = await prisma.quote.findUnique({ where: { id: quoteId }, include: quoteInclude })
    if (!quote) return finish('failed', null, 'La cotización no existe.')
    // Registered customers use their current email; unregistered ones the email typed on the quote.
    const snapshotEmail = (quote.customerSnapshot as { email?: string | null } | null)?.email || ''
    const recipient = quote.customer ? quote.customer.email ?? '' : snapshotEmail
    const email = emailSchema.safeParse(recipient)
    if (!email.success) return finish('skipped', recipient || null, quote.customer ? 'El cliente no tiene un correo válido registrado. Agrega el correo en Clientes y vuelve a intentarlo.' : 'La cotización no tiene un correo de destino. Crea una nueva con el correo del cliente para enviarla.')
    const company = quote.companySnapshot as { name: string; logoUrl: string }
    const number = formatQuoteNumber(quote.number)
    const pdf = await quotePdfBuffer(quote)
    const logo = await logoAttachment(company.logoUrl || '')
    const customerName = quote.customer?.name || (quote.customerSnapshot as { name?: string } | null)?.name || email.data
    const template = getDocumentEmailTemplate({
      orgName: company.name, customerName, heading: 'Cotización', intro: 'Adjuntamos la cotización solicitada. Quedamos atentos a cualquier inquietud.',
      documentTitle: `${quote.title} ${number}`, rows: [['Fecha', formatDateCO(quote.createdAt)], ['Subtotal', formatMoney(Math.round(Number(quote.subtotal) * 100))], ...(quote.taxName ? [[quote.taxName, formatMoney(Math.round(Number(quote.taxAmount) * 100))] as [string, string]] : []), ['Total', formatMoney(Math.round(Number(quote.total) * 100))]],
      closing: 'Encontrarás el PDF de la cotización adjunto a este correo.',
      logoCid: logo ? 'org-logo' : undefined,
    })
    const attachments: EmailAttachment[] = [{ filename: quoteFileName(quote), content: pdf, contentType: 'application/pdf' }]
    if (logo) attachments.push(logo)
    const result = await sendEmail({ to: email.data, subject: `${quote.title} ${number} - ${company.name}`, html: template.html, text: template.text, attachments })
    if (result.success) return finish('sent', email.data, `Cotización enviada a ${email.data}.`)
    return finish('failed', email.data, failure(result.message))
  } catch (error) { return finish('failed', null, failure(error)) }
}

export async function sendBillingEmail(accountId: string, actorId: string): Promise<DocumentEmailResult> {
  const finish = async (status: DocumentEmailResult['status'], recipient: string | null, message: string) => {
    try { await prisma.serviceAuditEvent.create({ data: { actorId, entityId: accountId, action: `billing:email-${status}` } }) } catch { /* see above */ }
    return { status, recipient, message }
  }
  try {
    const account = await prisma.billingAccount.findUnique({ where: { id: accountId }, include: { customer: { select: { name: true, email: true, businessName: true } } } })
    if (!account) return finish('failed', null, 'La cuenta de cobro no existe.')
    if (account.status === 'VOID') return finish('skipped', null, 'La cuenta está anulada y no se envía.')
    const email = emailSchema.safeParse(account.customer.email ?? '')
    if (!email.success) return finish('skipped', account.customer.email || null, 'El cliente no tiene un correo válido registrado. Agrega el correo en Clientes y vuelve a intentarlo.')
    const snapshot = account.snapshot as unknown as BillingSnapshot
    const pdf = await billingPdfBuffer(account)
    const logo = await logoAttachment(snapshot.logoUrl || '')
    const number = String(account.number).padStart(2, '0')
    const template = getDocumentEmailTemplate({
      orgName: snapshot.company.name, customerName: account.customer.businessName || account.customer.name || email.data, heading: 'Cuenta de cobro',
      intro: 'Adjuntamos la cuenta de cobro correspondiente. Agradecemos su pago dentro del plazo indicado.',
      documentTitle: `Cuenta de cobro No. ${number}`,
      rows: [['Fecha', formatDateCO(snapshot.issuedAt)], ...(snapshot.dueAt ? [['Vencimiento', formatDateCO(snapshot.dueAt)] as [string, string]] : []), ...(account.period ? [['Período', periodLabel(account.period)] as [string, string]] : []), ['Concepto', snapshot.concept], ['Total', formatMoney(snapshot.totalCents)]],
      viewUrl: account.publicEnabled ? publicBillingUrl(account.publicToken) : undefined, viewLabel: 'Ver cuenta de cobro',
      closing: 'Encontrarás el PDF de la cuenta de cobro adjunto a este correo.', logoCid: logo ? 'org-logo' : undefined,
    })
    const attachments: EmailAttachment[] = [{ filename: billingFileName(account), content: pdf, contentType: 'application/pdf' }]
    if (logo) attachments.push(logo)
    const result = await sendEmail({ to: email.data, subject: `Cuenta de cobro No. ${number} - ${snapshot.company.name}`, html: template.html, text: template.text, attachments })
    if (result.success) return finish('sent', email.data, `Cuenta de cobro enviada a ${email.data}.`)
    return finish('failed', email.data, failure(result.message))
  } catch (error) { return finish('failed', null, failure(error)) }
}
