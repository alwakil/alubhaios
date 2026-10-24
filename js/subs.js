/* ============================================================
   AluBhaiOS — Subscriptions (⏳ countdown to fixed end dates)
   Track multiple subscriptions (HTB, courses, licenses…): a
   once-a-day popup on app open + a dashboard strip. The date is
   a fixed custom date set in Settings → Subscriptions; renewing
   is just editing that date.
   Stored in the `subscriptions` settings key — no extra table:
     { showPopup:true, warnDays:15, items:[{id,label,expiry}] }
   ============================================================ */
'use strict';

const Subs = {
  DEFAULTS: { showPopup: true, warnDays: 15, items: [] },

  /** whole config from App.settings.subscriptions (JSON string). Never throws —
      bad JSON or bad rows collapse to defaults / get dropped. */
  parse(raw) {
    const cfg = Object.assign({}, this.DEFAULTS, { items: [] });
    try {
      const v = JSON.parse(raw || 'null');
      if (v && typeof v === 'object') {
        if (typeof v.showPopup === 'boolean') cfg.showPopup = v.showPopup;
        const w = Utils.num(v.warnDays);
        if (w >= 1 && w <= 365) cfg.warnDays = Math.round(w);
        if (Array.isArray(v.items)) {
          cfg.items = v.items
            .filter(it => it && String(it.label || '').trim() && Utils.parseDate(it.expiry))
            .map(it => ({
              id: String(it.id || Utils.uid()),
              label: String(it.label).trim().slice(0, 60),
              expiry: String(it.expiry).slice(0, 10)
            }));
        }
      }
    } catch (e) { /* defaults */ }
    return cfg;
  },

  /** current config from app state */
  config() { return this.parse(App.settings.subscriptions); },

  /** days until the fixed expiry at local midnight:
      4 = in 4 days · 0 = ends today · -2 = expired 2 days ago · null = bad date */
  daysLeft(expiry, todayStr) {
    const e = Utils.parseDate(expiry);
    const t = Utils.parseDate(todayStr || Utils.today());
    if (!e || !t) return null;
    return Math.round((e - t) / 86400000);
  },

  /** UI state for a countdown: expired | today | warn | ok */
  stateOf(daysLeft, warnDays) {
    if (daysLeft === null || daysLeft === undefined) return 'ok';
    if (daysLeft < 0) return 'expired';
    if (daysLeft === 0) return 'today';
    if (daysLeft <= (warnDays || 15)) return 'warn';
    return 'ok';
  },

  colorOf(state) {
    return state === 'expired' || state === 'today' ? '#ef4444' : state === 'warn' ? '#f59e0b' : '#6366f1';
  },

  /** chip label for a countdown ("47d left", "ends TODAY", "3d EXPIRED") */
  chipText(daysLeft) {
    if (daysLeft === null || daysLeft === undefined) return '—';
    if (daysLeft < 0) return Math.abs(daysLeft) + 'd EXPIRED';
    if (daysLeft === 0) return 'ends TODAY';
    return daysLeft + 'd left';
  },

  /** items sorted soonest-first (bad dates sink to the end) */
  sorted(items, todayStr) {
    return items.slice().sort((a, b) => {
      const da = this.daysLeft(a.expiry, todayStr), db = this.daysLeft(b.expiry, todayStr);
      return (da === null ? 1e9 : da) - (db === null ? 1e9 : db);
    });
  },

  /** persist the whole config (single settings write) */
  async save(cfg) {
    const val = JSON.stringify(cfg);
    await API.saveSettings({ subscriptions: val });
    App.settings.subscriptions = val;
  },

  /* ================= Settings → Subscriptions card ================= */
  settingsCard(container) {
    const card = qs('#subs-card', container || (App.container && App.container()));
    if (!card) return;
    const self = this;

    const renderCard = () => {
      const cfg = self.config();
      card.innerHTML = `
        <h3 class="card-title">${icon('credit-card')} Subscriptions</h3>
        <p class="muted small">Countdown to fixed end dates (HTB, courses, licenses…). The popup appears once a day on app open; the dashboard gets a strip too.</p>
        <div id="subs-list">
          ${cfg.items.length ? self.sorted(cfg.items).map(it => {
            const d = self.daysLeft(it.expiry);
            const st = self.stateOf(d, cfg.warnDays);
            return `<div class="sub-row">
              ${chip(self.chipText(d), self.colorOf(st))}
              <b class="sub-label">${Utils.esc(it.label)}</b>
              <span class="muted small">ends ${Utils.fmtDate(it.expiry)}</span>
              <input type="date" class="sub-date" data-sub-date="${Utils.esc(it.id)}" value="${Utils.esc(it.expiry)}" title="Change the end date (renewal)">
              <button class="btn btn-icon btn-ghost danger" data-sub-del="${Utils.esc(it.id)}" title="Remove">${icon('xmark')}</button>
            </div>`;
          }).join('') : '<p class="muted small">No subscriptions yet — add your first one below.</p>'}
        </div>
        <div class="subs-add">
          <input id="sub-label" placeholder="e.g. HTB VIP" maxlength="60">
          <input type="date" id="sub-expiry" title="Ends on (fixed date)">
          <button class="btn btn-primary btn-sm" id="sub-add-btn">${icon('plus')} Add</button>
        </div>
        <div class="subs-opts">
          <label class="field" style="max-width:150px"><span>Warn below (days)</span>
            <input type="number" id="sub-warn" min="1" max="365" value="${cfg.warnDays}"></label>
          <label class="subs-check"><input type="checkbox" id="sub-popup" ${cfg.showPopup ? 'checked' : ''}> Show popup on app open (once a day)</label>
        </div>`;

      /* add — label + fixed end date required; exact duplicates rejected */
      const add = async () => {
        const label = qs('#sub-label', card).value.trim();
        const expiry = qs('#sub-expiry', card).value;
        if (!label) return toast('Give the subscription a name first (e.g. HTB VIP).', 'warn');
        if (!expiry || !Utils.parseDate(expiry)) return toast('Pick the end date — the countdown is fixed to it.', 'warn');
        const cfg2 = self.config();
        if (cfg2.items.some(it => it.label.toLowerCase() === label.toLowerCase() && it.expiry === expiry)) {
          return toast('That subscription with the same date already exists.', 'warn');
        }
        cfg2.items.push({ id: Utils.uid(), label: label, expiry: expiry });
        try {
          await self.save(cfg2);
          toast('⏳ Subscription added — countdown is live.', 'success');
          renderCard();
        } catch (e) { App.handleError(e); }
      };
      qs('#sub-add-btn', card).addEventListener('click', add);
      qs('#sub-label', card).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });

      /* delete — listeners live on the per-render list, never on container */
      qs('#subs-list', card).addEventListener('click', async e => {
        const del = e.target.closest('[data-sub-del]');
        if (!del) return;
        const cfg2 = self.config();
        cfg2.items = cfg2.items.filter(it => it.id !== del.dataset.subDel);
        try {
          await self.save(cfg2);
          toast('Subscription removed.', 'info');
          renderCard();
        } catch (err) { App.handleError(err); }
      });

      /* date edit = renewal: change the fixed date, countdown follows */
      qs('#subs-list', card).addEventListener('change', async e => {
        const inp = e.target.closest('[data-sub-date]');
        if (!inp) return;
        const nv = inp.value;
        if (!nv || !Utils.parseDate(nv)) return toast('Invalid date — kept the old one.', 'warn');
        const cfg2 = self.config();
        const it = cfg2.items.find(x => x.id === inp.dataset.subDate);
        if (!it) return;
        it.expiry = nv.slice(0, 10);
        try {
          await self.save(cfg2);
          toast('📅 End date updated — countdown follows the new date.', 'success');
          renderCard();
        } catch (err) { App.handleError(err); }
      });

      /* options — saved the moment they change */
      qs('#sub-warn', card).addEventListener('change', async () => {
        const w = Utils.num(qs('#sub-warn', card).value);
        if (w < 1 || w > 365) return toast('Warn days must be 1–365.', 'warn');
        const cfg2 = self.config();
        cfg2.warnDays = Math.round(w);
        try { await self.save(cfg2); } catch (err) { App.handleError(err); }
      });
      qs('#sub-popup', card).addEventListener('change', async () => {
        const cfg2 = self.config();
        cfg2.showPopup = qs('#sub-popup', card).checked;
        try { await self.save(cfg2); } catch (err) { App.handleError(err); }
      });
    };
    renderCard();
  },

  /* ================= Dashboard strip (next to Deadlines) ================= */
  dashboardCard(container) {
    const cardEl = qs('#dash-subs', container || (App.container && App.container()));
    if (!cardEl) return;
    const cfg = this.config();
    if (!cfg.items.length) return;
    cardEl.hidden = false;
    cardEl.innerHTML = `<div class="section-subhead">${icon('credit-card')} Subscriptions</div>` +
      this.sorted(cfg.items).map(it => {
        const d = this.daysLeft(it.expiry);
        const st = this.stateOf(d, cfg.warnDays);
        return `<div class="upcoming-row">
          ${chip(this.chipText(d), this.colorOf(st))}
          <span class="upcoming-titles">${Utils.esc(it.label)}</span>
          <span class="muted small">${Utils.fmtDate(it.expiry)}</span>
        </div>`;
      }).join('') +
      `<a class="link small" href="#/settings">Manage in Settings ${icon('arrow-right', 'fa-xs')}</a>`;
  },

  /* ================= Boot popup — at most once a day ================= */
  maybePopup() {
    const cfg = this.config();
    if (!cfg.showPopup || !cfg.items.length) return;
    const today = Utils.today();
    if (Utils.pref('subsPopup.' + today)) return;
    const rows = this.sorted(cfg.items).map(it => {
      const d = this.daysLeft(it.expiry);
      const st = this.stateOf(d, cfg.warnDays);
      const big = d !== null && d >= 0 ? `<b class="sub-pop-days" style="color:${this.colorOf(st)}">${d}</b><span class="muted small">days left</span>`
        : `<b class="sub-pop-days" style="color:${this.colorOf(st)}">${d === null ? '—' : Math.abs(d) + 'd'}</b><span class="muted small">${d === null ? 'bad date' : 'expired'}</span>`;
      return `<div class="sub-pop-row">
        <span class="sub-pop-label">${Utils.esc(it.label)}</span>
        <span class="sub-pop-count">${big}</span>
      </div>`;
    }).join('');
    const m = openModal({
      title: '⏳ Subscriptions',
      body: `<div class="subs-pop">${rows}</div><p class="muted small">Edit or add more in Settings → Subscriptions.</p>`,
      footer: `<button class="btn btn-primary" data-act="ok">${icon('check')} OK</button>`
    });
    qs('[data-act="ok"]', m.overlay).addEventListener('click', m.close);
    // any dismissal (OK / ✕ / overlay click) counts as "seen today"
    m.overlay.addEventListener('modal:closed', () => Utils.pref('subsPopup.' + today, true), { once: true });
  }
};
window.Subs = Subs;
