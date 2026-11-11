-- Permiso por usuario para registrar bajas de inventario (los administradores siempre pueden).
-- Idempotente.
BEGIN;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "canWriteOffInventory" BOOLEAN NOT NULL DEFAULT false;
COMMIT;

-- Reversión: ALTER TABLE "User" DROP COLUMN IF EXISTS "canWriteOffInventory";
