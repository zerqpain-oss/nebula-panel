'use strict';
/* ============ Globale Suche ============ */
Views.search = (() => {
  let query = '';

  function setQuery(q) { query = q; }

  async function render(main) {
    main.innerHTML = `
      <div class="toolrow">
        <input class="inp grow search-lg" id="gsQ" placeholder="${t('Alles durchsuchen – Serien, Filme, Musik, Bücher…')}" value="${esc(query)}">
        <button class="btn btn-p" id="gsGo">${icon('search')} ${t('Suchen')}</button>
      </div>
      <div id="gsRes">${query ? spinner() : emptyBox('search', t('Suchbegriff eingeben – durchsucht alle aktivierten Dienste gleichzeitig.'))}</div>`;
    const inp = main.querySelector('#gsQ');
    const go = () => {
      if (!inp.value.trim()) return;
      query = inp.value.trim();
      const top = document.getElementById('globalSearch');
      if (top) top.value = query;
      run(main.querySelector('#gsRes'));
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    main.querySelector('#gsGo').addEventListener('click', go);
    if (query) run(main.querySelector('#gsRes'));
    else inp.focus();
  }

  async function run(res) {
    res.innerHTML = spinner();
    const sections = [];
    const jobs = [];

    /* *arr-Lookups parallel */
    const arrSvcs = ['sonarr', 'radarr', 'lidarr', 'readarr'].filter(s => App.enabled(s));
    arrSvcs.forEach(svc => {
      const D = ARR_DEFS[svc];
      jobs.push(API.get(svc, `${D.api}${D.items}/lookup?term=${encodeURIComponent(query)}`)
        .then(list => sections.push({ svc, order: arrSvcs.indexOf(svc), list: list.slice(0, 10) }))
        .catch(() => {}));
    });

    /* Plex-Hubs */
    let plexHubs = null;
    if (App.enabled('plex')) {
      jobs.push(API.get('plex', `/hubs/search?query=${encodeURIComponent(query)}&limit=8`)
        .then(j => { plexHubs = (j.MediaContainer && j.MediaContainer.Hub) || []; })
        .catch(() => {}));
    }

    await Promise.allSettled(jobs);
    sections.sort((a, b) => a.order - b.order);

    let html = '';

    sections.forEach(sec => {
      const m = SVC_META[sec.svc];
      if (!sec.list.length) return;
      html += `<div class="sec-title" style="display:flex;align-items:center;gap:8px;color:${m.color}">${icon(m.icon)} ${m.name}</div>
        <div class="pgrid" style="grid-template-columns:repeat(auto-fill,minmax(128px,1fr))">${sec.list.map((r, i) => {
          const title = r.title || r.artistName || r.authorName || '?';
          const src = r.remotePoster || ((r.images || []).find(x => x.coverType === 'poster') || {}).remoteUrl || '';
          return `<div class="poster" data-svc="${sec.svc}" data-i="${i}" title="${esc(title)}">
            <div class="p-fall">${esc(title)}</div>
            ${src ? `<img loading="lazy" src="${esc(src)}" onerror="this.remove()">` : ''}
            <div class="p-tl">${r.id ? `<span class="badge b-ok">${t('Vorhanden')}</span>` : ''}</div>
            <div class="p-grad"></div>
            <div class="p-info"><b>${esc(title)}</b><span>${r.year || ''}</span></div>
          </div>`;
        }).join('')}</div>`;
    });

    if (plexHubs) {
      const hubs = plexHubs.filter(hh => hh.size > 0 && Array.isArray(hh.Metadata));
      if (hubs.length) {
        html += `<div class="sec-title" style="display:flex;align-items:center;gap:8px;color:var(--plex)">${icon('play')} ${t('In Plex gefunden')}</div>
          <div class="card"><div class="card-b" style="padding-top:6px">`;
        hubs.forEach(hub => {
          hub.Metadata.slice(0, 6).forEach(md => {
            const title = md.grandparentTitle ? `${md.grandparentTitle} – ${md.title}` : md.title;
            const thumb = md.grandparentThumb || md.parentThumb || md.thumb;
            const src = thumb ? `/proxy/plex/photo/:/transcode?width=80&height=120&minSize=1&upscale=1&url=${encodeURIComponent(thumb)}` : '';
            html += `<div class="list-item">
              ${src ? `<img class="pmini" style="width:34px;height:50px;flex-basis:34px" src="${esc(src)}" onerror="this.remove()">` : ''}
              <div class="li-main"><b>${esc(title)}</b><span>${esc(hub.title || md.type || '')}${md.year ? ' · ' + md.year : ''}</span></div>
              <span class="badge b-ok">${t('In Bibliothek')}</span>
            </div>`;
          });
        });
        html += `</div></div>`;
      }
    }

    if (App.enabled('prowlarr')) {
      html += `<div style="margin-top:20px">
        <button class="btn" id="gsProwlarr">${icon('search')} ${tf('Release-Suche nach „{0}" in Prowlarr', esc(query))}</button>
      </div>`;
    }

    res.innerHTML = html || emptyBox('search', t('Keine Treffer'));

    on(res, 'click', '.poster[data-svc]', (e, el) => {
      const svc = el.dataset.svc;
      const sec = sections.find(x => x.svc === svc);
      const r = sec && sec.list[+el.dataset.i];
      if (r) arrView(svc).openLookup(r);
    });
    const pb = res.querySelector('#gsProwlarr');
    if (pb) pb.addEventListener('click', () => {
      Views.prowlarr.preset(query);
      location.hash = '#/prowlarr';
    });
  }

  return { title: () => t('Suche'), render, setQuery };
})();
