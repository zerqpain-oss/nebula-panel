'use strict';
/* ============ Gemeinsames Modul für Sonarr, Radarr, Lidarr & Readarr ============ */

const ARR_DEFS = {
  sonarr:  { api: '/api/v3', kind: 'series', items: '/series' },
  radarr:  { api: '/api/v3', kind: 'movie',  items: '/movie'  },
  lidarr:  { api: '/api/v1', kind: 'artist', items: '/artist' },
  readarr: { api: '/api/v1', kind: 'author', items: '/author' }
};

function ArrModule(svc) {
  const D = ARR_DEFS[svc];
  const M = SVC_META[svc];
  const P = D.api;
  const K = D.kind;
  const ITEMS = D.items;

  const KINDS = {
    series: { one: t('Serie'), many: t('Serien'), addPh: t('Serie suchen – Titel eingeben und Enter drücken…') },
    movie:  { one: t('Film'), many: t('Filme'), addPh: t('Film suchen – Titel eingeben und Enter drücken…') },
    artist: { one: t('Künstler'), many: t('Künstler'), addPh: t('Künstler suchen – Namen eingeben und Enter drücken…') },
    author: { one: t('Autor'), many: t('Autoren'), addPh: t('Autor suchen – Namen eingeben und Enter drücken…') }
  };
  const T = KINDS[K];
  const hasMetaProfile = (K === 'artist' || K === 'author');

  const st = { tab: 'lib', items: [], profiles: null, metas: null, roots: null, sub: 'profiles', libFilter: '', libSort: 'title' };

  const NAMING_LABELS = {
    renameEpisodes: 'Episoden umbenennen', renameMovies: 'Filme umbenennen', renameTracks: 'Titel umbenennen',
    renameBooks: 'Bücher umbenennen', replaceIllegalCharacters: 'Ungültige Zeichen ersetzen',
    colonReplacementFormat: 'Doppelpunkt-Ersetzung', standardEpisodeFormat: 'Standard-Episodenformat',
    dailyEpisodeFormat: 'Daily-Episodenformat', animeEpisodeFormat: 'Anime-Episodenformat',
    seriesFolderFormat: 'Serienordner-Format', seasonFolderFormat: 'Staffelordner-Format',
    specialsFolderFormat: 'Specials-Ordner-Format', multiEpisodeStyle: 'Multi-Episoden-Stil',
    standardMovieFormat: 'Standard-Filmformat', movieFolderFormat: 'Filmordner-Format',
    artistFolderFormat: 'Künstlerordner-Format', standardTrackFormat: 'Standard-Titelformat',
    multiDiscTrackFormat: 'Multi-Disc-Titelformat', authorFolderFormat: 'Autorordner-Format',
    standardBookFormat: 'Standard-Buchformat'
  };
  const MEDIA_LABELS = {
    autoUnmonitorPreviouslyDownloadedEpisodes: 'Gelöschte Episoden auf „unüberwacht"',
    autoUnmonitorPreviouslyDownloadedMovies: 'Gelöschte Filme auf „unüberwacht"',
    recycleBin: 'Papierkorb-Pfad', recycleBinCleanupDays: 'Papierkorb aufräumen (Tage)',
    downloadPropersAndRepacks: 'Propers & Repacks laden', createEmptySeriesFolders: 'Leere Serienordner anlegen',
    createEmptyMovieFolders: 'Leere Filmordner anlegen', createEmptyArtistFolders: 'Leere Künstlerordner anlegen',
    createEmptyAuthorFolders: 'Leere Autorordner anlegen', deleteEmptyFolders: 'Leere Ordner löschen',
    fileDate: 'Dateidatum setzen', rescanAfterRefresh: 'Rescan nach Aktualisierung',
    setPermissionsLinux: 'Linux-Berechtigungen setzen', chmodFolder: 'chmod (Ordner)', chownGroup: 'chown-Gruppe',
    episodeTitleRequired: 'Episodentitel erforderlich', skipFreeSpaceCheckWhenImporting: 'Speicherplatz-Check überspringen',
    minimumFreeSpaceWhenImporting: 'Min. freier Speicher (MB)', copyUsingHardlinks: 'Hardlinks statt Kopieren',
    importExtraFiles: 'Zusatzdateien importieren', extraFileExtensions: 'Zusatzdatei-Endungen',
    enableMediaInfo: 'MediaInfo aktivieren', watchLibraryForChanges: 'Bibliothek auf Änderungen überwachen'
  };
  const HIST_EVENTS = {
    grabbed: [t('Geholt'), 'b-acc'], downloadFolderImported: [t('Importiert'), 'b-ok'],
    downloadImported: [t('Importiert'), 'b-ok'], trackFileImported: [t('Importiert'), 'b-ok'],
    bookFileImported: [t('Importiert'), 'b-ok'], downloadFailed: [t('Fehlgeschlagen'), 'b-err'],
    episodeFileDeleted: [t('Datei gelöscht'), 'b-warn'], movieFileDeleted: [t('Datei gelöscht'), 'b-warn'],
    trackFileDeleted: [t('Datei gelöscht'), 'b-warn'], bookFileDeleted: [t('Datei gelöscht'), 'b-warn'],
    episodeFileRenamed: [t('Umbenannt'), 'b-mut'], movieFileRenamed: [t('Umbenannt'), 'b-mut'],
    trackFileRenamed: [t('Umbenannt'), 'b-mut'], downloadIgnored: [t('Ignoriert'), 'b-mut'],
    seriesFolderImported: [t('Ordner importiert'), 'b-ok'], movieFolderImported: [t('Ordner importiert'), 'b-ok']
  };

  /* ---------- Kind-spezifische Helfer ---------- */
  function titleOf(i) { return i.title || i.artistName || i.authorName || '?'; }
  function sortKeyOf(i) { return i.sortTitle || i.sortName || titleOf(i); }
  function itemSearchCmd(item) {
    if (K === 'series') return ['SeriesSearch', { seriesId: item.id }];
    if (K === 'movie') return ['MoviesSearch', { movieIds: [item.id] }];
    if (K === 'artist') return ['ArtistSearch', { artistId: item.id }];
    return ['AuthorSearch', { authorId: item.id }];
  }
  function refreshCmd(item) {
    if (K === 'series') return ['RefreshSeries', { seriesId: item.id }];
    if (K === 'movie') return ['RefreshMovie', { movieIds: [item.id] }];
    if (K === 'artist') return ['RefreshArtist', { artistId: item.id }];
    return ['RefreshAuthor', { authorId: item.id }];
  }
  const MISSING_ALL = { series: 'MissingEpisodeSearch', movie: 'MissingMoviesSearch', artist: 'MissingAlbumSearch', author: 'MissingBookSearch' }[K];

  function libSub(item) {
    const s = item.statistics || {};
    if (K === 'series') return s.episodeCount != null ? `${s.episodeFileCount}/${s.episodeCount} Ep.` : '';
    if (K === 'movie') return item.hasFile ? fmtBytes(sizeOf(item)) : t('Fehlt');
    if (K === 'artist') return s.albumCount != null ? tf('{0} Alben', s.albumCount) + (s.sizeOnDisk ? ' · ' + fmtBytes(s.sizeOnDisk) : '') : '';
    return s.bookCount != null ? tf('{0} Bücher', s.bookCount) : '';
  }

  async function ensureMeta(force) {
    if (force || !st.profiles) st.profiles = await API.get(svc, P + '/qualityprofile');
    if (force || !st.roots) st.roots = await API.get(svc, P + '/rootfolder');
    if (hasMetaProfile && (force || !st.metas)) {
      st.metas = await API.get(svc, P + '/metadataprofile').catch(() => []);
    }
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
    App.toast(msg || t('Suche gestartet'), 'ok');
  }

  /* ---------- Einstieg ---------- */
  async function render(el) {
    if (!App.svcGuard(svc, el)) return;
    el.innerHTML = `<div class="tabs" id="arrTabs"></div><div id="arrBody"></div>`;
    const tabs = [['lib', t('Bibliothek')], ['add', t('Hinzufügen')], ['cal', t('Kalender')], ['act', t('Aktivität')], ['wanted', t('Fehlend')], ['cfg', t('Einstellungen')]];
    const tabsEl = el.querySelector('#arrTabs');
    tabsEl.innerHTML = tabs.map(tb => `<span class="tab ${st.tab === tb[0] ? 'active' : ''}" data-t="${tb[0]}">${tb[1]}</span>`).join('');
    on(tabsEl, 'click', '.tab', (e, el2) => {
      st.tab = el2.dataset.t;
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
        <input class="inp grow" id="libQ" placeholder="${t('Bibliothek filtern…')}" value="${esc(st.libFilter)}">
        <select class="sel" id="libSort">
          <option value="title">${t('Nach Titel')}</option>
          <option value="added">${t('Zuletzt hinzugefügt')}</option>
          <option value="size">${t('Nach Größe')}</option>
        </select>
        <span class="chip">${icon(M.icon)}<b>${fmtNum(items.length)}</b>&nbsp;${T.many}</span>
      </div>
      <div class="pgrid" id="libGrid"></div>`;
    body.querySelector('#libSort').value = st.libSort;

    const grid = body.querySelector('#libGrid');
    const draw = () => {
      let arr = [...st.items];
      const q = st.libFilter.toLowerCase();
      if (q) arr = arr.filter(i => titleOf(i).toLowerCase().includes(q));
      if (st.libSort === 'title') arr.sort((a, b) => sortKeyOf(a) < sortKeyOf(b) ? -1 : 1);
      else if (st.libSort === 'added') arr.sort((a, b) => new Date(b.added) - new Date(a.added));
      else arr.sort((a, b) => sizeOf(b) - sizeOf(a));
      grid.innerHTML = arr.map(item => {
        const sub = libSub(item);
        return `<div class="poster" data-id="${item.id}" title="${esc(titleOf(item))}">
          <div class="p-fall">${esc(titleOf(item))}</div>
          ${posterImg(item)}
          <div class="p-tl">${K === 'movie' && !item.hasFile && item.monitored ? `<span class="badge b-warn">${t('Fehlt')}</span>` : ''}</div>
          <div class="p-tr"><span class="badge ${item.monitored ? 'b-acc' : 'b-mut'}" data-mon="${item.id}" title="${t('Überwachung umschalten')}" style="cursor:pointer">${icon('bookmark')}</span></div>
          <div class="p-grad"></div>
          <div class="p-info"><b>${esc(titleOf(item))}</b><span>${item.year || ''}${sub ? ' · ' + esc(sub) : ''}</span></div>
        </div>`;
      }).join('') || emptyBox('inbox', t('Keine Treffer'));
    };
    draw();

    body.querySelector('#libQ').addEventListener('input', e => { st.libFilter = e.target.value; draw(); });
    body.querySelector('#libSort').addEventListener('change', e => { st.libSort = e.target.value; draw(); });
    on(grid, 'click', '[data-mon]', async (e, el2) => {
      e.stopPropagation();
      const item = st.items.find(i => i.id === +el2.dataset.mon);
      if (!item) return;
      item.monitored = !item.monitored;
      try {
        await API.put(svc, P + ITEMS + '/' + item.id, item);
        App.toast(`${titleOf(item)}: ${item.monitored ? t('überwacht') : t('nicht mehr überwacht')}`, 'ok');
        draw();
      } catch (ex) { item.monitored = !item.monitored; App.toast(ex.message, 'err'); }
    });
    on(grid, 'click', '.poster', (e, el2) => {
      if (e.target.closest('[data-mon]')) return;
      const item = st.items.find(i => i.id === +el2.dataset.id);
      if (item) detailModal(item);
    });
  }

  /* ---------- Detail ---------- */
  function detailModal(item) {
    const facts = [
      [t('Status'), item.status], [t('Jahr'), item.year],
      [K === 'series' ? t('Sender') : t('Studio'), K === 'series' ? item.network : item.studio],
      [t('Qualitätsprofil'), profileName(item.qualityProfileId)],
      [t('Pfad'), item.path], [t('Größe'), fmtBytes(sizeOf(item))],
      [t('Genres'), (item.genres || []).slice(0, 4).join(', ')]
    ].filter(f => f[1] !== undefined && f[1] !== null && f[1] !== '' && f[1] !== '0 B');

    let childHtml = '';
    if (K === 'series' && Array.isArray(item.seasons)) {
      childHtml = `<div class="sec-title">${t('Staffeln')}</div><table class="tbl"><tbody>` +
        item.seasons.slice().reverse().map(sn => {
          const ss = sn.statistics || {};
          return `<tr>
            <td class="td-main">${sn.seasonNumber === 0 ? t('Specials') : tf('Staffel {0}', sn.seasonNumber)}</td>
            <td class="td-sub">${ss.episodeFileCount != null ? tf('{0} / {1} Episoden', ss.episodeFileCount, ss.episodeCount) : ''}</td>
            <td class="r" style="white-space:nowrap">
              <label class="switch" title="${t('Überwacht')}"><input type="checkbox" data-season="${sn.seasonNumber}" ${sn.monitored ? 'checked' : ''}><i></i></label>
              <button class="btn btn-ic btn-g" data-sseek="${sn.seasonNumber}" title="${t('Staffel suchen')}">${icon('search')}</button>
            </td></tr>`;
        }).join('') + '</tbody></table>';
    }
    if (K === 'movie' && item.movieFile) {
      const mf = item.movieFile;
      childHtml = `<div class="sec-title">${t('Datei')}</div>
        <div class="kv"><span>${t('Qualität')}</span><b>${esc(mf.quality && mf.quality.quality && mf.quality.quality.name || '?')}</b></div>
        <div class="kv"><span>${t('Größe')}</span><b>${fmtBytes(mf.size)}</b></div>
        <div class="kv"><span>${t('Pfad')}</span><span class="mono wrapline" style="color:var(--txt)">${esc(mf.relativePath || '')}</span></div>`;
    }
    if (K === 'artist' || K === 'author') {
      childHtml = `<div class="sec-title">${K === 'artist' ? t('Alben') : t('Bücher')}</div><div id="childList">${spinner()}</div>`;
    }

    const body = h(`<div>
      <div style="display:flex;gap:18px">
        <div style="flex:0 0 130px">${posterImg(item, 'width:130px;border-radius:10px')}</div>
        <div style="flex:1;min-width:0">
          <p style="color:var(--txt2);font-size:13px;margin-bottom:10px">${esc((item.overview || '').slice(0, 340))}${(item.overview || '').length > 340 ? '…' : ''}</p>
          ${facts.map(f => `<div class="kv"><span>${esc(f[0])}</span><span class="wrapline" style="text-align:right">${esc(String(f[1]))}</span></div>`).join('')}
        </div>
      </div>${childHtml}</div>`);

    const bSearch = h(`<button class="btn btn-p">${icon('search')} ${t('Suche starten')}</button>`);
    const bRefresh = h(`<button class="btn">${icon('refresh')} ${t('Aktualisieren')}</button>`);
    const bEdit = h(`<button class="btn">${icon('edit')} ${t('Bearbeiten')}</button>`);
    const bDel = h(`<button class="btn btn-d">${icon('trash')} ${t('Löschen')}</button>`);
    const m = App.modal({ title: titleOf(item), body, foot: [bDel, bEdit, bRefresh, bSearch], wide: true });

    /* Alben/Bücher nachladen */
    if (K === 'artist' || K === 'author') {
      const listPath = K === 'artist' ? `/album?artistId=${item.id}` : `/book?authorId=${item.id}`;
      API.get(svc, P + listPath).then(childs => {
        childs.sort((a, b) => new Date(b.releaseDate || 0) - new Date(a.releaseDate || 0));
        const wrap = body.querySelector('#childList');
        if (!wrap) return;
        wrap.innerHTML = `<table class="tbl"><tbody>${childs.map(c => {
          const cs = c.statistics || {};
          const done = K === 'artist'
            ? (cs.trackCount > 0 && cs.trackFileCount >= cs.trackCount)
            : (cs.bookFileCount > 0);
          return `<tr>
            <td class="td-main wrapline">${esc(c.title)}</td>
            <td class="td-sub" style="white-space:nowrap">${c.releaseDate ? new Date(c.releaseDate).getFullYear() : ''}${K === 'artist' && cs.trackCount != null ? ` · ${cs.trackFileCount}/${cs.trackCount}` : ''}</td>
            <td>${done ? `<span class="badge b-ok">${t('Vorhanden')}</span>` : ''}</td>
            <td class="r" style="white-space:nowrap">
              <label class="switch" title="${t('Überwacht')}"><input type="checkbox" data-child="${c.id}" ${c.monitored ? 'checked' : ''}><i></i></label>
              <button class="btn btn-ic btn-g" data-cseek="${c.id}" title="${t('Suchen')}">${icon('search')}</button>
            </td></tr>`;
        }).join('')}</tbody></table>` || emptyBox('inbox', t('Keine Einträge'));
      }).catch(e => {
        const wrap = body.querySelector('#childList');
        if (wrap) wrap.innerHTML = errBox(e.message);
      });
      on(body, 'change', '[data-child]', async (e, el2) => {
        const path = K === 'artist' ? '/album/monitor' : '/book/monitor';
        const key = K === 'artist' ? 'albumIds' : 'bookIds';
        try {
          await API.put(svc, P + path, { [key]: [+el2.dataset.child], monitored: el2.checked });
          App.toast(t('Gespeichert'), 'ok');
        } catch (ex) { App.toast(ex.message, 'err'); el2.checked = !el2.checked; }
      });
      on(body, 'click', '[data-cseek]', (e, el2) => {
        const name = K === 'artist' ? 'AlbumSearch' : 'BookSearch';
        const key = K === 'artist' ? 'albumIds' : 'bookIds';
        cmd(name, { [key]: [+el2.dataset.cseek] }, t('Suche gestartet'));
      });
    }

    const sc = itemSearchCmd(item), rc = refreshCmd(item);
    bSearch.addEventListener('click', () => cmd(sc[0], sc[1], t('Suche gestartet')));
    bRefresh.addEventListener('click', () => cmd(rc[0], rc[1], t('Aktualisierung gestartet')));
    bEdit.addEventListener('click', () => { m.close(); editModal(item); });
    bDel.addEventListener('click', async () => {
      const r = await App.confirm({
        title: tf('{0} löschen', T.one), msg: tf('„{0}" wirklich aus {1} entfernen?', titleOf(item), M.name),
        okLabel: t('Löschen'), danger: true,
        checks: [{ id: 'files', label: t('Dateien von der Festplatte löschen'), checked: false }]
      });
      if (!r) return;
      try {
        await API.del(svc, P + ITEMS + '/' + item.id + '?deleteFiles=' + !!r.files + '&addImportExclusion=false');
        App.toast(tf('{0} gelöscht', titleOf(item)), 'ok');
        m.close();
        if (st.tab === 'lib') showTab();
      } catch (ex) { App.toast(ex.message, 'err'); }
    });

    on(body, 'change', '[data-season]', async (e, el2) => {
      const sn = item.seasons.find(x => x.seasonNumber === +el2.dataset.season);
      sn.monitored = el2.checked;
      try { await API.put(svc, P + ITEMS + '/' + item.id, item); App.toast(t('Gespeichert'), 'ok'); }
      catch (ex) { App.toast(ex.message, 'err'); }
    });
    on(body, 'click', '[data-sseek]', (e, el2) =>
      cmd('SeasonSearch', { seriesId: item.id, seasonNumber: +el2.dataset.sseek }, t('Staffel-Suche gestartet')));
  }

  /* ---------- Bearbeiten ---------- */
  async function editModal(item) {
    await ensureMeta();
    const body = h(`<div>
      <div class="frow"><label class="lbl">${t('Überwacht')}</label>
        <label class="switch"><input type="checkbox" id="eMon" ${item.monitored ? 'checked' : ''}><i></i></label></div>
      <div class="frow"><label class="lbl">${t('Qualitätsprofil')}</label>
        <select class="sel" id="eProf">${st.profiles.map(p => `<option value="${p.id}" ${p.id === item.qualityProfileId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      ${hasMetaProfile && st.metas && st.metas.length ? `<div class="frow"><label class="lbl">${t('Metadaten-Profil')}</label>
        <select class="sel" id="eMeta">${st.metas.map(p => `<option value="${p.id}" ${p.id === item.metadataProfileId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>` : ''}
      ${K === 'movie' ? `<div class="frow"><label class="lbl">${t('Mindest-Verfügbarkeit')}</label>
        <select class="sel" id="eAvail">${['announced', 'inCinemas', 'released'].map(a => `<option value="${a}" ${item.minimumAvailability === a ? 'selected' : ''}>${a}</option>`).join('')}</select></div>` : ''}
      ${K === 'series' ? `<div class="frow"><label class="lbl">${t('Staffel-Ordner')}</label>
        <label class="switch"><input type="checkbox" id="eSf" ${item.seasonFolder ? 'checked' : ''}><i></i></label></div>` : ''}
      <div class="frow"><label class="lbl">${t('Pfad')}</label><input class="inp" id="ePath" value="${esc(item.path || '')}"></div>
    </div>`);
    const bSave = h(`<button class="btn btn-p">${t('Speichern')}</button>`);
    const m = App.modal({ title: tf('{0} bearbeiten', titleOf(item)), body, foot: [bSave] });
    bSave.addEventListener('click', async () => {
      item.monitored = body.querySelector('#eMon').checked;
      item.qualityProfileId = +body.querySelector('#eProf').value;
      item.path = body.querySelector('#ePath').value;
      const meta = body.querySelector('#eMeta');
      if (meta) item.metadataProfileId = +meta.value;
      if (K === 'movie') item.minimumAvailability = body.querySelector('#eAvail').value;
      if (K === 'series') item.seasonFolder = body.querySelector('#eSf').checked;
      try {
        await API.put(svc, P + ITEMS + '/' + item.id + '?moveFiles=false', item);
        App.toast(t('Gespeichert'), 'ok'); m.close();
        if (st.tab === 'lib') showTab();
      } catch (ex) { App.toast(ex.message, 'err'); }
    });
  }

  /* ---------- Hinzufügen ---------- */
  function renderAdd(body, preset) {
    body.innerHTML = `
      <div class="toolrow">
        <input class="inp grow search-lg" id="addQ" placeholder="${T.addPh}" value="${esc(preset || '')}">
        <button class="btn btn-p" id="addGo">${icon('search')} ${t('Suchen')}</button>
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
          return `<div class="poster" data-i="${i}" title="${esc(titleOf(r))}">
            <div class="p-fall">${esc(titleOf(r))}</div>
            ${src ? `<img loading="lazy" src="${esc(src)}" onerror="this.remove()">` : ''}
            <div class="p-tl">${r.id ? `<span class="badge b-ok">${t('Vorhanden')}</span>` : ''}</div>
            <div class="p-grad"></div>
            <div class="p-info"><b>${esc(titleOf(r))}</b><span>${r.year || ''}</span></div>
          </div>`;
        }).join('') || emptyBox('search', t('Keine Ergebnisse'))}</div>`;
        on(res, 'click', '.poster', (e, el2) => {
          const r = list[+el2.dataset.i];
          if (r.id) { detailModal(r); return; }
          addModal(r);
        });
      } catch (e) { res.innerHTML = errBox(e.message); }
    };
    q.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    body.querySelector('#addGo').addEventListener('click', go);
    q.focus();
    if (preset) go();
  }

  async function addModal(r) {
    await ensureMeta();
    if (!st.roots.length) { App.toast(t('Kein Root-Ordner konfiguriert – zuerst unter Einstellungen anlegen'), 'err'); return; }
    const seriesMon = [['all', t('Alle Episoden')], ['future', t('Zukünftige')], ['missing', t('Fehlende')], ['existing', t('Vorhandene')], ['firstSeason', t('Erste Staffel')], ['latestSeason', t('Neueste Staffel')], ['none', t('Keine')]];
    const genericMon = [['all', t('Alle')], ['future', t('Zukünftige')], ['missing', t('Fehlende')], ['existing', t('Vorhandene')], ['first', t('Erste')], ['latest', t('Neueste')], ['none', t('Keine')]];
    const body = h(`<div>
      <div class="frow"><label class="lbl">${t('Root-Ordner')}</label>
        <select class="sel" id="aRoot">${st.roots.map(x => `<option value="${esc(x.path)}">${esc(x.path)} (${tf('{0} frei', fmtBytes(x.freeSpace))})</option>`).join('')}</select></div>
      <div class="frow"><label class="lbl">${t('Qualitätsprofil')}</label>
        <select class="sel" id="aProf">${st.profiles.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
      ${hasMetaProfile && st.metas && st.metas.length ? `<div class="frow"><label class="lbl">${t('Metadaten-Profil')}</label>
        <select class="sel" id="aMeta">${st.metas.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>` : ''}
      ${K === 'series' ? `<div class="frow"><label class="lbl">${t('Überwachen')}</label>
        <select class="sel" id="aMon">${seriesMon.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select></div>
      <div class="frow"><label class="lbl">${t('Staffel-Ordner')}</label>
        <label class="switch"><input type="checkbox" id="aSf" checked><i></i></label></div>` : ''}
      ${K === 'movie' ? `<div class="frow"><label class="lbl">${t('Mindest-Verfügbarkeit')}</label>
        <select class="sel" id="aAvail"><option value="announced">${t('Angekündigt')}</option><option value="inCinemas">${t('Im Kino')}</option><option value="released" selected>${t('Veröffentlicht')}</option></select></div>` : ''}
      ${K === 'artist' || K === 'author' ? `<div class="frow"><label class="lbl">${t('Überwachen')}</label>
        <select class="sel" id="aMon">${genericMon.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select></div>` : ''}
      <div class="frow"><label class="lbl">${t('Nach dem Hinzufügen suchen')}</label>
        <label class="switch"><input type="checkbox" id="aSearch" checked><i></i></label></div>
    </div>`);
    const bAdd = h(`<button class="btn btn-p">${icon('plus')} ${t('Hinzufügen')}</button>`);
    const m = App.modal({ title: tf('{0} ({1}) hinzufügen', titleOf(r), r.year || '–'), body, foot: [bAdd] });
    bAdd.addEventListener('click', async () => {
      bAdd.disabled = true;
      const payload = Object.assign({}, r, {
        rootFolderPath: body.querySelector('#aRoot').value,
        qualityProfileId: +body.querySelector('#aProf').value,
        monitored: true
      });
      const meta = body.querySelector('#aMeta');
      if (meta) payload.metadataProfileId = +meta.value;
      const search = body.querySelector('#aSearch').checked;
      if (K === 'series') {
        payload.seasonFolder = body.querySelector('#aSf').checked;
        payload.addOptions = { monitor: body.querySelector('#aMon').value, searchForMissingEpisodes: search };
      } else if (K === 'movie') {
        payload.minimumAvailability = body.querySelector('#aAvail').value;
        payload.addOptions = { searchForMovie: search };
      } else if (K === 'artist') {
        payload.addOptions = { monitor: body.querySelector('#aMon').value, searchForMissingAlbums: search };
      } else {
        payload.addOptions = { monitor: body.querySelector('#aMon').value, searchForMissingBooks: search };
      }
      try {
        await API.post(svc, P + ITEMS, payload);
        App.toast(tf('{0} hinzugefügt', titleOf(r)), 'ok');
        m.close();
      } catch (ex) { App.toast(ex.message, 'err'); bAdd.disabled = false; }
    });
  }

  /* ---------- Kalender ---------- */
  async function renderCal(body) {
    const start = new Date(); start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 15 * 86400000);
    const range = `start=${start.toISOString()}&end=${end.toISOString()}`;
    const items = [];
    if (K === 'series') {
      (await API.get(svc, `${P}/calendar?${range}&includeSeries=true`)).forEach(e => items.push({
        date: e.airDateUtc, has: e.hasFile,
        label: `${(e.series && e.series.title) || '?'} · S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}`,
        sub: e.title || ''
      }));
    } else if (K === 'movie') {
      (await API.get(svc, `${P}/calendar?${range}`)).forEach(mv => {
        [['Kino', mv.inCinemas], ['Digital', mv.digitalRelease], ['Disc', mv.physicalRelease]]
          .filter(x => x[1] && new Date(x[1]) >= start && new Date(x[1]) < end)
          .forEach(d => items.push({ date: d[1], has: mv.hasFile, label: `${mv.title} (${mv.year})`, sub: tf('{0}-Release', t(d[0])) }));
      });
    } else if (K === 'artist') {
      (await API.get(svc, `${P}/calendar?${range}&includeArtist=true`)).forEach(a => items.push({
        date: a.releaseDate, has: null,
        label: `${(a.artist && a.artist.artistName) || '?'} – ${a.title}`, sub: t('Album')
      }));
    } else {
      (await API.get(svc, `${P}/calendar?${range}&includeAuthor=true`)).forEach(b => items.push({
        date: b.releaseDate, has: null,
        label: `${(b.author && b.author.authorName) || '?'} – ${b.title}`, sub: t('Buch')
      }));
    }
    items.sort((a, b) => new Date(a.date) - new Date(b.date));
    let html = '', lastDay = '';
    items.forEach(it => {
      const dl = dayLabel(it.date);
      if (dl !== lastDay) { html += `<div class="day-h">${icon('calendar')} ${dl}</div>`; lastDay = dl; }
      html += `<div class="list-item"><i class="dot" style="background:${M.color}"></i>
        <div class="li-main"><b>${esc(it.label)}</b><span>${esc(it.sub)}</span></div>
        ${it.has === true ? `<span class="badge b-ok">${t('Vorhanden')}</span>` : it.has === false ? `<span class="badge b-mut">${t('Ausstehend')}</span>` : ''}</div>`;
    });
    body.innerHTML = `<div class="card"><div class="card-h"><h3>${t('Kalender')}</h3><span class="sub">${t('gestern bis in 14 Tagen')}</span></div>
      <div class="card-b">${html || emptyBox('calendar', t('Keine Einträge im Zeitraum'))}</div></div>`;
  }

  /* ---------- Aktivität ---------- */
  async function renderAct(body) {
    body.innerHTML = `<div class="card" id="qWrap"></div><div class="card" id="hWrap" style="margin-top:16px"></div>`;
    await drawQueue();
    await drawHistory();
    App.every(6000, () => drawQueue(true));
  }

  function queueTitle(r) {
    if (K === 'series' && r.series) return `${r.series.title}${r.episode ? ` · S${String(r.episode.seasonNumber).padStart(2, '0')}E${String(r.episode.episodeNumber).padStart(2, '0')}` : ''}`;
    if (K === 'movie' && r.movie) return `${r.movie.title} (${r.movie.year})`;
    if (K === 'artist' && r.artist) return `${r.artist.artistName}${r.album ? ' – ' + r.album.title : ''}`;
    if (K === 'author' && r.author) return `${r.author.authorName}${r.book ? ' – ' + r.book.title : ''}`;
    return r.title || '?';
  }

  async function drawQueue(soft) {
    const wrap = document.getElementById('qWrap');
    if (!wrap) return;
    try {
      const inc = { series: 'includeSeries=true&includeEpisode=true', movie: 'includeMovie=true', artist: 'includeArtist=true&includeAlbum=true', author: 'includeAuthor=true&includeBook=true' }[K];
      const q = await API.get(svc, `${P}/queue?page=1&pageSize=80&${inc}`);
      const rows = (q.records || []).map(r => {
        const pct = r.size ? Math.max(0, Math.round((1 - r.sizeleft / r.size) * 100)) : 0;
        const stBadge = r.trackedDownloadState === 'importPending' ? `<span class="badge b-warn">${t('Import wartet')}</span>`
          : r.status === 'downloading' ? `<span class="badge b-acc">${t('Lädt')}</span>`
          : `<span class="badge b-mut">${esc(r.status || '?')}</span>`;
        return `<tr>
          <td><div class="td-main wrapline">${esc(queueTitle(r))}</div><div class="td-sub wrapline">${esc(r.title || '')}</div></td>
          <td style="white-space:nowrap">${esc(r.quality && r.quality.quality && r.quality.quality.name || '')}</td>
          <td style="min-width:120px"><div class="prog"><i style="width:${pct}%"></i></div><div class="td-sub" style="margin-top:4px">${pct}% · ${esc(r.timeleft || '–')}</div></td>
          <td>${stBadge}</td>
          <td class="r"><button class="btn btn-ic btn-g" data-qdel="${r.id}" title="${t('Entfernen')}">${icon('trash')}</button></td>
        </tr>`;
      }).join('');
      wrap.innerHTML = `<div class="card-h"><h3>${t('Warteschlange')}</h3><span class="sub">${tf('{0} Einträge', fmtNum(q.totalRecords || 0))}</span></div>
        <div class="card-b tight">${rows ? `<table class="tbl"><thead><tr><th>${t('Titel')}</th><th>${t('Qualität')}</th><th>${t('Fortschritt')}</th><th>${t('Status')}</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : emptyBox('inbox', t('Warteschlange ist leer'))}</div>`;
      on(wrap, 'click', '[data-qdel]', async (e, el2) => {
        const r = await App.confirm({
          title: t('Aus Warteschlange entfernen'), msg: t('Download wirklich entfernen?'), okLabel: t('Entfernen'), danger: true,
          checks: [
            { id: 'client', label: t('Auch im Download-Client löschen'), checked: true },
            { id: 'block', label: t('Release blocklisten'), checked: false }
          ]
        });
        if (!r) return;
        try {
          await API.del(svc, `${P}/queue/${el2.dataset.qdel}?removeFromClient=${!!r.client}&blocklist=${!!r.block}`);
          App.toast(t('Entfernt'), 'ok'); drawQueue();
        } catch (ex) { App.toast(ex.message, 'err'); }
      });
    } catch (e) {
      if (!soft) wrap.innerHTML = `<div class="card-h"><h3>${t('Warteschlange')}</h3></div><div class="card-b">${errBox(e.message)}</div>`;
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
      wrap.innerHTML = `<div class="card-h"><h3>${t('Historie')}</h3></div><div class="card-b" style="padding-top:6px">${rows || emptyBox('clock', t('Noch keine Historie'))}</div>`;
    } catch (e) {
      wrap.innerHTML = `<div class="card-h"><h3>${t('Historie')}</h3></div><div class="card-b">${errBox(e.message)}</div>`;
    }
  }

  /* ---------- Fehlend ---------- */
  async function renderWanted(body) {
    const paths = {
      series: `${P}/wanted/missing?page=1&pageSize=40&sortKey=airDateUtc&sortDirection=descending&includeSeries=true`,
      movie: `${P}/wanted/missing?page=1&pageSize=40&sortKey=title&sortDirection=ascending`,
      artist: `${P}/wanted/missing?page=1&pageSize=40&includeArtist=true`,
      author: `${P}/wanted/missing?page=1&pageSize=40&includeAuthor=true`
    };
    const w = await API.get(svc, paths[K]);
    const rows = (w.records || []).map(r => {
      let label, sub = '';
      if (K === 'series') {
        label = `${(r.series && r.series.title) || '?'} · S${String(r.seasonNumber).padStart(2, '0')}E${String(r.episodeNumber).padStart(2, '0')} – ${r.title || ''}`;
        sub = r.airDateUtc ? tf('Ausgestrahlt {0}', relTime(r.airDateUtc)) : '';
      } else if (K === 'movie') {
        label = `${r.title} (${r.year || '?'})`;
        sub = r.status || '';
      } else if (K === 'artist') {
        label = `${(r.artist && r.artist.artistName) || '?'} – ${r.title}`;
        sub = r.releaseDate ? relTime(r.releaseDate) : '';
      } else {
        label = `${(r.author && r.author.authorName) || '?'} – ${r.title}`;
        sub = r.releaseDate ? relTime(r.releaseDate) : '';
      }
      return `<div class="list-item">
        <div class="li-main"><b class="wrapline" style="white-space:normal">${esc(label)}</b><span>${esc(sub)}</span></div>
        <button class="btn btn-sm" data-ws="${r.id}">${icon('search')} ${t('Suchen')}</button>
      </div>`;
    }).join('');
    body.innerHTML = `<div class="card">
      <div class="card-h"><h3>${tf('Fehlende {0}', K === 'artist' ? t('Alben') : K === 'author' ? t('Bücher') : T.many)}</h3><span class="sub">${tf('{0} gesamt', fmtNum(w.totalRecords || 0))}</span>
        <span class="spacer"></span>
        <button class="btn btn-sm btn-p" id="wAll">${icon('zap')} ${t('Alle suchen')}</button>
      </div>
      <div class="card-b" style="padding-top:6px">${rows || emptyBox('check', t('Nichts fehlt – alles da!'))}</div></div>`;
    on(body, 'click', '[data-ws]', (e, el2) => {
      const id = +el2.dataset.ws;
      if (K === 'series') cmd('EpisodeSearch', { episodeIds: [id] });
      else if (K === 'movie') cmd('MoviesSearch', { movieIds: [id] });
      else if (K === 'artist') cmd('AlbumSearch', { albumIds: [id] });
      else cmd('BookSearch', { bookIds: [id] });
    });
    body.querySelector('#wAll').addEventListener('click', async () => {
      const r = await App.confirm({ title: t('Alle fehlenden suchen'), msg: t('Das kann viele Indexer-Anfragen auslösen. Fortfahren?'), okLabel: t('Suchen') });
      if (r) cmd(MISSING_ALL, {}, t('Suche nach allen fehlenden gestartet'));
    });
  }

  /* ---------- Einstellungen ---------- */
  async function renderCfg(body) {
    const subs = [['profiles', t('Qualitätsprofile')], ['roots', t('Root-Ordner')], ['indexer', 'Indexer'], ['dlc', t('Download-Clients')], ['naming', t('Benennung')], ['media', t('Medienverwaltung')]];
    body.innerHTML = `<div class="subtabs" id="cfgTabs">${subs.map(s =>
      `<span class="tab ${st.sub === s[0] ? 'active' : ''}" data-s="${s[0]}">${s[1]}</span>`).join('')}</div><div id="cfgBody">${spinner()}</div>`;
    const cfgBody = body.querySelector('#cfgBody');
    on(body.querySelector('#cfgTabs'), 'click', '.tab', (e, el2) => {
      st.sub = el2.dataset.s;
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
      else if (st.sub === 'naming') await cfgObj(el, '/config/naming', t('Benennung'), NAMING_LABELS);
      else await cfgObj(el, '/config/mediamanagement', t('Medienverwaltung'), MEDIA_LABELS);
    } catch (e) { el.innerHTML = errBox(e.message); }
  }

  async function cfgProfiles(el) {
    await ensureMeta(true);
    el.innerHTML = `<div class="grid g-cards">${st.profiles.map(p => {
      const flat = flattenQualities(p);
      const allowed = flat.filter(x => x.allowed).length;
      return `<div class="card"><div class="card-b">
        <div style="display:flex;align-items:center;gap:8px"><b style="font-size:15px;flex:1">${esc(p.name)}</b>
          <button class="btn btn-sm" data-pedit="${p.id}">${icon('edit')} ${t('Bearbeiten')}</button></div>
        <div class="td-sub" style="margin-top:8px">${tf('{0} von {1} Qualitäten erlaubt', allowed, flat.length)}</div>
        <div class="td-sub">${tf('Upgrade bis: {0}', `<b style="color:var(--txt)">${esc(cutoffName(p))}</b>`)} ${p.upgradeAllowed ? '' : '· ' + t('Upgrades aus')}</div>
      </div></div>`;
    }).join('')}</div>`;
    on(el, 'click', '[data-pedit]', (e, el2) => {
      const p = st.profiles.find(x => x.id === +el2.dataset.pedit);
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
      <div class="frow"><label class="lbl">${t('Name')}</label><input class="inp" id="pName" value="${esc(p.name)}"></div>
      <div class="frow"><label class="lbl">${t('Upgrades erlaubt')}</label>
        <label class="switch"><input type="checkbox" id="pUp" ${p.upgradeAllowed ? 'checked' : ''}><i></i></label></div>
      <div class="frow"><label class="lbl">${t('Upgrade bis (Cutoff)')}</label><select class="sel" id="pCut"></select></div>
      <div class="sec-title">${t('Erlaubte Qualitäten')} <span style="text-transform:none;font-weight:400">${t('(oben = beste)')}</span></div>
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
    const bSave = h(`<button class="btn btn-p">${t('Speichern')}</button>`);
    const m = App.modal({ title: tf('Profil: {0}', p.name), body, foot: [bSave] });
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
        App.toast(t('Profil gespeichert'), 'ok'); m.close();
        st.profiles = null; drawCfg(document.getElementById('cfgBody'));
      } catch (ex) { App.toast(ex.message, 'err'); }
    });
  }

  async function cfgRoots(el) {
    const roots = await API.get(svc, P + '/rootfolder');
    st.roots = roots;
    el.innerHTML = `
      <div class="toolrow"><input class="inp grow" id="rPath" placeholder="/pfad/zum/ordner">
        <button class="btn btn-p" id="rAdd">${icon('plus')} ${t('Hinzufügen')}</button></div>
      ${roots.map(r => `<div class="list-item">
        <div class="svc-ico" style="background:var(--card2)">${icon('folder')}</div>
        <div class="li-main"><b class="mono">${esc(r.path)}</b><span>${tf('{0} frei', fmtBytes(r.freeSpace))}</span></div>
        <button class="btn btn-ic btn-g" data-rdel="${r.id}">${icon('trash')}</button>
      </div>`).join('') || emptyBox('folder', t('Noch kein Root-Ordner'))}`;
    el.querySelector('#rAdd').addEventListener('click', async () => {
      const path = el.querySelector('#rPath').value.trim();
      if (!path) return;
      try { await API.post(svc, P + '/rootfolder', { path }); App.toast(t('Root-Ordner angelegt'), 'ok'); drawCfg(el); }
      catch (e) { App.toast(e.message, 'err'); }
    });
    on(el, 'click', '[data-rdel]', async (e, el2) => {
      const r = await App.confirm({ title: t('Root-Ordner entfernen'), msg: t('Nur der Eintrag wird entfernt, keine Dateien.'), okLabel: t('Entfernen'), danger: true });
      if (!r) return;
      try { await API.del(svc, P + '/rootfolder/' + el2.dataset.rdel); App.toast(t('Entfernt'), 'ok'); drawCfg(el); }
      catch (ex) { App.toast(ex.message, 'err'); }
    });
  }

  async function cfgProviders(el, path, label) {
    const list = await API.get(svc, P + path);
    el.innerHTML = `<div class="hint" style="margin-bottom:12px">${label === 'Indexer' ? t('Tipp: Indexer werden meist zentral über Prowlarr verwaltet und automatisch synchronisiert.') : ''}</div>` +
      (list.map(x => `<div class="list-item">
        <label class="switch" title="${t('Aktiv')}"><input type="checkbox" data-en="${x.id}" ${provEnabled(x) ? 'checked' : ''}><i></i></label>
        <div class="li-main"><b>${esc(x.name)}</b><span>${esc(x.implementationName || x.implementation || '')}${x.protocol ? ' · ' + esc(x.protocol) : ''}${x.priority != null ? ' · ' + tf('Priorität {0}', x.priority) : ''}</span></div>
        <button class="btn btn-sm" data-test="${x.id}">${icon('zap')} Test</button>
        <button class="btn btn-sm" data-edit="${x.id}">${icon('edit')}</button>
        <button class="btn btn-ic btn-g" data-del="${x.id}">${icon('trash')}</button>
      </div>`).join('') || emptyBox('server', tf('Kein {0} eingerichtet', label)));

    const byId = id => list.find(x => x.id === +id);
    on(el, 'change', '[data-en]', async (e, el2) => {
      const x = byId(el2.dataset.en);
      setProvEnabled(x, el2.checked);
      try { await API.put(svc, P + path + '/' + x.id, x); App.toast(tf(el2.checked ? 'Aktiviert: {0}' : 'Deaktiviert: {0}', x.name), 'ok'); }
      catch (ex) { App.toast(ex.message, 'err'); el2.checked = !el2.checked; }
    });
    on(el, 'click', '[data-test]', async (e, el2) => {
      const x = byId(el2.dataset.test);
      el2.disabled = true;
      try { await API.post(svc, P + path + '/test', x); App.toast(tf('{0}: Test erfolgreich', x.name), 'ok'); }
      catch (ex) { App.toast(x.name + ': ' + ex.message, 'err'); }
      el2.disabled = false;
    });
    on(el, 'click', '[data-edit]', (e, el2) => providerModal(byId(el2.dataset.edit), path, () => drawCfg(el)));
    on(el, 'click', '[data-del]', async (e, el2) => {
      const x = byId(el2.dataset.del);
      const r = await App.confirm({ title: tf('{0} löschen', label), msg: tf('„{0}" wirklich löschen?', x.name), okLabel: t('Löschen'), danger: true });
      if (!r) return;
      try { await API.del(svc, P + path + '/' + x.id); App.toast(t('Gelöscht'), 'ok'); drawCfg(el); }
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
      <div class="frow"><label class="lbl">${t('Name')}</label><input class="inp" id="xName" value="${esc(obj.name)}"></div>
      ${'priority' in obj ? `<div class="frow"><label class="lbl">${t('Priorität')}</label><input class="inp" type="number" id="xPrio" value="${esc(String(obj.priority))}"></div>` : ''}
      ${flags.map(k => `<div class="frow"><label class="lbl">${k === 'enable' ? t('Aktiv') : k === 'enableRss' ? 'RSS' : k === 'enableAutomaticSearch' ? t('Automatische Suche') : t('Interaktive Suche')}</label>
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
    const bSave = h(`<button class="btn btn-p">${t('Speichern')}</button>`);
    const m = App.modal({ title: tf('{0} bearbeiten', obj.name), body, foot: [bTest, bSave], wide: true });
    bTest.addEventListener('click', async () => {
      bTest.disabled = true;
      try { await API.post(svc, P + path + '/test', collect()); App.toast(t('Test erfolgreich'), 'ok'); }
      catch (ex) { App.toast(ex.message, 'err'); }
      bTest.disabled = false;
    });
    bSave.addEventListener('click', async () => {
      try {
        await API.put(svc, P + path + '/' + obj.id, collect());
        App.toast(t('Gespeichert'), 'ok'); m.close(); refresh();
      } catch (ex) { App.toast(ex.message, 'err'); }
    });
  }

  async function cfgObj(el, path, title, labels) {
    const obj = await API.get(svc, P + path);
    const form = App.objForm(obj, labels);
    el.innerHTML = '';
    const card = h(`<div class="card"><div class="card-h"><h3>${esc(title)}</h3><span class="spacer"></span></div><div class="card-b"></div></div>`);
    const bSave = h(`<button class="btn btn-p btn-sm">${t('Speichern')}</button>`);
    card.querySelector('.card-h').append(bSave);
    card.querySelector('.card-b').append(form.el);
    el.append(card);
    bSave.addEventListener('click', async () => {
      try { await API.put(svc, P + path, form.collect()); App.toast(tf('{0} gespeichert', title), 'ok'); }
      catch (e) { App.toast(e.message, 'err'); }
    });
  }

  /* Für die globale Suche: Lookup-Ergebnis öffnen */
  function openLookup(r) {
    if (r.id) detailModal(r);
    else addModal(r);
  }

  return { render, openLookup };
}

const _arrInstances = {};
function arrView(svc) {
  if (!_arrInstances[svc]) _arrInstances[svc] = ArrModule(svc);
  return _arrInstances[svc];
}
Views.sonarr = { title: 'Sonarr', render: el => arrView('sonarr').render(el) };
Views.radarr = { title: 'Radarr', render: el => arrView('radarr').render(el) };
Views.lidarr = { title: 'Lidarr', render: el => arrView('lidarr').render(el) };
Views.readarr = { title: 'Readarr', render: el => arrView('readarr').render(el) };
