'use strict';
/* ============ Log-Viewer ============ */
Views.logs = (() => {
  const st = { svc: null, level: 'all' };
  const APIS = { sonarr: '/api/v3', radarr: '/api/v3', lidarr: '/api/v1', readarr: '/api/v1', prowlarr: '/api/v1' };
  const LEVEL_BADGE = { info: 'b-mut', debug: 'b-mut', trace: 'b-mut', warn: 'b-warn', error: 'b-err', fatal: 'b-err' };

  function services() {
    return Object.keys(APIS).filter(s => App.enabled(s));
  }

  async function render(main) {
    const svcs = services();
    if (!svcs.length) {
      main.innerHTML = `<div class="card"><div class="card-b">${emptyBox('list', t('Keine passenden Dienste aktiviert.'))}</div></div>`;
      return;
    }
    if (!st.svc || !svcs.includes(st.svc)) st.svc = svcs[0];
    main.innerHTML = `
      <div class="toolrow">
        <select class="sel" id="lgSvc">${svcs.map(s => `<option value="${s}" ${st.svc === s ? 'selected' : ''}>${SVC_META[s].name}</option>`).join('')}</select>
        <select class="sel" id="lgLevel">
          <option value="all" ${st.level === 'all' ? 'selected' : ''}>${t('Alle Level')}</option>
          <option value="warn" ${st.level === 'warn' ? 'selected' : ''}>${t('Nur Warnungen')}</option>
          <option value="error" ${st.level === 'error' ? 'selected' : ''}>${t('Nur Fehler')}</option>
        </select>
        <button class="btn" id="lgRefresh">${icon('refresh')}</button>
        <span class="hint" id="lgInfo"></span>
      </div>
      <div class="card"><div class="card-b tight" id="lgBody">${spinner()}</div></div>`;
    main.querySelector('#lgSvc').addEventListener('change', e => { st.svc = e.target.value; draw(); });
    main.querySelector('#lgLevel').addEventListener('change', e => { st.level = e.target.value; draw(); });
    main.querySelector('#lgRefresh').addEventListener('click', draw);
    draw();
    App.every(12000, draw);
  }

  async function draw() {
    const body = document.getElementById('lgBody');
    if (!body) return;
    try {
      const api = APIS[st.svc];
      const j = await API.get(st.svc, `${api}/log?page=1&pageSize=100&sortKey=time&sortDirection=descending`);
      let recs = j.records || [];
      if (st.level === 'warn') recs = recs.filter(r => ['warn', 'error', 'fatal'].includes((r.level || '').toLowerCase()));
      if (st.level === 'error') recs = recs.filter(r => ['error', 'fatal'].includes((r.level || '').toLowerCase()));
      const info = document.getElementById('lgInfo');
      if (info) info.textContent = tf('{0} Einträge', fmtNum(recs.length));
      body.innerHTML = recs.length ? `<table class="tbl"><thead><tr>
          <th>${t('Zeit')}</th><th>Level</th><th>${t('Quelle')}</th><th>${t('Meldung')}</th>
        </tr></thead><tbody>${recs.map(r => {
          const lvl = (r.level || '?').toLowerCase();
          return `<tr ${r.exception ? `title="${esc(String(r.exception).slice(0, 600))}"` : ''}>
            <td style="white-space:nowrap" class="td-sub">${relTime(r.time)}</td>
            <td><span class="badge ${LEVEL_BADGE[lvl] || 'b-mut'}">${esc(lvl)}</span></td>
            <td style="white-space:nowrap" class="td-sub">${esc(r.logger || '')}</td>
            <td class="wrapline" style="min-width:260px">${esc(r.message || '')}${r.exception ? ` <span style="color:var(--warn)">${icon('warning')}</span>` : ''}</td>
          </tr>`;
        }).join('')}</tbody></table>` : emptyBox('list', t('Keine Log-Einträge'));
    } catch (e) {
      body.innerHTML = errBox(e.message);
    }
  }

  return { title: () => t('Protokolle'), render };
})();
