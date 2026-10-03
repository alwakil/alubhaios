/* ============================================================
   PersonalOS — Salah tracker
   Five daily prayers with one-tap check-in, prayer-time reminders,
   graphs (last 7 days), per-prayer consistency (who is missed most),
   an all-5 streak and its own progress level.
   Names + prayer times are editable in Settings.
   ============================================================ */
'use strict';

const Salah = {
  KEYS: ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'],

  names() {
    try { const n = JSON.parse(App.settings.salah_names || '[]'); if (Array.isArray(n) && n.length === 5) return n; } catch (e) { /* ignore */ }
    return ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  },

  times() {
    try { const t = JSON.parse(App.settings.salah_times || '[]'); if (Array.isArray(t)) return t; } catch (e) { /* ignore */ }
    return ['', '', '', '', ''];
  },

  rows() { return App.state.salah || []; },
  rowFor(date) { return this.rows().find(r => String(r.date).slice(0, 10) === date); },

  isDone(row, i) {
    if (!row) return false;
    const v = row[this.KEYS[i]];
    return v === true || v === 'TRUE' || String(v).toLowerCase() === 'true';
  },

  dayCount(row) { return this.KEYS.reduce((a, k, i) => a + (this.isDone(row, i) ? 1 : 0), 0); },

  /** consecutive days (from today, 1-day grace) where all 5 prayers were done */
  perfectStreak() {
    let cursor = Utils.today();
    if (!this.dayCount(this.rowFor(cursor))) cursor = Utils.addDays(cursor, -1);
    let streak = 0;
    while (this.dayCount(this.rowFor(cursor)) === 5) { streak++; cursor = Utils.addDays(cursor, -1); }
    return streak;
  },

  totalPrayers() { return this.rows().reduce((a, r) => a + this.dayCount(r), 0); },

  /** Salah level: one level per 35 prayers (~a perfect week) */
  level() {
    const total = this.totalPrayers();
    const L = Math.floor(total / 35) + 1;
    const base = (L - 1) * 35;
    return { level: L, into: total - base, need: 35, pct: Utils.pct(total - base, 35) };
  },

  /** per-prayer stats over the last N days */
  perPrayer(days) {
    const names = this.names();
    const out = this.KEYS.map((k, i) => ({ key: k, name: names[i] || this.names()[i] || k, done: 0 }));
    for (let d = 0; d < days; d++) {
      const row = this.rowFor(Utils.addDays(Utils.today(), -d));
      if (!row) continue;
      this.KEYS.forEach((k, i) => { if (this.isDone(row, i)) out[i].done++; });
    }
    return out.map(o => Object.assign(o, { pct: Utils.pct(o.done, days) }));
  },

  /* ================= page ================= */
  page(container) {
    const today = Utils.today();
    const row = this.rowFor(today);
    const done = this.dayCount(row);
    const names = this.names();
    const times = this.times();
    const streak = this.perfectStreak();
    const lvl = this.level();
    const per30 = this.perPrayer(30);
    const mostMissed = per30.slice().sort((a, b) => a.pct - b.pct)[0];
    const mostConsistent = per30.slice().sort((a, b) => b.pct - a.pct)[0];

    container.innerHTML = `
      <div class="page-head">
        <div>
          <h2>Salah</h2>
          <p class="muted small">Five daily prayers — one tap each, with your own names and times.</p>
        </div>
        <div class="fb-head-stats">
          <span class="chip" style="--chip-c:#10b981">${icon('mosque')} Today <b>${done}/5</b></span>
          <span class="chip" style="--chip-c:#f59e0b">${icon('fire')} Perfect streak <b>${streak}d</b></span>
          <span class="chip" style="--chip-c:#6366f1">${icon('star')} Salah Lv <b>${lvl.level}</b></span>
        </div>
      </div>

      <div class="card salah-today">
        <h3 class="card-title">${icon('mosque')} Today — ${Utils.fmtDay(today)}</h3>
        <div class="progress-bar big salah-bar"><div class="progress-fill" style="width:${done * 20}%"></div></div>
        <div class="salah-grid">
          ${this.KEYS.map((k, i) => {
            const isDone = this.isDone(row, i);
            const time = times[i] || '';
            return `
            <button class="salah-prayer ${isDone ? 'done' : ''}" data-salah-i="${i}">
              <span class="sp-check">${icon(isDone ? 'check' : k === 'fajr' ? 'sun' : 'moon')}</span>
              <span class="sp-name">${Utils.esc(names[i] || k)}</span>
              ${time ? `<span class="sp-time muted small">${Utils.esc(time)}</span>` : ''}
              <span class="sp-state">${isDone ? 'Prayed ✓' : 'Mark prayed'}</span>
            </button>`;
          }).join('')}
        </div>
        ${done === 5 ? `<p class="salah-complete">${icon('star')} All 5 prayers done today — مAshAllah!</p>` : ''}
      </div>

      <div class="salah-grid-2">
        <div class="card chart-card">
          <h3 class="card-title">${icon('chart-simple')} Last 7 days — prayers per day</h3>
          <div class="chart-box"><canvas id="salah-7d"></canvas></div>
        </div>
        <div class="card chart-card">
          <h3 class="card-title">${icon('calendar-check')} Last 30 days — per prayer</h3>
          <div class="bt-rows">
            ${per30.map(p => `
              <div class="bt-row ${p === mostConsistent && p.pct > 0 ? 'best' : ''} ${p === mostMissed && mostMissed.pct < 50 ? 'worst' : ''}">
                <span class="bt-name">${Utils.esc(p.name)}</span>
                <div class="bt-bar"><div class="bt-fill" style="width:${p.pct}%;background:${p.pct >= 80 ? 'var(--c-success)' : p.pct < 50 ? 'var(--c-danger)' : 'var(--c-warn)'}"></div></div>
                <span class="bt-val">${p.done}/${days30()} · ${p.pct}%</span>
              </div>`).join('')}
          </div>
          <div class="muted small" style="margin-top:8px">
            ${icon('arrow-trend-down')} Missed most: <b>${Utils.esc(mostMissed.name)}</b> (${mostMissed.pct}%)
            · ${icon('arrow-trend-up')} Most consistent: <b>${Utils.esc(mostConsistent.name)}</b> (${mostConsistent.pct}%)
          </div>
        </div>
      </div>

      <div class="card salah-level">
        <div class="level-row">
          <div class="level-num">Lv<br><b>${lvl.level}</b></div>
          <div class="level-bar-wrap">
            <div class="level-line">Salah level ${lvl.level} → ${lvl.level + 1}</div>
            <div class="progress-bar big"><div class="progress-fill" style="width:${lvl.pct}%"></div></div>
            <div class="muted small">${lvl.into}/${lvl.need} prayers to next level · total ${lvl.into + (lvl.level - 1) * 35} prayed</div>
          </div>
        </div>
      </div>
    `;

    this.draw7dChart();
    container.onclick = e => {
      const b = e.target.closest('[data-salah-i]');
      if (b) return this.toggle(Number(b.dataset.salahI));
    };

    function days30() { return 30; }
  },

  draw7dChart() {
    const labels = [], data = [];
    for (let d = 6; d >= 0; d--) {
      const date = Utils.addDays(Utils.today(), -d);
      labels.push(date.slice(5));
      data.push(this.dayCount(this.rowFor(date)));
    }
    Charts.make('salah-7d', {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: data.map(v => v === 5 ? '#10b981' : v > 0 ? '#f59e0b' : 'rgba(150,158,166,.35)'),
          borderRadius: 5, maxBarThickness: 42
        }]
      },
      options: Charts.lineOpts({ scales: { x: { grid: { display: false } }, y: { beginAtZero: true, max: 5, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.raw}/5 prayers` } } } })
    });
  },

  /* ================= interactions ================= */
  async toggle(i) {
    const today = Utils.today();
    const row = this.rowFor(today);
    const next = !this.isDone(row, i);
    try {
      const payload = { date: today };
      payload[this.KEYS[i]] = next;
      const rec = await API.setSalah(payload);
      App.replaceRecord('salah', rec);
      App.refreshCurrent();
      const names = this.names();
      if (this.dayCount(this.rowFor(today)) === 5) toast('🕌 All 5 prayers done — MashaAllah! +bonus XP', 'success');
      else toast(next ? `🕌 ${names[i]} marked as prayed (+2 XP)` : `${names[i]} unmarked`, 'success');
      Gamify.checkFreezeAward();
    } catch (e) { App.handleError(e); }
  },

  /* ================= reminders ================= */
  /** Fired every minute by the app: notify when a prayer time arrives. */
  checkReminders() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const names = this.names(), times = this.times();
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const row = this.rowFor(Utils.today());
    this.KEYS.forEach((k, i) => {
      const t = String(times[i] || '');
      if (!/^\d{1,2}:\d{2}/.test(t)) return;
      const parts = t.split(':');
      const diff = nowMin - (Number(parts[0]) * 60 + Number(parts[1]));
      if (diff < 0 || diff > 10) return;
      if (this.isDone(row, i)) return; // already prayed — no reminder
      const key = 'notified.salah.' + Utils.today() + '.' + i;
      if (Utils.pref(key)) return;
      Utils.pref(key, true);
      notify('🕌 ' + (names[i] || k) + ' time (' + t + ')', 'Time for ' + (names[i] || k) + ' — mark it when done.');
    });
  }
};
