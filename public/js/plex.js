'use strict';
/* ============ Plex ============ */
Views.plex = (() => {
  const st = { tab: 'act', showAdv: false };

  async function render(main) {
    if (!App.svcGuard('plex', main)) return;
    main.innerHTML = `<div class="tabs" id="plexTabs">
      <span class="tab" data-t="act">${t('Aktivität')}</span>
      <span class="tab" data-t="libs">${t('Bibliotheken')}</span>
      <span class="tab" data-t="recent">${t('Kürzlich hinzugefügt')}</span>
      <span class="tab" data-t="cfg">${t('Server-Einstellungen')}</span>
    </div><div id="plexBody"></div>`;
    const tabs = main.querySelector('#plexTabs');
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
    const body = document.getElementById('plexBody');
    if (!body) return;
    body.innerHTML = spinner();
    try {
      if (st.tab === 'act') { await renderAct(body); App.every(6000, () => renderAct(body, true)); }
      else if (st.tab === 'libs') await renderLibs(body);
      else if (st.tab === 'recent') await renderRecent(body);
      else await renderCfg(body);
    } catch (e) { body.innerHTML = errBox(e.message); }
  }

  function thumbUrl(th, w, ht) {
    return th ? `/proxy/plex/photo/:/transcode?width=${w}&height=${ht}&minSize=1&upscale=1&url=${encodeURIComponent(th)}` : '';
  }

  /* ---------- Aktivität ---------- */
  async function renderAct(body, soft) {
    let sess;
    try {
      const j = await API.get('plex', '/status/sessions');
      sess = (j.MediaContainer && j.MediaContainer.Metadata) || [];
    } catch (e) { if (!soft) body.innerHTML = errBox(e.message); return; }

    const cards = sess.map(s => {
      const title = s.grandparentTitle ? `${s.grandparentTitle} – ${s.title}` : `${s.title}${s.year ? ' (' + s.year + ')' : ''}`;
      const sub = s.type === 'episode' ? `S${String(s.parentIndex).padStart(2, '0')}E${String(s.index).padStart(2, '0')}` : (s.type || '');
      const user = (s.User && s.User.title) || '?';
      const pl = s.Player || {};
      const media = (s.Media && s.Media[0]) || {};
      const ts = s.TranscodeSession;
      const pct = s.duration ? Math.round((s.viewOffset || 0) / s.duration * 100) : 0;
      const bw = s.Session && s.Session.bandwidth ? fmtBytes(s.Session.bandwidth * 125) + '/s' : '';
      const thumb = thumbUrl(s.grandparentThumb || s.thumb, 160, 240);
      const sid = (s.Session && s.Session.id) || '';
      return `<div class="card"><div class="card-b" style="display:flex;gap:15px">
        ${thumb ? `<img class="pmini" src="${esc(thumb)}" onerror="this.remove()">` : ''}
        <div style="flex:1;min-width:0">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <b>${esc(title)}</b>
            <span class="badge ${pl.state === 'paused' ? 'b-warn' : 'b-ok'}">${pl.state === 'paused' ? t('Pausiert') : t('Läuft')}</span>
            ${ts ? `<span class="badge b-warn">Transcode${ts.videoDecision === 'copy' ? ' (Audio)' : ''}</span>` : '<span class="badge b-ok">Direct Play</span>'}
          </div>
          <div class="td-sub" style="margin:4px 0 8px">${esc(sub)} · ${icon('user')} ${esc(user)} · ${esc(pl.product || '')} ${t('auf')} ${esc(pl.title || pl.platform || '?')}
            ${media.videoResolution ? ' · ' + esc(String(media.videoResolution)) + 'p' : ''}${bw ? ' · ' + bw : ''}</div>
          <div class="prog"><i style="width:${pct}%"></i></div>
          <div class="td-sub" style="margin-top:4px">${msToTime(s.viewOffset)} / ${msToTime(s.duration)}</div>
        </div>
        ${sid ? `<button class="btn btn-ic btn-g" data-kill="${esc(sid)}" title="${t('Stream beenden')}">${icon('x')}</button>` : ''}
      </div></div>`;
    }).join('');

    body.innerHTML = `<div style="display:flex;flex-direction:column;gap:14px">${cards || `<div class="card"><div class="card-b">${emptyBox('play', t('Aktuell schaut niemand'))}</div></div>`}</div>`;
    on(body, 'click', '[data-kill]', async (e, el) => {
      const r = await App.confirm({ title: t('Stream beenden'), msg: t('Diesen Stream wirklich beenden?'), okLabel: t('Beenden'), danger: true });
      if (!r) return;
      try {
        await API.get('plex', '/status/sessions/terminate?sessionId=' + encodeURIComponent(el.dataset.kill) + '&reason=' + encodeURIComponent(t('Vom Admin beendet')));
        App.toast(t('Stream beendet'), 'ok');
      } catch (ex) { App.toast(ex.message, 'err'); }
    });
  }

  function msToTime(ms) {
    ms = Number(ms) || 0;
    const s = Math.floor(ms / 1000), hh = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60);
    return (hh ? hh + ':' : '') + String(mm).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  /* ---------- Bibliotheken ---------- */
  async function renderLibs(body) {
    const j = await API.get('plex', '/library/sections');
    const dirs = (j.MediaContainer && j.MediaContainer.Directory) || [];
    const counts = {};
    await Promise.allSettled(dirs.map(async d => {
      const c = await API.get('plex', `/library/sections/${d.key}/all?X-Plex-Container-Start=0&X-Plex-Container-Size=0`);
      counts[d.key] = c.MediaContainer ? c.MediaContainer.totalSize : null;
    }));
    const typeIcon = { movie: 'film', show: 'tv', artist: 'activity', photo: 'eye' };
    body.innerHTML = `<div class="grid g-cards">${dirs.map(d => `
      <div class="card"><div class="card-b">
        <div style="display:flex;gap:12px;align-items:center">
          <div class="svc-ico" style="background:rgba(229,160,13,.14);color:var(--plex)">${icon(typeIcon[d.type] || 'folder')}</div>
          <div style="flex:1;min-width:0"><b style="font-size:15px">${esc(d.title)}</b>
            <div class="td-sub">${counts[d.key] != null ? tf('{0} Einträge', fmtNum(counts[d.key])) : ''} ${d.refreshing ? `· <span style="color:var(--warn)">${t('Scannt…')}</span>` : ''}</div></div>
        </div>
        <div class="td-sub mono" style="margin:10px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc((d.Location || []).map(l => l.path).join(', '))}">${esc((d.Location || []).map(l => l.path).join(', '))}</div>
        <div style="display:flex;gap:7px;flex-wrap:wrap">
          <button class="btn btn-sm" data-scan="${d.key}">${icon('refresh')} ${t('Scannen')}</button>
          <button class="btn btn-sm" data-ana="${d.key}">${icon('activity')} ${t('Analysieren')}</button>
          <button class="btn btn-sm btn-d" data-trash="${d.key}">${icon('trash')} ${t('Papierkorb')}</button>
        </div>
      </div></div>`).join('') || emptyBox('folder', t('Keine Bibliotheken gefunden'))}</div>`;

    on(body, 'click', '[data-scan]', async (e, el) => {
      try { await API.get('plex', `/library/sections/${el.dataset.scan}/refresh`); App.toast(t('Scan gestartet'), 'ok'); }
      catch (ex) { App.toast(ex.message, 'err'); }
    });
    on(body, 'click', '[data-ana]', async (e, el) => {
      try { await API.raw('PUT', API.p('plex', `/library/sections/${el.dataset.ana}/analyze`)); App.toast(t('Analyse gestartet'), 'ok'); }
      catch (ex) { App.toast(ex.message, 'err'); }
    });
    on(body, 'click', '[data-trash]', async (e, el) => {
      const r = await App.confirm({ title: t('Papierkorb leeren'), msg: t('Gelöschte Einträge dieser Bibliothek endgültig entfernen?'), okLabel: t('Leeren'), danger: true });
      if (!r) return;
      try { await API.raw('PUT', API.p('plex', `/library/sections/${el.dataset.trash}/emptyTrash`)); App.toast(t('Papierkorb geleert'), 'ok'); }
      catch (ex) { App.toast(ex.message, 'err'); }
    });
  }

  /* ---------- Kürzlich ---------- */
  async function renderRecent(body) {
    const j = await API.get('plex', '/library/recentlyAdded?X-Plex-Container-Start=0&X-Plex-Container-Size=36');
    const items = (j.MediaContainer && j.MediaContainer.Metadata) || [];
    body.innerHTML = `<div class="pgrid">${items.map(m => {
      const title = m.grandparentTitle || m.parentTitle || m.title;
      const sub = m.type === 'season' ? m.title : m.type === 'episode' ? m.title : (m.year || '');
      const src = thumbUrl(m.grandparentThumb || m.parentThumb || m.thumb, 240, 360);
      return `<div class="poster" title="${esc(title)}">
        <div class="p-fall">${esc(title)}</div>
        ${src ? `<img loading="lazy" src="${esc(src)}" onerror="this.remove()">` : ''}
        <div class="p-grad"></div>
        <div class="p-info"><b>${esc(title)}</b><span>${esc(String(sub))} · ${relTime(m.addedAt * 1000)}</span></div>
      </div>`;
    }).join('') || emptyBox('inbox', t('Nichts Neues'))}</div>`;
  }

  /* ---------- Server-Einstellungen ---------- */
  async function renderCfg(body) {
    const j = await API.get('plex', '/:/prefs');
    const settings = ((j.MediaContainer && j.MediaContainer.Setting) || []).filter(s => !s.hidden);
    const groups = {};
    settings.forEach(s => {
      const g = s.group || 'allgemein';
      (groups[g] = groups[g] || []).push(s);
    });
    const changed = new Map();

    const groupNames = { general: t('Allgemein'), library: t('Bibliothek'), network: t('Netzwerk'), transcoder: t('Transcoder'), dlna: 'DLNA', extras: t('Extras'), channels: t('Kanäle'), butler: t('Geplante Aufgaben'), allgemein: t('Allgemein') };

    body.innerHTML = `
      <div class="toolrow">
        <label style="display:flex;gap:8px;align-items:center;cursor:pointer">
          <span class="switch"><input type="checkbox" id="pAdv" ${st.showAdv ? 'checked' : ''}><i></i></span>
          <span class="lbl">${t('Erweiterte Einstellungen anzeigen')}</span></label>
        <span class="spacer" style="flex:1"></span>
        <button class="btn btn-p" id="pSave" disabled>${icon('check')} <span id="pSaveN">${t('Speichern')}</span></button>
      </div>
      <div id="pGroups"></div>`;

    const wrap = body.querySelector('#pGroups');
    const drawGroups = () => {
      wrap.innerHTML = Object.keys(groups).map(g => {
        const items = groups[g].filter(s => st.showAdv || !s.advanced);
        if (!items.length) return '';
        return `<div class="card" style="margin-bottom:16px"><div class="card-h"><h3>${esc(groupNames[g] || g)}</h3></div>
          <div class="card-b">${items.map(s => {
            let ctrl;
            const cur = changed.has(s.id) ? changed.get(s.id) : s.value;
            if (s.type === 'bool') {
              ctrl = `<label class="switch"><input type="checkbox" data-pid="${esc(s.id)}" data-ptype="bool" ${(cur === true || cur === 'true' || cur === 1 || cur === '1') ? 'checked' : ''}><i></i></label>`;
            } else if (s.enumValues) {
              const opts = String(s.enumValues).split('|').map(o => {
                const i = o.indexOf(':');
                return i >= 0 ? [o.slice(0, i), o.slice(i + 1)] : [o, o];
              });
              ctrl = `<select class="sel" data-pid="${esc(s.id)}">${opts.map(o =>
                `<option value="${esc(o[0])}" ${String(cur) === String(o[0]) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
            } else if (s.type === 'int' || s.type === 'double') {
              ctrl = `<input class="inp" type="number" step="any" data-pid="${esc(s.id)}" value="${esc(String(cur))}">`;
            } else {
              ctrl = `<input class="inp" data-pid="${esc(s.id)}" value="${esc(String(cur == null ? '' : cur))}">`;
            }
            return `<div class="frow"><label class="lbl" title="${esc(s.id)}">${esc(s.label || s.id)}</label>
              <div>${ctrl}${s.summary ? `<div class="hint">${esc(s.summary)}</div>` : ''}</div></div>`;
          }).join('')}</div></div>`;
      }).join('');
    };
    drawGroups();

    const saveBtn = body.querySelector('#pSave');
    const updateBtn = () => {
      saveBtn.disabled = changed.size === 0;
      body.querySelector('#pSaveN').textContent = changed.size ? tf('Speichern ({0})', changed.size) : t('Speichern');
    };
    on(wrap, 'change', '[data-pid]', (e, el) => {
      const val = el.dataset.ptype === 'bool' ? (el.checked ? '1' : '0') : el.value;
      changed.set(el.dataset.pid, val);
      updateBtn();
    });
    body.querySelector('#pAdv').addEventListener('change', e => { st.showAdv = e.target.checked; drawGroups(); });
    saveBtn.addEventListener('click', async () => {
      const qs = [...changed.entries()].map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
      try {
        await API.raw('PUT', API.p('plex', '/:/prefs?' + qs));
        App.toast(tf('{0} Einstellung(en) gespeichert', changed.size), 'ok');
        changed.clear();
        updateBtn();
      } catch (ex) { App.toast(ex.message, 'err'); }
    });
  }

  return { title: 'Plex', render };
})();
