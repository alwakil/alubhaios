/* headless test: week strip v2 — trail %, labels, click handler routing */
import fs from 'node:fs';
import crypto from 'node:crypto';

const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] ?? null : null), setItem: (k, v) => { store[k] = String(v); } };
globalThis.window = { crypto };
const App = { settings: {}, state: { routines: [], tasks: [] }, online: true, current: 'routines', replaceRecord(l, r) { const a = this.state[l] || (this.state[l] = []); const i = a.findIndex(x => x.id === r.id); if (i > -1) a[i] = r; else a.push(r); }, refreshCurrent() {}, route() {}, container: () => null, handleError(e) { throw e; } };
globalThis.App = App; globalThis.window.App = App;

globalThis.Utils = {
  pref: () => null, uid: () => crypto.randomUUID(), pad: n => String(n).padStart(2, '0'),
  today: () => '2026-10-06', // Tuesday
  parseDate(s) { const p = String(s).slice(0, 10).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); },
  addDays(s, n) { const d = this.parseDate(s); d.setDate(d.getDate() + n); return this.dateStr(d); },
  dateStr: d => `${d.getFullYear()}-${globalThis.Utils.pad(d.getMonth() + 1)}-${globalThis.Utils.pad(d.getDate())}`,
  weekdayShort(s) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][this.parseDate(s).getDay()]; },
  startOfWeek(s) { const d = this.parseDate(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return this.dateStr(d); },
  num: v => { const n = Number(v); return isFinite(n) ? n : 0; },
  fmtMinutes: m => Math.round(m) + 'm', fmtDay: s => 'day', esc: s => String(s ?? '')
};
globalThis.CONFIG = { DEFAULTS: {} };
const created = [], saved = [];
globalThis.API = {
  createTask: async d => { created.push({ ...d }); return { id: 't' + created.length, ...d }; },
  saveSettings: async o => { saved.push({ ...o }); return { settings: o }; }
};
globalThis.toast = m => toasts.push(m);
const toasts = [];
globalThis.qs = () => null; globalThis.qsa = () => []; globalThis.el = () => ({});
globalThis.icon = () => 'i'; globalThis.chip = () => 'c'; globalThis.emptyState = () => '';
globalThis.openModal = () => ({ close() {} }); globalThis.confirmDialog = async () => true;

globalThis.Tasks = { filter: {} }; // real app has this global (tasks.js)

globalThis.location = { hash: '#/routines' }; globalThis.AppRouteCalled = false;

const Routines = new Function('App', 'Utils', 'CONFIG', 'API', 'toast', 'qs', 'qsa', 'el', 'icon', 'chip', 'emptyState', 'openModal', 'confirmDialog',
  fs.readFileSync('js/routines.js', 'utf8').replace(/'use strict';/, '') + '; return Routines;')(
  App, globalThis.Utils, globalThis.CONFIG, globalThis.API, globalThis.toast, globalThis.qs, globalThis.qsa, globalThis.el, globalThis.icon, globalThis.chip, globalThis.emptyState, globalThis.openModal, globalThis.confirmDialog);

let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? '✓' : '✗') + ' ' + n + (d ? ' — ' + d : '')); };

/* setup: every-day auto routine; Mon done, Tue(today) pending task */
App.settings.routine_auto_task = JSON.stringify({ r1: true });
App.state.routines = [{ id: 'r1', title: 'Daily Study', days: 'Every day', enabled: true, category: 'Learning', target_time: '08:00', duration_minutes: 30 }];
App.state.tasks = [
  { id: 'a', project_id: 'routine:r1', scheduled_date: '2026-10-05', status: 'completed' }, // Mon done
  { id: 'b', project_id: 'routine:r1', scheduled_date: '2026-10-06', status: 'pending' }  // Tue pending
];
const strip = Routines.weekStrip(App.state.routines[0]);
check('T1 strip renders buttons (interactive)', (strip.match(/<button/g) || []).length === 7);
check('T2 done dot shows ✓', strip.includes('>✓</button>'));
check('T3 track width = 100% (2 scheduled-so-far, 2 done)', strip.includes('width:100%') || strip.includes('width:100 %') || /width:\s*100%/.test(strip));
check('T4 meta shows 2/2', strip.includes('2/2 scheduled days done'));
check('T5 today dot has pulsing class', strip.includes('rt-dot today'));
check('T6 dots carry data-rt-date', strip.includes('data-rt-date="2026-10-06"'));

/* Legacy day dots are intentionally retired, not an alternate writer. */
const before = created.length;
const previous = JSON.stringify(App.state.tasks);
for (const date of ['2026-10-05', '2026-10-06', '2026-10-10']) {
  await Routines.dayDotClick(App.state.routines[0], date);
}
check('T7 retired dots never create or backfill tasks', created.length === before);
check('T8 retired dots leave legacy Tasks unchanged', JSON.stringify(App.state.tasks) === previous);
check('T9 retired dots do not write settings', saved.length === 0);
check('T10 retired dots direct users to Weekly Planner', toasts.some(t => t.includes('Weekly Planner')));

console.log(`\nWEEK STRIP v2 TESTS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
