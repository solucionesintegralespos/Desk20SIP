import { existsSync } from 'fs'
import { join } from 'path'

// New uploads are stored outside /public, so they can only be downloaded through
// app/uploads/[filename] (which checks the session). Files saved before this change
// remain in public/uploads and are still found there. URLs stay /uploads/<name>.
export const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'storage', 'uploads')
const LEGACY_DIR = join(process.cwd(), 'public', 'uploads')

export { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, UPLOAD_TYPES, uploadExtension } from '@/lib/upload-limits'

export function safeUploadName(name: string) {
  return /^[a-zA-Z0-9._-]+$/.test(name) && !name.startsWith('.') ? name : null
}

export function uploadPath(name: string) {
  const safe = safeUploadName(name)
  if (!safe) return null
  for (const dir of [UPLOAD_DIR, LEGACY_DIR]) {
    const path = join(dir, safe)
    if (existsSync(path)) return path
  }
  return null
}

// The declared extension must match the file's content for formats with a signature.
export function contentMatches(extension: string, bytes: Buffer) {
  const starts = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte)
  switch (extension) {
    case 'png': return starts(137, 80, 78, 71, 13, 10, 26, 10)
    case 'jpg': case 'jpeg': return starts(255, 216, 255)
    case 'gif': return bytes.toString('ascii', 0, 4) === 'GIF8'
    case 'webp': return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
    case 'pdf': return bytes.toString('ascii', 0, 5) === '%PDF-'
    case 'docx': case 'xlsx': case 'zip': return starts(80, 75, 3, 4)
    case 'mp4': return bytes.toString('ascii', 4, 8) === 'ftyp'
    default: return true
  }
}
