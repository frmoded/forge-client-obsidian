  // ==== circle staff BEGIN (2026-11-19-0900) =========================================================================================================
  // The SAME block is in the explorer and in the two exercises that show a staff (a test pins them identical). It draws on the staff of the scale view above (its `staff`, `ST`, `yOf`, the clef path): the bare staff with the treble clef, and a key signature after the clef,
  // each sharp or flat at its place (F C G D A E B / B E A D G C F), left to right. `label` is the staff's text for a screen reader (an exercise must not say the key).
  function ciStaffBase() {
    while (staff.firstChild) staff.removeChild(staff.firstChild);
    for (var p = 0; p <= 8; p += 2) el("line", { "class": "staffline", x1: 0, y1: yOf(p), x2: ST.width, y2: yOf(p) }, staff);
    el("path", { fill: "#2B2B2B", stroke: "none", "pointer-events": "none", transform: "translate(5 " + yOf(2) + ") scale(" + CLEF_SCALE + " " + (-CLEF_SCALE) + ")", d: CLEF_D }, staff);
  }
  function ciDrawSignature(i, alt, label) {
    ciStaffBase();
    var sig = ciSignature(i, alt);
    sig.forEach(function (s, k) { var t = el("text", { "class": "acc sig", x: ST.left - 6 + k * 11, y: yOf(s.pos) + 4.5, "text-anchor": "middle" }, staff); t.textContent = s.a === 1 ? "♯" : "♭"; });
    staff.setAttribute("aria-label", label !== undefined ? label : "Treble staff: the key signature of " + ciKeyWords(i, alt) + ", " + ciCountWords(i, alt) + (sig.length ? ": " + sig.map(function (s) { return noteWords({ l: s.l, a: s.a }); }).join(", ") : ""));
  }
  // ==== circle staff END ===========================================================================================================================
