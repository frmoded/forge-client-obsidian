  // ==== circle ring page BEGIN (2026-11-23-1025, one level 2026-11-24-1038) ======================================================================
  // The SAME block is in the three ring exercises (a test pins them identical). Browser only. What the three pages share: the one button, Start over, the wheel made inert (a ring exercise is answered with the keys below the wheel, so a sector is not a button),
  // and the labels of the wheel: a slot is empty until its key is placed. Nothing here reacts to the pointer resting on it.
  function rgStartOver(fn) { $("startover").addEventListener("click", fn); }
  function rgInert(segs) { ["major", "minor"].forEach(function (r) { segs[r].forEach(function (g) { g.removeAttribute("tabindex"); g.setAttribute("role", "img"); }); }); }
  // The text of every slot, kept from the wheel's own drawing: name(ring, sector, "none" | "full"), count(sector, shown).
  function rgLabels(segs) {
    var L = { major: [], minor: [] };
    ["major", "minor"].forEach(function (r) {
      segs[r].forEach(function (g, k) {
        var spans = g.querySelectorAll("tspan"), nm = g.querySelector("text.name"), ct = g.querySelector("text.count"), e = { spans: [], full: [], nm: nm, ct: ct, ctFull: ct ? ct.textContent : "" }, i;
        if (spans.length) for (i = 0; i < spans.length; i++) { e.spans.push(spans[i]); e.full.push(spans[i].textContent); } else e.full.push(nm.textContent);
        L[r][k] = e;
      });
    });
    return {
      name: function (r, k, mode) { var e = L[r][k]; if (e.spans.length) e.spans.forEach(function (s, i) { s.textContent = mode === "full" ? e.full[i] : ""; }); else e.nm.textContent = mode === "full" ? e.full[0] : ""; },
      count: function (k, shown) { var e = L.major[k]; if (e.ct) e.ct.textContent = shown ? e.ctFull : ""; }
    };
  }
  // ==== circle ring page END ======================================================================================================================
