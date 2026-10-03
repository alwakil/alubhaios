/* ============================================================================
   AluBhaiOS — Supabase schema
   Paste this whole file into: Supabase Dashboard → SQL Editor → New query → Run
   Creates one table per former spreadsheet sheet. All data stays TEXT so
   dates never shift timezone. Re-running is safe (CREATE IF NOT EXISTS).
   ========================================================================== */

create table if not exists public.tasks (
  id text primary key,
  title text not null default '',
  description text default '',
  category text default 'Other',
  priority text default 'medium',
  status text default 'pending',
  estimated_minutes text default '',
  actual_minutes text default '',
  goal_id text default '',
  project_id text default '',
  scheduled_date text default '',
  completed_at text default '',
  created_at text default '',
  updated_at text default ''
);

create table if not exists public.archive (
  id text primary key,
  title text not null default '',
  description text default '',
  category text default 'Other',
  priority text default 'medium',
  status text default 'pending',
  estimated_minutes text default '',
  actual_minutes text default '',
  goal_id text default '',
  project_id text default '',
  scheduled_date text default '',
  completed_at text default '',
  created_at text default '',
  updated_at text default ''
);

create table if not exists public.goals (
  id text primary key,
  title text not null default '',
  description text default '',
  category text default 'Other',
  target_date text default '',
  progress text default '0',
  status text default 'active',
  parent_goal_id text default '',
  created_at text default '',
  updated_at text default ''
);

create table if not exists public.routines (
  id text primary key,
  title text not null default '',
  description text default '',
  category text default 'Other',
  target_time text default '',
  duration_minutes text default '',
  days text default 'Every day',
  enabled text default 'true',
  created_at text default '',
  updated_at text default ''
);

create table if not exists public.habits (
  id text primary key,
  title text not null default '',
  frequency text default 'daily',
  target text default '1',
  current_streak text default '0',
  best_streak text default '0',
  enabled text default 'true',
  created_at text default '',
  updated_at text default ''
);

create table if not exists public.habit_logs (
  id text primary key,
  habit_id text not null default '',
  date text not null default '',
  completed text default 'false',
  note text default '',
  created_at text default ''
);

create table if not exists public.focus_sessions (
  id text primary key,
  task_id text default '',
  category text default 'Other',
  start_time text default '',
  end_time text default '',
  duration_minutes text default '',
  focus_rating text default '',
  interruptions text default '0',
  notes text default ''
);

create table if not exists public.daily_reviews (
  id text primary key,
  date text not null default '',
  energy text default '',
  focus text default '',
  motivation text default '',
  stress text default '',
  accomplishments text default '',
  blockers text default '',
  notes text default ''
);

create table if not exists public.weekly_reviews (
  id text primary key,
  week_start text not null default '',
  week_end text default '',
  planned_tasks text default '',
  completed_tasks text default '',
  focus_minutes text default '',
  distraction_minutes text default '',
  biggest_win text default '',
  biggest_problem text default '',
  next_week_focus text default '',
  notes text default ''
);

create table if not exists public.study_modules (
  id text primary key,
  title text not null default '',
  type text default 'HTB Module',
  total_units text default '1',
  done_units text default '0',
  status text default 'active',
  link text default '',
  notes text default '',
  created_at text default '',
  updated_at text default ''
);

create table if not exists public.challenges (
  id text primary key,
  name text not null default '',
  platform text default 'HTB',
  category text default 'Web',
  difficulty text default 'Easy',
  status text default 'unsolved',
  link text default '',
  solved_date text default '',
  notes text default '',
  created_at text default '',
  updated_at text default ''
);

create table if not exists public.salah (
  id text primary key,
  date text not null default '',
  fajr text default 'false',
  dhuhr text default 'false',
  asr text default 'false',
  maghrib text default 'false',
  isha text default 'false',
  created_at text default '',
  updated_at text default ''
);

create table if not exists public.settings (
  key text primary key,
  value text default ''
);

/* ----------------------------------------------------------------------------
   Row Level Security + policies.
   The anon key ships with the app (public frontend), so RLS is REQUIRED.
   These policies leave the database open (single-user app) — exactly like
   the old public GAS /exec URL. Tighten later if you want an access key.
   ---------------------------------------------------------------------------- */

alter table public.tasks            enable row level security;
alter table public.archive          enable row level security;
alter table public.goals            enable row level security;
alter table public.routines         enable row level security;
alter table public.habits           enable row level security;
alter table public.habit_logs       enable row level security;
alter table public.focus_sessions   enable row level security;
alter table public.daily_reviews    enable row level security;
alter table public.weekly_reviews   enable row level security;
alter table public.study_modules    enable row level security;
alter table public.challenges       enable row level security;
alter table public.salah            enable row level security;
alter table public.settings         enable row level security;

-- one blanket policy per table: anon may read + insert + update + delete
do $$
declare t text;
begin
  foreach t in array array['tasks','archive','goals','routines','habits','habit_logs',
                           'focus_sessions','daily_reviews','weekly_reviews',
                           'study_modules','challenges','salah','settings']
  loop
    execute format(
      'create policy %I on public.%I for all to anon using (true) with check (true);',
      t || '_anon_all', t);
  end loop;
exception when duplicate_object then null; -- policies already exist
end $$;

/* ----------------------------------------------------------------------------
   Upsert helpers: unique indexes make ON CONFLICT work where the app relies
   on natural keys (one habit log per habit+date, one salah row per date,
   one daily review per date, one weekly review per week_start).
   The app always sends explicit ids, so these are safety nets for migration
   replays.
   ---------------------------------------------------------------------------- */

create unique index if not exists habit_logs_habit_date_uq on public.habit_logs (habit_id, date);
create unique index if not exists salah_date_uq            on public.salah (date);
create unique index if not exists daily_reviews_date_uq    on public.daily_reviews (date);
create unique index if not exists weekly_reviews_start_uq  on public.weekly_reviews (week_start);

-- Done! Next steps:
--   1. Settings → API → copy "Project URL" + "anon public" key
--   2. Paste both into js/config.js (SUPABASE_URL / SUPABASE_ANON_KEY)
