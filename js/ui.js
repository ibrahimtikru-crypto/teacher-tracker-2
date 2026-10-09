/* ui.js: rendering helpers. All text from data is escaped. */
var HOWUI = (function () {
  'use strict';
  var T = HOWTT;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var STATE = {
    TEACHING: { cls: 'teaching', icon: '🟢', text: 'CURRENTLY TEACHING' },
    FREE: { cls: 'free', icon: '🟡', text: 'FREE' },
    BREAK: { cls: 'break', icon: '🔵', text: 'BREAK' },
    OFF: { cls: 'off', icon: '⚫', text: 'OFF TODAY' },
    BEFORE: { cls: 'off', icon: '⚫', text: 'SCHOOL NOT STARTED' },
    FINISHED: { cls: 'off', icon: '⚫', text: 'SCHOOL DAY FINISHED' },
    UNAVAILABLE: { cls: 'unavailable', icon: '🔴', text: 'UNAVAILABLE' },
    UNKNOWN: { cls: 'off', icon: '⚫', text: 'NOT AVAILABLE' }
  };

  function where(info) {
    var parts = [];
    if (info.rooms.length) parts.push(info.rooms.join(' / '));
    if (info.floors.length) parts.push(info.floors.join(' / '));
    if (info.wings.length) parts.push(info.wings.join(' / '));
    return parts.join(' · ');
  }

  function row(label, value) {
    return value ? '<div class="kv"><span>' + esc(label) + '</span><b>' + esc(value) + '</b></div>' : '';
  }

  function statusCard(st) {
    var m = STATE[st.state] || STATE.UNKNOWN, h = '';
    h += '<section class="card status ' + m.cls + '" aria-live="polite">';
    h += '<h2 class="tname">' + esc(st.teacher.name) + '</h2>';
    h += '<div class="badge ' + m.cls + '">' + m.icon + ' ' + m.text + '</div>';
    if (st.state === 'TEACHING') {
      var c = st.current;
      h += '<div class="lesson-title">' + esc(c.lesson) + ' · ' + esc(c.subject) + '</div>';
      h += row('Class', c.classes.join(', '));
      h += row('Room', c.rooms.join(' / '));
      h += row('Floor', c.floors.join(' / '));
      h += row('Wing', c.wings.join(' / '));
      h += '<div class="time">' + T.fmtTime(c.start) + ' — ' + T.fmtTime(c.end) + '</div>';
    } else {
      if (st.period) h += '<div class="lesson-title">' + esc(T.lessonLabel(st.period)) + ' · ' + T.fmtTime(st.period.start) + ' — ' + T.fmtTime(st.period.end) + '</div>';
      if (st.message) h += '<p class="msg">' + esc(st.message) + '</p>';
      if (st.state === 'FREE' && st.location) h += row('Likely location', st.location);
    }
    h += '<p class="note">Location = scheduled location from the timetable, not GPS.</p>';
    h += '</section>';
    h += nextCard(st.next);
    return h;
  }

  function nextCard(n) {
    if (!n) return '<section class="card next"><h3>Next lesson</h3><p class="msg">Timetable information not available.</p></section>';
    var when = n.isToday ? 'Today' : n.isTomorrow ? 'Tomorrow (' + n.day + ')' : n.day;
    var h = '<section class="card next"><h3>Next lesson</h3>';
    h += '<div class="lesson-title">' + esc(n.lesson) + ' · ' + esc(n.subject) + '</div>';
    h += row('When', when + ', ' + T.fmtTime(n.start) + ' — ' + T.fmtTime(n.end));
    h += row('Class', n.classes.join(', '));
    h += row('Room', where(n));
    return h + '</section>';
  }

  function weekTable(week, now) {
    var h = '<div class="tablewrap"><table class="week"><thead><tr><th>Period</th>';
    week.days.forEach(function (d) { h += '<th class="' + (d === now.day ? 'today' : '') + '">' + d.slice(0, 3) + '</th>'; });
    h += '</tr></thead><tbody>';
    week.rows.forEach(function (r) {
      h += '<tr><th scope="row">' + esc(r.label) + '<small>' + T.fmtTime(r.period.start).replace(' ', '') + '–' + T.fmtTime(r.period.end).replace(' ', '') + '</small></th>';
      r.cells.forEach(function (c, i) {
        var cls = week.days[i] === now.day ? 'today' : '';
        if (c.kind === 'break') h += '<td class="cbreak ' + cls + '">Break</td>';
        else if (c.kind === 'free') h += '<td class="cfree ' + cls + '">FREE</td>';
        else h += '<td class="clesson ' + cls + '"><b>' + esc(c.info.subject) + '</b><span>' + esc(c.info.classes.join(', ')) + '</span><small>' + esc(c.info.rooms.join(' / ')) + '</small></td>';
      });
      h += '</tr>';
    });
    return h + '</tbody></table></div>';
  }

  /** Mobile: day-by-day cards instead of a wide grid. */
  function weekCards(week, now) {
    var h = '<div class="daycards">';
    week.days.forEach(function (d, di) {
      h += '<details class="daycard"' + (d === now.day ? ' open' : '') + '><summary>' + d + (d === now.day ? ' <em>today</em>' : '') + '</summary>';
      week.rows.forEach(function (r) {
        var c = r.cells[di];
        if (c.kind === 'break') h += '<div class="drow cbreak"><span>' + esc(r.label) + '</span><i>' + T.fmtTime(r.period.start) + '</i><b>Break</b></div>';
        else if (c.kind === 'free') h += '<div class="drow cfree"><span>' + esc(r.label) + '</span><i>' + T.fmtTime(r.period.start) + '</i><b>FREE</b></div>';
        else h += '<div class="drow clesson"><span>' + esc(r.label) + '</span><i>' + T.fmtTime(r.period.start) + '</i><b>' + esc(c.info.subject) + ' · ' + esc(c.info.classes.join(', ')) + '</b><small>' + esc(where(c.info)) + '</small></div>';
      });
      h += '</details>';
    });
    return h + '</div>';
  }


  function stars(n) { if (n === null || n === undefined) return ''; return '<span class="stars" aria-label="' + n + ' out of 5">' + '★'.repeat(n) + '<span class="dim">' + '★'.repeat(5 - n) + '</span></span>'; }

  function candRow(c, periodId) {
    var t = c.teacher;
    return '<div class="subrow">' +
      '<span class="sr-name"><button type="button" class="linkbtn" data-tt="' + esc(t.id) + '">' + esc(t.name) + '</button>' + (c.stars !== null ? stars(c.stars) : '') + '</span>' +
      '<span class="sr-status"><span class="badge free">🟢 FREE</span></span>' +
      '<span class="sr-loc">' + esc(c.location) + (c.near ? '<small>Near: ' + esc(c.near) + '</small>' : '') + '</span>' +
      '<span class="sr-subj">' + esc(c.subjects.join(', ')) + '</span>' +
      '<span class="sr-why">' + esc(c.reasons.join(' + ')) + '<small>' + c.lessonsThatDay + ' lessons that day</small></span>' +
      '<span class="sr-act"><button type="button" class="assignbtn" data-assign="' + esc(t.id) + '" data-period="' + esc(periodId) + '">ASSIGN</button></span>' +
      '</div>';
  }

  function candHead() {
    return '<div class="subhead"><span>Teacher</span><span>Status</span><span>Location</span><span>Subject</span><span>Why</span><span></span></div>';
  }

  /** Free teachers for ONE lesson. r comes from HOWSUB.find. */
  function candidates(r, periodId) {
    if (r.error) return '<p class="msg">' + esc(r.error) + '</p>';
    var total = r.recommended.length + r.others.length;
    var h = '<p class="note"><b>' + total + '</b> teachers are free. ' + r.busyCount + ' are teaching' +
      (r.excludedCount ? ', ' + r.excludedCount + ' already covering or absent' : '') + '.</p>';
    if (!total) return h + '<p class="msg">No free teachers found for this lesson.</p>';
    if (r.recommended.length) h += '<h4 class="ch">⭐ Recommended</h4>' + candHead() + r.recommended.map(function (c) { return candRow(c, periodId); }).join('');
    if (r.others.length) h += '<details class="others"' + (r.recommended.length ? '' : ' open') + '><summary>Other available teachers (' + r.others.length + ')</summary>' +
      candHead() + r.others.map(function (c) { return candRow(c, periodId); }).join('') + '</details>';
    return h;
  }

  function placeLine(info) {
    return [info.rooms.join(' / '), info.floors.join(' / '), info.wings.join(' / ')].filter(Boolean).join(' · ');
  }

  /** Whole-day view for one absent teacher. model = { absent, date, lessons:[{period, info, assignment}] } */
  function dayLessons(model) {
    var n = model.lessons.length, done = model.lessons.filter(function (l) { return l.assignment; }).length;
    var h = '<section class="card subsummary"><h3>' + esc(model.absent.name) + '</h3>';
    h += '<div class="kv"><span>Date</span><b>' + esc(T.fmtDateLong(model.date)) + '</b></div>';
    if (!n) return h + '<p class="msg">No lessons on this day.</p></section>';
    h += '<div class="kv"><span>Lessons</span><b>' + n + '</b></div>';
    h += '<div class="kv"><span>Covered</span><b class="' + (done === n ? 'okc' : 'warnc') + '">' + done + ' of ' + n + '</b></div>';
    h += '<div class="shares"><button type="button" class="btn small" data-copy="1">COPY SUMMARY</button> <button type="button" class="btn small wa" data-share="1">SHARE ON WHATSAPP</button></div></section>';
    model.lessons.forEach(function (l) {
      var pid = l.period.id, a = l.assignment;
      h += '<section class="card lesson ' + (a ? 'covered' : 'open') + '" data-lesson="' + esc(pid) + '">';
      h += '<div class="lhead"><b>' + esc(T.lessonLabel(l.period)) + '</b><span>' + T.fmtTime(l.period.start) + ' — ' + T.fmtTime(l.period.end) + '</span></div>';
      h += '<div class="lbody"><b>' + esc(l.info.subject) + '</b> · ' + esc(l.info.classes.join(', ')) + '<small>' + esc(placeLine(l.info)) + '</small></div>';
      if (a) {
        h += '<div class="coverbar">✅ Covered by <b>' + esc(a.substituteName) + '</b>' + (a.assignedBy ? '<small>Assigned by ' + esc(a.assignedBy) + '</small>' : '') +
          '<button type="button" class="cancelbtn" data-cancel="' + esc(a.id) + '">CANCEL</button></div>';
      } else {
        h += '<div class="coverbar need">⚠️ Needs a substitute</div><button type="button" class="btn wide findbtn" data-find="' + esc(pid) + '">FIND SUBSTITUTE</button>';
      }
      h += '<div class="cands" id="cands-' + esc(pid) + '"></div></section>';
    });
    return h + '<div id="subTimetable"></div>';
  }

  /** Plain-text summary used for copy / WhatsApp. */
  function summaryText(model) {
    var t = 'Substitutions - ' + T.fmtDateLong(model.date) + '\nAbsent: ' + model.absent.name + '\n';
    model.lessons.forEach(function (l) {
      t += T.lessonLabel(l.period) + ' (' + T.fmtTime(l.period.start) + ') ' + l.info.classes.join(', ') + ' ' + l.info.subject + ' -> ' +
        (l.assignment ? l.assignment.substituteName : 'NOT COVERED YET') + '\n';
    });
    return t.trim();
  }

  return { dayLessons: dayLessons, candidates: candidates, summaryText: summaryText, esc: esc, statusCard: statusCard, weekTable: weekTable, weekCards: weekCards, STATE: STATE };
})();
