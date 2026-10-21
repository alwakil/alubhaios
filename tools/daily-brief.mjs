#!/usr/bin/env node
/* ============================================================
   AluBhaiOS — daily Telegram briefing (runs on GitHub Actions)
   Reads your Supabase data and sends one morning message:
     tasks due today · overdue · deadlines · streaks · XP
   No server needed — schedule + secrets live in the repo.

   Required env (set as GitHub repo secrets):
     SUPABASE_URL        https://xxxx.supabase.co
     SUPABASE_ANON_KEY   anon public key (safe — RLS on)
     TELEGRAM_BOT_TOKEN  from @BotFather
     TELEGRAM_CHAT_ID    your chat id (message @userinfobot)

   Local test:
     SUPABASE_URL=... SUPABASE_ANON_KEY=... TELEGRAM_BOT_TOKEN=... \
     TELEGRAM_CHAT_ID=... node tools/daily-brief.mjs
   ============================================================ */
'use strict';

const { SUPABASE_URL, SUPABASE_ANON_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
const DRY = process.env.DRY_RUN === '1';

const pad = n => String(n).padStart(2, '0');
const now = new Date();
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const get = async table => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=5000`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
  });
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
  return res.json();
};

const buildMessage = data => {
  const tasks = (data.tasks || []).filter(t => !t._archived);
  const open = tasks.filter(t => t.status !== 'completed');
  const overdue = open.filter(t => t.scheduled_date && t.scheduled_date < today);
  const dueToday = open.filter(t => t.scheduled_date === today);
  const deadlines = open
    .filter(t => /^\d{4}-\d{2}-\d{2}$/.test(String(t.due_date || '').slice(0, 10)))
    .map(t => ({ title: t.title, due: String(t.due_date).slice(0, 10) }))
    .filter(d => d.due >= addDays(today, -1))
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 4);
  const finishedYest = tasks.filter(t => String(t.completed_at || '').slice(0, 10) === addDays(today, -1));
  const habits = (data.habits || []).filter(h => h.enabled !== false);
  const doneHabit = new Set((data.habit_logs || [])
    .filter(l => String(l.date).slice(0, 10) === today && String(l.completed).toLowerCase() === 'true')
    .map(l => l.habit_id));
  const salah = (data.salah || []).find(r => String(r.date).slice(0, 10) === addDays(today, -1));
  const prayersDone = salah ? ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].filter(k => salah[k] === true || String(salah[k]).toLowerCase() === 'true').length : null;

  const lines = [];
  lines.push(`🌅 *AluBhaiOS — ${today}*`);
  lines.push('');
  lines.push(`📋 Today: *${dueToday.length}* task${dueToday.length === 1 ? '' : 's'} scheduled · ✅ ${finishedYest.length} finished yesterday`);
  if (overdue.length) lines.push(`⚠️ Overdue: *${overdue.length}* — ${overdue.slice(0, 3).map(t => t.title).join(' · ')}`);
  deadlines.forEach(d => {
    const left = Math.round((new Date(d.due) - new Date(today)) / 86400000);
    lines.push(left < 0 ? `⏰ OVERDUE deadline: ${d.title} (${Math.abs(left)}d past)` : `⏰ Deadline: ${d.title} — ${left}d left`);
  });
  if (habits.length) lines.push(`🔥 Habits today: ${doneHabit.size}/${habits.length} checked${doneHabit.size === 0 ? ' — one check-in starts the streak' : ''}`);
  if (prayersDone !== null) lines.push(`🕌 Yesterday's salah: ${prayersDone}/5`);
  lines.push('');
  lines.push(dueToday.length || overdue.length
    ? '💪 Pick the hardest one first — the frog gets smaller after breakfast.'
    : '🧘 Clear board today — good day for a study module or a CTF challenge.');
  return lines.join('\n');
};

(async () => {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY missing');
    const [tasks, habits, habit_logs, salah] = await Promise.all([get('tasks'), get('habits'), get('habit_logs'), get('salah')]);
    const msg = buildMessage({ tasks, habits, habit_logs, salah });
    if (DRY) { console.log('DRY RUN — message:\n' + msg); return; }
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) throw new Error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing');
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown' })
    });
    const out = await res.json();
    if (!res.ok || !out.ok) throw new Error('Telegram: ' + JSON.stringify(out).slice(0, 200));
    console.log('Sent:', msg.replace(/\n/g, ' | ').slice(0, 160) + '…');
  } catch (e) {
    console.error('daily-brief failed:', e.message);
    process.exit(1);
  }
})();
