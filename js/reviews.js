/* ============================================================
   PersonalOS — Reviews (daily + weekly)
   Daily:  energy / focus / motivation / stress + summary of the day
   Weekly: auto-computed stats + biggest win / problem / next focus
   Both upsert by their natural key (date / week_start) on the backend.
   ============================================================ */
'use strict';

const Reviews = {
  tab: 'daily',
  weekOffset: 0, // 0 = current week, -1 = last week…

  page(container) {
    container.innerHTML = `
      <div class="page-head"><h2>Reviews</h2></div>
      <div class="tabs" id="review-tabs">
        <button class="tab ${this.tab === 'daily' ? 'active' : ''}" data-tab="daily">${icon('sun')} Daily review</button>
        <button class="tab ${this.tab === 'weekly' ? 'active' : ''}" data-tab="weekly">${icon('calendar-week')} Weekly review</button>
      </div>
      <div id="review-body"></div>
    `;
    container.onclick = e => {
      const tab = e.target.closest('.tab');
      if (tab) { this.tab = tab.dataset.tab; return this.page(container); }
      const printBtn = e.target.closest('#wr-print');
      if (printBtn) { window.print(); return; }
      this.handleAction(e);
    };
    if (this.tab === 'daily') this.renderDaily(qs('#review-body', container));
    else this.renderWeekly(qs('#review-body', container));
  },

  handleAction(e) {
    const btn = e.target.closest('[data-review-action]');
    if (!btn) return;
    const act = btn.dataset.reviewAction;
    if (act === 'daily-edit') {
      const r = (App.state.dailyReviews || []).find(x => x.id === btn.dataset.id);
      if (r) this.openDailyModal(r.date, r);
    }
    if (act === 'daily-delete') {
      const r = (App.state.dailyReviews || []).find(x => x.id === btn.dataset.id);
      if (r) this.deleteDaily(r);
    }
    if (act === 'weekly-edit') {
      const r = (App.state.weeklyReviews || []).find(x => x.id === btn.dataset.id);
      if (r) this.openWeeklyModal(r.week_start, r);
    }
    if (act === 'weekly-delete') {
      const r = (App.state.weeklyReviews || []).find(x => x.id === btn.dataset.id);
      if (r) this.deleteWeekly(r);
    }
  },

  moodChips(r) {
    return [['battery-quarter', 'Energy', r.energy], ['brain', 'Focus', r.focus],
            ['rocket', 'Motivation', r.motivation], ['face-tired', 'Stress', r.stress]]
      .map(([ic, label, v]) => `<span class="mood-chip" title="${label}">${icon(ic)} ${Utils.esc(v || '–')}/5</span>`).join('');
  },

  /* ================= DAILY ================= */
  renderDaily(container) {
    const today = Utils.today();
    const existing = (App.state.dailyReviews || []).find(r => String(r.date).slice(0, 10) === today);
    const stats = Analytics.todayStats();

    const past = (App.state.dailyReviews || [])
      .filter(r => String(r.date).slice(0, 10) !== today)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    container.innerHTML = `
      <div class="reviews-grid">
        <div class="card">
          <h3 class="card-title">${icon('pen-to-square')} Daily review — ${Utils.fmtDay(today)}</h3>
          <div id="daily-form-wrap">${this.dailyFormHTML(existing)}</div>
          <div class="form-actions">
            <button class="btn btn-primary" id="daily-save">${icon('check')} ${existing ? 'Update today\'s review' : 'Save daily review'}</button>
          </div>
        </div>

        <div class="card today-summary">
          <h3 class="card-title">${icon('clipboard-check')} Today's Summary</h3>
          <div class="summary-grid big">
            <div><b>${Utils.fmtMinutes(stats.focusMinutes)}</b><span>Focus</span></div>
            <div><b>${stats.tasksCompleted}/${stats.tasksPlanned}</b><span>Tasks</span></div>
            <div><b>${stats.habitDone}/${stats.habitTotal}</b><span>Habits</span></div>
            <div><b>${stats.score}</b><span>Productivity</span></div>
          </div>
          <p class="muted small">Numbers update live from your tasks, focus sessions and habits.</p>
        </div>
      </div>

      <div class="section-head"><h3>Previous daily reviews</h3></div>
      <div id="daily-history" class="stack"></div>
    `;

    qs('#daily-save', container).addEventListener('click', () => this.saveDaily(today, existing));
    qs('#daily-history', container).innerHTML = past.length
      ? past.map(r => `
        <div class="card review-card" data-id="${r.id}">
          <div class="task-main">
            <div class="task-title">${Utils.fmtDay(String(r.date).slice(0, 10))}</div>
            <div class="task-meta">${this.moodChips(r)}</div>
            ${r.accomplishments ? `<div class="small">${icon('trophy', 'fa-xs')} ${Utils.esc(r.accomplishments)}</div>` : ''}
            ${r.blockers ? `<div class="small muted">${icon('ban', 'fa-xs')} ${Utils.esc(r.blockers)}</div>` : ''}
            ${r.notes ? `<div class="small muted">${Utils.esc(r.notes)}</div>` : ''}
          </div>
          <div class="task-actions">
            <button class="btn btn-icon btn-ghost" data-review-action="daily-edit" data-id="${r.id}" title="Edit">${icon('pencil')}</button>
            <button class="btn btn-icon btn-ghost danger" data-review-action="daily-delete" data-id="${r.id}" title="Delete">${icon('trash')}</button>
          </div>
        </div>`).join('')
      : '';
    if (!past.length) {
      qs('#daily-history', container).appendChild(el(emptyState('book-open', 'No past reviews yet',
        'Reviewing your day takes two minutes and makes your weekly report much smarter.')));
    }
  },

  dailyFormHTML(r) {
    r = r || {};
    const scale = (name, label, val) => `
      <div class="field">
        <span>${label}</span>
        <div class="scale-row" data-scale="${name}">
          ${[1, 2, 3, 4, 5].map(n => `<label class="day-pill ${Utils.num(val) === n ? 'on' : ''}">
            <input type="radio" name="${name}" value="${n}" ${Utils.num(val) === n ? 'checked' : ''}>${n}</label>`).join('')}
        </div>
      </div>`;
    return `
      <div class="field-row">
        ${scale('energy', 'Energy', r.energy)}
        ${scale('focus', 'Focus', r.focus)}
      </div>
      <div class="field-row">
        ${scale('motivation', 'Motivation', r.motivation)}
        ${scale('stress', 'Stress', r.stress)}
      </div>
      <label class="field"><span>Biggest accomplishment</span>
        <textarea name="accomplishments" rows="2">${Utils.esc(r.accomplishments || '')}</textarea></label>
      <label class="field"><span>Biggest blocker</span>
        <textarea name="blockers" rows="2">${Utils.esc(r.blockers || '')}</textarea></label>
      <label class="field"><span>Notes</span>
        <textarea name="notes" rows="2">${Utils.esc(r.notes || '')}</textarea></label>`;
  },

  collectDaily(container) {
    const get = n => { const i = qs(`[name="${n}"]`, container); return i ? (i.type === 'radio' ? (qs(`[name="${n}"]:checked`, container) || {}).value || '' : i.value) : ''; };
    return {
      energy: get('energy'), focus: get('focus'), motivation: get('motivation'), stress: get('stress'),
      accomplishments: get('accomplishments'), blockers: get('blockers'), notes: get('notes')
    };
  },

  saveDaily(date, existing) {
    const wrap = qs('#daily-form-wrap', App.container());
    const data = Object.assign({ date: date }, this.collectDaily(wrap));
    const btn = qs('#daily-save', App.container());
    if (btn) { btn.disabled = true; btn.innerHTML = `${icon('spinner', 'fa-spin')} Saving…`; }
    API.createDailyReview(data)
      .then(rec => {
        App.replaceRecord('dailyReviews', rec);
        App.refreshCurrent();
        toast(existing ? 'Daily review updated' : 'Daily review saved — nice reflection habit!', 'success');
      })
      .catch(e => {
        if (btn) { btn.disabled = false; btn.innerHTML = `${icon('check')} ${existing ? "Update today's review" : 'Save daily review'}`; }
        App.handleError(e);
      });
  },

  openDailyModal(date, existing) {
    const m = openModal({
      title: 'Edit daily review — ' + Utils.fmtDay(date),
      body: `<div id="modal-daily-form">${this.dailyFormHTML(existing)}</div>`,
      footer: `
        <button class="btn btn-ghost" data-cancel>Cancel</button>
        <button class="btn btn-primary" data-save>Save changes</button>`
    });
    qsa('.scale-row', m.overlay).forEach(row => row.addEventListener('change', () => {
      qsa('.day-pill', row).forEach(p => p.classList.toggle('on', qs('input', p).checked));
    }));
    qs('[data-cancel]', m.overlay).addEventListener('click', m.close);
    qs('[data-save]', m.overlay).addEventListener('click', () => {
      const data = Object.assign({ date: date }, this.collectDaily(qs('#modal-daily-form', m.overlay)));
      API.createDailyReview(data)
        .then(rec => { App.replaceRecord('dailyReviews', rec); m.close(); App.refreshCurrent(); toast('Review updated', 'success'); })
        .catch(e => App.handleError(e));
    });
  },

  deleteDaily(r) {
    confirmDialog({ title: 'Delete daily review?', message: `The review for <b>${Utils.fmtDay(String(r.date).slice(0, 10))}</b> will be permanently deleted.` })
      .then(ok => {
        if (!ok) return;
        API.deleteDailyReview(r.id)
          .then(() => { App.state.dailyReviews = App.state.dailyReviews.filter(x => x.id !== r.id); App.refreshCurrent(); toast('Review deleted', 'success'); })
          .catch(e => App.handleError(e));
      });
  },

  /* ================= WEEKLY ================= */
  renderWeekly(container) {
    const weekStart = Utils.addDays(Utils.startOfWeek(Utils.today()), this.weekOffset * 7);
    const weekEnd = Utils.addDays(weekStart, 6);

    // aggregate the 7 days of the selected week
    const days = [];
    for (let i = 0; i < 7; i++) days.push(Analytics.dayStat(Utils.addDays(weekStart, i)));

    const existing = (App.state.weeklyReviews || []).find(r => String(r.week_start).slice(0, 10) === weekStart);

    // ---- auto weekly report (this week vs previous week, from real data) ----
    const sum = k => days.reduce((a, d) => a + d[k], 0);
    const activeDays = days.filter(d => d.active);
    const avgScore = activeDays.length ? Math.round(activeDays.reduce((a, d) => a + d.score, 0) / activeDays.length) : 0;
    const habitPct = Math.round(sum('habitDone') / Math.max(1, sum('habitTotal')) * 100);

    const prevDays = [];
    for (let i = 0; i < 7; i++) prevDays.push(Analytics.dayStat(Utils.addDays(weekStart, -7 + i)));
    const pSum = k => prevDays.reduce((a, d) => a + d[k], 0);
    const pActive = prevDays.filter(d => d.active);
    const pAvgScore = pActive.length ? Math.round(pActive.reduce((a, d) => a + d.score, 0) / pActive.length) : 0;
    const pHabitPct = Math.round(pSum('habitDone') / Math.max(1, pSum('habitTotal')) * 100);

    const delta = (cur, prev) => {
      if (!prev) return null;
      const d = cur - prev;
      return { d, pct: prev ? Math.round(d / prev * 100) : null };
    };
    const deltaChip = (label, cur, prev, fmt, lowerIsBetter) => {
      const dl = delta(cur, prev);
      const arrow = dl === null ? '' : dl.d > 0 ? icon('arrow-trend-up') : dl.d < 0 ? icon('arrow-trend-down') : icon('minus');
      const tone = dl === null || dl.d === 0 ? 'muted' : ((dl.d > 0) !== !!lowerIsBetter ? 'good' : 'bad');
      return `<div class="wr-delta tone-${tone}">
        <span class="wr-label">${label}</span>
        <b>${fmt(cur)}</b>
        ${dl === null ? '<span class="muted small">no last-week data</span>'
          : `<span class="wr-diff">${arrow} ${dl.d > 0 ? '+' : ''}${fmt(dl.d)}${dl.pct !== null ? ` (${Math.abs(dl.pct)}%)` : ''}</span>`}
      </div>`;
    };
    const bestDay = activeDays.length ? activeDays.reduce((a, d) => d.score > a.score ? d : a) : null;
    const worstDay = activeDays.length ? activeDays.reduce((a, d) => d.score < a.score ? d : a) : null;
    const hasAny = days.some(d => d.active) || prevDays.some(d => d.active);

    container.innerHTML = `
      <div class="week-nav card">
        <button class="btn btn-icon btn-ghost" data-week="-1" title="Previous week">${icon('chevron-left')}</button>
        <div>
          <b>${Utils.fmtDate(weekStart)} — ${Utils.fmtDate(weekEnd)}</b>
          <div class="muted small">${this.weekOffset === 0 ? 'Current week' : this.weekOffset === -1 ? 'Last week' : Math.abs(this.weekOffset) + ' weeks ago'}</div>
        </div>
        <button class="btn btn-icon btn-ghost" data-week="1" title="Next week" ${this.weekOffset >= 0 ? 'disabled' : ''}>${icon('chevron-right')}</button>
      </div>

      ${hasAny ? `
      <div class="card wr-report">
        <div class="wr-report-head">
          <h3 class="card-title">${icon('chart-line')} Auto weekly report</h3>
          <button class="btn btn-sm" id="wr-print">${icon('print')} Print</button>
        </div>
        <div class="wr-delta-grid">
          ${deltaChip('Avg productivity', avgScore, pAvgScore, v => v)}
          ${deltaChip('Focus time', sum('focusMinutes'), pSum('focusMinutes'), v => Utils.fmtMinutes(v))}
          ${deltaChip('Tasks completed', sum('tasksCompleted'), pSum('tasksCompleted'), v => v)}
          ${deltaChip('Habit consistency', habitPct, pHabitPct, v => v + '%')}
        </div>
        ${(() => {
          const tips = [];
          if (pSum('distractionMinutes') > 0 && sum('distractionMinutes') > pSum('distractionMinutes') * 1.2) {
            tips.push(['phone-flip', 'bad', `Distraction time rose to ${Utils.fmtMinutes(sum('distractionMinutes'))} — try a distraction log next week.`]);
          }
          if (sum('habitTotal') > 0 && habitPct < 50) {
            tips.push(['seedling', 'warn', `Habit consistency is only ${habitPct}% — shrink the habits until they feel easy, then grow.`]);
          }
          const planAcc = Analytics.planningAccuracy(30);
          if (planAcc && planAcc.underestimatePct >= 25) {
            tips.push(['clock-rotate-left', 'warn', `You underestimate tasks by ~${planAcc.underestimatePct}% — add buffer time to estimates.`]);
          }
          const weekReviews = (App.state.dailyReviews || []).filter(r => {
            const d = String(r.date).slice(0, 10);
            return d >= weekStart && d <= weekEnd;
          }).length;
          if (weekReviews === 0) {
            tips.push(['pen-to-square', 'info', 'No daily reviews this week — two minutes each evening makes next week smarter.']);
          }
          if (pAvgScore > 0 && avgScore >= pAvgScore && sum('focusMinutes') >= pSum('focusMinutes') && sum('tasksCompleted') >= pSum('tasksCompleted')) {
            tips.push(['trophy', 'good', 'Everything held or improved vs last week — keep the momentum going!']);
          }
          if (!tips.length) return '';
          return `<div class="coach-tips">
            <div class="coach-title">${icon('user-graduate')} Coach says</div>
            ${tips.map(t => `<div class="coach-tip tone-${t[1]}">${icon(t[0])}<span>${Utils.esc(t[2])}</span></div>`).join('')}
          </div>`;
        })()}
        ${bestDay ? `<div class="wr-days">
          <span class="chip" style="--chip-c:#10b981">${icon('trophy')} Best day: <b>&nbsp;${Utils.fmtDay(bestDay.date)}</b> (${bestDay.score}/100)</span>
          ${worstDay && worstDay.date !== bestDay.date ? `<span class="chip" style="--chip-c:#64748b">${icon('cloud-rain')} Toughest day: <b>&nbsp;${Utils.fmtDay(worstDay.date)}</b> (${worstDay.score}/100)</span>` : ''}
        </div>` : ''}
      </div>` : ''}

      <div class="reviews-grid">
        <div class="card">
          <h3 class="card-title">${icon('pen-to-square')} Weekly reflection</h3>
          <label class="field"><span>Biggest achievement</span>
            <textarea id="wr-win" rows="2">${Utils.esc(existing ? existing.biggest_win : '')}</textarea></label>
          <label class="field"><span>Biggest problem</span>
            <textarea id="wr-problem" rows="2">${Utils.esc(existing ? existing.biggest_problem : '')}</textarea></label>
          <label class="field"><span>Next week's focus</span>
            <textarea id="wr-next" rows="2">${Utils.esc(existing ? existing.next_week_focus : '')}</textarea></label>
          <label class="field"><span>Notes</span>
            <textarea id="wr-notes" rows="2">${Utils.esc(existing ? existing.notes : '')}</textarea></label>
          <div class="form-actions">
            <button class="btn btn-primary" id="weekly-save">${icon('check')} ${existing ? 'Update weekly review' : 'Save weekly review'}</button>
          </div>
        </div>

        <div class="card">
          <h3 class="card-title">${icon('chart-line')} Weekly report (auto-calculated)</h3>
          <div class="summary-grid big">
            <div><b>${Utils.fmtMinutes(sum('focusMinutes'))}</b><span>Total focus</span></div>
            <div><b>${Utils.fmtMinutes(sum('focusMinutes') + sum('distractionMinutes'))}</b><span>Tracked time</span></div>
            <div><b>${sum('tasksCompleted')}</b><span>Completed</span></div>
            <div><b>${sum('tasksPlanned') - sum('tasksCompleted')}</b><span>Incomplete</span></div>
            <div><b>${habitPct}%</b><span>Habit consistency</span></div>
            <div><b>${avgScore}</b><span>Avg productivity</span></div>
          </div>
          <div class="muted small" style="margin-top:10px">
            Planned time: ${Utils.fmtMinutes(sum('plannedMinutes'))} · Actual time: ${Utils.fmtMinutes(sum('actualMinutes'))}
          </div>
        </div>
      </div>

      <div class="section-head"><h3>Saved weekly reviews</h3></div>
      <div id="weekly-history" class="stack"></div>
    `;

    container.querySelectorAll('[data-week]').forEach(b => b.addEventListener('click', () => {
      this.weekOffset = Math.min(0, this.weekOffset + Number(b.dataset.week));
      this.page(App.container());
    }));

    qs('#weekly-save', container).addEventListener('click', () => {
      const data = {
        week_start: weekStart,
        week_end: weekEnd,
        planned_tasks: sum('tasksPlanned'),
        completed_tasks: sum('tasksCompleted'),
        focus_minutes: sum('focusMinutes'),
        distraction_minutes: sum('distractionMinutes'),
        biggest_win: qs('#wr-win', container).value,
        biggest_problem: qs('#wr-problem', container).value,
        next_week_focus: qs('#wr-next', container).value,
        notes: qs('#wr-notes', container).value
      };
      const btn = qs('#weekly-save', container);
      if (btn) { btn.disabled = true; btn.innerHTML = `${icon('spinner', 'fa-spin')} Saving…`; }
      API.createWeeklyReview(data)
        .then(rec => { App.replaceRecord('weeklyReviews', rec); App.refreshCurrent(); toast('Weekly review saved', 'success'); })
        .catch(e => {
          if (btn) { btn.disabled = false; btn.innerHTML = `${icon('check')} ${existing ? 'Update weekly review' : 'Save weekly review'}`; }
          App.handleError(e);
        });
    });

    const history = (App.state.weeklyReviews || []).slice().sort((a, b) => String(b.week_start).localeCompare(String(a.week_start)));
    const hWrap = qs('#weekly-history', container);
    if (history.length) {
      hWrap.innerHTML = history.map(r => `
        <div class="card review-card" data-id="${r.id}">
          <div class="task-main">
            <div class="task-title">Week of ${Utils.fmtDate(String(r.week_start).slice(0, 10))}</div>
            <div class="task-meta">
              ${chip('focus ' + Utils.fmtMinutes(r.focus_minutes), 'var(--c-primary)')}
              ${chip(`${r.completed_tasks}/${r.planned_tasks} tasks`, '#10b981')}
            </div>
            ${r.biggest_win ? `<div class="small">${icon('trophy', 'fa-xs')} ${Utils.esc(r.biggest_win)}</div>` : ''}
            ${r.biggest_problem ? `<div class="small muted">${icon('ban', 'fa-xs')} ${Utils.esc(r.biggest_problem)}</div>` : ''}
            ${r.next_week_focus ? `<div class="small muted">${icon('arrow-right', 'fa-xs')} Next: ${Utils.esc(r.next_week_focus)}</div>` : ''}
          </div>
          <div class="task-actions">
            <button class="btn btn-icon btn-ghost" data-review-action="weekly-edit" data-id="${r.id}" title="Edit">${icon('pencil')}</button>
            <button class="btn btn-icon btn-ghost danger" data-review-action="weekly-delete" data-id="${r.id}" title="Delete">${icon('trash')}</button>
          </div>
        </div>`).join('');
    } else {
      hWrap.appendChild(el(emptyState('calendar-week', 'No weekly reviews yet',
        'Pick a week above and save your first reflection.')));
    }
  },

  openWeeklyModal(existing) {
    const m = openModal({
      title: 'Edit weekly review — ' + Utils.fmtDate(String(existing.week_start).slice(0, 10)),
      body: `
        <label class="field"><span>Biggest achievement</span><textarea id="m-wr-win" rows="2">${Utils.esc(existing.biggest_win || '')}</textarea></label>
        <label class="field"><span>Biggest problem</span><textarea id="m-wr-problem" rows="2">${Utils.esc(existing.biggest_problem || '')}</textarea></label>
        <label class="field"><span>Next week's focus</span><textarea id="m-wr-next" rows="2">${Utils.esc(existing.next_week_focus || '')}</textarea></label>
        <label class="field"><span>Notes</span><textarea id="m-wr-notes" rows="2">${Utils.esc(existing.notes || '')}</textarea></label>`,
      footer: `
        <button class="btn btn-ghost" data-cancel>Cancel</button>
        <button class="btn btn-primary" data-save>Save changes</button>`
    });
    qs('[data-cancel]', m.overlay).addEventListener('click', m.close);
    qs('[data-save]', m.overlay).addEventListener('click', () => {
      const data = {
        week_start: String(existing.week_start).slice(0, 10),
        week_end: String(existing.week_end).slice(0, 10),
        biggest_win: qs('#m-wr-win', m.overlay).value,
        biggest_problem: qs('#m-wr-problem', m.overlay).value,
        next_week_focus: qs('#m-wr-next', m.overlay).value,
        notes: qs('#m-wr-notes', m.overlay).value
      };
      API.createWeeklyReview(data)
        .then(rec => { App.replaceRecord('weeklyReviews', rec); m.close(); App.refreshCurrent(); toast('Weekly review updated', 'success'); })
        .catch(e => App.handleError(e));
    });
  },

  deleteWeekly(r) {
    confirmDialog({ title: 'Delete weekly review?', message: `The review for the week of <b>${Utils.fmtDate(String(r.week_start).slice(0, 10))}</b> will be permanently deleted.` })
      .then(ok => {
        if (!ok) return;
        API.deleteWeeklyReview(r.id)
          .then(() => { App.state.weeklyReviews = App.state.weeklyReviews.filter(x => x.id !== r.id); App.refreshCurrent(); toast('Weekly review deleted', 'success'); })
          .catch(e => App.handleError(e));
      });
  }
};
