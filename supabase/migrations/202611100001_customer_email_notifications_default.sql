-- Las notificaciones por correo quedan desactivadas por defecto. Los clientes existentes
-- pasan a no recibirlas; el personal conserva su preferencia actual.
BEGIN;
ALTER TABLE "User" ALTER COLUMN "emailNotifications" SET DEFAULT false;
UPDATE "User" SET "emailNotifications" = false WHERE "role" = 'CUSTOMER' AND "emailNotifications" = true;
COMMIT;
