  // ==== circle core BEGIN (2026-11-19-0900) =========================================================================================================
  // The SAME block is in the four circle of fifths gadgets (circle_of_fifths.html and the three circle_exercise_*.html; each gadget is one self-contained file, so it is copied; a test pins them identical). Pure: no DOM, no Web Audio. It uses the scale core above.
  // SECTOR i (0..11, C at the top, clockwise) is the major key whose tonic is i fifths above C: pitch class 7 x i mod 12. Its relative minor is the 6th degree of that major scale (3 half steps below the tonic). One step clockwise adds a sharp (or removes a flat),
  // one step counter-clockwise adds a flat (or removes a sharp). Sector 6 has two names: F-sharp (six sharps, reached clockwise) and G-flat (six flats, reached counter-clockwise); `alt` = true means the flat one. The letters are those of the Scales gadgets (C = 0 .. B = 6).
  var CIRCLE_MAJOR_STEPS = [2, 2, 1, 2, 2, 2, 1];
  var CIRCLE_TONICS = [{ l: 0, a: 0 }, { l: 4, a: 0 }, { l: 1, a: 0 }, { l: 5, a: 0 }, { l: 2, a: 0 }, { l: 6, a: 0 }, { l: 3, a: 1 }, { l: 1, a: -1 }, { l: 5, a: -1 }, { l: 2, a: -1 }, { l: 6, a: -1 }, { l: 3, a: 0 }];     // C G D A E B F-sharp D-flat A-flat E-flat B-flat F
  var CIRCLE_ALT_TONIC = { l: 4, a: -1 };                                                                      // sector 6 spelled with flats: G-flat
  var CI_SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6], CI_FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];                          // the letters in the order sharps (F C G D A E B) and flats (B E A D G C F) are added
  var CI_SHARP_POS = [8, 5, 9, 6, 3, 7, 4], CI_FLAT_POS = [4, 7, 3, 6, 2, 5, 1];                              // where each one sits on the treble staff (0 = the bottom line, E4; 8 = the top line)
  var CI_SHARED = [7, 6, 5, 4, 3, 2, 2];                                                                       // notes two major keys share, by their distance in steps round the circle (0..6)
  function ciSector(i) { return scMod(i, 12); }
  function ciPc(i) { return scMod(7 * i, 12); }
  function ciMinorPc(i) { return scMod(ciPc(i) - 3, 12); }
  function ciTonic(i, alt) { return ciSector(i) === 6 && alt ? CIRCLE_ALT_TONIC : CIRCLE_TONICS[ciSector(i)]; }
  // The seven spelled notes of the major key: [{ l, a }], one letter per degree (the scale core's rule).
  function ciScale(i, alt) { var t = ciTonic(i, alt); return scHeptatonic(t.l, ciPc(i), CIRCLE_MAJOR_STEPS); }
  // Sharps counted positive, flats negative: C 0, G +1 .. F-sharp +6 (alt: G-flat -6), D-flat -5 .. F -1.
  function ciSigned(i, alt) { var s = ciSector(i); return s === 6 ? (alt ? -6 : 6) : s < 6 ? s : s - 12; }
  // The key signature: the accidentals in the order they are written, [{ l, a (1 or -1), pos }].
  function ciSignature(i, alt) {
    var n = ciSigned(i, alt), k = Math.abs(n), order = n > 0 ? CI_SHARP_ORDER : CI_FLAT_ORDER, pos = n > 0 ? CI_SHARP_POS : CI_FLAT_POS, out = [], j;
    for (j = 0; j < k; j++) out.push({ l: order[j], a: n > 0 ? 1 : -1, pos: pos[j] });
    return out;
  }
  function ciName(i, alt) { return noteName(ciTonic(i, alt)); }                                                // "G♭"
  function ciWords(i, alt) { return noteWords(ciTonic(i, alt)); }                                              // "G flat"
  function ciMinorTonic(i, alt) { return ciScale(i, alt)[5]; }
  function ciMinorName(i, alt) { return noteName(ciMinorTonic(i, alt)); }
  function ciMinorWords(i, alt) { return noteWords(ciMinorTonic(i, alt)); }
  function ciKeyTitle(i, alt) { return ciName(i, alt) + " major"; }
  function ciKeyWords(i, alt) { return ciWords(i, alt) + " major"; }
  function ciMinorTitle(i, alt) { return ciMinorName(i, alt) + " minor"; }
  function ciMinorKeyWords(i, alt) { return ciMinorWords(i, alt) + " minor"; }
  function ciCountText(i, alt) { var n = ciSigned(i, alt); return n === 0 ? "0" : Math.abs(n) + (n > 0 ? "♯" : "♭"); }                // "3♯"
  function ciCountWords(i, alt) { var n = ciSigned(i, alt), k = Math.abs(n); return n === 0 ? "no sharps or flats" : k + (n > 0 ? " sharp" : " flat") + (k === 1 ? "" : "s"); }
  function ciNeighbours(i) { return [ciSector(i - 1), ciSector(i + 1)]; }                                      // counter-clockwise, clockwise
  function ciOpposite(i) { return ciSector(i + 6); }
  function ciSteps(i, j) { var d = scMod(i - j, 12); return Math.min(d, 12 - d); }
  function ciShared(i, j) { return CI_SHARED[ciSteps(i, j)]; }
  // The same number counted from the notes themselves (the test compares the two over every pair of sectors).
  function ciSharedByPitch(i, j) { var n = 0, pb = {}; scaleNotes(ciPc(j), "major", "up").forEach(function (p) { pb[p] = 1; }); scaleNotes(ciPc(i), "major", "up").forEach(function (p) { if (pb[p]) n++; }); return n; }
  // One step round the circle from sector i: `dir` +1 clockwise, -1 counter-clockwise. The sector 6 spelling follows the direction you come from and go to (a clockwise step leaves G-flat and arrives at F-sharp).
  // The two keys differ in exactly one note: `old` (in the key left) becomes `nw` (in the key reached).
  function ciChange(i, dir) {
    var from = ciSector(i), to = ciSector(i + dir), fromAlt = from === 6 && dir > 0, toAlt = to === 6 && dir < 0, a = ciScale(from, fromAlt), b = ciScale(to, toAlt), out = { from: from, to: to, fromAlt: fromAlt, toAlt: toAlt, old: null, nw: null }, k, m;
    for (k = 0; k < 7; k++) for (m = 0; m < 7; m++) if (a[k].l === b[m].l && a[k].a !== b[m].a) { out.old = a[k]; out.nw = b[m]; }
    return out;
  }
  // "G major has one more sharp than C major: F becomes F♯."
  function ciChangeText(c) {
    var what = c.nw.a > c.old.a ? (c.nw.a === 1 ? "one more sharp" : "one fewer flat") : (c.nw.a === -1 ? "one more flat" : "one fewer sharp");
    return ciKeyTitle(c.to, c.toAlt) + " has " + what + " than " + ciKeyTitle(c.from, c.fromAlt) + ": " + noteName(c.old) + " becomes " + noteName(c.nw) + ".";
  }
  function ciChangeWords(c) {
    var what = c.nw.a > c.old.a ? (c.nw.a === 1 ? "one more sharp" : "one fewer flat") : (c.nw.a === -1 ? "one more flat" : "one fewer sharp");
    return ciKeyWords(c.to, c.toAlt) + " has " + what + " than " + ciKeyWords(c.from, c.fromAlt) + ": " + noteWords(c.old) + " becomes " + noteWords(c.nw) + ".";
  }
  // "G major shares 6 of its 7 notes with C major."
  function ciSharedText(i, j, alt) { return ciKeyTitle(i, alt) + " shares " + ciShared(i, j) + " of its 7 notes with " + ciKeyTitle(j, false) + "."; }
  // The words for the three relations of a chosen key: the neighbour one fifth down (counter-clockwise), the neighbour one fifth up (clockwise), the opposite.
  function ciRelations(i, alt) {
    var nb = ciNeighbours(i), op = ciOpposite(i);
    return [{ role: "ccw", sector: nb[0], alt: nb[0] === 6, shared: ciShared(i, nb[0]) }, { role: "cw", sector: nb[1], alt: false, shared: ciShared(i, nb[1]) }, { role: "opposite", sector: op, alt: op === 6 ? !alt : false, shared: ciShared(i, op) }];
  }
  // ==== circle core END ============================================================================================================================
