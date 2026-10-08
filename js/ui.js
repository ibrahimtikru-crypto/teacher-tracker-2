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

  return { esc: esc, statusCard: statusCard, weekTable: weekTable, weekCards: weekCards, STATE: STATE };
})();
