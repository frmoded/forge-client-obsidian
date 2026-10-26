// 2026-10-26-1545 (the pair closed itself): every leaf the workspace lists, collected the way Obsidian's own walk requires. Obsidian's `iterateLeaves` STOPS the walk of a split as soon as the callback returns
// something truthy (measured in 1.14.5's app.js: `if (callback(leaf)) return true`), and `Set.add` returns the Set. A callback written as an expression, `(l) => all.add(l)`, therefore saw one leaf per split, and a pane
// that was on screen "left the workspace". The callback here is a block that returns nothing. No `obsidian` import: the walk is passed in.
export function collectLeaves<L>(iterate: (callback: (leaf: L) => void) => void): Set<L> {
  const all = new Set<L>();
  iterate((leaf) => { all.add(leaf); });
  return all;
}
