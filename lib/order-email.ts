import { readFile, stat } from 'fs/promises'
import { join } from 'path'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { loadBranding } from '@/lib/branding-settings'
import { sendEmail, getServiceOrderEmailTemplate, type EmailAttachment } from '@/lib/email'
import { orderPdf, orderStatusLabels, bogotaDateTime, type OrderPdfData } from '@/lib/order-pdf'
import { orderPdfUrl } from '@/lib/order-link'
import type { WorkOrder, ChecklistRun } from '@/lib/support/model'

export type OrderEmailStatus = 'pending' | 'sent' | 'failed' | 'skipped'
// `message` is shown to staff, so it never carries SMTP details.
export interface OrderEmailResult { status: OrderEmailStatus; recipient: string | null; message: string }
interface OrderEmailLog {
  orderId: string; orderNumber: string; recipient: string | null; emailType: 'order_created'
  status: OrderEmailStatus; attempts: number; sentAt?: string; messageId?: string; errorMessage?: string; updatedAt: string
}

const priorityLabels: Record<string, string> = { LOW: 'Baja', NORMAL: 'Normal', HIGH: 'Alta', URGENT: 'Urgente' }
const emailSchema = z.string().trim().email().max(254)
const logId = (orderId: string) => `order-email:${orderId}`
const MAX_LOGO_BYTES = 512 * 1024

// Only files already served from /public are embedded: remote URLs could reach
// internal hosts, and oversized uploads would bloat every email.
async function brandLogo(orgLogo: string) {
  const path = orgLogo || '/brand/sip-logo-mail.png'
  const match = /^\/(uploads|brand)\/([a-zA-Z0-9._-]+)$/.exec(path)
  if (!match || match[2].includes('..')) return undefined
  const file = join(process.cwd(), 'public', match[1], match[2])
  try {
    if ((await stat(file)).size > MAX_LOGO_BYTES) return undefined
    const data = await readFile(file)
    if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { data, format: 'PNG' as const, contentType: 'image/png', ext: 'png' }
    if (data[0] === 0xff && data[1] === 0xd8) return { data, format: 'JPEG' as const, contentType: 'image/jpeg', ext: 'jpg' }
  } catch { /* Missing logo: the documents use the organization name only. */ }
  return undefined
}

// Assembles the order document from stored data; shared by the email and the signed PDF link.
export async function orderDocument(orderId: string) {
  const record = await prisma.serviceRecord.findFirst({ where: { id: orderId, kind: 'orders' } })
  if (!record) return null
  const order = record.payload as unknown as WorkOrder
  const [client, technician, ticket, checklist, branding] = await Promise.all([
    record.clientId ? prisma.user.findUnique({ where: { id: record.clientId }, select: { name: true, email: true, phone: true, address: true, location: true, emailNotifications: true } }) : null,
    record.techId ? prisma.user.findUnique({ where: { id: record.techId }, select: { name: true, email: true } }) : null,
    order.ticketId ? prisma.ticket.findUnique({ where: { id: order.ticketId }, select: { number: true, subject: true, priority: true } }) : null,
    order.checklistId ? prisma.serviceRecord.findFirst({ where: { id: order.checklistId, kind: 'checklists' }, select: { payload: true } }) : null,
    loadBranding(),
  ])
  const logo = await brandLogo(branding.orgLogo)
  const data: OrderPdfData = {
    orgName: branding.orgName, logo: logo && { data: logo.data, format: logo.format },
    number: order.number || '', status: order.status, createdAt: record.createdAt.toISOString(),
    serviceName: order.serviceName, startTime: order.startTime, endTime: order.endTime,
    technician: technician?.name || technician?.email || 'Técnico no disponible',
    client: { name: client?.name || client?.email || 'Cliente', email: client?.email || '', phone: client?.phone || '', address: client?.address || '', city: client?.location || '' },
    ticket: ticket ? { number: `TK-${ticket.number}`, subject: ticket.subject, priority: priorityLabels[ticket.priority] || ticket.priority } : undefined,
    checklistNumber: (checklist?.payload as unknown as ChecklistRun | undefined)?.number,
    diagnosis: order.diagnosis, workDone: order.workDone, observations: order.observations,
    signerName: order.signerName, signedAt: order.signedAt, signature: order.signature, consent: order.consent,
  }
  return { data, client, logo, orgName: branding.orgName }
}

async function writeLog(entry: OrderEmailLog) {
  const payload = JSON.parse(JSON.stringify(entry))
  await prisma.serviceRecord.upsert({
    where: { id: logId(entry.orderId) },
    create: { id: logId(entry.orderId), kind: 'order-email', payload },
    update: { payload, revision: { increment: 1 } },
  })
}

function report(entry: OrderEmailLog) {
  const line = `[ORDER_EMAIL] order_id=${entry.orderId} order_number=${entry.orderNumber || '-'} recipient=${entry.recipient || '-'} status=${entry.status}`
  if (entry.status === 'failed') console.error(`${line} error=${JSON.stringify(entry.errorMessage || '')}`)
  else console.info(entry.errorMessage ? `${line} reason=${JSON.stringify(entry.errorMessage)}` : line)
}

/**
 * Sends the "order created" email with the PDF attached. It runs after the order
 * transaction committed and never throws: a failure is logged and reported, and
 * the order stays saved.
 */
export async function sendOrderCreatedEmail(orderId: string, actorId: string): Promise<OrderEmailResult> {
  const entry: OrderEmailLog = { orderId, orderNumber: '', recipient: null, emailType: 'order_created', status: 'pending', attempts: 0, updatedAt: new Date().toISOString() }
  const finish = async (status: OrderEmailStatus, message: string, detail?: string, messageId?: string): Promise<OrderEmailResult> => {
    Object.assign(entry, { status, errorMessage: detail, messageId, sentAt: status === 'sent' ? new Date().toISOString() : undefined, updatedAt: new Date().toISOString() })
    report(entry)
    try {
      await writeLog(entry)
      await prisma.serviceAuditEvent.create({ data: { actorId, entityId: orderId, action: `orders:email-${status}` } })
    } catch (error) { console.error(`[ORDER_EMAIL] order_id=${orderId} no se pudo registrar el resultado`, error) }
    return { status, recipient: entry.recipient, message }
  }
  try {
    const document = await orderDocument(orderId)
    if (!document) return await finish('failed', 'No se encontró la orden para enviarla por correo.', 'Orden no encontrada')
    entry.orderNumber = document.data.number
    const email = emailSchema.safeParse(document.client?.email ?? '')
    entry.recipient = document.client?.email || null
    if (!email.success) return await finish('skipped', 'El cliente no tiene un correo válido registrado; no se envió la orden.', 'Correo del cliente ausente o inválido')
    entry.recipient = email.data
    if (document.client?.emailNotifications === false) return await finish('skipped', 'El cliente desactivó las notificaciones por correo; no se envió la orden.', 'Notificaciones desactivadas por el cliente')

    entry.attempts = 1
    await writeLog(entry)
    const pdf = await orderPdf(document.data)
    const template = getServiceOrderEmailTemplate({
      orgName: document.orgName, customerName: document.data.client.name, orderNumber: document.data.number || 'de servicio',
      serviceName: document.data.serviceName, status: orderStatusLabels[document.data.status] || 'En proceso',
      serviceDate: bogotaDateTime(document.data.startTime), technician: document.data.technician,
      viewUrl: orderPdfUrl(orderId), logoCid: document.logo ? 'org-logo' : undefined,
    })
    const attachments: EmailAttachment[] = [{ filename: `orden-${(document.data.number || orderId).replace(/[^a-zA-Z0-9-]/g, '')}.pdf`, content: pdf, contentType: 'application/pdf' }]
    if (document.logo) attachments.push({ filename: `logo.${document.logo.ext}`, content: document.logo.data, contentType: document.logo.contentType, cid: 'org-logo' })
    const result = await sendEmail({ to: email.data, subject: template.subject, html: template.html, text: template.text, attachments })
    if (result.success) return await finish('sent', `Orden enviada por correo a ${email.data}.`, undefined, result.messageId)
    return await finish('failed', 'No fue posible enviar el correo al cliente. La orden sigue registrada correctamente.', result.message)
  } catch (error) {
    return await finish('failed', 'No fue posible enviar el correo al cliente. La orden sigue registrada correctamente.', error instanceof Error ? error.message : String(error))
  }
}
