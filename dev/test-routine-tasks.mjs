/* ============================================================================
 * AluBhaiOS — headless test: routine auto day-tasks (v2.3.0)
 *   node dev/test-routine-tasks.mjs
 * Covers: coversDay matching, ensureTodayTasks (create / dedup ledger /
 * existing-task skip / non-day skip / disabled skip), weekStrip classes.
 * ========================================================================== */
import fs from 'node:fs';
import crypto from 'node:crypto';

/* ---- environment stubs ---- */
const store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] ?? null : null),
  setItem: (k, v) => { store[k] = String(v); }
};
globalThis.window = { crypto, localStorage: globalThis.localStorage };

const App = {
  settings: {},
  state: { routines: [], tasks: [], habitLogs: [] },
  online: true,
  current: 'routines',
  replaceRecord(list, rec) {
    const arr = this.state[list] || (this.state[list] = []);
    const i = arr.findIndex(x => x.id === rec.id);
    if (i > -1) arr[i] = rec; else arr.push(rec);
  },
  refreshCurrent() {},
  container: () => null
};
globalThis.App = App;
globalThis.window.App = App;

globalThis.Utils = {
  pref: () => null,
  uid: () => crypto.randomUUID(),
  pad: n => String(n).padStart(2, '0'),
  today: () => '2026-10-04', // Sunday
  parseDate(s) {
    if (!s) return null;
    const p = String(s).slice(0, 10).split('-').map(Number);
    if (p.length !== 3 || p.some(isNaN)) return null;
    return new Date(p[0], p[1] - 1, p[2]);
  },
  addDays(dateStr, n) {
    const d = this.parseDate(dateStr);
    if (!d) return null;
    d.setDate(d.getDate() + n);
    return this.dateStr(d);
  },
  dateStr(d) { return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`; },
  weekdayShort(dateStr) {
    const d = this.parseDate(dateStr);
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  },
  startOfWeek(dateStr) {
    const d = this.parseDate(dateStr);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
    return this.dateStr(d);
  },
  num: v => { const n = Number(v); return isFinite(n) ? n : 0; },
  fmtMinutes: m => Math.round(m) + 'm',
  esc: s => String(s ?? '')
};
globalThis.CONFIG = { DEFAULTS: {} };

const createdTasks = [];
const savedSettings = [];
globalThis.API = {
  createTask: async d => { createdTasks.push({ ...d }); return { id: 'auto-' + (createdTasks.length), ...d }; },
  saveSettings: async o => { savedSettings.push({ ...o }); return { settings: o }; }
};
globalThis.toast = () => {};
globalThis.qs = () => null; globalThis.qsa = () => []; globalThis.el = () => ({});
globalThis.icon = () => 'i'; globalThis.chip = () => 'c'; globalThis.emptyState = () => '';
globalThis.openModal = () => ({ close() {} }); globalThis.confirmDialog = async () => true;

const Routines = new Function('App', 'Utils', 'CONFIG', 'API', 'toast', 'qs', 'qsa', 'el', 'icon', 'chip', 'emptyState', 'openModal', 'confirmDialog',
  fs.readFileSync('js/routines.js', 'utf8').replace(/'use strict';/, '') + '; return Routines;')(
  App, globalThis.Utils, globalThis.CONFIG, globalThis.API, globalThis.toast,
  globalThis.qs, globalThis.qsa, globalThis.el, globalThis.icon, globalThis.chip,
  globalThis.emptyState, globalThis.openModal, globalThis.confirmDialog);

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  ok ? pass++ : fail++;
  console.log((ok ? '✓' : '✗') + ' ' + name + (detail ? ' — ' + detail : ''));
};

/* ---- T1: coversDay ---- */
const rTue = { days: 'Tue' };
check('T1a coversDay "Tue" matches Tue (2026-10-06)', Routines.coversDay(rTue, 'Tue'));
check('T1b coversDay "Tue" rejects Sun (2026-10-04)', !Routines.coversDay(rTue, 'Sun'));
check('T1c coversDay "Every day" matches anything', Routines.coversDay({ days: 'Every day' }, 'Wed'));
check('T1d coversDay "Mon, Wed" matches Wed', Routines.coversDay({ days: 'Mon, Wed' }, 'Wed'));

/* ---- T2: retired generation — legacy data remains intact ---- */
App.settings.routine_auto_task = JSON.stringify({ r1: true, r2: true });
App.settings.routine_task_log = JSON.stringify({ r1: { '2026-10-03': true } });
App.state.routines = [
  { id: 'r1', title: 'Morning Study', days: 'Every day', enabled: true, category: 'Learning', target_time: '08:00', duration_minutes: 60 },
  { id: 'r2', title: 'Tue Special', days: 'Tue', enabled: true }
];
App.state.tasks = [{ id: 'old1', title: 'Morning Study', project_id: 'routine:r1', scheduled_date: '2026-10-04', status: 'completed' }];
const previous = JSON.stringify({ settings: App.settings, routines: App.state.routines, tasks: App.state.tasks });
await Routines.ensureTodayTasks();
await Routines.ensureTodayTasks();
check('T2 no new recurring tasks created after retirement', createdTasks.length === 0);
check('T3 no generation ledger/settings writes', savedSettings.length === 0);
check('T4 old tasks, routines and settings preserved', JSON.stringify({ settings: App.settings, routines: App.state.routines, tasks: App.state.tasks }) === previous);

/* ---- T5: weekStrip classes ---- */
App.state.tasks.filter(x => x.project_id === 'routine:r1').forEach(x => { x.status = 'completed'; });
const strip = Routines.weekStrip(App.state.routines[0]); // r1: Every day, auto via flags
check('T5a strip has 7 dots', (strip.match(/rt-dot/g) || []).length === 7);
check('T5b today cell highlighted', strip.includes('rt-dot today'));
check('T5c done cell for completed task', strip.includes(' done'));
// stub today is Sunday = LAST day of the Monday-based week, so no cell in the
// current week can ever be 'future' — exercise the future class on the NEXT
// week's dates via a temp Utils.today shift instead (date-independent now)
{
  const realToday = Utils.today;
  Utils.today = () => '2026-10-01'; // Thursday, mid-week → 3 future cells
  const stripF = Routines.weekStrip({ id: 'r9f', days: 'Every day', auto_task: true });
  check('T5d upcoming cells for future days', stripF.includes(' future'));
  Utils.today = realToday;
}
const strip2 = Routines.weekStrip({ id: 'r9', days: 'Tue', auto_task: true }); // Tue-only: Sun off
check('T5e non-scheduled day dimmed (off)', strip2.includes(' off'));

console.log(`\nROUTINE AUTO-TASK TESTS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
