  // ==== circle ring core BEGIN (2026-11-23-1025) ====================================================================================================
  // The SAME block is in the three ring exercises (circle_exercise_outer_ring, _inner_ring and _signature_counts; a test pins them identical). Pure: no DOM. The helpers they share: the order of the climb (twelve sectors clockwise from the start),
  // a shuffle and a random start that take the page's random source (so a test can inject one), the sector names the wheel prints (both names at six o'clock), and the words for how far one key is above another. Names come from the circle core above.
  var RG_UP_WORDS = ["", "a half step", "a whole step", "a minor third", "a major third", "a fourth", "a tritone", "a fifth", "a minor sixth", "a major sixth", "a minor seventh", "a major seventh"];
  var RG_NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"];
  function rgOrder(start) { var out = [], k; for (k = 0; k < 12; k++) out.push(ciSector(start + k)); return out; }
  function rgShuffle(list, rng) { var a = list.slice(), i, j, t; for (i = a.length - 1; i > 0; i--) { j = Math.min(i, Math.floor(rng() * (i + 1))); t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  // A start sector, never the one on screen (`not`, or null); in hard never the sector at six o'clock (the hand-off is part of the climb there, not its start).
  function rgPickStart(rng, hard, not) { var pool = [], k; for (k = 0; k < 12; k++) if (k !== not && !(hard && k === 6)) pool.push(k); return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]; }
  function rgUp(from, to) { return scMod(ciPc(to) - ciPc(from), 12); }                                           // half steps from the key of sector `from` up to the key of sector `to`
  function rgIntervalWords(n) { return RG_UP_WORDS[n] || "the same note"; }
  function rgSlotName(k) { return k === 6 ? ciName(6, false) + "/" + ciName(6, true) : ciName(k, false); }       // "F♯/G♭" at six o'clock
  function rgMinorSlotName(k) { return k === 6 ? ciMinorName(6, false) + "m/" + ciMinorName(6, true) + "m" : ciMinorName(k, false) + "m"; }
  function rgMajorTitle(k) { return k === 6 ? ciName(6, false) + "/" + ciName(6, true) + " major" : ciKeyTitle(k, false); }
  function rgMinorTitle(k) { return k === 6 ? ciMinorName(6, false) + "/" + ciMinorName(6, true) + " minor" : ciMinorTitle(k, false); }
  function rgHalfSteps(n) { return RG_NUMBER_WORDS[n] + (n === 1 ? " half step" : " half steps"); }
  // ==== circle ring core END =======================================================================================================================
