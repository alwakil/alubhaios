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
    return {
      tasks: tasks * 10,
      habits: habits * 5,
      focus: Math.floor(focusMin / 3),
      dailyReviews: daily * 15,
      weeklyReviews: weekly * 25,
      ctf: ctf * 15,
      _counts: { tasks, habits, focusMin, daily, weekly, ctf }
    };
  },

  xp() {
    const b = this.xpBreakdown();
    return b.tasks + b.habits + b.focus + b.dailyReviews + b.weeklyReviews + b.ctf;
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
