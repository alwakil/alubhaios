/* ============================================================
   PersonalOS — Utilities
   Dates, formatting, storage, DOM helpers, toasts, modals.
   All dates/times are handled as LOCAL "naive" strings:
     date     -> "YYYY-MM-DD"
     datetime -> "YYYY-MM-DDTHH:MM:SS"
   The backend stores them as plain text so no timezone is ever
   applied twice. Single-user app, local time is the source of truth.
   ============================================================ */
'use strict';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const CATEGORY_COLORS = {
  Learning: '#6366f1',
  Projects: '#10b981',
  Work: '#f59e0b',
  Personal: '#ec4899',
  Entertainment: '#ef4444',
  Distraction: '#ef4444',
  Other: '#64748b'
};

const PRIORITY_COLORS = { high: '#ef4444', medium: '#f59e0b', low: '#64748b' };

const Utils = {
  pad(n) { return String(n).padStart(2, '0'); },

  uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  },

  nowISO() {
    const d = new Date();
    return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}` +
           `T${this.pad(d.getHours())}:${this.pad(d.getMinutes())}:${this.pad(d.getSeconds())}`;
  },

  dateStr(d) {
    return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`;
  },

  today() { return this.dateStr(new Date()); },

  parseDate(s) {
    if (!s) return null;
    const p = String(s).slice(0, 10).split('-').map(Number);
    if (p.length !== 3 || p.some(isNaN)) return null;
    return new Date(p[0], p[1] - 1, p[2]);
  },

  addDays(dateStr, n) {
    const d = this.parseDate(dateStr);
    if (!d) return null;
    d.setDate(d.getDate() + n);
    return this.dateStr(d);
  },

  weekdayShort(dateStr) {
    const d = this.parseDate(dateStr);
    if (!d) return '';
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  },

  // Monday-based week start
  startOfWeek(dateStr) {
    const d = this.parseDate(dateStr);
    if (!d) return null;
    const shift = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
    d.setDate(d.getDate() - shift);
    return this.dateStr(d);
  },

  fmtDay(dateStr) {
    const d = this.parseDate(dateStr);
    if (!d) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
  },

  fmtDate(dateStr) {
    const d = this.parseDate(dateStr);
    if (!d) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  },

  fmtMinutes(min) {
    const m = Math.round(this.num(min));
    if (!m) return '0m';
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h}h ${r}m` : `${h}h`;
  },

  fmtClock(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0
      ? `${h}:${this.pad(m)}:${this.pad(sec)}`
      : `${this.pad(m)}:${this.pad(sec)}`;
  },

  num(v) {
    if (v === '' || v === null || v === undefined) return 0;
    const n = Number(v);
    return isFinite(n) ? n : 0;
  },

  clamp(n, a, b) { return Math.min(b, Math.max(a, n)); },

  pct(part, whole) { return whole > 0 ? Math.round((part / whole) * 100) : 0; },

  esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms || 250);
    };
  },

  isDistraction(category) {
    return (CONFIG.DISTRACTION_CATEGORIES || []).includes(category);
  },

  categoryColor(cat) { return CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other; },
  priorityColor(p) { return PRIORITY_COLORS[p] || PRIORITY_COLORS.low; },

  stars(rating) {
    const n = this.clamp(Math.round(this.num(rating)), 0, 5);
    let out = '';
    for (let i = 1; i <= 5; i++) {
      out += `<i class="fa-${i <= n ? 'solid' : 'regular'} fa-star ${i <= n ? 'star-on' : 'star-off'}"></i>`;
    }
    return out;
  },

  // localStorage-backed UI preferences ("personalos." prefix)
  pref(key, value) {
    const k = 'personalos.' + key;
    if (value === undefined) {
      try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; }
    }
    localStorage.setItem(k, JSON.stringify(value));
    return value;
  }
};

/* ---------------- DOM helpers ---------------- */

function qs(sel, root) { return (root || document).querySelector(sel); }
function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function icon(name, extra) {
  return `<i class="fa-solid fa-${name} ${extra || ''}" aria-hidden="true"></i>`;
}

function emptyState(iconName, title, subtitle, ctaHtml) {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon(iconName)}</div>
      <h3>${Utils.esc(title)}</h3>
      <p>${Utils.esc(subtitle || '')}</p>
      ${ctaHtml || ''}
    </div>`;
}

function chip(text, color) {
  return `<span class="chip" style="--chip-c:${color || 'var(--c-primary)'}">${Utils.esc(text)}</span>`;
}

/* ---------------- Toasts ---------------- */

function toast(message, type) {
  type = type || 'info';
  const root = qs('#toast-root');
  if (!root) return;
  const icons = { info: 'circle-info', success: 'circle-check', error: 'circle-exclamation', warn: 'triangle-exclamation' };
  const node = el(`
    <div class="toast toast-${type}">
      ${icon(icons[type] || 'circle-info')}
      <span>${Utils.esc(message)}</span>
    </div>`);
  root.appendChild(node);
  setTimeout(() => node.classList.add('show'), 10);
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 300);
  }, 4000);
}

/* ---------------- Modals ---------------- */

function openModal(opts) {
  const root = qs('#modal-root');
  const overlay = el(`
    <div class="modal-overlay">
      <div class="modal ${opts.wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>${opts.title || ''}</h3>
          <button class="btn btn-icon btn-ghost modal-close" title="Close">${icon('xmark')}</button>
        </div>
        <div class="modal-body">${opts.body || ''}</div>
        ${opts.footer ? `<div class="modal-foot">${opts.footer}</div>` : ''}
      </div>
    </div>`);
  root.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  function close() {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 200);
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  qs('.modal-close', overlay).addEventListener('click', close);
  if (!opts.sticky) overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });

  const first = qs('input, select, textarea, button.btn-primary', qs('.modal-body', overlay) || overlay);
  if (first) setTimeout(() => first.focus(), 120);
  return { overlay, close };
}

/* Confirm dialog — resolves true only when the user clicks confirm. */
function confirmDialog(opts) {
  return new Promise(resolve => {
    const m = openModal({
      title: opts.title || 'Are you sure?',
      sticky: true,
      body: `<p class="confirm-message">${opts.message || ''}</p>`,
      footer: `
        <button class="btn btn-ghost" data-act="cancel">${Utils.esc(opts.cancelText || 'Cancel')}</button>
        <button class="btn ${opts.danger === false ? 'btn-primary' : 'btn-danger'}" data-act="ok">
          ${Utils.esc(opts.confirmText || 'Delete')}
        </button>`
    });
    qs('[data-act="cancel"]', m.overlay).addEventListener('click', () => { m.close(); resolve(false); });
    qs('[data-act="ok"]', m.overlay).addEventListener('click', () => { m.close(); resolve(true); });
    m.overlay.addEventListener('modal:closed', () => resolve(false), { once: true });
  });
}

/* Dangerous-action dialog: the user must type the keyword (e.g. RESET) exactly. */
function typeConfirm(opts) {
  return new Promise(resolve => {
    const m = openModal({
      title: opts.title || 'WARNING',
      sticky: true,
      body: `
        <div class="danger-box">
          <div class="danger-title">${icon('triangle-exclamation')} ${Utils.esc(opts.warning || 'This action cannot be undone.')}</div>
          <p class="confirm-message">${opts.message || ''}</p>
        </div>
        <label class="field">
          <span>Type <strong>${Utils.esc(opts.keyword || 'RESET')}</strong> to continue</span>
          <input type="text" id="reset-typing" autocomplete="off" spellcheck="false" placeholder="${Utils.esc(opts.keyword || 'RESET')}">
        </label>`,
      footer: `
        <button class="btn btn-ghost" data-act="cancel">Cancel</button>
        <button class="btn btn-danger" data-act="ok" disabled>${Utils.esc(opts.confirmText || 'Reset now')}</button>`
    });
    const input = qs('#reset-typing', m.overlay);
    const okBtn = qs('[data-act="ok"]', m.overlay);
    input.addEventListener('input', () => { okBtn.disabled = input.value !== (opts.keyword || 'RESET'); });
    qs('[data-act="cancel"]', m.overlay).addEventListener('click', () => { m.close(); resolve(false); });
    okBtn.addEventListener('click', () => { m.close(); resolve(true); });
    m.overlay.addEventListener('modal:closed', () => resolve(false), { once: true });
  });
}

/* ---------------- Notifications + sound ---------------- */

/** Ask once for browser-notification permission. Resolves true if granted. */
async function askNotifyPermission() {
  if (!('Notification' in window)) { toast('This browser does not support notifications.', 'warn'); return false; }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') { toast('Notifications are blocked in browser settings.', 'warn'); return false; }
  const p = await Notification.requestPermission();
  if (p !== 'granted') { toast('Notification permission was not granted.', 'warn'); return false; }
  return true;
}

/** Fire a browser notification (silently no-op without permission). */
function notify(title, body) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification(title, { body: body || '', icon: 'assets/icons/icon-192.png', badge: 'assets/icons/icon-192.png', tag: 'personalos-' + Date.now() });
  } catch (e) { /* ignore */ }
}

/** Short pleasant beep through WebAudio (no audio files needed). */
function beep(times) {
  times = times || 2;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      o.connect(g); g.connect(ctx.destination);
      const t0 = ctx.currentTime + i * 0.35;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      o.start(t0); o.stop(t0 + 0.3);
    }
    setTimeout(() => { try { ctx.close(); } catch (e) { /* ignore */ } }, times * 350 + 600);
  } catch (e) { /* ignore */ }
}

// resolve promise when any modal is dismissed so confirmDialog never hangs
document.addEventListener('DOMContentLoaded', () => {
  const root = qs('#modal-root');
  if (!root) return;
  const mo = new MutationObserver(muts => {
    muts.forEach(m => m.removedNodes.forEach(n => {
      if (n.classList && n.classList.contains('modal-overlay')) {
        n.dispatchEvent(new CustomEvent('modal:closed'));
      }
    }));
  });
  mo.observe(root, { childList: true });
});
