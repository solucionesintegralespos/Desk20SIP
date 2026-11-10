-- Productos marcados como "equipo de préstamo": solo estos aparecen en Inventario > Préstamos y Equipos.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "loanable" BOOLEAN NOT NULL DEFAULT false;
