'use strict';
/* ============ Dashboard ============ */
Views.dashboard = {
  title: 'Dashboard',

  async render(main) {
    const anyEnabled = SVCS.some(s => App.enabled(s));
    if (!anyEnabled) {
      main.innerHTML = `<div class="card"><div class="card-b empty">
        ${icon('settings')}
        <div style="margin-bottom:14px">${t('Keine Dienste aktiviert – füge deine Apps in den Einstellungen hinzu.')}</div>
        <button class="btn btn-p" onclick="location.hash='#/settings'">${t('Zu den Einstellungen')}</button>
      </div></div>`;
      return;
    }

    main.innerHTML = `
      <div class="kpi-grid" id="kpiRow"></div>
      <div class="grid g-cards" id="svcCards"></div>
      <div class="grid g-side" style="margin-top:16px">
        <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
          <div class="card" id="sabCard"></div>
          <div class="card" id="calCard"></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
          <div class="card" id="plexCard"></div>
          <div class="card" id="statsCard"></div>
          <div class="card" id="healthCard"></div>
          <div class="card" id="diskCard"></div>
        </div>
      </div>
      <div class="card" id="recentCard" style="margin-top:16px"></div>`;

    Views.dashboard.loadCore();
    Views.dashboard.sabCard();
    Views.dashboard.plexCard();
    Views.dashboard.calCard();
    Views.dashboard.healthCard();
    Views.dashboard.diskCard();
    Views.dashboard.recentCard();

    App.every(6000, () => { Views.dashboard.sabCard(true); Views.dashboard.plexCard(true); });
    App.every(45000, () => Views.dashboard.loadCore());
  },

  enabled(svc) { return App.enabled(svc); },

  /* ---------- Kern-Daten: KPIs + Dienstkarten + Statistiken ---------- */
  async loadCore() {
    const d = { series: null, movies: null, artists: null, authors: null, sabStats: null, sabQ: null, sessions: null, idxStats: null, badges: null };
    const jobs = [];
    if (this.enabled('sonarr')) jobs.push(API.get('sonarr', '/api/v3/series').then(x => d.series = x).catch(() => {}));
    if (this.enabled('radarr')) jobs.push(API.get('radarr', '/api/v3/movie').then(x => d.movies = x).catch(() => {}));
    if (this.enabled('lidarr')) jobs.push(API.get('lidarr', '/api/v1/artist').then(x => d.artists = x).catch(() => {}));
    if (this.enabled('readarr')) jobs.push(API.get('readarr', '/api/v1/author').then(x => d.authors = x).catch(() => {}));
    if (this.enabled('sabnzbd')) {
      jobs.push(API.sab('mode=server_stats').then(x => d.sabStats = x).catch(() => {}));
      jobs.push(API.sab('mode=queue&start=0&limit=1').then(x => d.sabQ = x.queue).catch(() => {}));
    }
    if (this.enabled('plex')) jobs.push(API.get('plex', '/status/sessions').then(x => d.sessions = (x.MediaContainer && x.MediaContainer.Metadata) || []).catch(() => {}));
    if (this.enabled('prowlarr')) jobs.push(API.get('prowlarr', '/api/v1/indexerstats').then(x => d.idxStats = x).catch(() => {}));
    if (this.enabled('bazarr')) jobs.push(API.get('bazarr', '/api/badges').then(x => d.badges = x).catch(() => {}));
    await Promise.allSettled(jobs);
    this.kpiRow(d);
    this.svcCards(d);
    this.statsCard(d);
  },

  sizeSum(list) {
    return (list || []).reduce((a, i) => a + ((i.statistics && i.statistics.sizeOnDisk) || i.sizeOnDisk || 0), 0);
  },

  kpiRow(d) {
    const el = document.getElementById('kpiRow');
    if (!el) return;
    const totalSize = this.sizeSum(d.series) + this.sizeSum(d.movies) + this.sizeSum(d.artists) + this.sizeSum(d.authors);
    const counts = [];
    if (d.series) counts.push(`${fmtNum(d.series.length)} ${t('Serien')}`);
    if (d.movies) counts.push(`${fmtNum(d.movies.length)} ${t('Filme')}`);
    if (d.artists) counts.push(`${fmtNum(d.artists.length)} ${t('Künstler')}`);
    if (d.authors) counts.push(`${fmtNum(d.authors.length)} ${t('Autoren')}`);
    const totalItems = (d.series || []).length + (d.movies || []).length + (d.artists || []).length + (d.authors || []).length;
    const tiles = [];
    if (totalSize > 0) tiles.push([icon('disk', 'k-ico'), fmtBytes(totalSize), t('Mediathek gesamt')]);
    if (totalItems > 0) tiles.push([icon('grid', 'k-ico'), fmtNum(totalItems), counts.join(' · ') || t('Titel gesamt')]);
    if (d.sabQ) tiles.push([icon('download', 'k-ico'),
      d.sabQ.paused ? t('Pausiert') : fmtBytes((Number(d.sabQ.kbpersec) || 0) * 1024) + '/s',
      tf('{0} Jobs', fmtNum(d.sabQ.noofslots || 0))]);
    if (d.sabStats) tiles.push([icon('zap', 'k-ico'), fmtBytes(d.sabStats.day || 0), t('Heute geladen')]);
    if (d.sessions) tiles.push([icon('play', 'k-ico'), fmtNum(d.sessions.length), t('Aktive Streams')]);
    el.innerHTML = tiles.map(x => `<div class="kpi">${x[0]}<b>${x[1]}</b><span>${x[2]}</span></div>`).join('');
  },

  /* ---------- Dienst-Karten (nur aktivierte) ---------- */
  async svcCards(d) {
    const el = document.getElementById('svcCards');
    if (!el) return;
    const active = SVCS.filter(s => this.enabled(s));

    const stats = {};
    const jobs = [];
    if (this.enabled('sonarr')) jobs.push((async () => {
      const [missing, queue] = await Promise.all([
        API.get('sonarr', '/api/v3/wanted/missing?page=1&pageSize=1'),
        API.get('sonarr', '/api/v3/queue?page=1&pageSize=1')
      ]);
      stats.sonarr = `<b>${fmtNum((d.series || []).length)}</b> ${t('Serien')} · <b>${fmtNum(missing.totalRecords)}</b> ${t('fehlend')} · <b>${fmtNum(queue.totalRecords)}</b> ${t('in Queue')}`;
    })().catch(() => {}));
    if (this.enabled('radarr')) jobs.push((async () => {
      const [missing, queue] = await Promise.all([
        API.get('radarr', '/api/v3/wanted/missing?page=1&pageSize=1'),
        API.get('radarr', '/api/v3/queue?page=1&pageSize=1')
      ]);
      stats.radarr = `<b>${fmtNum((d.movies || []).length)}</b> ${t('Filme')} · <b>${fmtNum(missing.totalRecords)}</b> ${t('fehlend')} · <b>${fmtNum(queue.totalRecords)}</b> ${t('in Queue')}`;
    })().catch(() => {}));
    if (this.enabled('lidarr')) jobs.push((async () => {
      const albums = (d.artists || []).reduce((a, x) => a + ((x.statistics && x.statistics.albumCount) || 0), 0);
      stats.lidarr = `<b>${fmtNum((d.artists || []).length)}</b> ${t('Künstler')} · <b>${fmtNum(albums)}</b> ${t('Alben')} · ${fmtBytes(this.sizeSum(d.artists))}`;
    })().catch(() => {}));
    if (this.enabled('readarr')) jobs.push((async () => {
      const books = (d.authors || []).reduce((a, x) => a + ((x.statistics && x.statistics.bookCount) || 0), 0);
      stats.readarr = `<b>${fmtNum((d.authors || []).length)}</b> ${t('Autoren')} · <b>${fmtNum(books)}</b> ${t('Bücher')}`;
    })().catch(() => {}));
    if (this.enabled('sabnzbd') && d.sabQ) {
      const q = d.sabQ;
      stats.sabnzbd = q.paused
        ? `<span style="color:var(--warn)">${t('Pausiert')}</span> · <b>${esc(q.sizeleft)}</b> ${t('übrig')}`
        : `<b>${fmtBytes((Number(q.kbpersec) || 0) * 1024)}/s</b> · <b>${fmtNum(q.noofslots)}</b> ${t('Jobs')} · ${esc(q.sizeleft)} ${t('übrig')}`;
    }
    if (this.enabled('plex')) jobs.push((async () => {
      const libs = await API.get('plex', '/library/sections');
      const l = (libs.MediaContainer && libs.MediaContainer.size) || 0;
      stats.plex = tf('{0} aktive Streams · {1} Bibliotheken', `<b>${(d.sessions || []).length}</b>`, `<b>${l}</b>`);
    })().catch(() => {}));
    if (this.enabled('prowlarr')) jobs.push((async () => {
      const idx = await API.get('prowlarr', '/api/v1/indexer');
      stats.prowlarr = tf('{0} von {1} Indexern aktiv', `<b>${idx.filter(i => i.enable).length}</b>`, `<b>${idx.length}</b>`);
    })().catch(() => {}));
    if (this.enabled('bazarr') && d.badges) {
      stats.bazarr = tf('{0} fehlende Untertitel', `<b>${fmtNum((d.badges.episodes || 0) + (d.badges.movies || 0))}</b>`);
    }
    await Promise.allSettled(jobs);

    el.innerHTML = active.map(svc => {
      const m = SVC_META[svc];
      const st = S.status[svc] || {};
      const badge = st.state === 'on' ? `<span class="badge b-ok">Online</span>`
        : st.state === 'off' ? '<span class="badge b-err">Offline</span>'
        : '<span class="badge b-mut">…</span>';
      return `<div class="card clickable" onclick="location.hash='#/${svc}'">
        <div class="card-b" style="display:flex;gap:13px;align-items:flex-start">
          <div class="svc-ico" style="background:color-mix(in srgb, ${m.color} 16%, transparent);color:${m.color}">${icon(m.icon)}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <b style="font-size:15px">${m.name}</b>${badge}
            </div>
            <div class="td-sub" style="margin-top:2px">${st.version ? 'v' + esc(st.version) : t(m.desc)}</div>
            <div style="margin-top:9px;font-size:12.5px;color:var(--txt2)">${stats[svc] || '–'}</div>
          </div>
          <button class="btn btn-ic btn-g" title="${t('Original-UI öffnen')}" onclick="event.stopPropagation();App.openSvc('${svc}')">${icon('external')}</button>
        </div></div>`;
    }).join('');
  },

  /* ---------- Statistik-Karte (Genres & Zahlen) ---------- */
  statsCard(d) {
    const el = document.getElementById('statsCard');
    if (!el) return;
    /* Top-Genres über alle Bibliotheken */
    const genres = new Map();
    [d.series, d.movies, d.artists].forEach(list => (list || []).forEach(i =>
      (i.genres || []).forEach(g => genres.set(g, (genres.get(g) || 0) + 1))));
    const top = [...genres.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const maxG = top.length ? top[0][1] : 1;
    const genreHtml = top.map(([g, n]) => `
      <div class="hbar">
        <span style="flex:0 0 110px;font-size:12.5px;color:var(--txt2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(g)}">${esc(g)}</span>
        <div class="prog" style="flex:1"><i style="width:${Math.round(n / maxG * 100)}%"></i></div>
        <span class="td-sub" style="flex:0 0 34px;text-align:right">${fmtNum(n)}</span>
      </div>`).join('');

    const kvs = [];
    if (d.idxStats && Array.isArray(d.idxStats.indexers)) {
      const grabs = d.idxStats.indexers.reduce((a, x) => a + (x.numberOfGrabs || 0), 0);
      const queries = d.idxStats.indexers.reduce((a, x) => a + (x.numberOfQueries || 0), 0);
      kvs.push([t('Prowlarr-Grabs'), fmtNum(grabs)]);
      kvs.push([t('Indexer-Anfragen'), fmtNum(queries)]);
    }
    if (d.sabStats) {
      kvs.push([t('Diesen Monat geladen'), fmtBytes(d.sabStats.month || 0)]);
      kvs.push([t('Insgesamt geladen'), fmtBytes(d.sabStats.total || 0)]);
    }
    if (d.badges) {
      kvs.push([t('Fehlende Untertitel'), fmtNum((d.badges.episodes || 0) + (d.badges.movies || 0))]);
    }

    if (!top.length && !kvs.length) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.innerHTML = `<div class="card-h"><h3>${t('Statistiken')}</h3></div>
      <div class="card-b">
        ${top.length ? `<div class="stat-lbl" style="margin-bottom:8px">${t('Top-Genres')}</div>${genreHtml}` : ''}
        ${kvs.length ? `<div style="margin-top:${top.length ? '14px' : '0'}">${kvs.map(k =>
          `<div class="kv"><span>${esc(k[0])}</span><b>${esc(k[1])}</b></div>`).join('')}</div>` : ''}
      </div>`;
  },

  /* ---------- SABnzbd Live ---------- */
  async sabCard(soft) {
    const el = document.getElementById('sabCard');
    if (!el) return;
    if (!this.enabled('sabnzbd')) { el.style.display = 'none'; return; }
    try {
      const q = (await API.sab('mode=queue&start=0&limit=6')).queue;
      S.sab = q;
      const kb = Number(q.kbpersec) || 0;
      S.speedHist.push(kb);
      if (S.speedHist.length > 80) S.speedHist.shift();
      const rows = (q.slots || []).map(s => `
        <div class="list-item">
          <div class="li-main">
            <b title="${esc(s.filename)}">${esc(s.filename)}</b>
            <span>${esc(s.cat)} · ${esc(s.sizeleft)} ${t('übrig')} · ${esc(s.timeleft)}</span>
          </div>
          <div style="width:110px;flex:0 0 110px"><div class="prog"><i style="width:${esc(s.percentage)}%"></i></div></div>
          <span class="td-sub" style="width:42px;text-align:right">${esc(s.percentage)}%</span>
        </div>`).join('');
      el.innerHTML = `
        <div class="card-h"><h3>${t('Downloads')}</h3><span class="sub">${tf('{0} Jobs', fmtNum(q.noofslots))} · ${tf('{0} übrig', esc(q.sizeleft || '0'))}</span>
          <span class="spacer"></span>
          <span class="stat-big" style="font-size:19px;color:${q.paused ? 'var(--warn)' : 'var(--acc2)'}">${q.paused ? t('Pausiert') : fmtBytes(kb * 1024) + '/s'}</span>
        </div>
        <div class="card-b" style="padding-top:10px">
          ${Views.dashboard.spark(S.speedHist)}
          ${rows || emptyBox('inbox', t('Warteschlange ist leer'))}
          <div style="margin-top:10px;text-align:right"><a href="#/sabnzbd" class="btn btn-sm btn-g">${t('Alle anzeigen')} ${icon('chevr')}</a></div>
        </div>`;
    } catch (e) {
      if (!soft) el.innerHTML = `<div class="card-h"><h3>${t('Downloads')}</h3></div><div class="card-b">${errBox(e.message)}</div>`;
    }
  },

  spark(arr) {
    const w = 300, ht = 50;
    const max = Math.max(...arr, 1);
    const pts = arr.map((v, i) => `${(i / Math.max(arr.length - 1, 1)) * w},${ht - (v / max) * (ht - 4)}`).join(' ');
    const last = arr.length ? `${w},${ht}` : '';
    const first = arr.length ? `0,${ht}` : '';
    return `<svg class="spark" viewBox="0 0 ${w} ${ht + 2}" preserveAspectRatio="none">
      <polygon points="${first} ${pts} ${last}" fill="rgba(99,102,241,.16)"/>
      <polyline points="${pts}" fill="none" stroke="var(--acc2)" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
    </svg>`;
  },

  /* ---------- Plex Streams ---------- */
  async plexCard(soft) {
    const el = document.getElementById('plexCard');
    if (!el) return;
    if (!this.enabled('plex')) { el.style.display = 'none'; return; }
    try {
      const j = await API.get('plex', '/status/sessions');
      const sess = (j.MediaContainer && j.MediaContainer.Metadata) || [];
      const rows = sess.map(s => {
        const title = s.grandparentTitle ? `${s.grandparentTitle} – ${s.title}` : s.title;
        const user = (s.User && s.User.title) || '?';
        const player = s.Player || {};
        const trans = s.TranscodeSession;
        const pct = s.duration ? Math.round((s.viewOffset || 0) / s.duration * 100) : 0;
        return `<div class="list-item">
          <div class="svc-ico" style="background:rgba(229,160,13,.14);color:var(--plex)">${icon(player.state === 'paused' ? 'pause' : 'play')}</div>
          <div class="li-main">
            <b title="${esc(title)}">${esc(title)}</b>
            <span>${esc(user)} · ${esc(player.product || '')} · ${trans ? '<span style="color:var(--warn)">Transcode</span>' : 'Direct Play'}</span>
            <div class="prog" style="margin-top:6px"><i style="width:${pct}%"></i></div>
          </div>
        </div>`;
      }).join('');
      el.innerHTML = `<div class="card-h"><h3>${t('Gerade läuft')}</h3><span class="sub">${sess.length} Stream${sess.length === 1 ? '' : 's'}</span></div>
        <div class="card-b" style="padding-top:6px">${rows || emptyBox('play', t('Niemand schaut gerade'))}</div>`;
    } catch (e) {
      if (!soft) el.innerHTML = `<div class="card-h"><h3>${t('Gerade läuft')}</h3></div><div class="card-b">${errBox(e.message)}</div>`;
    }
  },

  /* ---------- Kalender (alle Bibliotheks-Dienste) ---------- */
  async calCard() {
    const el = document.getElementById('calCard');
    if (!el) return;
    el.innerHTML = `<div class="card-h"><h3>${t('Demnächst')}</h3><span class="sub">${t('nächste 7 Tage')}</span></div><div class="card-b">${spinner()}</div>`;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 8 * 86400000);
    const range = `start=${start.toISOString()}&end=${end.toISOString()}`;
    const items = [];
    const jobs = [];
    if (this.enabled('sonarr')) jobs.push(API.get('sonarr', `/api/v3/calendar?${range}&includeSeries=true`)
      .then(eps => eps.forEach(e => items.push({
        date: e.airDateUtc, svc: 'sonarr', has: e.hasFile,
        label: `${(e.series && e.series.title) || '?'} · S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}`,
        sub: e.title || ''
      }))).catch(() => {}));
    if (this.enabled('radarr')) jobs.push(API.get('radarr', `/api/v3/calendar?${range}`)
      .then(ms => ms.forEach(m => {
        [['Kino', m.inCinemas], ['Digital', m.digitalRelease], ['Disc', m.physicalRelease]]
          .filter(x => x[1] && new Date(x[1]) >= start && new Date(x[1]) < end)
          .forEach(dd => items.push({ date: dd[1], svc: 'radarr', has: m.hasFile, label: `${m.title} (${m.year})`, sub: tf('{0}-Release', t(dd[0])) }));
      })).catch(() => {}));
    if (this.enabled('lidarr')) jobs.push(API.get('lidarr', `/api/v1/calendar?${range}&includeArtist=true`)
      .then(as => as.forEach(a => items.push({
        date: a.releaseDate, svc: 'lidarr', has: null,
        label: `${(a.artist && a.artist.artistName) || '?'} – ${a.title}`, sub: t('Album')
      }))).catch(() => {}));
    if (this.enabled('readarr')) jobs.push(API.get('readarr', `/api/v1/calendar?${range}&includeAuthor=true`)
      .then(bs => bs.forEach(b => items.push({
        date: b.releaseDate, svc: 'readarr', has: null,
        label: `${(b.author && b.author.authorName) || '?'} – ${b.title}`, sub: t('Buch')
      }))).catch(() => {}));
    await Promise.allSettled(jobs);
    items.sort((a, b) => new Date(a.date) - new Date(b.date));

    let html = '', lastDay = '';
    items.forEach(it => {
      const dl = dayLabel(it.date);
      if (dl !== lastDay) { html += `<div class="day-h">${icon('calendar')} ${dl}</div>`; lastDay = dl; }
      html += `<div class="list-item" style="padding:7px 4px">
        <i class="dot" style="background:${SVC_META[it.svc].color}"></i>
        <div class="li-main"><b>${esc(it.label)}</b><span>${esc(it.sub)}</span></div>
        ${it.has === true ? `<span class="badge b-ok">${t('Vorhanden')}</span>` : ''}
      </div>`;
    });
    el.innerHTML = `<div class="card-h"><h3>${t('Demnächst')}</h3><span class="sub">${t('nächste 7 Tage')}</span></div>
      <div class="card-b" style="padding-top:10px">${html || emptyBox('calendar', t('Keine anstehenden Veröffentlichungen'))}</div>`;
  },

  /* ---------- Health ---------- */
  async healthCard() {
    const el = document.getElementById('healthCard');
    if (!el) return;
    const issues = [];
    const jobs = [];
    const pull = (svc, path) => API.get(svc, path).then(a => a.forEach(x =>
      issues.push({ svc, type: x.type, msg: x.message }))).catch(() => {});
    if (this.enabled('sonarr')) jobs.push(pull('sonarr', '/api/v3/health'));
    if (this.enabled('radarr')) jobs.push(pull('radarr', '/api/v3/health'));
    if (this.enabled('lidarr')) jobs.push(pull('lidarr', '/api/v1/health'));
    if (this.enabled('readarr')) jobs.push(pull('readarr', '/api/v1/health'));
    if (this.enabled('prowlarr')) jobs.push(pull('prowlarr', '/api/v1/health'));
    await Promise.allSettled(jobs);
    const rows = issues.map(i => `<div class="list-item" style="padding:8px 4px">
      <span style="color:${i.type === 'error' ? 'var(--err)' : 'var(--warn)'};flex:0 0 16px">${icon('warning')}</span>
      <div class="li-main" style="white-space:normal"><b style="white-space:normal">${esc(i.msg)}</b><span>${SVC_META[i.svc].name}</span></div>
    </div>`).join('');
    el.innerHTML = `<div class="card-h"><h3>${t('Systemzustand')}</h3>${issues.length ? `<span class="badge b-warn">${issues.length}</span>` : '<span class="badge b-ok">OK</span>'}</div>
      <div class="card-b" style="padding-top:6px">${rows || `<div class="empty" style="padding:18px">${icon('check')}<div>${t('Alles in Ordnung')}</div></div>`}</div>`;
  },

  /* ---------- Speicherplatz ---------- */
  async diskCard() {
    const el = document.getElementById('diskCard');
    if (!el) return;
    const disks = new Map();
    const jobs = [];
    const pull = (svc, api) => API.get(svc, api + '/diskspace').then(a => a.forEach(d => disks.set(d.path, d))).catch(() => {});
    if (this.enabled('sonarr')) jobs.push(pull('sonarr', '/api/v3'));
    if (this.enabled('radarr')) jobs.push(pull('radarr', '/api/v3'));
    if (this.enabled('lidarr')) jobs.push(pull('lidarr', '/api/v1'));
    if (this.enabled('readarr')) jobs.push(pull('readarr', '/api/v1'));
    await Promise.allSettled(jobs);
    const rows = [...disks.values()].filter(d => d.totalSpace > 0).map(d => {
      const used = d.totalSpace - d.freeSpace;
      const pct = Math.round(used / d.totalSpace * 100);
      return `<div style="padding:8px 0">
        <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px">
          <span class="mono">${esc(d.path)}</span><span style="color:var(--txt3)">${tf('{0} frei', fmtBytes(d.freeSpace))}</span>
        </div>
        <div class="prog ${pct > 92 ? '' : pct > 80 ? 'p-warn' : 'p-ok'}"><i style="width:${pct}%"></i></div>
      </div>`;
    }).join('');
    if (!rows) { el.style.display = 'none'; return; }
    el.innerHTML = `<div class="card-h"><h3>${t('Speicherplatz')}</h3></div>
      <div class="card-b" style="padding-top:8px">${rows}</div>`;
  },

  /* ---------- Kürzlich hinzugefügt (Plex) ---------- */
  async recentCard() {
    const el = document.getElementById('recentCard');
    if (!el) return;
    if (!this.enabled('plex')) { el.style.display = 'none'; return; }
    try {
      const j = await API.get('plex', '/library/recentlyAdded?X-Plex-Container-Start=0&X-Plex-Container-Size=14');
      const items = (j.MediaContainer && j.MediaContainer.Metadata) || [];
      const cards = items.map(m => {
        const title = m.grandparentTitle || m.parentTitle || m.title;
        const sub = m.type === 'season' ? m.title : (m.type === 'episode' ? m.title : (m.year || ''));
        const thumb = m.grandparentThumb || m.parentThumb || m.thumb;
        const src = thumb ? `/proxy/plex/photo/:/transcode?width=240&height=360&minSize=1&upscale=1&url=${encodeURIComponent(thumb)}` : '';
        return `<div class="poster" title="${esc(title)}">
          <div class="p-fall">${esc(title)}</div>
          ${src ? `<img loading="lazy" src="${esc(src)}" onerror="this.remove()">` : ''}
          <div class="p-grad"></div>
          <div class="p-info"><b>${esc(title)}</b><span>${esc(String(sub))} · ${relTime(m.addedAt * 1000)}</span></div>
        </div>`;
      }).join('');
      el.innerHTML = `<div class="card-h"><h3>${t('Kürzlich hinzugefügt')}</h3><span class="sub">Plex</span></div>
        <div class="card-b"><div class="pgrid" style="grid-template-columns:repeat(auto-fill,minmax(118px,1fr))">${cards || emptyBox('inbox', t('Nichts Neues'))}</div></div>`;
    } catch (e) {
      el.innerHTML = `<div class="card-h"><h3>${t('Kürzlich hinzugefügt')}</h3></div><div class="card-b">${errBox(e.message)}</div>`;
    }
  }
};
