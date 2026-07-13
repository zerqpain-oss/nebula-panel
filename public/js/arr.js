'use strict';
/* ============ Gemeinsames Modul für Sonarr & Radarr ============ */

function ArrModule(svc) {
  const isS = svc === 'sonarr';
  const M = SVC_META[svc];
  const P = '/api/v3';
  const ITEMS = isS ? '/series' : '/movie';
  const T = isS
    ? { one: 'Serie', many: 'Serien', searchCmd: 'SeriesSearch', missingCmd: 'MissingEpisodeSearch', refreshCmd: 'RefreshSeries', idKey: 'seriesId' }
    : { one: 'Film', many: 'Filme', searchCmd: 'MoviesSearch', missingCmd: 'MissingMoviesSearch', refreshCmd: 'RefreshMovie', idKey: 'movieId' };

  const st = { tab: 'lib', items: [], profiles: null, roots: null, sub: 'profiles', libFilter: '', libSort: 'title' };

  const NAMING_LABELS = {
    renameEpisodes: 'Episoden umbenennen', renameMovies: 'Filme umbenennen',
    replaceIllegalCharacters: 'Ungültige Zeichen ersetzen', colonReplacementFormat: 'Doppelpunkt-Ersetzung',
    standardEpisodeFormat: 'Standard-Episodenformat', dailyEpisodeFormat: 'Daily-Episodenformat',
    animeEpisodeFormat: 'Anime-Episodenformat', seriesFolderFormat: 'Serienordner-Format',
    seasonFolderFormat: 'Staffelordner-Format', specialsFolderFormat: 'Specials-Ordner-Format',
    multiEpisodeStyle: 'Multi-Episoden-Stil', standardMovieFormat: 'Standard-Filmformat',
    movieFolderFormat: 'Filmordner-Format', includeQuality: 'Qualität einfügen', includeSeriesTitle: 'Serientitel einfügen',
    includeEpisodeTitle: 'Episodentitel einfügen', separator: 'Trennzeichen', numberStyle: 'Nummernstil'
  };
  const MEDIA_LABELS = {
    autoUnmonitorPreviouslyDownloadedEpisodes: 'Gelöschte Episoden auf „unüberwacht"',
    autoUnmonitorPreviouslyDownloadedMovies: 'Gelöschte Filme auf „unüberwacht"',
    recycleBin: 'Papierkorb-Pfad', recycleBinCleanupDays: 'Papierkorb aufräumen (Tage)',
    downloadPropersAndRepacks: 'Propers & Repacks laden', createEmptySeriesFolders: 'Leere Serienordner anlegen',
    createEmptyMovieFolders: 'Leere Filmordner anlegen', deleteEmptyFolders: 'Leere Ordner löschen',
    fileDate: 'Dateidatum setzen', rescanAfterRefresh: 'Rescan nach Aktualisierung',
    setPermissionsLinux: 'Linux-Berechtigungen setzen', chmodFolder: 'chmod (Ordner)', chownGroup: 'chown-Gruppe',
    episodeTitleRequired: 'Episodentitel erforderlich', skipFreeSpaceCheckWhenImporting: 'Speicherplatz-Check überspringen',
    minimumFreeSpaceWhenImporting: 'Min. freier Speicher (MB)', copyUsingHardlinks: 'Hardlinks statt Kopieren',
    importExtraFiles: 'Zusatzdateien importieren', extraFileExtensions: 'Zusatzdatei-Endungen',
    enableMediaInfo: 'MediaInfo aktivieren'
  };
  const HIST_EVENTS = {
    grabbed: ['Geholt', 'b-acc'], downloadFolderImported: ['Importiert', 'b-ok'],
    downloadFailed: ['Fehlgeschlagen', 'b-err'], episodeFileDeleted: ['Datei gelöscht', 'b-warn'],
    movieFileDeleted: ['Datei gelöscht', 'b-warn'], episodeFileRenamed: ['Umbenannt', 'b-mut'],
    movieFileRenamed: ['Umbenannt', 'b-mut'], downloadIgnored: ['Ignoriert', 'b-mut'],
    seriesFolderImported: ['Ordner importiert', 'b-ok'], movieFolderImported: ['Ordner importiert', 'b-ok']
  };

  /* ---------- Helfer ---------- */
  async function ensureMeta(force) {
    if (force || !st.profiles) st.profiles = await API.get(svc, P + '/qualityprofile');
    if (force || !st.roots) st.roots = await API.get(svc, P + '/rootfolder');
  }
  function profileName(id) {
    const p = (st.profiles || []).find(x => x.id === id);
    return p ? p.name : '#' + id;
  }
  function posterOf(item) {
    const img = (item.images || []).find(i => i.coverType === 'poster') || {};
    const local = img.url ? '/proxy/' + svc + (img.url.startsWith('/') ? '' : '/') + img.url : '';
    const remote = item.remotePoster || img.remoteUrl || '';
    return { src: local || remote, alt: local ? remote : '' };
  }
  /* Poster-Tag mit Fallback: erst lokales Bild (Proxy), sonst Online-Poster (TMDB/TVDB) */
  function posterImg(item, style) {
    const p = posterOf(item);
    if (!p.src) return '';
    return `<img loading="lazy" src="${esc(p.src)}"${p.alt ? ` data-alt="${esc(p.alt)}"` : ''}${style ? ` style="${style}"` : ''} onerror="if(this.dataset.alt){this.src=this.dataset.alt;delete this.dataset.alt}else{this.remove()}">`;
  }
  function sizeOf(item) {
    return (item.statistics && item.statistics.sizeOnDisk) || item.sizeOnDisk || 0;
  }
  async function cmd(name, extra, msg) {
    await API.post(svc, P + '/command', Object.assign({ name }, extra || {}));
    App.toast(msg || 'Auftrag gestartet', 'ok');
  }

  /* ---------- Einstieg ---------- */
  async function render(el) {
    if (!App.svcGuard(svc, el)) return;
    el.innerHTML = `<div class="tabs" id="arrTabs"></div><div id="arrBody"></div>`;
    const tabs = [['lib', 'Bibliothek'], ['add', 'Hinzufügen'], ['cal', 'Kalender'], ['act', 'Aktivität'], ['wanted', 'Fehlend'], ['cfg', 'Einstellungen']];
    const tabsEl = el.querySelector('#arrTabs');
    tabsEl.innerHTML = tabs.map(t => `<span class="tab ${st.tab === t[0] ? 'active' : ''}" data-t="${t[0]}">${t[1]}</span>`).join('');
    on(tabsEl, 'click', '.tab', (e, t) => {
      st.tab = t.dataset.t;
      tabsEl.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.t === st.tab));
      showTab();
    });
    showTab();
  }

  async function showTab() {
    App.clearViewTimers();
    const body = document.getElementById('arrBody');
    if (!body) return;
    body.innerHTML = spinner();
    try {
      if (st.tab === 'lib') await renderLib(body);
      else if (st.tab === 'add') renderAdd(body);
      else if (st.tab === 'cal') await renderCal(body);
      else if (st.tab === 'act') await renderAct(body);
      else if (st.tab === 'wanted') await renderWanted(body);
      else await renderCfg(body);
    } catch (e) { body.innerHTML = errBox(e.message); }
  }

  /* ---------- Bibliothek ---------- */
  async function renderLib(body) {
    const [items] = await Promise.all([API.get(svc, P + ITEMS), ensureMeta()]);
    st.items = items;
    body.innerHTML = `
      <div class="toolrow">
        <input class="inp grow" id="libQ" placeholder="Bibliothek filtern…" value="${esc(st.libFilter)}">
        <select class="sel" id="libSort">
          <option value="title">Nach Titel</option>
          <option value="added">Zuletzt hinzugefügt</option>
          <option value="size">Nach Größe</option>
        </select>
        <span class="chip">${icon(M.icon)}<b>${fmtNum(items.length)}</b>&nbsp;${T.many}</span>
      </div>
      <div class="pgrid" id="libGrid"></div>`;
    body.querySelector('#libSort').value = st.libSort;

    const grid = body.querySelector('#libGrid');
    const draw = () => {
      let arr = [...st.items];
      const q = st.libFilter.toLowerCase();
      if (q) arr = arr.filter(i => (i.title || '').toLowerCase().includes(q));
      if (st.libSort === 'title') arr.sort((a, b) => (a.sortTitle || a.title) < (b.sortTitle || b.title) ? -1 : 1);
      else if (st.libSort === 'added') arr.sort((a, b) => new Date(b.added) - new Date(a.added));
      else arr.sort((a, b) => sizeOf(b) - sizeOf(a));
      grid.innerHTML = arr.map(item => {
        const sub = isS
          ? `${item.statistics ? item.statistics.episodeFileCount + '/' + item.statistics.episodeCount + ' Ep.' : ''}`
          : (item.hasFile ? fmtBytes(sizeOf(item)) : 'Fehlt');
        return `<div class="poster" data-id="${item.id}" title="${esc(item.title)}">
          <div class="p-fall">${esc(item.title)}</div>
          ${posterImg(item)}
          <div class="p-tl">${!isS && !item.hasFile && item.monitored ? '<span class="badge b-warn">Fehlt</span>' : ''}</div>
          <div class="p-tr"><span class="badge ${item.monitored ? 'b-acc' : 'b-mut'}" data-mon="${item.id}" title="Überwachung umschalten" style="cursor:pointer">${icon('bookmark')}</span></div>
          <div class="p-grad"></div>
          <div class="p-info"><b>${esc(item.title)}</b><span>${item.year || ''}${sub ? ' · ' + esc(sub) : ''}</span></div>
        </div>`;
      }).join('') || emptyBox('inbox', 'Keine Treffer');
    };
    draw();

    body.querySelector('#libQ').addEventListener('input', e => { st.libFilter = e.target.value; draw(); });
    body.querySelector('#libSort').addEventListener('change', e => { st.libSort = e.target.value; draw(); });
    on(grid, 'click', '[data-mon]', async (e, t) => {
      e.stopPropagation();
      const item = st.items.find(i => i.id === +t.dataset.mon);
      if (!item) return;
      item.monitored = !item.monitored;
      try {
        await API.put(svc, P + ITEMS + '/' + item.id, item);
        App.toast(`${item.title}: ${item.monitored ? 'überwacht' : 'nicht mehr überwacht'}`, 'ok');
        draw();
      } catch (ex) { item.monitored = !item.monitored; App.toast(ex.message, 'err'); }
    });
    on(grid, 'click', '.poster', (e, t) => {
      if (e.target.closest('[data-mon]')) return;
      const item = st.items.find(i => i.id === +t.dataset.id);
      if (item) detailModal(item);
    });
  }

  /* ---------- Detail ---------- */
  function detailModal(item) {
    const stats = item.statistics || {};
    const facts = [
      ['Status', item.status], ['Jahr', item.year],
      [isS ? 'Sender' : 'Studio', isS ? item.network : item.studio],
      ['Qualitätsprofil', profileName(item.qualityProfileId)],
      ['Pfad', item.path], ['Größe', fmtBytes(sizeOf(item))],
      ['Genres', (item.genres || []).slice(0, 4).join(', ')]
    ].filter(f => f[1] !== undefined && f[1] !== null && f[1] !== '');

    let seasonsHtml = '';
    if (isS && Array.isArray(item.seasons)) {
      seasonsHtml = `<div class="sec-title">Staffeln</div><table class="tbl"><tbody>` +
        item.seasons.slice().reverse().map(sn => {
          const ss = sn.statistics || {};
          return `<tr>
            <td class="td-main">${sn.seasonNumber === 0 ? 'Specials' : 'Staffel ' + sn.seasonNumber}</td>
            <td class="td-sub">${ss.episodeFileCount != null ? ss.episodeFileCount + ' / ' + ss.episodeCount + ' Episoden' : ''}</td>
            <td class="r" style="white-space:nowrap">
              <label class="switch" title="Überwachen"><input type="checkbox" data-season="${sn.seasonNumber}" ${sn.monitored ? 'checked' : ''}><i></i></label>
              <button class="btn btn-ic btn-g" data-sseek="${sn.seasonNumber}" title="Staffel suchen">${icon('search')}</button>
            </td></tr>`;
        }).join('') + '</tbody></table>';
    }
    if (!isS && item.movieFile) {
      const mf = item.movieFile;
      seasonsHtml = `<div class="sec-title">Datei</div>
        <div class="kv"><span>Qualität</span><b>${esc(mf.quality && mf.quality.quality && mf.quality.quality.name || '?')}</b></div>
        <div class="kv"><span>Größe</span><b>${fmtBytes(mf.size)}</b></div>
        <div class="kv"><span>Pfad</span><span class="mono wrapline" style="color:var(--txt)">${esc(mf.relativePath || '')}</span></div>`;
    }

    const body = h(`<div>
      <div style="display:flex;gap:18px">
        <div style="flex:0 0 130px">${posterImg(item, 'width:130px;border-radius:10px')}</div>
        <div style="flex:1;min-width:0">
          <p style="color:var(--txt2);font-size:13px;margin-bottom:10px">${esc((item.overview || '').slice(0, 340))}${(item.overview || '').length > 340 ? '…' : ''}</p>
          ${facts.map(f => `<div class="kv"><span>${esc(f[0])}</span><span class="wrapline" style="text-align:right">${esc(String(f[1]))}</span></div>`).join('')}
        </div>
      </div>${seasonsHtml}</div>`);

    const bSearch = h(`<button class="btn btn-p">${icon('search')} Suche starten</button>`);
    const bRefresh = h(`<button class="btn">${icon('refresh')} Aktualisieren</button>`);
    const bEdit = h(`<button class="btn">${icon('edit')} Bearbeiten</button>`);
    const bDel = h(`<button class="btn btn-d">${icon('trash')} Löschen</button>`);
    const m = App.modal({ title: item.title, body, foot: [bDel, bEdit, bRefresh, bSearch], wide: true });

    bSearch.addEventListener('click', () => cmd(T.searchCmd, isS ? { seriesId: item.id } : { movieIds: [item.id] }, 'Suche gestartet'));
    bRefresh.addEventListener('click', () => cmd(T.refreshCmd, isS ? { seriesId: item.id } : { movieIds: [item.id] }, 'Aktualisierung gestartet'));
    bEdit.addEventListener('click', () => { m.close(); editModal(item); });
    bDel.addEventListener('click', async () => {
      const r = await App.confirm({
        title: T.one + ' löschen', msg: `„${item.title}" wirklich aus ${M.name} entfernen?`,
        okLabel: 'Löschen', danger: true,
        checks: [{ id: 'files', label: 'Dateien von der Festplatte löschen', checked: false }]
      });
      if (!r) return;
      try {
        await API.del(svc, P + ITEMS + '/' + item.id + '?deleteFiles=' + !!r.files + '&addImportExclusion=false');
        App.toast(item.title + ' gelöscht', 'ok');
        m.close();
        if (st.tab === 'lib') showTab();
      } catch (ex) { App.toast(ex.message, 'err'); }
    });

    on(body, 'change', '[data-season]', async (e, t) => {
      const sn = item.seasons.find(x => x.seasonNumber === +t.dataset.season);
      sn.monitored = t.checked;
      try { await API.put(svc, P + ITEMS + '/' + item.id, item); App.toast('Gespeichert', 'ok'); }
      catch (ex) { App.toast(ex.message, 'err'); }
    });
    on(body, 'click', '[data-sseek]', (e, t) =>
      cmd('SeasonSearch', { seriesId: item.id, seasonNumber: +t.dataset.sseek }, 'Staffel-Suche gestartet'));
  }

  /* ---------- Bearbeiten ---------- */
  async function editModal(item) {
    await ensureMeta();
    const body = h(`<div>
      <div class="frow"><label class="lbl">Überwacht</label>
        <label class="switch"><input type="checkbox" id="eMon" ${item.monitored ? 'checked' : ''}><i></i></label></div>
      <div class="frow"><label class="lbl">Qualitätsprofil</label>
        <select class="sel" id="eProf">${st.profiles.map(p => `<option value="${p.id}" ${p.id === item.qualityProfileId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      ${!isS ? `<div class="frow"><label class="lbl">Mindest-Verfügbarkeit</label>
        <select class="sel" id="eAvail">${['announced', 'inCinemas', 'released'].map(a => `<option value="${a}" ${item.minimumAvailability === a ? 'selected' : ''}>${a}</option>`).join('')}</select></div>` : ''}
      ${isS ? `<div class="frow"><label class="lbl">Staffel-Ordner</label>
        <label class="switch"><input type="checkbox" id="eSf" ${item.seasonFolder ? 'checked' : ''}><i></i></label></div>` : ''}
      <div class="frow"><label class="lbl">Pfad</label><input class="inp" id="ePath" value="${esc(item.path || '')}"></div>
    </div>`);
    const bSave = h(`<button class="btn btn-p">Speichern</button>`);
    const m = App.modal({ title: item.title + ' bearbeiten', body, foot: [bSave] });
    bSave.addEventListener('click', async () => {
      item.monitored = body.querySelector('#eMon').checked;
      item.qualityProfileId = +body.querySelector('#eProf').value;
      item.path = body.querySelector('#ePath').value;
      if (!isS) item.minimumAvailability = body.querySelector('#eAvail').value;
      if (isS) item.seasonFolder = body.querySelector('#eSf').checked;
      try {
        await API.put(svc, P + ITEMS + '/' + item.id + '?moveFiles=false', item);
        App.toast('Gespeichert', 'ok'); m.close();
        if (st.tab === 'lib') showTab();
      } catch (ex) { App.toast(ex.message, 'err'); }
    });
  }

  /* ---------- Hinzufügen ---------- */
  function renderAdd(body) {
    body.innerHTML = `
      <div class="toolrow">
        <input class="inp grow search-lg" id="addQ" placeholder="${isS ? 'Serie' : 'Film'} suchen – Titel eingeben und Enter drücken…">
        <button class="btn btn-p" id="addGo">${icon('search')} Suchen</button>
      </div>
      <div id="addRes"></div>`;
    const q = body.querySelector('#addQ');
    const res = body.querySelector('#addRes');
    const go = async () => {
      if (!q.value.trim()) return;
      res.innerHTML = spinner();
      try {
        const list = await API.get(svc, P + ITEMS + '/lookup?term=' + encodeURIComponent(q.value.trim()));
        res.innerHTML = `<div class="pgrid">${list.map((r, i) => {
          const src = r.remotePoster || ((r.images || []).find(x => x.coverType === 'poster') || {}).remoteUrl || '';
          const exists = !!r.id;
          return `<div class="poster" data-i="${i}" title="${esc(r.title)}">
            <div class="p-fall">${esc(r.title)}</div>
            ${src ? `<img loading="lazy" src="${esc(src)}" onerror="this.remove()">` : ''}
            <div class="p-tl">${exists ? '<span class="badge b-ok">Vorhanden</span>' : ''}</div>
            <div class="p-grad"></div>
            <div class="p-info"><b>${esc(r.title)}</b><span>${r.year || ''}</span></div>
          </div>`;
        }).join('') || emptyBox('search', 'Keine Ergebnisse')}</div>`;
        on(res, 'click', '.poster', (e, t) => {
          const r = list[+t.dataset.i];
          if (r.id) { detailModal(r); return; }
          addModal(r);
        });
      } catch (e) { res.innerHTML = errBox(e.message); }
    };
    q.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    body.querySelector('#addGo').addEventListener('click', go);
    q.focus();
  }

  async function addModal(r) {
    await ensureMeta();
    if (!st.roots.length) { App.toast('Kein Root-Ordner konfiguriert – zuerst unter Einstellungen anlegen', 'err'); return; }
    const monitorOpts = [['all', 'Alle Episoden'], ['future', 'Zukünftige'], ['missing', 'Fehlende'], ['existing', 'Vorhandene'], ['firstSeason', 'Erste Staffel'], ['latestSeason', 'Neueste Staffel'], ['none', 'Keine']];
    const body = h(`<div>
      <div class="frow"><label class="lbl">Root-Ordner</label>
        <select class="sel" id="aRoot">${st.roots.map(x => `<option value="${esc(x.path)}">${esc(x.path)} (${fmtBytes(x.freeSpace)} frei)</option>`).join('')}</select></div>
      <div class="frow"><label class="lbl">Qualitätsprofil</label>
        <select class="sel" id="aProf">${st.profiles.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
      ${isS ? `<div class="frow"><label class="lbl">Überwachen</label>
        <select class="sel" id="aMon">${monitorOpts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select></div>
      <div class="frow"><label class="lbl">Staffel-Ordner</label>
        <label class="switch"><input type="checkbox" id="aSf" checked><i></i></label></div>`
      : `<div class="frow"><label class="lbl">Mindest-Verfügbarkeit</label>
        <select class="sel" id="aAvail"><option value="announced">Angekündigt</option><option value="inCinemas">Im Kino</option><option value="released" selected>Veröffentlicht</option></select></div>`}
      <div class="frow"><label class="lbl">Nach dem Hinzufügen suchen</label>
        <label class="switch"><input type="checkbox" id="aSearch" checked><i></i></label></div>
    </div>`);
    const bAdd = h(`<button class="btn btn-p">${icon('plus')} Hinzufügen</button>`);
    const m = App.modal({ title: `${r.title} (${r.year || '?'}) hinzufügen`, body, foot: [bAdd] });
    bAdd.addEventListener('click', async () => {
      bAdd.disabled = true;
      const payload = Object.assign({}, r, {
        rootFolderPath: body.querySelector('#aRoot').value,
        qualityProfileId: +body.querySelector('#aProf').value,
        monitored: true
      });
      if (isS) {
        payload.seasonFolder = body.querySelector('#aSf').checked;
        payload.addOptions = {
          monitor: body.querySelector('#aMon').value,
          searchForMissingEpisodes: body.querySelector('#aSearch').checked
        };
      } else {
        payload.minimumAvailability = body.querySelector('#aAvail').value;
        payload.addOptions = { searchForMovie: body.querySelector('#aSearch').checked };
      }
      try {
        await API.post(svc, P + ITEMS, payload);
        App.toast(r.title + ' hinzugefügt', 'ok');
        m.close();
      } catch (ex) { App.toast(ex.message, 'err'); bAdd.disabled = false; }
    });
  }

  /* ---------- Kalender ---------- */
  async function renderCal(body) {
    const start = new Date(); start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 15 * 86400000);
    const items = [];
    if (isS) {
      const eps = await API.get(svc, `${P}/calendar?start=${start.toISOString()}&end=${end.toISOString()}&includeSeries=true`);
      eps.forEach(e => items.push({
        date: e.airDateUtc, has: e.hasFile,
        label: `${(e.series && e.series.title) || '?'} · S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}`,
        sub: e.title || ''
      }));
    } else {
      const ms = await API.get(svc, `${P}/calendar?start=${start.toISOString()}&end=${end.toISOString()}`);
      ms.forEach(mv => {
        [['Kino', mv.inCinemas], ['Digital', mv.digitalRelease], ['Disc', mv.physicalRelease]]
          .filter(x => x[1] && new Date(x[1]) >= start && new Date(x[1]) < end)
          .forEach(d => items.push({ date: d[1], has: mv.hasFile, label: `${mv.title} (${mv.year})`, sub: d[0] + '-Release' }));
      });
    }
    items.sort((a, b) => new Date(a.date) - new Date(b.date));
    let html = '', lastDay = '';
    items.forEach(it => {
      const dl = dayLabel(it.date);
      if (dl !== lastDay) { html += `<div class="day-h">${icon('calendar')} ${dl}</div>`; lastDay = dl; }
      html += `<div class="list-item"><i class="dot" style="background:${M.color}"></i>
        <div class="li-main"><b>${esc(it.label)}</b><span>${esc(it.sub)} · ${timeHM(it.date)} Uhr</span></div>
        ${it.has ? '<span class="badge b-ok">Vorhanden</span>' : '<span class="badge b-mut">Ausstehend</span>'}</div>`;
    });
    body.innerHTML = `<div class="card"><div class="card-h"><h3>Kalender</h3><span class="sub">gestern bis in 14 Tagen</span></div>
      <div class="card-b">${html || emptyBox('calendar', 'Keine Einträge im Zeitraum')}</div></div>`;
  }

  /* ---------- Aktivität (Queue + Historie) ---------- */
  async function renderAct(body) {
    body.innerHTML = `<div class="card" id="qWrap"></div><div class="card" id="hWrap" style="margin-top:16px"></div>`;
    await drawQueue();
    await drawHistory();
    App.every(6000, () => drawQueue(true));
  }

  async function drawQueue(soft) {
    const wrap = document.getElementById('qWrap');
    if (!wrap) return;
    try {
      const inc = isS ? 'includeSeries=true&includeEpisode=true' : 'includeMovie=true';
      const q = await API.get(svc, `${P}/queue?page=1&pageSize=80&${inc}`);
      const rows = (q.records || []).map(r => {
        let title = r.title || '?';
        if (isS && r.series) title = `${r.series.title}${r.episode ? ` · S${String(r.episode.seasonNumber).padStart(2, '0')}E${String(r.episode.episodeNumber).padStart(2, '0')}` : ''}`;
        if (!isS && r.movie) title = `${r.movie.title} (${r.movie.year})`;
        const pct = r.size ? Math.max(0, Math.round((1 - r.sizeleft / r.size) * 100)) : 0;
        const stBadge = r.trackedDownloadState === 'importPending' ? '<span class="badge b-warn">Import wartet</span>'
          : r.status === 'downloading' ? '<span class="badge b-acc">Lädt</span>'
          : `<span class="badge b-mut">${esc(r.status || '?')}</span>`;
        return `<tr>
          <td><div class="td-main wrapline">${esc(title)}</div><div class="td-sub wrapline">${esc(r.title || '')}</div></td>
          <td style="white-space:nowrap">${esc(r.quality && r.quality.quality && r.quality.quality.name || '')}</td>
          <td style="min-width:120px"><div class="prog"><i style="width:${pct}%"></i></div><div class="td-sub" style="margin-top:4px">${pct}% · ${esc(r.timeleft || '–')}</div></td>
          <td>${stBadge}</td>
          <td class="r"><button class="btn btn-ic btn-g" data-qdel="${r.id}" title="Entfernen">${icon('trash')}</button></td>
        </tr>`;
      }).join('');
      wrap.innerHTML = `<div class="card-h"><h3>Warteschlange</h3><span class="sub">${fmtNum(q.totalRecords || 0)} Einträge</span></div>
        <div class="card-b tight">${rows ? `<table class="tbl"><thead><tr><th>Titel</th><th>Qualität</th><th>Fortschritt</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : emptyBox('inbox', 'Warteschlange ist leer')}</div>`;
      on(wrap, 'click', '[data-qdel]', async (e, t) => {
        const r = await App.confirm({
          title: 'Aus Warteschlange entfernen', msg: 'Download wirklich entfernen?', okLabel: 'Entfernen', danger: true,
          checks: [
            { id: 'client', label: 'Auch im Download-Client löschen', checked: true },
            { id: 'block', label: 'Release blocklisten', checked: false }
          ]
        });
        if (!r) return;
        try {
          await API.del(svc, `${P}/queue/${t.dataset.qdel}?removeFromClient=${!!r.client}&blocklist=${!!r.block}`);
          App.toast('Entfernt', 'ok'); drawQueue();
        } catch (ex) { App.toast(ex.message, 'err'); }
      });
    } catch (e) {
      if (!soft) wrap.innerHTML = `<div class="card-h"><h3>Warteschlange</h3></div><div class="card-b">${errBox(e.message)}</div>`;
    }
  }

  async function drawHistory() {
    const wrap = document.getElementById('hWrap');
    if (!wrap) return;
    try {
      const hi = await API.get(svc, `${P}/history?page=1&pageSize=35&sortKey=date&sortDirection=descending`);
      const rows = (hi.records || []).map(r => {
        const ev = HIST_EVENTS[r.eventType] || [r.eventType, 'b-mut'];
        return `<div class="list-item">
          <span class="badge ${ev[1]}" style="flex:0 0 auto">${esc(ev[0])}</span>
          <div class="li-main"><b class="wrapline" style="white-space:normal">${esc(r.sourceTitle || '?')}</b>
          <span>${esc(r.quality && r.quality.quality && r.quality.quality.name || '')} · ${relTime(r.date)}</span></div>
        </div>`;
      }).join('');
      wrap.innerHTML = `<div class="card-h"><h3>Historie</h3></div><div class="card-b" style="padding-top:6px">${rows || emptyBox('clock', 'Noch keine Historie')}</div>`;
    } catch (e) {
      wrap.innerHTML = `<div class="card-h"><h3>Historie</h3></div><div class="card-b">${errBox(e.message)}</div>`;
    }
  }

  /* ---------- Fehlend ---------- */
  async function renderWanted(body) {
    const path = isS
      ? `${P}/wanted/missing?page=1&pageSize=40&sortKey=airDateUtc&sortDirection=descending&includeSeries=true`
      : `${P}/wanted/missing?page=1&pageSize=40&sortKey=title&sortDirection=ascending`;
    const w = await API.get(svc, path);
    const rows = (w.records || []).map(r => {
      const label = isS
        ? `${(r.series && r.series.title) || '?'} · S${String(r.seasonNumber).padStart(2, '0')}E${String(r.episodeNumber).padStart(2, '0')} – ${r.title || ''}`
        : `${r.title} (${r.year || '?'})`;
      const sub = isS ? (r.airDateUtc ? 'Ausgestrahlt ' + relTime(r.airDateUtc) : '') : (r.status || '');
      return `<div class="list-item">
        <div class="li-main"><b class="wrapline" style="white-space:normal">${esc(label)}</b><span>${esc(sub)}</span></div>
        <button class="btn btn-sm" data-ws="${r.id}">${icon('search')} Suchen</button>
      </div>`;
    }).join('');
    body.innerHTML = `<div class="card">
      <div class="card-h"><h3>Fehlende ${T.many}</h3><span class="sub">${fmtNum(w.totalRecords || 0)} gesamt</span>
        <span class="spacer"></span>
        <button class="btn btn-sm btn-p" id="wAll">${icon('zap')} Alle suchen</button>
      </div>
      <div class="card-b" style="padding-top:6px">${rows || emptyBox('check', 'Nichts fehlt – alles da!')}</div></div>`;
    on(body, 'click', '[data-ws]', (e, t) =>
      cmd(isS ? 'EpisodeSearch' : 'MoviesSearch', isS ? { episodeIds: [+t.dataset.ws] } : { movieIds: [+t.dataset.ws] }, 'Suche gestartet'));
    body.querySelector('#wAll').addEventListener('click', async () => {
      const r = await App.confirm({ title: 'Alle fehlenden suchen', msg: 'Das kann viele Indexer-Anfragen auslösen. Fortfahren?', okLabel: 'Suchen' });
      if (r) cmd(T.missingCmd, {}, 'Suche nach allen fehlenden gestartet');
    });
  }

  /* ---------- Einstellungen ---------- */
  async function renderCfg(body) {
    const subs = [['profiles', 'Qualitätsprofile'], ['roots', 'Root-Ordner'], ['indexer', 'Indexer'], ['dlc', 'Download-Clients'], ['naming', 'Benennung'], ['media', 'Medienverwaltung']];
    body.innerHTML = `<div class="subtabs" id="cfgTabs">${subs.map(s =>
      `<span class="tab ${st.sub === s[0] ? 'active' : ''}" data-s="${s[0]}">${s[1]}</span>`).join('')}</div><div id="cfgBody">${spinner()}</div>`;
    const cfgBody = body.querySelector('#cfgBody');
    on(body.querySelector('#cfgTabs'), 'click', '.tab', (e, t) => {
      st.sub = t.dataset.s;
      body.querySelectorAll('#cfgTabs .tab').forEach(x => x.classList.toggle('active', x.dataset.s === st.sub));
      drawCfg(cfgBody);
    });
    drawCfg(cfgBody);
  }

  async function drawCfg(el) {
    el.innerHTML = spinner();
    try {
      if (st.sub === 'profiles') await cfgProfiles(el);
      else if (st.sub === 'roots') await cfgRoots(el);
      else if (st.sub === 'indexer') await cfgProviders(el, '/indexer', 'Indexer');
      else if (st.sub === 'dlc') await cfgProviders(el, '/downloadclient', 'Download-Client');
      else if (st.sub === 'naming') await cfgObj(el, '/config/naming', 'Benennung', NAMING_LABELS);
      else await cfgObj(el, '/config/mediamanagement', 'Medienverwaltung', MEDIA_LABELS);
    } catch (e) { el.innerHTML = errBox(e.message); }
  }

  async function cfgProfiles(el) {
    await ensureMeta(true);
    el.innerHTML = `<div class="grid g-cards">${st.profiles.map(p => {
      const flat = flattenQualities(p);
      const allowed = flat.filter(x => x.allowed).length;
      return `<div class="card"><div class="card-b">
        <div style="display:flex;align-items:center;gap:8px"><b style="font-size:15px;flex:1">${esc(p.name)}</b>
          <button class="btn btn-sm" data-pedit="${p.id}">${icon('edit')} Bearbeiten</button></div>
        <div class="td-sub" style="margin-top:8px">${allowed} von ${flat.length} Qualitäten erlaubt</div>
        <div class="td-sub">Upgrade bis: <b style="color:var(--txt)">${esc(cutoffName(p))}</b> ${p.upgradeAllowed ? '' : '· Upgrades aus'}</div>
      </div></div>`;
    }).join('')}</div>`;
    on(el, 'click', '[data-pedit]', (e, t) => {
      const p = st.profiles.find(x => x.id === +t.dataset.pedit);
      if (p) profileModal(structuredClone(p));
    });
  }

  function flattenQualities(p) {
    return (p.items || []).map(it => ({
      id: it.quality ? it.quality.id : it.id,
      name: it.quality ? it.quality.name : it.name,
      allowed: it.allowed, ref: it
    }));
  }
  function cutoffName(p) {
    const f = flattenQualities(p).find(x => x.id === p.cutoff);
    return f ? f.name : '#' + p.cutoff;
  }

  function profileModal(p) {
    const flat = flattenQualities(p);
    const body = h(`<div>
      <div class="frow"><label class="lbl">Name</label><input class="inp" id="pName" value="${esc(p.name)}"></div>
      <div class="frow"><label class="lbl">Upgrades erlaubt</label>
        <label class="switch"><input type="checkbox" id="pUp" ${p.upgradeAllowed ? 'checked' : ''}><i></i></label></div>
      <div class="frow"><label class="lbl">Upgrade bis (Cutoff)</label><select class="sel" id="pCut"></select></div>
      <div class="sec-title">Erlaubte Qualitäten <span style="text-transform:none;font-weight:400">(oben = beste)</span></div>
      <div id="pList">${flat.slice().reverse().map(q => `
        <div class="frow" style="grid-template-columns:1fr auto">
          <label class="lbl">${esc(q.name)}</label>
          <label class="switch"><input type="checkbox" data-q="${q.id}" ${q.allowed ? 'checked' : ''}><i></i></label>
        </div>`).join('')}</div>
    </div>`);
    const cutSel = body.querySelector('#pCut');
    const refreshCut = () => {
      const allowedIds = [...body.querySelectorAll('[data-q]')].filter(i => i.checked).map(i => +i.dataset.q);
      cutSel.innerHTML = flat.filter(q => allowedIds.includes(q.id)).map(q =>
        `<option value="${q.id}" ${q.id === p.cutoff ? 'selected' : ''}>${esc(q.name)}</option>`).join('');
    };
    refreshCut();
    on(body, 'change', '[data-q]', refreshCut);
    const bSave = h(`<button class="btn btn-p">Speichern</button>`);
    const m = App.modal({ title: 'Profil: ' + p.name, body, foot: [bSave] });
    bSave.addEventListener('click', async () => {
      p.name = body.querySelector('#pName').value;
      p.upgradeAllowed = body.querySelector('#pUp').checked;
      body.querySelectorAll('[data-q]').forEach(i => {
        const f = flat.find(x => x.id === +i.dataset.q);
        if (f) f.ref.allowed = i.checked;
      });
      if (cutSel.value) p.cutoff = +cutSel.value;
      try {
        await API.put(svc, P + '/qualityprofile/' + p.id, p);
        App.toast('Profil gespeichert', 'ok'); m.close();
        st.profiles = null; drawCfg(document.getElementById('cfgBody'));
      } catch (ex) { App.toast(ex.message, 'err'); }
    });
  }

  async function cfgRoots(el) {
    const roots = await API.get(svc, P + '/rootfolder');
    st.roots = roots;
    el.innerHTML = `
      <div class="toolrow"><input class="inp grow" id="rPath" placeholder="/pfad/zum/ordner">
        <button class="btn btn-p" id="rAdd">${icon('plus')} Hinzufügen</button></div>
      ${roots.map(r => `<div class="list-item">
        <div class="svc-ico" style="background:var(--card2)">${icon('folder')}</div>
        <div class="li-main"><b class="mono">${esc(r.path)}</b><span>${fmtBytes(r.freeSpace)} frei</span></div>
        <button class="btn btn-ic btn-g" data-rdel="${r.id}">${icon('trash')}</button>
      </div>`).join('') || emptyBox('folder', 'Noch kein Root-Ordner')}`;
    el.querySelector('#rAdd').addEventListener('click', async () => {
      const path = el.querySelector('#rPath').value.trim();
      if (!path) return;
      try { await API.post(svc, P + '/rootfolder', { path }); App.toast('Root-Ordner angelegt', 'ok'); drawCfg(el); }
      catch (e) { App.toast(e.message, 'err'); }
    });
    on(el, 'click', '[data-rdel]', async (e, t) => {
      const r = await App.confirm({ title: 'Root-Ordner entfernen', msg: 'Nur der Eintrag wird entfernt, keine Dateien.', okLabel: 'Entfernen', danger: true });
      if (!r) return;
      try { await API.del(svc, P + '/rootfolder/' + t.dataset.rdel); App.toast('Entfernt', 'ok'); drawCfg(el); }
      catch (ex) { App.toast(ex.message, 'err'); }
    });
  }

  /* Indexer & Download-Clients (generisch über fields[]) */
  async function cfgProviders(el, path, label) {
    const list = await API.get(svc, P + path);
    el.innerHTML = `<div class="hint" style="margin-bottom:12px">${label === 'Indexer' ? 'Tipp: Indexer werden meist zentral über Prowlarr verwaltet und automatisch synchronisiert.' : ''}</div>` +
      (list.map(x => `<div class="list-item">
        <label class="switch" title="Aktiv"><input type="checkbox" data-en="${x.id}" ${provEnabled(x) ? 'checked' : ''}><i></i></label>
        <div class="li-main"><b>${esc(x.name)}</b><span>${esc(x.implementationName || x.implementation || '')}${x.protocol ? ' · ' + esc(x.protocol) : ''}${x.priority != null ? ' · Priorität ' + x.priority : ''}</span></div>
        <button class="btn btn-sm" data-test="${x.id}">${icon('zap')} Test</button>
        <button class="btn btn-sm" data-edit="${x.id}">${icon('edit')}</button>
        <button class="btn btn-ic btn-g" data-del="${x.id}">${icon('trash')}</button>
      </div>`).join('') || emptyBox('server', `Kein ${label} eingerichtet`));

    const byId = id => list.find(x => x.id === +id);
    on(el, 'change', '[data-en]', async (e, t) => {
      const x = byId(t.dataset.en);
      setProvEnabled(x, t.checked);
      try { await API.put(svc, P + path + '/' + x.id, x); App.toast((t.checked ? 'Aktiviert: ' : 'Deaktiviert: ') + x.name, 'ok'); }
      catch (ex) { App.toast(ex.message, 'err'); t.checked = !t.checked; }
    });
    on(el, 'click', '[data-test]', async (e, t) => {
      const x = byId(t.dataset.test);
      t.disabled = true;
      try { await API.post(svc, P + path + '/test', x); App.toast(x.name + ': Test erfolgreich', 'ok'); }
      catch (ex) { App.toast(x.name + ': ' + ex.message, 'err'); }
      t.disabled = false;
    });
    on(el, 'click', '[data-edit]', (e, t) => providerModal(byId(t.dataset.edit), path, () => drawCfg(el)));
    on(el, 'click', '[data-del]', async (e, t) => {
      const x = byId(t.dataset.del);
      const r = await App.confirm({ title: label + ' löschen', msg: `„${x.name}" wirklich löschen?`, okLabel: 'Löschen', danger: true });
      if (!r) return;
      try { await API.del(svc, P + path + '/' + x.id); App.toast('Gelöscht', 'ok'); drawCfg(el); }
      catch (ex) { App.toast(ex.message, 'err'); }
    });
  }

  function provEnabled(x) {
    if (typeof x.enable === 'boolean') return x.enable;
    return !!(x.enableRss || x.enableAutomaticSearch || x.enableInteractiveSearch);
  }
  function setProvEnabled(x, v) {
    if (typeof x.enable === 'boolean') x.enable = v;
    ['enableRss', 'enableAutomaticSearch', 'enableInteractiveSearch'].forEach(k => { if (k in x) x[k] = v; });
  }

  function providerModal(x, path, refresh) {
    const obj = structuredClone(x);
    const fe = App.fieldsEditor(obj.fields || []);
    const flags = ['enable', 'enableRss', 'enableAutomaticSearch', 'enableInteractiveSearch'].filter(k => k in obj);
    const head = h(`<div>
      <div class="frow"><label class="lbl">Name</label><input class="inp" id="xName" value="${esc(obj.name)}"></div>
      ${'priority' in obj ? `<div class="frow"><label class="lbl">Priorität</label><input class="inp" type="number" id="xPrio" value="${esc(String(obj.priority))}"></div>` : ''}
      ${flags.map(k => `<div class="frow"><label class="lbl">${k === 'enable' ? 'Aktiv' : k === 'enableRss' ? 'RSS' : k === 'enableAutomaticSearch' ? 'Automatische Suche' : 'Interaktive Suche'}</label>
        <label class="switch"><input type="checkbox" data-flag="${k}" ${obj[k] ? 'checked' : ''}><i></i></label></div>`).join('')}
    </div>`);
    const body = h('<div></div>');
    body.append(head, fe.el);
    const collect = () => {
      obj.name = head.querySelector('#xName').value;
      const prio = head.querySelector('#xPrio');
      if (prio) obj.priority = +prio.value;
      head.querySelectorAll('[data-flag]').forEach(i => obj[i.dataset.flag] = i.checked);
      fe.collect();
      return obj;
    };
    const bTest = h(`<button class="btn">${icon('zap')} Test</button>`);
    const bSave = h(`<button class="btn btn-p">Speichern</button>`);
    const m = App.modal({ title: obj.name + ' bearbeiten', body, foot: [bTest, bSave], wide: true });
    bTest.addEventListener('click', async () => {
      bTest.disabled = true;
      try { await API.post(svc, P + path + '/test', collect()); App.toast('Test erfolgreich', 'ok'); }
      catch (ex) { App.toast(ex.message, 'err'); }
      bTest.disabled = false;
    });
    bSave.addEventListener('click', async () => {
      try {
        await API.put(svc, P + path + '/' + obj.id, collect());
        App.toast('Gespeichert', 'ok'); m.close(); refresh();
      } catch (ex) { App.toast(ex.message, 'err'); }
    });
  }

  /* Naming / Medienverwaltung */
  async function cfgObj(el, path, title, labels) {
    const obj = await API.get(svc, P + path);
    const form = App.objForm(obj, labels);
    el.innerHTML = '';
    const card = h(`<div class="card"><div class="card-h"><h3>${esc(title)}</h3><span class="spacer"></span></div><div class="card-b"></div></div>`);
    const bSave = h(`<button class="btn btn-p btn-sm">Speichern</button>`);
    card.querySelector('.card-h').append(bSave);
    card.querySelector('.card-b').append(form.el);
    el.append(card);
    bSave.addEventListener('click', async () => {
      try { await API.put(svc, P + path, form.collect()); App.toast(title + ' gespeichert', 'ok'); }
      catch (e) { App.toast(e.message, 'err'); }
    });
  }

  return { render };
}

const _arrInstances = {};
function arrView(svc) {
  if (!_arrInstances[svc]) _arrInstances[svc] = ArrModule(svc);
  return _arrInstances[svc];
}
Views.sonarr = { title: 'Sonarr', render: el => arrView('sonarr').render(el) };
Views.radarr = { title: 'Radarr', render: el => arrView('radarr').render(el) };
