# Contabilidad: cotizaciones y cuentas de cobro

## Despliegue

1. Aplicar `supabase/migrations/202611040001_accounting_quotes_billing.sql` en la base de datos (Supabase SQL editor o `psql -f`). Es aditiva e idempotente: agrega el valor `ACCOUNTING` al tipo `UserRole`, las columnas `businessName`, `taxId` y `billingStartNumber` en `User`, y las tablas `Product`, `Tax`, `Quote`, `QuoteItem`, `BillingTemplate`, `BillingAccount` y `CustomerBillingSequence`. Siembra el impuesto `IVA 19%` si no existe ninguno.
   En entornos sin migraciones manuales también sirve `npm run prisma:push` (misma estructura; el IVA se crea al abrir el catálogo por primera vez).
2. `npm run prisma:generate` durante la compilación (ya forma parte del build en Vercel) y `npm run build`.
3. Configuración > Información General: completar NIT, teléfono, sitio web, dirección, ciudad, condiciones de las cotizaciones, instrucciones de pago y nota legal de las cuentas de cobro. El logo configurado (PNG/JPG local) se imprime en los documentos.
4. `APP_PUBLIC_URL` (o `NEXTAUTH_URL`) debe ser accesible para los clientes: los enlaces públicos de las cuentas de cobro y los botones de los correos se construyen con esa URL.

## Rol Contabilidad

`ACCOUNTING` tiene los mismos accesos que `ADMIN` (todas las comprobaciones pasan por `isAdmin` / `STAFF_ROLES` en `lib/roles.ts`) y, además, los módulos Cotizaciones, Cuentas de cobro y Catálogo. Los módulos contables están disponibles para administradores y contabilidad; los agentes no los ven.

## Numeración de cuentas de cobro

- Cada cliente tiene su propio consecutivo (`CustomerBillingSequence`). La primera cuenta usa el "Número inicial de cuentas de cobro" del cliente (por defecto 1); después la secuencia avanza de uno en uno. Cambiar el número inicial no altera una secuencia ya iniciada.
- El número se reserva dentro de la transacción que emite la cuenta con un único `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`; PostgreSQL bloquea la fila del cliente, por lo que dos usuarios simultáneos nunca reciben el mismo número y una transacción fallida revierte el incremento.
- Índices únicos: `(customerId, number)` y `(templateId, period)`. Las cuentas anuladas conservan su número y este no se reutiliza. Las plantillas recurrentes no consumen números hasta que generan una cuenta.
- Se guarda como entero y se muestra solo con dígitos: `01`…`09`, `10`, `11`, …, `100`.

## Documentos

- Cotizaciones y cuentas de cobro se generan con jsPDF (`lib/accounting/quote-pdf.ts`, `lib/accounting/billing-pdf.ts`) con el mismo membrete de las órdenes de servicio. La vista previa del navegador, la descarga, el adjunto del correo y el enlace público usan la misma función.
- Cada cuenta guarda un snapshot (cliente, empresa, concepto, valor en letras, fechas) y el PDF generado en el momento de la emisión. Las cotizaciones guardan snapshots del cliente, de la empresa y de cada línea (nombre, precio editado).
- Enlace público: `/api/public/billing/<token>` con un token aleatorio de 32 bytes; se puede regenerar o desactivar desde la lista de cuentas.

## Pruebas

- `npm run test:accounting` — helpers puros (centavos, redondeo del impuesto, formato de números, cifras en letras, períodos, roles) y rutas con base de datos simulada.
- `npm run test:billing-numbering` — numeración contra PostgreSQL real (`DATABASE_URL`): dos clientes con `01`, cliente con inicio 15, 12 emisiones simultáneas sin duplicados, secuencia compartida con las recurrentes, una cuenta por plantilla y período bajo concurrencia, snapshots inmutables, no reutilización tras anular, reversión en fallos. Crea y elimina sus propios datos de prueba.
