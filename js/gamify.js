/* ============================================================
   PersonalOS — Gamification engine (XP, level, streak freezes)
   XP is always recomputed from the REAL records — nothing to fake:
     task completed          +10
     habit check-in          +5   (freeze logs don't count)
     focus / pomodoro time   +1 per 3 minutes
     daily review written    +15
     weekly review written   +25
   Level: level = 1 + floor(sqrt(xp / 100))
   Streak freezes: hold max 2; earn one per 7-day habit streak
   milestone (min 3 days between awards). Consumed explicitly to
   keep a streak alive (logged as a freeze check-in).
   Penalty (missed work cuts XP, capped, never below 0):
     task missed (past scheduled_date, still not done)   −5
     habit not checked on a past day                      −2
     salat not marked on a past day                       −2
   Only days AFTER the feature start (settings key "penalty_since")
   count, today never counts, max −15 per day.
   ============================================================ */
'use strict';

const Gamify = {

  xpBreakdown() {
    const s = App.state;
    const isRealHabit = l => !/❄|freeze/i.test(String(l.note || ''));
    const tasks = (s.tasks || []).filter(t => t.status === 'completed').length;
    const habits = (s.habitLogs || []).filter(l => (l.completed === true || String(l.completed).toLowerCase() === 'true') && isRealHabit(l)).length;
    const focusMin = (s.focusSessions || []).reduce((a, x) => a + Utils.num(x.duration_minutes), 0);
    const daily = (s.dailyReviews || []).length;
    const weekly = (s.weeklyReviews || []).length;
    const ctf = (s.challenges || []).filter(c => c.status === 'solved').length;
    let salahPrayers = 0, salahFullDays = 0;
    (s.salah || []).forEach(r => {
      let n = 0;
      ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].forEach(k => { if (r[k] === true || String(r[k]).toLowerCase() === 'true') n++; });
      salahPrayers += n;
      if (n === 5) salahFullDays++;
    });
    return {
      tasks: tasks * 10,
      habits: habits * 5,
      focus: Math.floor(focusMin / 3),
      dailyReviews: daily * 15,
      weeklyReviews: weekly * 25,
      ctf: ctf * 15,
      salah: salahPrayers * 2 + salahFullDays * 5,
      penalty: this.penalty().total,
      _counts: { tasks, habits, focusMin, daily, weekly, ctf }
    };
  },

  /* ---------------- missed-work penalty ---------------- */

  PENALTIES: { task: 5, habit: 2, salah: 2, perDayCap: 15 },

  /** First day the penalty system is active (set once, stored in Settings). */
  penaltySince() {
    let since = String(App.settings.penalty_since || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) {
      since = Utils.today(); // feature activation day — no retroactive cuts
      App.settings.penalty_since = since;
      API.saveSettings({ penalty_since: since }).catch(() => {});
    }
    return since;
  },

  /** Missed items per past day since activation. Detailed, so UI can show counts. */
  penalty() {
    const since = this.penaltySince();
    const today = Utils.today();
    const P = this.PENALTIES;
    const out = { task: 0, habit: 0, salah: 0, total: 0, days: 0 };

    // every distinct past date in the data (so empty stretches cost nothing)
    const dates = new Set();
    (App.state.habitLogs || []).forEach(l => { const d = String(l.date).slice(0, 10); if (d >= since && d < today) dates.add(d); });
    (App.state.salah || []).forEach(r => { const d = String(r.date).slice(0, 10); if (d >= since && d < today) dates.add(d); });
    (App.state.tasks || []).forEach(t => {
      if (t._archived) return;
      const d = String(t.scheduled_date || '').slice(0, 10);
      if (d && d >= since && d < today) dates.add(d);
    });

    const enabledHabits = (App.state.habits || []).filter(h => h.enabled !== false);

    dates.forEach(date => {
      let dayPenalty = 0;
      // missed tasks: scheduled that past day, still not completed
      const missedTasks = (App.state.tasks || []).filter(t =>
        !t._archived && t.status !== 'completed' && String(t.scheduled_date || '').slice(0, 10) === date).length;
      // missed habits: enabled habit with no real completed check-in that day
      const doneHabits = new Set((App.state.habitLogs || []).filter(l =>
        String(l.date).slice(0, 10) === date &&
        (l.completed === true || String(l.completed).toLowerCase() === 'true') &&
        !/❄|freeze/i.test(String(l.note || ''))).map(l => l.habit_id));
      const missedHabits = enabledHabits.filter(h => !doneHabits.has(h.id)).length;
      // missed salat: prayer not marked on that past day
      let missedSalah = 0;
      (App.state.salah || []).forEach(r => {
        if (String(r.date).slice(0, 10) !== date) return;
        ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].forEach(k => {
          if (!(r[k] === true || String(r[k]).toLowerCase() === 'true')) missedSalah++;
        });
      });

      dayPenalty = Math.min(P.perDayCap,
        missedTasks * P.task + missedHabits * P.habit + missedSalah * P.salah);
      out.days++;
      out.task += missedTasks;
      out.habit += missedHabits;
      out.salah += missedSalah;
      out.total += dayPenalty;
    });

    return out;
  },

  xp() {
    const b = this.xpBreakdown();
    return Math.max(0, b.tasks + b.habits + b.focus + b.dailyReviews + b.weeklyReviews + b.ctf + b.salah - b.penalty);
  },

  /** XP earned strictly between two dates (inclusive, YYYY-MM-DD) —
      same multipliers as xpBreakdown, but range-filtered for the
      weekly XP battle. */
  xpBetween(from, to) {
    const s = App.state;
    const inR = d => { const x = String(d || '').slice(0, 10); return x >= from && x <= to; };
    const isTrue = v => v === true || String(v).toLowerCase() === 'true';
    let xp = 0;
    (s.tasks || []).forEach(t => { if (t.status === 'completed' && inR(t.completed_at)) xp += 10; });
    (s.habitLogs || []).forEach(l => { if (isTrue(l.completed) && !/❄|freeze/i.test(String(l.note || '')) && inR(l.date)) xp += 5; });
    (s.focusSessions || []).forEach(x => { if (inR(x.start_time)) xp += Math.floor(Utils.num(x.duration_minutes) / 3); });
    (s.dailyReviews || []).forEach(r => { if (inR(r.date)) xp += 15; });
    (s.weeklyReviews || []).forEach(r => { if (inR(r.week_start)) xp += 25; });
    (s.challenges || []).forEach(c => { if (c.status === 'solved' && inR(c.solved_date)) xp += 15; });
    (s.salah || []).forEach(r => {
      if (!inR(r.date)) return;
      let n = 0;
      ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].forEach(k => { if (isTrue(r[k])) n++; });
      xp += n * 2 + (n === 5 ? 5 : 0);
    });
    return xp;
  },

  level(xp) {
    const L = Math.floor(Math.sqrt((xp || 0) / 100)) + 1;
    const base = (L - 1) * (L - 1) * 100;
    const need = (2 * L - 1) * 100;
    return { level: L, into: (xp || 0) - base, need: need, pct: Utils.pct((xp || 0) - base, need) };
  },

  heldFreezes() { return Utils.clamp(Utils.num(App.settings.streak_freezes), 0, 2); },

  /** Called after a habit check-in — may award a freeze for a 7-day milestone. */
  async checkFreezeAward() {
    const held = this.heldFreezes();
    if (held >= 2) return false;
    const last = String(App.settings.last_freeze_award || '');
    if (last && Utils.addDays(last, 3) > Utils.today()) return false; // 3-day cooldown
    const milestone = (App.state.habits || []).some(h => {
      if (h.enabled === false) return false;
      const st = Analytics.habitStreaks(h.id).current;
      return st > 0 && st % 7 === 0;
    });
    if (!milestone) return false;
    try {
      await API.saveSettings({
        streak_freezes: String(held + 1),
        last_freeze_award: Utils.today()
      });
      App.settings.streak_freezes = String(held + 1);
      App.settings.last_freeze_award = Utils.today();
      toast('❄️ Streak freeze earned! (hold: ' + (held + 1) + '/2)', 'success');
      return true;
    } catch (e) { App.handleError(e); return false; }
  },

  /** Spend one freeze on a habit: logs today as a freeze check-in (streak survives). */
  async useFreeze(habitId) {
    const held = this.heldFreezes();
    if (held <= 0) { toast('No freezes left — earn one with a 7-day streak.', 'warn'); return false; }
    try {
      await API.setHabitLog(habitId, Utils.today(), true, '❄️ freeze');
      const res = await API.saveSettings({ streak_freezes: String(held - 1) });
      App.settings.streak_freezes = String(held - 1);
      if (res && res.settings) Object.assign(App.settings, res.settings);
      toast('❄️ Freeze used — streak saved!', 'success');
      return true;
    } catch (e) { App.handleError(e); return false; }
  }
};
