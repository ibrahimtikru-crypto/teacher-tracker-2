/* api.js: loads timetable data (ONE request) and talks to the assignment API.
 * In preview mode (no API_URL) assignments live in memory only and are NOT saved. */
var HOWAPI = (function () {
  'use strict';
  var cfg = window.HOW_CONFIG, mem = [], memSeq = 1;

  function live() { return !!cfg.API_URL; }

  function fetchJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function saveCache(data) { try { localStorage.setItem(cfg.CACHE_KEY, JSON.stringify({ t: Date.now(), data: data })); } catch (e) {} }
  function readCache() { try { var c = JSON.parse(localStorage.getItem(cfg.CACHE_KEY)); return c && c.data ? c : null; } catch (e) { return null; } }
  function sep() { return cfg.API_URL.indexOf('?') < 0 ? '?' : '&'; }

  function load() {
    var req = live()
      ? fetchJSON(cfg.API_URL + sep() + 'action=bootstrap').then(function (j) {
          if (!j.ok) throw new Error(j.error || 'API error');
          return { data: j.data, source: 'live' };
        })
      : (window.HOW_LOCAL_DATA
          ? Promise.resolve({ data: window.HOW_LOCAL_DATA, source: 'local' })
          : fetchJSON(cfg.LOCAL_FALLBACK).then(function (d) { return { data: d, source: 'local' }; }));
    return req.then(function (res) { saveCache(res.data); return res; }).catch(function () {
      var c = readCache();
      if (c) return { data: c.data, source: 'cache', cachedAt: c.t };
      throw new Error('Unable to connect to timetable database. Please try again.');
    });
  }
  function quick() { var c = readCache(); return c ? { data: c.data, source: 'cache', cachedAt: c.t } : null; }

  /* ---- assignments ---- */
  function post(body) {
    return fetch(cfg.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .catch(function () { throw new Error('Unable to connect to timetable database. Please try again.'); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'Request failed'); return j; });
  }

  function getAssignments(date) {
    if (!live()) return Promise.resolve(mem.filter(function (a) { return a.date === date && a.status !== 'Cancelled'; }));
    return fetchJSON(cfg.API_URL + sep() + 'action=assignments&date=' + encodeURIComponent(date)).then(function (j) {
      if (!j.ok) throw new Error(j.error || 'API error');
      return j.assignments;
    }).catch(function (e) { throw new Error(e.message && e.message !== 'Failed to fetch' ? e.message : 'Unable to connect to timetable database. Please try again.'); });
  }

  function verify(pin) {
    if (!live()) return Promise.resolve({ ok: true });
    return post({ action: 'verify', pin: pin });
  }

  /** a = { date, day, periodId, absentId, absentName, substituteId, substituteName, cls, subject, room } */
  function assign(pin, by, a) {
    if (!live()) {
      if (mem.some(function (x) { return x.status !== 'Cancelled' && x.date === a.date && x.periodId === a.periodId && x.absentId === a.absentId; }))
        return Promise.reject(new Error('This lesson already has a substitute.'));
      var rec = Object.assign({ id: 'PREVIEW-' + (memSeq++), assignedBy: by, status: 'Assigned' }, a);
      mem.push(rec); return Promise.resolve({ ok: true, id: rec.id });
    }
    return post({ action: 'assign', pin: pin, assignedBy: by, date: a.date, absentId: a.absentId, periodId: a.periodId, substituteId: a.substituteId });
  }

  function cancel(pin, id) {
    if (!live()) { mem.forEach(function (x) { if (x.id === id) x.status = 'Cancelled'; }); return Promise.resolve({ ok: true }); }
    return post({ action: 'cancel', pin: pin, id: id });
  }

  return { load: load, quick: quick, live: live, getAssignments: getAssignments, verify: verify, assign: assign, cancel: cancel };
})();
