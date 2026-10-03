/* ============================================================
   PersonalOS — Dashboard + Today page
   ============================================================ */
'use strict';

const Dashboard = {

  /* ---------------- Dashboard ---------------- */
  render(container) {
    const t = Analytics.todayStats();
    const name = App.settings.user_name || '';
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const streaks = (App.state.habits || []).filter(h => h.enabled !== false)
      .map(h => Analytics.habitStreaks(h.id).current);
    const bestStreak = streaks.length ? Math.max.apply(null, streaks) : 0;
    const activeGoals = (App.state.goals || []).filter(g => g.status === 'active').length;
    const insights = Analytics.insights().slice(0, 3);

    container.innerHTML = `
      <div class="dash-greeting">
        <h2>${greet}${name ? ', ' + Utils.esc(name) : ''} ${'👋'}</h2>
        <p class="muted">${Utils.fmtDay(Utils.today())} — here is your day at a glance.</p>
      </div>

      <div class="dash-grid">
        <div class="card score-card">
          <div class="score-ring-wrap">
            <canvas id="score-ring" width="170" height="170"></canvas>
            <div class="score-center">
              <div class="score-num">${t.score}</div>
              <div class="score-denom">/ 100</div>
            </div>
          </div>
          <h3 class="card-title">Productivity Score</h3>
          <div class="score-breakdown">
            <div><span class="sb-label">Tasks</span><span class="sb-val">${Math.round(t.tasksPlanned > 0 || t.tasksCompletedAt > 0 ? (t.tasksPlanned > 0 ? t.tasksCompleted / t.tasksPlanned : 1) * 40 : 0)}/40</span></div>
            <div><span class="sb-label">Focus</span><span class="sb-val">${Math.round(Math.min(1, t.focusMinutes / Analytics.focusGoalMinutes()) * 30)}/30</span></div>
            <div><span class="sb-label">Habits</span><span class="sb-val">${Math.round(t.habitTotal ? t.habitDone / t.habitTotal * 20 : 0)}/20</span></div>
            <div><span class="sb-label">Distraction</span><span class="sb-val">-${Math.min(10, Math.round(t.distractionMinutes / 6))}</span></div>
          </div>
          ${(() => {
            const lv = Gamify.level(Gamify.xp());
            const p = Gamify.penalty();
            const pen = p.total ? `<div class="penalty-mini">−${p.total} XP missed-work penalty <a href="#/badges">details</a></div>` : '';
            return pen + `<a class="level-mini" href="#/badges" title="Open Badges">
              <span class="level-badge">Lv ${lv.level}</span>
              <div class="level-mini-bar"><div class="progress-fill" style="width:${lv.pct}%"></div></div>
              <span class="muted small">${lv.into}/${lv.need} XP</span>
            </a>`;
          })()}
        </div>

        <div class="stat-grid">
          <div class="card stat-tile">${icon('list-check')}<div><b>${t.tasksCompletedAt}</b><span>tasks completed</span></div></div>
          <div class="card stat-tile">${icon('hourglass-half')}<div><b>${t.tasksRemaining}</b><span>tasks remaining</span></div></div>
          <div class="card stat-tile">${icon('stopwatch')}<div><b>${Utils.fmtMinutes(t.focusMinutes)}</b><span>focus time</span></div></div>
          <div class="card stat-tile">${icon('phone-flip')}<div><b>${Utils.fmtMinutes(t.distractionMinutes)}</b><span>distraction time</span></div></div>
          <div class="card stat-tile">${icon('fire')}<div><b>${t.habitDone}/${t.habitTotal}</b><span>habits today</span></div></div>
          <div class="card stat-tile">${icon('bolt')}<div><b>${bestStreak}d</b><span>current streak</span></div></div>
          <div class="card stat-tile">${icon('bullseye')}<div><b>${activeGoals}</b><span>active goals</span></div></div>
          <div class="card stat-tile">${icon('gauge-high')}<div><b>${t.habitPct}%</b><span>habit completion</span></div></div>
        </div>
      </div>

      <div class="section-head">
        <h3>Smart insights</h3>
        <a class="link" href="#/analytics">All analytics ${icon('arrow-right', 'fa-xs')}</a>
      </div>
      <div class="insight-row">
        ${insights.map(i => `
          <div class="card insight-card tone-${i.tone}">
            ${icon(i.icon)}<span>${Utils.esc(i.text)}</span>
          </div>`).join('')}
      </div>

      <div class="chart-row">
        <div class="card chart-card">
          <h3 class="card-title">Productivity — last 7 days</h3>
          <div class="chart-box"><canvas id="dash-productivity"></canvas></div>
        </div>
        <div class="card chart-card">
          <h3 class="card-title">Time by category — 7 days</h3>
          <div class="chart-box"><canvas id="dash-categories"></canvas></div>
        </div>
        <div class="card chart-card">
          <h3 class="card-title">Focus vs distraction — 7 days</h3>
          <div class="chart-box"><canvas id="dash-focus-distraction"></canvas></div>
        </div>
      </div>

      <div class="section-head">
        <h3>Today's top priorities</h3>
        <a class="link" href="#/today">Open today ${icon('arrow-right', 'fa-xs')}</a>
      </div>
      <div class="card" id="dash-priorities"></div>

      <div class="quick-actions">
        <button class="btn btn-primary" data-qa="task">${icon('plus')} New task</button>
        <button class="btn" data-qa="focus">${icon('play')} Start focus</button>
        <a class="btn btn-ghost" href="#/reviews">${icon('pen-to-square')} Daily review</a>
      </div>
    `;
    container.onclick = e => this.onClick(e);

    // top priorities (highest priority tasks scheduled today or overdue)
    const prRank = { high: 0, medium: 1, low: 2 };
    const top = (App.state.tasks || [])
      .filter(x => x.status !== 'completed' && x.scheduled_date && x.scheduled_date <= Utils.today())
      .sort((a, b) => (prRank[a.priority] - prRank[b.priority]) || a.scheduled_date.localeCompare(b.scheduled_date))
      .slice(0, 3);
    qs('#dash-priorities', container).innerHTML = top.length
      ? `<ol class="priority-list">${top.map(x => `
          <li>
            <span class="pl-title">${Utils.esc(x.title)}</span>
            ${chip(x.priority, Utils.priorityColor(x.priority))}
            ${x.scheduled_date < Utils.today() ? chip('overdue', '#ef4444') : ''}
            <span class="muted pl-date">${Utils.fmtDate(x.scheduled_date)}</span>
          </li>`).join('')}</ol>`
      : emptyState('mug-hot', 'Nothing planned yet', 'Add a task for today to build your morning plan.',
          `<button class="btn btn-primary" data-qa="task">${icon('plus')} Create task</button>`);

    // score ring
    const track = Charts.cssVar('--chart-grid') || 'rgba(150,160,180,.2)';
    Charts.make('score-ring', {
      type: 'doughnut',
      data: { datasets: [{ data: [t.score, 100 - t.score], backgroundColor: [Charts.theme().primary, track], borderWidth: 0, borderRadius: 20 }] },
      options: { cutout: '76%', plugins: { legend: { display: false }, tooltip: { enabled: false } }, events: [] }
    });

    const daily = Analytics.dailyStats(7);
    this.productivityChart('dash-productivity', daily);
    this.categoryChart('dash-categories', Analytics.categoryDistribution(7), 7);
    this.focusDistractionChart('dash-focus-distraction', daily);
  },

  productivityChart(canvasId, daily) {
    const hasData = daily.some(d => d.active);
    if (!hasData) { Charts.emptyBox(canvasId, 'No productivity data yet — complete tasks, habits or focus sessions.'); return; }
    Charts.make(canvasId, {
      type: 'line',
      data: {
        labels: daily.map(d => d.date.slice(5)),
        datasets: [{
          data: daily.map(d => d.score),
          borderColor: Charts.theme().primary,
          backgroundColor: Charts.theme().primary + '33',
          fill: true, tension: 0.35, pointRadius: 3, borderWidth: 2
        }]
      },
      options: Charts.lineOpts({ scales: { x: { grid: { display: false } }, y: { beginAtZero: true, max: 100 } } })
    });
  },

  categoryChart(canvasId, dist, days) {
    if (!dist.length) { Charts.emptyBox(canvasId, 'No tracked time yet — run a focus session.'); return; }
    Charts.make(canvasId, {
      type: 'doughnut',
      data: {
        labels: dist.map(c => c.category),
        datasets: [{ data: dist.map(c => c.minutes), backgroundColor: dist.map(c => Utils.categoryColor(c.category)), borderWidth: 0, hoverOffset: 6 }]
      },
      options: { cutout: '58%', plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${Utils.fmtMinutes(ctx.raw)}` } } } }
    });
  },

  focusDistractionChart(canvasId, daily) {
    const focus = daily.reduce((a, d) => a + d.focusMinutes, 0);
    const distr = daily.reduce((a, d) => a + d.distractionMinutes, 0);
    if (!focus && !distr) { Charts.emptyBox(canvasId, 'No focus sessions logged in this period.'); return; }
    const total = focus + distr;
    Charts.make(canvasId, {
      type: 'doughnut',
      data: {
        labels: [`Focus ${Utils.pct(focus, total)}%`, `Distraction ${Utils.pct(distr, total)}%`],
        datasets: [{ data: [focus, distr], backgroundColor: ['#10b981', '#ef4444'], borderWidth: 0, hoverOffset: 6 }]
      },
      options: { cutout: '58%', plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.label} — ${Utils.fmtMinutes(ctx.raw)}` } } } }
    });
  },

  /* ---------------- Today page ---------------- */
  renderToday(container) {
    const today = Utils.today();
    const wd = Utils.weekdayShort(today);
    // only tasks scheduled for TODAY — missed/overdue tasks live in the red alert above
    const tasksToday = (App.state.tasks || [])
      .filter(t => !t._archived && t.scheduled_date === today)
      .sort((a, b) => {
        const r = { high: 0, medium: 1, low: 2 };
        return (r[a.priority] - r[b.priority]) || String(a.created_at).localeCompare(String(b.created_at));
      });
    const top3 = tasksToday.filter(t => t.status !== 'completed').slice(0, 3);
    const top3Ids = top3.map(t => t.id);

    const routines = (App.state.routines || [])
      .filter(r => r.enabled !== false && (String(r.days || '').trim() === 'Every day' || String(r.days || '').split(',').map(s => s.trim()).includes(wd)))
      .sort((a, b) => String(a.target_time).localeCompare(String(b.target_time)));

    const goalsToday = [];
    (App.state.tasks || []).forEach(t => {
      if (t.goal_id && (t.scheduled_date === today) && !goalsToday.some(g => g.id === t.goal_id)) {
        const g = (App.state.goals || []).find(x => x.id === t.goal_id);
        if (g) goalsToday.push(g);
      }
    });

    const stats = Analytics.todayStats();

    const missed = (App.state.tasks || [])
      .filter(t => !t._archived && t.status !== 'completed' && t.scheduled_date && t.scheduled_date < today)
      .sort((a, b) => String(a.scheduled_date).localeCompare(String(b.scheduled_date)));

    container.innerHTML = `
      <div class="dash-greeting">
        <h2>Today</h2>
        <p class="muted">${Utils.fmtDay(today)} — plan the day, then work the plan.</p>
      </div>

      ${missed.length ? `
      <div class="card missed-alert">
        <div class="missed-head">
          <span class="missed-title">${icon('triangle-exclamation')} ${missed.length} task${missed.length > 1 ? 's' : ''} missed from earlier days</span>
          <span class="muted small">Finish them today, or push forward — don't let them pile up.</span>
        </div>
        ${missed.map(t => {
          const daysOver = Math.round((Utils.parseDate(today) - Utils.parseDate(t.scheduled_date)) / 86400000);
          return `
          <div class="missed-row" data-id="${t.id}">
            <div class="task-main">
              <b>${Utils.esc(t.title)}</b>
              <div class="task-meta">
                ${chip('due ' + Utils.fmtDate(t.scheduled_date), '#ef4444')}
                ${chip(daysOver + 'd overdue', '#ef4444')}
                ${t.priority ? chip(t.priority, Utils.priorityColor(t.priority)) : ''}
              </div>
            </div>
            <div class="task-actions">
              <button class="btn btn-sm btn-primary" data-missed-act="do-today" title="Schedule for today">${icon('calendar-check')} Do today</button>
              <button class="btn btn-sm" data-missed-act="snooze" title="Push to tomorrow">${icon('forward')} +1d</button>
              <button class="btn btn-sm btn-success" data-missed-act="complete" title="Mark complete">${icon('check')}</button>
            </div>
          </div>`;
        }).join('')}
      </div>` : ''}

      <div class="card morning-plan">
        <h3 class="card-title">${icon('mug-hot')} Morning plan</h3>
        <div class="section-subhead">Top priorities</div>
        <div id="today-top3"></div>
        <div class="section-subhead">Scheduled routines — ${Utils.esc(wd)}</div>
        <div id="today-routines"></div>
        <div class="section-subhead">Goals connected to today</div>
        <div id="today-goals"></div>
      </div>

      <div class="section-head"><h3>Tasks for today</h3>
        <button class="btn btn-primary btn-sm" data-qa="task">${icon('plus')} Add task</button>
      </div>
      <div id="today-tasks" class="stack"></div>

      <div class="section-head"><h3>Habits — quick check</h3><a class="link" href="#/habits">Manage ${icon('arrow-right', 'fa-xs')}</a></div>
      <div class="habit-quick" id="today-habits"></div>

      <div class="card today-summary">
        <h3 class="card-title">${icon('clipboard-check')} Today so far</h3>
        <div class="summary-grid">
          <div><b>${Utils.fmtMinutes(stats.focusMinutes)}</b><span>focus</span></div>
          <div><b>${stats.tasksCompleted}/${stats.tasksPlanned}</b><span>tasks</span></div>
          <div><b>${stats.habitDone}/${stats.habitTotal}</b><span>habits</span></div>
          <div><b>${stats.score}</b><span>productivity</span></div>
        </div>
        <a class="btn btn-primary" href="#/reviews">${icon('pen-to-square')} Write daily review</a>
      </div>
    `;

    // top 3 priorities
    qs('#today-top3', container).innerHTML = top3.length
      ? `<ol class="priority-list">${top3.map(t => `<li><span class="pl-title">${Utils.esc(t.title)}</span>${chip(t.priority, Utils.priorityColor(t.priority))}</li>`).join('')}</ol>`
      : `<p class="muted">No open priorities today — add tasks or enjoy the clear runway.</p>`;

    // routines timeline
    qs('#today-routines', container).innerHTML = routines.length
      ? `<div class="routine-timeline">${routines.map(r => `
          <div class="routine-row">
            <span class="routine-time">${Utils.esc(r.target_time || '--:--')}</span>
            <span class="routine-dot"></span>
            <span class="routine-name">${Utils.esc(r.title)}</span>
            ${r.duration_minutes ? `<span class="muted">${Utils.fmtMinutes(r.duration_minutes)}</span>` : ''}
          </div>`).join('')}</div>`
      : `<p class="muted">No routines scheduled for ${Utils.esc(wd)}.</p>`;

    // goals connected to today
    qs('#today-goals', container).innerHTML = goalsToday.length
      ? goalsToday.map(g => {
          const prog = GoalProgress.auto(g);
          return `<div class="goal-inline">
            <span>${Utils.esc(g.title)}</span>
            <div class="progress-bar"><div class="progress-fill" style="width:${prog.pct}%"></div></div>
            <b>${prog.pct}%</b>
          </div>`;
        }).join('')
      : `<p class="muted">None of today's tasks are linked to a goal yet.</p>`;

    // tasks list (reuses Tasks renderer)
    const wrap = qs('#today-tasks', container);
    if (tasksToday.length) {
      wrap.innerHTML = tasksToday.map(t => Tasks.taskCard(t, top3Ids.includes(t.id))).join('');
    } else {
      wrap.innerHTML = '';
      wrap.appendChild(el(emptyState('list-check', 'No tasks for today', 'Plan your day by adding the first task.',
        `<button class="btn btn-primary" data-qa="task">${icon('plus')} Add task</button>`)));
    }

    // habit quick toggles
    const enabled = (App.state.habits || []).filter(h => h.enabled !== false);
    qs('#today-habits', container).innerHTML = enabled.length
      ? enabled.map(h => {
          const done = Analytics.habitDates(h.id).has(today);
          const st = Analytics.habitStreaks(h.id);
          return `<button class="habit-pill ${done ? 'done' : ''}" data-habit="${h.id}">
            ${icon(done ? 'circle-check' : 'circle')} ${Utils.esc(h.title)} <span class="muted">🔥${st.current}</span>
          </button>`;
        }).join('')
      : `<p class="muted">No habits yet — create one on the Habits page.</p>`;

    container.onclick = e => this.onClick(e);
  },

  /* Shared click handling for dashboard + today */
  onClick(e) {
    const mbtn = e.target.closest('[data-missed-act]');
    if (mbtn) {
      const id = mbtn.closest('[data-id]').dataset.id;
      const act = mbtn.dataset.missedAct;
      if (act === 'complete') return Tasks.handleCardAction('toggle', id);
      const patch = act === 'do-today'
        ? { scheduled_date: Utils.today() }
        : { scheduled_date: Utils.addDays(Utils.today(), 1) };
      API.updateTask(id, patch)
        .then(rec => {
          App.replaceRecord('tasks', rec);
          App.refreshCurrent();
          toast(act === 'do-today' ? '📅 Task moved to today.' : '⏭ Task pushed to tomorrow.', 'success');
        })
        .catch(err => App.handleError(err));
      return;
    }
    const qa = e.target.closest('[data-qa]');
    if (qa) {
      if (qa.dataset.qa === 'task') Tasks.openForm();
      if (qa.dataset.qa === 'focus') { location.hash = '#/focus'; }
      return;
    }
    const habitBtn = e.target.closest('[data-habit]');
    if (habitBtn) { Habits.toggleToday(habitBtn.dataset.habit); return; }
    const card = e.target.closest('[data-task-action]');
    if (card) Tasks.handleCardAction(card.dataset.taskAction, card.closest('[data-id]').dataset.id);
  }
};
