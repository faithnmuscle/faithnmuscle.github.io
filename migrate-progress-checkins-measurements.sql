-- Run once in Supabase SQL Editor (existing project).
-- Replaces aggregated measurement columns with granular body stats.

ALTER TABLE public.progress_checkins
  ADD COLUMN IF NOT EXISTS neck_cm numeric,
  ADD COLUMN IF NOT EXISTS shoulder_cm numeric,
  ADD COLUMN IF NOT EXISTS abdomen_cm numeric,
  ADD COLUMN IF NOT EXISTS hip_cm numeric,
  ADD COLUMN IF NOT EXISTS bicep_left_cm numeric,
  ADD COLUMN IF NOT EXISTS bicep_right_cm numeric,
  ADD COLUMN IF NOT EXISTS thigh_left_cm numeric,
  ADD COLUMN IF NOT EXISTS thigh_right_cm numeric,
  ADD COLUMN IF NOT EXISTS calf_left_cm numeric,
  ADD COLUMN IF NOT EXISTS calf_right_cm numeric;

ALTER TABLE public.progress_checkins
  DROP COLUMN IF EXISTS hips_cm,
  DROP COLUMN IF EXISTS thighs_cm,
  DROP COLUMN IF EXISTS arms_cm;
