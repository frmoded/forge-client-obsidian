**Frequency** is the physical cause of [[pitch]]: how many times per second a sound wave repeats its cycle, measured in **hertz (Hz)**. Pitch and frequency are not the same thing — frequency is the *input* (a physical fact about the wave), pitch is the *perception* your brain forms from it.

Two waves across the same span of time, one cycling twice as often as the other — the faster one is the higher frequency:

![[notes/resources/images/frequency_sine.svg]]

The mapping between them is **logarithmic, not linear**: equal *ratios* of frequency sound like equal *steps* of pitch. Doubling the frequency raises the pitch by one octave — whether you go 110 Hz → 220 Hz or 440 Hz → 880 Hz. That's why octaves, not fixed Hz gaps, are the natural rungs of pitch.

The reference anchor for the whole system is **A4 = 440 Hz**. See also [[pitch]].

## Tension and frequency

For a vibrating string, frequency is set by three physical things — its length, how tightly it is stretched, and how heavy it is per unit length. The fundamental frequency is:

$$f = \frac{1}{2L}\sqrt{\frac{T}{\mu}}$$

where **f** is the fundamental frequency in Hz, **L** is the vibrating length of the string, **T** is its tension (the stretching force), and **μ** is its mass per unit length. (These relationships are known as *Mersenne's laws*.)

Read it as three rules: halve the length and the frequency doubles (an octave up — the ratio you can measure on a [[monochord]]); tighten the string and the frequency rises with the *square root* of the tension; use a heavier string and it falls with the square root of the mass per length. Try it on a guitar: tune one string up a little and notice how much tension it takes to move the pitch even a small step — that square root is why.

### History

The tension–frequency relationship has a father-and-son story behind it. **Vincenzo Galilei** (a lutenist, composer, and music theorist, and the father of **Galileo Galilei**) is credited with discovering it in the late 1500s. Galileo later told his biographer that Vincenzo introduced him to systematic testing and measurement in the family's house in Pisa, where the basement was strung with lengths of lute string, each of a different length, with weights attached.

Those experiments turned up something unexpected. Interval ratios line up neatly with string *lengths* — a perfect fifth is 3:2 — but tension does not work that way. For strings of equal length, the weights had to be in the ratio **9:4** to sound the 3:2 perfect fifth. That is the square-root law in the equation above: tension goes as the *square* of the frequency ratio, since (3/2)² = 9/4. Vincenzo's practical interest in tuning shows up elsewhere in the vault too — see [[rule_of_eighteen]] and [[Tuning]].

Galileo carried the idea into his last book, *Two New Sciences* (1638), where he discusses vibrating strings and suggests that not just the length of the string matters for pitch, but also its tension and its weight. The result is named for **Marin Mersenne**, who set out these relationships in *Harmonie universelle* (1636) and checked them by experiment — something Galileo had considered impossible to do.


<div style="
  display:flex;
  justify-content:space-between;
  font-size:12px;
  color:#666666;
  border-top:1px solid #F2F2EC;
  padding:6px 2px;
  margin:10px 0;
">
<span>&larr; <a class="internal-link" data-href="pitch" href="pitch" style="color:#1963D1;">pitch</a></span>
<span>&uarr; <a class="internal-link" data-href="Physics" href="Physics" style="color:#1963D1;">Physics</a></span>
<span><a class="internal-link" data-href="octave" href="octave" style="color:#1963D1;">octave</a> &rarr;</span>
</div>