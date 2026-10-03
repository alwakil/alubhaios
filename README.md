# AluBhaiOS — Personal Productivity Operating System

A complete, single-user productivity app built on **HTML/CSS/vanilla JavaScript + Chart.js** (hosted free on GitHub Pages), with **Supabase** (free Postgres) as the backend database.

**The loop:** Plan → Execute → Measure → Reflect → Improve

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, vanilla JS (modular, no framework), Chart.js, Font Awesome |
| Hosting | GitHub Pages (free) |
| Backend | Supabase REST API (PostgREST) — ~0.2 s saves, no cold starts |
| Database | Supabase Postgres (13 tables, free tier) |

> This is the Supabase edition. The original PersonalOS (Google Apps Script + Google Sheets edition) lives in the `aluos` repo and still works — nothing was deleted.

---

## Table of contents

1. [Features](#features)
2. [How the pieces fit together](#how-the-pieces-fit-together)
3. [Step 1 — Create the Supabase project](#step-1--create-the-supabase-project)
4. [Step 2 — Run the schema SQL](#step-2--run-the-schema-sql)
5. [Step 3 — Connect the frontend](#step-3--connect-the-frontend)
6. [Step 4 — Deploy to GitHub Pages](#step-4--deploy-to-github-pages)
7. [One-time data migration from PersonalOS (Sheets)](#one-time-data-migration-from-personalos-sheets)
8. [XP penalty system](#xp-penalty-system)
9. [Database structure](#database-structure)
10. [Testing locally without Supabase](#testing-locally-without-supabase)
11. [Troubleshooting](#troubleshooting)

---

## Features

Everything from PersonalOS v1.6.1, plus:

- **⚡ Supabase backend** — saves drop from 5–15 s (Apps Script) to ~0.2 s; no cold starts, no daily execution limits.
- **⚠️ XP penalty for missed work** — missed tasks (−5), unchecked habits (−2) and unmarked salat (−2) on past days cut your XP (capped −15/day, never below 0, only counts days after you first open the app). Complete the missed task later and the XP comes back automatically.

All original features: installable PWA, dashboard with productivity score + XP/level, Today page with missed-task alert, tasks (filters/projects/archive), goal hierarchy + plan-my-week, routines with notifications, habit streaks + freezes + heatmap, stopwatch/pomodoro focus timer, Salah tracker with reminders, 23 badges, 8+ analytics charts + year heatmap, smart insights, fishbone diagram, daily/weekly reviews with auto reports, keyboard shortcuts, custom dropdown options, full reset system with typed `RESET` gates.

---

## How the pieces fit together

```
┌─────────────────────┐   REST (GET/POST/PATCH/DELETE)   ┌──────────────────────┐
│  GitHub Pages       │ ───────────────────────────────► │  Supabase            │
│  (HTML/CSS/JS)      │ ◄─────────────────────────────── │  Postgres + PostgREST│
└─────────────────────┘        JSON rows                  └──────────────────────┘
```

- The frontend calls `https://YOUR-PROJECT.supabase.co/rest/v1/<table>` directly with the **anon key** (safe for a public frontend — Row Level Security is enabled).
- On boot the app makes parallel `GET` requests (one per table) and caches everything; after that every create/edit/delete updates the cache locally (optimistic UI). Use the ↻ button to force a re-sync.
- Every row keeps a client-generated `id` (UUID), so writes are idempotent — retries can never create duplicates.
- Dates are stored as **local text** (`YYYY-MM-DD` / `YYYY-MM-DDTHH:MM:SS`) in TEXT columns — no timezone shifts, ever.

---

## Step 1 — Create the Supabase project

1. Go to <https://supabase.com> → **Start your project** → sign in **with GitHub** (easiest).
2. **New project**: name it `alubhaios`, pick a **Database Password** (save it somewhere — you won't need it for this app, but keep it), Region: **Singapore (ap-southeast-1)** is fastest from Bangladesh.
3. Wait ~2 minutes for provisioning. Free plan, no card needed.

## Step 2 — Run the schema SQL

1. In the Supabase dashboard open **SQL Editor** → **New query**.
2. Open [`backend/supabase-schema.sql`](backend/supabase-schema.sql) from this repo, copy **the whole file**, paste it into the editor, press **Run**.
3. You should see `Success. No rows returned`. Check **Table Editor** — 13 tables (`tasks`, `archive`, `goals`, `routines`, `habits`, `habit_logs`, `focus_sessions`, `daily_reviews`, `weekly_reviews`, `study_modules`, `challenges`, `salah`, `settings`) now exist.
4. Go to **Settings → API**: copy the **Project URL** and the **anon public** key (NOT the service_role key!).

## Step 3 — Connect the frontend

Paste both values into `js/config.js`:

```js
SUPABASE_URL: "https://abcd1234.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGciOi…",
```

(Or per-device, without committing anything: app → Settings → Backend connection → paste URL + key → Save connection → Test connection.)

## Step 4 — Deploy to GitHub Pages

Same as any static site: push this folder to a GitHub repo → Settings → Pages → Deploy from branch `main` / `(root)`. Done.

---

## One-time data migration from PersonalOS (Sheets)

Your old data (tasks, habits, focus sessions, reviews, study modules, challenges, settings) can be copied automatically:

```bash
node dev/migrate-supabase.mjs "<OLD_GAS_EXEC_URL>" "<SUPABASE_URL>" "<SUPABASE_ANON_KEY>"
```

- Reads everything from the old Apps Script backend and upserts it into Supabase **with the original ids and timestamps** — streaks, history and stats stay intact.
- Idempotent: re-running never creates duplicates.
- The old spreadsheet and GAS deployment are not touched in any way — they stay as a backup.

## XP penalty system

| Missed item (on a past day) | XP cut |
|---|---|
| Task with a `scheduled_date` that is still not completed | −5 |
| Enabled habit without a completed check-in | −2 |
| Salat not marked as prayed | −2 |

Safety rules: today never counts (you have until midnight); the system only counts days **after** it first runs (stored as `penalty_since` in Settings — no retroactive cuts); max −15 XP per day; XP never goes below 0. Because XP is always recomputed from real records, completing a missed task or checking a habit later **refunds** the penalty automatically.

Dashboard shows a red `−N XP` line under the level bar when a penalty is active; the Badges page shows the detailed counts.

## Database structure

13 tables, all TEXT columns (same shapes as the old Sheets backend):

| Table | Key columns |
|---|---|
| `tasks` / `archive` | id, title, description, category, priority, status, estimated_minutes, actual_minutes, goal_id, project_id, scheduled_date, completed_at, created_at, updated_at |
| `goals` | id, title, description, category, target_date, progress, status, parent_goal_id, timestamps |
| `routines` | id, title, description, category, target_time, duration_minutes, days, enabled, timestamps |
| `habits` | id, title, frequency, target, current_streak, best_streak, enabled, timestamps |
| `habit_logs` | id, habit_id, date, completed, note, created_at — unique on (habit_id, date) |
| `focus_sessions` | id, task_id, category, start_time, end_time, duration_minutes, focus_rating, interruptions, notes |
| `daily_reviews` | id, date, energy, focus, motivation, stress, accomplishments, blockers, notes — unique on date |
| `weekly_reviews` | id, week_start, week_end, planned_tasks, completed_tasks, focus_minutes, distraction_minutes, biggest_win, biggest_problem, next_week_focus, notes — unique on week_start |
| `study_modules` | id, title, type, total_units, done_units, status, link, notes, timestamps |
| `challenges` | id, name, platform, category, difficulty, status, link, solved_date, notes, timestamps |
| `salah` | id, date, fajr, dhuhr, asr, maghrib, isha — unique on date |
| `settings` | key (PK), value |

## Testing locally without Supabase

```bash
node dev/mock-supabase.mjs          # mock REST server on :3000, seeded from real backup
python -m http.server 8090          # serve the app
```

Then open `http://localhost:8090`, Settings → Backend connection → URL `http://localhost:3000`, key: anything ≥ 20 chars → Save.

## Troubleshooting

- **"Backend not configured"** — no URL/key: fill `js/config.js` or Settings → Backend connection.
- **`Supabase error (HTTP 401/403)`** — wrong or truncated anon key; copy it again from Settings → API.
- **`relation "tasks" does not exist`** — you skipped Step 2; run the schema SQL first.
- **Old data missing** — run the migration script (Section above); it is safe to re-run.
- **App shows stale version** — hard refresh (Ctrl+Shift+R); the service worker caches per `?v=` version and every file was bumped to `?v=2.0.0`.
