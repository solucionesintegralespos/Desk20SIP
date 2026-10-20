import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { UPLOAD_DIR, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, UPLOAD_TYPES, uploadExtension, contentMatches } from '@/lib/uploads'

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const data = await request.formData()
    const file: File | null = data.get('file') as unknown as File

    if (!file) {
      return NextResponse.json({ error: 'No se envió ningún archivo' }, { status: 400 })
    }

    // Only known document and media types, whose content matches the extension, up to 15 MB.
    const extension = uploadExtension(file.name)
    if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: `«${file.name}» supera el máximo de ${MAX_UPLOAD_MB} MB.` }, { status: 413 })
    if (!UPLOAD_TYPES[extension]) return NextResponse.json({ error: 'Tipo de archivo no permitido. Usa imágenes, PDF, documentos de Office, TXT, CSV, ZIP o MP4.' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    if (!contentMatches(extension, buffer)) return NextResponse.json({ error: 'El contenido del archivo no coincide con su extensión.' }, { status: 400 })
    if (data.get('purpose') === 'avatar') {
      const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      const jpg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
      const webp = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
      const validType = (png && file.type === 'image/png' && /\.png$/i.test(file.name)) ||
        (jpg && file.type === 'image/jpeg' && /\.jpe?g$/i.test(file.name)) ||
        (webp && file.type === 'image/webp' && /\.webp$/i.test(file.name))
      if (file.size > 2 * 1024 * 1024 || !validType) return NextResponse.json({ error: 'Selecciona una foto JPG, PNG o WebP de hasta 2 MB.' }, { status: 400 })
    }

    // Generar un nombre único para evitar conflictos
    // Unguessable prefix: attachment URLs must not be enumerable.
    const uniqueSuffix = `${Date.now()}-${randomBytes(16).toString('hex')}`
    // Sanitize filename to prevent directory traversal
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
    const fileName = `${uniqueSuffix}-${safeFilename}`
    
    const uploadDir = UPLOAD_DIR
    
    // Asegurarse de que el directorio existe
    try {
      await mkdir(uploadDir, { recursive: true })
    } catch (e) {
      // Ignorar si ya existe
    }

    const filePath = join(uploadDir, fileName)
    await writeFile(filePath, buffer)

    return NextResponse.json({ url: `/uploads/${fileName}` })
  } catch (error) {
    console.error('Error uploading file:', error)
    return NextResponse.json({ error: 'Error al subir el archivo' }, { status: 500 })
  }
}
