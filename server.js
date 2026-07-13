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
const SESS_TTL = 7 * 24 * 3600 * 1000; // 7 Tage

const DEFAULTS = {
  panel: { name: 'Nebula', port: 8484 },
  auth: { hash: null, salt: null },
  services: {
    sonarr:   { enabled: false, url: 'http://localhost:8989',  apiKey: '' },
    radarr:   { enabled: false, url: 'http://localhost:7878',  apiKey: '' },
    sabnzbd:  { enabled: false, url: 'http://localhost:8080',  apiKey: '' },
    plex:     { enabled: false, url: 'http://localhost:32400', apiKey: '' },
    prowlarr: { enabled: false, url: 'http://localhost:9696',  apiKey: '' }
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
  prowlarr: { header: 'X-Api-Key' },
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
  if (type === 'prowlarr') {
    const j = await (await get(url + '/api/v1/system/status', { 'X-Api-Key': apiKey, Accept: 'application/json' })).json();
    return `Verbunden – Version ${j.version}`;
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

/* ---------- Router ---------- */
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    const p = u.pathname;

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
        return sendJSON(res, 200, { panel: { name: config.panel.name }, services: config.services });
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

      const m = p.match(/^\/proxy\/(sonarr|radarr|sabnzbd|plex|prowlarr)(\/.*)?$/);
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
