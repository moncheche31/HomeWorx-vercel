CREATE UNIQUE INDEX IF NOT EXISTS estimates_one_accepted_per_lineage_idx
  ON public.estimates (lineage_root_id)
  WHERE status = 'accepted' AND archived_at IS NULL;
