import { inflateRawSync } from 'zlib'

// Minimal .xlsx reader for imports: first worksheet only, shared strings, inline strings,
// numbers and booleans. Enough for the files Excel, LibreOffice and lib/xlsx.ts produce.
export type XlsxValue = string | number | boolean | null

function zipEntries(buffer: Buffer) {
  const entries = new Map<string, Buffer>()
  // End of central directory record: locate it from the tail of the file.
  let eocd = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('El archivo no es un libro de Excel (.xlsx) válido')
  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('El archivo .xlsx está dañado')
    const method = buffer.readUInt16LE(offset + 10), compressed = buffer.readUInt32LE(offset + 20), size = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28), extraLength = buffer.readUInt16LE(offset + 30), commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)
    const localNameLength = buffer.readUInt16LE(localOffset + 26), localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const start = localOffset + 30 + localNameLength + localExtraLength
    const data = buffer.subarray(start, start + compressed)
    if (size > 50 * 1024 * 1024) throw new Error('El archivo es demasiado grande')
    entries.set(name, method === 8 ? inflateRawSync(data) : method === 0 ? Buffer.from(data) : (() => { throw new Error('Compresión de .xlsx no soportada') })())
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

const unescape = (value: string) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16))).replace(/&amp;/g, '&')
const textOf = (xml: string) => unescape(Array.from(xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g), match => match[1]).join(''))
const columnIndex = (ref: string) => { const letters = ref.replace(/[0-9]+$/, ''); let index = 0; for (let i = 0; i < letters.length; i++) index = index * 26 + (letters.charCodeAt(i) - 64); return index - 1 }

/** Rows of the first worksheet as arrays (sparse cells become null). */
export function readXlsx(buffer: Buffer): XlsxValue[][] {
  const entries = zipEntries(buffer)
  const workbook = entries.get('xl/workbook.xml')?.toString('utf8') || ''
  const rels = entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8') || ''
  const firstSheetId = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1]
  const target = firstSheetId ? new RegExp(`<Relationship\\b[^>]*\\bId="${firstSheetId}"[^>]*\\bTarget="([^"]+)"`).exec(rels)?.[1] || new RegExp(`<Relationship\\b[^>]*\\bTarget="([^"]+)"[^>]*\\bId="${firstSheetId}"`).exec(rels)?.[1] : undefined
  const sheetPath = target ? (target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`) : 'xl/worksheets/sheet1.xml'
  const sheet = entries.get(sheetPath)?.toString('utf8') || entries.get('xl/worksheets/sheet1.xml')?.toString('utf8')
  if (!sheet) throw new Error('El libro no tiene hojas')
  const shared = Array.from((entries.get('xl/sharedStrings.xml')?.toString('utf8') || '').matchAll(/<si>([\s\S]*?)<\/si>/g), match => textOf(match[1]))
  const rows: XlsxValue[][] = []
  for (const rowMatch of Array.from(sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g))) {
    const cells: XlsxValue[] = []
    for (const cell of Array.from(rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g))) {
      const attrs = cell[1], inner = cell[2] || ''
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1]
      const index = ref ? columnIndex(ref) : cells.length
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1]
      const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
      let value: XlsxValue = null
      if (type === 's') value = shared[Number(raw)] ?? null
      else if (type === 'inlineStr') value = textOf(inner)
      else if (type === 'b') value = raw === '1'
      else if (type === 'str' || type === 'e') value = raw == null ? null : unescape(raw)
      else if (raw != null && raw !== '') value = Number.isFinite(Number(raw)) ? Number(raw) : unescape(raw)
      while (cells.length < index) cells.push(null)
      cells[index] = value
    }
    rows.push(cells)
  }
  // Drop trailing empty rows.
  while (rows.length && rows[rows.length - 1].every(value => value === null || value === '')) rows.pop()
  return rows
}
