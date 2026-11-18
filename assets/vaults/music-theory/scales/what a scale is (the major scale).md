Intervals gave you distances; a scale lines a handful of them up in a fixed order and turns the result into a sound.

A scale is a recipe of steps that starts on a home note, the **tonic**. Change the home note and the recipe stays. That's the whole idea.

## Major

Major is the one everybody knows, the sound people call "do re mi". Whole, whole, half, whole, whole, whole, half: W-W-H-W-W-W-H. A half step is the next piano key (black keys count) or the next fret; a whole step is two of them. Seven steps, and the last one lands you back on the tonic, an octave up.

W and H look like code? They're not. [[interval notation and jargon]] explains whole steps, half steps and the letters we use for them.

Build it from C and you never touch a black key. W to D, W to E, H to F, W to G, W to A, W to B, H to C: C D E F G A B C.

![[scales/resources/images/c_major_scale.svg]]
*C major: the white keys from C to C, no sharps or flats.*

Now start on G and follow the same recipe: W to A, W to B, H to C, W to D, W to E, W to F♯, H back to G. The white keys let you down at the seventh step: F is a whole step under G, and the recipe wants a half step. So you take the black key between them and spell it F♯, not G♭, because a scale uses each letter once and G is already home. [[scales jargon]] has the rule. The notes moved. The shape didn't.

![[scales/resources/images/g_major_scale.svg]]
*G major: the same recipe from G; the seventh note is F-sharp, shown here as a sharp sign on the staff.*

Major is the parent scale. Later keys and chords get measured against it, so get friendly.

## Sharp or flat?

Here's the rule that settles every spelling fight: a scale uses each letter from A to G once, in order. Not twice, not skipped. Call the seventh note of G major G♭ and you've got two Gs and no F. So it's F♯. Done.

That's why a key signature is all sharps or all flats, never a mix.

G major has one sharp, the F♯ above. F major has one flat, and it's the fourth note: B♭, not A♯, because the letters have to run F G A B C D E.

Keys a fifth up from C (G, D, A, E, B) collect sharps. Keys a fourth up from C (F, B♭, E♭, A♭) collect flats. A few keys can be spelled two ways: D♭ major and C♯ major sound identical. Usual pick: the spelling with fewer sharps or flats, so D♭ (five flats) beats C♯ (seven sharps). A later chapter shows why the sharp keys arrive in the order they do.

![[scales/resources/images/f_major_scale.svg]]
*F major: the same recipe from F; the fourth note is B-flat, shown as a flat sign on the staff.*

## Time to work

Two checks, every time. Count the half steps against the recipe. Then read the letters: seven notes, seven different letters, none twice, none skipped. G A B C D E F♯ passes. G A B C D E G♭ fails: two Gs, no F.

Don't stop at C and G. Build all twelve major scales, one per home note, in the exercise below. It keeps count of how many of the twelve you've finished. Twelve sounds like a lot until you notice it's the same recipe twelve times.

To see any scale on a keyboard and a staff, use the player on [[Scales]].

**W – W – H – W – W – W – H**

```html-embed
scales/resources/html/scale_build_major.html
454
```
*Exercise: choose a home note and tap the keys of the scale; the staff fills in as you find the notes. Easy, medium and hard allow 5, 3 or 1 wrong taps. At the end you see the whole scale and can press Play.*

Natural minor is next: [[natural minor scale]].

<div style="
  display:flex;
  justify-content:space-between;
  font-size:12px;
  color:#666666;
  border-top:1px solid #F2F2EC;
  padding:6px 2px;
  margin:10px 0;
">
<span>&uarr; <a class="internal-link" data-href="Scales" href="Scales" style="color:#1963D1;">Scales</a></span>
<span><a class="internal-link" data-href="natural minor scale" href="natural minor scale" style="color:#1963D1;">natural minor scale</a> &rarr;</span>
</div>
