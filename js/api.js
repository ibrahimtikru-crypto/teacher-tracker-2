/* api.js: loads timetable data with ONE request, remembers a copy for offline/slow connections. */
var HOWAPI = (function () {
  'use strict';
  var cfg = window.HOW_CONFIG;

  function fetchJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function saveCache(data) {
    try { localStorage.setItem(cfg.CACHE_KEY, JSON.stringify({ t: Date.now(), data: data })); } catch (e) {}
  }
  function readCache() {
    try { var c = JSON.parse(localStorage.getItem(cfg.CACHE_KEY)); return c && c.data ? c : null; } catch (e) { return null; }
  }

  /** Resolves { data, source: 'live'|'cache'|'local', cachedAt } or rejects with a friendly message. */
  function load() {
    var req = cfg.API_URL
      ? fetchJSON(cfg.API_URL + (cfg.API_URL.indexOf('?') < 0 ? '?' : '&') + 'action=bootstrap').then(function (j) {
          if (!j.ok) throw new Error(j.error || 'API error');
          return { data: j.data, source: 'live' };
        })
      : fetchJSON(cfg.LOCAL_FALLBACK).then(function (d) { return { data: d, source: 'local' }; });

    return req.then(function (res) { saveCache(res.data); return res; }).catch(function () {
      var c = readCache();
      if (c) return { data: c.data, source: 'cache', cachedAt: c.t };
      throw new Error('Unable to connect to timetable database. Please try again.');
    });
  }

  /** Fast start: returns cached data immediately (if any) so the page can render while fresh data loads. */
  function quick() { var c = readCache(); return c ? { data: c.data, source: 'cache', cachedAt: c.t } : null; }

  return { load: load, quick: quick };
})();
