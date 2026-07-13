'use strict';
/* API-Helfer: alles läuft über den Server-Proxy */
const API = {
  async raw(method, url, body) {
    const opt = { method, headers: {} };
    if (body !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    let r;
    try { r = await fetch(url, opt); }
    catch (e) { throw new Error('Netzwerkfehler: ' + e.message); }

    if (r.status === 401 && !url.startsWith('/api/login') && !url.startsWith('/api/authstate')) {
      if (window.App && App.onUnauthed) App.onUnauthed();
      throw new Error('Nicht angemeldet');
    }

    const ct = r.headers.get('content-type') || '';
    let data = null;
    if (ct.includes('json')) { try { data = await r.json(); } catch (e) { data = null; } }
    else { try { data = await r.text(); } catch (e) { data = null; } }

    if (!r.ok) {
      let msg = 'HTTP ' + r.status;
      if (data) {
        if (typeof data === 'string' && data.length < 300) msg = data || msg;
        else if (data.error) msg = data.error;
        else if (data.message) msg = data.message;
        else if (Array.isArray(data) && data[0]) msg = data[0].errorMessage || data[0].message || msg;
      }
      const err = new Error(msg);
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return data;
  },
  p: (svc, path) => '/proxy/' + svc + path,
  get: (svc, path) => API.raw('GET', API.p(svc, path)),
  post: (svc, path, body) => API.raw('POST', API.p(svc, path), body),
  put: (svc, path, body) => API.raw('PUT', API.p(svc, path), body),
  del: (svc, path) => API.raw('DELETE', API.p(svc, path)),
  /* SABnzbd: Query-basierte API */
  sab: (q) => API.raw('GET', '/proxy/sabnzbd/api?' + q),
  /* Panel-eigene Endpunkte */
  panelGet: (p) => API.raw('GET', '/api/' + p),
  panelPost: (p, body) => API.raw('POST', '/api/' + p, body)
};
