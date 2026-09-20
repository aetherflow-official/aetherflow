-- ============================================================================
-- AetherFlow Community — Media Metadata Migration (GitHub Releases CDN Backend)
-- Run this in Supabase Dashboard → SQL Editor → New Query → Run
-- Enables native 'video' submissions and stores rich media metadata in Postgres.
-- NOTE: Media binary files (up to 150 MB) are hosted on GitHub Releases CDN,
--       consuming ZERO bytes of Supabase Storage.
-- ============================================================================

-- ── 1. Update Submissions Type Constraint & Columns ──────────────────────────
-- Allow 'video' alongside youtube, stream, image
ALTER TABLE IF EXISTS public.submissions
  DROP CONSTRAINT IF EXISTS submissions_type_check;

ALTER TABLE IF EXISTS public.submissions
  ADD CONSTRAINT submissions_type_check
  CHECK (type IN ('youtube', 'stream', 'image', 'video'));

-- Add columns for native media files and audio metadata
ALTER TABLE IF EXISTS public.submissions
  ADD COLUMN IF NOT EXISTS media_format TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_audio BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS github_asset_url TEXT,
  ADD COLUMN IF NOT EXISTS duration NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dimensions TEXT;

-- ── 2. Create index on github_asset_url for fast deduplication ───────────────
CREATE INDEX IF NOT EXISTS idx_submissions_github_asset_url
  ON public.submissions (github_asset_url)
  WHERE github_asset_url IS NOT NULL;

