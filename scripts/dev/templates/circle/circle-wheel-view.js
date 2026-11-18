  // ==== circle wheel BEGIN (2026-11-19-0900) =========================================================================================================
  // The SAME block is in the explorer and in the two exercises that use the wheel (a test pins them identical). The wheel as SVG: twelve sectors, the major keys on the outer ring (C at the top, clockwise), the relative minors on the inner ring. Nothing here
  // changes when the pointer rests on it: a sector is a button (click, Enter or Space) and the arrow keys move between sectors. `opts.counts` prints the sharps / flats count in each sector; `opts.onPick(ring, sector)` is told what was chosen.
  var WHEEL = { size: 300, cx: 150, cy: 150, r0: 144, r1: 100, r2: 60 };
  function wheelXY(r, deg) { var t = (deg - 90) * Math.PI / 180; return { x: WHEEL.cx + r * Math.cos(t), y: WHEEL.cy + r * Math.sin(t) }; }
  function wheelPath(rOut, rIn, a0, a1) {
    var p0 = wheelXY(rOut, a0), p1 = wheelXY(rOut, a1), p2 = wheelXY(rIn, a1), p3 = wheelXY(rIn, a0);
    return "M" + p0.x.toFixed(1) + " " + p0.y.toFixed(1) + " A" + rOut + " " + rOut + " 0 0 1 " + p1.x.toFixed(1) + " " + p1.y.toFixed(1) + " L" + p2.x.toFixed(1) + " " + p2.y.toFixed(1) + " A" + rIn + " " + rIn + " 0 0 0 " + p3.x.toFixed(1) + " " + p3.y.toFixed(1) + " Z";
  }
  function buildWheel(svg, opts) {
    svg.setAttribute("viewBox", "0 0 " + WHEEL.size + " " + WHEEL.size);
    var segs = { major: [], minor: [] }, order = [], ring, i;
    function pick(r, k) { opts.onPick(r, k); }
    for (ring in segs) (function (r) {
      for (i = 0; i < 12; i++) (function (k) {
        var rOut = r === "major" ? WHEEL.r0 : WHEEL.r1, rIn = r === "major" ? WHEEL.r1 : WHEEL.r2, a0 = k * 30 - 15, a1 = k * 30 + 15, mid = (rOut + rIn) / 2;
        var g = el("g", { "class": "seg " + r, "data-sector": k, "data-ring": r, role: "button", tabindex: "-1" }, svg);
        el("path", { d: wheelPath(rOut, rIn, a0, a1) }, g);
        var both = k === 6, name = r === "major" ? (both ? ciName(6, false) + " " + ciName(6, true) : ciName(k, false)) : (both ? ciMinorName(6, false) + " " + ciMinorName(6, true) : ciMinorName(k, false));
        var lab = r === "major" ? (opts.counts ? wheelXY(mid + 8, k * 30) : wheelXY(mid, k * 30)) : wheelXY(mid, k * 30);
        var t = el("text", { "class": "name" + (both ? " both" : "") + (r === "minor" ? " small" : ""), x: lab.x.toFixed(1), y: (lab.y + 5).toFixed(1) }, g);
        if (both) { var t1 = el("tspan", { x: lab.x.toFixed(1), dy: "-3" }, t); t1.textContent = name.split(" ")[0]; var t2 = el("tspan", { x: lab.x.toFixed(1), dy: "11" }, t); t2.textContent = name.split(" ")[1]; } else t.textContent = r === "minor" ? name + "m" : name;
        if (both && r === "minor") { t1.textContent = name.split(" ")[0] + "m"; t2.textContent = name.split(" ")[1] + "m"; }
        if (opts.counts && r === "major") { var c = wheelXY(mid - 10, k * 30), ct = el("text", { "class": "count", x: c.x.toFixed(1), y: (c.y + 4).toFixed(1) }, g); ct.textContent = both ? ciCountText(6, false) + " " + ciCountText(6, true) : ciCountText(k, false); }
        g.addEventListener("click", function () { pick(r, k); try { g.focus({ preventScroll: true }); } catch (_) {} });
        g.addEventListener("keydown", function (e) {
          if (e.altKey || e.ctrlKey || e.metaKey) return;
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(r, k); return; }
          var d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
          if (d === 0) return;
          e.preventDefault(); var to = segs[r][scMod(k + d, 12)]; segs[r][k].setAttribute("tabindex", "-1"); to.setAttribute("tabindex", "0"); to.focus();
        });
        segs[r][k] = g;
      })(i);
    })(ring);
    segs.major[0].setAttribute("tabindex", "0"); segs.minor[0].setAttribute("tabindex", "0");
    return segs;
  }
  // ==== circle wheel END ===========================================================================================================================
