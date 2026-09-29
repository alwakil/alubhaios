/* ============================================================
   PersonalOS — Configuration
   The ONLY file you normally need to edit to connect your backend.
   Never put a spreadsheet ID here — the spreadsheet is only ever
   touched by the Google Apps Script Web App (see /backend/Code.gs).
   ============================================================ */
'use strict';

const CONFIG = {
  // Your Google Apps Script Web App URL (permanent default for this app).
  // Any value saved later in Settings → Backend connection OVERRIDES this
  // (stored per browser); leave the Settings field empty to use this one.
  API_URL: "https://script.google.com/macros/s/AKfycbwgU_59SYgnZ5e1jYYpJmJT2E23-_07yhRKEkD8EJQAmDxH8s2iw0udJOlhxtJIJh9cgQ/exec",

  APP_NAME: "PersonalOS",
  VERSION: "1.0.0",

  CATEGORIES: ["Learning", "Projects", "Work", "Personal", "Entertainment", "Other"],
  // Sessions in these categories count as "distraction time", not focus time.
  DISTRACTION_CATEGORIES: ["Entertainment", "Distraction"],

  PRIORITIES: ["low", "medium", "high"],
  TASK_STATUSES: ["pending", "in-progress", "completed"],
  GOAL_STATUSES: ["active", "paused", "completed"],

  FOCUS_MODES: [
    { name: "Deep Work", suggested_minutes: 50 },
    { name: "Study", suggested_minutes: 45 },
    { name: "CTF", suggested_minutes: 60 },
    { name: "Project", suggested_minutes: 40 },
    { name: "Quick Task", suggested_minutes: 15 }
  ],

  // Default productivity-score settings (can be changed in Settings).
  DEFAULTS: {
    user_name: "",
    daily_focus_goal_minutes: 120
  }
};
