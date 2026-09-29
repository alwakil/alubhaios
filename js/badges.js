/* ============================================================
   PersonalOS — Badges
   Every badge is computed from the REAL records (tasks, focus
   sessions, habit logs, reviews, goals, XP). Locked badges show
   live progress; tiers: bronze / silver / gold.
   ============================================================ */
'use strict';

const Badges = {

  /** current metric values, all derived from App.state */
  stats() {
    const s = App.state;
    const completed = (s.tasks || []).filter(t => t.status === 'completed');
    const focusMin = (s.focusSessions || []).reduce((a, x) => a + Utils.num(x.duration_minutes), 0);
    const isReal = l => !/❄|freeze/i.test(String(l.note || ''));
    const checkins = (s.habitLogs || []).filter(l =>
      (l.completed === true || String(l.completed).toLowerCase() === 'true') && isReal(l)).length;
    const bestStreak = (s.habits || []).reduce((a, h) => Math.max(a, Analytics.habitStreaks(h.id).best), 0);
    const perfectWeek = (s.habits || []).some(h => h.enabled !== false && Analytics.habitPctDays(h.id, 7) === 100);
    const goalDone = (s.goals || []).some(g => Utils.num(g.progress) >= 100 || g.status === 'completed');
    const pomos = (s.focusSessions || []).filter(x => String(x.notes || '').includes('[pomodoro]')).length;
    const earlyBird = completed.some(t => {
      const h = Number(String(t.completed_at).slice(11, 13));
      return h > 0 && h < 8;
    });
    const reviews = (s.dailyReviews || []).length;
    const xp = Gamify.xp();
    return {
      tasks: completed.length,
      focusSessions: (s.focusSessions || []).length,
      focusMin: focusMin,
      checkins: checkins,
      bestStreak: bestStreak,
      perfectWeek: perfectWeek,
      goalDone: goalDone,
      pomos: pomos,
      earlyBird: earlyBird,
      reviews: reviews,
      level: Gamify.level(xp).level
    };
  },

  defs: [
    { id: 'tasks-1',   name: 'Getting Started', desc: 'Complete your first task',            icon: 'flag-checkered', tier: 'bronze', get: st => st.tasks,            goal: 1 },
    { id: 'tasks-10',  name: 'Task Hunter',     desc: 'Complete 10 tasks',                   icon: 'list-check',     tier: 'bronze', get: st => st.tasks,            goal: 10 },
    { id: 'tasks-50',  name: 'Task Machine',    desc: 'Complete 50 tasks',                   icon: 'gears',          tier: 'silver', get: st => st.tasks,            goal: 50 },
    { id: 'tasks-100', name: 'Century',         desc: 'Complete 100 tasks',                  icon: 'medal',          tier: 'gold',   get: st => st.tasks,            goal: 100 },
    { id: 'tasks-500', name: 'Legend',          desc: 'Complete 500 tasks',                  icon: 'crown',          tier: 'gold',   get: st => st.tasks,            goal: 500 },
    { id: 'focus-1',   name: 'Deep Diver',      desc: 'Finish your first focus session',     icon: 'stopwatch',      tier: 'bronze', get: st => st.focusSessions,    goal: 1 },
    { id: 'focus-10h', name: '10 Hour Club',    desc: 'Accumulate 10 hours of focus',        icon: 'hourglass-half', tier: 'bronze', get: st => st.focusMin,         goal: 600,  unit: 'min' },
    { id: 'focus-50h', name: '50 Hour Club',    desc: 'Accumulate 50 hours of focus',        icon: 'hourglass',      tier: 'silver', get: st => st.focusMin,         goal: 3000, unit: 'min' },
    { id: 'focus-100h',name: '100 Hour Club',   desc: 'Accumulate 100 hours of focus',       icon: 'gem',            tier: 'gold',   get: st => st.focusMin,         goal: 6000, unit: 'min' },
    { id: 'streak-3',  name: 'Warming Up',      desc: 'Reach a 3-day habit streak',          icon: 'fire-flame-simple', tier: 'bronze', get: st => st.bestStreak, goal: 3, unit: 'd' },
    { id: 'streak-7',  name: 'On Fire',         desc: 'Reach a 7-day habit streak',          icon: 'fire',           tier: 'silver', get: st => st.bestStreak, goal: 7, unit: 'd' },
    { id: 'streak-14', name: 'Unstoppable',     desc: 'Reach a 14-day habit streak',         icon: 'bolt-lightning', tier: 'silver', get: st => st.bestStreak, goal: 14, unit: 'd' },
    { id: 'streak-30', name: 'Iron Will',       desc: 'Reach a 30-day habit streak',         icon: 'dumbbell',       tier: 'gold',   get: st => st.bestStreak, goal: 30, unit: 'd' },
    { id: 'habits-50', name: 'Habit Builder',   desc: '50 habit check-ins',                  icon: 'seedling',       tier: 'bronze', get: st => st.checkins,         goal: 50 },
    { id: 'habits-200',name: 'Habit Master',    desc: '200 habit check-ins',                 icon: 'tree',           tier: 'gold',   get: st => st.checkins,         goal: 200 },
    { id: 'perfect-7', name: 'Perfect Week',    desc: 'All habits done 7 days in a row',     icon: 'star',           tier: 'silver', get: st => st.perfectWeek ? 1 : 0, goal: 1 },
    { id: 'review-1',  name: 'Reflective',      desc: 'Write your first daily review',       icon: 'pen-to-square',  tier: 'bronze', get: st => st.reviews,          goal: 1 },
    { id: 'review-30', name: 'Mirror Master',   desc: 'Write 30 daily reviews',              icon: 'book-open-reader', tier: 'gold', get: st => st.reviews,          goal: 30 },
    { id: 'goal-100',  name: 'Goal Crusher',    desc: 'Take a goal to 100%',                 icon: 'bullseye',       tier: 'gold',   get: st => st.goalDone ? 1 : 0, goal: 1 },
    { id: 'pomo-10',   name: 'Pomodoro Pro',    desc: 'Finish 10 pomodoro cycles',           icon: 'clock-rotate-left', tier: 'silver', get: st => st.pomos,      goal: 10 },
    { id: 'early-bird',name: 'Early Bird',      desc: 'Complete a task before 8:00 AM',      icon: 'worm',           tier: 'bronze', get: st => st.earlyBird ? 1 : 0, goal: 1 },
    { id: 'level-5',   name: 'Level 5',         desc: 'Reach level 5',                       icon: 'arrow-up-right-dots', tier: 'silver', get: st => st.level,     goal: 5, unit: 'lvl' },
    { id: 'level-10',  name: 'Level 10',        desc: 'Reach level 10',                      icon: 'trophy',         tier: 'gold',   get: st => st.level,            goal: 10, unit: 'lvl' }
  ],

  tierColor(t) { return { bronze: '#cd7f32', silver: '#a8b3c4', gold: '#f5c518' }[t] || '#64748b'; },

  page(container) {
    const st = this.stats();
    const lv = Gamify.level(Gamify.xp());
    const unlocked = this.defs.filter(d => d.get(st) >= d.goal).length;

    container.innerHTML = `
      <div class="page-head">
        <div>
          <h2>Badges</h2>
          <p class="muted small">Earned from your real progress — nothing is given for free.</p>
        </div>
        <div class="fb-head-stats">
          <span class="chip" style="--chip-c:#f5c518">${icon('trophy')} <b>${unlocked}/${this.defs.length}</b> unlocked</span>
          <span class="chip" style="--chip-c:#6366f1">${icon('bolt')} Level <b>${lv.level}</b></span>
          <span class="chip" style="--chip-c:#10b981">${icon('snowflake')} Freezes <b>${Gamify.heldFreezes()}/2</b></span>
        </div>
      </div>

      <div class="card level-card">
        <div class="level-row">
          <div class="level-num">Lv<br><b>${lv.level}</b></div>
          <div class="level-bar-wrap">
            <div class="level-line">Level ${lv.level} → Level ${lv.level + 1}</div>
            <div class="progress-bar big"><div class="progress-fill" style="width:${lv.pct}%"></div></div>
            <div class="muted small">${lv.into} / ${lv.need} XP to next level · total ${Gamify.xp()} XP</div>
          </div>
        </div>
        <div class="muted small xp-legend">
          +10 task · +5 habit · +1 XP / 3 min focus · +15 daily review · +25 weekly review
        </div>
      </div>

      <div class="badge-grid">
        ${this.defs.map(d => this.badgeCard(d, st)).join('')}
      </div>
    `;

    container.onclick = e => { /* badges are informational — no actions */ };
  },

  badgeCard(d, st) {
    const val = Math.min(d.get(st), d.goal);
    const unlocked = d.get(st) >= d.goal;
    const pct = Utils.pct(val, d.goal);
    const tier = this.tierColor(d.tier);
    const goalText = d.unit === 'min' ? Utils.fmtMinutes(d.goal) :
                     d.unit === 'd' ? d.goal + ' days' :
                     d.unit === 'lvl' ? 'Level ' + d.goal : d.goal;
    return `
      <div class="card badge-card ${unlocked ? 'unlocked' : 'locked'}" style="--tier:${tier}">
        <div class="badge-icon">${icon(unlocked ? d.icon : 'lock')}</div>
        <div class="badge-body">
          <b>${Utils.esc(d.name)}</b>
          <span class="muted small">${Utils.esc(d.desc)}</span>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${tier}"></div></div>
          <span class="badge-progress small">${unlocked ? '✅ Unlocked' : `${val} / ${goalText}`}</span>
        </div>
        <span class="badge-tier" title="${d.tier}">${icon(d.tier === 'gold' ? 'crown' : d.tier === 'silver' ? 'medal' : 'shield')}</span>
      </div>`;
  }
};
