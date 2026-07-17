'use strict';
/* ============ Bazarr (Untertitel) ============ */
Views.bazarr = (() => {
  const st = { tab: 'over' };

  async function render(main) {
    if (!App.svcGuard('bazarr', main)) return;
    main.innerHTML = `<div class="tabs" id="bzTabs">
      <span class="tab" data-t="over">${t('Übersicht')}</span>
      <span class="tab" data-t="weps">${t('Fehlend (Serien)')}</span>
      <span class="tab" data-t="wmov">${t('Fehlend (Filme)')}</span>
      <span class="tab" data-t="hist">${t('Historie')}</span>
    </div><div id="bzBody"></div>`;
    const tabs = main.querySelector('#bzTabs');
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
    const body = document.getElementById('bzBody');
    if (!body) return;
    body.innerHTML = spinner();
    try {
      if (st.tab === 'over') await renderOver(body);
      else if (st.tab === 'weps') await renderWanted(body, 'episodes');
      else if (st.tab === 'wmov') await renderWanted(body, 'movies');
      else await renderHist(body);
    } catch (e) { body.innerHTML = errBox(e.message); }
  }

  /* ---------- Übersicht ---------- */
  async function renderOver(body) {
    const [badges, providers, status] = await Promise.all([
      API.get('bazarr', '/api/badges').catch(() => ({})),
      API.get('bazarr', '/api/providers').catch(() => ({ data: [] })),
      API.get('bazarr', '/api/system/status').catch(() => null)
    ]);
    const provs = providers.data || [];
    body.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi">${icon('tv', 'k-ico')}<b>${fmtNum(badges.episodes || 0)}</b><span>${t('Fehlende Serien-Untertitel')}</span></div>
        <div class="kpi">${icon('film', 'k-ico')}<b>${fmtNum(badges.movies || 0)}</b><span>${t('Fehlende Film-Untertitel')}</span></div>
        <div class="kpi">${icon('server', 'k-ico')}<b>${fmtNum(provs.length)}</b><span>${t('Provider')}</span></div>
        ${status && status.data ? `<div class="kpi">${icon('captions', 'k-ico')}<b style="font-size:17px">v${esc(status.data.bazarr_version || '?')}</b><span>Bazarr</span></div>` : ''}
      </div>
      <div class="card"><div class="card-h"><h3>${t('Provider')}</h3></div>
        <div class="card-b" style="padding-top:6px">${provs.map(p => `<div class="list-item">
          <i class="dot ${p.status && String(p.status).toLowerCase().includes('down') ? 'off' : 'on'}"></i>
          <div class="li-main"><b>${esc(p.name)}</b><span>${esc(String(p.status || 'OK'))}${p.retry && p.retry !== '-' ? ' · Retry: ' + esc(String(p.retry)) : ''}</span></div>
        </div>`).join('') || emptyBox('server', t('Keine Provider konfiguriert'))}</div></div>`;
  }

  /* ---------- Fehlende Untertitel ---------- */
  async function renderWanted(body, kind) {
    const j = await API.get('bazarr', `/api/${kind}/wanted?start=0&length=80`);
    const rows = (j.data || []).map(x => {
      const title = kind === 'episodes'
        ? `${x.seriesTitle || '?'} · ${x.episode_number || ''} – ${x.episodeTitle || ''}`
        : `${x.title || '?'}`;
      const langs = (x.missing_subtitles || []).map(l => `<span class="badge b-warn">${esc(l.code2 || l.name || '?')}</span>`).join(' ');
      return `<div class="list-item">
        <div class="li-main"><b class="wrapline" style="white-space:normal">${esc(title)}</b></div>
        <div style="display:flex;gap:5px;flex-wrap:wrap">${langs}</div>
      </div>`;
    }).join('');
    body.innerHTML = `<div class="card">
      <div class="card-h"><h3>${kind === 'episodes' ? t('Fehlend (Serien)') : t('Fehlend (Filme)')}</h3>
        <span class="sub">${tf('{0} gesamt', fmtNum(j.total || 0))}</span></div>
      <div class="card-b" style="padding-top:6px">${rows || emptyBox('check', t('Keine fehlenden Untertitel'))}</div></div>
      <div class="hint" style="margin-top:10px">${t('Bazarr sucht automatisch nach fehlenden Untertiteln. Manuelle Suche direkt in der Bazarr-Oberfläche.')}</div>`;
  }

  /* ---------- Historie ---------- */
  async function renderHist(body) {
    const [eps, movs] = await Promise.all([
      API.get('bazarr', '/api/episodes/history?start=0&length=30').catch(() => ({ data: [] })),
      API.get('bazarr', '/api/movies/history?start=0&length=30').catch(() => ({ data: [] }))
    ]);
    const items = [];
    (eps.data || []).forEach(x => items.push({
      ts: x.timestamp, title: `${x.seriesTitle || '?'} · ${x.episode_number || ''}`,
      desc: x.description || '', lang: x.language && (x.language.name || x.language.code2) || ''
    }));
    (movs.data || []).forEach(x => items.push({
      ts: x.timestamp, title: x.title || '?',
      desc: x.description || '', lang: x.language && (x.language.name || x.language.code2) || ''
    }));
    items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    body.innerHTML = `<div class="card"><div class="card-h"><h3>${t('Untertitel-Historie')}</h3></div>
      <div class="card-b" style="padding-top:6px">${items.slice(0, 50).map(i => `<div class="list-item">
        ${i.lang ? `<span class="badge b-acc" style="flex:0 0 auto">${esc(i.lang)}</span>` : ''}
        <div class="li-main"><b class="wrapline" style="white-space:normal">${esc(i.title)}</b>
          <span>${esc(i.desc)}${i.ts ? ' · ' + relTime(i.ts * 1000) : ''}</span></div>
      </div>`).join('') || emptyBox('clock', t('Noch keine Historie'))}</div></div>`;
  }

  return { title: 'Bazarr', render };
})();
