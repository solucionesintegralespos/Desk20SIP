-- Cuentas de cobro: estado PAGADA con fecha y nota de pago. Aditiva e idempotente.
-- Las cuentas pagadas no se editan ni se anulan hasta deshacer el pago.
ALTER TYPE "BillingAccountStatus" ADD VALUE IF NOT EXISTS 'PAID';
ALTER TABLE "BillingAccount" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "BillingAccount" ADD COLUMN IF NOT EXISTS "paymentNote" TEXT;
