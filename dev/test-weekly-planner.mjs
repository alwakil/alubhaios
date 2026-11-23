/* Synthetic fixtures only — never connects to the personal database. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ console, Set, Map, Date, JSON, crypto, setTimeout, clearTimeout });
ctx.window = { crypto };
ctx.document = { addEventListener() {} };
ctx.localStorage = { getItem() { return null; }, setItem() {} };
for (const file of ['js/utils.js', 'js/weekly-planner.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx);
const planner = vm.runInContext('WeeklyPlanner', ctx), utils = vm.runInContext('Utils', ctx);
let today = '2026-11-20', time = '09:00:00', failures = false, releaseWrite;
utils.today = () => today;
utils.nowISO = () => today + 'T' + time;
const remote = {};
ctx.App = { state: { tasks: [], routines: [] }, settings: {}, online: true, refreshCurrent() {}, handleError(e) { throw e; } };
ctx.API = { async savePlannerRecord(key, expected, raw) {
  if (failures) throw new Error('Synthetic save failure');
  if (releaseWrite) await releaseWrite;
  if (remote[key] !== expected) throw new Error('Weekly plan changed on another device. Sync and try again.');
  remote[key] = raw; ctx.App.settings[key] = raw;
} };
ctx.Tasks = { openForm() {} };
const task = { id: 'htb', title: 'HTB Lab', category: 'Learning', status: 'pending', scheduled_date: '', goal_id: 'goal' };
const ctf = { id: 'ctf', title: 'CTF', category: 'Learning', status: 'pending', scheduled_date: '' };
ctx.App.state.tasks = [task, ctf];
const checks = [];
async function test(name, fn) {
  try { await fn(); checks.push({ name, pass: true }); console.log('PASS ' + name); }
  catch (e) { checks.push({ name, pass: false }); console.error('FAIL ' + name + '\n' + e.stack); }
}
const rejects = async (fn, pattern) => assert.rejects(fn, pattern);
const keys = { htb: planner.key('2026-11-20', 'htb'), ctf: planner.key('2026-11-20', 'ctf') };
let htbId;

await test('Friday is the planner boundary, Monday utils unchanged', () => {
  assert.equal(planner.weekStart('2026-11-20'), '2026-11-20');
  assert.equal(planner.weekStart('2026-11-26'), '2026-11-20');
  assert.equal(planner.weekStart('2026-11-27'), '2026-11-27');
  assert.equal(utils.startOfWeek('2026-11-20'), '2026-11-16');
});
await test('Month/year/leap boundaries use local date arithmetic', () => {
  assert.equal(planner.weekStart('2027-01-01'), '2027-01-01');
  assert.equal(planner.weekStart('2026-01-01'), '2025-12-26');
  assert.equal(planner.weekStart('2028-02-29'), '2028-02-25');
  assert.equal(planner.validDate('2026-02-29'), false);
  assert.equal(planner.validDate('2026-13-01'), false);
  assert.throws(() => planner.weekStart('invalid'), /valid date/);
});
await test('HTB Sat+Sun creates two sessions, not two Tasks', async () => {
  const before = JSON.stringify(ctx.App.state.tasks);
  await planner.add('htb', '2026-11-20', ['2026-11-21', '2026-11-22']);
  const a = planner.read(keys.htb);
  assert.equal(a.sessions.length, 2); assert.equal(a.effective_from, today);
  assert.equal(a.title, 'HTB Lab'); assert.equal(a.sessions[0].date, '2026-11-21');
  assert.equal(JSON.stringify(ctx.App.state.tasks), before);
  htbId = a.sessions[0].id;
});
await test('CTF Monday only, unselected days never missed', async () => {
  await planner.add('ctf', '2026-11-20', ['2026-11-23']);
  assert.equal(planner.sessionsOn('2026-11-23').length, 1);
  assert.equal(planner.sessionsOn('2026-11-24').length, 0);
  assert.equal(planner.summary(planner.assignments()).total, 3);
  assert.equal(planner.summary(planner.assignments()).missed, 0);
});
await test('Duplicate task/day blocked', async () => {
  const before = ctx.App.settings[keys.htb];
  await rejects(() => planner.add('htb', '2026-11-20', ['2026-11-21']), /already planned/);
  assert.equal(ctx.App.settings[keys.htb], before);
  await rejects(() => planner.add('htb', '2026-11-20', ['2026-11-24', '2026-11-24']), /available day/);
});
await test('Invalid weekday week and dates rejected', async () => {
  await rejects(() => planner.add('htb', '2026-11-23', ['2026-11-23']), /Friday/);
  await rejects(() => planner.add('htb', '2026-11-20', []), /available day/);
  await rejects(() => planner.add('htb', '2026-11-20', ['2026-11-27']), /available day/);
});
await test('Future sessions cannot be checked early', async () => {
  await rejects(() => planner.toggle(keys.htb, htbId), /today or past/);
  assert.equal(planner.read(keys.htb).sessions[0].done_at, '');
});
await test('Saturday Done independent from Sunday and original Task', async () => {
  today = '2026-11-21'; await planner.toggle(keys.htb, htbId);
  const a = planner.read(keys.htb);
  assert.equal(planner.status(a.sessions[0]), 'done');
  assert.equal(planner.status(a.sessions[1]), 'upcoming');
  assert.equal(task.status, 'pending'); assert.equal(task.scheduled_date, '');
  assert.equal(planner.summary([a]).done, 1);
});
await test('Undo removes session Done only', async () => {
  await planner.toggle(keys.htb, htbId);
  assert.equal(planner.status(planner.read(keys.htb).sessions[0]), 'pending');
  assert.equal(task.status, 'pending');
  await planner.toggle(keys.htb, htbId);
});
await test('Pending before midnight, Missed after midnight, no backfill', () => {
  today = '2026-11-22';
  assert.equal(planner.summary(planner.assignments()).pending, 1);
  today = '2026-11-23';
  const counts = planner.summary(planner.assignments());
  assert.equal(counts.done, 1); assert.equal(counts.missed, 1); assert.equal(counts.pending, 1);
  assert.equal(planner.read(keys.htb).sessions.length, 2);
});
await test('Midweek add cannot select elapsed days', async () => {
  await rejects(() => planner.add('ctf', '2026-11-20', ['2026-11-21']), /available day/);
  await planner.add('ctf', '2026-11-20', ['2026-11-25']);
  assert.equal(planner.read(keys.ctf).sessions.length, 2);
});
await test('Late Done is labelled and counted; Undo becomes Missed', async () => {
  const sunday = planner.read(keys.htb).sessions[1].id;
  await planner.toggle(keys.htb, sunday);
  assert.equal(planner.status(planner.read(keys.htb).sessions[1]), 'late');
  assert.equal(planner.summary([planner.read(keys.htb)]).done, 2);
  await planner.toggle(keys.htb, sunday);
  assert.equal(planner.status(planner.read(keys.htb).sessions[1]), 'missed');
});
await test('Missed session moves to Tue, old date retained in history', async () => {
  const sunday = planner.read(keys.htb).sessions[1].id;
  await planner.move(keys.htb, sunday, '2026-11-24');
  const s = planner.read(keys.htb).sessions[1];
  assert.equal(s.date, '2026-11-24'); assert.equal(s.moves[0].from, '2026-11-22');
  assert.equal(s.moves[0].to, '2026-11-24'); assert.equal(planner.status(s), 'upcoming');
  assert.equal(planner.summary([planner.read(keys.htb)]).missed, 0);
});
await test('Move to past, another week, duplicate or completed blocked', async () => {
  const sunday = planner.read(keys.htb).sessions[1].id;
  await rejects(() => planner.move(keys.htb, sunday, '2026-11-22'), /unfinished/);
  await rejects(() => planner.move(keys.htb, sunday, '2026-11-27'), /unfinished/);
  await rejects(() => planner.move(keys.htb, htbId, '2026-11-25'), /unfinished/);
  await planner.add('htb', '2026-11-20', ['2026-11-25']);
  await rejects(() => planner.move(keys.htb, sunday, '2026-11-25'), /already has/);
});
await test('Explicit removal keeps audit and excludes denominator', async () => {
  const session = planner.read(keys.htb).sessions[2];
  await planner.cancel(keys.htb, session.id);
  assert.equal(planner.summary([planner.read(keys.htb)]).total, 2);
  assert.equal(planner.summary([planner.read(keys.htb)]).cancelled, 1);
  assert.equal(planner.sessionsOn('2026-11-25').filter(e => e.assignment.task_id === 'htb').length, 0);
  await rejects(() => planner.toggle(keys.htb, session.id), /checked/);
  await rejects(() => planner.cancel(keys.htb, htbId), /unfinished/);
});
await test('Removed date may be re-planned without deleting audit', async () => {
  await planner.add('htb', '2026-11-20', ['2026-11-25']);
  assert.equal(planner.read(keys.htb).sessions.length, 4);
  assert.equal(planner.sessionsOn('2026-11-25').filter(e => e.assignment.task_id === 'htb').length, 1);
});
await test('Missing task, complete task and archive never erase session history', async () => {
  const before = ctx.App.settings[keys.htb];
  task.status = 'completed';
  assert.match(planner.taskNote(planner.read(keys.htb)), /completed/);
  await rejects(() => planner.add('htb', '2026-11-20', ['2026-11-26']), /active/);
  task.status = 'pending'; task._archived = true;
  assert.match(planner.taskNote(planner.read(keys.htb)), /archived/);
  await rejects(() => planner.add('htb', '2026-11-20', ['2026-11-26']), /active/);
  ctx.App.state.tasks = [ctf];
  assert.match(planner.taskNote(planner.read(keys.htb)), /deleted/);
  assert.equal(ctx.App.settings[keys.htb], before);
  delete task._archived; ctx.App.state.tasks = [task, ctf];
});
await test('Task rename displayed without rewriting historical title', () => {
  task.title = 'HTB New';
  assert.equal(planner.read(keys.htb).title, 'HTB Lab');
  assert.match(planner.taskNote(planner.read(keys.htb)), /HTB New/);
  task.title = 'HTB Lab';
});
await test('Next week is explicit and no automatic carryover', async () => {
  await planner.add('ctf', '2026-11-27', ['2026-11-28']);
  today = '2026-11-27';
  assert.equal(planner.week(), '2026-11-27');
  assert.equal(planner.assignments().length, 1);
  assert.equal(planner.assignments('2026-11-20').length, 2);
  assert.equal(planner.assignments().some(a => a.task_id === 'htb'), false);
  assert.equal(planner.summary(planner.assignments('2026-11-20')).missed, 4);
});
await test('Synthetic reload restores settings/history', () => {
  ctx.App.settings = JSON.parse(JSON.stringify(remote));
  assert.equal(planner.assignments('2026-11-20').length, 2);
  assert.equal(planner.read(keys.htb).sessions[1].moves.length, 1);
  assert.equal(planner.read(keys.htb).sessions[0].done_at, '2026-11-21T09:00:00');
});
await test('Failed save leaves saved and local settings unchanged', async () => {
  const key = planner.key('2026-11-27', 'ctf'), before = ctx.App.settings[key];
  failures = true;
  await rejects(() => planner.add('ctf', '2026-11-27', ['2026-11-29']), /Synthetic/);
  assert.equal(ctx.App.settings[key], before); assert.equal(remote[key], before);
  failures = false; assert.equal(planner.busy.size, 0);
});
await test('Offline edits rejected without corrupting plans', async () => {
  ctx.App.online = false;
  await rejects(() => planner.add('ctf', '2026-11-27', ['2026-11-29']), /Connect and sync/);
  ctx.App.online = true;
});
await test('Stale local modal baseline rejected', async () => {
  const key = planner.key('2026-11-27', 'ctf'), stale = ctx.App.settings[key];
  await planner.add('ctf', '2026-11-27', ['2026-11-29']);
  await rejects(() => planner.add('ctf', '2026-11-27', ['2026-11-30'], stale), /changed/);
});
await test('Remote conflict never overwrites another device', async () => {
  const key = planner.key('2026-11-27', 'ctf'), before = ctx.App.settings[key];
  remote[key] = 'another device';
  await rejects(() => planner.add('ctf', '2026-11-27', ['2026-11-30']), /another device/);
  assert.equal(ctx.App.settings[key], before); assert.equal(remote[key], 'another device');
  remote[key] = before;
});
await test('Concurrent same-assignment writes rejected', async () => {
  releaseWrite = new Promise(resolve => { ctx.finishWrite = resolve; });
  const first = planner.add('ctf', '2026-11-27', ['2026-11-30']);
  await rejects(() => planner.add('ctf', '2026-11-27', ['2026-12-01']), /already saving/);
  ctx.finishWrite(); await first; releaseWrite = null;
  assert.equal(planner.busy.size, 0);
});
await test('Corrupt settings protected, unrelated good plans readable', async () => {
  const key = planner.key('2026-11-27', 'htb');
  ctx.App.settings[key] = '{broken';
  assert.equal(planner.records().invalid.length, 1);
  await rejects(() => planner.add('htb', '2026-11-27', ['2026-11-27']), /JSON|property/i);
  assert.equal(ctx.App.settings[key], '{broken');
  await rejects(() => planner.resetProgress('progress'), /damaged/);
  delete ctx.App.settings[key];
});
await test('Unsupported schema and damaged session date refused', () => {
  const a = planner.read(keys.htb), raw = ctx.App.settings[keys.htb];
  a.version = 2; assert.throws(() => planner.decode(keys.htb, JSON.stringify(a)), /Unsupported/);
  const b = JSON.parse(raw); b.sessions[0].date = '2026-11-19';
  assert.throws(() => planner.decode(keys.htb, JSON.stringify(b)), /damaged/);
  const c = JSON.parse(raw); c.sessions[0].done_at = '2026-11-21T99:00:00';
  assert.throws(() => planner.decode(keys.htb, JSON.stringify(c)), /damaged/);
});
await test('Today reset resets only checks from today, plans remain', async () => {
  const key = planner.key('2026-11-27', 'ctf');
  await planner.add('htb', '2026-11-27', ['2026-11-27']);
  const hkey = planner.key('2026-11-27', 'htb');
  await planner.toggle(hkey, planner.read(hkey).sessions[0].id);
  assert.equal(await planner.resetProgress('today'), 1);
  assert.equal(planner.read(hkey).sessions[0].done_at, '');
  assert.equal(planner.read(keys.htb).sessions[0].done_at, '2026-11-21T09:00:00');
  assert.equal(planner.read(key).sessions.length, 3);
});
await test('Week reset uses existing trailing-seven-day scope', async () => {
  assert.equal(await planner.resetProgress('week'), 1);
  assert.equal(planner.read(keys.htb).sessions[0].done_at, '');
  assert.equal(planner.read(keys.htb).sessions[1].moves.length, 1);
  assert.equal(planner.summary([planner.read(keys.htb)]).cancelled, 1);
});
await test('All progress reset preserves assignments, selections and moves', async () => {
  const key = planner.key('2026-11-27', 'htb');
  await planner.toggle(key, planner.read(key).sessions[0].id);
  const count = planner.records().plans.length;
  assert.equal(await planner.resetProgress('progress'), 1);
  assert.equal(planner.records().plans.length, count);
  assert.equal(planner.read(keys.htb).sessions[1].moves.length, 1);
});
await test('Rendered HTML escapes titles and references, shows seven days', () => {
  const a = { key: keys.htb, ...planner.read(keys.htb), title: '<img src=x onerror=alert(1)>' };
  const html = planner.assignmentHtml(a);
  assert.ok(!html.includes('<img src=x')); assert.ok(html.includes('&lt;img'));
  assert.equal((html.match(/class="wp-day /g) || []).length, 7);
  assert.ok(html.includes('Change history')); assert.ok(html.includes('sessions done'));
});
await test('Legacy routine rendering read-only', () => {
  ctx.App.state.routines = [{ id: 'legacy', title: 'Daily study', days: 'Every day' }];
  const html = planner.legacyHtml();
  assert.match(html, /read-only/); assert.ok(!html.includes('data-routine-action'));
});

const failed = checks.filter(c => !c.pass);
console.log(`\nWEEKLY PLANNER: ${checks.length - failed.length}/${checks.length} scenarios passed`);
process.exitCode = failed.length ? 1 : 0;
