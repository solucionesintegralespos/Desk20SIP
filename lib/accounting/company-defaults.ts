// Client-safe: setting keys and reference wording for the company identity printed on
// quotes and billing accounts. Administrators edit every value in Configuración.
export const COMPANY_DEFAULTS = {
  org_name: 'SIP SOPORTE', org_business_name: '', org_nit: '', org_phone: '', org_email: '', org_website: '', org_address: '', org_city: 'Bogotá',
  // Cuentas de cobro are issued by a (possibly different) person or company: name, CC/NIT and transfer details.
  billing_name: '', billing_tax_id: '',
  quote_conditions: [
    'Esta cotización tiene una vigencia de 3 días calendario a partir de la fecha de emisión, debido a la fluctuación de precios en el mercado. Pasado este plazo, los valores podrán estar sujetos a cambios. Hardware: se debe realizar un anticipo del 70 % para iniciar el proyecto.',
    'Al realizar la entrega de la totalidad de los equipos debe ser cancelado el saldo pendiente del 30 %.',
    'Una vez realizado el anticipo nos tomará 3 días hábiles para el alistamiento de los equipos y la entrega.',
  ].join('\n'),
  billing_payment_info: '',
  billing_legal_note: 'Nota: en virtud de lo contemplado en el art. 616-2 del ET, quienes sean responsables del IVA en el Régimen Simplificado no están obligados a expedir factura de venta por las ventas de bienes o prestación de servicios que realicen.',
  billing_due_days: '30',
} as const
export const COMPANY_SETTING_KEYS = [...Object.keys(COMPANY_DEFAULTS), 'org_logo'] as const
export type CompanySettingKey = typeof COMPANY_SETTING_KEYS[number]
