import { cache } from 'react'
import { loadBranding } from '@/lib/branding-settings'
export const getBranding = cache(loadBranding)
