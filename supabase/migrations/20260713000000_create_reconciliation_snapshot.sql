-- Create reconciliation_snapshot table: stores the last computed reconciliation
-- between HelloAsso and FFJDA members. Computed by the VPS sync service
-- with a sophisticated matching algorithm, then upserted here for the app to query.
CREATE TABLE IF NOT EXISTS public.reconciliation_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- HelloAsso item_id (null for ffjda_only rows)
  item_id text,

  -- HelloAsso side
  ha_first_name text DEFAULT '',
  ha_last_name text DEFAULT '',
  ha_email text DEFAULT '',
  ha_dob text DEFAULT '',
  ha_discipline text DEFAULT '',
  ha_saisie_ffjda boolean DEFAULT false,
  ha_name_corrected boolean DEFAULT false,

  -- FFJDA side
  ffjda_licence text DEFAULT '',
  ffjda_first_name text DEFAULT '',
  ffjda_last_name text DEFAULT '',
  ffjda_email text DEFAULT '',
  ffjda_dob text DEFAULT '',

  -- Status: matched, name_mismatch, corrected, unmatched, ffjda_only
  status text NOT NULL DEFAULT 'unmatched'
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS recon_snapshot_status_idx ON public.reconciliation_snapshot(status);
CREATE INDEX IF NOT EXISTS recon_snapshot_item_id_idx ON public.reconciliation_snapshot(item_id);
CREATE INDEX IF NOT EXISTS recon_snapshot_licence_idx ON public.reconciliation_snapshot(ffjda_licence);

-- Enable RLS
ALTER TABLE public.reconciliation_snapshot ENABLE ROW LEVEL SECURITY;

-- Policy: admins can read all
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reconciliation_snapshot'
      AND policyname = 'admins_read_all_reconciliation'
  ) THEN
    CREATE POLICY "admins_read_all_reconciliation"
      ON public.reconciliation_snapshot
      FOR SELECT
      TO authenticated
      USING (public.is_admin());
  END IF;
END;
$$;
