-- Contabilidad: rol ACCOUNTING, datos de facturación de clientes, catálogo de productos
-- e impuestos, cotizaciones y cuentas de cobro con consecutivo independiente por cliente.
-- Aditiva e idempotente: no modifica ni elimina datos existentes.
-- Reversión: ver el bloque comentado al final del archivo.

-- 1. Nuevo rol. ALTER TYPE ... ADD VALUE no puede ejecutarse dentro de una transacción
--    en versiones antiguas de PostgreSQL, por eso va antes del BEGIN.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ACCOUNTING';

BEGIN;

-- 2. Clientes: razón social, NIT/cédula y número inicial de cuentas de cobro.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "businessName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "taxId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "billingStartNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_billingStartNumber_check";
ALTER TABLE "User" ADD CONSTRAINT "User_billingStartNumber_check" CHECK ("billingStartNumber" >= 1);

-- 3. Catálogo de productos para cotizaciones (sin borrado físico: solo activo/inactivo).
CREATE TABLE IF NOT EXISTS "Product" (
  "id"          TEXT PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "price"       NUMERIC(14, 2) NOT NULL CHECK ("price" >= 0),
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "Product_active_name_idx" ON "Product"("active", "name");

-- 4. Impuestos configurables (porcentaje aplicado al total de la cotización).
CREATE TABLE IF NOT EXISTS "Tax" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "rate"      NUMERIC(7, 4) NOT NULL CHECK ("rate" >= 0),
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "Tax_active_idx" ON "Tax"("active");
-- IVA 19 % disponible y seleccionado por defecto desde el primer uso.
INSERT INTO "Tax" ("id", "name", "rate", "active", "isDefault", "createdAt", "updatedAt")
SELECT 'tax-iva-19', 'IVA 19%', 19, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Tax");

-- 5. Cotizaciones con consecutivo global y snapshots de cliente, empresa y líneas.
CREATE TABLE IF NOT EXISTS "Quote" (
  "id"               TEXT PRIMARY KEY,
  "number"           SERIAL NOT NULL,
  "customerId"       TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "customerSnapshot" JSONB NOT NULL,
  "companySnapshot"  JSONB NOT NULL,
  "taxId"            TEXT REFERENCES "Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "taxName"          TEXT,
  "taxRate"          NUMERIC(7, 4),
  "subtotal"         NUMERIC(14, 2) NOT NULL,
  "taxAmount"        NUMERIC(14, 2) NOT NULL,
  "total"            NUMERIC(14, 2) NOT NULL,
  "title"            TEXT NOT NULL DEFAULT 'Cotización',
  "notes"            TEXT,
  "conditions"       TEXT,
  "createdById"      TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "Quote_number_key" ON "Quote"("number");
CREATE INDEX IF NOT EXISTS "Quote_customerId_createdAt_idx" ON "Quote"("customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "Quote_createdAt_idx" ON "Quote"("createdAt");

CREATE TABLE IF NOT EXISTS "QuoteItem" (
  "id"          TEXT PRIMARY KEY,
  "quoteId"     TEXT NOT NULL REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "productId"   TEXT REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "position"    INTEGER NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "quantity"    NUMERIC(12, 2) NOT NULL CHECK ("quantity" > 0),
  "unitPrice"   NUMERIC(14, 2) NOT NULL CHECK ("unitPrice" >= 0),
  "total"       NUMERIC(14, 2) NOT NULL
);
CREATE INDEX IF NOT EXISTS "QuoteItem_quoteId_idx" ON "QuoteItem"("quoteId");
CREATE INDEX IF NOT EXISTS "QuoteItem_productId_idx" ON "QuoteItem"("productId");

-- 6. Cuentas de cobro: plantillas recurrentes, cuentas emitidas y secuencia por cliente.
DO $$ BEGIN
  CREATE TYPE "BillingFrequency" AS ENUM ('MONTHLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "BillingAccountStatus" AS ENUM ('ISSUED', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "BillingTemplate" (
  "id"          TEXT PRIMARY KEY,
  "customerId"  TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "concept"     TEXT NOT NULL,
  "total"       NUMERIC(14, 2) NOT NULL CHECK ("total" >= 0),
  "frequency"   "BillingFrequency" NOT NULL DEFAULT 'MONTHLY',
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "BillingTemplate_customerId_idx" ON "BillingTemplate"("customerId");
CREATE INDEX IF NOT EXISTS "BillingTemplate_active_customerId_idx" ON "BillingTemplate"("active", "customerId");

CREATE TABLE IF NOT EXISTS "BillingAccount" (
  "id"            TEXT PRIMARY KEY,
  "customerId"    TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "number"        INTEGER NOT NULL CHECK ("number" >= 1),
  "templateId"    TEXT REFERENCES "BillingTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "period"        TEXT,
  "concept"       TEXT NOT NULL,
  "total"         NUMERIC(14, 2) NOT NULL CHECK ("total" >= 0),
  "snapshot"      JSONB NOT NULL,
  "status"        "BillingAccountStatus" NOT NULL DEFAULT 'ISSUED',
  "publicToken"   TEXT NOT NULL,
  "publicEnabled" BOOLEAN NOT NULL DEFAULT true,
  "pdf"           BYTEA,
  "issuedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAt"         TIMESTAMP(3),
  "voidedAt"      TIMESTAMP(3),
  "voidReason"    TEXT,
  "createdById"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL
);
-- Un número nunca se repite dentro del mismo cliente (y nunca se reutiliza: la secuencia solo avanza).
CREATE UNIQUE INDEX IF NOT EXISTS "BillingAccount_customerId_number_key" ON "BillingAccount"("customerId", "number");
-- Una sola cuenta por plantilla recurrente y período.
CREATE UNIQUE INDEX IF NOT EXISTS "BillingAccount_templateId_period_key" ON "BillingAccount"("templateId", "period");
CREATE UNIQUE INDEX IF NOT EXISTS "BillingAccount_publicToken_key" ON "BillingAccount"("publicToken");
CREATE INDEX IF NOT EXISTS "BillingAccount_customerId_createdAt_idx" ON "BillingAccount"("customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "BillingAccount_createdAt_idx" ON "BillingAccount"("createdAt");
CREATE INDEX IF NOT EXISTS "BillingAccount_status_idx" ON "BillingAccount"("status");

-- La aplicación reserva el siguiente número con un único UPSERT dentro de la transacción de emisión:
--   INSERT INTO "CustomerBillingSequence" ("customerId","lastNumber") VALUES ($1, $inicio)
--   ON CONFLICT ("customerId") DO UPDATE SET "lastNumber" = "CustomerBillingSequence"."lastNumber" + 1
--   RETURNING "lastNumber";
-- Las solicitudes simultáneas del mismo cliente se serializan sobre la fila; los fallos revierten el número.
CREATE TABLE IF NOT EXISTS "CustomerBillingSequence" (
  "customerId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "lastNumber" INTEGER NOT NULL CHECK ("lastNumber" >= 0)
);

COMMIT;

-- Reversión (ejecutar manualmente si fuera necesario; elimina los datos de los módulos nuevos):
-- BEGIN;
-- DROP TABLE IF EXISTS "CustomerBillingSequence", "BillingAccount", "BillingTemplate", "QuoteItem", "Quote", "Tax", "Product";
-- DROP TYPE IF EXISTS "BillingAccountStatus"; DROP TYPE IF EXISTS "BillingFrequency";
-- ALTER TABLE "User" DROP COLUMN IF EXISTS "businessName", DROP COLUMN IF EXISTS "taxId", DROP COLUMN IF EXISTS "billingStartNumber";
-- COMMIT;
-- El valor 'ACCOUNTING' del tipo "UserRole" no puede eliminarse en PostgreSQL; reasigna esos usuarios a ADMIN antes de revertir.
