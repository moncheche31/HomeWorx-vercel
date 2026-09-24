-- 1) New status values (additive only; existing values retained for compatibility)
ALTER TYPE public.estimate_status ADD VALUE IF NOT EXISTS 'sent';
ALTER TYPE public.estimate_status ADD VALUE IF NOT EXISTS 'accepted';
ALTER TYPE public.estimate_status ADD VALUE IF NOT EXISTS 'declined';
ALTER TYPE public.estimate_status ADD VALUE IF NOT EXISTS 'superseded';

-- 2) Lineage / document metadata on estimates
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS document_kind text NOT NULL DEFAULT 'estimate',
  ADD COLUMN IF NOT EXISTS lineage_root_id uuid REFERENCES public.estimates(id),
  ADD COLUMN IF NOT EXISTS revision_number integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS option_label text,
  ADD COLUMN IF NOT EXISTS superseded_by_id uuid REFERENCES public.estimates(id),
  ADD COLUMN IF NOT EXISTS sent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS accepted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS declined_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS locked_at timestamp with time zone;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'estimates_document_kind_check'
  ) THEN
    ALTER TABLE public.estimates
      ADD CONSTRAINT estimates_document_kind_check
      CHECK (document_kind IN ('estimate', 'alternate', 'change_order'));
  END IF;
END $$;

-- 3) Backfill (safe no-op on an empty table, correct if rows exist)
WITH RECURSIVE chain AS (
  SELECT e.id, e.parent_estimate_id, e.id AS root_id
    FROM public.estimates e
   WHERE e.parent_estimate_id IS NULL
  UNION ALL
  SELECT e.id, e.parent_estimate_id, c.root_id
    FROM public.estimates e
    JOIN chain c ON e.parent_estimate_id = c.id
)
UPDATE public.estimates e
   SET lineage_root_id = chain.root_id
  FROM chain
 WHERE e.id = chain.id
   AND e.lineage_root_id IS DISTINCT FROM chain.root_id;

UPDATE public.estimates
   SET lineage_root_id = id
 WHERE lineage_root_id IS NULL;

UPDATE public.estimates
   SET revision_number = GREATEST(COALESCE(version, 1) - 1, 0)
 WHERE revision_number = 0 AND COALESCE(version, 1) > 1;

UPDATE public.estimates
   SET locked_at = approved_at
 WHERE status = 'approved' AND approved_at IS NOT NULL AND locked_at IS NULL;

-- 4) Indexes
CREATE INDEX IF NOT EXISTS estimates_lineage_root_idx
  ON public.estimates (lineage_root_id, revision_number);

CREATE INDEX IF NOT EXISTS estimates_superseded_by_idx
  ON public.estimates (superseded_by_id);
