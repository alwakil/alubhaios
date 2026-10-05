/* ============================================================
   AluBhaiOS — Configuration
   The ONLY file you normally need to edit to connect your backend.
   Backend: Supabase (free) — Project URL + anon public key from
   Supabase Dashboard → Settings → API.
   Never put the service_role key here — only the anon key is safe
   for a public frontend.
   ============================================================ */
'use strict';

const CONFIG = {
  // Your Supabase project settings (permanent defaults for this app).
  // Values saved later in Settings → Backend connection OVERRIDE these
  // (stored per browser); leave the Settings fields empty to use these.
  SUPABASE_URL: "https://dtxqklysrsvylyzxpkur.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0eHFrbHlzcnN2eWx5enhwa3VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMzEwNTcsImV4cCI6MjEwNjYwNzA1N30.lDqj65ezE5N38YxzKgNMhpiqJ-b_q5pHQROilyIUmbU",

  APP_NAME: "AluBhaiOS",
  VERSION: "2.3.3",

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
