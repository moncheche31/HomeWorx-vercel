-- ============================================================
-- HomeWorx 360 Estimator — Initial Database Schema
-- Migration: 001_initial.sql
--
-- Usage:
--   Local:   npx supabase db push
--   Remote:  npx supabase db push --linked
--
-- After running this migration, enable Row Level Security (RLS)
-- in the Supabase dashboard and configure authentication providers.
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for fuzzy customer search

-- ── Helper: updated_at auto-timestamp ───────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABLE: contractor_profiles
-- One profile per authenticated user. Linked to Supabase Auth.
-- Logo stored in Supabase Storage bucket "logos".
-- ============================================================
CREATE TABLE IF NOT EXISTS contractor_profiles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Company identity (shown on every estimate PDF)
  business_name   TEXT,
  owner_name      TEXT,
  phone           TEXT,
  email           TEXT,
  website         TEXT,
  address         TEXT,
  city            TEXT,
  state           CHAR(2),
  zip             TEXT,
  license_number  TEXT,

  -- Logo: path inside "logos" Supabase Storage bucket
  -- e.g.  logos/{user_id}/logo.jpg
  logo_storage_path TEXT,
  -- Cached public URL (set by edge function after upload)
  logo_public_url   TEXT,

  -- Subscription / billing
  plan            TEXT DEFAULT 'trial',     -- 'trial' | 'pro' | 'enterprise'
  trial_ends_at   TIMESTAMPTZ,

  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL,

  CONSTRAINT contractor_profiles_user_id_key UNIQUE (user_id)
);

CREATE TRIGGER contractor_profiles_updated_at
  BEFORE UPDATE ON contractor_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE contractor_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own profile"
  ON contractor_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON contractor_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON contractor_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- TABLE: estimates
-- Each estimate belongs to one contractor (user).
-- Line items, photos, and location stored as JSONB for
-- schema flexibility without a migration on every field change.
-- ============================================================
CREATE TABLE IF NOT EXISTS estimates (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Estimate metadata
  estimate_number       TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','sent','accepted','declined')),
  language              TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','es')),
  display_mode          TEXT NOT NULL DEFAULT 'total-only'
                          CHECK (display_mode IN ('total-only','grouped','itemized')),
  trade                 TEXT NOT NULL,

  -- Customer info (denormalized for fast PDF rendering)
  customer_name         TEXT,
  customer_phone        TEXT,
  customer_email        TEXT,
  customer_address      TEXT,
  customer_city         TEXT,
  customer_state        CHAR(2),
  customer_zip          TEXT,

  -- Job location
  job_address           TEXT,
  job_city              TEXT,
  job_state             CHAR(2),
  job_zip               TEXT,

  -- AI-generated content
  job_description       TEXT,   -- raw voice transcript (never shown to customer)
  scope_of_work         TEXT,   -- AI-rewritten professional scope (shown on PDF)

  -- Contractor-internal fields (never appear on customer PDF)
  total_estimated_hours NUMERIC(6,2),
  labor_rate            NUMERIC(8,2),   -- $/hr override

  -- Financial
  subtotal              NUMERIC(12,2) DEFAULT 0,
  tax_rate              NUMERIC(6,4)  DEFAULT 0.08,  -- stored as decimal, e.g. 0.08 = 8%
  tax_amount            NUMERIC(12,2) DEFAULT 0,
  total                 NUMERIC(12,2) DEFAULT 0,

  -- Free-text fields
  notes                 TEXT,
  terms                 TEXT,
  valid_days            INTEGER DEFAULT 30,

  -- JSONB columns for flexible nested data
  line_items            JSONB NOT NULL DEFAULT '[]',
  -- [{ id, description, quantity, unit, unitPrice, total, estimatedHours? }, ...]

  photos                JSONB NOT NULL DEFAULT '[]',
  -- Array of Supabase Storage paths or data URLs

  -- Snapshot of contractor profile at time of creation
  -- (so estimates remain correct even if profile is updated later)
  contractor_snapshot   JSONB NOT NULL DEFAULT '{}',
  -- { name, company, phone, email, website, address, city, state, zip, license, logoUrl }

  -- AI metadata
  ai_engine             TEXT,  -- 'gpt-4o' | 'claude' | 'demo'
  price_source          TEXT,  -- 'bigbox' | 'serpapi' | 'simulated'

  created_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX estimates_user_id_idx    ON estimates (user_id);
CREATE INDEX estimates_status_idx     ON estimates (status);
CREATE INDEX estimates_trade_idx      ON estimates (trade);
CREATE INDEX estimates_created_at_idx ON estimates (created_at DESC);

-- Full-text search on customer name and scope of work
CREATE INDEX estimates_customer_name_trgm ON estimates
  USING GIN (customer_name gin_trgm_ops);

CREATE TRIGGER estimates_updated_at
  BEFORE UPDATE ON estimates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD their own estimates"
  ON estimates FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- TABLE: saved_customers
-- Quick-fill list of recently used customers per contractor.
-- ============================================================
CREATE TABLE IF NOT EXISTS saved_customers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  address     TEXT,
  city        TEXT,
  state       CHAR(2),
  zip         TEXT,
  last_used   TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,

  CONSTRAINT saved_customers_unique UNIQUE (user_id, name, phone)
);

CREATE INDEX saved_customers_user_id_idx  ON saved_customers (user_id);
CREATE INDEX saved_customers_last_used_idx ON saved_customers (last_used DESC);

ALTER TABLE saved_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own customers"
  ON saved_customers FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- TABLE: price_tables
-- Per-trade price customizations. One row per trade per user.
-- ============================================================
CREATE TABLE IF NOT EXISTS price_tables (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade       TEXT NOT NULL,
  labor_rate  NUMERIC(8,2) DEFAULT 75,
  items       JSONB NOT NULL DEFAULT '[]',
  -- [{ id, description, unit, price }, ...]
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL,

  CONSTRAINT price_tables_unique UNIQUE (user_id, trade)
);

CREATE TRIGGER price_tables_updated_at
  BEFORE UPDATE ON price_tables
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE price_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own price tables"
  ON price_tables FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- TABLE: estimate_number_sequences
-- Auto-increment estimate numbers per user per year.
-- ============================================================
CREATE TABLE IF NOT EXISTS estimate_number_sequences (
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year      SMALLINT NOT NULL,
  last_seq  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, year)
);

ALTER TABLE estimate_number_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own sequences"
  ON estimate_number_sequences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Function: generate_estimate_number ─────────────────────────────────────
-- Atomically increments the sequence and returns a formatted number like "2026-0042".
CREATE OR REPLACE FUNCTION generate_estimate_number(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_year   SMALLINT := EXTRACT(YEAR FROM now())::SMALLINT;
  v_seq    INTEGER;
BEGIN
  INSERT INTO estimate_number_sequences (user_id, year, last_seq)
  VALUES (p_user_id, v_year, 1)
  ON CONFLICT (user_id, year)
  DO UPDATE SET last_seq = estimate_number_sequences.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN v_year::TEXT || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- STORAGE BUCKETS (run in Supabase dashboard or via CLI)
-- ============================================================
-- npx supabase storage create logos    --public=false
-- npx supabase storage create photos   --public=false
--
-- Storage RLS policies (add via dashboard):
--   logos bucket:  users can upload/read their own logos
--   photos bucket: users can upload/read their own job photos

-- ============================================================
-- SAMPLE: Create a profile when a new user signs up
-- (Add this as a Supabase Auth hook / Edge Function trigger)
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO contractor_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
