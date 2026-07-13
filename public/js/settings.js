'use strict';
/* ============ Panel-Einstellungen ============ */
Views.settings = (() => {
  const HELP = {
    sonarr: 'API-Key: Sonarr → Settings → General → Security',
    radarr: 'API-Key: Radarr → Settings → General → Security',
    sabnzbd: 'API-Key: SABnzbd → Config → General → API Key',
    plex: 'Plex-Token: z. B. über XML-Ansicht eines Mediums (X-Plex-Token) oder Support-Artikel „Finding an authentication token"',
    prowlarr: 'API-Key: Prowlarr → Settings → General → Security'
  };

  async function render(main) {
    const cfg = await API.panelGet('config');
    S.cfg = cfg;

    main.innerHTML = `
      <div class="grid g-2" id="svcForms"></div>
      <div class="toolrow" style="margin-top:18px">
        <button class="btn btn-p" id="saveAll">${icon('check')} Alle Dienste speichern</button>
        <span class="hint">Gespeichert wird serverseitig in config.json – API-Keys verlassen den Server nicht.</span>
      </div>
      <div class="grid g-2" style="margin-top:16px">
        <div class="card"><div class="card-h"><h3>Panel</h3></div><div class="card-b">
          <div class="frow"><label class="lbl">Name des Panels</label><input class="inp" id="panelName" value="${esc(cfg.panel.name)}"></div>
          <div style="margin-top:12px;text-align:right"><button class="btn" id="savePanel">Speichern</button></div>
        </div></div>
        <div class="card"><div class="card-h"><h3>Passwort ändern</h3></div><div class="card-b">
          <div class="frow"><label class="lbl">Aktuelles Passwort</label><input class="inp" type="password" id="pwCur" autocomplete="current-password"></div>
          <div class="frow"><label class="lbl">Neues Passwort</label><input class="inp" type="password" id="pwNew" autocomplete="new-password"></div>
          <div class="frow"><label class="lbl">Wiederholen</label><input class="inp" type="password" id="pwNew2" autocomplete="new-password"></div>
          <div style="margin-top:12px;text-align:right"><button class="btn" id="savePw">Passwort ändern</button></div>
        </div></div>
      </div>`;

    const forms = main.querySelector('#svcForms');
    forms.innerHTML = SVCS.map(svc => {
      const m = SVC_META[svc];
      const s = cfg.services[svc] || {};
      return `<div class="card" data-svc="${svc}">
        <div class="card-h">
          <div class="svc-ico" style="background:color-mix(in srgb, ${m.color} 16%, transparent);color:${m.color}">${icon(m.icon)}</div>
          <h3>${m.name}</h3><span class="sub">${m.desc}</span>
          <span class="spacer"></span>
          <label class="switch" title="Aktiviert"><input type="checkbox" class="f-en" ${s.enabled ? 'checked' : ''}><i></i></label>
        </div>
        <div class="card-b">
          <div class="frow"><label class="lbl">URL</label><input class="inp f-url" placeholder="http://192.168.1.10:8989" value="${esc(s.url || '')}"></div>
          <div class="frow"><label class="lbl">${svc === 'plex' ? 'Plex-Token' : 'API-Key'}</label>
            <div style="display:flex;gap:8px">
              <input class="inp f-key" type="password" value="${esc(s.apiKey || '')}" autocomplete="off">
              <button class="btn btn-ic f-eye" title="Anzeigen">${icon('eye')}</button>
            </div></div>
          <div class="hint" style="margin-top:4px">${esc(HELP[svc])}</div>
          <div style="display:flex;gap:8px;margin-top:14px;align-items:center">
            <button class="btn btn-sm f-test">${icon('zap')} Verbindung testen</button>
            <span class="f-result hint"></span>
          </div>
        </div></div>`;
    }).join('');

    on(forms, 'click', '.f-eye', (e, t) => {
      const inp = t.parentElement.querySelector('.f-key');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
    on(forms, 'click', '.f-test', async (e, t) => {
      const card = t.closest('[data-svc]');
      const out = card.querySelector('.f-result');
      t.disabled = true;
      out.textContent = 'Teste…';
      out.style.color = 'var(--txt3)';
      try {
        const r = await API.panelPost('test', {
          type: card.dataset.svc,
          url: card.querySelector('.f-url').value.trim(),
          apiKey: card.querySelector('.f-key').value.trim()
        });
        out.textContent = r.ok ? '✓ ' + r.info : '✗ ' + r.error;
        out.style.color = r.ok ? 'var(--ok)' : 'var(--err)';
      } catch (ex) {
        out.textContent = '✗ ' + ex.message;
        out.style.color = 'var(--err)';
      }
      t.disabled = false;
    });

    main.querySelector('#saveAll').addEventListener('click', async () => {
      const services = {};
      forms.querySelectorAll('[data-svc]').forEach(card => {
        services[card.dataset.svc] = {
          enabled: card.querySelector('.f-en').checked,
          url: card.querySelector('.f-url').value.trim(),
          apiKey: card.querySelector('.f-key').value.trim()
        };
      });
      try {
        await API.panelPost('config', { services });
        S.cfg = await API.panelGet('config');
        App.toast('Dienste gespeichert', 'ok');
        App.statusCheck();
      } catch (e) { App.toast(e.message, 'err'); }
    });

    main.querySelector('#savePanel').addEventListener('click', async () => {
      try {
        await API.panelPost('config', { panel: { name: main.querySelector('#panelName').value } });
        App.toast('Gespeichert – Name wird beim nächsten Laden übernommen', 'ok');
      } catch (e) { App.toast(e.message, 'err'); }
    });

    main.querySelector('#savePw').addEventListener('click', async () => {
      const cur = main.querySelector('#pwCur').value;
      const n1 = main.querySelector('#pwNew').value;
      const n2 = main.querySelector('#pwNew2').value;
      if (n1 !== n2) return App.toast('Neue Passwörter stimmen nicht überein', 'err');
      try {
        await API.panelPost('password', { current: cur, next: n1 });
        App.toast('Passwort geändert', 'ok');
        ['#pwCur', '#pwNew', '#pwNew2'].forEach(x => main.querySelector(x).value = '');
      } catch (e) { App.toast(e.message, 'err'); }
    });
  }

  return { title: 'Einstellungen', render };
})();
