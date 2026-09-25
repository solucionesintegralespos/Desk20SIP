ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dailyEntryGoal" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dailyClosureGoal" INTEGER;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "enteredById" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "closedById" TEXT;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Ticket_enteredById_createdAt_idx" ON "Ticket"("enteredById", "createdAt");
CREATE INDEX IF NOT EXISTS "Ticket_closedById_closedAt_idx" ON "Ticket"("closedById", "closedAt");
