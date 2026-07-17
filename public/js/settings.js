'use strict';
/* ============ Panel-Einstellungen ============ */
Views.settings = (() => {
  const HELP = {
    sonarr: 'API-Key: Sonarr → Settings → General → Security',
    radarr: 'API-Key: Radarr → Settings → General → Security',
    lidarr: 'API-Key: Lidarr → Settings → General → Security',
    readarr: 'API-Key: Readarr → Settings → General → Security',
    sabnzbd: 'API-Key: SABnzbd → Config → General → API Key',
    plex: 'Plex-Token: z. B. über XML-Ansicht eines Mediums (X-Plex-Token) oder Support-Artikel „Finding an authentication token"',
    prowlarr: 'API-Key: Prowlarr → Settings → General → Security',
    bazarr: 'API-Key: Bazarr → Settings → General → Security'
  };
  const PORTS = {
    sonarr: 8989, radarr: 7878, lidarr: 8686, readarr: 8787,
    sabnzbd: 8080, plex: 32400, prowlarr: 9696, bazarr: 6767
  };

  async function render(main) {
    const cfg = await API.panelGet('config');
    S.cfg = cfg;
    const n = cfg.notify || {};
    const nt = n.telegram || {}, nd = n.discord || {}, nn = n.ntfy || {}, ne = n.events || {};
    const swRow = (label, key, checked) => `<div class="frow"><label class="lbl">${label}</label>
      <label class="switch"><input type="checkbox" data-nt="${key}" ${checked ? 'checked' : ''}><i></i></label></div>`;
    const inRow = (label, key, val, type) => `<div class="frow"><label class="lbl">${label}</label>
      <input class="inp" type="${type || 'text'}" data-nt="${key}" value="${esc(val || '')}" autocomplete="off"></div>`;

    main.innerHTML = `
      <div class="grid g-2" id="svcForms"></div>
      <div class="toolrow" style="margin-top:18px">
        <button class="btn btn-p" id="saveAll">${icon('check')} ${t('Alle Dienste speichern')}</button>
        <span class="hint">${t('Gespeichert wird serverseitig in config.json – API-Keys verlassen den Server nicht.')}</span>
      </div>
      <div class="grid g-2" style="margin-top:16px">
        <div class="card"><div class="card-h"><h3>Panel</h3></div><div class="card-b">
          <div class="frow"><label class="lbl">${t('Name des Panels')}</label><input class="inp" id="panelName" value="${esc(cfg.panel.name)}"></div>
          <div class="frow"><label class="lbl">${t('Sprache')}</label>
            <select class="sel" id="panelLang">
              <option value="de" ${LANG === 'de' ? 'selected' : ''}>Deutsch</option>
              <option value="en" ${LANG === 'en' ? 'selected' : ''}>English</option>
            </select></div>
          <div style="margin-top:12px;text-align:right"><button class="btn" id="savePanel">${t('Speichern')}</button></div>
        </div></div>
        <div class="card"><div class="card-h"><h3>${t('Passwort ändern')}</h3></div><div class="card-b">
          <div class="frow"><label class="lbl">${t('Aktuelles Passwort')}</label><input class="inp" type="password" id="pwCur" autocomplete="current-password"></div>
          <div class="frow"><label class="lbl">${t('Neues Passwort')}</label><input class="inp" type="password" id="pwNew" autocomplete="new-password"></div>
          <div class="frow"><label class="lbl">${t('Wiederholen')}</label><input class="inp" type="password" id="pwNew2" autocomplete="new-password"></div>
          <div style="margin-top:12px;text-align:right"><button class="btn" id="savePw">${t('Passwort ändern')}</button></div>
        </div></div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-h"><h3>${t('Benachrichtigungen')}</h3><span class="spacer"></span>
          <button class="btn btn-sm" id="notifyTest">${icon('zap')} ${t('Testnachricht senden')}</button>
          <button class="btn btn-sm btn-p" id="notifySave">${t('Speichern')}</button>
        </div>
        <div class="card-b"><div class="grid g-2">
          <div>
            <div class="sec-title">Telegram</div>
            ${swRow(t('Aktiv'), 'telegram.enabled', nt.enabled)}
            ${inRow(t('Bot-Token'), 'telegram.botToken', nt.botToken, 'password')}
            ${inRow(t('Chat-ID'), 'telegram.chatId', nt.chatId)}
            <div class="sec-title">Discord</div>
            ${swRow(t('Aktiv'), 'discord.enabled', nd.enabled)}
            ${inRow(t('Webhook-URL'), 'discord.webhookUrl', nd.webhookUrl, 'password')}
            <div class="sec-title">ntfy</div>
            ${swRow(t('Aktiv'), 'ntfy.enabled', nn.enabled)}
            ${inRow(t('Server'), 'ntfy.server', nn.server || 'https://ntfy.sh')}
            ${inRow('Topic', 'ntfy.topic', nn.topic)}
          </div>
          <div>
            <div class="sec-title">${t('Ereignisse')}</div>
            ${swRow(t('Import abgeschlossen'), 'events.imported', ne.imported)}
            ${swRow(t('Download fehlgeschlagen'), 'events.failed', ne.failed)}
            ${swRow(t('Systemwarnungen'), 'events.health', ne.health)}
            ${swRow(t('Speicherplatz-Warnung'), 'events.disk', ne.disk)}
            ${swRow(t('Release geholt (Grab)'), 'events.grabbed', ne.grabbed)}
            <div class="frow"><label class="lbl">${t('Warnschwelle Speicher (%)')}</label>
              <input class="inp" type="number" id="ntThresh" min="50" max="99" value="${n.diskThreshold || 90}"></div>
            <div class="hint" style="margin-top:8px">${t('Geprüft wird alle 3 Minuten. Nach dem Speichern greifen die Regeln sofort.')}</div>
          </div>
        </div></div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-h"><h3>${t('Kalender-Abo (iCal)')}</h3></div>
        <div class="card-b">
          <p class="hint" style="margin-bottom:10px">${t('Diese URL in Google/Apple Kalender als Abo hinzufügen:')} ${t('Sie enthält kommende Episoden, Filme, Alben und Bücher.')}</p>
          <div style="display:flex;gap:8px">
            <input class="inp mono" id="icalUrl" readonly value="${esc(location.origin + '/calendar.ics?token=' + (cfg.panel.icalToken || ''))}">
            <button class="btn" id="icalCopy">${t('Kopieren')}</button>
          </div>
        </div>
      </div>
      <div class="hint" style="margin-top:18px;text-align:center" id="verLine"></div>`;

    const forms = main.querySelector('#svcForms');
    forms.innerHTML = SVCS.map(svc => {
      const m = SVC_META[svc];
      const s = cfg.services[svc] || {};
      return `<div class="card" data-svc="${svc}">
        <div class="card-h">
          <div class="svc-ico" style="background:color-mix(in srgb, ${m.color} 16%, transparent);color:${m.color}">${icon(m.icon)}</div>
          <h3>${m.name}</h3><span class="sub">${t(m.desc)}</span>
          <span class="spacer"></span>
          <label class="switch" title="${t('Aktiviert')}"><input type="checkbox" class="f-en" ${s.enabled ? 'checked' : ''}><i></i></label>
        </div>
        <div class="card-b">
          <div class="frow"><label class="lbl">URL</label><input class="inp f-url" placeholder="http://192.168.1.10:${PORTS[svc]}" value="${esc(s.url || '')}"></div>
          <div class="frow"><label class="lbl">${svc === 'plex' ? 'Plex-Token' : 'API-Key'}</label>
            <div style="display:flex;gap:8px">
              <input class="inp f-key" type="password" value="${esc(s.apiKey || '')}" autocomplete="off">
              <button class="btn btn-ic f-eye" title="${t('Anzeigen')}">${icon('eye')}</button>
            </div></div>
          <div class="hint" style="margin-top:4px">${esc(t(HELP[svc]))}</div>
          <div style="display:flex;gap:8px;margin-top:14px;align-items:center">
            <button class="btn btn-sm f-test">${icon('zap')} ${t('Verbindung testen')}</button>
            <span class="f-result hint"></span>
          </div>
        </div></div>`;
    }).join('');

    on(forms, 'click', '.f-eye', (e, el) => {
      const inp = el.parentElement.querySelector('.f-key');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
    on(forms, 'click', '.f-test', async (e, el) => {
      const card = el.closest('[data-svc]');
      const out = card.querySelector('.f-result');
      el.disabled = true;
      out.textContent = t('Teste…');
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
      el.disabled = false;
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
        App.toast(t('Dienste gespeichert'), 'ok');
        /* Navigation neu aufbauen – nur aktive Dienste anzeigen */
        App.renderShell();
        App.route();
        App.statusCheck();
        App.chipPoll();
      } catch (e) { App.toast(e.message, 'err'); }
    });

    main.querySelector('#savePanel').addEventListener('click', async () => {
      try {
        await API.panelPost('config', { panel: { name: main.querySelector('#panelName').value } });
        const newLang = main.querySelector('#panelLang').value;
        if (newLang !== LANG) { setLang(newLang); return; }
        App.toast(t('Gespeichert – Name wird beim nächsten Laden übernommen'), 'ok');
      } catch (e) { App.toast(e.message, 'err'); }
    });

    main.querySelector('#savePw').addEventListener('click', async () => {
      const cur = main.querySelector('#pwCur').value;
      const n1 = main.querySelector('#pwNew').value;
      const n2 = main.querySelector('#pwNew2').value;
      if (n1 !== n2) return App.toast(t('Neue Passwörter stimmen nicht überein'), 'err');
      try {
        await API.panelPost('password', { current: cur, next: n1 });
        App.toast(t('Passwort geändert'), 'ok');
        ['#pwCur', '#pwNew', '#pwNew2'].forEach(x => main.querySelector(x).value = '');
      } catch (e) { App.toast(e.message, 'err'); }
    });

    /* --- Benachrichtigungen --- */
    const collectNotify = () => {
      const notify = { telegram: {}, discord: {}, ntfy: {}, events: {} };
      main.querySelectorAll('[data-nt]').forEach(inp => {
        const [grp, key] = inp.dataset.nt.split('.');
        notify[grp][key] = inp.type === 'checkbox' ? inp.checked : inp.value;
      });
      notify.diskThreshold = +main.querySelector('#ntThresh').value || 90;
      return notify;
    };
    main.querySelector('#notifySave').addEventListener('click', async () => {
      try {
        await API.panelPost('config', { notify: collectNotify() });
        App.toast(t('Benachrichtigungen gespeichert'), 'ok');
      } catch (e) { App.toast(e.message, 'err'); }
    });
    main.querySelector('#notifyTest').addEventListener('click', async e => {
      e.target.disabled = true;
      try {
        await API.panelPost('config', { notify: collectNotify() });
        const r = await API.panelPost('notify/test', {});
        if (r.ok) App.toast(t('Testnachricht verschickt'), 'ok');
        else App.toast(r.error || t('Senden fehlgeschlagen'), 'err');
      } catch (ex) { App.toast(ex.message, 'err'); }
      e.target.disabled = false;
    });

    /* --- iCal kopieren --- */
    main.querySelector('#icalCopy').addEventListener('click', async () => {
      const inp = main.querySelector('#icalUrl');
      try {
        await navigator.clipboard.writeText(inp.value);
        App.toast(t('Kopiert'), 'ok');
      } catch (e) {
        inp.select();
        document.execCommand('copy');
        App.toast(t('Kopiert'), 'ok');
      }
    });

    /* --- Version / Update --- */
    (S.version ? Promise.resolve(S.version) : API.panelGet('version')).then(v => {
      S.version = v;
      const el = main.querySelector('#verLine');
      if (!el) return;
      el.innerHTML = v.updateAvailable
        ? `${icon('arrup')} ${tf('Update verfügbar: {0} → {1}', esc(v.current), esc(v.latest))} · <a href="https://github.com/zerqpain-oss/nebula-panel" target="_blank" rel="noopener">GitHub</a>`
        : tf('Version {0} – aktuell', esc(v.current));
    }).catch(() => {});
  }

  return { title: () => t('Einstellungen'), render };
})();
