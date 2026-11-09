-- Inventario (stock, movimientos/kardex) y préstamos de equipos sobre el catálogo de productos.
-- Aditiva e idempotente. Los pasajes del cronograma viven en el payload JSON de los eventos y
-- en la configuración (fares_paid_until): no requieren cambios de esquema.
BEGIN;

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "stock" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  CREATE TYPE "InventoryMovementType" AS ENUM ('PURCHASE', 'ENTRY', 'WRITE_OFF', 'COUNT', 'LOAN_OUT', 'LOAN_IN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "LoanStatus" AS ENUM ('OUT', 'RETURNED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "EquipmentLoan" (
  "id"           TEXT PRIMARY KEY,
  "number"       SERIAL NOT NULL,
  "productId"    TEXT NOT NULL REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "quantity"     INTEGER NOT NULL DEFAULT 1 CHECK ("quantity" >= 1),
  "customerId"   TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "technicianId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status"       "LoanStatus" NOT NULL DEFAULT 'OUT',
  "outAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "outNotes"     TEXT,
  "outPhotos"    TEXT[],
  "returnedAt"   TIMESTAMP(3),
  "returnNotes"  TEXT,
  "returnPhotos" TEXT[],
  "returnedById" TEXT,
  "createdById"  TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "EquipmentLoan_number_key" ON "EquipmentLoan"("number");
CREATE INDEX IF NOT EXISTS "EquipmentLoan_status_outAt_idx" ON "EquipmentLoan"("status", "outAt");
CREATE INDEX IF NOT EXISTS "EquipmentLoan_productId_status_idx" ON "EquipmentLoan"("productId", "status");
CREATE INDEX IF NOT EXISTS "EquipmentLoan_customerId_idx" ON "EquipmentLoan"("customerId");
CREATE INDEX IF NOT EXISTS "EquipmentLoan_technicianId_idx" ON "EquipmentLoan"("technicianId");

CREATE TABLE IF NOT EXISTS "InventoryMovement" (
  "id"              TEXT PRIMARY KEY,
  "productId"       TEXT NOT NULL REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "type"            "InventoryMovementType" NOT NULL,
  "quantity"        INTEGER NOT NULL,
  "balanceAfter"    INTEGER NOT NULL,
  "unitCost"        NUMERIC(14, 2),
  "reference"       TEXT,
  "notes"           TEXT,
  "countedQuantity" INTEGER,
  "loanId"          TEXT REFERENCES "EquipmentLoan"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "createdById"     TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "InventoryMovement_productId_createdAt_idx" ON "InventoryMovement"("productId", "createdAt");
CREATE INDEX IF NOT EXISTS "InventoryMovement_type_createdAt_idx" ON "InventoryMovement"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "InventoryMovement_loanId_idx" ON "InventoryMovement"("loanId");

COMMIT;

-- Reversión: DROP TABLE IF EXISTS "InventoryMovement", "EquipmentLoan"; DROP TYPE IF EXISTS "InventoryMovementType", "LoanStatus";
--            ALTER TABLE "Product" DROP COLUMN IF EXISTS "stock";
