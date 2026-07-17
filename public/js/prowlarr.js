'use strict';
/* ============ Prowlarr ============ */
Views.prowlarr = (() => {
  const P = '/api/v1';
  const st = { tab: 'idx', lastQuery: '', lastCat: '', lastIdx: '' };
  const CATS = [['', t('Alle Kategorien')], ['2000', t('Filme')], ['5000', t('Serien')], ['3000', t('Musik')], ['7000', t('Bücher')], ['8000', t('Sonstiges')]];

  async function render(main) {
    if (!App.svcGuard('prowlarr', main)) return;
    main.innerHTML = `<div class="tabs" id="prTabs">
      <span class="tab" data-t="idx">Indexer</span>
      <span class="tab" data-t="search">${t('Suchen')}</span>
      <span class="tab" data-t="stats">${t('Statistiken')}</span>
      <span class="tab" data-t="apps">${t('Apps')}</span>
    </div><div id="prBody"></div>`;
    const tabs = main.querySelector('#prTabs');
    tabs.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.t === st.tab));
    on(tabs, 'click', '.tab', (e, el) => {
      st.tab = el.dataset.t;
      tabs.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.t === st.tab));
      show();
    });
    show();
  }

  async function show() {
    App.clearViewTimers();
    const body = document.getElementById('prBody');
    if (!body) return;
    body.innerHTML = spinner();
    try {
      if (st.tab === 'idx') await renderIdx(body);
      else if (st.tab === 'search') await renderSearch(body);
      else if (st.tab === 'stats') await renderStats(body);
      else await renderApps(body);
    } catch (e) { body.innerHTML = errBox(e.message); }
  }

  /* ---------- Indexer ---------- */
  async function renderIdx(body) {
    const list = await API.get('prowlarr', P + '/indexer');
    body.innerHTML = `
      <div class="toolrow">
        <span class="chip">${icon('search')}${tf('{0} von {1} aktiv', `<b>${list.filter(i => i.enable).length}</b>`, `<b>${list.length}</b>`)}</span>
        <span class="grow"></span>
        <button class="btn" id="iTestAll">${icon('zap')} ${t('Alle testen')}</button>
        <button class="btn btn-p" id="iAdd">${icon('plus')} ${t('Indexer hinzufügen')}</button>
      </div>
      <div class="card"><div class="card-b" style="padding-top:6px">${list.map(x => `
        <div class="list-item">
          <label class="switch" title="${t('Aktiv')}"><input type="checkbox" data-en="${x.id}" ${x.enable ? 'checked' : ''}><i></i></label>
          <div class="li-main"><b>${esc(x.name)}</b>
            <span>${esc(x.protocol || '')} · ${esc(x.privacy || '')} · ${tf('Priorität {0}', x.priority)}</span></div>
          <button class="btn btn-sm" data-test="${x.id}">${icon('zap')} Test</button>
          <button class="btn btn-sm" data-edit="${x.id}">${icon('edit')}</button>
          <button class="btn btn-ic btn-g" data-del="${x.id}">${icon('trash')}</button>
        </div>`).join('') || emptyBox('search', t('Noch keine Indexer – über „Indexer hinzufügen" starten'))}</div></div>`;

    const byId = id => list.find(x => x.id === +id);
    document.getElementById('iTestAll').addEventListener('click', async e => {
      e.target.disabled = true;
      try { await API.post('prowlarr', P + '/indexer/testall'); App.toast(t('Alle Tests bestanden'), 'ok'); }
      catch (ex) { App.toast(tf('Mindestens ein Indexer schlägt fehl: {0}', ex.message), 'err'); }
      e.target.disabled = false;
    });
    document.getElementById('iAdd').addEventListener('click', addIndexer);
    on(body, 'change', '[data-en]', async (e, el) => {
      const x = byId(el.dataset.en);
      x.enable = el.checked;
      try { await API.put('prowlarr', P + '/indexer/' + x.id, x); App.toast(tf(x.enable ? 'Aktiviert: {0}' : 'Deaktiviert: {0}', x.name), 'ok'); }
      catch (ex) { App.toast(ex.message, 'err'); el.checked = !el.checked; }
    });
    on(body, 'click', '[data-test]', async (e, el) => {
      el.disabled = true;
      try { await API.post('prowlarr', P + '/indexer/test', byId(el.dataset.test)); App.toast(t('Test erfolgreich'), 'ok'); }
      catch (ex) { App.toast(ex.message, 'err'); }
      el.disabled = false;
    });
    on(body, 'click', '[data-edit]', (e, el) => idxModal(structuredClone(byId(el.dataset.edit)), false));
    on(body, 'click', '[data-del]', async (e, el) => {
      const x = byId(el.dataset.del);
      const r = await App.confirm({ title: tf('{0} löschen', 'Indexer'), msg: tf('„{0}" wirklich löschen?', x.name), okLabel: t('Löschen'), danger: true });
      if (!r) return;
      try { await API.del('prowlarr', P + '/indexer/' + x.id); App.toast(t('Gelöscht'), 'ok'); show(); }
      catch (ex) { App.toast(ex.message, 'err'); }
    });
  }

  async function addIndexer() {
    const m = App.modal({ title: t('Indexer hinzufügen'), body: spinner(), wide: true });
    let schema;
    try { schema = await API.get('prowlarr', P + '/indexer/schema'); }
    catch (e) { m.bodyEl.innerHTML = errBox(e.message); return; }
    schema.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const draw = q => {
      const list = schema.filter(s => !q || (s.name || '').toLowerCase().includes(q));
      m.bodyEl.querySelector('#schemaList').innerHTML = list.slice(0, 60).map(s =>
        `<div class="list-item clickable" data-pick="${esc(s.implementation)}::${esc(s.name)}">
          <div class="li-main"><b>${esc(s.name)}</b><span>${esc(s.protocol || '')} · ${esc(s.privacy || '')}${s.language ? ' · ' + esc(s.language) : ''}</span></div>
          ${icon('chevr')}
        </div>`).join('') || emptyBox('search', t('Nichts gefunden'));
    };
    m.bodyEl.innerHTML = `<input class="inp" id="schemaQ" placeholder="${tf('Indexer suchen… ({0} verfügbar)', schema.length)}" style="margin-bottom:12px"><div id="schemaList" style="max-height:50vh;overflow-y:auto"></div>`;
    draw('');
    m.bodyEl.querySelector('#schemaQ').addEventListener('input', e => draw(e.target.value.toLowerCase()));
    on(m.bodyEl, 'click', '[data-pick]', (e, el) => {
      const [impl, name] = el.dataset.pick.split('::');
      const def = schema.find(s => s.implementation === impl && s.name === name) || schema.find(s => s.name === name);
      if (!def) return;
      m.close();
      idxModal(structuredClone(def), true);
    });
  }

  async function idxModal(obj, isNew) {
    if (isNew) {
      obj.enable = true;
      if (!obj.appProfileId) {
        try {
          const profs = await API.get('prowlarr', P + '/appprofile');
          if (profs.length) obj.appProfileId = profs[0].id;
        } catch (e) {}
      }
    }
    const fe = App.fieldsEditor(obj.fields || []);
    const head = h(`<div>
      <div class="frow"><label class="lbl">${t('Name')}</label><input class="inp" id="iName" value="${esc(obj.name || '')}"></div>
      <div class="frow"><label class="lbl">${t('Aktiv')}</label><label class="switch"><input type="checkbox" id="iEn" ${obj.enable ? 'checked' : ''}><i></i></label></div>
      <div class="frow"><label class="lbl">${t('Priorität (1–50)')}</label><input class="inp" type="number" id="iPrio" value="${esc(String(obj.priority != null ? obj.priority : 25))}"></div>
    </div>`);
    const body = h('<div></div>');
    body.append(head, fe.el);
    const collect = () => {
      obj.name = head.querySelector('#iName').value;
      obj.enable = head.querySelector('#iEn').checked;
      obj.priority = +head.querySelector('#iPrio').value || 25;
      fe.collect();
      return obj;
    };
    const bTest = h(`<button class="btn">${icon('zap')} Test</button>`);
    const bSave = h(`<button class="btn btn-p">${isNew ? t('Hinzufügen') : t('Speichern')}</button>`);
    const m = App.modal({ title: isNew ? tf('Neu: {0}', obj.name || 'Indexer') : (obj.name || 'Indexer'), body, foot: [bTest, bSave], wide: true });
    bTest.addEventListener('click', async () => {
      bTest.disabled = true;
      try { await API.post('prowlarr', P + '/indexer/test', collect()); App.toast(t('Test erfolgreich'), 'ok'); }
      catch (ex) { App.toast(ex.message, 'err'); }
      bTest.disabled = false;
    });
    bSave.addEventListener('click', async () => {
      try {
        if (isNew) await API.post('prowlarr', P + '/indexer', collect());
        else await API.put('prowlarr', P + '/indexer/' + obj.id, collect());
        App.toast(isNew ? t('Indexer hinzugefügt') : t('Gespeichert'), 'ok');
        m.close();
        if (st.tab === 'idx') show();
      } catch (ex) { App.toast(ex.message, 'err'); }
    });
  }

  /* ---------- Suche ---------- */
  async function renderSearch(body) {
    let indexers = [];
    try { indexers = await API.get('prowlarr', P + '/indexer'); } catch (e) {}
    body.innerHTML = `
      <div class="toolrow">
        <input class="inp grow search-lg" id="sQ" placeholder="${t('Suchbegriff… (Enter)')}" value="${esc(st.lastQuery)}">
        <select class="sel" id="sCat">${CATS.map(c => `<option value="${c[0]}" ${st.lastCat === c[0] ? 'selected' : ''}>${c[1]}</option>`).join('')}</select>
        <select class="sel" id="sIdx"><option value="">${t('Alle Indexer')}</option>${indexers.filter(i => i.enable).map(i =>
          `<option value="${i.id}" ${st.lastIdx === String(i.id) ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select>
        <button class="btn btn-p" id="sGo">${icon('search')} ${t('Suchen')}</button>
      </div>
      <div id="sRes"></div>`;
    const q = body.querySelector('#sQ');
    const res = body.querySelector('#sRes');
    const go = async () => {
      if (!q.value.trim()) return;
      st.lastQuery = q.value.trim();
      st.lastCat = body.querySelector('#sCat').value;
      st.lastIdx = body.querySelector('#sIdx').value;
      res.innerHTML = spinner();
      try {
        let qs = 'query=' + encodeURIComponent(st.lastQuery) + '&type=search&limit=150';
        if (st.lastCat) qs += '&categories=' + st.lastCat;
        if (st.lastIdx) qs += '&indexerIds=' + st.lastIdx;
        const list = await API.get('prowlarr', P + '/search?' + qs);
        list.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));
        res.innerHTML = `<div class="card"><div class="card-h"><h3>${t('Ergebnisse')}</h3><span class="sub">${tf('{0} Treffer', fmtNum(list.length))}</span></div>
          <div class="card-b tight"><table class="tbl"><thead><tr><th>${t('Titel')}</th><th>Indexer</th><th>${t('Größe')}</th><th>${t('Seeder')}</th><th>${t('Alter')}</th><th></th></tr></thead><tbody>
          ${list.slice(0, 150).map((r, i) => `<tr>
            <td style="max-width:480px"><div class="td-main wrapline">${r.infoUrl ? `<a href="${esc(r.infoUrl)}" target="_blank" rel="noopener">${esc(r.title)}</a>` : esc(r.title)}</div></td>
            <td style="white-space:nowrap">${esc(r.indexer || '')} <span class="badge ${r.protocol === 'torrent' ? 'b-acc' : 'b-mut'}">${esc(r.protocol || '')}</span></td>
            <td style="white-space:nowrap">${fmtBytes(r.size)}</td>
            <td>${r.protocol === 'torrent' ? `<span style="color:var(--ok)">${r.seeders != null ? r.seeders : '?'}</span> / ${r.leechers != null ? r.leechers : '?'}` : (r.grabs != null ? r.grabs + ' Grabs' : '–')}</td>
            <td style="white-space:nowrap">${r.publishDate ? relTime(r.publishDate) : '–'}</td>
            <td class="r"><button class="btn btn-sm btn-p" data-grab="${i}">${icon('download')} Grab</button></td>
          </tr>`).join('')}</tbody></table>${list.length ? '' : emptyBox('search', t('Keine Treffer'))}</div></div>`;
        on(res, 'click', '[data-grab]', async (e, el) => {
          const r = list[+el.dataset.grab];
          el.disabled = true;
          try {
            await API.post('prowlarr', P + '/search', { guid: r.guid, indexerId: r.indexerId });
            App.toast(t('An Download-Client übergeben'), 'ok');
          } catch (ex) { App.toast(ex.message, 'err'); el.disabled = false; }
        });
      } catch (e) { res.innerHTML = errBox(e.message); }
    };
    q.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    body.querySelector('#sGo').addEventListener('click', go);
    q.focus();
    if (st._auto && st.lastQuery) { st._auto = false; go(); }
  }

  /* ---------- Statistiken ---------- */
  async function renderStats(body) {
    const j = await API.get('prowlarr', P + '/indexerstats');
    const list = (j.indexers || []).sort((a, b) => (b.numberOfQueries || 0) - (a.numberOfQueries || 0));
    const maxQ = Math.max(...list.map(x => x.numberOfQueries || 0), 1);
    body.innerHTML = `<div class="card"><div class="card-h"><h3>${t('Indexer-Statistiken')}</h3></div>
      <div class="card-b tight"><table class="tbl"><thead><tr><th>Indexer</th><th style="width:30%">${t('Anfragen')}</th><th>Grabs</th><th>${t('Fehler')}</th><th>${t('Ø Antwortzeit')}</th></tr></thead><tbody>
      ${list.map(x => {
        const fails = (x.numberOfFailedQueries || 0) + (x.numberOfFailedGrabs || 0);
        const failRate = x.numberOfQueries ? Math.round(fails / x.numberOfQueries * 100) : 0;
        return `<tr>
          <td class="td-main">${esc(x.indexerName)}</td>
          <td><div class="prog p-ok" style="margin-bottom:3px"><i style="width:${Math.round((x.numberOfQueries || 0) / maxQ * 100)}%"></i></div>
            <span class="td-sub">${fmtNum(x.numberOfQueries || 0)}</span></td>
          <td>${fmtNum(x.numberOfGrabs || 0)}</td>
          <td>${fails ? `<span style="color:${failRate > 20 ? 'var(--err)' : 'var(--warn)'}">${fmtNum(fails)}</span>` : '0'}</td>
          <td>${x.averageResponseTime ? x.averageResponseTime + ' ms' : '–'}</td>
        </tr>`;
      }).join('')}</tbody></table>${list.length ? '' : emptyBox('activity', t('Noch keine Statistiken'))}</div></div>`;
  }

  /* ---------- Apps ---------- */
  async function renderApps(body) {
    const apps = await API.get('prowlarr', P + '/applications');
    const SYNC = { disabled: [t('Deaktiviert'), 'b-mut'], addOnly: [t('Nur hinzufügen'), 'b-warn'], fullSync: [t('Voll-Sync'), 'b-ok'] };
    body.innerHTML = `
      <div class="toolrow">
        <span class="hint">${t('Verbundene Apps erhalten Indexer automatisch per Sync.')}</span>
        <span class="grow"></span>
        <button class="btn" id="aTestAll">${icon('zap')} ${t('Alle testen')}</button>
        <button class="btn btn-p" id="aSync">${icon('refresh')} ${t('Indexer synchronisieren')}</button>
      </div>
      <div class="card"><div class="card-b" style="padding-top:6px">${apps.map(a => {
        const sy = SYNC[a.syncLevel] || [a.syncLevel, 'b-mut'];
        return `<div class="list-item">
          <div class="svc-ico" style="background:var(--card2)">${icon('link')}</div>
          <div class="li-main"><b>${esc(a.name)}</b><span>${esc(a.implementationName || a.implementation || '')}</span></div>
          <span class="badge ${sy[1]}">${esc(sy[0])}</span>
          <button class="btn btn-sm" data-atest="${a.id}">${icon('zap')} Test</button>
        </div>`;
      }).join('') || emptyBox('link', t('Keine Apps verbunden (in Prowlarr unter Settings → Apps)'))}</div></div>`;
    document.getElementById('aSync').addEventListener('click', async () => {
      try { await API.post('prowlarr', P + '/command', { name: 'ApplicationIndexerSync' }); App.toast(t('Sync gestartet'), 'ok'); }
      catch (e) { App.toast(e.message, 'err'); }
    });
    document.getElementById('aTestAll').addEventListener('click', async e => {
      e.target.disabled = true;
      try { await API.post('prowlarr', P + '/applications/testall'); App.toast(t('Alle Tests bestanden'), 'ok'); }
      catch (ex) { App.toast(ex.message, 'err'); }
      e.target.disabled = false;
    });
    on(body, 'click', '[data-atest]', async (e, el) => {
      const a = apps.find(x => x.id === +el.dataset.atest);
      el.disabled = true;
      try { await API.post('prowlarr', P + '/applications/test', a); App.toast(tf('{0}: Test erfolgreich', a.name), 'ok'); }
      catch (ex) { App.toast(a.name + ': ' + ex.message, 'err'); }
      el.disabled = false;
    });
  }

  function preset(q) {
    st.tab = 'search';
    st.lastQuery = q;
    st._auto = true;
  }

  return { title: 'Prowlarr', render, preset };
})();
