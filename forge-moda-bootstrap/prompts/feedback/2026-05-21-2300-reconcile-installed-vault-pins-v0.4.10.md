---
timestamp: 2026-05-21T23:09:55Z
session_id: unknown
prompt_modified: 2026-05-21T16:07:12Z
status: success
---

# Reconcile installed-vault forge-moda pins to v0.4.10

## 1. Install path chosen

**Python harness via the engine's `forge/install` snippet** (option 2
from the prompt). No standalone `forge` CLI exists in the codebase
(`scripts/` only has `install.sh` and `setup-forge.sh`, neither of
which is the per-vault installer; the production install path runs
inside the engine via `context.compute("forge/install", ...)`).

Script written at:
`/Users/odedfuhrmann/projects/forge-moda-bootstrap/scripts/reinstall-vault.py`

Usage: `python reinstall-vault.py <target-vault-path> <library-vault-name>`.
Minimal — builds a `SnippetRegistry` rooted at the target vault,
registers the builtin vault, constructs a `ForgeContext` with
`vault_path=<target>`, calls `ctx.compute("forge/install",
vault_name="forge-moda")`. The install snippet handles
lookup→fetch→extract→manifest-update→registry-refresh atomically.

Invocation (run sequentially, foo → bluh → dry-run-vault):
```
cd /Users/odedfuhrmann/projects/forge && source .venv/bin/activate
for vault in foo bluh dry-run-vault; do
  python /Users/odedfuhrmann/projects/forge-moda-bootstrap/scripts/reinstall-vault.py \
    /Users/odedfuhrmann/forge-vaults/$vault forge-moda
done
```

All three reported:
```
install result: {'vault_name': 'forge-moda', 'version': '0.4.10',
  'message': 'Installed forge-moda@0.4.10. …'}
```

## 2. Per-vault pre-flight state

| Vault | Pre-install pin | Pre-install `go.md` shape | Root shadows |
|---|---|---|---|
| `foo` | `forge-moda 0.4.0`, `forge-music 0.2.0` | v0.4.10 (trimmed; prior direct-mirror reached it) | `go.md`, `setup.md`, `on_mouse_click.md` |
| `bluh` | `forge-moda 0.4.4` | v0.4.10 (trimmed; prior direct-mirror reached it) | `go.md` (with user `print("foo")`), `setup.md`, `on_mouse_click.md` |
| `dry-run-vault` | `forge-moda 0.4.0` | v0.4.10 (trimmed; prior direct-mirror reached it) | `go.md`, `setup.md`, `on_mouse_click.md` |

**Note on the pre-flight `go.md` shapes:** the prior facet-polish
prompt's direct-mirror pass DID reach the installed library copies
(`<vault>/forge-moda/go.md`) — they were already at v0.4.10 shape.
The actual stale piece was the **manifest pin**: foo/dry-run-vault
still claimed `0.4.0`, bluh still claimed `0.4.4`. The reconcile
fixes that drift atomically.

Shadow shas (pre-install):
```
foo/go.md             3f561411f97833284a22e65e5531aa3bcd374680
foo/setup.md          7f241710822a39c4f49539e770b34e57f29587a8
foo/on_mouse_click.md 0326ab4220445cca237f10cfbdcab5d17ee664e0
bluh/go.md            d8660f619b22535f9eb0bd860e4573f071abfc3d  (has print)
bluh/setup.md         7f241710822a39c4f49539e770b34e57f29587a8
bluh/on_mouse_click.md 0326ab4220445cca237f10cfbdcab5d17ee664e0
dry-run-vault/go.md   3f561411f97833284a22e65e5531aa3bcd374680
dry-run-vault/setup.md 7f241710822a39c4f49539e770b34e57f29587a8
dry-run-vault/on_mouse_click.md 0326ab4220445cca237f10cfbdcab5d17ee664e0
```

## 3. Per-vault post-flight state

All three vaults pin `forge-moda = 0.4.10` in their `forge.toml`'s
`dependencies` list.

`<vault>/forge-moda/go.md` body across all three matches the
v0.4.10 trimmed shape verbatim:
```
# English

Inputs: state (optional), dt (optional), temperature (optional)

Defaults when omitted: `state` → None, `dt` → 1/30, `temperature` → "medium".

Call [[ask_all_particles]] with dt.
Call [[ask_water_particles]] with temperature.

# Python
```

`<vault>/forge-moda/_meta/_chips.md` has 16 wikilinked insertion
entries (sampled the first 3 to confirm; the install path extracts
the full tarball so the rest are bit-identical to the source).

`diff -r <vault>/forge-moda/ /Users/odedfuhrmann/projects/forge-moda/`
(excluding `.DS_Store`, `.forge/`, `.git`) — **empty across all
three vaults**. Library copies are bit-identical to the canonical
source.

## 4. User-shadow integrity

Shadow shas (post-install) match pre-install exactly across all
nine shadow files:

| Shadow | Pre-install sha | Post-install sha | Status |
|---|---|---|---|
| `foo/go.md` | `3f561411…` | `3f561411…` | UNCHANGED |
| `foo/setup.md` | `7f241710…` | `7f241710…` | UNCHANGED |
| `foo/on_mouse_click.md` | `0326ab42…` | `0326ab42…` | UNCHANGED |
| `bluh/go.md` | `d8660f61…` | `d8660f61…` | UNCHANGED (user `print("foo")` lines intact) |
| `bluh/setup.md` | `7f241710…` | `7f241710…` | UNCHANGED |
| `bluh/on_mouse_click.md` | `0326ab42…` | `0326ab42…` | UNCHANGED |
| `dry-run-vault/go.md` | `3f561411…` | `3f561411…` | UNCHANGED |
| `dry-run-vault/setup.md` | `7f241710…` | `7f241710…` | UNCHANGED |
| `dry-run-vault/on_mouse_click.md` | `0326ab42…` | `0326ab42…` | UNCHANGED |

Specifically on `bluh/go.md`: explicit `grep "print("` confirms
both `print("foo")` lines (one in English body, one in Python
facet) are still present post-install. The install operation
touched only `<vault>/forge-moda/` and `<vault>/forge.toml`; root-
level shadows are entirely outside its blast radius.

## 5. Orphan files

**None across all three vaults.** `diff -rq` between each
`<vault>/forge-moda/` and the canonical source surfaced zero
`Only in <vault>/...` entries. This matches the prompt's
expectation: v0.4.4 → v0.4.10 was content-only with no file
adds/removes.

## 6. Commit SHAs

**None.** Per "Don't commit anything" rule. User vaults are not
git-tracked anyway (they live under `~/forge-vaults/`, not in the
projects-side meta-repo). The library and registry are already at
v0.4.10 from the prior prompt's publish.

Files modified outside git tracking:
- `~/forge-vaults/foo/forge.toml`, `~/forge-vaults/foo/forge-moda/**`
- `~/forge-vaults/bluh/forge.toml`, `~/forge-vaults/bluh/forge-moda/**`
- `~/forge-vaults/dry-run-vault/forge.toml`, `~/forge-vaults/dry-run-vault/forge-moda/**`
- New file: `~/projects/forge-moda-bootstrap/scripts/reinstall-vault.py` (untracked; the bootstrap dir isn't its own git repo).

## 7. Observation

Two improvements would smooth this reconcile pattern:

**(a) `forge update <library>` shortcut.** Today the version-bump-
only case (registry has new `latest`, consumer wants to refresh)
goes through the full install chain: re-fetch tarball, re-extract,
overwrite content, update manifest. For consumers whose installed
content has already drifted to the latest via direct mirror (this
prompt's exact scenario), the only thing that actually NEEDED to
change was the manifest pin. A dedicated `forge/update` snippet
that just rewrote the `forge.toml` pin and triggered a registry
refresh — without re-fetching/re-extracting — would be cheaper and
clearer. The flip side: if consumers shouldn't be drifting via
direct mirror in the first place (the prompt's "pattern correction"
point), there's no need to optimize for that path. Open question.

**(b) `forge install` pre-cleanup.** Install currently extracts
over whatever's in `<vault>/<library>/` — files that existed in
the older version but were removed in the new version would stick
around as orphans. v0.4.4 → v0.4.10 was content-only so no orphans
appeared here, but a future structural change (e.g. moving more
files into `_meta/` or deleting deprecated leaves) could leave
stale files behind. The install snippet could optionally pre-
clear the target subdir (configurable, to preserve user data
deliberately placed there). The prompt explicitly asks me to
flag-not-act, so noting it without proposing the change.

Both are separate-prompt material. Captured here so the next
relevant cleanup has them at hand.

## Verification status

**Automated:** none new (per spec — this is a deploy reconcile, not
a code change). The engine + plugin remain at their last-confirmed
test results (forge: 81/81 + plugin: 42/42 from prior runs in this
session).

**Manual GUI:** deferred to user per the prompt's manual checklist.
The headless side surfaces the install completed cleanly across
all three vaults with bit-identical content, matching manifest
pins, and zero shadow churn — the GUI walk-through (open Bluh,
hover wikilinks, click chips, confirm `bluh/go.md` print lines)
remains the final readability check.
