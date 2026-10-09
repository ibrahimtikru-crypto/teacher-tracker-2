/* app.js: wires data + UI together.
 * Phase 2: home clock, find teacher, full timetable.   Phase 4: find substitute. */
(function () {
  'use strict';
  var T = HOWTT, U = HOWUI, $ = function (id) { return document.getElementById(id); };
  var idx = null, tz = 'Asia/Karachi', selectedId = null, previewNow = null, rules = null;

  function now() { return T.schoolNow(tz, previewNow); }

  function setBanner(msg, kind) {
    var b = $('banner'); b.textContent = msg || ''; b.className = 'banner ' + (kind || '') + (msg ? ' show' : '');
  }

  function init(res) {
    idx = T.buildIndex(res.data);
    rules = res.data.rules || null;
    tz = (res.data.settings && res.data.settings.SchoolTimezone) || 'Asia/Karachi';
    if (res.data.settings && res.data.settings.SchoolName) $('schoolName').textContent = String(res.data.settings.SchoolName).toUpperCase();
    if (res.source === 'cache') setBanner('Showing saved copy from ' + new Date(res.cachedAt).toLocaleString() + '. Reconnect to refresh.', 'warn');
    else if (res.source === 'local') setBanner('Preview mode: using the imported timetable file. Set API_URL in js/config.js to use Google Sheets.', 'info');
    else setBanner('');
    $('app').hidden = false; $('loading').hidden = true;
    renderClock(); renderResults($('search').value || ''); fillSubForm(); if (selectedId) renderSelected();
    showView();
  }

  /* ---------- views ---------- */
  function showView() {
    var v = location.hash === '#substitute' ? 'substitute' : 'find';
    $('findView').hidden = v !== 'find'; $('subView').hidden = v !== 'substitute';
    Array.prototype.forEach.call(document.querySelectorAll('.mbtn[data-view]'), function (a) {
      a.classList.toggle('on', a.getAttribute('data-view') === v);
    });
  }

  /* ---------- clock ---------- */
  function renderClock() {
    var n = now();
    $('today').textContent = n.dateLabel;
    var s = n.seconds || 0;
    $('clock').textContent = T.fmtTime(n.minutes).replace(/ (AM|PM)/, ':' + (s < 10 ? '0' : '') + s + ' $1');
    var lbl;
    if (!idx) lbl = '';
    else if (idx.workingDays.indexOf(n.day) < 0) lbl = 'No school today';
    else if (n.minutes < idx.periods[0].start) lbl = 'School starts at ' + T.fmtTime(idx.periods[0].start);
    else if (n.minutes >= idx.periods[idx.periods.length - 1].end) lbl = 'School day finished';
    else { var p = T.periodAt(idx, n.minutes); lbl = p ? (p.type === 'Break' ? 'Break time' : T.lessonLabel(p) + ' running') : 'Between lessons'; }
    $('curLesson').textContent = lbl;
  }

  /* ---------- find teacher (Phase 2) ---------- */
  function renderResults(q) {
    var list = T.searchTeachers(idx, q), ul = $('results');
    if (!list.length) { ul.innerHTML = '<li class="empty">No teacher found.</li>'; return; }
    ul.innerHTML = list.map(function (t) {
      return '<li><button type="button" data-id="' + U.esc(t.id) + '"' + (t.id === selectedId ? ' class="sel"' : '') + '><b>' + U.esc(t.name) + '</b><small>' + U.esc(t.subjects) + '</small></button></li>';
    }).join('');
  }

  function renderSelected() {
    var st = T.getStatus(idx, selectedId, now());
    $('statusArea').innerHTML = U.statusCard(st);
    $('fullBtn').hidden = false;
    if (!$('fullArea').hidden) renderFull();
  }

  function renderFull() {
    var wk = T.getWeek(idx, selectedId), t = idx.teacherById[selectedId];
    if (!wk.lessonCount) { $('fullArea').innerHTML = '<p class="msg">Timetable information not available.</p>'; return; }
    $('fullArea').innerHTML = '<h3>' + U.esc(t.name) + ' — weekly timetable <small>(' + wk.lessonCount + ' lessons)</small></h3>' +
      '<div class="only-wide">' + U.weekTable(wk, now()) + '</div><div class="only-narrow">' + U.weekCards(wk, now()) + '</div>';
  }

  /* ---------- find + assign substitute (Phase 4-5) ---------- */
  var sub = { absentId: '', date: '', day: '', assignments: [], model: null, open: {} };
  var admin = { pin: '', name: '' };
  try { admin.pin = sessionStorage.getItem('how_pin') || ''; admin.name = sessionStorage.getItem('how_name') || ''; } catch (e) {}

  function flash(msg, kind) {
    var m = $('subMsg'); m.textContent = msg || ''; m.className = 'banner ' + (kind || '') + (msg ? ' show' : '');
    if (msg) m.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderAdmin() {
    var signed = !!admin.pin;
    $('adminForm').hidden = signed;
    $('adminBtn').textContent = signed ? 'SIGN OUT' : 'SIGN IN';
    $('adminNote').textContent = signed ? 'Signed in as ' + admin.name + '. You can assign and cancel substitutes.'
      : (HOWAPI.live() ? 'Only management can assign substitutes. Searching is open to everyone.'
        : 'Preview mode: no PIN needed and nothing is saved. Connect Google Sheets (API_URL) to save assignments.');
  }

  function fillSubForm() {
    var absent = $('absentSel'), keep = absent.value;
    absent.innerHTML = '<option value="">Select teacher…</option>' + idx.data.teachers.slice()
      .sort(function (a, b) { return a.name.localeCompare(b.name); })
      .map(function (t) { return '<option value="' + U.esc(t.id) + '">' + U.esc(t.name) + '</option>'; }).join('');
    absent.value = keep;
    if (!$('dateInp').value) $('dateInp').value = T.todayISO(tz);
    renderAdmin();
  }

  /** Teachers who cannot cover this period: already covering someone, or absent today (have substitutes assigned). */
  function exclusionsFor(periodId) {
    var ex = {};
    sub.assignments.forEach(function (a) {
      ex[a.absentId] = 1;
      if (a.periodId === periodId) ex[a.substituteId] = 1;
    });
    return ex;
  }

  function buildModel() {
    var absent = idx.teacherById[sub.absentId];
    var byPeriod = {};
    sub.assignments.forEach(function (a) { if (a.absentId === sub.absentId) byPeriod[a.periodId] = a; });
    sub.model = { absent: absent, date: sub.date, lessons: HOWSUB.lessonsOf(idx, sub.absentId, sub.day).map(function (l) {
      return { period: l.period, info: l.info, assignment: byPeriod[l.period.id] || null };
    }) };
  }

  function renderLessons() {
    buildModel();
    $('subResults').innerHTML = U.dayLessons(sub.model);
    Object.keys(sub.open).forEach(function (pid) { if (sub.open[pid]) renderCandidates(pid); });
  }

  function loadDay() {
    var absentId = $('absentSel').value, date = $('dateInp').value, out = $('subResults');
    flash('');
    if (!absentId) { out.innerHTML = '<section class="card errorbox"><p class="msg">Please select the absent teacher first.</p></section>'; return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { out.innerHTML = '<section class="card errorbox"><p class="msg">Please choose a date.</p></section>'; return; }
    var day = T.dayOfDate(date);
    sub.absentId = absentId; sub.date = date; sub.day = day; sub.open = {};
    if (idx.workingDays.indexOf(day) < 0) { out.innerHTML = '<section class="card"><p class="msg">' + U.esc(day) + ' is not a school day.</p></section>'; return; }
    out.innerHTML = '<p class="msg">Loading…</p>';
    HOWAPI.getAssignments(date).then(function (list) { sub.assignments = list; renderLessons(); })
      .catch(function (e) { out.innerHTML = '<section class="card errorbox"><p class="msg">' + U.esc(e.message) + '</p></section>'; });
  }

  function renderCandidates(pid) {
    var box = $('cands-' + pid); if (!box) return;
    var r = HOWSUB.find(idx, { absentId: sub.absentId, day: sub.day, periodId: pid, exclude: exclusionsFor(pid) }, rules);
    box.innerHTML = U.candidates(r, pid);
  }

  function needSignIn() {
    flash('Please sign in below with the management PIN first.', 'err');
    $('adminBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function doAssign(btn) {
    if (!admin.pin) return needSignIn();
    var pid = btn.getAttribute('data-period'), subId = btn.getAttribute('data-assign');
    var lesson = sub.model.lessons.filter(function (l) { return l.period.id === pid; })[0], st = idx.teacherById[subId];
    if (!lesson || !st) return;
    btn.disabled = true; btn.textContent = 'SAVING…';
    HOWAPI.assign(admin.pin, admin.name, {
      date: sub.date, day: sub.day, periodId: pid, absentId: sub.absentId, absentName: sub.model.absent.name,
      substituteId: subId, substituteName: st.name, cls: lesson.info.classes.join(', '), subject: lesson.info.subject, room: lesson.info.rooms.join(' / ')
    }).then(function () {
      flash(st.name + ' assigned to ' + T.lessonLabel(lesson.period) + ' (' + lesson.info.classes.join(', ') + ').', 'ok');
      sub.open[pid] = false;
      return HOWAPI.getAssignments(sub.date);
    }).then(function (list) { sub.assignments = list; renderLessons(); })
      .catch(function (e) { flash(e.message, 'err'); btn.disabled = false; btn.textContent = 'ASSIGN'; if (/PIN/.test(e.message)) signOut(); });
  }

  function doCancel(btn) {
    if (!admin.pin) return needSignIn();
    if (!window.confirm('Cancel this substitute assignment?')) return;
    btn.disabled = true;
    HOWAPI.cancel(admin.pin, btn.getAttribute('data-cancel')).then(function () {
      flash('Assignment cancelled.', 'ok'); return HOWAPI.getAssignments(sub.date);
    }).then(function (list) { sub.assignments = list; renderLessons(); })
      .catch(function (e) { flash(e.message, 'err'); btn.disabled = false; });
  }

  function showSubTeacher(id) {
    var box = $('subTimetable'); if (!box) return;
    var wk = T.getWeek(idx, id), t = idx.teacherById[id];
    box.innerHTML = '<section class="card"><h3>' + U.esc(t.name) + ' — weekly timetable <small>(' + wk.lessonCount + ' lessons)</small></h3>' +
      '<div class="only-wide">' + U.weekTable(wk, now()) + '</div><div class="only-narrow">' + U.weekCards(wk, now()) + '</div></section>';
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function signOut() {
    admin.pin = ''; admin.name = '';
    try { sessionStorage.removeItem('how_pin'); sessionStorage.removeItem('how_name'); } catch (e) {}
    renderAdmin();
  }

  function signIn() {
    if (admin.pin) { signOut(); $('adminMsg').textContent = ''; return; }
    var name = $('adminName').value.trim(), pin = $('adminPin').value;
    if (!name) { $('adminMsg').textContent = 'Please enter your name.'; return; }
    if (HOWAPI.live() && !pin) { $('adminMsg').textContent = 'Please enter the PIN.'; return; }
    $('adminBtn').disabled = true; $('adminMsg').textContent = 'Checking…';
    HOWAPI.verify(pin).then(function () {
      admin.pin = pin || 'preview'; admin.name = name;
      try { sessionStorage.setItem('how_pin', admin.pin); sessionStorage.setItem('how_name', name); } catch (e) {}
      $('adminPin').value = ''; $('adminMsg').textContent = ''; renderAdmin();
    }).catch(function (e) { $('adminMsg').textContent = e.message; })
      .then(function () { $('adminBtn').disabled = false; });
  }

  function shareText() { return U.summaryText(sub.model); }

  /* ---------- events ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    $('search').addEventListener('input', function (e) { if (idx) renderResults(e.target.value); });
    $('results').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      selectedId = b.getAttribute('data-id'); $('fullArea').hidden = true; $('fullBtn').textContent = 'VIEW FULL TIMETABLE';
      renderResults($('search').value); renderSelected();
      $('statusArea').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    $('fullBtn').addEventListener('click', function () {
      var show = $('fullArea').hidden; $('fullArea').hidden = !show;
      this.textContent = show ? 'HIDE FULL TIMETABLE' : 'VIEW FULL TIMETABLE';
      if (show) renderFull();
    });
    $('findSubBtn').addEventListener('click', loadDay);
    $('adminBtn').addEventListener('click', signIn);
    $('subResults').addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.hasAttribute('data-find')) { var pid = t.getAttribute('data-find'); sub.open[pid] = true; renderCandidates(pid); }
      else if (t.hasAttribute('data-assign')) doAssign(t);
      else if (t.hasAttribute('data-cancel')) doCancel(t);
      else if (t.hasAttribute('data-tt')) showSubTeacher(t.getAttribute('data-tt'));
      else if (t.hasAttribute('data-copy')) {
        var txt = shareText();
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { flash('Summary copied.', 'ok'); }, function () { window.prompt('Copy this text:', txt); });
      } else if (t.hasAttribute('data-share')) window.open('https://wa.me/?text=' + encodeURIComponent(shareText()), '_blank');
    });
    $('retry').addEventListener('click', start);
    window.addEventListener('hashchange', showView);

    // Test helper: add ?day=Monday&time=10:35 to preview a moment in time.
    var q = new URLSearchParams(location.search);
    if (q.get('day') && q.get('time')) {
      var tm = q.get('time').split(':');
      previewNow = { day: q.get('day'), minutes: +tm[0] * 60 + +tm[1], seconds: 0, dateLabel: q.get('day') + ' (preview)' };
    }
    start();
    setInterval(function () {
      if (idx && selectedId && !previewNow && !$('findView').hidden) $('statusArea').innerHTML = U.statusCard(T.getStatus(idx, selectedId, now()));
    }, 15000);
    setInterval(function () { if (idx) renderClock(); }, 1000);
  });

  function start() {
    $('error').hidden = true; $('loading').hidden = false;
    var q = HOWAPI.quick(); if (q && !idx) init(q);
    HOWAPI.load().then(init).catch(function (err) {
      if (idx) return;
      $('loading').hidden = true; $('error').hidden = false; $('errorMsg').textContent = err.message;
    });
  }
})();
