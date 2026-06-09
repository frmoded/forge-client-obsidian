---
timestamp: 2026-06-03T19:00:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-06-03T18:30:00Z
status: success
---

# Redo smoke checklists for v0.2.40 + v0.2.41 — feedback

## §0 Amended files

- `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-03-0000-URGENT-freeze-broken-snapshot-capture-missing-in-pyodide.md` — added a §3 (the file previously had no smoke section at all; the v0.2.40 release shipped without a user-side checklist).
- `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-03-0100-freeze-via-wikilink-and-graph-view.md` — replaced the existing §3 (a table-and-BRAT-style smoke I'd written earlier this session at the user's request, prior to the protocol amendment) with a fresh prose-paragraph checklist using `install-latest.sh`.

No git commit was made for these amendments. Feedback files live under the parent `projects/.git` repo (a stale-index-lock situation noted in earlier drains). The amendments are on-disk and the next session can see them; if cowork wants them committed into the parent repo's history, the lock cleanup + commit is a separate step.

§0–§2 and §1.1–§1.5 of both feedback files are untouched per the prompt's "Out of scope" rules. Only §3 was edited.

## §1 What was rewritten in each

**0000 (v0.2.40 URGENT freeze-capture fix):** 8-step prose checklist exercising the engine-side auto-qualify path end-to-end. Step 4 is the bug-fix-prompt-exception reproduction (Cmd+P → Freeze edge → bare IDs `hello_random` / `random_name` → expect Notice, no PythonError — the exact gesture that hit `FileNotFoundError: /bundle/user-vault/.forge/edges/hello_random/random_name.md` pre-v0.2.40). Includes the v0.2.38 auto-re-extract console log line verbatim (`Forge: forge-music already at version 0.3.8; skipping` or the drift variant). On-disk snapshot inspection at `~/forge-vaults/smoke-v0.2.13/.forge/edges/authoring/hello_random/authoring/random_name.md` proves the auto-qualify wrote the qualified path. 4 step-keyed failure modes + end-state cleanup.

**0100 (v0.2.41 wikilink right-click menu):** 12-step prose checklist exercising the wikilink-context-menu surface, including the two negative cases (wikilink target isn't a snippet → menu suppressed; caller isn't a snippet → menu suppressed). Step 4 instructs the user to append `# Dependencies\n\n[[random_name]] [[Greet]]\n` to `hello_random.md` since the file as currently written has no actual wikilinks in its body (the references in the English facet are backtick-wrapped code marks, not wikilinks). Step 8 is the load-bearing "freeze pinned the value" assertion. Failure modes section is 5 entries keyed by step number; end-state cleanup notes the persistent `# Dependencies` block + snapshot directory.

Both new §3s follow the protocol's 10 quality requirements: numbered prose paragraphs (no tables), `install-latest.sh` as install path (not BRAT), verbatim drift-detection console log lines, expanded acronyms on first use (`Cmd+Opt+I` (macOS) / `Ctrl+Shift+I` (Linux/Windows) for DevTools, `Cmd+Q` vs `Cmd+W` distinction called out), specific observable outcomes, concrete paths and identifiers, supersedes-note at top, step-keyed failure modes, end-state cleanup.

### Auto-verifiable grep checks (per prompt §Tests)

```
0000 §3: "## §3" count 1; BRAT 0; "| Step |" 0; "manifest.version" 0; "install-latest.sh" 2
0100 §3: "## §3" count 1; BRAT 0; "| Step |" 0; "manifest.version" 0; "install-latest.sh" 2
```

All four gates clear for both files.

## §2 Surprises + observations

### Did §0–§2 of the prior feedback files contain enough engineering detail to reconstruct the smoke?

**Yes for 0000.** §1.2 (Phase 1 investigation), §1.3 (fix design), and §1.4 (post-fix verbatim test output) provided every concrete identifier needed: the qualified snapshot path `.forge/edges/authoring/hello_random/authoring/random_name.md`, the helper function name `_forge_qualify_snippet_id`, the v0.2.40 fix's behavior, the test fixture names. The new §3 references all of these by exact string without guessing.

**Yes for 0100, with one footnote.** §1.3 (Phase 2 implementation) named the menu items exactly (`Forge: Freeze edge {caller} → {callee}`), the verb-construction quirk producing "lived" instead of "unfroze" (called out in §2), and the metadata-cache adapter shape. The one gap: §0–§2 didn't note that `hello_random.md` as-shipped has no actual wikilinks in its body — the references to `random_name(n=5)` are backticked Python code, not `[[random_name]]` wikilinks. The new §3 step 4 carries the workaround (append a `# Dependencies` block) inline. Cowork might consider adding the Dependencies block to the canonical `hello_random.md` if it's expected to be the default exerciser of the wikilink-menu surface.

### Two minor "lived" / "BRAT" hits the gate caught

First Edit pass left two strings the prompt's grep gate forbids:

1. The supersedes-note in 0100 mentioned BRAT three times while explaining what the prior checklist had wrong. The grep is dumb — it doesn't distinguish meta-explanation from step bodies — so I reworded the note to drop BRAT entirely ("the prior shape was flagged as too dense and used the wrong install path; the canonical install is `scripts/install-latest.sh`"). The note still conveys the why-rewrite signal without naming the wrong tool.

2. Step 3 of 0100's original draft used the DevTools incantation `app.plugins.plugins['forge-client-obsidian'].manifest.version`. Replaced with a Terminal `grep '"version"' .../manifest.json` — same verification, on-disk path, no DevTools console required.

Lesson: the next time the protocol's auto-verifiable section bans a specific string (`BRAT`, `manifest.version`), expect the gate to fire on meta-explanations too — the grep doesn't know about prose vs steps. Write defensively.

### Reference-example spot-check (Step 7 of the prompt)

- [x] Numbered steps in execution order; no table-of-steps anywhere.
- [x] Each step has Action + Expected Outcome explicitly; Interpretation included where load-bearing.
- [x] Pre-conditions at top name terminal/cwd/Obsidian-state/vault prerequisites for both files.
- [x] `install-latest.sh` is used; no BRAT references.
- [x] Auto re-extract console log lines referenced verbatim (`Forge: forge-music already at version 0.3.8; skipping` / `Forge: forge-music drift detected (extracted 0.3.X → bundled 0.3.8); backing up + re-extracting`).
- [x] Outcomes specific and observable (`hello qzfmx` example, specific Notice text, qualified-path file existence).
- [x] Concrete paths and identifiers (no "the vault" or "the freeze command" — every reference is full and quoted).
- [x] "Failure modes to watch for" section at end of each, keyed by step number.
- [x] End-state cleanup section in each (snapshot dir paths spelled out, `rm -rf` command provided).
- [x] Acronyms expanded on first use (`Cmd+Opt+I` (macOS) / `Ctrl+Shift+I` (Linux/Windows) for DevTools, `Cmd+Q` vs `Cmd+W` distinction).
- [x] Reads as if writing for a tired distracted reader — short paragraphs, copy-pasteable commands in fenced blocks, no jargon-as-acronyms.

## §3 N/A — the deliverable IS the §3 sections in the two other feedback files.
