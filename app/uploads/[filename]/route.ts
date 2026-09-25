import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export async function GET(
  request: Request,
  { params }: { params: { filename: string } }
) {
  const filename = params.filename

  if (!filename) {
    return new NextResponse('Filename is required', { status: 400 })
  }

  // Prevenir directory traversal vulnerabilities asegurándonos que el archivo 
  // solo contenga caracteres seguros y no intente subir de directorio.
  const safeFilename = filename.replace(/[^a-zA-Z0-9.\-_]/g, '')
  const filePath = join(process.cwd(), 'public', 'uploads', safeFilename)

  if (!existsSync(filePath)) {
    return new NextResponse('File not found', { status: 404 })
  }

  try {
    const fileBuffer = await readFile(filePath)
    
    // Intentar deducir el tipo MIME de la extensión del archivo, por defecto usaremos octet-stream
    const ext = safeFilename.split('.').pop() || ''
    
    // Mapeo básico de extensiones comunes
    const mimeTypes: Record<string, string> = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'txt': 'text/plain',
      'csv': 'text/csv'
    }
    
    const contentType = mimeTypes[ext.toLowerCase()] || 'application/octet-stream'

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('Error reading file:', error)
    return new NextResponse('Error reading file', { status: 500 })
  }
}
