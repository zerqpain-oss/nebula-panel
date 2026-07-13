'use strict';
/* ============ SABnzbd ============ */
Views.sabnzbd = (() => {
  const st = { tab: 'queue', failedOnly: false, cats: [] };
  const PRIOS = [[2, 'Force'], [1, t('Hoch')], [0, 'Normal'], [-1, t('Niedrig')]];

  async function render(main) {
    if (!App.svcGuard('sabnzbd', main)) return;
    main.innerHTML = `<div class="tabs" id="sabTabs">
      <span class="tab" data-t="queue">${t('Warteschlange')}</span>
      <span class="tab" data-t="hist">${t('Historie')}</span>
      <span class="tab" data-t="cfg">${t('Einstellungen')}</span>
    </div><div id="sabBody"></div>`;
    const tabs = main.querySelector('#sabTabs');
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
      <div class="card" style="margin-top:16px"><div class="card-h"><h3>${t('NZB hinzufügen')}</h3></div>
      <div class="card-b"><div class="toolrow" style="margin:0">
        <input class="inp grow" id="nzbUrl" placeholder="${t('NZB-URL einfügen…')}">
        <select class="sel" id="nzbCat"><option value="">${t('Standard-Kategorie')}</option>${st.cats.filter(c => c !== '*').map(c => `<option>${esc(c)}</option>`).join('')}</select>
        <button class="btn btn-p" id="nzbAdd">${icon('plus')} ${t('Hinzufügen')}</button>
      </div></div></div>`;
    document.getElementById('nzbAdd').addEventListener('click', async () => {
      const url = document.getElementById('nzbUrl').value.trim();
      if (!url) return;
      const cat = document.getElementById('nzbCat').value;
      try {
        const r = await API.sab('mode=addurl&name=' + encodeURIComponent(url) + (cat ? '&cat=' + encodeURIComponent(cat) : ''));
        if (r.status === false) throw new Error((r.error) || t('Fehler beim Hinzufügen'));
        App.toast(t('NZB hinzugefügt'), 'ok');
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
      <div><div class="stat-big" style="color:${q.paused ? 'var(--warn)' : 'var(--acc2)'}">${q.paused ? t('Pausiert') : fmtBytes(kb * 1024) + '/s'}</div>
        <div class="stat-lbl">${tf('{0} übrig', esc(q.sizeleft || '0'))} · ${esc(q.timeleft || '–')}</div></div>
      <div style="flex:1;min-width:160px">${Views.dashboard.spark(S.speedHist)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn ${q.paused ? 'btn-p' : ''}" id="qPause">${icon(q.paused ? 'play' : 'pause')} ${q.paused ? t('Fortsetzen') : t('Pausieren')}</button>
        <select class="sel" id="qPauseFor" style="width:auto">
          <option value="">${t('Pause für…')}</option><option value="15">15 Min</option><option value="30">30 Min</option>
          <option value="60">${t('1 Std')}</option><option value="180">${t('3 Std')}</option><option value="360">${t('6 Std')}</option>
        </select>
        <button class="btn btn-d" id="qClear">${icon('trash')} ${t('Leeren')}</button>
      </div>
      <div style="flex-basis:100%;display:flex;gap:12px;align-items:center">
        <span class="lbl" style="white-space:nowrap">${t('Tempolimit:')} <b id="slVal" style="color:var(--txt)">${q.speedlimit && +q.speedlimit < 100 ? q.speedlimit + '%' : t('aus')}</b></span>
        <input type="range" id="slRange" min="5" max="100" step="5" value="${Math.min(+q.speedlimit || 100, 100)}">
        <input class="inp" id="slAbs" placeholder="${t('z. B. 5M')}" style="width:90px" title="${t('Absolut, z. B. 800K oder 5M')}">
        <button class="btn btn-sm" id="slSet">${t('Setzen')}</button>
      </div>
    </div>`;

    const rows = (q.slots || []).map(s => `
      <tr>
        <td><div class="td-main wrapline">${esc(s.filename)}</div>
          <div class="td-sub">${esc(s.size)} · ${tf('{0} übrig', esc(s.sizeleft))} · ${esc(s.status)}</div></td>
        <td><select class="sel" data-cat="${esc(s.nzo_id)}" style="width:110px;padding:5px 26px 5px 8px">${st.cats.map(c =>
          `<option ${c === s.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></td>
        <td><select class="sel" data-prio="${esc(s.nzo_id)}" style="width:100px;padding:5px 26px 5px 8px">${PRIOS.map(p =>
          `<option value="${p[0]}" ${String(s.priority) === String(p[1]) || String(s.priority) === String(p[0]) ? 'selected' : ''}>${p[1]}</option>`).join('')}</select></td>
        <td style="min-width:130px"><div class="prog"><i style="width:${esc(s.percentage)}%"></i></div>
          <div class="td-sub" style="margin-top:4px">${esc(s.percentage)}%</div></td>
        <td class="r" style="white-space:nowrap">
          <button class="btn btn-ic btn-g" data-tgl="${esc(s.nzo_id)}" data-paused="${s.status === 'Paused' ? 1 : 0}" title="${s.status === 'Paused' ? t('Fortsetzen') : t('Pausieren')}">${icon(s.status === 'Paused' ? 'play' : 'pause')}</button>
          <button class="btn btn-ic btn-g" data-del="${esc(s.nzo_id)}" title="${t('Löschen')}">${icon('trash')}</button>
        </td>
      </tr>`).join('');
    listEl.innerHTML = `<div class="card-h"><h3>${t('Warteschlange')}</h3><span class="sub">${tf('{0} Jobs', fmtNum(q.noofslots))}</span></div>
      <div class="card-b tight">${rows ? `<table class="tbl"><thead><tr><th>${t('Name')}</th><th>${t('Kategorie')}</th><th>${t('Priorität')}</th><th>${t('Fortschritt')}</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : emptyBox('inbox', t('Warteschlange ist leer'))}</div>`;

    /* Controls */
    document.getElementById('qPause').onclick = async () => {
      await API.sab('mode=' + (q.paused ? 'resume' : 'pause'));
      App.toast(q.paused ? t('Downloads fortgesetzt') : t('Downloads pausiert'), 'ok');
      draw();
    };
    document.getElementById('qPauseFor').onchange = async e => {
      if (!e.target.value) return;
      await API.sab('mode=config&name=set_pause&value=' + e.target.value);
      App.toast(tf('Pausiert für {0} Minuten', e.target.value), 'ok');
      draw();
    };
    document.getElementById('qClear').onclick = async () => {
      const r = await App.confirm({ title: t('Warteschlange leeren'), msg: t('Alle Jobs entfernen?'), okLabel: t('Leeren'), danger: true, checks: [{ id: 'files', label: t('Auch heruntergeladene Dateien löschen'), checked: false }] });
      if (!r) return;
      await API.sab('mode=queue&name=delete&value=all' + (r.files ? '&del_files=1' : ''));
      App.toast(t('Warteschlange geleert'), 'ok');
      draw();
    };
    const slRange = document.getElementById('slRange');
    slRange.oninput = () => document.getElementById('slVal').textContent = slRange.value + '%';
    slRange.onchange = async () => {
      await API.sab('mode=config&name=speedlimit&value=' + slRange.value);
      App.toast(tf('Tempolimit: {0}', slRange.value + '%'), 'ok');
    };
    document.getElementById('slSet').onclick = async () => {
      const v = document.getElementById('slAbs').value.trim();
      if (!v) return;
      await API.sab('mode=config&name=speedlimit&value=' + encodeURIComponent(v));
      App.toast(tf('Tempolimit: {0}', v), 'ok');
      draw();
    };
    on(listEl, 'change', '[data-cat]', async (e, el) => {
      await API.sab('mode=change_cat&value=' + encodeURIComponent(el.dataset.cat) + '&value2=' + encodeURIComponent(el.value));
      App.toast(t('Kategorie geändert'), 'ok');
    });
    on(listEl, 'change', '[data-prio]', async (e, el) => {
      await API.sab('mode=queue&name=priority&value=' + encodeURIComponent(el.dataset.prio) + '&value2=' + el.value);
      App.toast(t('Priorität geändert'), 'ok');
      draw();
    });
    on(listEl, 'click', '[data-tgl]', async (e, el) => {
      const paused = el.dataset.paused === '1';
      await API.sab('mode=queue&name=' + (paused ? 'resume' : 'pause') + '&value=' + encodeURIComponent(el.dataset.tgl));
      draw();
    });
    on(listEl, 'click', '[data-del]', async (e, el) => {
      const r = await App.confirm({ title: t('Job löschen'), msg: t('Download aus der Warteschlange entfernen?'), okLabel: t('Löschen'), danger: true, checks: [{ id: 'files', label: t('Dateien löschen'), checked: true }] });
      if (!r) return;
      await API.sab('mode=queue&name=delete&value=' + encodeURIComponent(el.dataset.del) + (r.files ? '&del_files=1' : ''));
      App.toast(t('Gelöscht'), 'ok');
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
      <div class="card-h"><h3>${t('Historie')}</h3><span class="sub">${tf('{0} Einträge', fmtNum(hist.noofslots || 0))}</span>
        <span class="spacer"></span>
        <label style="display:flex;gap:8px;align-items:center;cursor:pointer"><span class="lbl">${t('Nur Fehler')}</span>
          <span class="switch"><input type="checkbox" id="hFail" ${st.failedOnly ? 'checked' : ''}><i></i></span></label>
        <button class="btn btn-sm btn-d" id="hClearFail">${icon('trash')} ${t('Fehlgeschlagene löschen')}</button>
      </div>
      <div class="card-b" style="padding-top:6px">${rows || emptyBox('clock', t('Keine Einträge'))}</div></div>`;
    document.getElementById('hFail').addEventListener('change', e => { st.failedOnly = e.target.checked; show(); });
    document.getElementById('hClearFail').addEventListener('click', async () => {
      const r = await App.confirm({ title: t('Fehlgeschlagene löschen'), msg: t('Alle fehlgeschlagenen Einträge aus der Historie entfernen?'), okLabel: t('Löschen'), danger: true });
      if (!r) return;
      await API.sab('mode=history&name=delete&value=failed');
      App.toast(t('Bereinigt'), 'ok');
      show();
    });
    on(body, 'click', '[data-retry]', async (e, el) => {
      await API.sab('mode=retry&value=' + encodeURIComponent(el.dataset.retry));
      App.toast(t('Neu gestartet'), 'ok');
      show();
    });
    on(body, 'click', '[data-hdel]', async (e, el) => {
      await API.sab('mode=history&name=delete&value=' + encodeURIComponent(el.dataset.hdel));
      App.toast(t('Eintrag gelöscht'), 'ok');
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
      ['download_dir', t('Temporärer Download-Ordner')],
      ['complete_dir', t('Ordner für fertige Downloads')],
      ['script_dir', t('Skript-Ordner')],
      ['history_retention', t('Historie aufbewahren')],
      ['bandwidth_max', t('Maximale Bandbreite (z. B. 100M)')],
      ['bandwidth_perc', t('Standard-Tempolimit (%)')],
      ['pre_check', t('Vorab-Prüfung (0/1)')],
      ['top_only', t('Nur obersten Job prüfen (0/1)')]
    ].filter(k => cfgMisc[k[0]] !== undefined);

    body.innerHTML = `
      ${stats ? `<div class="grid g-cards" style="margin-bottom:16px">
        ${[[t('Heute'), stats.day], [t('Diese Woche'), stats.week], [t('Dieser Monat'), stats.month], [t('Gesamt'), stats.total]].map(x =>
          `<div class="card"><div class="card-b"><div class="stat-big">${fmtBytes(x[1] || 0)}</div><div class="stat-lbl">${tf('{0} geladen', x[0])}</div></div></div>`).join('')}
      </div>` : ''}
      <div class="card"><div class="card-h"><h3>${t('Allgemein')}</h3><span class="spacer"></span><button class="btn btn-sm btn-p" id="mSave">${t('Speichern')}</button></div>
        <div class="card-b">${MISC_KEYS.map(k => `<div class="frow"><label class="lbl">${esc(k[1])}</label>
          <input class="inp" data-mk="${k[0]}" value="${esc(String(cfgMisc[k[0]]))}"></div>`).join('')}
        <div class="hint" style="margin-top:10px">${t('Weitere Optionen direkt in der SABnzbd-Oberfläche.')}</div></div></div>
      <div class="card" style="margin-top:16px"><div class="card-h"><h3>${t('Kategorien')}</h3><span class="spacer"></span><button class="btn btn-sm" id="catAdd">${icon('plus')} ${t('Neu')}</button></div>
        <div class="card-b tight"><table class="tbl"><thead><tr><th>${t('Name')}</th><th>${t('Ordner')}</th><th>${t('Priorität')}</th><th>${t('Skript')}</th><th></th></tr></thead>
        <tbody id="catBody">${cfgCats.map(catRow).join('')}</tbody></table></div></div>
      <div class="card" style="margin-top:16px"><div class="card-h"><h3>${t('Usenet-Server')}</h3></div>
        <div class="card-b" style="padding-top:6px">${cfgServers.map(sv => `<div class="list-item">
          <label class="switch" title="${t('Aktiv')}"><input type="checkbox" data-srv="${esc(sv.name)}" ${+sv.enable ? 'checked' : ''}><i></i></label>
          <div class="li-main"><b>${esc(sv.displayname || sv.name)}</b>
            <span>${esc(sv.host)}:${esc(String(sv.port))} · ${tf('{0} Verbindungen', esc(String(sv.connections)))} ${+sv.ssl ? '· SSL' : ''}</span></div>
        </div>`).join('') || emptyBox('server', t('Keine Server konfiguriert'))}</div></div>`;

    document.getElementById('mSave').addEventListener('click', async () => {
      try {
        for (const inp of body.querySelectorAll('[data-mk]')) {
          await API.sab('mode=set_config&section=misc&keyword=' + encodeURIComponent(inp.dataset.mk) + '&value=' + encodeURIComponent(inp.value));
        }
        App.toast(t('Einstellungen gespeichert'), 'ok');
      } catch (e) { App.toast(e.message, 'err'); }
    });

    document.getElementById('catAdd').addEventListener('click', () => {
      document.getElementById('catBody').insertAdjacentHTML('beforeend',
        catRow({ name: '', dir: '', priority: 0, script: 'None' }));
    });
    on(body, 'click', '[data-csave]', async (e, el) => {
      const tr = el.closest('tr');
      const g = sel => tr.querySelector(sel).value;
      const name = g('[data-cf=name]').trim();
      if (!name) return App.toast(t('Name fehlt'), 'err');
      try {
        await API.sab('mode=set_config&section=categories&name=' + encodeURIComponent(name) +
          '&dir=' + encodeURIComponent(g('[data-cf=dir]')) +
          '&priority=' + encodeURIComponent(g('[data-cf=priority]')) +
          '&script=' + encodeURIComponent(g('[data-cf=script]') || 'None'));
        App.toast(t('Kategorie gespeichert'), 'ok');
      } catch (ex) { App.toast(ex.message, 'err'); }
    });
    on(body, 'click', '[data-cdel]', async (e, el) => {
      const name = el.dataset.cdel;
      if (!name) { el.closest('tr').remove(); return; }
      const r = await App.confirm({ title: t('Kategorie löschen'), msg: tf('„{0}" wirklich löschen?', name), okLabel: t('Löschen'), danger: true });
      if (!r) return;
      await API.sab('mode=del_config&section=categories&keyword=' + encodeURIComponent(name));
      App.toast(t('Gelöscht'), 'ok');
      show();
    });
    on(body, 'change', '[data-srv]', async (e, el) => {
      try {
        await API.sab('mode=set_config&section=servers&keyword=' + encodeURIComponent(el.dataset.srv) + '&enable=' + (el.checked ? 1 : 0));
        App.toast(el.checked ? t('Server aktiviert') : t('Server deaktiviert'), 'ok');
      } catch (ex) { App.toast(ex.message, 'err'); el.checked = !el.checked; }
    });
  }

  function catRow(c) {
    const prios = [[-100, t('Standard')], [2, 'Force'], [1, t('Hoch')], [0, 'Normal'], [-1, t('Niedrig')]];
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
