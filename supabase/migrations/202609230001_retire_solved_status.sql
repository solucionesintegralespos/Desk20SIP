-- Retire the resolved state without deleting tickets or changing their dates.
UPDATE "Ticket" SET "status" = 'CLOSED' WHERE "status" = 'SOLVED';
-- Keep the enum value for compatibility with older deployments; current APIs
-- only accept OPEN, PENDING and CLOSED.
