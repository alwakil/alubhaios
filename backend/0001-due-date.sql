-- AluBhaiOS migration 0001 — hard deadlines (v2.11.0)
-- Run once in Supabase Dashboard → SQL Editor → Run.
-- Adds the due_date column to tasks and archive. Safe to re-run (IF NOT EXISTS).
-- After this, reload the app: the probe in app.js flips the feature on.

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS due_date TEXT;
ALTER TABLE public.archive ADD COLUMN IF NOT EXISTS due_date TEXT;
