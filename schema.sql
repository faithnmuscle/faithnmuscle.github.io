-- ============================================================
-- Faith n Muscle — Member Portal
-- Phase 0: Full Database Schema + RLS Policies
-- Run in Supabase SQL Editor
-- ============================================================


-- ============================================================
-- PROFILES
-- Must be created first — is_admin() references this table.
-- Rows created automatically via trigger on auth.users insert.
-- ============================================================

CREATE TABLE public.profiles (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name        text NOT NULL DEFAULT '',
  email            text NOT NULL DEFAULT '',
  contact_phone    text,
  age              int,
  sex              text CHECK (sex IN ('Male', 'Female', 'Other')),
  height_cm        numeric,
  weight_kg        numeric,
  target_weight_kg numeric,
  role             text NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin')),
  timezone         text NOT NULL DEFAULT 'Asia/Colombo',
  pinned_note      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Trigger: auto-create profile on new auth user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    COALESCE(new.email, '')
  );
  RETURN new;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- HELPER: is_admin()
-- Defined AFTER profiles table exists.
-- Runs with SECURITY DEFINER to bypass RLS when checking role.
-- Used in all RLS policies throughout.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;


-- ============================================================
-- RLS for PROFILES (now that is_admin() exists)
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: client reads own" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "profiles: client updates own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "profiles: admin inserts" ON public.profiles
  FOR INSERT WITH CHECK (public.is_admin());


-- ============================================================
-- PLANS
-- ============================================================

CREATE TABLE public.plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_type   text NOT NULL CHECK (plan_type IN ('coaching', 'workout', 'meal', 'athletes', 'rehab')),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'cancelled')),
  start_date  date,
  end_date    date,
  price_lkr   int,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans: client reads own" ON public.plans
  FOR SELECT USING (auth.uid() = client_id OR public.is_admin());

CREATE POLICY "plans: admin inserts" ON public.plans
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "plans: admin updates" ON public.plans
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "plans: admin deletes" ON public.plans
  FOR DELETE USING (public.is_admin());


-- ============================================================
-- PLAN DOCUMENTS (metadata only — files stored in R2)
-- ============================================================

CREATE TABLE public.plan_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  file_name    text NOT NULL,
  storage_path text NOT NULL,
  file_type    text CHECK (file_type IN ('workout_program', 'meal_program', 'general')),
  description  text,
  uploaded_by  uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_documents: client reads own" ON public.plan_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.plans
      WHERE plans.id = plan_documents.plan_id
      AND plans.client_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "plan_documents: admin inserts" ON public.plan_documents
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "plan_documents: admin updates" ON public.plan_documents
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "plan_documents: admin deletes" ON public.plan_documents
  FOR DELETE USING (public.is_admin());


-- ============================================================
-- AVAILABILITY SLOTS
-- ============================================================

CREATE TABLE public.availability_slots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_date    date NOT NULL,
  start_time   time NOT NULL,
  end_time     time NOT NULL,
  slot_type    text NOT NULL DEFAULT 'checkin',
  is_available boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slot_date, start_time)
);

ALTER TABLE public.availability_slots ENABLE ROW LEVEL SECURITY;

-- All authenticated users can see available slots
CREATE POLICY "slots: authenticated reads" ON public.availability_slots
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "slots: admin inserts" ON public.availability_slots
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "slots: admin updates" ON public.availability_slots
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "slots: admin deletes" ON public.availability_slots
  FOR DELETE USING (public.is_admin());


-- ============================================================
-- BOOKINGS
-- ============================================================

CREATE TABLE public.bookings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id      uuid NOT NULL REFERENCES public.availability_slots(id),
  client_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id      uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'completed')),
  client_notes text,
  coach_notes  text,
  session_link text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slot_id)
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bookings: client reads own" ON public.bookings
  FOR SELECT USING (auth.uid() = client_id OR public.is_admin());

CREATE POLICY "bookings: client inserts own" ON public.bookings
  FOR INSERT WITH CHECK (
    auth.uid() = client_id
    AND EXISTS (
      SELECT 1 FROM public.plans
      WHERE plans.id = bookings.plan_id
      AND plans.client_id = auth.uid()
      AND plans.plan_type = 'coaching'
      AND plans.status = 'active'
    )
  );

CREATE POLICY "bookings: client cancels own" ON public.bookings
  FOR UPDATE USING (auth.uid() = client_id OR public.is_admin());

CREATE POLICY "bookings: admin deletes" ON public.bookings
  FOR DELETE USING (public.is_admin());


-- ============================================================
-- WORKOUT LOGS
-- ============================================================

CREATE TABLE public.workout_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id          uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  log_date         date NOT NULL DEFAULT CURRENT_DATE,
  session_name     text,
  duration_min     int,
  perceived_effort int CHECK (perceived_effort BETWEEN 1 AND 10),
  body_weight_kg   numeric,
  overall_notes    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workout_logs: client reads own" ON public.workout_logs
  FOR SELECT USING (auth.uid() = client_id OR public.is_admin());

CREATE POLICY "workout_logs: client inserts own" ON public.workout_logs
  FOR INSERT WITH CHECK (auth.uid() = client_id);

CREATE POLICY "workout_logs: client updates own" ON public.workout_logs
  FOR UPDATE USING (auth.uid() = client_id OR public.is_admin());

CREATE POLICY "workout_logs: client deletes own" ON public.workout_logs
  FOR DELETE USING (auth.uid() = client_id OR public.is_admin());


-- ============================================================
-- WORKOUT EXERCISES
-- ============================================================

CREATE TABLE public.workout_exercises (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id         uuid NOT NULL REFERENCES public.workout_logs(id) ON DELETE CASCADE,
  exercise_name  text NOT NULL,
  sets_completed int,
  reps_per_set   text,
  weight_kg      numeric,
  notes          text,
  sort_order     int NOT NULL DEFAULT 0
);

ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workout_exercises: client reads own" ON public.workout_exercises
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workout_logs
      WHERE workout_logs.id = workout_exercises.log_id
      AND workout_logs.client_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "workout_exercises: client inserts own" ON public.workout_exercises
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workout_logs
      WHERE workout_logs.id = workout_exercises.log_id
      AND workout_logs.client_id = auth.uid()
    )
  );

CREATE POLICY "workout_exercises: client updates own" ON public.workout_exercises
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workout_logs
      WHERE workout_logs.id = workout_exercises.log_id
      AND workout_logs.client_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "workout_exercises: client deletes own" ON public.workout_exercises
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.workout_logs
      WHERE workout_logs.id = workout_exercises.log_id
      AND workout_logs.client_id = auth.uid()
    ) OR public.is_admin()
  );


-- ============================================================
-- MEAL LOGS
-- ============================================================

CREATE TABLE public.meal_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id       uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  log_date      date NOT NULL DEFAULT CURRENT_DATE,
  water_ml      int DEFAULT 0,
  overall_notes text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, log_date)
);

ALTER TABLE public.meal_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meal_logs: client reads own" ON public.meal_logs
  FOR SELECT USING (auth.uid() = client_id OR public.is_admin());

CREATE POLICY "meal_logs: client inserts own" ON public.meal_logs
  FOR INSERT WITH CHECK (auth.uid() = client_id);

CREATE POLICY "meal_logs: client updates own" ON public.meal_logs
  FOR UPDATE USING (auth.uid() = client_id OR public.is_admin());

CREATE POLICY "meal_logs: client deletes own" ON public.meal_logs
  FOR DELETE USING (auth.uid() = client_id OR public.is_admin());


-- ============================================================
-- MEAL LOG ENTRIES
-- ============================================================

CREATE TABLE public.meal_log_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_log_id   uuid NOT NULL REFERENCES public.meal_logs(id) ON DELETE CASCADE,
  meal_slot     text NOT NULL CHECK (meal_slot IN ('Breakfast','Morning Snack','Lunch','Afternoon Snack','Dinner','Evening Snack','Other')),
  food_items    text NOT NULL DEFAULT '',
  portion_notes text,
  calories_kcal int,
  protein_g     numeric,
  carbs_g       numeric,
  fat_g         numeric,
  sort_order    int NOT NULL DEFAULT 0
);

ALTER TABLE public.meal_log_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meal_log_entries: client reads own" ON public.meal_log_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.meal_logs
      WHERE meal_logs.id = meal_log_entries.meal_log_id
      AND meal_logs.client_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "meal_log_entries: client inserts own" ON public.meal_log_entries
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meal_logs
      WHERE meal_logs.id = meal_log_entries.meal_log_id
      AND meal_logs.client_id = auth.uid()
    )
  );

CREATE POLICY "meal_log_entries: client updates own" ON public.meal_log_entries
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.meal_logs
      WHERE meal_logs.id = meal_log_entries.meal_log_id
      AND meal_logs.client_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "meal_log_entries: client deletes own" ON public.meal_log_entries
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.meal_logs
      WHERE meal_logs.id = meal_log_entries.meal_log_id
      AND meal_logs.client_id = auth.uid()
    ) OR public.is_admin()
  );


-- ============================================================
-- PROGRESS CHECK-INS
-- ============================================================

CREATE TABLE public.progress_checkins (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id          uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  checkin_date     date NOT NULL DEFAULT CURRENT_DATE,
  body_weight_kg   numeric,
  -- Body measurements (cm)
  neck_cm          numeric,
  shoulder_cm      numeric,
  chest_cm         numeric,
  waist_cm         numeric,
  abdomen_cm       numeric,
  hip_cm           numeric,
  bicep_left_cm    numeric,
  bicep_right_cm   numeric,
  thigh_left_cm    numeric,
  thigh_right_cm   numeric,
  calf_left_cm     numeric,
  calf_right_cm    numeric,
  -- Daily wellbeing
  energy_level     int CHECK (energy_level BETWEEN 1 AND 10),
  mood_level       int CHECK (mood_level BETWEEN 1 AND 10),
  sleep_quality    int CHECK (sleep_quality BETWEEN 1 AND 10),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.progress_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "progress_checkins: client reads own" ON public.progress_checkins
  FOR SELECT USING (auth.uid() = client_id OR public.is_admin());

CREATE POLICY "progress_checkins: client inserts own" ON public.progress_checkins
  FOR INSERT WITH CHECK (auth.uid() = client_id);

CREATE POLICY "progress_checkins: client updates own" ON public.progress_checkins
  FOR UPDATE USING (auth.uid() = client_id OR public.is_admin());

CREATE POLICY "progress_checkins: client deletes own" ON public.progress_checkins
  FOR DELETE USING (auth.uid() = client_id OR public.is_admin());

-- Existing DB migration for progress_checkins measurements
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


-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('booking_approved','booking_rejected','plan_assigned','document_uploaded','booking_request','message','checkin_reviewed')),
  title      text NOT NULL,
  body       text,
  is_read    boolean NOT NULL DEFAULT false,
  related_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications: user reads own" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "notifications: user marks read" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id OR public.is_admin());

-- Only server (service role) or admin inserts notifications
CREATE POLICY "notifications: admin inserts" ON public.notifications
  FOR INSERT WITH CHECK (public.is_admin());


-- ============================================================
-- WEEKLY CHECK-INS
-- ============================================================

CREATE TABLE public.weekly_checkins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id         uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  week_start_date date NOT NULL,
  adherence_pct   int CHECK (adherence_pct BETWEEN 0 AND 100),
  energy_level    int CHECK (energy_level BETWEEN 1 AND 10),
  sleep_quality   int CHECK (sleep_quality BETWEEN 1 AND 10),
  stress_level    int CHECK (stress_level BETWEEN 1 AND 10),
  client_note     text,
  coach_reply     text,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, week_start_date)
);

ALTER TABLE public.weekly_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_checkins: client reads own" ON public.weekly_checkins
  FOR SELECT USING (auth.uid() = client_id OR public.is_admin());

CREATE POLICY "weekly_checkins: client inserts own" ON public.weekly_checkins
  FOR INSERT WITH CHECK (auth.uid() = client_id);

CREATE POLICY "weekly_checkins: client updates own" ON public.weekly_checkins
  FOR UPDATE USING (auth.uid() = client_id OR public.is_admin());


-- ============================================================
-- PROGRESS PHOTOS (metadata only — files stored in Cloudflare R2)
-- ============================================================

CREATE TABLE public.progress_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id      uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  photo_date   date NOT NULL,
  angle        text CHECK (angle IN ('front', 'side', 'back', 'other')),
  storage_path text NOT NULL,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.progress_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "progress_photos: client reads own" ON public.progress_photos
  FOR SELECT USING (auth.uid() = client_id OR public.is_admin());

CREATE POLICY "progress_photos: client inserts own" ON public.progress_photos
  FOR INSERT WITH CHECK (auth.uid() = client_id);

CREATE POLICY "progress_photos: client deletes own" ON public.progress_photos
  FOR DELETE USING (auth.uid() = client_id OR public.is_admin());


-- ============================================================
-- NUTRITION TARGETS
-- ============================================================

CREATE TABLE public.nutrition_targets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE UNIQUE,
  calories_kcal int,
  protein_g     numeric,
  carbs_g       numeric,
  fat_g         numeric,
  water_ml      int DEFAULT 2000,
  set_by        uuid REFERENCES public.profiles(id),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nutrition_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nutrition_targets: client reads own" ON public.nutrition_targets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.plans
      WHERE plans.id = nutrition_targets.plan_id
      AND plans.client_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "nutrition_targets: admin inserts" ON public.nutrition_targets
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "nutrition_targets: admin updates" ON public.nutrition_targets
  FOR UPDATE USING (public.is_admin());


-- ============================================================
-- MESSAGES
-- ============================================================

CREATE TABLE public.messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id    uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  sender_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body       text NOT NULL,
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages: client reads own plan" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.plans
      WHERE plans.id = messages.plan_id
      AND plans.client_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "messages: client sends in own plan" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND (
      EXISTS (
        SELECT 1 FROM public.plans
        WHERE plans.id = messages.plan_id
        AND plans.client_id = auth.uid()
      ) OR public.is_admin()
    )
  );

CREATE POLICY "messages: mark read" ON public.messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.plans
      WHERE plans.id = messages.plan_id
      AND plans.client_id = auth.uid()
    ) OR public.is_admin()
  );


-- ============================================================
-- PUSH SUBSCRIPTIONS
-- ============================================================

CREATE TABLE public.push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint   text NOT NULL,
  p256dh_key text NOT NULL,
  auth_key   text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscriptions: user reads own" ON public.push_subscriptions
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "push_subscriptions: user inserts own" ON public.push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_subscriptions: user deletes own" ON public.push_subscriptions
  FOR DELETE USING (auth.uid() = user_id OR public.is_admin());


-- ============================================================
-- PAYMENTS
-- ============================================================

CREATE TABLE public.payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id      uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  paid_date    date NOT NULL,
  amount_lkr   int NOT NULL,
  method       text CHECK (method IN ('bank_transfer', 'cash', 'card', 'other')),
  period_label text,
  notes        text,
  recorded_by  uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments: client reads own" ON public.payments
  FOR SELECT USING (auth.uid() = client_id OR public.is_admin());

CREATE POLICY "payments: admin inserts" ON public.payments
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "payments: admin updates" ON public.payments
  FOR UPDATE USING (public.is_admin());


-- ============================================================
-- PLAN TEMPLATES (admin only)
-- ============================================================

CREATE TABLE public.plan_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  plan_type   text CHECK (plan_type IN ('coaching', 'workout', 'meal', 'athletes', 'rehab')),
  description text,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_templates: admin only" ON public.plan_templates
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ============================================================
-- TEMPLATE SESSIONS
-- ============================================================

CREATE TABLE public.template_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   uuid NOT NULL REFERENCES public.plan_templates(id) ON DELETE CASCADE,
  session_name  text NOT NULL,
  day_label     text,
  sort_order    int NOT NULL DEFAULT 0,
  notes         text
);

ALTER TABLE public.template_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "template_sessions: admin only" ON public.template_sessions
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ============================================================
-- TEMPLATE EXERCISES
-- ============================================================

CREATE TABLE public.template_exercises (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES public.template_sessions(id) ON DELETE CASCADE,
  exercise_name text NOT NULL,
  sets          int,
  reps          text,
  weight_note   text,
  rest_seconds  int,
  notes         text,
  sort_order    int NOT NULL DEFAULT 0
);

ALTER TABLE public.template_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "template_exercises: admin only" ON public.template_exercises
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ============================================================
-- PROGRAM SESSIONS (assigned to a specific plan)
-- ============================================================

CREATE TABLE public.program_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  session_name  text NOT NULL,
  day_label     text,
  sort_order    int NOT NULL DEFAULT 0,
  notes         text
);

ALTER TABLE public.program_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "program_sessions: client reads own" ON public.program_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.plans
      WHERE plans.id = program_sessions.plan_id
      AND plans.client_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "program_sessions: admin writes" ON public.program_sessions
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ============================================================
-- PROGRAM EXERCISES
-- ============================================================

CREATE TABLE public.program_exercises (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES public.program_sessions(id) ON DELETE CASCADE,
  exercise_name text NOT NULL,
  sets          int,
  reps          text,
  weight_note   text,
  rest_seconds  int,
  notes         text,
  sort_order    int NOT NULL DEFAULT 0
);

ALTER TABLE public.program_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "program_exercises: client reads own" ON public.program_exercises
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.program_sessions ps
      JOIN public.plans p ON p.id = ps.plan_id
      WHERE ps.id = program_exercises.session_id
      AND p.client_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "program_exercises: admin writes" ON public.program_exercises
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ============================================================
-- INDEXES (performance)
-- ============================================================

CREATE INDEX ON public.plans (client_id);
CREATE INDEX ON public.plans (status);
CREATE INDEX ON public.bookings (client_id);
CREATE INDEX ON public.bookings (slot_id);
CREATE INDEX ON public.workout_logs (client_id, log_date DESC);
CREATE INDEX ON public.workout_exercises (log_id);
CREATE INDEX ON public.meal_logs (client_id, log_date DESC);
CREATE INDEX ON public.meal_log_entries (meal_log_id);
CREATE INDEX ON public.progress_checkins (client_id, checkin_date DESC);
CREATE INDEX ON public.notifications (user_id, is_read, created_at DESC);
CREATE INDEX ON public.weekly_checkins (client_id, week_start_date DESC);
CREATE INDEX ON public.progress_photos (client_id, photo_date DESC);
CREATE INDEX ON public.messages (plan_id, created_at DESC);
CREATE INDEX ON public.payments (client_id);
CREATE INDEX ON public.program_sessions (plan_id, sort_order);
CREATE INDEX ON public.program_exercises (session_id, sort_order);


-- ============================================================
-- Done. Verify in Table Editor that RLS shows "Enabled"
-- on every table before proceeding to Phase 1.
-- ============================================================
