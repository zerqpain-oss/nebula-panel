'use strict';
/* ============ Nebula Panel – App-Kern ============ */

const Views = {};
const S = { cfg: null, status: {}, name: 'Nebula', speedHist: [], sab: null, plexSessions: null };

const SVC_META = {
  sonarr:   { name: 'Sonarr',   icon: 'tv',       color: 'var(--sonarr)',   desc: 'Serien' },
  radarr:   { name: 'Radarr',   icon: 'film',     color: 'var(--radarr)',   desc: 'Filme' },
  lidarr:   { name: 'Lidarr',   icon: 'music',    color: 'var(--lidarr)',   desc: 'Musik' },
  readarr:  { name: 'Readarr',  icon: 'book',     color: 'var(--readarr)',  desc: 'Bücher' },
  sabnzbd:  { name: 'SABnzbd',  icon: 'download', color: 'var(--sabnzbd)',  desc: 'Downloads' },
  plex:     { name: 'Plex',     icon: 'play',     color: 'var(--plex)',     desc: 'Streaming' },
  prowlarr: { name: 'Prowlarr', icon: 'search',   color: 'var(--prowlarr)', desc: 'Indexer' },
  bazarr:   { name: 'Bazarr',   icon: 'captions', color: 'var(--bazarr)',   desc: 'Untertitel' }
};
const SVCS = Object.keys(SVC_META);

/* ---------- Icons (Stroke-SVG) ---------- */
const ICONS = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  tv: 'M2 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM17 2l-5 4-5-4',
  film: 'M4.5 4h15a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM7.5 4v16M16.5 4v16M2.5 9h5M2.5 15h5M16.5 9h5M16.5 15h5',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  play: 'M7 4.5v15L20 12z',
  search: 'M11 11m-7 0a7 7 0 1 0 14 0 7 7 0 1 0-14 0M21 21l-4.5-4.5',
  settings: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  plus: 'M12 5v14M5 12h14',
  trash: 'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15',
  pause: 'M9 4v16M15 4v16',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18M6 6l12 12',
  warning: 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3',
  calendar: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18',
  clock: 'M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0M12 7v5l3 2',
  bookmark: 'M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
  edit: 'M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z',
  chevd: 'M6 9l6 6 6-6',
  chevr: 'M9 6l6 6-6 6',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  disk: 'M5.5 5h13l3.5 7v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5zM2 12h20M6 16h.01M10 16h.01',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  folder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  lock: 'M5 11h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM8 11V7a4 4 0 0 1 8 0v4',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9z',
  arrup: 'M12 19V5M5 12l7-7 7 7',
  arrdown: 'M12 5v14M19 12l-7 7-7-7',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 7m-4 0a4 4 0 1 0 8 0 4 4 0 1 0-8 0',
  server: 'M4 2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM4 14h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2zM6 6h.01M6 18h.01',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13l3.5 7v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5z',
  eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7zM12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  info: 'M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0M12 8h.01M12 12v4',
  music: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5z',
  captions: 'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM6 11h4M6 15h8M13 11h5M17 15h1'
};
function icon(n, cls) {
  return `<svg class="${cls || ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;vertical-align:-2px"><path d="${ICONS[n] || ''}"/></svg>`;
}

/* ---------- DOM- & Format-Helfer ---------- */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
function on(root, ev, sel, fn) {
  root.addEventListener(ev, e => {
    const t = e.target.closest(sel);
    if (t && root.contains(t)) fn(e, t);
  });
}
function fmtBytes(n) {
  n = Number(n) || 0;
  const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i === 0 ? n : n.toFixed(n >= 100 ? 0 : 1)) + ' ' + u[i];
}
function fmtNum(n) { return Number(n || 0).toLocaleString(LOCALE); }
function relTime(d) {
  const ts = new Date(d).getTime();
  if (!ts) return '–';
  let diff = (Date.now() - ts) / 1000;
  const fut = diff < 0;
  diff = Math.abs(diff);
  let s;
  if (diff < 60) s = t('wenigen Sek.');
  else if (diff < 3600) s = tf('{0} Min.', Math.round(diff / 60));
  else if (diff < 86400) s = tf('{0} Std.', Math.round(diff / 3600));
  else if (diff < 86400 * 30) s = tf('{0} Tagen', Math.round(diff / 86400));
  else return new Date(d).toLocaleDateString(LOCALE);
  return fut ? tf('in {0}', s) : tf('vor {0}', s);
}
function dayLabel(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((x - today) / 86400000);
  if (diff === 0) return t('Heute');
  if (diff === 1) return t('Morgen');
  if (diff === -1) return t('Gestern');
  return x.toLocaleDateString(LOCALE, { weekday: 'long', day: '2-digit', month: '2-digit' });
}
function timeHM(d) {
  return new Date(d).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
}
const spinner = () => '<div class="spinner"></div>';
function errBox(msg) {
  return `<div class="err-box">${icon('warning')}<span class="wrapline">${esc(msg)}</span></div>`;
}
function emptyBox(ic, msg) {
  return `<div class="empty">${icon(ic)}<div>${esc(msg)}</div></div>`;
}

/* ---------- App ---------- */
const App = {
  _viewTimers: [],
  _globalTimers: [],
  _hooked: false,

  async init() {
    let st = null;
    try { st = await API.panelGet('authstate'); } catch (e) {}
    const app = document.getElementById('app');
    if (!st) {
      app.innerHTML = `<div class="login-wrap"><div class="login-card"><div class="logo-orb"></div><h2>${t('Server nicht erreichbar')}</h2><p>${t('Bitte Seite neu laden.')}</p></div></div>`;
      return;
    }
    S.name = st.name || 'Nebula';
    document.title = S.name + ' · Media Control';
    if (st.needsSetup) return App.authScreen(true);
    if (!st.authed) return App.authScreen(false);
    App.start();
  },

  authScreen(setup) {
    App.stopAllTimers();
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="login-wrap"><div class="login-card">
        <div class="logo-orb"></div>
        <h2>${esc(S.name)}</h2>
        <p>${setup ? t('Willkommen! Lege ein Passwort für dein Panel fest.') : 'Media Control Center'}</p>
        <form id="loginForm">
          <input class="inp" type="password" id="pw" placeholder="${setup ? t('Neues Passwort (min. 6 Zeichen)') : t('Passwort')}" autofocus autocomplete="${setup ? 'new-password' : 'current-password'}">
          ${setup ? `<input class="inp" type="password" id="pw2" placeholder="${t('Passwort wiederholen')}">` : ''}
          <button class="btn btn-p" type="submit">${setup ? t('Einrichten') : t('Anmelden')}</button>
        </form>
        <div class="login-err" id="loginErr"></div>
        <div style="margin-top:16px;display:flex;gap:6px;justify-content:center">
          <button class="btn btn-sm ${LANG === 'de' ? '' : 'btn-g'}" onclick="setLang('de')">DE</button>
          <button class="btn btn-sm ${LANG === 'en' ? '' : 'btn-g'}" onclick="setLang('en')">EN</button>
        </div>
      </div></div>`;
    document.getElementById('loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      const err = document.getElementById('loginErr');
      const pw = document.getElementById('pw').value;
      err.textContent = '';
      try {
        if (setup) {
          if (pw !== document.getElementById('pw2').value) { err.textContent = t('Passwörter stimmen nicht überein'); return; }
          await API.panelPost('setup', { password: pw });
        } else {
          await API.panelPost('login', { password: pw });
        }
        App.start();
      } catch (ex) { err.textContent = ex.message; }
    });
  },

  onUnauthed() {
    if (document.getElementById('loginForm')) return;
    App.authScreen(false);
  },

  async start() {
    try { S.cfg = await API.panelGet('config'); }
    catch (e) { return App.authScreen(false); }
    App.renderShell();
    if (!App._hooked) {
      window.addEventListener('hashchange', () => App.route());
      App._hooked = true;
    }
    App.route();
    App.statusCheck();
    App.chipPoll();
    App.everyGlobal(30000, () => App.statusCheck());
    App.everyGlobal(8000, () => App.chipPoll());
    /* Update-Hinweis (einmal pro Sitzung) */
    if (!App._verChecked) {
      App._verChecked = true;
      API.panelGet('version').then(v => {
        S.version = v;
        if (v.updateAvailable) App.toast(tf('Update verfügbar: {0} → {1}', v.current, v.latest), 'info');
      }).catch(() => {});
    }
  },

  enabled(svc) {
    const c = S.cfg && S.cfg.services[svc];
    return !!(c && c.enabled && c.url && c.apiKey);
  },

  renderShell() {
    const app = document.getElementById('app');
    const active = SVCS.filter(k => App.enabled(k));
    const navSvc = active.map(k => {
      const m = SVC_META[k];
      return `<div class="nav-item" data-nav="${k}" style="--c:${m.color}">${icon(m.icon)}<span>${m.name}</span><i class="dot" id="dot-${k}"></i></div>`;
    }).join('');
    app.innerHTML = `
      <div class="shell">
        <aside class="sidebar">
          <div class="logo"><div class="logo-orb"></div><div class="logo-txt"><b>${esc(S.name)}</b><span>Media Control</span></div></div>
          <nav id="nav">
            <div class="nav-item" data-nav="dashboard">${icon('grid')}<span>Dashboard</span></div>
            ${active.length ? `<div class="nav-sep">${t('Dienste')}</div>` : ''}
            ${navSvc}
            <div class="nav-sep">${t('System')}</div>
            <div class="nav-item" data-nav="logs">${icon('list')}<span>${t('Protokolle')}</span></div>
            <div class="nav-item" data-nav="settings">${icon('settings')}<span>${t('Einstellungen')}</span></div>
          </nav>
          <div class="side-foot">
            <div class="nav-item" id="btnLogout">${icon('logout')}<span>${t('Abmelden')}</span></div>
          </div>
        </aside>
        <div class="mainwrap">
          <header class="topbar">
            <h1 id="pageTitle"></h1>
            <input class="inp top-search" id="globalSearch" placeholder="${t('Überall suchen…')}">
            <div class="top-chips" id="topChips"></div>
          </header>
          <main id="main"></main>
        </div>
      </div>`;
    on(app, 'click', '.nav-item[data-nav]', (e, el) => { location.hash = '#/' + el.dataset.nav; });
    document.getElementById('btnLogout').addEventListener('click', async () => {
      try { await API.panelPost('logout', {}); } catch (e) {}
      App.authScreen(false);
    });
    document.getElementById('globalSearch').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const q = e.target.value.trim();
      if (!q) return;
      Views.search.setQuery(q);
      if (location.hash === '#/search') App.route();
      else location.hash = '#/search';
    });
  },

  route() {
    App.clearViewTimers();
    let name = (location.hash || '#/dashboard').replace(/^#\//, '') || 'dashboard';
    if (!Views[name]) name = 'dashboard';
    document.querySelectorAll('.nav-item[data-nav]').forEach(el =>
      el.classList.toggle('active', el.dataset.nav === name));
    const v = Views[name];
    document.getElementById('pageTitle').textContent = typeof v.title === 'function' ? v.title() : v.title;
    const main = document.getElementById('main');
    main.innerHTML = spinner();
    Promise.resolve()
      .then(() => v.render(main))
      .catch(e => { main.innerHTML = errBox(e.message); console.error(e); });
  },

  /* Dienst aktiviert? Sonst Hinweis rendern. */
  svcGuard(svc, el) {
    const s = S.cfg && S.cfg.services[svc];
    if (s && s.enabled && s.url && s.apiKey) return true;
    el.innerHTML = `<div class="card"><div class="card-b empty">
      ${icon('settings')}
      <div style="margin-bottom:14px">${tf('{0} ist noch nicht konfiguriert.', SVC_META[svc].name)}</div>
      <button class="btn btn-p" onclick="location.hash='#/settings'">${t('Zu den Einstellungen')}</button>
    </div></div>`;
    return false;
  },

  /* ---------- Status-Polling ---------- */
  async statusCheck() {
    const jobs = SVCS.map(async svc => {
      const c = S.cfg.services[svc];
      if (!c || !c.enabled) { S.status[svc] = { state: 'na' }; return; }
      try {
        let version = '';
        if (svc === 'sonarr' || svc === 'radarr') version = (await API.get(svc, '/api/v3/system/status')).version;
        else if (svc === 'prowlarr' || svc === 'lidarr' || svc === 'readarr') version = (await API.get(svc, '/api/v1/system/status')).version;
        else if (svc === 'bazarr') {
          const j = await API.get('bazarr', '/api/system/status');
          version = (j.data && j.data.bazarr_version) || '';
        }
        else if (svc === 'sabnzbd') version = (await API.sab('mode=version')).version;
        else if (svc === 'plex') {
          const j = await API.get('plex', '/identity');
          version = (j.MediaContainer && j.MediaContainer.version || '').split('-')[0];
        }
        S.status[svc] = { state: 'on', version };
      } catch (e) {
        S.status[svc] = { state: 'off', error: e.message };
      }
    });
    await Promise.allSettled(jobs);
    SVCS.forEach(svc => {
      const d = document.getElementById('dot-' + svc);
      if (!d) return;
      const st = (S.status[svc] || {}).state;
      d.className = 'dot' + (st === 'on' ? ' on' : st === 'off' ? ' off' : '');
    });
  },

  /* Leichtes Polling für Topbar-Chips (SAB-Speed, Plex-Streams) */
  async chipPoll() {
    const c = S.cfg;
    if (!c) return;
    if (c.services.sabnzbd && c.services.sabnzbd.enabled) {
      try {
        const q = (await API.sab('mode=queue&start=0&limit=1')).queue;
        S.sab = q;
        S.speedHist.push(Number(q.kbpersec) || 0);
        if (S.speedHist.length > 80) S.speedHist.shift();
      } catch (e) { S.sab = null; }
    }
    if (c.services.plex && c.services.plex.enabled) {
      try {
        const j = await API.get('plex', '/status/sessions');
        S.plexSessions = (j.MediaContainer && j.MediaContainer.Metadata) || [];
      } catch (e) { S.plexSessions = null; }
    }
    const el = document.getElementById('topChips');
    if (!el) return;
    let html = '';
    if (S.sab) {
      const kb = Number(S.sab.kbpersec) || 0;
      html += `<span class="chip clickable hide-m" onclick="location.hash='#/sabnzbd'" style="color:${S.sab.paused ? 'var(--warn)' : ''}">
        ${icon(S.sab.paused ? 'pause' : 'download')} ${S.sab.paused ? t('Pausiert') : `<b>${fmtBytes(kb * 1024)}/s</b>`}</span>`;
    }
    if (S.plexSessions) {
      html += `<span class="chip clickable hide-m" onclick="location.hash='#/plex'">${icon('play')} <b>${S.plexSessions.length}</b>&nbsp;Stream${S.plexSessions.length === 1 ? '' : 's'}</span>`;
    }
    html += `<button class="btn btn-ic btn-g" title="${t('Ansicht neu laden')}" onclick="App.route()">${icon('refresh')}</button>`;
    el.innerHTML = html;
  },

  /* ---------- Timer ---------- */
  every(ms, fn) { App._viewTimers.push(setInterval(fn, ms)); },
  everyGlobal(ms, fn) { App._globalTimers.push(setInterval(fn, ms)); },
  clearViewTimers() { App._viewTimers.forEach(clearInterval); App._viewTimers = []; },
  stopAllTimers() {
    App.clearViewTimers();
    App._globalTimers.forEach(clearInterval);
    App._globalTimers = [];
  },

  /* ---------- Toast ---------- */
  toast(msg, type) {
    const el = h(`<div class="toast t-${type || 'info'}">${icon(type === 'ok' ? 'check' : type === 'err' ? 'warning' : 'info')}<span class="wrapline">${esc(msg)}</span></div>`);
    document.getElementById('toasts').append(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 3800);
    setTimeout(() => el.remove(), 4300);
  },

  /* ---------- Modal ---------- */
  modal({ title, body, foot, wide, onClose }) {
    const ov = h(`<div class="modal-ov"><div class="modal ${wide ? 'modal-wide' : ''}">
      <div class="modal-h"><h3>${esc(title)}</h3><button class="btn btn-ic btn-g m-x">${icon('x')}</button></div>
      <div class="modal-b"></div><div class="modal-f"></div></div></div>`);
    const bodyEl = ov.querySelector('.modal-b');
    const footEl = ov.querySelector('.modal-f');
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body) bodyEl.append(body);
    (foot || []).forEach(b => footEl.append(b));
    if (!foot || !foot.length) footEl.style.display = 'none';
    const close = () => { ov.remove(); if (onClose) onClose(); };
    ov.querySelector('.m-x').addEventListener('click', close);
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    document.getElementById('modals').append(ov);
    return { ov, bodyEl, footEl, close };
  },

  confirm({ title, msg, okLabel, danger, checks }) {
    return new Promise(resolve => {
      const body = h(`<div><p style="color:var(--txt2)">${esc(msg)}</p>
        ${(checks || []).map(c => `<label style="display:flex;align-items:center;gap:10px;margin-top:14px;cursor:pointer">
          <span class="switch"><input type="checkbox" data-chk="${c.id}" ${c.checked ? 'checked' : ''}><i></i></span>
          <span class="lbl">${esc(c.label)}</span></label>`).join('')}</div>`);
      const bCancel = h(`<button class="btn">${t('Abbrechen')}</button>`);
      const bOk = h(`<button class="btn ${danger ? 'btn-d' : 'btn-p'}">${esc(okLabel || 'OK')}</button>`);
      const m = App.modal({ title, body, foot: [bCancel, bOk], onClose: () => resolve(null) });
      bCancel.addEventListener('click', () => m.close());
      bOk.addEventListener('click', () => {
        const out = {};
        body.querySelectorAll('[data-chk]').forEach(i => out[i.dataset.chk] = i.checked);
        resolve(out);
        m.ov.remove();
      });
    });
  },

  /* ---------- Generischer Editor für *arr fields[] ---------- */
  fieldsEditor(fields) {
    const wrap = h('<div class="fields"></div>');
    let hasAdv = false;
    fields.forEach((f, i) => {
      if (f.type === 'hidden' || f.hidden === 'hidden' || f.hidden === true) return;
      const v = (f.value === undefined || f.value === null) ? '' : f.value;
      let ctrl = '';
      if (f.type === 'checkbox') {
        ctrl = `<label class="switch"><input type="checkbox" data-fi="${i}" ${f.value ? 'checked' : ''}><i></i></label>`;
      } else if (f.type === 'select' && Array.isArray(f.selectOptions)) {
        ctrl = `<select class="sel" data-fi="${i}">${f.selectOptions.map(o =>
          `<option value="${esc(o.value)}" ${String(o.value) === String(f.value) ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>`;
      } else if (f.type === 'number') {
        ctrl = `<input class="inp" type="number" step="any" data-fi="${i}" value="${esc(String(v))}">`;
      } else if (f.type === 'password') {
        ctrl = `<input class="inp" type="password" data-fi="${i}" value="${esc(String(v))}" autocomplete="new-password">`;
      } else if (f.type === 'info') {
        wrap.append(h(`<p class="hint" style="padding:6px 0">${esc(f.label || f.name)}${v !== '' ? ': ' + esc(String(v)) : ''}</p>`));
        return;
      } else {
        ctrl = `<input class="inp" data-fi="${i}" value="${esc(Array.isArray(v) ? v.join(', ') : String(v))}">`;
      }
      if (f.advanced) hasAdv = true;
      wrap.append(h(`<div class="frow ${f.advanced ? 'f-adv' : ''}">
        <label class="lbl">${esc(f.label || f.name)}</label>
        <div>${ctrl}${f.helpText ? `<div class="hint">${esc(f.helpText)}</div>` : ''}</div></div>`));
    });
    if (hasAdv) {
      const btn = h(`<button class="btn btn-sm btn-g" style="margin-top:10px">${icon('chevd')} ${t('Erweiterte Optionen')}</button>`);
      btn.addEventListener('click', () => wrap.classList.toggle('show-adv'));
      wrap.append(btn);
    }
    const collect = () => {
      wrap.querySelectorAll('[data-fi]').forEach(inp => {
        const f = fields[+inp.dataset.fi];
        if (f.type === 'checkbox') f.value = inp.checked;
        else if (f.type === 'number') f.value = inp.value === '' ? null : Number(inp.value);
        else if (Array.isArray(f.value)) f.value = inp.value ? inp.value.split(',').map(s => s.trim()).filter(Boolean) : [];
        else f.value = inp.value;
      });
      return fields;
    };
    return { el: wrap, collect };
  },

  /* ---------- Generisches Formular für Config-Objekte ---------- */
  objForm(obj, labels, skip) {
    skip = skip || ['id'];
    const wrap = h('<div></div>');
    const keys = Object.keys(obj).filter(k => !skip.includes(k) && (typeof obj[k] !== 'object' || obj[k] === null));
    keys.forEach(k => {
      const v = obj[k];
      const pretty = k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
      const label = LANG === 'de' ? ((labels && labels[k]) || pretty) : pretty;
      let ctrl;
      if (typeof v === 'boolean') {
        ctrl = `<label class="switch"><input type="checkbox" data-ok="${esc(k)}" ${v ? 'checked' : ''}><i></i></label>`;
      } else if (typeof v === 'number') {
        ctrl = `<input class="inp" type="number" step="any" data-ok="${esc(k)}" value="${esc(String(v))}">`;
      } else {
        ctrl = `<input class="inp" data-ok="${esc(k)}" value="${esc(v === null ? '' : String(v))}">`;
      }
      wrap.append(h(`<div class="frow"><label class="lbl">${esc(label)}</label><div>${ctrl}</div></div>`));
    });
    const collect = () => {
      wrap.querySelectorAll('[data-ok]').forEach(inp => {
        const k = inp.dataset.ok;
        if (typeof obj[k] === 'boolean') obj[k] = inp.checked;
        else if (typeof obj[k] === 'number') obj[k] = inp.value === '' ? 0 : Number(inp.value);
        else obj[k] = inp.value;
      });
      return obj;
    };
    return { el: wrap, collect };
  },

  openSvc(svc) {
    const c = S.cfg.services[svc];
    if (c && c.url) window.open(c.url, '_blank');
  }
};
