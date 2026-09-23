How different eras handled the [[why_12_notes|Pythagorean comma]] once they'd found it — four systems, each choosing a different place to put the same unavoidable gap, plus one practical shortcut invented along the way.

- [[pythagorean_tuning]] — build every note from stacked pure fifths; simplest, and the one that surfaces the comma in the first place.
- [[meantone]] — spread the gap evenly across most fifths, at the cost of one unplayable "wolf" interval.
- [[rule_of_eighteen]] — Vincenzo Galilei's practical 16th-century approximation to equal temperament, built for fretted instruments before the mathematics of equal temperament existed.
- [[well_temperament]] — spread it unevenly instead, so every key is at least playable.
- [[equal_temperament]] — spread it with total mathematical evenness, abandoning rational ratios entirely.

## History

A rough timeline of when each system entered use:

| System | When | Notes |
|---|---|---|
| [[pythagorean_tuning\|Pythagorean tuning]] | Legendary origin ~6th century BCE; rigorously formalized by Euclid's *Sectio Canonis*, c. 300 BCE | Dominant through the medieval period |
| [[meantone]] | Spreading from the late 15th century; standard through the 16th–17th centuries | |
| [[rule_of_eighteen\|Rule of Eighteen]] | c. 1581 (Vincenzo Galilei) | For fretted instruments specifically |
| [[well_temperament]] | Flourished 17th–18th centuries; Werckmeister's schemes published 1691, Bach's *Well-Tempered Clavier* 1722 | |
| [[equal_temperament]] | Mathematically derived by Simon Stevin, c. 1585–1608; the de facto keyboard standard by the 19th century, universal by the 20th | |

## How close is each system to the others?

**Metric:** take each system's twelve chromatic pitches as cents above C (a cent is 1/100 of an equal-tempered semitone), then compute the **root-mean-square (RMS) difference** between two systems' twelve-note vectors — the standard way tuning systems get compared quantitatively. A small RMS means the two systems place their twelve notes almost identically; a large one means real, audible disagreement across the octave.

For [[pythagorean_tuning]] and [[meantone]] this table uses each system's own well-known conventional cent values (built from the nearest fifths in either direction), not the vault's own deliberately one-directional twelve-fifth chain from [[why_12_notes]] — that chain exists specifically to expose the comma, not to represent how either tuning is actually built in practice, and mixing the two would compare different things under the same name.

Rows and columns below are in the same chronological order as the History table above:

| | Pythagorean | Meantone | Rule of 18 | Well temp. | Equal |
|---|---|---|---|---|---|
| **Pythagorean** | — | 22.9¢ | 13.3¢ | 15.1¢ | 8.3¢ |
| **Meantone** | 22.9¢ | — | 12.3¢ | 9.9¢ | 14.6¢ |
| **Rule of 18** | 13.3¢ | 12.3¢ | — | 4.7¢ | 6.8¢ |
| **Well temp.** | 15.1¢ | 9.9¢ | 4.7¢ | — | 7.7¢ |
| **Equal** | 8.3¢ | 14.6¢ | 6.8¢ | 7.7¢ | — |

A few things worth reading off the table: [[well_temperament|well temperament]] and [[rule_of_eighteen|the Rule of Eighteen]] sit closest to each other (4.7¢) — both were independently built as approximations to universal playability, one by ear and compromise, one by a single repeated ratio. [[pythagorean_tuning|Pythagorean]] and [[meantone]] sit furthest apart (22.9¢) — the two most philosophically opposed choices, pure fifths versus pure-ish thirds. Of the historical systems, [[equal_temperament|equal temperament]] itself sits closest to [[rule_of_eighteen|the Rule of Eighteen]] (6.8¢) — which makes sense, since Galilei's rule was already reaching for exactly what equal temperament later formalized.
