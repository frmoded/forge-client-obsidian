  // ==== circle ring page BEGIN (2026-11-23-1025) ====================================================================================================
  // The SAME block is in the three ring exercises (a test pins them identical). Browser only. What the three pages share: the level buttons, the start chooser (a select of the twelve sectors and Random; hard has a random start, so both are off there), New exercise and Reset,
  // the score line and the board, the wheel made inert (a ring exercise is answered with the keys below the wheel, so a sector is not a button), and the labels of the wheel: a slot is empty until its key is placed. Nothing here reacts to the pointer resting on it.
  function rgChrome(h) {
    EX_LEVELS.forEach(function (l) {
      var b = document.createElement("button"); b.type = "button"; b.id = "level-" + l; b.textContent = exLevelName(l); b.setAttribute("aria-description", exLevelName(l) + ": " + EX_ATTEMPTS[l] + (EX_ATTEMPTS[l] === 1 ? " wrong tap" : " wrong taps") + " allowed");
      b.addEventListener("click", function () { h.onLevel(l); }); $("levels").appendChild(b);                   // a new level starts a fresh exercise; each level keeps its own score
    });
    var sel = $("start"), k;
    for (k = 0; k < 12; k++) { var o = document.createElement("option"); o.value = String(k); o.textContent = rgSlotName(k); sel.appendChild(o); }
    sel.addEventListener("change", function () { h.onStart(Number(sel.value)); });
    $("random").addEventListener("click", function () { h.onRandom(); });
    $("again").addEventListener("click", function () { h.onAgain(); });
    $("reset").addEventListener("click", function () { h.onReset(); });
  }
  function rgBoard(scores, level) {
    EX_LEVELS.forEach(function (l) { $("level-" + l).setAttribute("aria-pressed", l === level ? "true" : "false"); });
    $("counter").textContent = exCounterText(scores, level);
    var board = $("board"), parts = exBoardText(scores); board.textContent = "";
    parts.forEach(function (p, idx) { var n = document.createElement(EX_LEVELS[idx] === level ? "b" : "span"); n.textContent = p; board.appendChild(n); if (idx < parts.length - 1) board.appendChild(document.createTextNode(" · ")); });
    board.setAttribute("aria-label", "Score of each level: " + parts.join(", "));
  }
  function rgChooser(hard, start) { var sel = $("start"); sel.value = String(start); sel.disabled = hard; $("random").disabled = hard; }
  function rgInert(segs) { ["major", "minor"].forEach(function (r) { segs[r].forEach(function (g) { g.removeAttribute("tabindex"); g.setAttribute("role", "img"); }); }); }
  // The text of every slot, kept from the wheel's own drawing: name(ring, sector, "none" | "first" | "full") ("first" shows only the first of the two names at six o'clock), count(sector, shown).
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
      name: function (r, k, mode) { var e = L[r][k]; if (e.spans.length) e.spans.forEach(function (s, i) { s.textContent = mode === "full" || (mode === "first" && i === 0) ? e.full[i] : ""; }); else e.nm.textContent = mode === "full" ? e.full[0] : ""; },
      count: function (k, shown) { var e = L.major[k]; if (e.ct) e.ct.textContent = shown ? e.ctFull : ""; }
    };
  }
  // ==== circle ring page END ======================================================================================================================
