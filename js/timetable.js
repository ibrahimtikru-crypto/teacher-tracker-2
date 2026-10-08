/* House of Wisdom - Teacher Tracker
 * timetable.js: all schedule calculations. No DOM, no network, so it can be tested on its own.
 * Time is ALWAYS computed in the school's timezone (default Asia/Karachi), never the browser's.
 */
var HOWTT = (function () {
  'use strict';
  var DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  /** Current day name + minutes since midnight in the school timezone. */
  function schoolNow(tz, override) {
    if (override) return override;                       // used by tests / "preview time"
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'long', hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false, year: 'numeric', month: 'long', day: 'numeric'
    }).formatToParts(new Date());
    var p = {};
    parts.forEach(function (x) { p[x.type] = x.value; });
    var h = parseInt(p.hour, 10) % 24;
    return { day: p.weekday, minutes: h * 60 + parseInt(p.minute, 10), seconds: parseInt(p.second, 10),
             dateLabel: p.weekday + ', ' + p.day + ' ' + p.month + ' ' + p.year };
  }

  function fmtTime(min) {
    var h = Math.floor(min / 60), m = min % 60, ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  }

  function lessonLabel(period) {
    if (period.type === 'Break') return period.name;
    var n = String(period.id).replace(/\D/g, '');
    return n ? 'Lesson ' + n : period.name;
  }

  /** Builds lookup tables once after data is loaded. */
  function buildIndex(data) {
    var idx = { data: data, periods: data.periods.slice().sort(function (a, b) { return a.start - b.start; }),
                periodById: {}, teacherById: {}, classByName: {}, slots: {}, teacherDays: {} };
    idx.periods.forEach(function (p) { idx.periodById[p.id] = p; });
    data.teachers.forEach(function (t) { idx.teacherById[t.id] = t; });
    data.classes.forEach(function (c) { idx.classByName[c.name] = c; });
    data.timetable.forEach(function (r) {
      var key = r[2] + '|' + r[0] + '|' + r[1];
      var cls = idx.classByName[r[3]] || { name: r[3], room: '', floor: '', wing: '' };
      var s = idx.slots[key] || (idx.slots[key] = { subject: r[4], group: r[5], classes: [] });
      s.classes.push(cls);
    });
    var wd = (data.settings && data.settings.WorkingDays) || 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday';
    idx.workingDays = String(wd).split(',').map(function (s) { return s.trim(); });
    idx.staffRoom = (data.settings && data.settings.StaffRoomName) || 'Staff Room';
    idx.lessons = idx.periods.filter(function (p) { return p.type !== 'Break'; });
    return idx;
  }

  function slotFor(idx, teacherId, day, periodId) {
    return idx.slots[teacherId + '|' + day + '|' + periodId] || null;
  }

  /** Describes a slot for display. */
  function describe(slot, period) {
    var rooms = [], floors = [], wings = [];
    slot.classes.forEach(function (c) {
      if (c.room && rooms.indexOf(c.room) < 0) rooms.push(c.room);
      if (c.floor && floors.indexOf(c.floor) < 0) floors.push(c.floor);
      if (c.wing && wings.indexOf(c.wing) < 0) wings.push(c.wing);
    });
    return {
      lesson: lessonLabel(period), periodId: period.id, subject: slot.subject,
      classes: slot.classes.map(function (c) { return c.name; }),
      rooms: rooms, floors: floors, wings: wings,
      start: period.start, end: period.end
    };
  }

  /** Current period for a given minute, or null. */
  function periodAt(idx, minutes) {
    for (var i = 0; i < idx.periods.length; i++) {
      var p = idx.periods[i];
      if (minutes >= p.start && minutes < p.end) return p;
    }
    return null;
  }

  /** The next teaching slot after (day, minutes), searching up to 7 days ahead. */
  function nextLesson(idx, teacherId, day, minutes) {
    var d0 = DAY_ORDER.indexOf(day);
    for (var off = 0; off < 7; off++) {
      var dn = DAY_ORDER[(d0 + off) % 7];
      for (var i = 0; i < idx.lessons.length; i++) {
        var p = idx.lessons[i];
        if (off === 0 && p.start < minutes) continue;
        var s = slotFor(idx, teacherId, dn, p.id);
        if (s) { var d = describe(s, p); d.day = dn; d.isToday = off === 0; d.isTomorrow = off === 1; return d; }
      }
    }
    return null;
  }

  /**
   * Status for one teacher right now.
   * state: TEACHING | FREE | BREAK | OFF | FINISHED | BEFORE | UNAVAILABLE
   */
  function getStatus(idx, teacherId, now) {
    var t = idx.teacherById[teacherId];
    if (!t) return { state: 'UNKNOWN', message: 'Timetable information not available.' };
    var res = { teacher: t, state: 'OFF', current: null, next: null, location: null, period: null };
    if (t.active === false) { res.state = 'UNAVAILABLE'; res.message = 'Marked inactive / unavailable.'; return res; }

    var working = idx.workingDays.indexOf(now.day) >= 0;
    if (!working) { res.state = 'OFF'; res.message = 'No school today.'; res.next = nextLesson(idx, teacherId, now.day, 0); return res; }

    var first = idx.periods[0], last = idx.periods[idx.periods.length - 1];
    if (now.minutes < first.start) {
      res.state = 'BEFORE'; res.message = 'School has not started yet.';
      res.next = nextLesson(idx, teacherId, now.day, now.minutes); return res;
    }
    if (now.minutes >= last.end) {
      res.state = 'FINISHED'; res.message = 'School day finished.';
      res.next = nextLesson(idx, teacherId, now.day, now.minutes + 1440); return res;
    }
    var p = periodAt(idx, now.minutes);
    if (!p) { res.state = 'FREE'; res.message = 'Transition time between lessons.'; res.location = idx.staffRoom; }
    else {
      res.period = p;
      if (p.type === 'Break') { res.state = 'BREAK'; res.message = 'Break time.'; }
      else {
        var s = slotFor(idx, teacherId, now.day, p.id);
        if (s) { res.state = 'TEACHING'; res.current = describe(s, p); }
        else { res.state = 'FREE'; res.message = 'No lesson scheduled this period.'; res.location = idx.staffRoom; }
      }
    }
    res.next = nextLesson(idx, teacherId, now.day, p ? p.end : now.minutes);
    return res;
  }

  /** Weekly grid: rows = lesson periods + break, columns = days. */
  function getWeek(idx, teacherId) {
    var days = idx.workingDays.slice().sort(function (a, b) { return DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b); });
    var rows = idx.periods.map(function (p) {
      return { period: p, label: lessonLabel(p), cells: days.map(function (d) {
        if (p.type === 'Break') return { kind: 'break' };
        var s = slotFor(idx, teacherId, d, p.id);
        return s ? { kind: 'lesson', info: describe(s, p) } : { kind: 'free' };
      }) };
    });
    var count = 0;
    rows.forEach(function (r) { r.cells.forEach(function (c) { if (c.kind === 'lesson') count++; }); });
    return { days: days, rows: rows, lessonCount: count };
  }

  function searchTeachers(idx, q) {
    q = String(q || '').toLowerCase().trim();
    var list = idx.data.teachers;
    if (!q) return list.slice(0, 60);
    return list.filter(function (t) {
      return t.name.toLowerCase().indexOf(q) >= 0 || t.subjects.toLowerCase().indexOf(q) >= 0 ||
             t.phase.toLowerCase().indexOf(q) >= 0;
    });
  }

  return { DAY_ORDER: DAY_ORDER, schoolNow: schoolNow, fmtTime: fmtTime, lessonLabel: lessonLabel,
           buildIndex: buildIndex, getStatus: getStatus, getWeek: getWeek, periodAt: periodAt,
           searchTeachers: searchTeachers, nextLesson: nextLesson };
})();
if (typeof module !== 'undefined') module.exports = HOWTT;
