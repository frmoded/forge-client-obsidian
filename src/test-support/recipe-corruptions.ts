// 2026-10-31-1140 (M16a) - SPECIMEN Recipes (one of every step shape the renderers write) and the mechanical ways to spoil them: junk after a step, a step cut short at every word, a name the vault does not have, a number that is not one, a step missing,
// a step said twice. The Recipe grammar's REFUSALS are proven on all of them (recipe-grammar-core.test.ts): each is refused or read, at a line and a column, in a sentence that is frozen in test/fixtures/recipe-refusals.golden.txt - a reworded
// refusal is a decision made in that file, not a drift.
export const SPECIMENS: Record<string, string> = {
  'extend, fills, slower, a fork': 'Take [[bar_005]].\nRepeat it for 8 bars with fills, 20 % slower.\nBar 3 is replaced by [[bar_007]].',
  'extend, ghost notes, faster': 'Take [[bar_005]].\nRepeat it for 4 bars with ghost notes, 15.5 % faster.',
  'extend, building': 'Take [[bar_005]].\nBuild it up over 6 bars.',
  'morph, seeded': 'Take [[bar_001]] and [[bar_002]].\nMorph from the first to the second over 5 bars, in seeded order (seed 3).\nBar 2 is replaced by [[bar_007]].',
  'morph, one bar': 'Take [[bar_001]] and [[bar_002]].\nMorph from the first to the second and keep the bar at position 2, in musical order.',
  'mix, vote': 'Take [[bar_001]] and [[bar_002]].\nMix them by vote: 70 % [[bar_001]] and 30 % [[bar_002]], threshold 0.50, ghost notes off.',
  'mix, path': 'Take [[bar_001]] and [[bar_002]].\nMix them as a path of single-hit changes from the first to the second, in seeded order (seed 4).\nKeep the state at weight 0.25 (1 is all of [[bar_001]], 0 is all of [[bar_002]]).\nThreshold 30 percent.\nWith ghost notes.',
  'transform': 'Take [[phrase_001]].\nThin out bars 3 to 5, kick row: remove half of the hits, keeping the strongest beats.\nThin out bar 4: remove 25 % of the hits, chosen by seed 7.\nDouble up bars 1 to 2, snare row: every hit gets a second one a step later (grid 8).\nBar 9 is replaced by [[bar_007]].',
  'arrangement': 'Play [[phrase_001]] on the [[rock]] kit.\nPlay [[phrase_003]] on the [[latin]] kit.\nPlay the [[rock]] kit at 70 percent volume.\nMute the [[latin]] kit.\nOnly the [[rock]] kit plays.\nTogether.',
  'composition': 'Play [[phrase_001]] for 8 bars.\nThen play [[arr_001]] for 4 bars.\nRepeat that 2 more times.',
  'a path with nothing after it': 'Take [[bar_001]] and [[bar_002]].\nMix them as a path of single-hit changes from the first to the second, in musical order.',
  'a take with nothing after it': 'Take [[phrase_001]].',
  'transform, a grid': 'Take [[phrase_001]].\nDouble up bar 2: every hit gets a second one a step later (grid 8).',
};

/** Every spoiled version of `text`, each with a name for what was done to which step. */
export function corruptions(text: string): Array<{ what: string; text: string }> {
  const lines = text.split('\n');
  const out: Array<{ what: string; text: string }> = [];
  const put = (what: string, edit: (ls: string[]) => string[]): void => { out.push({ what, text: edit([...lines]).join('\n') }); };
  lines.forEach((line, i) => {
    const body = line.replace(/\.$/, '');
    put(`step ${i + 1}: junk after it`, (ls) => { ls[i] = `${body} banana.`; return ls; });
    const words = body.split(' ');
    for (let k = 1; k < words.length; k++) put(`step ${i + 1}: cut after word ${k}`, (ls) => { ls[i] = `${words.slice(0, k).join(' ')}.`; return ls; });
    if (/\[\[[^\]]+\]\]/.test(line)) put(`step ${i + 1}: a name the vault does not have`, (ls) => { ls[i] = line.replace(/\[\[[^\]]+\]\]/, '[[nope_1]]'); return ls; });
    if (/\d/.test(line)) put(`step ${i + 1}: a number that is not one`, (ls) => { ls[i] = line.replace(/\d+(?:\.\d+)?/, 'x'); return ls; });
    if (line.includes(')')) put(`step ${i + 1}: a closing parenthesis missing`, (ls) => { ls[i] = line.replace(/\)/g, ''); return ls; });
    if (line.includes(',')) put(`step ${i + 1}: the commas missing`, (ls) => { ls[i] = line.replace(/,/g, ''); return ls; });
    if (line.includes(':')) put(`step ${i + 1}: the colon missing`, (ls) => { ls[i] = line.replace(/:/g, ''); return ls; });
    put(`step ${i + 1}: missing`, (ls) => { ls.splice(i, 1); return ls; });
    put(`step ${i + 1}: said twice`, (ls) => { ls.splice(i, 0, line); return ls; });
  });
  return out;
}
