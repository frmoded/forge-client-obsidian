#!/usr/bin/env node
// Drain 2026-10-18-1800 §3 — check the Obsidian class names the forge-rhythm embed's CSS relies on against the INSTALLED Obsidian, not memory.
//
// The "</>" icon that appears at the top right when you hover a Live Preview code-block widget is Obsidian's "Edit this block" button. This looks
// the names up in the installed app bundle (the newest `obsidian-<version>.asar` under Application Support, which is what actually runs):
//   edit-block-button                                       the button (`addEditButton` -> `setClass("edit-block-button")`, icon lucide-code-2)
//   embed-actions                                           the div that holds it
//   cm-preview-code-block cm-embed-block markdown-rendered cm-lang-<language>   the Live Preview widget's root, for a custom code-block language
// and reports which Obsidian code paths CALL `addEditButton` (Reading view is not among them).
//
//   node scripts/verify-obsidian-embed-classes.mjs           prints JSON; exit 0 = all found, 1 = a name is missing, 2 = no Obsidian bundle found
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function findObsidianBundle(home = os.homedir()) {
  const dir = path.join(home, "Library", "Application Support", "obsidian");     // macOS; other platforms: pass OBSIDIAN_ASAR
  if (process.env.OBSIDIAN_ASAR && fs.existsSync(process.env.OBSIDIAN_ASAR)) return process.env.OBSIDIAN_ASAR;
  if (!fs.existsSync(dir)) return null;
  const versions = fs.readdirSync(dir).map((f) => /^obsidian-(\d+(?:\.\d+)*)\.asar$/.exec(f)).filter(Boolean)
    .sort((a, b) => a[1].split(".").map(Number).reduce((d, n, i) => d || n - (b[1].split(".").map(Number)[i] ?? 0), 0));
  return versions.length ? path.join(dir, versions.at(-1)[0]) : null;
}

export function inspectBundle(buf) {
  const text = buf.toString("latin1");
  const count = (s) => text.split(s).length - 1;
  return {
    editBlockButton: count('setClass("edit-block-button")'),
    embedActions: count('createDiv("embed-actions")'),
    previewCodeBlockRoot: count('"cm-preview-code-block cm-embed-block markdown-rendered cm-lang-"'),
    // every place that ATTACHES the button to a widget it builds (editor widgets only)
    addEditButtonCalls: count("this.addEditButton("),
    readingViewHasEditBlockButton: /markdown-reading-view[^{}]{0,200}edit-block-button|edit-block-button[^{}]{0,200}markdown-reading-view/.test(text),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bundle = findObsidianBundle();
  if (!bundle) { console.error("verify-obsidian-embed-classes: no obsidian-<version>.asar found (set OBSIDIAN_ASAR)"); process.exit(2); }
  const facts = { bundle: path.basename(bundle), ...inspectBundle(fs.readFileSync(bundle)) };
  console.log(JSON.stringify(facts, null, 2));
  process.exit(facts.editBlockButton > 0 && facts.embedActions > 0 && facts.previewCodeBlockRoot > 0 ? 0 : 1);
}
