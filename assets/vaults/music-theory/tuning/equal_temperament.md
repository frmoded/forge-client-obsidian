## How it's computed

Divide the octave into twelve perfectly identical steps and be done with it. No ear-by-ear compromise, no wolf to hide, no key that gets treated better than another — every semitone is exactly 2^(1/12), the same ratio, twelve times in a row. And here's the part that should bother you a little: 2^(1/12) is irrational. No fraction of whole numbers ever equals it, so no rational division of a string ever lands there exactly. Every ratio this vault has worked with so far — 2:1, 3:2, all twelve points in [[why_12_notes]] — was a ratio of whole numbers. This one, on purpose, is not.

## The tuning

Below, C3 to C4, naturals only, tuned to Equal. Press **Play ascending**. Sounds fine, doesn't it? That's the whole trick.

```html-embed
tuning/resources/html/piano_keyboard_equal.html
280
```

That abandonment of rational lengths is also what makes the [[monochord]] obsolete as a construction tool: it only works because simple ratios mark clean, repeatable points on a string, and equal temperament's positions can be approximated on one but never *constructed* the way a fifth or fourth could.

![[notes/resources/images/why12_log.svg]]

That tiny, accumulating drift above — every pure fifth landing a hair sharp of its equal-tempered slot — is exactly the unevenness [[meantone]] and [[well_temperament]] spent two centuries trying to manage. Equal temperament just... erased it. By fiat.

## Do the good

Play the wolf. Actually play it — below, G♯3 and D♯4 start held, tuned to Equal. Press **Play together**, then flip to Pythagorean and play the same two keys again. Hear that? The pair every other system in this chapter treats as a monster is, here, just a fifth. Nothing special, nothing sour, nothing to work around. That's the whole sales pitch: no wolves, anywhere, ever, in any key.

```html-embed
tuning/resources/html/piano_keyboard_equal_good.html
280
```

## Do the bad

Here's the bill for that peace of mind. Below, C3 and G3 start held — the best-case fifth, the one every other system gets exactly right. Play together in Equal, then flip to Pythagorean and play it again. Equal's version is close, but it's not *that* fifth; it's a slightly-flat impression of it. There is no key, no interval, anywhere on this instrument, that is ever actually, truly in tune. Equal temperament didn't solve the problem. It just spread the damage so evenly you stopped noticing it.

```html-embed
tuning/resources/html/piano_keyboard_equal_bad.html
280
```

## History

Simon Stevin worked out the exact mathematics — the 2^(1/12) ratio itself — around the turn of the 17th century, decades after Galilei's [[rule_of_eighteen|practical approximation]] had already been getting fretted instruments most of the way there by feel. The idea took its time catching on: keyboards stuck with [[meantone]] and then [[well_temperament]] well into the 18th century, because a system that makes every key equally mediocre is a hard sell against one that makes most keys genuinely good. Equal temperament won anyway, gradually, as the de facto keyboard standard by the 19th century and universal by the 20th — not because it sounds better, but because it never sounds *worse* in any particular key, which turned out to matter more once music started wandering freely between them.

<div style="
  display:flex;
  justify-content:space-between;
  font-size:12px;
  color:#666666;
  border-top:1px solid #F2F2EC;
  padding:6px 2px;
  margin:10px 0;
">
<span>&larr; <a class="internal-link" data-href="well_temperament" href="well_temperament" style="color:#1963D1;">well_temperament</a></span>
<span>&uarr; <a class="internal-link" data-href="Tuning" href="Tuning" style="color:#1963D1;">Tuning</a></span>
</div>
