import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const registrationEnabled = process.env.REGISTRATION_ENABLED === 'true'
  
  return NextResponse.json({ enabled: registrationEnabled })
}
