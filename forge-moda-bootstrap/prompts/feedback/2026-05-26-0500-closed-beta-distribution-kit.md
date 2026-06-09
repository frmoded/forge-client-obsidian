---
timestamp: 2026-05-26T06:36:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-05-26T05:00:00Z
status: success
---

# Closed-beta distribution kit — onboarding + operator one-pagers

## 1. Deliverable A — `closed-beta-onboarding.md`

Created at
`/Users/odedfuhrmann/projects/forge-moda-bootstrap/closed-beta-onboarding.md`.

- **126 lines**, 7 H2 sections.
- Sections, in order:
  1. What you'll have when you're done (with
     `<<screenshot: forge-output-panel.png>>` placeholder).
  2. What you need before you start.
  3. Install Forge (the plugin) — 4 sub-steps mirroring INSTALL.md
     §3 but rewritten for non-developer voice.
  4. Paste your token.
  5. First Forge-click — verify it works.
  6. If something went wrong (three failure modes + escalation
     path to `closed-beta-operator.md`).
  7. What to try next.
- Pinned URL appears once at §3.1:
  `https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.8`.
- No uvicorn, server URL, sync_dependencies, or architecture detail
  surfaced to the student per prompt §1.6.

## 2. Deliverable B — `closed-beta-operator.md`

Created at
`/Users/odedfuhrmann/projects/forge-moda-bootstrap/closed-beta-operator.md`.

- **191 lines**, 9 H2 sections.
- Sections, in order:
  1. Architecture in one paragraph.
  2. Where the FORGE_TRANSPILE_SECRET lives.
  3. Adding a new student.
  4. Rotating / revoking the token (full 4-step recipe with curl
     verification of old-token-rejected + new-token-passes-auth).
  5. Health-check curls (`/health`, `/generate` 401, openssl cert
     dates).
  6. What to watch on EC2 (disk, journalctl, certbot timer,
     Anthropic budget).
  7. If forge.thecodingarena.com is down — triage decision tree.
  8. Closed-beta sunset.
  9. Cross-links.
- Placeholders for Oded to fill:
  - `<<1password entry: forge-transpile-secret>>` (§2)
  - `<<TODO: Oded fills>>` for the Anthropic monthly budget cap (§6)
- Cross-references to `forge-transpile/deploy/DEPLOY.md` and
  `cc-prompt-queue.md` as live relative links.

## 3. Cross-references

`cowork-forge-protocol.md` did not have a "where things live"
section to extend (per prompt §8 deviation case). Added a new H2
`## Closed-beta docs` at the bottom of the file with two bullet
links:

```markdown
## Closed-beta docs

- Student onboarding (non-developer audience): [`closed-beta-onboarding.md`](./closed-beta-onboarding.md).
- Operator reference (token rotation, EC2 health, runbook): [`closed-beta-operator.md`](./closed-beta-operator.md).
```

`closed-beta-onboarding.md` §6 ("If something went wrong") points
to `closed-beta-operator.md` as the escalation route. The operator
doc's §9 cross-links back to onboarding, DEPLOY.md, plugin INSTALL,
and the prompt-queue protocol.

## 4. Per-deliverable stats

| File | Lines | H2 sections | Placeholders |
| --- | --- | --- | --- |
| `closed-beta-onboarding.md` | 126 | 7 | 1 (screenshot) |
| `closed-beta-operator.md` | 191 | 9 | 2 (1Password entry name, Anthropic budget) |

## 5. Auto-smoke output

| Check | Result |
| --- | --- |
| Both files exist, ≥80 lines each | onboarding 126, operator 191 — green |
| Markdown lints cleanly | **skipped** — `markdownlint-cli2` not installed locally; prompt §5 fallback applied |
| Token-shape leak scan (`[A-Za-z0-9_-]{43}`) | 0 hits |
| `.pem` literal scan | 2 hits — both reference the deploy-key file path `~/.ssh/forge-transpile-key.pem` (path documentation, NOT key contents) |
| IPv4 literal scan | 0 hits (placeholder `<EC2-IP>` used throughout) |

All `<<placeholder>>` markers explicitly labeled and listed in §4
above so Oded can find them quickly during the manual review pass.

## 6. Git ops

**Not performed.** `forge-moda-bootstrap/` is not its own git repo
(no `.git` directory inside it), and the parent
`/Users/odedfuhrmann/projects/.git` does not track the bootstrap
directory either — `git status` from the parent omits it entirely.
The two new files are durable on disk at the documented paths; per
prompt §7 step 4, Oded decides where they get re-hosted for
student access (gist / Drive / email body).

Deviated from the prompt's "Push to origin/main" instruction
because there is no `origin/main` for this folder to push to.
Flagged in §8 below.

## 7. Manual smoke guidance for user (Oded)

After this drain finishes:

1. **Skim `closed-beta-onboarding.md`** as if you were a
   non-developer student. Flag any ambiguous wording for revision.
2. **Skim `closed-beta-operator.md`.** Run ONE curl from §5 to
   verify the command is right (e.g. the `/health` check). Read
   §4 (rotation) carefully — confirm the recipe matches your
   muscle-memory for actually rotating.
3. **Fill the placeholders:**
   - `<<1password entry: forge-transpile-secret>>` → save the
     token in 1Password, write the entry name back.
   - `<<TODO: Oded fills>>` (operator §6) → the Anthropic monthly
     budget cap.
4. **Decide and document** where `closed-beta-onboarding.md` will
   be hosted for student access (GitHub gist? Drive? Just paste
   into Tamar's email?) and note that decision somewhere durable
   (e.g., a comment in `cowork-forge-protocol.md`'s new
   "Closed-beta docs" section).
5. **Optional**: install `markdownlint-cli2` globally
   (`npm install -g markdownlint-cli2`) and rerun against both
   files. Not blocking — the docs are syntactically simple, no
   broken links, no malformed headers.

## 8. Deviations

- **No git commit / push.** `forge-moda-bootstrap/` isn't a git
  repo; the parent at `/Users/odedfuhrmann/projects/` doesn't
  track this directory. Files are durable on disk at the
  documented paths but there's no `origin/main` to push to. If
  you want versioned history for these docs, the natural homes
  are (a) move them into a sibling repo that IS git-tracked,
  (b) re-host as a GitHub gist, or (c) start a new git repo at
  `forge-moda-bootstrap/`. Any of those is a one-time follow-up.
- **markdownlint skipped.** Not installed locally; prompt §5
  fallback applied. Hand-verified syntax (no broken links, no
  malformed headers, code fences closed cleanly) by reading both
  files end-to-end after writing.
- **`cowork-forge-protocol.md` lacked a "where things live"
  section**, per prompt §8 deviation case. Appended a new
  `## Closed-beta docs` H2 at the bottom instead of trying to
  shoehorn the links into an existing section.

## 9. Out of scope confirmed

- **No screenshots generated** — placeholder reference only in
  `closed-beta-onboarding.md` §1.
- **No CI/CD changes.**
- **No per-student token issuance** — single shared token, per
  Oded's prior call.
- **No EC2 commands executed** — the deliverables document the
  HOW; Oded runs them when needed.
- **No `docs/` subdir created** — files live at the flat top level
  of `forge-moda-bootstrap/` matching the existing convention.

## 10. One observation

The pattern of "Oded fills the placeholder after the doc lands"
shows up twice in this deliverable (1Password entry name, Anthropic
budget) and once in the screenshot reference. That's three things
that need to happen synchronously OR the docs ship with visible
TODOs. The cheap fix is a one-line "Doc preflight" check just
before the docs go to students:

```bash
grep -n '<<' forge-moda-bootstrap/closed-beta-{onboarding,operator}.md
```

If that grep returns hits, the docs aren't ready to ship. Logging
this rather than building it inline — adding a preflight script
would inflate this prompt; the manual check is one shell command
per release.
