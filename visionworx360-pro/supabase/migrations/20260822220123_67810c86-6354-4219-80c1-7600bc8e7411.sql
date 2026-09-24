ALTER TABLE public.estimate_line_items
  ADD COLUMN IF NOT EXISTS trade_source text;

ALTER TABLE public.estimate_line_items DROP CONSTRAINT IF EXISTS eli_trade_source_chk;
ALTER TABLE public.estimate_line_items ADD CONSTRAINT eli_trade_source_chk
  CHECK (trade_source IS NULL OR trade_source = ANY (ARRAY['contractor','manual','inferred','catalog','scope']));
