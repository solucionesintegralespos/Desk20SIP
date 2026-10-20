import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { loadBranding } from '@/lib/branding-settings'
import { uploadPath, uploadExtension, UPLOAD_TYPES } from '@/lib/uploads'

export const dynamic = 'force-dynamic'

// Attachments and avatars require a session. The organization logo is the exception:
// it is shown on the sign-in screen.
export async function GET(_request: Request, { params }: { params: { filename: string } }) {
  const path = uploadPath(params.filename || '')
  if (!path) return new NextResponse('File not found', { status: 404 })

  const isLogo = (await loadBranding()).orgLogo === `/uploads/${params.filename}`
  if (!isLogo && !await getServerSession(authOptions)) return new NextResponse('No autorizado', { status: 401 })

  try {
    const fileBuffer = await readFile(path)
    const known = UPLOAD_TYPES[uploadExtension(params.filename)]
    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type': known?.type || 'application/octet-stream',
        // Anything that is not an image, PDF or video downloads instead of opening in the site.
        'Content-Disposition': `${known?.inline ? 'inline' : 'attachment'}; filename="${params.filename}"`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
        'Cache-Control': isLogo ? 'public, max-age=86400' : 'private, max-age=3600',
      },
    })
  } catch (error) {
    console.error('Error reading file:', error)
    return new NextResponse('Error reading file', { status: 500 })
  }
}
