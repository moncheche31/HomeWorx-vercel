ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS scope_sync_fingerprint text,
  ADD COLUMN IF NOT EXISTS scope_synced_at timestamptz;

COMMENT ON COLUMN public.estimates.scope_sync_fingerprint IS
  'Structural scope fingerprint this estimate was last synchronized against. Null means no baseline recorded yet.';
