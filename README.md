# PersonalOS — Personal Productivity Operating System

A complete, single-user productivity app built on **HTML/CSS/vanilla JavaScript + Chart.js** (hosted free on GitHub Pages), with **Google Apps Script** as the backend and **one Google Spreadsheet** as the database.

**The loop:** Plan → Execute → Measure → Reflect → Improve

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, vanilla JS (modular, no framework), Chart.js, Font Awesome |
| Hosting | GitHub Pages (free) |
| Backend | Google Apps Script Web App (`doGet` / `doPost`, action-based API) |
| Database | One Google Spreadsheet (9 sheets) |

---

## Table of contents

1. [Features](#features)
2. [How the pieces fit together](#how-the-pieces-fit-together)
3. [Step 1 — Create the Google Sheet database](#step-1--create-the-google-sheet-database)
4. [Step 2 — Deploy the Google Apps Script backend](#step-2--deploy-the-google-apps-script-backend)
5. [Step 3 — Connect the frontend to the backend](#step-3--connect-the-frontend-to-the-backend)
6. [Step 4 — Deploy the frontend to GitHub Pages](#step-4--deploy-the-frontend-to-github-pages)
7. [Testing locally without Google](#testing-locally-without-google)
8. [Database structure](#database-structure)
9. [API reference](#api-reference)
10. [Reset system — what each option does](#reset-system--what-each-option-does)
11. [Productivity score formula](#productivity-score-formula)
12. [Modifying the application](#modifying-the-application)
13. [Troubleshooting](#troubleshooting)

---

## Features

- **Dashboard** — daily productivity score (0–100), 8 stat tiles, smart insights, 3 live charts.
- **Today** — morning plan (top 3 priorities, today's routine timeline, connected goals), today's tasks with complete/undo/edit/delete/focus/priority-cycle, habit quick check, live day summary.
- **Tasks** — full CRUD, filters (status / category / priority / goal / date / search), overdue detection, estimated vs actual minutes, optional project tag and goal link.
- **Goals** — hierarchy (long-term → 90-day → monthly → …) via parent goals, visual progress bars, auto progress from linked tasks, "add sub-goal / add task" shortcuts.
- **Routines** — time-based schedule builder with per-weekday recurrence (`Every day` supported), enable/disable, duration.
- **Habits** — streaks (current/best) recomputed from logs (editing never breaks history), 30-day completion %, GitHub-style 10-week heatmap, one-tap check-in.
- **Focus timer** — Deep Work / Study / CTF / Project / Quick Task modes, start–pause–resume–stop, survives page reloads, end-of-session dialog ("How focused were you? 1–5", interruptions, notes), distraction categories tracked separately.
- **Analytics** — 8 Chart.js graphs (productivity 7D/30D/90D, focus time, task completion, habit consistency, weekly trend, category distribution, planned vs actual, focus vs distraction) + planning-accuracy card.
- **Smart insights** — generated from your real data ("Task completion dropped 12% compared with last week", "You tend to complete more tasks on Tuesdays", "Entertainment accounted for 18% of tracked time this week", "You usually underestimate tasks by approximately 25%"). With no data it simply says *"Not enough data yet."*
- **Reviews** — daily review (energy/focus/motivation/stress + accomplishment/blocker/notes) with auto day summary; weekly review (auto-computed weekly report + biggest win/problem/next week's focus).
- **Settings** — profile, daily focus goal, dark/light theme, backend URL override + connection test, and the guarded **Data Management / Reset** system.
- **Global search** — `Ctrl+K` or `/` searches tasks, goals, routines, habits and projects.
- **Data safety** — every delete confirms; full resets require typing `RESET`; settings survive "Reset All Progress".

---

## How the pieces fit together

```
┌─────────────────────┐   fetch(JSON POST)   ┌──────────────────────┐   reads/writes   ┌──────────────────┐
│  GitHub Pages       │ ───────────────────► │  Google Apps Script  │ ───────────────► │  Google Sheet    │
│  (HTML/CSS/JS)      │ ◄─────────────────── │  Web App (/exec)     │ ◄─────────────── │  (9 sheets)      │
└─────────────────────┘   {success,data,...}  └──────────────────────┘                  └──────────────────┘
```

- The frontend **never** touches the spreadsheet directly and contains **no spreadsheet ID** — all access goes through the Apps Script Web App.
- All requests are action-based (`{"action":"createTask","data":{…}}`) because Apps Script is not a traditional REST server. Requests are sent as `POST` with a plain-text JSON body, which avoids CORS preflight problems entirely.
- On boot the app makes **one** `getAll` request and caches everything; after that, every create/edit/delete updates the cache locally (optimistic UI) — no unnecessary API calls. Use the ↻ button in the top bar to force a re-sync.
- Dates are stored as **local text** (`YYYY-MM-DD` / `YYYY-MM-DDTHH:MM:SS`). No timezone conversions happen twice — set your Apps Script project timezone once (Step 2).

---

## Step 1 — Create the Google Sheet database

1. Go to <https://sheets.new> and create a blank spreadsheet. Name it e.g. **PersonalOS DB**.
2. You do **not** need to create tabs manually — the backend creates all 9 sheets with correct headers the first time you run `setupSheets()` (next step).
3. Required sheet names (created automatically, spelled exactly like this):

   `Tasks`, `Goals`, `Routines`, `Habits`, `HabitLogs`, `FocusSessions`, `DailyReviews`, `WeeklyReviews`, `Settings`

> If you prefer to create them by hand, copy the exact column layout from [Database structure](#database-structure) below — the API finds columns **by header name**, so column order doesn't matter, but names must match.

---

## Step 2 — Deploy the Google Apps Script backend

1. In your spreadsheet: **Extensions → Apps Script**.
2. Delete the sample code in `Code.gs` and paste the entire contents of [`backend/Code.gs`](backend/Code.gs).
3. *(Recommended)* In the left sidebar click **Project Settings (⚙) → check "Show appsscript.json"**, then replace its contents with [`backend/appsscript.json`](backend/appsscript.json) — and **change `"timeZone"` to your own** (e.g. `"Europe/Berlin"`). Alternatively set the timezone via Project Settings → Time zone dropdown.
4. In the editor select the function **`setupSheets`** and click **Run**. Approve the authorization prompt (it only needs access to *this* spreadsheet).
5. *(Optional)* Run **`setupSampleData`** once to fill the database with a week of realistic test data (tasks, habits, focus sessions, reviews). You can wipe it later with **Settings → Data Management → Reset Everything** in the app.
6. **Deploy → New deployment → select type: Web app**
   - Description: `PersonalOS API v1`
   - Execute as: **Me**
   - Who has access: **Anyone**  ← required so the browser can call it without login
7. Click **Deploy**, then **Copy** the Web App URL. It looks like:
   `https://script.google.com/macros/s/AKfycb…/exec`

> **After any later change to `Code.gs`:** Deploy → Manage deployments → ✏ Edit → Version: **New version** → Deploy. The URL stays the same.

---

## Step 3 — Connect the frontend to the backend

Two ways — use either:

**A. In the UI (no code edit):** open the app → **Settings → Backend connection** → paste the `/exec` URL → **Save URL** → **Test connection**. The URL is stored in your browser (localStorage).

**B. In code (default for all visitors):** edit [`js/config.js`](js/config.js):

```javascript
const CONFIG = {
    API_URL: "https://script.google.com/macros/s/AKfycb…/exec"  // ← your URL
    ...
};
```

Never put a spreadsheet ID in the frontend — the sheet is only ever accessed by the Apps Script.

---

## Step 4 — Deploy the frontend to GitHub Pages

1. Create a GitHub repository named e.g. `personal-os`.
2. Upload **everything except the `dev/` folder** (dev is only for local testing):

   ```
   personal-os/
   ├── index.html
   ├── css/            (style.css, dashboard.css, responsive.css)
   ├── js/             (config.js, utils.js, api.js, analytics.js, dashboard.js,
   │                    tasks.js, goals.js, routines.js, habits.js, focus.js,
   │                    reviews.js, settings.js, app.js)
   ├── assets/icons/   (favicon.svg)
   ├── backend/        (Code.gs, appsscript.json — reference copies; the real
   │                    script lives in your Google Sheet's Apps Script editor)
   └── README.md
   ```

3. Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, folder: `/ (root)` → Save.
4. After a minute your app is live at `https://<your-username>.github.io/personal-os/`.
5. Pin the app: add it to your phone's home screen — the layout is fully responsive (bottom navigation on mobile).

> **Using a local folder instead?** The app also works from `file://` — no build step, no server required.

---

## Testing locally without Google

A drop-in mock of the Apps Script API is included:

```bash
node dev/mock-server.mjs        # → http://127.0.0.1:8788
```

Then in the app: **Settings → Backend connection** → paste `http://127.0.0.1:8788` → **Save URL** → **Test connection**. It seeds a week of sample data in memory. (Requires Node.js; `Clear override` in Settings switches you back to the real backend.)

---

## Database structure

One spreadsheet, nine sheets. Headers in row 1; data below. All values are plain text/numbers — the backend formats date columns as text so nothing is ever auto-converted.

### Tasks
| column | meaning |
|---|---|
| id | unique UUID |
| title / description | task name, details |
| category | Learning · Projects · Work · Personal · Entertainment · Other |
| priority | low · medium · high (click the badge in the UI to cycle) |
| status | pending · in-progress · completed |
| estimated_minutes / actual_minutes | feeds the planned-vs-actual analytics |
| goal_id | links the task to a goal (hierarchy bottom layer) |
| project_id | free-text project tag, searchable |
| scheduled_date | `YYYY-MM-DD` — the day it appears on Today |
| completed_at | `YYYY-MM-DDTHH:MM:SS`, set when completed, cleared on undo |
| created_at / updated_at | ISO timestamps; created_at is never modified |

### Goals
id, title, description, category, target_date, progress (0–100), status (active/paused/completed), **parent_goal_id** (builds the long-term → 90-day → monthly hierarchy), created_at, updated_at.

### Routines
id, title, description, category, target_time (`HH:MM`), duration_minutes, **days** (`Every day` or comma list like `Mon,Wed,Fri`), enabled (TRUE/FALSE), created_at, updated_at.

### Habits
id, title, frequency (daily/weekdays/weekly), target, **current_streak / best_streak** (auto-recomputed server-side after every check-in — historical logs are never modified), enabled, created_at, updated_at.

### HabitLogs
id, habit_id, date (`YYYY-MM-DD`), completed (TRUE/FALSE), note, created_at. One row per habit per day (upserted). This is the source of truth for streaks and heatmaps.

### FocusSessions
id, task_id, category, start_time / end_time (`YYYY-MM-DDTHH:MM:SS`), duration_minutes, focus_rating (1–5), interruptions, notes.

### DailyReviews
id, date, energy / focus / motivation / stress (1–5), accomplishments, blockers, notes. One per day (upserted by date).

### WeeklyReviews
id, week_start (`YYYY-MM-DD`, Monday), week_end, planned_tasks, completed_tasks, focus_minutes, distraction_minutes (auto-filled at save time), biggest_win, biggest_problem, next_week_focus, notes. One per week (upserted by week_start).

### Settings
Simple key/value pairs, e.g. `user_name`, `daily_focus_goal_minutes`. Survives "Reset All Progress"; wiped only by "Reset Everything".

---

## API reference

All endpoints are the **one Web App URL**. Send `POST` with JSON body `{"action": "...", "data": {...}}` (or `GET ?action=...&data={...}` for reads). Responses:

```json
{ "success": true,  "message": "Task created successfully", "data": { } }
{ "success": false, "message": "Task title is required." }
```

| Read actions (`GET` or `POST`) | Write actions (`POST`) |
|---|---|
| `ping` | `createTask` / `updateTask` / `deleteTask` |
| `getAll` (everything in one call) | `createGoal` / `updateGoal` / `deleteGoal` |
| `getTasks` `getGoals` `getRoutines` `getHabits` `getHabitLogs` `getFocusSessions` `getDailyReviews` `getWeeklyReviews` | `createRoutine` / `updateRoutine` / `deleteRoutine` |
| `getSettings` | `createHabit` / `updateHabit` / `deleteHabit` / `setHabitLog` |
| `getAnalytics` (`{days: 7|30|90}`) | `createFocusSession` / `deleteFocusSession` |
| | `createDailyReview` / `deleteDailyReview` |
| | `createWeeklyReview` / `deleteWeeklyReview` |
| | `saveSettings` |
| | `reset` (`{type: today\|week\|progress\|everything}`) |

Notes:
- `createDailyReview`, `createWeeklyReview` and `setHabitLog` **upsert** by their natural key (date / week_start / habit_id+date) — saving twice updates instead of duplicating.
- Deletes cascade sensibly: deleting a goal unlinks its tasks and sub-goals; deleting a habit removes its logs; deleting a task keeps focus-session history but clears the link.
- Every write runs under `LockService`, IDs are UUIDs, `created_at` is preserved, `updated_at` is refreshed on every change.

---

## Reset system — what each option does

All in **Settings → Data management**:

| Option | What it does | Confirmation |
|---|---|---|
| **Reset Today's Progress** | Tasks completed today → pending again; deletes today's focus sessions, habit check-ins and daily review. Tasks themselves are kept. | Confirm dialog |
| **Reset Weekly Progress** | Same reset applied to every day of the current Mon–Sun week + deletes this week's weekly review. | Confirm dialog |
| **Reset All Progress** | Permanently deletes **all** tasks, habit logs, focus sessions, daily & weekly reviews. **Keeps** goals, routines, habits, settings and all configuration. | ⚠ Strong warning + must type `RESET` |
| **Reset Everything** | Wipes the **complete** database — every sheet **including settings**. | ⚠ Strong warning + must type `RESET` |

The reset runs server-side on the spreadsheet, then the app fully re-syncs. Nothing is deleted without passing its confirmation, and no reset can be triggered accidentally by a stray click.

---

## Productivity score formula

Deliberately simple (0–100):

```
tasks        40 pts   completed ÷ planned today
focus        30 pts   today's focus minutes ÷ your daily focus goal (Settings)
habits       20 pts   habits done today ÷ enabled habits
distraction −10 max   −1 pt per 6 min of distraction/entertainment time
```

The dashboard shows the live breakdown under the score ring. Adjust `daily_focus_goal_minutes` in **Settings → Profile** to match your reality. The backend's `getAnalytics` endpoint computes the same score server-side from the sheet data.

---

## Modifying the application

| I want to… | Touch |
|---|---|
| Change categories, priorities, focus modes | `js/config.js` (`CONFIG`) |
| Change the score weights | `Analytics.scoreDay()` in `js/analytics.js` + `scoreDay_()` in `Code.gs` |
| Add a graph | Add a `Charts.make(...)` call in `AnalyticsPage` (`js/analytics.js`) |
| Add a field to a task | Add the column header in the sheet (any order), add the input in `Tasks.openForm()`, include it in the form-data object |
| Add a whole new entity | Add sheet + schema array in `Code.gs` (`SCHEMA`), run `setupSheets()`, mirror the generic create/update/delete actions, then build the UI module |
| Change theme colors | CSS variables at the top of `css/style.css` (`:root` and `[data-theme="light"]`) |
| Tweak insights | `Analytics.insights()` in `js/analytics.js` |

The data layer finds columns **by name**, so reordering or appending columns in the spreadsheet is safe. Extra fields sent by the frontend are ignored unless a matching column exists.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Backend not configured" banner | Set the URL: Settings → Backend connection (or `js/config.js` → `CONFIG.API_URL`). |
| "Unable to connect to the backend" | Is the deployment set to **Who has access: Anyone**? Did you re-deploy a **new version** after editing `Code.gs`? Test with Settings → **Test connection**. |
| Error mentioning "No spreadsheet found" | The script must be bound to the sheet (created via Extensions → Apps Script *from the sheet*) **or** set the `SPREADSHEET_ID` script property (Project Settings → Script Properties). |
| "Unknown action" | Old deployment version — re-deploy a new version of the Web App. |
| Data saved but wrong "today" | Set the Apps Script **project time zone** to yours (Project Settings). The app itself always uses your device's local time for new records. |
| Charts empty | They fill from real data: log focus sessions, schedule/complete tasks, check habits. Or run `setupSampleData` from the Apps Script editor. |
| CORS / "Failed to fetch" | Make sure requests go through this app's `API.call()` (plain-text body, no custom headers). Opening the page from `file://` is supported. |
| Everything looks broken after an update | Hard-refresh the page (`Ctrl+Shift+R`) to bust cached JS. |

---

*Built as a single-user system — there is no login by design. Anyone with the GitHub Pages URL can *see* the frontend, but your data is only readable through your Google account's Apps Script deployment.*
