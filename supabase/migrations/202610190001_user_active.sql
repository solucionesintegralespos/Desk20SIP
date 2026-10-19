-- Users can be deactivated instead of deleted. Existing users stay active.
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
