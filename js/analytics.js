/* ============================================================
   AluBhaiOS — Analytics engine + Chart.js helper
   Everything here is computed from the real records cached in
   App.state (tasks, focusSessions, habitLogs, habits, goals).
   Nothing is faked: when there is not enough data, insights say so.

   Productivity score (0-100), deliberately simple:
     tasks   40 pts  completed / planned today
     focus   30 pts  focus minutes vs Settings daily focus goal
     habits  20 pts  habits completed today / enabled habits
     distraction -10 max (60+ distraction minutes = full penalty)
   ============================================================ */
'use strict';

const Analytics = {

  focusGoalMinutes() {
    const v = Utils.num(App.settings.daily_focus_goal_minutes);
    return v > 0 ? v : Utils.num(CONFIG.DEFAULTS.daily_focus_goal_minutes) || 120;
  },

  isDistractionSession(s) {
    return Utils.isDistraction(s.category);
  },

  sessionDate(s) { return String(s.start_time || '').slice(0, 10); },
  taskCompletedDate(t) { return String(t.completed_at || '').slice(0, 10); },

  /** Stats for a single calendar date. */
  dayStat(date) {
    const enabledHabits = (App.state.habits || []).filter(h => h.enabled !== false);
    const habitIds = enabledHabits.map(h => h.id);
    const logs = (App.state.habitLogs || []).filter(l =>
      String(l.date).slice(0, 10) === date &&
      (l.completed === true || l.completed === 'TRUE' || String(l.completed).toLowerCase() === 'true'));
    // freeze check-ins keep streaks alive but don't count as real completions
    const realLogs = logs.filter(l => !/❄|freeze/i.test(String(l.note || '')));

    const tasksToday = (App.state.tasks || []).filter(t => t.scheduled_date === date);
    // "missed" = was scheduled on a PAST day and is still not done today
    const tasksMissed = tasksToday.filter(t => t.status !== 'completed' && date < Utils.today()).length;
    const doneToday = (App.state.tasks || []).filter(t => this.taskCompletedDate(t) === date);
    const completedOfPlanned = tasksToday.filter(t => t.status === 'completed').length;

    let focusMin = 0, distrMin = 0, actualMin = 0;
    (App.state.focusSessions || []).forEach(s => {
      if (this.sessionDate(s) !== date) return;
      const m = Utils.num(s.duration_minutes);
      if (this.isDistractionSession(s)) distrMin += m; else focusMin += m;
    });
    (App.state.tasks || []).forEach(t => {
      if (this.taskCompletedDate(t) === date) actualMin += Utils.num(t.actual_minutes);
    });
    const plannedMin = tasksToday.reduce((a, t) => a + Utils.num(t.estimated_minutes), 0);

    const habitDone = realLogs.filter(l => habitIds.indexOf(l.habit_id) !== -1).length;
    const habitTotal = enabledHabits.length;

    const score = this.scoreDay({
      planned: tasksToday.length,
      completed: completedOfPlanned,
      focusMinutes: focusMin,
      distractionMinutes: distrMin,
      habitDone: habitDone,
      habitTotal: habitTotal
    });

    const active = tasksToday.length > 0 || focusMin > 0 || distrMin > 0 || habitDone > 0;

    return {
      date: date,
      score: score,
      active: active,
      tasksPlanned: tasksToday.length,
      tasksCompleted: completedOfPlanned,
      tasksCompletedAt: doneToday.length,
      tasksRemaining: tasksToday.length - completedOfPlanned,
      tasksMissed: tasksMissed,
      focusMinutes: focusMin,
      distractionMinutes: distrMin,
      habitDone: habitDone,
      habitTotal: habitTotal,
      habitPct: habitTotal ? Utils.pct(habitDone, habitTotal) : 0,
      plannedMinutes: plannedMin,
      actualMinutes: actualMin
    };
  },

  /** 🔋 Energy-aware insights — correlates daily-review energy ratings
      (1–5) with weekdays and focus minutes. Needs ≥3 reviews to speak. */
  energyInsights() {
    const out = [];
    const reviews = (App.state.dailyReviews || []).filter(r => Utils.num(r.energy) > 0);
    if (reviews.length < 3) return out;

    // average energy per weekday (≥2 samples each)
    const byWd = {};
    reviews.forEach(r => {
      const wd = Utils.weekdayShort(String(r.date || '').slice(0, 10));
      if (!wd) return;
      (byWd[wd] = byWd[wd] || []).push(Utils.num(r.energy));
    });
    const avgs = Object.keys(byWd)
      .filter(w => byWd[w].length >= 2)
      .map(w => ({ wd: w, avg: byWd[w].reduce((a, b) => a + b, 0) / byWd[w].length, n: byWd[w].length }));
    if (avgs.length >= 2) {
      avgs.sort((a, b) => b.avg - a.avg);
      const top = avgs[0], low = avgs[avgs.length - 1];
      if (top.avg - low.avg >= 0.5) {
        out.push({ icon: 'battery-full', tone: 'info', text: `Your energy peaks on ${top.wd}s (avg ${top.avg.toFixed(1)}/5) and dips on ${low.wd}s — put your hardest work on ${top.wd}.` });
      }
    }

    // focus minutes on high-energy (≥4) vs low-energy (≤2) days
    const energyByDate = {};
    reviews.forEach(r => { energyByDate[String(r.date || '').slice(0, 10)] = Utils.num(r.energy); });
    const hi = [], lo = [];
    (App.state.focusSessions || []).forEach(s => {
      const d = String(s.start_time || '').slice(0, 10);
      const e = energyByDate[d];
      if (!e) return;
      if (e >= 4) hi.push(Utils.num(s.duration_minutes));
      else if (e <= 2) lo.push(Utils.num(s.duration_minutes));
    });
    const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0;
    if (hi.length >= 2 && lo.length >= 2) {
      const d = avg(hi) - avg(lo);
      if (d >= 10) out.push({ icon: 'bolt', tone: 'good', text: `On high-energy days you log ~${d} more focus minutes per session than low-energy days — protect your energy, protect your output.` });
    }
    return out;
  },

  /** 📝 distraction log — top trigger this week (needs ≥3 entries). */
  distractionLogInsight() {
    let arr = [];
    try { arr = JSON.parse(App.settings.distraction_log || '[]'); } catch (e) { return []; }
    const weekAgo = Utils.addDays(Utils.today(), -6);
    const week = arr.filter(e => String(e.ts || '').slice(0, 10) >= weekAgo);
    if (week.length < 3) return [];
    const counts = {};
    week.forEach(e => { counts[e.trigger] = (counts[e.trigger] || 0) + 1; });
    const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    return [{ icon: 'phone-flip', tone: 'warn', text: `Top distraction this week: ${top} (${counts[top]}×) — knowing the trigger is half the fix.` }];
  },

  /** Per-day stats for the last `days` days ending today. Oldest first. */
  dailyStats(days) {
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      out.push(this.dayStat(Utils.addDays(Utils.today(), -i)));
    }
    return out;
  },

  scoreDay(d) {
    const taskPts = d.planned > 0 ? (d.completed / d.planned) * 40 : (d.completed > 0 ? 40 : 0);
    const focusPts = Math.min(1, d.focusMinutes / this.focusGoalMinutes()) * 30;
    const habitPts = d.habitTotal > 0 ? (d.habitDone / d.habitTotal) * 20 : (d.habitDone > 0 ? 20 : 0);
    const penalty = Math.min(10, Math.round(d.distractionMinutes / 6));
    return Utils.clamp(Math.round(taskPts + focusPts + habitPts - penalty), 0, 100);
  },

  todayStats() {
    const s = this.dailyStats(1);
    return s[s.length - 1];
  },

  /** Monday-based weekly aggregates, last `weeks` weeks including the current one. */
  weeklyStats(weeks) {
    const daily = this.dailyStats(weeks * 7 + 7);
    const byWeek = {};
    daily.forEach(d => {
      const ws = Utils.startOfWeek(d.date);
      (byWeek[ws] = byWeek[ws] || []).push(d);
    });
    const keys = Object.keys(byWeek).sort().slice(-(weeks));
    return keys.map(ws => {
      const days = byWeek[ws];
      const activeDays = days.filter(d => d.active);
      const sum = k => days.reduce((a, d) => a + d[k], 0);
      const planned = sum('tasksPlanned'), completed = sum('tasksCompleted');
      return {
        weekStart: ws,
        weekEnd: Utils.addDays(ws, 6),
        score: activeDays.length ? Math.round(activeDays.reduce((a, d) => a + d.score, 0) / activeDays.length) : 0,
        activeDays: activeDays.length,
        tasksPlanned: planned,
        tasksCompleted: completed,
        focusMinutes: sum('focusMinutes'),
        distractionMinutes: sum('distractionMinutes'),
        habitPct: days.length ? Math.round(days.reduce((a, d) => a + d.habitPct, 0) / days.length) : 0
      };
    });
  },

  /** Category distribution of tracked (focus-session) time over the range. */
  categoryDistribution(days) {
    const from = Utils.addDays(Utils.today(), -(days - 1));
    const totals = {};
    (App.state.focusSessions || []).forEach(s => {
      if (this.sessionDate(s) < from) return;
      const cat = s.category || 'Other';
      totals[cat] = (totals[cat] || 0) + Utils.num(s.duration_minutes);
    });
    const total = Object.values(totals).reduce((a, b) => a + b, 0);
    return Object.keys(totals)
      .map(cat => ({ category: cat, minutes: totals[cat], pct: total ? Math.round(totals[cat] / total * 100) : 0 }))
      .sort((a, b) => b.minutes - a.minutes);
  },

  /** Category distribution EXCLUDING distraction categories — for the
      "productive time by category" charts (the distraction share already
      lives in the focus-vs-distraction chart). */
  productiveCategoryDistribution(days) {
    const from = Utils.addDays(Utils.today(), -(days - 1));
    const totals = {};
    (App.state.focusSessions || []).forEach(s => {
      if (this.sessionDate(s) < from) return;
      const cat = s.category || 'Other';
      if (Utils.isDistraction(cat)) return;
      totals[cat] = (totals[cat] || 0) + Utils.num(s.duration_minutes);
    });
    const total = Object.values(totals).reduce((a, b) => a + b, 0);
    return Object.keys(totals)
      .map(cat => ({ category: cat, minutes: totals[cat], pct: total ? Math.round(totals[cat] / total * 100) : 0 }))
      .sort((a, b) => b.minutes - a.minutes);
  },

  /** Best weekday for task completion (needs >=2 samples per weekday). */
  bestWeekday(days) {
    const daily = this.dailyStats(days);
    const buckets = {};
    daily.forEach(d => {
      const wd = Utils.weekdayShort(d.date);
      (buckets[wd] = buckets[wd] || []).push(d.tasksCompleted);
    });
    let best = null, overall = 0, overallN = 0;
    Object.keys(buckets).forEach(wd => {
      const arr = buckets[wd];
      overall += arr.reduce((a, b) => a + b, 0);
      overallN += arr.length;
    });
    if (!overallN) return null;
    overall = overall / overallN;
    Object.keys(buckets).forEach(wd => {
      const arr = buckets[wd];
      if (arr.length < 2) return;
      const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      if (avg > overall * 1.2 && avg > 0 && (!best || avg > best.avg)) {
        best = { weekday: wd, avg: avg };
      }
    });
    return best;
  },

  /** Planning accuracy over completed tasks that have both estimates and actuals. */
  planningAccuracy(days) {
    const from = Utils.addDays(Utils.today(), -(days - 1));
    let planned = 0, actual = 0, count = 0;
    (App.state.tasks || []).forEach(t => {
      if (t.status !== 'completed') return;
      if (this.taskCompletedDate(t) < from) return;
      const est = Utils.num(t.estimated_minutes), act = Utils.num(t.actual_minutes);
      if (est > 0 && act > 0) { planned += est; actual += act; count++; }
    });
    if (!count || !actual) return null;
    return {
      count: count,
      plannedMinutes: planned,
      actualMinutes: actual,
      accuracy: Math.round(Math.min(planned / actual, actual / planned) * 100),
      underestimatePct: actual > planned ? Math.round((actual - planned) / actual * 100) : 0,
      overestimatePct: planned > actual ? Math.round((planned - actual) / planned * 100) : 0
    };
  },

  /** Habit streak helpers — always recomputed from HabitLogs so edits never break history. */
  habitDates(habitId) {
    const set = new Set();
    (App.state.habitLogs || []).forEach(l => {
      if (l.habit_id === habitId &&
          (l.completed === true || String(l.completed).toLowerCase() === 'true' || l.completed === 1 || l.completed === '1')) {
        set.add(String(l.date).slice(0, 10));
      }
    });
    return set;
  },

  habitStreaks(habitId) {
    const set = this.habitDates(habitId);
    if (!set.size) return { current: 0, best: 0 };
    // current streak: counts back from today, with a one-day grace (yesterday)
    let cursor = Utils.today();
    if (!set.has(cursor)) cursor = Utils.addDays(cursor, -1);
    let current = 0;
    while (set.has(cursor)) { current++; cursor = Utils.addDays(cursor, -1); }
    // best streak: longest run of consecutive days
    const sorted = Array.from(set).sort();
    let best = 1, run = 1;
    for (let i = 1; i < sorted.length; i++) {
      run = Utils.addDays(sorted[i - 1], 1) === sorted[i] ? run + 1 : 1;
      if (run > best) best = run;
    }
    return { current: current, best: Math.max(best, current) };
  },

  habitPctDays(habitId, days) {
    const set = this.habitDates(habitId);
    let done = 0;
    for (let i = 0; i < days; i++) {
      if (set.has(Utils.addDays(Utils.today(), -i))) done++;
    }
    return Utils.pct(done, days);
  },

  /** Which part of the day gets the most focus? Computed from real sessions. */
  bestTime() {
    const buckets = [
      { key: 'Night', label: '12am–6am', from: 0, to: 5 },
      { key: 'Morning', label: '6am–12pm', from: 6, to: 11 },
      { key: 'Afternoon', label: '12pm–6pm', from: 12, to: 17 },
      { key: 'Evening', label: '6pm–12am', from: 18, to: 23 }
    ];
    const rows = buckets.map(b => ({ bucket: b.key, label: b.label, from: b.from, to: b.to, minutes: 0, sessions: 0, ratingSum: 0, rated: 0 }));
    (App.state.focusSessions || []).forEach(x => {
      const h = Number(String(x.start_time || '').slice(11, 13));
      if (isNaN(h)) return;
      const row = rows.find(r => h >= r.from && h <= r.to);
      if (!row) return;
      row.minutes += Utils.num(x.duration_minutes);
      row.sessions++;
      if (Utils.num(x.focus_rating)) { row.ratingSum += Utils.num(x.focus_rating); row.rated++; }
    });
    rows.forEach(r => { r.avgRating = r.rated ? Math.round(r.ratingSum / r.rated * 10) / 10 : 0; });
    const eligible = rows.filter(r => r.sessions >= 2);
    if (!eligible.length) return null;
    eligible.sort((a, b) => b.minutes - a.minutes);
    return { best: eligible[0], all: rows };
  },

  /** Human-readable insights generated from real comparisons. */
  insights() {
    const out = [];
    const thisWeek = this.weeklyStats(2);
    const cur = thisWeek[thisWeek.length - 1];
    const prev = thisWeek.length > 1 ? thisWeek[thisWeek.length - 2] : null;

    if (thisWeek.length === 0 || (!cur || (!cur.activeDays && !cur.tasksPlanned && !cur.focusMinutes)) ||
        (prev && !prev.activeDays && !prev.tasksPlanned && !prev.focusMinutes && !cur.activeDays)) {
      const anyData = (App.state.tasks || []).length || (App.state.focusSessions || []).length || (App.state.habitLogs || []).length;
      if (!anyData) return [{ icon: 'circle-info', tone: 'muted', text: 'Not enough data yet.' }];
    }

    if (prev && prev.activeDays > 0 && cur.activeDays > 0) {
      const prevFocus = prev.focusMinutes / prev.activeDays;
      const curFocus = cur.focusMinutes / cur.activeDays;
      if (prevFocus > 0) {
        const diff = Math.round((curFocus - prevFocus) / prevFocus * 100);
        if (Math.abs(diff) >= 8) {
          out.push({
            icon: diff > 0 ? 'arrow-trend-up' : 'arrow-trend-down',
            tone: diff > 0 ? 'good' : 'bad',
            text: `Your average focus time ${diff > 0 ? 'increased' : 'decreased'} by ${Math.abs(diff)}% compared with last week.`
          });
        }
      }
      const prevRate = prev.tasksPlanned ? prev.tasksCompleted / prev.tasksPlanned : null;
      const curRate = cur.tasksPlanned ? cur.tasksCompleted / cur.tasksPlanned : null;
      if (prevRate !== null && curRate !== null && prevRate > 0) {
        const diff = Math.round((curRate - prevRate) / prevRate * 100);
        if (Math.abs(diff) >= 8) {
          out.push({
            icon: diff > 0 ? 'arrow-trend-up' : 'arrow-trend-down',
            tone: diff > 0 ? 'good' : 'bad',
            text: `Task completion ${diff > 0 ? 'improved' : 'dropped'} ${Math.abs(diff)}% compared with last week.`
          });
        }
      }
    }

    const weekly = this.dailyStats(7).slice(0, 6); // yesterday and before (today is not "missed" yet)
    const missedWeek = weekly.reduce((a, d) => a + d.tasksMissed, 0);
    if (missedWeek >= 3) {
      out.push({ icon: 'bell', tone: 'bad', text: `You missed ${missedWeek} tasks in the last 6 days — reschedule them before they pile up.` });
    }

    const best = this.bestWeekday(28);
    if (best) {
      out.push({ icon: 'calendar-week', tone: 'info', text: `You tend to complete more tasks on ${best.weekday}days.` });
    }

    const bt = this.bestTime();
    if (bt) {
      out.push({ icon: 'clock', tone: 'info', text: `You focus best in the ${bt.best.bucket.toLowerCase()} (${bt.best.label}) — ${Utils.fmtMinutes(bt.best.minutes)} logged there.` });
    }

    const cats = this.categoryDistribution(7);
    const tracked = cats.reduce((a, c) => a + c.minutes, 0);
    if (tracked > 0) {
      cats.forEach(c => {
        if (c.pct >= 15) {
          out.push({
            icon: 'chart-pie',
            tone: Utils.isDistraction(c.category) ? 'warn' : 'info',
            text: `${c.category} accounted for ${c.pct}% of tracked time this week.`
          });
        }
      });
    }

    const plan = this.planningAccuracy(28);
    if (plan && plan.count >= 3) {
      if (plan.underestimatePct >= 10) {
        out.push({ icon: 'clock-rotate-left', tone: 'warn', text: `You usually underestimate tasks by approximately ${plan.underestimatePct}%.` });
      } else if (plan.overestimatePct >= 10) {
        out.push({ icon: 'clock-rotate-left', tone: 'info', text: `You usually overestimate tasks by approximately ${plan.overestimatePct}%.` });
      } else {
        out.push({ icon: 'circle-check', tone: 'good', text: `Your planning is accurate (about ${plan.accuracy}% this month).` });
      }
    }

    // 🔋 energy-aware insights (from daily review energy ratings)
    out.push(...this.energyInsights());

    // 📝 distraction log — top trigger this week (needs ≥3 entries)
    out.push(...this.distractionLogInsight());

    if (!out.length) out.push({ icon: 'circle-info', tone: 'muted', text: 'Not enough data yet — keep tracking for a few more days.' });
    return out.slice(0, 6);
  }
};

/* ============================================================
   Charts — thin Chart.js wrapper, theme-aware, auto-destroying.
   ============================================================ */

const Charts = {
  registry: {},

  cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  },

  theme() {
    return {
      text: this.cssVar('--chart-text') || '#9aa3b2',
      grid: this.cssVar('--chart-grid') || 'rgba(150,160,180,0.15)',
      primary: this.cssVar('--c-primary') || '#6366f1',
      good: '#10b981',
      bad: '#ef4444',
      warn: '#f59e0b'
    };
  },

  make(canvasId, config) {
    this.destroy(canvasId);
    const canvas = qs('#' + canvasId);
    if (!canvas || typeof Chart === 'undefined') return null;
    const t = this.theme();
    Chart.defaults.color = t.text;
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.borderColor = t.grid;
    config.options = config.options || {};
    config.options.maintainAspectRatio = false;
    config.options.responsive = true;
    this.registry[canvasId] = new Chart(canvas.getContext('2d'), config);
    return this.registry[canvasId];
  },

  destroy(canvasId) {
    if (this.registry[canvasId]) {
      this.registry[canvasId].destroy();
      delete this.registry[canvasId];
    }
  },

  destroyAll() {
    Object.keys(this.registry).forEach(id => this.destroy(id));
  },

  /** Renders an empty-state box instead of a blank chart when there is no data. */
  emptyBox(canvasId, message) {
    const canvas = qs('#' + canvasId);
    if (!canvas) return;
    const box = el(`<div class="chart-empty">${icon('chart-simple')}<span>${Utils.esc(message)}</span></div>`);
    canvas.parentElement.appendChild(box);
    canvas.remove();
  },

  lineOpts(extra) {
    return Object.assign({
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 10, maxRotation: 0 } },
        y: { beginAtZero: true, ticks: { precision: 0 } }
      }
    }, extra || {});
  }
};

/* ============================================================
   Analytics PAGE (range switcher + all graphs + insights)
   ============================================================ */

const AnalyticsPage = {
  range: 30,

  page(container) {
    const r = this.range;
    const daily = Analytics.dailyStats(r);
    const weeks = Analytics.weeklyStats(10);

    container.innerHTML = `
      <div class="page-head">
        <h2>Analytics</h2>
        <div class="range-switch">
          ${[7, 30, 90].map(n => `<button class="tab ${r === n ? 'active' : ''}" data-range="${n}">${n}D</button>`).join('')}
        </div>
      </div>

      <div class="card insight-list">
        <h3 class="card-title">${icon('lightbulb')} Smart insights</h3>
        <div class="insight-row wrap">
          ${Analytics.insights().map(i => `
            <div class="insight-card tone-${i.tone}">${icon(i.icon)}<span>${Utils.esc(i.text)}</span></div>`).join('')}
        </div>
      </div>

      <div class="card" id="an-xp-battle"></div>

      <div class="card chart-card year-card">
        <h3 class="card-title">${icon('calendar-days')} Productivity heatmap — last 12 months</h3>
        <div class="year-heatmap-wrap">
          <div class="year-months" id="year-months"></div>
          <div class="year-heatmap" id="year-heatmap"></div>
        </div>
        <div class="heatmap-legend muted small">
          <span>Lower</span>
          <span class="lg lg0"></span><span class="lg lg1"></span><span class="lg lg2"></span><span class="lg lg3"></span><span class="lg lg4"></span>
          <span>Higher</span>
          <span class="muted">· daily productivity score</span>
        </div>
      </div>

      <div class="analytics-grid">
        <div class="card chart-card">
          <h3 class="card-title">Daily productivity — last ${r} days</h3>
          <div class="chart-box"><canvas id="an-productivity"></canvas></div>
        </div>
        <div class="card chart-card">
          <h3 class="card-title">Focus time (minutes/day)</h3>
          <div class="chart-box"><canvas id="an-focus"></canvas></div>
        </div>
        <div class="card chart-card">
          <h3 class="card-title">Task completion</h3>
          <div class="chart-box"><canvas id="an-tasks"></canvas></div>
        </div>
        <div class="card chart-card">
          <h3 class="card-title">Habit consistency (%)</h3>
          <div class="chart-box"><canvas id="an-habits"></canvas></div>
        </div>
        <div class="card chart-card">
          <h3 class="card-title">Weekly productivity trend</h3>
          <div class="chart-box"><canvas id="an-weekly"></canvas></div>
        </div>
        <div class="card chart-card">
          <h3 class="card-title">XP growth — last 12 weeks</h3>
          <div class="chart-box"><canvas id="an-xp-growth"></canvas></div>
        </div>
        <div class="card chart-card">
          <h3 class="card-title">Productive time by category</h3>
          <div class="chart-box"><canvas id="an-categories"></canvas></div>
        </div>
        <div class="card chart-card">
          <h3 class="card-title">Planned vs actual time</h3>
          <div class="chart-box"><canvas id="an-planned-actual"></canvas></div>
        </div>
        <div class="card chart-card">
          <h3 class="card-title">Focus vs distraction</h3>
          <div class="chart-box"><canvas id="an-focus-distraction"></canvas></div>
        </div>
      </div>

      <div class="card chart-card" id="missed-chart"></div>

      <div class="card chart-card" id="best-time"></div>

      <div id="an-planning"></div>
    `;

    this.renderXpBattle(qs('#an-xp-battle', container));

    container.onclick = e => {
      const b = e.target.closest('[data-range]');
      if (b) { this.range = Number(b.dataset.range); return this.page(container); }
    };

    this.productivityChart('an-productivity', daily, r);
    this.focusChart('an-focus', daily);
    this.tasksChart('an-tasks', daily);
    this.habitsChart('an-habits', daily);
    this.weeklyChart('an-weekly', weeks);
    this.xpGrowthChart('an-xp-growth');
    Dashboard.categoryChart('an-categories', Analytics.productiveCategoryDistribution(r), r);
    this.plannedActualChart('an-planned-actual', daily);
    Dashboard.focusDistractionChart('an-focus-distraction', daily);
    this.planningCard();
    this.yearHeatmap();
    this.bestTimeCard();
    this.missedChart();
  },

  /** Completed vs missed tasks — stacked per day, last 14 days. */
  missedChart() {
    const wrap = qs('#missed-chart', App.container());
    if (!wrap) return;
    const daily = Analytics.dailyStats(14).slice(-14);
    const hasAny = daily.some(d => d.tasksCompletedAt > 0 || d.tasksMissed > 0);
    if (!hasAny) {
      wrap.appendChild(el(emptyState('calendar-xmark', 'Completed vs missed tasks',
        'Schedule tasks with a date — completed and missed days appear here.')));
      return;
    }
    wrap.innerHTML = `
      <h3 class="card-title">${icon('calendar-xmark')} Completed vs missed tasks — last 14 days</h3>
      <p class="muted small">Missed = was scheduled that day but is still pending today. Today's open tasks are not counted yet.</p>
      <div class="chart-box"><canvas id="missed-canvas"></canvas></div>`;
    Charts.make('missed-canvas', {
      type: 'bar',
      data: {
        labels: daily.map(d => d.date.slice(5)),
        datasets: [
          { label: 'Completed', data: daily.map(d => d.tasksCompletedAt), backgroundColor: '#10b981', borderRadius: 3, stack: 's' },
          { label: 'Missed', data: daily.map(d => d.tasksMissed), backgroundColor: '#ef4444', borderRadius: 3, stack: 's' }
        ]
      },
      options: Charts.lineOpts({ plugins: { legend: { display: true, position: 'bottom' } }, scales: { x: { stacked: true, grid: { display: false }, ticks: { maxTicksLimit: 10, maxRotation: 0 } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } })
    });
  },

  /** "Best time to study" card — focus minutes per part of the day. */
  bestTimeCard() {
    const wrap = qs('#best-time', App.container());
    if (!wrap) return;
    const bt = Analytics.bestTime();
    if (!bt) {
      wrap.appendChild(el(emptyState('clock', 'Best time to study',
        'Log a few focus sessions — your most productive time of day shows up here.')));
      return;
    }
    const max = Math.max.apply(null, bt.all.map(r => r.minutes).concat([1]));
    const ratingText = bt.best.avgRating ? ` · avg focus rating ${bt.best.avgRating}/5` : '';
    wrap.innerHTML = `
      <div class="card chart-card">
        <h3 class="card-title">${icon('clock')} Best time to study</h3>
        <p class="muted small">Your sharpest window: <b>${Utils.esc(bt.best.bucket)} (${Utils.esc(bt.best.label)})</b>${ratingText}</p>
        <div class="bt-rows">
          ${bt.all.map(r => `
            <div class="bt-row ${r.bucket === bt.best.bucket ? 'best' : ''}">
              <span class="bt-name">${Utils.esc(r.bucket)} <span class="muted small">(${Utils.esc(r.label)})</span></span>
              <div class="bt-bar"><div class="bt-fill" style="width:${Math.round(r.minutes / max * 100)}%"></div></div>
              <span class="bt-val">${Utils.fmtMinutes(r.minutes)} · ${r.sessions}×</span>
            </div>`).join('')}
        </div>
      </div>`;
  },

  /** GitHub-style 365-day heatmap of the daily productivity score. */
  yearHeatmap() {
    const daily = Analytics.dailyStats(365);
    const grid = qs('#year-heatmap');
    const months = qs('#year-months');
    if (!grid) return;
    if (!daily.some(d => d.active)) {
      grid.innerHTML = `<p class="muted small" style="grid-column:1/-1;padding:10px 0">No data yet — your year fills in as you track.</p>`;
      if (months) months.innerHTML = '';
      return;
    }
    const today = Utils.today();
    const start = daily[0].date;
    const lead = (Utils.parseDate(start).getDay() + 6) % 7; // Monday-based padding
    const byDate = {};
    daily.forEach(d => { byDate[d.date] = d; });
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const columns = Math.ceil((lead + daily.length) / 7);
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span class="yh-cell empty"></span>';
    daily.forEach(d => {
      const score = d.score;
      const bucket = !d.active ? 0 : score < 25 ? 1 : score < 50 ? 2 : score < 75 ? 3 : 4;
      cells += `<span class="yh-cell lg${bucket} ${d.date === today ? 'today' : ''}" title="${Utils.fmtDate(d.date)} — score ${score}${d.active ? '' : ' (no activity)'}"></span>`;
    });

    let labels = '';
    let prevMonth = '';
    for (let c = 0; c < columns; c++) {
      const idx = c * 7 - lead;
      const d = (idx >= 0 && idx < daily.length) ? daily[idx] : null;
      const m = d ? d.date.slice(5, 7) : '';
      labels += (d && m !== prevMonth) ? `<span class="yh-month">${names[Number(m) - 1]}</span>` : '<span class="yh-month"></span>';
      if (d) prevMonth = m;
    }
    grid.innerHTML = cells;
    if (months) months.innerHTML = labels;
  },

  productivityChart(canvasId, daily, r) {
    Dashboard.productivityChart(canvasId, daily);
  },

  focusChart(canvasId, daily) {
    if (!daily.some(d => d.focusMinutes > 0 || d.distractionMinutes > 0)) {
      return Charts.emptyBox(canvasId, 'No focus sessions yet — run the timer to populate this chart.');
    }
    Charts.make(canvasId, {
      type: 'bar',
      data: {
        labels: daily.map(d => d.date.slice(5)),
        datasets: [
          { label: 'Focus', data: daily.map(d => d.focusMinutes), backgroundColor: '#10b981', borderRadius: 4, stack: 's' },
          { label: 'Distraction', data: daily.map(d => d.distractionMinutes), backgroundColor: '#ef4444', borderRadius: 4, stack: 's' }
        ]
      },
      options: Charts.lineOpts({ plugins: { legend: { display: true, position: 'bottom' } } })
    });
  },

  tasksChart(canvasId, daily) {
    if (!daily.some(d => d.tasksPlanned > 0 || d.tasksCompletedAt > 0)) {
      return Charts.emptyBox(canvasId, 'No tasks scheduled yet — plan your first day.');
    }
    Charts.make(canvasId, {
      type: 'bar',
      data: {
        labels: daily.map(d => d.date.slice(5)),
        datasets: [
          { label: 'Planned', data: daily.map(d => d.tasksPlanned), backgroundColor: '#8a97a8', borderRadius: 3 },
          { label: 'Completed', data: daily.map(d => d.tasksCompletedAt), backgroundColor: '#10b981', borderRadius: 3 },
          { label: 'Incomplete', data: daily.map(d => Math.max(0, d.tasksPlanned - d.tasksCompleted)), backgroundColor: '#ef4444aa', borderRadius: 3 }
        ]
      },
      options: Charts.lineOpts({ plugins: { legend: { display: true, position: 'bottom' } }, scales: { x: { grid: { display: false }, stacked: true, ticks: { maxTicksLimit: 10, maxRotation: 0 } }, y: { beginAtZero: true, stacked: true, ticks: { precision: 0 } } } })
    });
  },

  habitsChart(canvasId, daily) {
    if (!daily.some(d => d.habitTotal > 0)) {
      return Charts.emptyBox(canvasId, 'No habits yet — create one to start tracking consistency.');
    }
    Charts.make(canvasId, {
      type: 'line',
      data: {
        labels: daily.map(d => d.date.slice(5)),
        datasets: [{ data: daily.map(d => d.habitPct), borderColor: '#8b5cf6', backgroundColor: '#8b5cf633', fill: true, tension: 0.35, pointRadius: 2, borderWidth: 2 }]
      },
      options: Charts.lineOpts({ scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 10, maxRotation: 0 } }, y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } } })
    });
  },

  weeklyChart(canvasId, weeks) {
    if (!weeks.some(w => w.activeDays > 0)) {
      return Charts.emptyBox(canvasId, 'Not enough data yet — weekly trends appear after a few days of tracking.');
    }
    Charts.make(canvasId, {
      type: 'line',
      data: {
        labels: weeks.map(w => w.weekStart.slice(5)),
        datasets: [{ label: 'Avg score', data: weeks.map(w => w.score), borderColor: Charts.theme().primary, backgroundColor: Charts.theme().primary + '33', fill: true, tension: 0.35, pointRadius: 3, borderWidth: 2 }]
      },
      options: Charts.lineOpts({ scales: { x: { grid: { display: false } }, y: { beginAtZero: true, max: 100 } } })
    });
  },

  plannedActualChart(canvasId, daily) {
    const last14 = daily.slice(-14);
    if (!last14.some(d => d.plannedMinutes > 0 || d.actualMinutes > 0)) {
      return Charts.emptyBox(canvasId, 'Add estimated minutes to tasks — planned vs actual appears as you complete them.');
    }
    Charts.make(canvasId, {
      type: 'bar',
      data: {
        labels: last14.map(d => d.date.slice(5)),
        datasets: [
          { label: 'Planned', data: last14.map(d => d.plannedMinutes), backgroundColor: '#8a97a8', borderRadius: 3 },
          { label: 'Actual', data: last14.map(d => d.actualMinutes), backgroundColor: '#f59e0b', borderRadius: 3 }
        ]
      },
      options: Charts.lineOpts({ plugins: { legend: { display: true, position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${Utils.fmtMinutes(ctx.raw)}` } } } })
    });
  },

  /** ⚔ Weekly XP battle — this week's earned XP vs last week's. */
  renderXpBattle(wrap) {
    if (!wrap) return;
    const today = Utils.today();
    const ws = Utils.startOfWeek(today);
    const we = Utils.addDays(ws, 6);
    const lws = Utils.addDays(ws, -7);
    const lwe = Utils.addDays(ws, -1);
    const thisXp = Gamify.xpBetween(ws, we);
    const lastXp = Gamify.xpBetween(lws, lwe);
    const max = Math.max(thisXp, lastXp, 1);
    const w1 = Math.round(thisXp / max * 100), w2 = Math.round(lastXp / max * 100);
    let verdict, cls;
    if (thisXp > lastXp) { const d = thisXp - lastXp; verdict = `💪 Stronger than last week by ${d} XP!`; cls = 'v-good'; }
    else if (thisXp < lastXp) { const d = lastXp - thisXp; verdict = `😈 Phonu gained ${d} XP on you — fight back!`; cls = 'v-bad'; }
    else { verdict = '⚖ Dead even with last week.'; cls = 'v-neutral'; }
    wrap.innerHTML = `
      <h3 class="card-title">${icon('bolt')} Weekly XP battle</h3>
      <div class="xp-battle">
        <div class="xp-row"><span class="xp-label">This week</span>
          <div class="xp-bar"><div class="xp-fill this" style="width:${w1}%"></div></div>
          <b>${thisXp}</b></div>
        <div class="xp-row"><span class="xp-label">Last week</span>
          <div class="xp-bar"><div class="xp-fill last" style="width:${w2}%"></div></div>
          <b>${lastXp}</b></div>
        <div class="arena-verdict ${cls}">${verdict}</div>
      </div>`;
  },

  /** 📈 cumulative XP curve — last 12 weeks. */
  xpGrowthChart(canvasId) {
    const series = Gamify.xpGrowthSeries(12);
    const has = series.some(s => s.xp > 0);
    if (!has) return Charts.emptyBox(canvasId, 'Earn XP to see your growth curve.');
    Charts.make(canvasId, {
      type: 'line',
      data: {
        labels: series.map(s => s.weekStart.slice(5)),
        datasets: [{
          label: 'Total XP',
          data: series.map(s => s.xp),
          borderColor: '#f5c518',
          backgroundColor: 'rgba(245, 197, 24, 0.12)',
          fill: true, tension: 0.3, pointRadius: 3, borderWidth: 2
        }]
      },
      options: Charts.lineOpts({
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.raw} XP total` } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
      })
    });
  },

  planningCard() {
    const wrap = qs('#an-planning', App.container());
    if (!wrap) return;
    const plan = Analytics.planningAccuracy(30);
    if (!plan) {
      wrap.innerHTML = '';
      wrap.appendChild(el(emptyState('scale-balanced', 'Planning accuracy',
        'Complete a few tasks that have estimated AND actual minutes to see how accurate your planning is.')));
      return;
    }
    wrap.innerHTML = `
      <div class="card planning-card">
        <h3 class="card-title">${icon('scale-balanced')} Planning accuracy — last 30 days</h3>
        <div class="summary-grid big">
          <div><b>${plan.accuracy}%</b><span>accuracy</span></div>
          <div><b>${Utils.fmtMinutes(plan.plannedMinutes)}</b><span>you planned</span></div>
          <div><b>${Utils.fmtMinutes(plan.actualMinutes)}</b><span>actual</span></div>
          <div><b>${plan.count}</b><span>tasks measured</span></div>
        </div>
        ${plan.underestimatePct >= 10
          ? `<p class="muted small">${icon('clock-rotate-left')} You usually underestimate tasks by approximately ${plan.underestimatePct}%.</p>`
          : plan.overestimatePct >= 10
            ? `<p class="muted small">${icon('clock-rotate-left')} You usually overestimate tasks by approximately ${plan.overestimatePct}%.</p>`
            : `<p class="muted small">${icon('circle-check')} Your estimates are on point.</p>`}
      </div>`;
  }
};
