// Upload rules shared by the browser (pre-checks with a warning) and the server (enforced).
// This file must stay free of Node imports so client components can use it.
export const MAX_UPLOAD_MB = 30
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

// Allowed extensions and the type they are served with. SVG and HTML are excluded on purpose:
// they can run scripts when opened from this site.
export const UPLOAD_TYPES: Record<string, { type: string; inline: boolean }> = {
  png: { type: 'image/png', inline: true },
  jpg: { type: 'image/jpeg', inline: true },
  jpeg: { type: 'image/jpeg', inline: true },
  gif: { type: 'image/gif', inline: true },
  webp: { type: 'image/webp', inline: true },
  pdf: { type: 'application/pdf', inline: true },
  mp4: { type: 'video/mp4', inline: true },
  txt: { type: 'text/plain; charset=utf-8', inline: false },
  csv: { type: 'text/csv; charset=utf-8', inline: false },
  doc: { type: 'application/msword', inline: false },
  docx: { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', inline: false },
  xls: { type: 'application/vnd.ms-excel', inline: false },
  xlsx: { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', inline: false },
  zip: { type: 'application/zip', inline: false },
}
export const UPLOAD_ACCEPT = Object.keys(UPLOAD_TYPES).map(ext => `.${ext}`).join(',')

export const uploadExtension = (name: string) => name.split('.').pop()?.toLowerCase() || ''
export const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** Splits chosen files into the ones that can be uploaded and the ones to warn about. */
export function acceptFiles(files: File[]) {
  const accepted: File[] = [], rejected: string[] = []
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) rejected.push(`«${file.name}» pesa ${formatMb(file.size)} y el máximo es ${MAX_UPLOAD_MB} MB.`)
    else if (!UPLOAD_TYPES[uploadExtension(file.name)]) rejected.push(`«${file.name}» no es un tipo permitido (imágenes, PDF, Office, TXT, CSV, ZIP o MP4).`)
    else accepted.push(file)
  }
  return { accepted, rejected }
}

/** Raised by the forms when the server refuses an attachment, so the submission stops. */
export class UploadError extends Error {}
