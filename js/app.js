/* app.js: wires data + UI together (Phase 2: home clock, find teacher, full timetable). */
(function () {
  'use strict';
  var T = HOWTT, U = HOWUI, $ = function (id) { return document.getElementById(id); };
  var idx = null, tz = 'Asia/Karachi', selectedId = null, previewNow = null;

  function now() { return T.schoolNow(tz, previewNow); }

  function setBanner(msg, kind) {
    var b = $('banner'); b.textContent = msg || ''; b.className = 'banner ' + (kind || '') + (msg ? ' show' : '');
  }

  function init(res) {
    idx = T.buildIndex(res.data);
    tz = (res.data.settings && res.data.settings.SchoolTimezone) || 'Asia/Karachi';
    if (res.data.settings && res.data.settings.SchoolName) $('schoolName').textContent = String(res.data.settings.SchoolName).toUpperCase();
    if (res.source === 'cache') setBanner('Showing saved copy from ' + new Date(res.cachedAt).toLocaleString() + '. Reconnect to refresh.', 'warn');
    else if (res.source === 'local') setBanner('Preview mode: using the imported timetable file. Set API_URL in js/config.js to use Google Sheets.', 'info');
    else setBanner('');
    $('app').hidden = false; $('loading').hidden = true;
    renderClock(); renderResults(''); if (selectedId) renderSelected();
  }

  function renderClock() {
    var n = now();
    $('today').textContent = n.dateLabel;
    var h = Math.floor(n.minutes / 60), m = n.minutes % 60, s = n.seconds || 0;
    $('clock').textContent = T.fmtTime(n.minutes).replace(/ (AM|PM)/, ':' + (s < 10 ? '0' : '') + s + ' $1');
    var lbl;
    if (!idx) lbl = '';
    else if (idx.workingDays.indexOf(n.day) < 0) lbl = 'No school today';
    else if (n.minutes < idx.periods[0].start) lbl = 'School starts at ' + T.fmtTime(idx.periods[0].start);
    else if (n.minutes >= idx.periods[idx.periods.length - 1].end) lbl = 'School day finished';
    else { var p = T.periodAt(idx, n.minutes); lbl = p ? (p.type === 'Break' ? 'Break time' : T.lessonLabel(p) + ' running') : 'Between lessons'; }
    $('curLesson').textContent = lbl;
  }

  function renderResults(q) {
    var list = T.searchTeachers(idx, q), ul = $('results');
    if (!list.length) { ul.innerHTML = '<li class="empty">No teacher found.</li>'; return; }
    ul.innerHTML = list.map(function (t) {
      return '<li><button type="button" data-id="' + U.esc(t.id) + '"' + (t.id === selectedId ? ' class="sel"' : '') + '><b>' + U.esc(t.name) + '</b><small>' + U.esc(t.subjects) + '</small></button></li>';
    }).join('');
  }

  function renderSelected() {
    var st = HOWTT.getStatus(idx, selectedId, now());
    $('statusArea').innerHTML = U.statusCard(st);
    $('fullBtn').hidden = false;
    if (!$('fullArea').hidden) renderFull();
    $('statusArea').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderFull() {
    var wk = T.getWeek(idx, selectedId), t = idx.teacherById[selectedId];
    if (!wk.lessonCount) { $('fullArea').innerHTML = '<p class="msg">Timetable information not available.</p>'; return; }
    $('fullArea').innerHTML = '<h3>' + U.esc(t.name) + ' — weekly timetable <small>(' + wk.lessonCount + ' lessons)</small></h3>' +
      '<div class="only-wide">' + U.weekTable(wk, now()) + '</div><div class="only-narrow">' + U.weekCards(wk, now()) + '</div>';
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('search').addEventListener('input', function (e) { if (idx) renderResults(e.target.value); });
    $('results').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      selectedId = b.getAttribute('data-id'); $('fullArea').hidden = true; $('fullBtn').textContent = 'VIEW FULL TIMETABLE';
      renderResults($('search').value); renderSelected();
    });
    $('fullBtn').addEventListener('click', function () {
      var show = $('fullArea').hidden; $('fullArea').hidden = !show;
      this.textContent = show ? 'HIDE FULL TIMETABLE' : 'VIEW FULL TIMETABLE';
      if (show) renderFull();
    });
    $('retry').addEventListener('click', start);
    // Test helper: add ?day=Monday&time=10:35 to the URL to preview a moment in time.
    var q = new URLSearchParams(location.search);
    if (q.get('day') && q.get('time')) {
      var tm = q.get('time').split(':'); previewNow = { day: q.get('day'), minutes: +tm[0] * 60 + +tm[1], seconds: 0, dateLabel: q.get('day') + ' (preview)' };
    }
    start();
    setInterval(function () { if (idx) { renderClock(); if (selectedId && !previewNow) { var s = HOWTT.getStatus(idx, selectedId, now()); $('statusArea').innerHTML = U.statusCard(s); } } }, 1000 * 15);
    setInterval(function () { if (idx) renderClock(); }, 1000);
  });

  function start() {
    $('error').hidden = true; $('loading').hidden = false;
    var q = HOWAPI.quick(); if (q && !idx) init(q);
    HOWAPI.load().then(init).catch(function (err) {
      if (idx) return;                       // keep showing cached data
      $('loading').hidden = true; $('error').hidden = false; $('errorMsg').textContent = err.message;
    });
  }
})();
