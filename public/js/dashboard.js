'use strict';
/* ============ Dashboard ============ */
Views.dashboard = {
  title: 'Dashboard',

  async render(main) {
    main.innerHTML = `
      <div class="grid g-cards" id="svcCards"></div>
      <div class="grid g-side" style="margin-top:16px">
        <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
          <div class="card" id="sabCard"></div>
          <div class="card" id="calCard"></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
          <div class="card" id="plexCard"></div>
          <div class="card" id="healthCard"></div>
          <div class="card" id="diskCard"></div>
        </div>
      </div>
      <div class="card" id="recentCard" style="margin-top:16px"></div>`;

    Views.dashboard.svcCards();
    Views.dashboard.sabCard();
    Views.dashboard.plexCard();
    Views.dashboard.calCard();
    Views.dashboard.healthCard();
    Views.dashboard.diskCard();
    Views.dashboard.recentCard();

    App.every(6000, () => { Views.dashboard.sabCard(true); Views.dashboard.plexCard(true); });
    App.every(30000, () => Views.dashboard.svcCards());
  },

  enabled(svc) {
    const c = S.cfg.services[svc];
    return c && c.enabled && c.url && c.apiKey;
  },

  /* ---------- Dienst-Karten ---------- */
  async svcCards() {
    const el = document.getElementById('svcCards');
    if (!el) return;

    const stats = {};
    const jobs = [];
    if (this.enabled('sonarr')) jobs.push((async () => {
      const [series, missing, queue] = await Promise.all([
        API.get('sonarr', '/api/v3/series'),
        API.get('sonarr', '/api/v3/wanted/missing?page=1&pageSize=1'),
        API.get('sonarr', '/api/v3/queue?page=1&pageSize=1')
      ]);
      stats.sonarr = `<b>${fmtNum(series.length)}</b> Serien · <b>${fmtNum(missing.totalRecords)}</b> fehlend · <b>${fmtNum(queue.totalRecords)}</b> in Queue`;
    })().catch(() => {}));
    if (this.enabled('radarr')) jobs.push((async () => {
      const [movies, missing, queue] = await Promise.all([
        API.get('radarr', '/api/v3/movie'),
        API.get('radarr', '/api/v3/wanted/missing?page=1&pageSize=1'),
        API.get('radarr', '/api/v3/queue?page=1&pageSize=1')
      ]);
      stats.radarr = `<b>${fmtNum(movies.length)}</b> Filme · <b>${fmtNum(missing.totalRecords)}</b> fehlend · <b>${fmtNum(queue.totalRecords)}</b> in Queue`;
    })().catch(() => {}));
    if (this.enabled('sabnzbd')) jobs.push((async () => {
      const q = (await API.sab('mode=queue&start=0&limit=1')).queue;
      stats.sabnzbd = q.paused
        ? `<span style="color:var(--warn)">Pausiert</span> · <b>${esc(q.sizeleft)}</b> übrig`
        : `<b>${fmtBytes((Number(q.kbpersec) || 0) * 1024)}/s</b> · <b>${fmtNum(q.noofslots)}</b> Jobs · ${esc(q.sizeleft)} übrig`;
    })().catch(() => {}));
    if (this.enabled('plex')) jobs.push((async () => {
      const [sess, libs] = await Promise.all([
        API.get('plex', '/status/sessions'),
        API.get('plex', '/library/sections')
      ]);
      const n = (sess.MediaContainer && sess.MediaContainer.size) || 0;
      const l = (libs.MediaContainer && libs.MediaContainer.size) || 0;
      stats.plex = `<b>${n}</b> aktive${n === 1 ? 'r' : ''} Stream${n === 1 ? '' : 's'} · <b>${l}</b> Bibliotheken`;
    })().catch(() => {}));
    if (this.enabled('prowlarr')) jobs.push((async () => {
      const idx = await API.get('prowlarr', '/api/v1/indexer');
      const on = idx.filter(i => i.enable).length;
      stats.prowlarr = `<b>${on}</b> von <b>${idx.length}</b> Indexern aktiv`;
    })().catch(() => {}));
    await Promise.allSettled(jobs);

    el.innerHTML = SVCS.map(svc => {
      const m = SVC_META[svc];
      const st = S.status[svc] || {};
      const enabled = this.enabled(svc);
      const badge = !enabled ? '<span class="badge b-mut">Inaktiv</span>'
        : st.state === 'on' ? `<span class="badge b-ok">Online</span>`
        : st.state === 'off' ? '<span class="badge b-err">Offline</span>'
        : '<span class="badge b-mut">…</span>';
      return `<div class="card clickable" onclick="location.hash='#/${svc}'">
        <div class="card-b" style="display:flex;gap:13px;align-items:flex-start">
          <div class="svc-ico" style="background:color-mix(in srgb, ${m.color} 16%, transparent);color:${m.color}">${icon(m.icon)}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <b style="font-size:15px">${m.name}</b>${badge}
            </div>
            <div class="td-sub" style="margin-top:2px">${st.version ? 'v' + esc(st.version) : m.desc}</div>
            <div style="margin-top:9px;font-size:12.5px;color:var(--txt2)">${stats[svc] || (enabled ? '–' : 'Nicht konfiguriert')}</div>
          </div>
          ${enabled ? `<button class="btn btn-ic btn-g" title="Original-UI öffnen" onclick="event.stopPropagation();App.openSvc('${svc}')">${icon('external')}</button>` : ''}
        </div></div>`;
    }).join('');
  },

  /* ---------- SABnzbd Live ---------- */
  async sabCard(soft) {
    const el = document.getElementById('sabCard');
    if (!el) return;
    if (!this.enabled('sabnzbd')) { el.innerHTML = `<div class="card-h"><h3>Downloads</h3></div><div class="card-b">${emptyBox('download', 'SABnzbd nicht konfiguriert')}</div>`; return; }
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
            <span>${esc(s.cat)} · ${esc(s.sizeleft)} übrig · ${esc(s.timeleft)}</span>
          </div>
          <div style="width:110px;flex:0 0 110px"><div class="prog"><i style="width:${esc(s.percentage)}%"></i></div></div>
          <span class="td-sub" style="width:42px;text-align:right">${esc(s.percentage)}%</span>
        </div>`).join('');
      el.innerHTML = `
        <div class="card-h"><h3>Downloads</h3><span class="sub">${fmtNum(q.noofslots)} Jobs · ${esc(q.sizeleft || '0')} übrig</span>
          <span class="spacer"></span>
          <span class="stat-big" style="font-size:19px;color:${q.paused ? 'var(--warn)' : 'var(--acc2)'}">${q.paused ? 'Pausiert' : fmtBytes(kb * 1024) + '/s'}</span>
        </div>
        <div class="card-b" style="padding-top:10px">
          ${Views.dashboard.spark(S.speedHist)}
          ${rows || emptyBox('inbox', 'Warteschlange ist leer')}
          <div style="margin-top:10px;text-align:right"><a href="#/sabnzbd" class="btn btn-sm btn-g">Alle anzeigen ${icon('chevr')}</a></div>
        </div>`;
    } catch (e) {
      if (!soft) el.innerHTML = `<div class="card-h"><h3>Downloads</h3></div><div class="card-b">${errBox(e.message)}</div>`;
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
    if (!this.enabled('plex')) { el.innerHTML = `<div class="card-h"><h3>Gerade läuft</h3></div><div class="card-b">${emptyBox('play', 'Plex nicht konfiguriert')}</div>`; return; }
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
      el.innerHTML = `<div class="card-h"><h3>Gerade läuft</h3><span class="sub">${sess.length} Stream${sess.length === 1 ? '' : 's'}</span></div>
        <div class="card-b" style="padding-top:6px">${rows || emptyBox('play', 'Niemand schaut gerade')}</div>`;
    } catch (e) {
      if (!soft) el.innerHTML = `<div class="card-h"><h3>Gerade läuft</h3></div><div class="card-b">${errBox(e.message)}</div>`;
    }
  },

  /* ---------- Kalender (Sonarr + Radarr) ---------- */
  async calCard() {
    const el = document.getElementById('calCard');
    if (!el) return;
    el.innerHTML = `<div class="card-h"><h3>Demnächst</h3><span class="sub">nächste 7 Tage</span></div><div class="card-b">${spinner()}</div>`;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 8 * 86400000);
    const iso = d => d.toISOString();
    const items = [];
    const jobs = [];
    if (this.enabled('sonarr')) jobs.push(API.get('sonarr', `/api/v3/calendar?start=${iso(start)}&end=${iso(end)}&includeSeries=true`)
      .then(eps => eps.forEach(e => items.push({
        date: e.airDateUtc, svc: 'sonarr', has: e.hasFile,
        label: `${(e.series && e.series.title) || '?'} · S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}`,
        sub: e.title || ''
      }))).catch(() => {}));
    if (this.enabled('radarr')) jobs.push(API.get('radarr', `/api/v3/calendar?start=${iso(start)}&end=${iso(end)}`)
      .then(ms => ms.forEach(m => {
        const dates = [['Kino', m.inCinemas], ['Digital', m.digitalRelease], ['Disc', m.physicalRelease]]
          .filter(x => x[1] && new Date(x[1]) >= start && new Date(x[1]) < end);
        dates.forEach(d => items.push({ date: d[1], svc: 'radarr', has: m.hasFile, label: `${m.title} (${m.year})`, sub: d[0] + '-Release' }));
      })).catch(() => {}));
    await Promise.allSettled(jobs);
    items.sort((a, b) => new Date(a.date) - new Date(b.date));

    let html = '', lastDay = '';
    items.forEach(it => {
      const dl = dayLabel(it.date);
      if (dl !== lastDay) { html += `<div class="day-h">${icon('calendar')} ${dl}</div>`; lastDay = dl; }
      html += `<div class="list-item" style="padding:7px 4px">
        <i class="dot" style="background:${SVC_META[it.svc].color}"></i>
        <div class="li-main"><b>${esc(it.label)}</b><span>${esc(it.sub)} · ${timeHM(it.date)} Uhr</span></div>
        ${it.has ? '<span class="badge b-ok">Vorhanden</span>' : ''}
      </div>`;
    });
    el.innerHTML = `<div class="card-h"><h3>Demnächst</h3><span class="sub">nächste 7 Tage</span></div>
      <div class="card-b" style="padding-top:10px">${html || emptyBox('calendar', 'Keine anstehenden Veröffentlichungen')}</div>`;
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
    if (this.enabled('prowlarr')) jobs.push(pull('prowlarr', '/api/v1/health'));
    await Promise.allSettled(jobs);
    const rows = issues.map(i => `<div class="list-item" style="padding:8px 4px">
      <span style="color:${i.type === 'error' ? 'var(--err)' : 'var(--warn)'};flex:0 0 16px">${icon('warning')}</span>
      <div class="li-main" style="white-space:normal"><b style="white-space:normal">${esc(i.msg)}</b><span>${SVC_META[i.svc].name}</span></div>
    </div>`).join('');
    el.innerHTML = `<div class="card-h"><h3>Systemzustand</h3>${issues.length ? `<span class="badge b-warn">${issues.length}</span>` : '<span class="badge b-ok">OK</span>'}</div>
      <div class="card-b" style="padding-top:6px">${rows || `<div class="empty" style="padding:18px">${icon('check')}<div>Alles in Ordnung</div></div>`}</div>`;
  },

  /* ---------- Speicherplatz ---------- */
  async diskCard() {
    const el = document.getElementById('diskCard');
    if (!el) return;
    const disks = new Map();
    const jobs = [];
    const pull = svc => API.get(svc, '/api/v3/diskspace').then(a => a.forEach(d => disks.set(d.path, d))).catch(() => {});
    if (this.enabled('sonarr')) jobs.push(pull('sonarr'));
    if (this.enabled('radarr')) jobs.push(pull('radarr'));
    await Promise.allSettled(jobs);
    const rows = [...disks.values()].filter(d => d.totalSpace > 0).map(d => {
      const used = d.totalSpace - d.freeSpace;
      const pct = Math.round(used / d.totalSpace * 100);
      return `<div style="padding:8px 0">
        <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px">
          <span class="mono">${esc(d.path)}</span><span style="color:var(--txt3)">${fmtBytes(d.freeSpace)} frei</span>
        </div>
        <div class="prog ${pct > 92 ? '' : pct > 80 ? 'p-warn' : 'p-ok'}"><i style="width:${pct}%"></i></div>
      </div>`;
    }).join('');
    el.innerHTML = `<div class="card-h"><h3>Speicherplatz</h3></div>
      <div class="card-b" style="padding-top:8px">${rows || emptyBox('disk', 'Keine Daten (Sonarr/Radarr nötig)')}</div>`;
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
      el.innerHTML = `<div class="card-h"><h3>Kürzlich hinzugefügt</h3><span class="sub">Plex</span></div>
        <div class="card-b"><div class="pgrid" style="grid-template-columns:repeat(auto-fill,minmax(118px,1fr))">${cards || emptyBox('inbox', 'Nichts Neues')}</div></div>`;
    } catch (e) {
      el.innerHTML = `<div class="card-h"><h3>Kürzlich hinzugefügt</h3></div><div class="card-b">${errBox(e.message)}</div>`;
    }
  }
};
