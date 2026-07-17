#!/usr/bin/env node
'use strict';
/*
 * Nebula Panel – Server
 * Keine Abhängigkeiten, benötigt Node >= 18.
 * - Statische Auslieferung von /public
 * - Passwort-Login mit Sessions (Cookie)
 * - Generischer API-Proxy für Sonarr, Radarr, SABnzbd, Plex, Prowlarr
 *   (API-Keys bleiben serverseitig, kein CORS-Problem)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const STATE_PATH = path.join(ROOT, 'notify-state.json');
const SESS_TTL = 7 * 24 * 3600 * 1000; // 7 Tage
const PKG = require('./package.json');
const REPO = 'zerqpain-oss/nebula-panel';

const DEFAULTS = {
  panel: { name: 'Nebula', port: 8484, icalToken: null },
  auth: { hash: null, salt: null },
  notify: {
    telegram: { enabled: false, botToken: '', chatId: '' },
    discord:  { enabled: false, webhookUrl: '' },
    ntfy:     { enabled: false, server: 'https://ntfy.sh', topic: '' },
    events: { imported: true, failed: true, health: true, disk: true, grabbed: false },
    diskThreshold: 90
  },
  services: {
    sonarr:   { enabled: false, url: 'http://localhost:8989',  apiKey: '' },
    radarr:   { enabled: false, url: 'http://localhost:7878',  apiKey: '' },
    lidarr:   { enabled: false, url: 'http://localhost:8686',  apiKey: '' },
    readarr:  { enabled: false, url: 'http://localhost:8787',  apiKey: '' },
    sabnzbd:  { enabled: false, url: 'http://localhost:8080',  apiKey: '' },
    plex:     { enabled: false, url: 'http://localhost:32400', apiKey: '' },
    prowlarr: { enabled: false, url: 'http://localhost:9696',  apiKey: '' },
    bazarr:   { enabled: false, url: 'http://localhost:6767',  apiKey: '' }
  }
};

function deepMerge(base, extra) {
  for (const k of Object.keys(extra || {})) {
    if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k]) && base[k] && typeof base[k] === 'object') {
      deepMerge(base[k], extra[k]);
    } else if (extra[k] !== undefined) {
      base[k] = extra[k];
    }
  }
  return base;
}

function loadConfig() {
  const cfg = structuredClone(DEFAULTS);
  try {
    deepMerge(cfg, JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
  } catch (e) { /* erste Ausführung */ }
  return cfg;
}
let config = loadConfig();

function saveConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/* iCal-Token beim ersten Start erzeugen */
if (!config.panel.icalToken) {
  config.panel.icalToken = crypto.randomBytes(12).toString('hex');
  saveConfig();
}

/* Zustand des Benachrichtigungs-Watchers (verhindert Doppel-Meldungen) */
let nstate = { lastHist: {}, health: {}, disks: {} };
try { nstate = Object.assign(nstate, JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))); } catch (e) {}
function saveState() {
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(nstate)); } catch (e) {}
}

/* ---------- Auth ---------- */
const sessions = new Map();      // token -> expiry
const loginAttempts = new Map(); // ip -> { count, until }

setInterval(() => {
  const now = Date.now();
  for (const [t, exp] of sessions) if (exp < now) sessions.delete(t);
}, 60 * 60 * 1000).unref();

function hashPw(pw, salt) {
  return crypto.scryptSync(String(pw), salt, 64).toString('hex');
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function getSession(req) {
  const t = parseCookies(req).nebula_session;
  if (!t) return null;
  const exp = sessions.get(t);
  if (!exp || exp < Date.now()) { sessions.delete(t); return null; }
  sessions.set(t, Date.now() + SESS_TTL); // gleitende Verlängerung
  return t;
}

function newSession(res) {
  const t = crypto.randomBytes(32).toString('hex');
  sessions.set(t, Date.now() + SESS_TTL);
  res.setHeader('Set-Cookie', `nebula_session=${t}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`);
  return t;
}

/* ---------- Helfer ---------- */
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('Body zu groß')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJSON(req) {
  const buf = await readBody(req, 1024 * 1024);
  try { return JSON.parse(buf.toString('utf8') || '{}'); }
  catch { throw new Error('Ungültiges JSON'); }
}

/* ---------- Statische Dateien ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json'
};

function serveStatic(req, res, urlPath) {
  let p = decodeURIComponent(urlPath);
  if (p === '/' || p === '') p = '/index.html';
  const fp = path.join(PUB, path.normalize(p));
  if (!fp.startsWith(PUB)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.stat(fp, (err, st) => {
    if (err || !st.isFile()) {
      // SPA-Fallback
      if (!path.extname(p)) return serveStatic(req, res, '/index.html');
      res.writeHead(404); res.end('Not found'); return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(fp).pipe(res);
  });
}

/* ---------- Proxy ---------- */
const SERVICE_DEFS = {
  sonarr:   { header: 'X-Api-Key' },
  radarr:   { header: 'X-Api-Key' },
  lidarr:   { header: 'X-Api-Key' },
  readarr:  { header: 'X-Api-Key' },
  prowlarr: { header: 'X-Api-Key' },
  bazarr:   { header: 'X-API-KEY' },
  plex:     { header: 'X-Plex-Token' },
  sabnzbd:  { query: true }
};

async function proxy(req, res, svcName, rest) {
  const svc = config.services[svcName];
  if (!svc || !svc.enabled || !svc.url || !svc.apiKey) {
    return sendJSON(res, 502, { error: `${svcName} ist nicht konfiguriert (Einstellungen prüfen)` });
  }
  const def = SERVICE_DEFS[svcName];
  let target = svc.url.replace(/\/+$/, '') + rest;
  const headers = { 'Accept': 'application/json' };
  if (def.query) {
    target += (target.includes('?') ? '&' : '?') + 'apikey=' + encodeURIComponent(svc.apiKey) + '&output=json';
  } else {
    headers[def.header] = svc.apiKey;
    /* Key zusätzlich als Query-Parameter: nötig für Bild-Endpunkte
       (MediaCover bei Sonarr/Radarr, photo/transcode bei Plex) */
    const qk = svcName === 'plex' ? 'X-Plex-Token' : 'apikey';
    target += (target.includes('?') ? '&' : '?') + qk + '=' + encodeURIComponent(svc.apiKey);
  }
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') body = await readBody(req);

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 45000);
  try {
    const r = await fetch(target, {
      method: req.method,
      headers,
      body: body && body.length ? body : undefined,
      signal: ctrl.signal,
      redirect: 'follow'
    });
    const buf = Buffer.from(await r.arrayBuffer());
    res.writeHead(r.status, {
      'Content-Type': r.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  } catch (e) {
    const why = (e.cause && e.cause.code) || e.name === 'AbortError' && 'Timeout' || e.message;
    sendJSON(res, 502, { error: `${svcName} nicht erreichbar: ${why}` });
  } finally {
    clearTimeout(to);
  }
}

/* ---------- Verbindungstest ---------- */
async function testService(type, url, apiKey) {
  url = String(url || '').replace(/\/+$/, '');
  if (!url) throw new Error('URL fehlt');
  const get = async (u, headers) => {
    const r = await fetch(u, { headers, signal: AbortSignal.timeout(8000) });
    if (r.status === 401 || r.status === 403) throw new Error('API-Key/Token ungültig (HTTP ' + r.status + ')');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r;
  };
  if (type === 'sonarr' || type === 'radarr') {
    const j = await (await get(url + '/api/v3/system/status', { 'X-Api-Key': apiKey, Accept: 'application/json' })).json();
    return `Verbunden – Version ${j.version}`;
  }
  if (type === 'prowlarr' || type === 'lidarr' || type === 'readarr') {
    const j = await (await get(url + '/api/v1/system/status', { 'X-Api-Key': apiKey, Accept: 'application/json' })).json();
    return `Verbunden – Version ${j.version}`;
  }
  if (type === 'bazarr') {
    const j = await (await get(url + '/api/system/status', { 'X-API-KEY': apiKey, Accept: 'application/json' })).json();
    return `Verbunden – Version ${(j.data && j.data.bazarr_version) || 'unbekannt'}`;
  }
  if (type === 'sabnzbd') {
    const j = await (await get(url + '/api?mode=queue&limit=1&output=json&apikey=' + encodeURIComponent(apiKey))).json();
    if (j.error) throw new Error(j.error);
    return 'Verbunden – Queue erreichbar';
  }
  if (type === 'plex') {
    const j = await (await get(url + '/library/sections', { 'X-Plex-Token': apiKey, Accept: 'application/json' })).json();
    const n = (j.MediaContainer && j.MediaContainer.size) || 0;
    return `Verbunden – ${n} Bibliothek(en)`;
  }
  throw new Error('Unbekannter Diensttyp');
}

/* ---------- Interner API-Zugriff (für Watcher & iCal) ---------- */
const ARR_APIS = { sonarr: '/api/v3', radarr: '/api/v3', lidarr: '/api/v1', readarr: '/api/v1' };
const SVC_NAMES = { sonarr: 'Sonarr', radarr: 'Radarr', lidarr: 'Lidarr', readarr: 'Readarr' };

async function arrGet(svcName, apiPath) {
  const svc = config.services[svcName];
  if (!svc || !svc.enabled || !svc.url || !svc.apiKey) throw new Error('nicht konfiguriert');
  const url = svc.url.replace(/\/+$/, '') + apiPath + (apiPath.includes('?') ? '&' : '?') + 'apikey=' + encodeURIComponent(svc.apiKey);
  const r = await fetch(url, { headers: { 'X-Api-Key': svc.apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/* ---------- Benachrichtigungen ---------- */
function anyProviderEnabled() {
  const n = config.notify || {};
  return !!((n.telegram && n.telegram.enabled && n.telegram.botToken && n.telegram.chatId) ||
    (n.discord && n.discord.enabled && n.discord.webhookUrl) ||
    (n.ntfy && n.ntfy.enabled && n.ntfy.topic));
}

async function sendNotification(title, message) {
  const n = config.notify || {};
  const jobs = [];
  const opts = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  if (n.telegram && n.telegram.enabled && n.telegram.botToken && n.telegram.chatId) {
    jobs.push(fetch(`https://api.telegram.org/bot${n.telegram.botToken}/sendMessage`,
      opts({ chat_id: n.telegram.chatId, text: title + '\n' + message })));
  }
  if (n.discord && n.discord.enabled && n.discord.webhookUrl) {
    jobs.push(fetch(n.discord.webhookUrl, opts({ content: '**' + title + '**\n' + message })));
  }
  if (n.ntfy && n.ntfy.enabled && n.ntfy.topic) {
    const base = (n.ntfy.server || 'https://ntfy.sh').replace(/\/+$/, '');
    jobs.push(fetch(`${base}/${encodeURIComponent(n.ntfy.topic)}?title=${encodeURIComponent(title)}`,
      { method: 'POST', body: message, signal: AbortSignal.timeout(10000) }));
  }
  const results = await Promise.allSettled(jobs);
  const failed = results.filter(r => r.status === 'rejected' || (r.value && !r.value.ok)).length;
  return { sent: results.length - failed, failed };
}

const NOTIFY_EVENTS = {
  downloadFolderImported: 'imported', downloadImported: 'imported', trackFileImported: 'imported',
  bookFileImported: 'imported', seriesFolderImported: 'imported', movieFolderImported: 'imported',
  downloadFailed: 'failed', grabbed: 'grabbed'
};
const NOTIFY_LABELS = { imported: 'Import abgeschlossen', failed: 'Download fehlgeschlagen', grabbed: 'Release geholt' };

async function notifyTick() {
  if (!anyProviderEnabled()) return;
  const n = config.notify;
  let dirty = false;
  for (const [svcName, api] of Object.entries(ARR_APIS)) {
    const svc = config.services[svcName];
    if (!svc || !svc.enabled || !svc.apiKey) continue;
    /* Historie: Import fertig / fehlgeschlagen / geholt */
    try {
      const hist = await arrGet(svcName, api + '/history?page=1&pageSize=25&sortKey=date&sortDirection=descending');
      if (!nstate.lastHist[svcName]) {
        nstate.lastHist[svcName] = new Date().toISOString(); /* Erster Lauf: kein Backlog melden */
        dirty = true;
      } else {
        const lastT = new Date(nstate.lastHist[svcName]).getTime();
        let newest = lastT;
        for (const rec of (hist.records || [])) {
          const rt = new Date(rec.date).getTime();
          if (!rt || rt <= lastT) continue;
          if (rt > newest) newest = rt;
          const cat = NOTIFY_EVENTS[rec.eventType];
          if (!cat || !n.events[cat]) continue;
          await sendNotification(`${SVC_NAMES[svcName]} · ${NOTIFY_LABELS[cat]}`, rec.sourceTitle || '?');
        }
        if (newest > lastT) { nstate.lastHist[svcName] = new Date(newest).toISOString(); dirty = true; }
      }
    } catch (e) {}
    /* Health: nur NEUE Meldungen */
    if (n.events.health) {
      try {
        const hs = await arrGet(svcName, api + '/health');
        const cur = (hs || []).map(x => x.message);
        const prev = new Set(nstate.health[svcName] || []);
        for (const m of cur) {
          if (!prev.has(m)) await sendNotification(`${SVC_NAMES[svcName]} · Systemwarnung`, m);
        }
        nstate.health[svcName] = cur;
        dirty = true;
      } catch (e) {}
    }
    /* Speicherplatz */
    if (n.events.disk) {
      try {
        const ds = await arrGet(svcName, api + '/diskspace');
        for (const d of (ds || [])) {
          if (!d.totalSpace) continue;
          const pct = Math.round((d.totalSpace - d.freeSpace) / d.totalSpace * 100);
          const lastAlert = nstate.disks[d.path] || 0;
          if (pct >= (n.diskThreshold || 90) && Date.now() - lastAlert > 24 * 3600 * 1000) {
            const freeGb = (d.freeSpace / 1024 / 1024 / 1024).toFixed(1);
            await sendNotification('Speicherplatz knapp', `${d.path}: ${pct}% belegt, noch ${freeGb} GB frei`);
            nstate.disks[d.path] = Date.now();
            dirty = true;
          }
        }
      } catch (e) {}
    }
  }
  if (dirty) saveState();
}
setInterval(() => notifyTick().catch(() => {}), 3 * 60 * 1000).unref();
setTimeout(() => notifyTick().catch(() => {}), 20 * 1000).unref();

/* ---------- iCal-Export ---------- */
function icsEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function icsDateTime(d) { return new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
function icsDay(d) { return new Date(d).toISOString().slice(0, 10).replace(/-/g, ''); }

async function serveIcal(req, res, u) {
  const tok = u.searchParams.get('token');
  if (!config.panel.icalToken || tok !== config.panel.icalToken) {
    res.writeHead(403); return res.end('Forbidden');
  }
  const start = new Date(Date.now() - 7 * 86400000);
  const end = new Date(Date.now() + 30 * 86400000);
  const range = `start=${start.toISOString()}&end=${end.toISOString()}`;
  const ev = [];
  try {
    (await arrGet('sonarr', `/api/v3/calendar?${range}&includeSeries=true`)).forEach(e => {
      if (!e.airDateUtc) return;
      const s = e.series || {};
      ev.push({
        uid: `sonarr-${e.id}`, allDay: false, dt: e.airDateUtc,
        mins: s.runtime || 45,
        sum: `${s.title || '?'} S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}${e.title ? ' – ' + e.title : ''}`
      });
    });
  } catch (e) {}
  try {
    (await arrGet('radarr', `/api/v3/calendar?${range}`)).forEach(m => {
      [['Kino', m.inCinemas], ['Digital', m.digitalRelease], ['Disc', m.physicalRelease]].forEach(x => {
        if (x[1] && new Date(x[1]) >= start && new Date(x[1]) < end) {
          ev.push({ uid: `radarr-${m.id}-${x[0]}`, allDay: true, dt: x[1], sum: `${m.title} (${x[0]}-Release)` });
        }
      });
    });
  } catch (e) {}
  try {
    (await arrGet('lidarr', `/api/v1/calendar?${range}&includeArtist=true`)).forEach(a => {
      if (a.releaseDate) ev.push({ uid: `lidarr-${a.id}`, allDay: true, dt: a.releaseDate, sum: `${a.artist ? a.artist.artistName + ' – ' : ''}${a.title} (Album)` });
    });
  } catch (e) {}
  try {
    (await arrGet('readarr', `/api/v1/calendar?${range}&includeAuthor=true`)).forEach(b => {
      if (b.releaseDate) ev.push({ uid: `readarr-${b.id}`, allDay: true, dt: b.releaseDate, sum: `${b.author ? b.author.authorName + ' – ' : ''}${b.title} (Buch)` });
    });
  } catch (e) {}

  const now = icsDateTime(new Date());
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nebula Panel//DE', 'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:' + icsEscape(config.panel.name)];
  ev.forEach(e => {
    L.push('BEGIN:VEVENT', `UID:${e.uid}@nebula-panel`, 'DTSTAMP:' + now);
    if (e.allDay) L.push('DTSTART;VALUE=DATE:' + icsDay(e.dt));
    else {
      L.push('DTSTART:' + icsDateTime(e.dt));
      L.push('DTEND:' + icsDateTime(new Date(new Date(e.dt).getTime() + (e.mins || 45) * 60000)));
    }
    L.push('SUMMARY:' + icsEscape(e.sum), 'END:VEVENT');
  });
  L.push('END:VCALENDAR');
  res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(L.join('\r\n'));
}

/* ---------- Update-Check ---------- */
let verCache = { t: 0, latest: null };
async function latestVersion() {
  if (Date.now() - verCache.t < 6 * 3600 * 1000) return verCache.latest;
  let latest = null;
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${REPO}/main/package.json`, { signal: AbortSignal.timeout(8000) });
    if (r.ok) latest = (await r.json()).version || null;
  } catch (e) {}
  verCache = { t: Date.now(), latest };
  return latest;
}

/* ---------- Router ---------- */
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    const p = u.pathname;

    /* --- iCal (Token-geschützt, ohne Session nutzbar) --- */
    if (p === '/calendar.ics' && req.method === 'GET') return serveIcal(req, res, u);

    /* --- API & Proxy --- */
    if (p.startsWith('/api/') || p.startsWith('/proxy/')) {

      if (p === '/api/authstate' && req.method === 'GET') {
        return sendJSON(res, 200, {
          needsSetup: !config.auth.hash,
          authed: !!getSession(req),
          name: config.panel.name
        });
      }

      if (p === '/api/setup' && req.method === 'POST') {
        if (config.auth.hash) return sendJSON(res, 403, { error: 'Bereits eingerichtet' });
        const b = await readJSON(req);
        if (!b.password || String(b.password).length < 6) return sendJSON(res, 400, { error: 'Passwort: mindestens 6 Zeichen' });
        const salt = crypto.randomBytes(16).toString('hex');
        config.auth = { salt, hash: hashPw(b.password, salt) };
        saveConfig();
        newSession(res);
        return sendJSON(res, 200, { ok: true });
      }

      if (p === '/api/login' && req.method === 'POST') {
        const ip = req.socket.remoteAddress || '?';
        const att = loginAttempts.get(ip) || { count: 0, until: 0 };
        if (att.until > Date.now()) return sendJSON(res, 429, { error: 'Zu viele Versuche – bitte 15 Minuten warten' });
        const b = await readJSON(req);
        if (!config.auth.hash) return sendJSON(res, 400, { error: 'Noch kein Passwort gesetzt' });
        const tryHash = Buffer.from(hashPw(b.password || '', config.auth.salt));
        const realHash = Buffer.from(config.auth.hash);
        const ok = tryHash.length === realHash.length && crypto.timingSafeEqual(tryHash, realHash);
        if (!ok) {
          att.count++;
          if (att.count >= 8) { att.until = Date.now() + 15 * 60 * 1000; att.count = 0; }
          loginAttempts.set(ip, att);
          return sendJSON(res, 401, { error: 'Falsches Passwort' });
        }
        loginAttempts.delete(ip);
        newSession(res);
        return sendJSON(res, 200, { ok: true });
      }

      /* Ab hier: Login erforderlich */
      const sess = getSession(req);
      if (!sess) return sendJSON(res, 401, { error: 'Nicht angemeldet' });

      if (p === '/api/logout' && req.method === 'POST') {
        sessions.delete(sess);
        res.setHeader('Set-Cookie', 'nebula_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
        return sendJSON(res, 200, { ok: true });
      }

      if (p === '/api/config' && req.method === 'GET') {
        return sendJSON(res, 200, {
          panel: { name: config.panel.name, icalToken: config.panel.icalToken },
          services: config.services,
          notify: config.notify
        });
      }

      if (p === '/api/version' && req.method === 'GET') {
        const latest = await latestVersion();
        return sendJSON(res, 200, {
          current: PKG.version, latest,
          updateAvailable: !!latest && latest !== PKG.version
        });
      }

      if (p === '/api/notify/test' && req.method === 'POST') {
        if (!anyProviderEnabled()) return sendJSON(res, 200, { ok: false, error: 'Kein Benachrichtigungs-Provider aktiviert' });
        const r = await sendNotification(config.panel.name + ' – Test', 'Testbenachrichtigung: Die Verbindung funktioniert!');
        return sendJSON(res, 200, { ok: r.sent > 0, sent: r.sent, failed: r.failed, error: r.sent === 0 ? 'Senden fehlgeschlagen – Zugangsdaten prüfen' : undefined });
      }

      if (p === '/api/config' && req.method === 'POST') {
        const b = await readJSON(req);
        if (b.panel && typeof b.panel.name === 'string') {
          config.panel.name = b.panel.name.trim().slice(0, 40) || 'Nebula';
        }
        if (b.services && typeof b.services === 'object') {
          for (const k of Object.keys(config.services)) {
            const s = b.services[k];
            if (!s) continue;
            config.services[k] = {
              enabled: !!s.enabled,
              url: String(s.url || '').trim().replace(/\/+$/, ''),
              apiKey: String(s.apiKey || '').trim()
            };
          }
        }
        if (b.notify && typeof b.notify === 'object') {
          const n = config.notify;
          for (const prov of ['telegram', 'discord', 'ntfy']) {
            const src = b.notify[prov];
            if (!src) continue;
            for (const f of Object.keys(n[prov])) {
              if (f === 'enabled') n[prov].enabled = !!src.enabled;
              else if (src[f] !== undefined) n[prov][f] = String(src[f]).trim();
            }
          }
          if (b.notify.events && typeof b.notify.events === 'object') {
            for (const f of Object.keys(n.events)) {
              if (f in b.notify.events) n.events[f] = !!b.notify.events[f];
            }
          }
          if (b.notify.diskThreshold !== undefined) {
            n.diskThreshold = Math.min(99, Math.max(50, +b.notify.diskThreshold || 90));
          }
        }
        saveConfig();
        return sendJSON(res, 200, { ok: true });
      }

      if (p === '/api/password' && req.method === 'POST') {
        const b = await readJSON(req);
        const tryHash = Buffer.from(hashPw(b.current || '', config.auth.salt));
        const realHash = Buffer.from(config.auth.hash);
        if (tryHash.length !== realHash.length || !crypto.timingSafeEqual(tryHash, realHash)) {
          return sendJSON(res, 401, { error: 'Aktuelles Passwort ist falsch' });
        }
        if (!b.next || String(b.next).length < 6) return sendJSON(res, 400, { error: 'Neues Passwort: mindestens 6 Zeichen' });
        const salt = crypto.randomBytes(16).toString('hex');
        config.auth = { salt, hash: hashPw(b.next, salt) };
        saveConfig();
        return sendJSON(res, 200, { ok: true });
      }

      if (p === '/api/test' && req.method === 'POST') {
        const b = await readJSON(req);
        try {
          const info = await testService(b.type, b.url, b.apiKey);
          return sendJSON(res, 200, { ok: true, info });
        } catch (e) {
          const why = (e.cause && e.cause.code) || e.message;
          return sendJSON(res, 200, { ok: false, error: why });
        }
      }

      const m = p.match(/^\/proxy\/(sonarr|radarr|lidarr|readarr|sabnzbd|plex|prowlarr|bazarr)(\/.*)?$/);
      if (m) {
        const rest = (m[2] || '/') + (u.search || '');
        return proxy(req, res, m[1], rest);
      }

      return sendJSON(res, 404, { error: 'Unbekannter Endpunkt' });
    }

    /* --- Statisch --- */
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, p);
    res.writeHead(405); res.end();
  } catch (e) {
    try { sendJSON(res, 500, { error: e.message }); } catch { /* Verbindung weg */ }
  }
});

const PORT = process.env.PORT || config.panel.port || 8484;
const HOST = process.env.HOST || config.panel.host || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  =========================================');
  console.log('   NEBULA - Media Control Panel');
  console.log(`   Laeuft auf http://${HOST}:${PORT}`);
  console.log('   Erster Start: Passwort im Browser');
  console.log('   festlegen, dann Dienste eintragen.');
  console.log('  =========================================');
  console.log('');
});
