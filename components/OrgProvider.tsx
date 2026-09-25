'use client'

import { createContext, useContext } from 'react'

interface OrgContextType {
  orgName: string
  orgLogo: string
}

const OrgContext = createContext<OrgContextType>({
  orgName: 'SIP SOPORTE',
  orgLogo: ''
})

export function OrgProvider({ 
  children, 
  orgName, 
  orgLogo 
}: { 
  children: React.ReactNode
  orgName: string
  orgLogo: string
}) {
  return (
    <OrgContext.Provider value={{ orgName, orgLogo }}>
      {children}
    </OrgContext.Provider>
  )
}

export const useOrg = () => useContext(OrgContext)
