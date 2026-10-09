/* House of Wisdom - Teacher Tracker
 * substitute.js (Phase 4): who is genuinely free in a given day + period, ranked by suitability.
 * Availability is CALCULATED from the timetable. Nothing is read from a manual "available" flag.
 * Ranking weights come from the SubstituteRules sheet (rules), so management can change them later.
 */
var HOWSUB = (function () {
  'use strict';
  var T = HOWTT;

  var DEFAULT_RULES = [
    { rule: 'FreeDuringPeriod', weight: 100, enabled: true },
    { rule: 'SameSubject', weight: 40, enabled: true },
    { rule: 'SameLevel', weight: 25, enabled: true },
    { rule: 'SameWing', weight: 15, enabled: true },
    { rule: 'NoOtherSubstitution', weight: 10, enabled: true },
    { rule: 'NotUnavailable', weight: 100, enabled: true }
  ];

  var BAND = { 'Pre-I': 'Pre', 'Pre-II': 'Pre', 'KG': 'KG', 'G-I': 'L1', 'G-II': 'L1', 'G-III': 'L2', 'G-IV': 'L2',
               'G-V': 'L2', 'G-VI': 'U', 'G-VII': 'U', 'G-VIII': 'U', 'G-IX': 'U', 'G-X': 'U', 'Hifz': 'U' };

  function grade(cls) { return String(cls).replace(/\s*\(.*$/, '').trim(); }

  function sameSubject(a, b) {
    if (!a || !b) return false;
    a = a.toLowerCase(); b = b.toLowerCase();
    if (a === b) return true;
    var pe = function (s) { return s === 'physical education' || s === 'high school pe'; };
    if (pe(a) && pe(b)) return true;
    var la = function (s) { return s === 'library' || s === 'art' || s === 'lib/art'; };
    if (la(a) && la(b) && (a === 'lib/art' || b === 'lib/art')) return true;
    var bc = function (s) { return s === 'bio/comp' || s === 'computer'; };
    return bc(a) && bc(b);
  }

  /** One-time profile per teacher: subjects, grades, bands, wings, lessons per day. Built from the slot index. */
  function profiles(idx) {
    if (idx._prof) return idx._prof;
    var prof = {};
    Object.keys(idx.slots).forEach(function (key) {
      var p = key.split('|'), tid = p[0], day = p[1], s = idx.slots[key];
      var o = prof[tid] || (prof[tid] = { subjects: {}, grades: {}, bands: {}, wings: {}, perDay: {} });
      o.subjects[s.subject] = 1;
      o.perDay[day] = (o.perDay[day] || 0) + 1;
      s.classes.forEach(function (c) {
        var g = grade(c.name); o.grades[g] = 1; if (BAND[g]) o.bands[BAND[g]] = 1;
        if (c.wing) o.wings[c.wing] = (o.wings[c.wing] || 0) + 1;
      });
    });
    idx._prof = prof;
    return prof;
  }

  function rule(rules, name) {
    for (var i = 0; i < rules.length; i++) if (rules[i].rule === name) return rules[i];
    return { rule: name, weight: 0, enabled: false };
  }
  function on(r) { return r.enabled === true || /^(true|yes|1)$/i.test(String(r.enabled)); }

  /** Wing/floor of a lesson the teacher has right before or after this period (shows where they are nearby). */
  function nearLesson(idx, tid, day, periodId) {
    var L = idx.lessons, i = -1;
    for (var k = 0; k < L.length; k++) if (L[k].id === periodId) i = k;
    var order = [i - 1, i + 1, i - 2, i + 2];
    for (var n = 0; n < order.length; n++) {
      var p = L[order[n]]; if (!p) continue;
      var s = idx.slots[tid + '|' + day + '|' + p.id];
      if (s) { var c0 = s.classes[0] || {}; return { wing: c0.wing || '', floor: c0.floor || '', room: c0.room || '' }; }
    }
    return null;
  }

  /**
   * q = { absentId, day, periodId }
   * returns { absent, slot, recommended[], others[], busyCount, note }
   */
  function find(idx, q, rulesIn) {
    var rules = (rulesIn && rulesIn.length) ? rulesIn : DEFAULT_RULES;
    var prof = profiles(idx);
    var absent = idx.teacherById[q.absentId];
    var period = idx.periodById[q.periodId];
    if (!absent || !period) return { error: 'Timetable information not available.' };

    var slotKey = q.absentId + '|' + q.day + '|' + q.periodId;
    var aSlot = idx.slots[slotKey] || null;
    var aInfo = aSlot ? { subject: aSlot.subject, classes: aSlot.classes } : null;
    var aGrades = {}, aBands = {}, aWings = {};
    if (aInfo) aInfo.classes.forEach(function (c) {
      var g = grade(c.name); aGrades[g] = 1; if (BAND[g]) aBands[BAND[g]] = 1; if (c.wing) aWings[c.wing] = 1;
    });

    var rSub = rule(rules, 'SameSubject'), rLvl = rule(rules, 'SameLevel'), rWing = rule(rules, 'SameWing');
    var rFree = rule(rules, 'FreeDuringPeriod'), rAvail = rule(rules, 'NotUnavailable');
    var maxVar = (on(rSub) ? +rSub.weight : 0) + (on(rLvl) ? +rLvl.weight : 0) + (on(rWing) ? +rWing.weight : 0);

    var excl = q.exclude || {};
    var out = [], busy = 0, inactive = 0, excluded = 0;
    idx.data.teachers.forEach(function (t) {
      if (t.id === q.absentId) return;
      if (excl[t.id]) { excluded++; return; }
      if (on(rAvail) && t.active === false) { inactive++; return; }
      var hasLesson = !!idx.slots[t.id + '|' + q.day + '|' + q.periodId];
      if (on(rFree) && hasLesson) { busy++; return; }
      var pr = prof[t.id] || { subjects: {}, grades: {}, bands: {}, wings: {}, perDay: {} };
      var reasons = ['Free'], score = 0;

      if (aInfo) {
        var subjHit = Object.keys(pr.subjects).some(function (s) { return sameSubject(s, aInfo.subject); });
        if (on(rSub) && subjHit) { score += +rSub.weight; reasons.push('same subject'); }

        var gHit = Object.keys(aGrades).some(function (g) { return pr.grades[g]; });
        var bHit = Object.keys(aBands).some(function (b) { return pr.bands[b]; });
        if (on(rLvl)) {
          if (gHit) { score += +rLvl.weight; reasons.push('teaches this grade'); }
          else if (bHit) { score += +rLvl.weight * 0.6; reasons.push('similar grade group'); }
        }
        var near = nearLesson(idx, t.id, q.day, q.periodId);
        var wingHit = near ? !!aWings[near.wing] : Object.keys(pr.wings).some(function (w) { return aWings[w]; });
        if (on(rWing) && wingHit) { score += +rWing.weight; reasons.push('same wing'); }
      }

      var near2 = nearLesson(idx, t.id, q.day, q.periodId);
      var ratio = (aInfo && maxVar > 0) ? score / maxVar : null;
      out.push({
        teacher: t, score: score, ratio: ratio,
        stars: ratio === null ? null : Math.max(1, Math.min(5, Math.round(1 + 4 * ratio))),
        reasons: reasons,
        subjects: Object.keys(pr.subjects),
        location: idx.staffRoom,
        near: near2 ? [near2.room, near2.floor, near2.wing].filter(Boolean).join(' · ') : '',
        lessonsThatDay: pr.perDay[q.day] || 0
      });
    });

    out.sort(function (a, b) {
      return (b.score - a.score) || (a.lessonsThatDay - b.lessonsThatDay) || a.teacher.name.localeCompare(b.teacher.name);
    });

    var recommended = [], others = [];
    out.forEach(function (c) {
      if (c.stars !== null && c.stars >= 4 && recommended.length < 5) recommended.push(c); else others.push(c);
    });
    // No strong match? Still recommend the best 3 that have at least one matching reason.
    if (!recommended.length && aInfo) {
      var best = others.filter(function (c) { return c.score > 0; }).slice(0, 3);
      recommended = best;
      others = others.filter(function (c) { return best.indexOf(c) < 0; });
    }
    return {
      absent: absent, period: period, day: q.day, slot: aInfo,
      recommended: recommended, others: others, busyCount: busy, inactiveCount: inactive, excludedCount: excluded,
      note: aInfo ? '' : absent.name + ' has no lesson in this period, so all free teachers are listed without a suitability score.'
    };
  }

  /** All lessons the teacher has on a day, in period order. */
  function lessonsOf(idx, teacherId, day) {
    var out = [];
    idx.lessons.forEach(function (p) {
      var s = T.slotFor(idx, teacherId, day, p.id);
      if (s) out.push({ period: p, info: T.describe(s, p) });
    });
    return out;
  }

  return { find: find, lessonsOf: lessonsOf, DEFAULT_RULES: DEFAULT_RULES };
})();
if (typeof module !== 'undefined') module.exports = HOWSUB;
