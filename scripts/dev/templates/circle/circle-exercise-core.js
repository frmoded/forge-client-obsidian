  // ==== circle exercise core BEGIN (2026-11-19-0900) ================================================================================================
  // The SAME block is in the three circle exercise gadgets (a test pins them identical). Pure. The levels and the scores of the Scales exercises (src/scale-build-exercise.test.ts pins the same numbers there): the level sets how many wrong taps an exercise allows
  // (easy 5, medium 3, hard 1); the score counts exercises done right per level; memory only (the sandboxed page has no storage). An exercise, never a test: the words are "exercise" and "wrong taps".
  var EX_LEVELS = ["easy", "medium", "hard"], EX_ATTEMPTS = { easy: 5, medium: 3, hard: 1 }, EX_DEFAULT_LEVEL = "medium";
  function exLevelName(l) { return l.charAt(0).toUpperCase() + l.slice(1); }
  function exAttempts(level) { return EX_ATTEMPTS.hasOwnProperty(level) ? EX_ATTEMPTS[level] : EX_ATTEMPTS[EX_DEFAULT_LEVEL]; }
  function exCopy(s, patch) { var o = {}, k; for (k in s) o[k] = s[k]; for (k in patch) o[k] = patch[k]; return o; }
  function exEmptyScores() { var s = {}; EX_LEVELS.forEach(function (l) { s[l] = { score: 0, tried: 0 }; }); return s; }
  function exBump(scores, level, dScore, dTried) { var out = {}; EX_LEVELS.forEach(function (l) { out[l] = { score: scores[l].score, tried: scores[l].tried }; }); out[level].score += dScore; out[level].tried += dTried; return out; }
  function exTried(scores, level) { return exBump(scores, level, 0, 1); }
  function exBuilt(scores, level) { return exBump(scores, level, 1, 0); }
  function exCounterText(scores, level) { var c = scores[level]; return exLevelName(level) + ": score " + c.score + " of " + c.tried + (c.tried === 1 ? " exercise" : " exercises"); }
  function exBoardText(scores) { return EX_LEVELS.map(function (l) { return exLevelName(l) + " " + scores[l].score + "/" + scores[l].tried; }); }
  function exLeftText(left) { return left + (left === 1 ? " wrong tap left" : " wrong taps left"); }
  // A random key (a sector, and for sector 6 either spelling), never the one on screen (`not` = its sector, or null).
  function exRandomKey(rng, not) {
    var i, tries = 0;
    do { i = Math.min(11, Math.floor(rng() * 12)); tries++; } while (not !== null && not !== undefined && i === not && tries < 50);
    return { i: i, alt: i === 6 && rng() < 0.5 };
  }
  // ==== circle exercise core END ===================================================================================================================
