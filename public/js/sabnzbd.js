'use strict';
/* ============ SABnzbd ============ */
Views.sabnzbd = (() => {
  const st = { tab: 'queue', failedOnly: false, cats: [] };
  const PRIOS = [[2, 'Force'], [1, 'Hoch'], [0, 'Normal'], [-1, 'Niedrig']];

  async function render(main) {
    if (!App.svcGuard('sabnzbd', main)) return;
    main.innerHTML = `<div class="tabs" id="sabTabs">
      <span class="tab" data-t="queue">Warteschlange</span>
      <span class="tab" data-t="hist">Historie</span>
      <span class="tab" data-t="cfg">Einstellungen</span>
    </div><div id="sabBody"></div>`;
    const tabs = main.querySelector('#sabTabs');
    tabs.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.t === st.tab));
    on(tabs, 'click', '.tab', (e, t) => {
      st.tab = t.dataset.t;
      tabs.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.t === st.tab));
      show();
    });
    show();
  }

  async function show() {
    App.clearViewTimers();
    const body = document.getElementById('sabBody');
    if (!body) return;
    body.innerHTML = spinner();
    try {
      if (st.tab === 'queue') await renderQueue(body);
      else if (st.tab === 'hist') await renderHist(body);
      else await renderCfg(body);
    } catch (e) { body.innerHTML = errBox(e.message); }
  }

  async function loadCats() {
    try { st.cats = (await API.sab('mode=get_cats')).categories || []; } catch (e) { st.cats = []; }
  }

  /* ---------- Warteschlange ---------- */
  async function renderQueue(body) {
    await loadCats();
    body.innerHTML = `<div class="card" id="qCtl"></div>
      <div class="card" id="qList" style="margin-top:16px"></div>
      <div class="card" style="margin-top:16px"><div class="card-h"><h3>NZB hinzufügen</h3></div>
      <div class="card-b"><div class="toolrow" style="margin:0">
        <input class="inp grow" id="nzbUrl" placeholder="NZB-URL einfügen…">
        <select class="sel" id="nzbCat"><option value="">Standard-Kategorie</option>${st.cats.filter(c => c !== '*').map(c => `<option>${esc(c)}</option>`).join('')}</select>
        <button class="btn btn-p" id="nzbAdd">${icon('plus')} Hinzufügen</button>
      </div></div></div>`;
    document.getElementById('nzbAdd').addEventListener('click', async () => {
      const url = document.getElementById('nzbUrl').value.trim();
      if (!url) return;
      const cat = document.getElementById('nzbCat').value;
      try {
        const r = await API.sab('mode=addurl&name=' + encodeURIComponent(url) + (cat ? '&cat=' + encodeURIComponent(cat) : ''));
        if (r.status === false) throw new Error((r.error) || 'Fehler beim Hinzufügen');
        App.toast('NZB hinzugefügt', 'ok');
        document.getElementById('nzbUrl').value = '';
        draw();
      } catch (e) { App.toast(e.message, 'err'); }
    });
    await draw();
    App.every(4000, draw);
  }

  async function draw() {
    const ctl = document.getElementById('qCtl');
    const listEl = document.getElementById('qList');
    if (!ctl || !listEl) return;
    let q;
    try { q = (await API.sab('mode=queue&start=0&limit=100')).queue; } catch (e) { return; }
    S.sab = q;
    const kb = Number(q.kbpersec) || 0;
    S.speedHist.push(kb);
    if (S.speedHist.length > 80) S.speedHist.shift();

    ctl.innerHTML = `<div class="card-b" style="display:flex;gap:20px;flex-wrap:wrap;align-items:center">
      <div><div class="stat-big" style="color:${q.paused ? 'var(--warn)' : 'var(--acc2)'}">${q.paused ? 'Pausiert' : fmtBytes(kb * 1024) + '/s'}</div>
        <div class="stat-lbl">${esc(q.sizeleft || '0')} übrig · ${esc(q.timeleft || '–')}</div></div>
      <div style="flex:1;min-width:160px">${Views.dashboard.spark(S.speedHist)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn ${q.paused ? 'btn-p' : ''}" id="qPause">${icon(q.paused ? 'play' : 'pause')} ${q.paused ? 'Fortsetzen' : 'Pausieren'}</button>
        <select class="sel" id="qPauseFor" style="width:auto">
          <option value="">Pause für…</option><option value="15">15 Min</option><option value="30">30 Min</option>
          <option value="60">1 Std</option><option value="180">3 Std</option><option value="360">6 Std</option>
        </select>
        <button class="btn btn-d" id="qClear">${icon('trash')} Leeren</button>
      </div>
      <div style="flex-basis:100%;display:flex;gap:12px;align-items:center">
        <span class="lbl" style="white-space:nowrap">Tempolimit: <b id="slVal" style="color:var(--txt)">${q.speedlimit && +q.speedlimit < 100 ? q.speedlimit + '%' : 'aus'}</b></span>
        <input type="range" id="slRange" min="5" max="100" step="5" value="${Math.min(+q.speedlimit || 100, 100)}">
        <input class="inp" id="slAbs" placeholder="z. B. 5M" style="width:90px" title="Absolut, z. B. 800K oder 5M">
        <button class="btn btn-sm" id="slSet">Setzen</button>
      </div>
    </div>`;

    const rows = (q.slots || []).map(s => `
      <tr>
        <td><div class="td-main wrapline">${esc(s.filename)}</div>
          <div class="td-sub">${esc(s.size)} · ${esc(s.timeleft)} übrig · ${esc(s.status)}</div></td>
        <td><select class="sel" data-cat="${esc(s.nzo_id)}" style="width:110px;padding:5px 26px 5px 8px">${st.cats.map(c =>
          `<option ${c === s.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></td>
        <td><select class="sel" data-prio="${esc(s.nzo_id)}" style="width:100px;padding:5px 26px 5px 8px">${PRIOS.map(p =>
          `<option value="${p[0]}" ${String(s.priority) === String(p[1]) || String(s.priority) === String(p[0]) ? 'selected' : ''}>${p[1]}</option>`).join('')}</select></td>
        <td style="min-width:130px"><div class="prog"><i style="width:${esc(s.percentage)}%"></i></div>
          <div class="td-sub" style="margin-top:4px">${esc(s.percentage)}%</div></td>
        <td class="r" style="white-space:nowrap">
          <button class="btn btn-ic btn-g" data-tgl="${esc(s.nzo_id)}" data-paused="${s.status === 'Paused' ? 1 : 0}" title="${s.status === 'Paused' ? 'Fortsetzen' : 'Pausieren'}">${icon(s.status === 'Paused' ? 'play' : 'pause')}</button>
          <button class="btn btn-ic btn-g" data-del="${esc(s.nzo_id)}" title="Löschen">${icon('trash')}</button>
        </td>
      </tr>`).join('');
    listEl.innerHTML = `<div class="card-h"><h3>Warteschlange</h3><span class="sub">${fmtNum(q.noofslots)} Jobs</span></div>
      <div class="card-b tight">${rows ? `<table class="tbl"><thead><tr><th>Name</th><th>Kategorie</th><th>Priorität</th><th>Fortschritt</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : emptyBox('inbox', 'Warteschlange ist leer')}</div>`;

    /* Controls */
    document.getElementById('qPause').onclick = async () => {
      await API.sab('mode=' + (q.paused ? 'resume' : 'pause'));
      App.toast(q.paused ? 'Downloads fortgesetzt' : 'Downloads pausiert', 'ok');
      draw();
    };
    document.getElementById('qPauseFor').onchange = async e => {
      if (!e.target.value) return;
      await API.sab('mode=config&name=set_pause&value=' + e.target.value);
      App.toast('Pausiert für ' + e.target.value + ' Minuten', 'ok');
      draw();
    };
    document.getElementById('qClear').onclick = async () => {
      const r = await App.confirm({ title: 'Warteschlange leeren', msg: 'Alle Jobs entfernen?', okLabel: 'Leeren', danger: true, checks: [{ id: 'files', label: 'Auch heruntergeladene Dateien löschen', checked: false }] });
      if (!r) return;
      await API.sab('mode=queue&name=delete&value=all' + (r.files ? '&del_files=1' : ''));
      App.toast('Warteschlange geleert', 'ok');
      draw();
    };
    const slRange = document.getElementById('slRange');
    slRange.oninput = () => document.getElementById('slVal').textContent = slRange.value + '%';
    slRange.onchange = async () => {
      await API.sab('mode=config&name=speedlimit&value=' + slRange.value);
      App.toast('Tempolimit: ' + slRange.value + '%', 'ok');
    };
    document.getElementById('slSet').onclick = async () => {
      const v = document.getElementById('slAbs').value.trim();
      if (!v) return;
      await API.sab('mode=config&name=speedlimit&value=' + encodeURIComponent(v));
      App.toast('Tempolimit: ' + v, 'ok');
      draw();
    };
    on(listEl, 'change', '[data-cat]', async (e, t) => {
      await API.sab('mode=change_cat&value=' + encodeURIComponent(t.dataset.cat) + '&value2=' + encodeURIComponent(t.value));
      App.toast('Kategorie geändert', 'ok');
    });
    on(listEl, 'change', '[data-prio]', async (e, t) => {
      await API.sab('mode=queue&name=priority&value=' + encodeURIComponent(t.dataset.prio) + '&value2=' + t.value);
      App.toast('Priorität geändert', 'ok');
      draw();
    });
    on(listEl, 'click', '[data-tgl]', async (e, t) => {
      const paused = t.dataset.paused === '1';
      await API.sab('mode=queue&name=' + (paused ? 'resume' : 'pause') + '&value=' + encodeURIComponent(t.dataset.tgl));
      draw();
    });
    on(listEl, 'click', '[data-del]', async (e, t) => {
      const r = await App.confirm({ title: 'Job löschen', msg: 'Download aus der Warteschlange entfernen?', okLabel: 'Löschen', danger: true, checks: [{ id: 'files', label: 'Dateien löschen', checked: true }] });
      if (!r) return;
      await API.sab('mode=queue&name=delete&value=' + encodeURIComponent(t.dataset.del) + (r.files ? '&del_files=1' : ''));
      App.toast('Gelöscht', 'ok');
      draw();
    });
  }

  /* ---------- Historie ---------- */
  async function renderHist(body) {
    const j = await API.sab('mode=history&start=0&limit=60&failed_only=' + (st.failedOnly ? 1 : 0));
    const hist = j.history || {};
    const rows = (hist.slots || []).map(s => {
      const failed = s.status === 'Failed';
      return `<div class="list-item">
        <span class="badge ${failed ? 'b-err' : s.status === 'Completed' ? 'b-ok' : 'b-mut'}" style="flex:0 0 auto">${esc(s.status)}</span>
        <div class="li-main"><b class="wrapline" style="white-space:normal">${esc(s.name)}</b>
          <span>${esc(s.category || '')} · ${esc(s.size || '')} · ${s.completed ? relTime(s.completed * 1000) : ''}${failed && s.fail_message ? ' · ' + esc(s.fail_message) : ''}</span></div>
        ${failed ? `<button class="btn btn-sm" data-retry="${esc(s.nzo_id)}">${icon('refresh')} Retry</button>` : ''}
        <button class="btn btn-ic btn-g" data-hdel="${esc(s.nzo_id)}">${icon('trash')}</button>
      </div>`;
    }).join('');
    body.innerHTML = `<div class="card">
      <div class="card-h"><h3>Historie</h3><span class="sub">${fmtNum(hist.noofslots || 0)} Einträge</span>
        <span class="spacer"></span>
        <label style="display:flex;gap:8px;align-items:center;cursor:pointer"><span class="lbl">Nur Fehler</span>
          <span class="switch"><input type="checkbox" id="hFail" ${st.failedOnly ? 'checked' : ''}><i></i></span></label>
        <button class="btn btn-sm btn-d" id="hClearFail">${icon('trash')} Fehlgeschlagene löschen</button>
      </div>
      <div class="card-b" style="padding-top:6px">${rows || emptyBox('clock', 'Keine Einträge')}</div></div>`;
    document.getElementById('hFail').addEventListener('change', e => { st.failedOnly = e.target.checked; show(); });
    document.getElementById('hClearFail').addEventListener('click', async () => {
      const r = await App.confirm({ title: 'Fehlgeschlagene löschen', msg: 'Alle fehlgeschlagenen Einträge aus der Historie entfernen?', okLabel: 'Löschen', danger: true });
      if (!r) return;
      await API.sab('mode=history&name=delete&value=failed');
      App.toast('Bereinigt', 'ok');
      show();
    });
    on(body, 'click', '[data-retry]', async (e, t) => {
      await API.sab('mode=retry&value=' + encodeURIComponent(t.dataset.retry));
      App.toast('Neu gestartet', 'ok');
      show();
    });
    on(body, 'click', '[data-hdel]', async (e, t) => {
      await API.sab('mode=history&name=delete&value=' + encodeURIComponent(t.dataset.hdel));
      App.toast('Eintrag gelöscht', 'ok');
      show();
    });
  }

  /* ---------- Einstellungen ---------- */
  async function renderCfg(body) {
    const [cfgMisc, cfgCats, cfgServers, stats] = await Promise.all([
      API.sab('mode=get_config&section=misc').then(r => (r.config && r.config.misc) || {}).catch(() => ({})),
      API.sab('mode=get_config&section=categories').then(r => (r.config && r.config.categories) || []).catch(() => []),
      API.sab('mode=get_config&section=servers').then(r => (r.config && r.config.servers) || []).catch(() => []),
      API.sab('mode=server_stats').catch(() => null)
    ]);

    const MISC_KEYS = [
      ['download_dir', 'Temporärer Download-Ordner'],
      ['complete_dir', 'Ordner für fertige Downloads'],
      ['script_dir', 'Skript-Ordner'],
      ['history_retention', 'Historie aufbewahren'],
      ['bandwidth_max', 'Maximale Bandbreite (z. B. 100M)'],
      ['bandwidth_perc', 'Standard-Tempolimit (%)'],
      ['pre_check', 'Vorab-Prüfung (0/1)'],
      ['top_only', 'Nur obersten Job prüfen (0/1)']
    ].filter(k => cfgMisc[k[0]] !== undefined);

    body.innerHTML = `
      ${stats ? `<div class="grid g-cards" style="margin-bottom:16px">
        ${[['Heute', stats.day], ['Diese Woche', stats.week], ['Dieser Monat', stats.month], ['Gesamt', stats.total]].map(x =>
          `<div class="card"><div class="card-b"><div class="stat-big">${fmtBytes(x[1] || 0)}</div><div class="stat-lbl">${x[0]} geladen</div></div></div>`).join('')}
      </div>` : ''}
      <div class="card"><div class="card-h"><h3>Allgemein</h3><span class="spacer"></span><button class="btn btn-sm btn-p" id="mSave">Speichern</button></div>
        <div class="card-b">${MISC_KEYS.map(k => `<div class="frow"><label class="lbl">${esc(k[1])}</label>
          <input class="inp" data-mk="${k[0]}" value="${esc(String(cfgMisc[k[0]]))}"></div>`).join('')}
        <div class="hint" style="margin-top:10px">Weitere Optionen direkt in der SABnzbd-Oberfläche.</div></div></div>
      <div class="card" style="margin-top:16px"><div class="card-h"><h3>Kategorien</h3><span class="spacer"></span><button class="btn btn-sm" id="catAdd">${icon('plus')} Neu</button></div>
        <div class="card-b tight"><table class="tbl"><thead><tr><th>Name</th><th>Ordner</th><th>Priorität</th><th>Skript</th><th></th></tr></thead>
        <tbody id="catBody">${cfgCats.map(catRow).join('')}</tbody></table></div></div>
      <div class="card" style="margin-top:16px"><div class="card-h"><h3>Usenet-Server</h3></div>
        <div class="card-b" style="padding-top:6px">${cfgServers.map(sv => `<div class="list-item">
          <label class="switch" title="Aktiv"><input type="checkbox" data-srv="${esc(sv.name)}" ${+sv.enable ? 'checked' : ''}><i></i></label>
          <div class="li-main"><b>${esc(sv.displayname || sv.name)}</b>
            <span>${esc(sv.host)}:${esc(String(sv.port))} · ${esc(String(sv.connections))} Verbindungen ${+sv.ssl ? '· SSL' : ''}</span></div>
        </div>`).join('') || emptyBox('server', 'Keine Server konfiguriert')}</div></div>`;

    document.getElementById('mSave').addEventListener('click', async () => {
      try {
        for (const inp of body.querySelectorAll('[data-mk]')) {
          await API.sab('mode=set_config&section=misc&keyword=' + encodeURIComponent(inp.dataset.mk) + '&value=' + encodeURIComponent(inp.value));
        }
        App.toast('Einstellungen gespeichert', 'ok');
      } catch (e) { App.toast(e.message, 'err'); }
    });

    document.getElementById('catAdd').addEventListener('click', () => {
      document.getElementById('catBody').insertAdjacentHTML('beforeend',
        catRow({ name: '', dir: '', priority: 0, script: 'None' }));
    });
    on(body, 'click', '[data-csave]', async (e, t) => {
      const tr = t.closest('tr');
      const g = sel => tr.querySelector(sel).value;
      const name = g('[data-cf=name]').trim();
      if (!name) return App.toast('Name fehlt', 'err');
      try {
        await API.sab('mode=set_config&section=categories&name=' + encodeURIComponent(name) +
          '&dir=' + encodeURIComponent(g('[data-cf=dir]')) +
          '&priority=' + encodeURIComponent(g('[data-cf=priority]')) +
          '&script=' + encodeURIComponent(g('[data-cf=script]') || 'None'));
        App.toast('Kategorie gespeichert', 'ok');
      } catch (ex) { App.toast(ex.message, 'err'); }
    });
    on(body, 'click', '[data-cdel]', async (e, t) => {
      const name = t.dataset.cdel;
      if (!name) { t.closest('tr').remove(); return; }
      const r = await App.confirm({ title: 'Kategorie löschen', msg: `„${name}" löschen?`, okLabel: 'Löschen', danger: true });
      if (!r) return;
      await API.sab('mode=del_config&section=categories&keyword=' + encodeURIComponent(name));
      App.toast('Gelöscht', 'ok');
      show();
    });
    on(body, 'change', '[data-srv]', async (e, t) => {
      try {
        await API.sab('mode=set_config&section=servers&keyword=' + encodeURIComponent(t.dataset.srv) + '&enable=' + (t.checked ? 1 : 0));
        App.toast('Server ' + (t.checked ? 'aktiviert' : 'deaktiviert'), 'ok');
      } catch (ex) { App.toast(ex.message, 'err'); t.checked = !t.checked; }
    });
  }

  function catRow(c) {
    const prios = [[-100, 'Standard'], [2, 'Force'], [1, 'Hoch'], [0, 'Normal'], [-1, 'Niedrig']];
    return `<tr>
      <td><input class="inp" data-cf="name" value="${esc(c.name)}" style="min-width:90px" ${c.name === '*' ? 'readonly' : ''}></td>
      <td><input class="inp" data-cf="dir" value="${esc(c.dir || '')}" style="min-width:90px"></td>
      <td><select class="sel" data-cf="priority" style="min-width:100px">${prios.map(p =>
        `<option value="${p[0]}" ${String(c.priority) === String(p[0]) ? 'selected' : ''}>${p[1]}</option>`).join('')}</select></td>
      <td><input class="inp" data-cf="script" value="${esc(c.script || 'None')}" style="min-width:80px"></td>
      <td class="r" style="white-space:nowrap">
        <button class="btn btn-sm" data-csave="1">${icon('check')}</button>
        ${c.name !== '*' ? `<button class="btn btn-ic btn-g" data-cdel="${esc(c.name)}">${icon('trash')}</button>` : ''}
      </td></tr>`;
  }

  return { title: 'SABnzbd', render };
})();
