BEGIN;
LOCK TABLE public."ServiceRecord" IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE public."ServiceRecord" ADD COLUMN IF NOT EXISTS "orderNumber" INTEGER;
ALTER TABLE public."ServiceRecord" ADD COLUMN IF NOT EXISTS "previousNumber" TEXT;
CREATE TABLE IF NOT EXISTS public."ServiceCounter" (
  "key" TEXT PRIMARY KEY,
  "value" INTEGER NOT NULL CHECK ("value" >= 0)
);
-- Assign existing orders a stable chronological number. Keep the former reference.
WITH pending AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", id)::INTEGER
    + COALESCE((SELECT MAX("orderNumber") FROM public."ServiceRecord"), 0) AS number
  FROM public."ServiceRecord" WHERE kind = 'orders' AND "orderNumber" IS NULL
)
UPDATE public."ServiceRecord" r SET
  "orderNumber" = p.number,
  "previousNumber" = COALESCE(r."previousNumber", r.payload->>'number'),
  payload = jsonb_set(r.payload, '{number}', to_jsonb('OS-' || LPAD(p.number::TEXT, GREATEST(6, LENGTH(p.number::TEXT)), '0')))
FROM pending p WHERE r.id = p.id;
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceRecord_orderNumber_key" ON public."ServiceRecord"("orderNumber");
INSERT INTO public."ServiceCounter" (key, value)
SELECT 'orders', COALESCE(MAX("orderNumber"), 0) FROM public."ServiceRecord"
ON CONFLICT (key) DO UPDATE SET value = GREATEST("ServiceCounter".value, EXCLUDED.value);
ALTER TABLE public."ServiceCounter" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.next_service_order_number() RETURNS INTEGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE result INTEGER;
BEGIN
  INSERT INTO "ServiceCounter" (key, value) VALUES ('orders', 1)
  ON CONFLICT (key) DO UPDATE SET value = "ServiceCounter".value + 1
  RETURNING value INTO result;
  RETURN result;
END $$;
-- Counter updates roll back with failed saves; simultaneous saves serialize safely.
CREATE OR REPLACE FUNCTION public.service_order_number_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.kind = 'orders' THEN
    IF TG_OP = 'UPDATE' AND NEW."orderNumber" IS DISTINCT FROM OLD."orderNumber" THEN
      RAISE EXCEPTION 'El consecutivo de una orden no puede cambiar';
    END IF;
    IF NEW."orderNumber" IS NULL THEN NEW."orderNumber" := next_service_order_number(); END IF;
    NEW.payload := jsonb_set(NEW.payload, '{number}', to_jsonb('OS-' || LPAD(NEW."orderNumber"::TEXT, GREATEST(6, LENGTH(NEW."orderNumber"::TEXT)), '0')));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS service_order_number_guard ON public."ServiceRecord";
CREATE TRIGGER service_order_number_guard BEFORE INSERT OR UPDATE ON public."ServiceRecord"
FOR EACH ROW EXECUTE FUNCTION public.service_order_number_guard();
COMMIT;
