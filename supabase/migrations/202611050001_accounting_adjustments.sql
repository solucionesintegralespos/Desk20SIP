-- Ajustes del módulo de contabilidad: cargo del usuario (firma de cotizaciones) y
-- cotizaciones a clientes no registrados (nombre libre, sin cliente asociado).
-- Aditiva e idempotente.
BEGIN;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "jobTitle" TEXT;
ALTER TABLE "Quote" ALTER COLUMN "customerId" DROP NOT NULL;
-- The relation is optional now: deleting a customer keeps the quote (snapshot) without a link.
ALTER TABLE "Quote" DROP CONSTRAINT IF EXISTS "Quote_customerId_fkey";
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;
-- Reversión: ALTER TABLE "User" DROP COLUMN IF EXISTS "jobTitle"; (customerId solo puede volver a NOT NULL si no hay cotizaciones con nombre libre).
