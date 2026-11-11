-- Préstamos de equipos con varios equipos por orden de salida.
-- Crea "EquipmentLoanItem", migra el producto y la cantidad de cada orden existente a una línea
-- y elimina las columnas antiguas. Idempotente: se puede ejecutar más de una vez.
BEGIN;

CREATE TABLE IF NOT EXISTS "EquipmentLoanItem" (
  "id"        TEXT PRIMARY KEY,
  "loanId"    TEXT NOT NULL REFERENCES "EquipmentLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "productId" TEXT NOT NULL REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "quantity"  INTEGER NOT NULL DEFAULT 1 CHECK ("quantity" >= 1),
  "position"  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "EquipmentLoanItem_loanId_idx" ON "EquipmentLoanItem"("loanId");
CREATE INDEX IF NOT EXISTS "EquipmentLoanItem_productId_idx" ON "EquipmentLoanItem"("productId");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'EquipmentLoan' AND column_name = 'productId') THEN
    INSERT INTO "EquipmentLoanItem" ("id", "loanId", "productId", "quantity", "position")
    SELECT 'item-' || l."id", l."id", l."productId", GREATEST(l."quantity", 1), 0
    FROM "EquipmentLoan" l
    WHERE NOT EXISTS (SELECT 1 FROM "EquipmentLoanItem" i WHERE i."loanId" = l."id");
    DROP INDEX IF EXISTS "EquipmentLoan_productId_status_idx";
    ALTER TABLE "EquipmentLoan" DROP COLUMN "productId", DROP COLUMN "quantity";
  END IF;
END $$;

COMMIT;

-- Reversión (pierde las órdenes con más de un equipo):
--   ALTER TABLE "EquipmentLoan" ADD COLUMN "productId" TEXT REFERENCES "Product"("id"), ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
--   UPDATE "EquipmentLoan" l SET "productId" = i."productId", "quantity" = i."quantity" FROM "EquipmentLoanItem" i WHERE i."loanId" = l."id" AND i."position" = 0;
--   DROP TABLE "EquipmentLoanItem";
