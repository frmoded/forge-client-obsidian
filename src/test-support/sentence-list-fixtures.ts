// 2026-11-19-0970 (THE LIST MODEL, stage 1) - what the list tests share: ONE vault of names, the sentences of the 1206 checklist (C5 and C6: forge-moda-bootstrap/prompts/feedback/2026-11-12-1206-...), and the arr_001 note of
// ~/projects/music-playground, COPIED here (read-only: the sibling repo is never opened by a test). There is NO comp_001 anywhere on this machine (music-playground has no compositions folder), so comp_001 is made the way New
// composition makes it, from the C6 sentence: it is the note today's single sentence produced.
import type { GrammarVault } from '../phrase-grammar-core.ts';

/** The notes the sentences may name. */
export const VAULT: GrammarVault = {
  bars: ['bar_001', 'bar_003', 'bar_005', 'bar_007'],
  phrases: ['phrase_001', 'phrase_002', 'phrase_003'],
  arrangements: ['arr_001', 'arr_002'],
  compositions: ['comp_001', 'comp_002', 'song_1', 'song_2', 'song_3'],
  kits: ['rock', 'latin', 'jazz'],
};

/** C5 of the 1206 checklist: the canonical Description of `rock plays phrase_001 and latin plays phrase_002, latin at 60 percent` (one paragraph, the form every note had before the list). */
export const C5_PARAGRAPH = 'Play [[phrase_001]] on the [[rock]] kit. Play [[phrase_002]] on the [[latin]] kit. Play the [[latin]] kit at 60 percent volume. Together.';
export const C5_LINES = ['Play [[phrase_001]] on the [[rock]] kit.', 'Play [[phrase_002]] on the [[latin]] kit.', 'Play the [[latin]] kit at 60 percent volume.'];
/** C6: the canonical Description of `play phrase_001, then phrase_002 for 4 bars, once more`. */
export const C6_PARAGRAPH = 'Play [[phrase_001]]. Then play [[phrase_002]] for 4 bars. Repeat that once more.';
export const C6_LINES = ['Play [[phrase_001]].', 'Then play [[phrase_002]] for 4 bars.', 'Repeat that once more.'];

/** arr_001.md of music-playground, byte for byte (2026-11-19). */
export const ARR_001 = `---
type: data
content_type: json
description: "arr_001 — 2 tracks played together: [[phrase_001]] on the [[rock]] kit, [[phrase_002]] on the [[latin]] kit. A phrase that is shorter than the others rests until the longest one ends. All tracks play at the tempo of [[phrase_001]]. Volume 58 percent: [[latin]]."
links:
  - "[[phrase_001]]"
  - "[[rock]]"
  - "[[phrase_002]]"
  - "[[latin]]"
source_facet: description
description_hash: b0010d3d9ee78eb873c1876d4caf1f81f93414b41818d490ebd36c2437a92ed9
recipe_hash: 37bd785e248b2dab65708c555f315dd24d54a50c3207a4788500fda0beb8e619
python_hash: badfb21363920ebfeede6f0082f79ab6e8f752702c12b12c83afe0ec50e6f50d
recipe_derived_from_description_hash: b0010d3d9ee78eb873c1876d4caf1f81f93414b41818d490ebd36c2437a92ed9
python_derived_from_recipe_hash: 37bd785e248b2dab65708c555f315dd24d54a50c3207a4788500fda0beb8e619
---

# Description

Play [[phrase_001]] on the [[rock]] kit. Play [[phrase_002]] on the [[latin]] kit. Play the [[latin]] kit at 58 percent volume. Together.

# Recipe

Play [[phrase_001]] on the [[rock]] kit.
Play [[phrase_002]] on the [[latin]] kit.
Play the [[latin]] kit at 58 percent volume.
Together.

# Python

\`\`\`python
def compute(context):
  tracks = []
  tracks.append({'kit': 'rock', 'channels': rock()['channels'], 'bars': phrase_001()})
  tracks.append({'kit': 'latin', 'channels': latin()['channels'], 'bars': phrase_002(), 'volume': 58})
  bars = combine_tracks(tracks=tracks)
  return bars
  # for a Score of these bars: rhythm_bars_to_stream(bars=bars)
\`\`\`

# Cache

<!-- the grammar's reading of the note's source (Description, Recipe or Python): edit the source, not this -->

\`\`\`json
{
  "kind": "arrangement",
  "tracks": [
    {"kit": "rock", "phrase": "phrase_001"},
    {"kit": "latin", "phrase": "phrase_002", "volume": 58}
  ]
}
\`\`\`
`;

/** The frontmatter stamps that depend on the Description's text: the only lines (besides the Description section itself) a list may change in a note that says the same thing. */
export const DESCRIPTION_STAMPS = /^(?:description_hash|recipe_derived_from_description_hash): .*\n/gm;
/** A note's text without its `# Description` section and without the two stamps that hash it: what must be the same when only the Description's FORM (paragraph or list) differs. */
export function withoutDescription(text: string): string {
  return text.replace(DESCRIPTION_STAMPS, '').replace(/(# Description\n\n)[\s\S]*?(\n\n# Recipe)/, '$1<description>$2');
}
