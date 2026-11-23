/* Synthetic-only integration checks: no server, browser, credentials or backups. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const database = new Map(), requests = [], messages = [];
let confirmation = true, confirmHook = null, failTable = '', date = '2026-11-23';
let refreshes = 0, pass = 0;
const pad = n => String(n).padStart(2, '0');
const dateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const Utils = {
  today: () => date, nowISO: () => date + 'T10:00:00', pad,
  parseDate: value => { const [y, m, d] = String(value).split('-').map(Number); return new Date(y, m - 1, d); },
  dateStr, addDays(value, n) { const d = this.parseDate(value); d.setDate(d.getDate() + n); return dateStr(d); },
  weekdayShort(value) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][this.parseDate(value).getDay()]; },
  startOfWeek(value) { return this.addDays(value, -((this.parseDate(value).getDay() + 6) % 7)); },
  pref: () => null, num: v => Number(v) || 0, uid: () => 'synthetic-id',
  esc: value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  fmtDate: value => value, fmtDay: value => value, fmtMinutes: value => value + 'm', categoryColor: () => '#123456', priorityColor: () => '#123456'
};
const App = { settings: {}, state: { tasks: [], routines: [], goals: [], habits: [], weeklyReviews: [] }, online: true,
  refreshCurrent: () => { refreshes++; }, reload: () => {}, hideError: () => {}, container: () => null };
const context = vm.createContext({
  console, URL, JSON, Map, Set, Promise, AbortController,
  window: { App }, App, Utils,
  CONFIG: { VERSION: '2.15.0', APP_NAME: 'AluBhaiOS', CATEGORIES: ['Other'], DEFAULTS: {}, SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_ANON_KEY: 'synthetic-public-key-not-a-real-key' },
  document: { addEventListener() {}, title: '' }, location: { hash: '#/routines' },
  setTimeout: () => 1, clearTimeout: () => {},
  qs: () => null, qsa: () => [], icon: name => `[${name}]`, chip: text => Utils.esc(text),
  toast: (text, tone) => { messages.push({ text, tone }); },
  typeConfirm: async () => { if (confirmHook) confirmHook(); return confirmation; },
  confirmDialog: async () => confirmation,
  fetch: async (url, opts) => {
    // All fetches are handled here; an unexpected destination fails the test.
    assert.ok(String(url).startsWith('https://synthetic.invalid/rest/v1/'));
    const parsed = new URL(url), table = parsed.pathname.split('/').at(-1), body = opts.body ? JSON.parse(opts.body) : null;
    requests.push({ url: String(url), table, method: opts.method, body, prefer: opts.headers.Prefer });
    const response = (rows, status = 200) => ({ ok: status < 400, status, headers: { get: () => '*/0' }, text: async () => JSON.stringify(rows) });
    if (table === failTable) return response('Synthetic failure', 400);
    if (table !== 'settings') return response(opts.method === 'POST' ? (Array.isArray(body) ? body : [body]) : []);
    if (opts.method === 'POST') {
      const rows = [];
      for (const row of (Array.isArray(body) ? body : [body])) {
        if (opts.headers.Prefer.includes('resolution=ignore-duplicates') && database.has(row.key)) continue;
        database.set(row.key, row.value); rows.push(row);
      }
      return response(rows);
    }
    if (opts.method === 'PATCH') {
      const key = parsed.searchParams.get('key').slice(3), expected = parsed.searchParams.get('value').slice(3);
      if (database.get(key) !== expected) return response([]);
      database.set(key, body.value); return response([{ key, value: body.value }]);
    }
    if (opts.method === 'DELETE') { database.clear(); return response([]); }
    return response([...database].map(([key, value]) => ({ key, value })));
  }
});
function load(file, name) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  return vm.runInContext(name, context);
}
const API = load('js/api.js', 'API');
const WeeklyPlanner = load('js/weekly-planner.js', 'WeeklyPlanner');
const Settings = load('js/settings.js', 'Settings');
const Tasks = load('js/tasks.js', 'Tasks');
const Routines = load('js/routines.js', 'Routines');
const Dashboard = load('js/dashboard.js', 'Dashboard');
const key = WeeklyPlanner.key('2026-11-20', 'task-1');
const plan = () => ({ version: 1, week_start: '2026-11-20', task_id: 'task-1', title: 'Synthetic <task>', category: 'Other', effective_from: '2026-11-20', created_at: '2026-11-20T10:00:00', updated_at: '2026-11-23T10:00:00', sessions: [{ id: 's-1', date: '2026-11-23', added_at: '2026-11-20T10:00:00', done_at: '2026-11-23T10:00:00', cancelled_at: '', moves: [] }] });
const file = tables => ({ text: async () => JSON.stringify({ app: 'AluBhaiOS', version: '2.15.0', tables }) });
function clean() {
  database.clear(); requests.length = 0; messages.length = 0; failTable = ''; confirmation = true; confirmHook = null;
  App.settings = {}; App.state.tasks = []; App.state.goals = []; App.state.weeklyReviews = []; refreshes = 0;
}
async function test(name, run) { clean(); await run(); pass++; console.log('PASS ' + name); }

await test('new record uses ignore-duplicates; local cache changes only after success', async () => {
  const raw = JSON.stringify(plan()), pending = API.savePlannerRecord(key, undefined, raw);
  assert.equal(App.settings[key], undefined);
  const row = await pending;
  assert.equal(row.value, raw); assert.equal(App.settings[key], raw);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].prefer, 'resolution=ignore-duplicates,return=representation');
  assert.equal(requests[0].body.key, key);
});
await test('duplicate new record conflicts without a local overwrite', async () => {
  database.set(key, 'other-device'); App.settings[key] = 'local';
  await assert.rejects(API.savePlannerRecord(key, undefined, JSON.stringify(plan())), e => e.code === 'CONFLICT' && e.message === 'Weekly plan changed on another device. Sync and try again.');
  assert.equal(database.get(key), 'other-device'); assert.equal(App.settings[key], 'local');
});
await test('existing raw JSON is fully encoded in compare-and-set PATCH', async () => {
  const old = JSON.stringify({ ...plan(), title: 'Quotes " & ? / # % commas, + unicode বাংলা' });
  const raw = JSON.stringify(plan()); database.set(key, old); App.settings[key] = old;
  await API.savePlannerRecord(key, old, raw);
  assert.equal(requests[0].method, 'PATCH');
  assert.ok(requests[0].url.endsWith('?key=eq.' + encodeURIComponent(key) + '&value=eq.' + encodeURIComponent(old) + '&select=*'));
  assert.equal(requests[0].prefer, 'return=representation'); assert.equal(App.settings[key], raw);
});
await test('two concurrent device saves cannot silently lose an update', async () => {
  const raw = JSON.stringify(plan()); database.set(key, raw); App.settings[key] = raw;
  const outcomes = await Promise.allSettled([API.savePlannerRecord(key, raw, raw + ' '), API.savePlannerRecord(key, raw, raw + '  ')]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(r => r.status === 'rejected').reason.code, 'CONFLICT');
  assert.equal(database.get(key), raw + ' '); assert.equal(App.settings[key], raw + ' ');
});
await test('invalid key/type and failed requests never mutate local settings', async () => {
  await assert.rejects(API.savePlannerRecord('other-setting', undefined, '{}'));
  await assert.rejects(API.savePlannerRecord(key, null, '{}'));
  assert.equal(requests.length, 0);
  failTable = 'settings'; App.settings[key] = 'original';
  await assert.rejects(API.savePlannerRecord(key, 'original', '{}'));
  assert.equal(App.settings[key], 'original');
});
await test('backup builder preserves every setting and planner history', async () => {
  const raw = JSON.stringify(plan());
  const data = { tasks: [{ id: 'task-1' }], settings: { user_name: 'Synthetic', [key]: raw }, settingsRows: [{ key: 'obsolete', value: '' }] };
  const backup = Settings.buildBackup(data);
  assert.equal(backup.tables.settings[key], raw); assert.equal(backup.tables.settings.user_name, 'Synthetic');
  assert.equal(backup.tables.settingsRows, undefined); assert.ok(data.settingsRows);
  assert.equal(Settings.backupSettingsRows(backup.tables).length, 2);
});
await test('canonical restore writes settings and validated plans alongside tables', async () => {
  const raw = JSON.stringify(plan());
  const res = await Settings.restoreFromFile(file({ tasks: [{ id: 'task-1' }], settings: { user_name: 'Synthetic', [key]: raw } }));
  assert.equal(res.done, 3); assert.equal(res.failed, 0); assert.equal(database.get(key), raw);
  assert.equal(App.settings.user_name, 'Synthetic');
  assert.ok(requests.some(r => r.table === 'settings' && r.prefer.includes('ignore-duplicates')));
});
await test('legacy settingsRows restore and existing planner CAS both work', async () => {
  const raw = JSON.stringify(plan()), old = raw + ' '; database.set(key, old); App.settings[key] = old;
  const res = await Settings.restoreFromFile(file({ settingsRows: [{ key: 'profile', value: 'Synthetic' }, { key, value: raw }] }));
  assert.equal(res.done, 2); assert.equal(database.get(key), raw);
  assert.ok(requests.some(r => r.table === 'settings' && r.method === 'PATCH'));
});
await test('corrupt, unsupported and duplicate planner backups fail before any writes', async () => {
  for (const tables of [
    { tasks: [{ id: 'task-1' }], settings: { [key]: '{broken' } },
    { settings: { ['weekly_plan.v2.2026-11-20.task-1']: '{}' } },
    { settingsRows: [{ key, value: JSON.stringify(plan()) }, { key, value: JSON.stringify(plan()) }] },
    { settings: { [key]: JSON.stringify({ ...plan(), version: 99 }) } }
  ]) {
    const res = await Settings.restoreFromFile(file(tables)); assert.equal(res, undefined);
    assert.equal(requests.length, 0); assert.equal(messages.at(-1).tone, 'error');
  }
});
await test('cancelled confirmation makes no writes', async () => {
  confirmation = false; await Settings.restoreFromFile(file({ settings: { [key]: JSON.stringify(plan()) } }));
  assert.equal(requests.length, 0);
});
await test('partial table failure still restores settings and reports no rollback', async () => {
  failTable = 'tasks'; const raw = JSON.stringify(plan());
  const res = await Settings.restoreFromFile(file({ tasks: [{ id: 'task-1' }], settings: { [key]: raw } }));
  assert.equal(res.done, 1); assert.equal(res.failed, 1); assert.equal(database.get(key), raw);
  assert.ok(messages.at(-1).text.includes('Successful writes were not rolled back')); assert.equal(messages.at(-1).tone, 'warn');
});
await test('restore cannot overwrite a plan changed during confirmation', async () => {
  const raw = JSON.stringify(plan()); database.set(key, raw); App.settings[key] = raw;
  confirmHook = () => database.set(key, 'other-device');
  const res = await Settings.restoreFromFile(file({ settings: { [key]: raw + ' ' } }));
  assert.equal(res.failed, 1); assert.equal(database.get(key), 'other-device'); assert.equal(App.settings[key], raw);
  assert.ok(messages.at(-1).text.includes('changed on another device'));
});
await test('ordinary resets invoke weekly reset and return its count; everything only wipes', async () => {
  const original = WeeklyPlanner.resetProgress, calls = [];
  WeeklyPlanner.resetProgress = async (type, today) => { calls.push([type, today]); return 2; };
  try {
    for (const type of ['today', 'week', 'progress']) {
      const res = await API.reset(type); assert.equal(res.counts.weekly_sessions_reset, 2);
    }
    await API.reset('everything');
    assert.equal(calls.length, 3); assert.ok(calls.every(c => c[1] === date));
    assert.ok(requests.some(r => r.table === 'settings' && r.method === 'DELETE'));
  } finally { WeeklyPlanner.resetProgress = original; }
});
await test('weekly reset keeps plan and history; corrupt records fail visibly', async () => {
  const a = plan(); a.sessions[0].moves = [{ from: '2026-11-22', to: date, at: '2026-11-23T09:00:00' }];
  const raw = JSON.stringify(a); App.settings[key] = raw; database.set(key, raw);
  const res = await API.reset('today'); assert.equal(res.counts.weekly_sessions_reset, 1);
  const restored = JSON.parse(database.get(key)); assert.equal(restored.sessions[0].done_at, ''); assert.equal(restored.sessions[0].moves.length, 1);
  App.settings[key] = '{broken'; await assert.rejects(API.reset('progress'), /damaged/);
  assert.equal(App.settings[key], '{broken');
});
await test('calendar sessions are independent and modal titles are escaped', async () => {
  App.settings[key] = JSON.stringify(plan()); App.state.tasks = [{ id: 'task-1', title: 'Original', scheduled_date: date, status: 'pending' }];
  const items = Tasks.dayItems(date); assert.equal(items.tasks.length, 1); assert.equal(items.sessions.length, 1);
  let modal; context.openModal = options => { modal = options; return { close() {} }; };
  Tasks.showDayModal(date); assert.ok(modal.body.includes('Synthetic &lt;task&gt;')); assert.ok(modal.body.includes('#/routines'));
  assert.ok(!modal.body.includes('data-wp-action')); assert.equal(App.state.tasks[0].status, 'pending');
  const brief = Dashboard.morningBriefing(items.tasks, items.sessions, date);
  assert.ok(brief[0].text.includes('1 weekly session')); assert.ok(!brief.some(x => /routine|streak/i.test(x.text)));
});
await test('dashboard dispatches planner clicks before task actions', async () => {
  const original = WeeklyPlanner.handleClick; let calls = 0;
  WeeklyPlanner.handleClick = () => { calls++; return true; };
  try { Dashboard.onClick({ target: { closest() { throw new Error('Legacy handler ran'); } } }); assert.equal(calls, 1); }
  finally { WeeklyPlanner.handleClick = original; }
});
await test('legacy generation and write entry points are harmless; page delegates', async () => {
  App.state.routines = [{ id: 'r-1', title: 'Legacy', days: 'Every day' }];
  await Routines.ensureTodayTasks(); await Routines.setAuto('r-1', true); await Routines.dayDotClick(App.state.routines[0], date);
  await Routines.toggleEnabled(App.state.routines[0]); await Routines.remove(App.state.routines[0]); Routines.openForm();
  assert.equal(requests.length, 0); assert.equal(App.state.tasks.length, 0);
  const original = WeeklyPlanner.page; let container;
  WeeklyPlanner.page = value => { container = value; };
  try { const c = {}; Routines.page(c); assert.equal(container, c); } finally { WeeklyPlanner.page = original; }
});
// The shell declares its own App: use a separate context without any DOM boot.
await test('shell route, midnight refresh and legacy reminder no-op', async () => {
  const shell = vm.createContext({ console, window: {}, document: { addEventListener() {} }, Utils, CONFIG: {}, toast() {} });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/app.js'), 'utf8'), shell);
  const app = vm.runInContext('App', shell), pages = vm.runInContext('PAGES', shell);
  assert.equal(pages.routines.title, 'Weekly Planner');
  shell.WeeklyPlanner = { page: c => c }; assert.equal(pages.routines.render('container'), 'container');
  let count = 0; app.refreshCurrent = () => count++; app._lastDay = '2026-11-22'; app.current = 'today';
  app.checkDayRollover(); assert.equal(count, 1); app.checkDayRollover(); assert.equal(count, 1);
  app.current = 'routines'; app._lastDay = '2026-11-22'; app.checkDayRollover(); assert.equal(count, 2);
  app.current = 'tasks'; app._lastDay = '2026-11-22'; app.checkDayRollover(); assert.equal(count, 2);
  app.checkRoutineReminders();
});
await test('planner assets are versioned and cached with dependency ordering', async () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.ok(html.includes('css/weekly-planner.css?v=2.15.0')); assert.ok(html.includes('js/weekly-planner.js?v=2.15.0'));
  assert.ok(html.indexOf('js/weekly-planner.js') > html.indexOf('js/routines.js'));
  assert.ok(html.indexOf('js/weekly-planner.js') > html.indexOf('js/tasks.js'));
  assert.ok(html.indexOf('js/weekly-planner.js') < html.indexOf('js/app.js'));
  assert.ok(sw.includes("'js/weekly-planner.js'")); assert.ok(sw.includes("'css/weekly-planner.css'")); assert.ok(sw.includes('alubhaios-v2.15.0'));
});
console.log(`Weekly integration: ${pass} tests passed (synthetic fetches only).`);
