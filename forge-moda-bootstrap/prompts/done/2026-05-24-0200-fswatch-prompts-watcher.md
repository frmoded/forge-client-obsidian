# fswatch + launchd watcher for prompt firing (auto-invoke CC on prompt arrival)

## Scope

Build a small fswatch-driven shell script + launchd plist that auto-invokes Claude Code (`claude -p "do prompt"`) whenever a new `.md` file appears at the top level of `/Users/odedfuhrmann/projects/forge-moda-bootstrap/prompts/`. Plus the supporting `drafts/` directory + README.

What this prompt delivers:

1. **`drafts/` subdirectory** in `forge-moda-bootstrap/prompts/`. Empty placeholder so the convention is in place. Add a brief `drafts/README.md` explaining it's for in-progress Cowork prompts not yet ready to fire.

2. **`scripts/watch-prompts.sh`** — the watcher shell script. fswatch monitors `prompts/` for new top-level `.md` files only. On detection, invokes CC. Includes:
   - Debounce (skip if the same file fires twice within 2 seconds — handles save-twice or move-then-edit races).
   - Top-level filter (ignore changes inside `drafts/`, `feedback/`, `done/`, `failed/`, `questions/`).
   - Logging to a stable log path (`~/Library/Logs/forge-prompts-watcher.log`) so failures are debuggable.
   - Per-file lock to prevent two CC runs on the same prompt if a file is moved + edited rapidly.

3. **`scripts/com.frmoded.forge-prompts-watcher.plist`** — launchd plist for boot-survival + login-start. `KeepAlive` so it restarts if killed; `RunAtLoad` so it starts on login. Reads from `scripts/watch-prompts.sh` via `ProgramArguments`.

4. **`scripts/install-watcher.sh`** — one-line installer. Copies the plist to `~/Library/LaunchAgents/`, runs `launchctl load`, prints success + path to the log file. Idempotent: detects existing install and reloads instead of erroring.

5. **`scripts/uninstall-watcher.sh`** — symmetric uninstaller. `launchctl unload`, removes the plist from LaunchAgents.

6. **`scripts/README.md`** — brief setup + usage doc:
   - Prereq: `brew install fswatch`.
   - Install: `bash scripts/install-watcher.sh`.
   - Verify: `tail -f ~/Library/Logs/forge-prompts-watcher.log`.
   - The new authoring flow (Cowork → `drafts/` → user `mv` → CC auto-fires).
   - How to pause the watcher temporarily (`launchctl unload ~/Library/LaunchAgents/...`).
   - How to uninstall.

7. **Auto-verify the watcher fires on the smoke test:** CC runs `bash scripts/install-watcher.sh`, then `touch prompts/test-watcher-trigger.md` (a fake placeholder), checks the log for the CC-invocation entry, then removes the fake file and `mv`'s it into `done/` for cleanup. The CC invocation itself will see "queue empty" or process the fake file as a no-op — either is fine; the smoke verifies the watcher fired, not that CC did useful work on a fake.

Does NOT:

- Auto-fire on changes to `drafts/`, `feedback/`, `done/`, `failed/`, or `questions/`.
- Auto-fire on edits to an existing top-level prompt (only new file additions / moves into top-level trigger).
- Touch the engine, plugin, iframe, or any vault content.
- Add per-prompt opt-in/opt-out frontmatter (the user's "fire it" is already encoded in the `drafts/ → top-level` move).
- Watch any directory beyond `prompts/` top-level.
- Add complex queueing logic (CC's existing `do prompt` queue convention handles ordering).

## Why

The "fire CC" manual step is the last friction in the dev loop. With the new default-on git ops protocol, CC already commits/pushes/tags/cuts releases without needing per-prompt auth — the user-gate is the drafts → top-level move, not a terminal command. The watcher removes the terminal hop entirely.

Per the cowork protocol's "User's working pace" section: any explicit thing that speeds up the loop without compromising the review gate is worth doing.

The `drafts/` convention is the review gate. The watcher is just the speed layer on top.

## Files to create

All under `/Users/odedfuhrmann/projects/forge-moda-bootstrap/`.

### `prompts/drafts/` (directory)

Empty initially. Add a placeholder `README.md`:

```markdown
# Drafts

Cowork authors prompts here while iterating with the user. A prompt
in `drafts/` is **not** ready to fire — CC will not process it.

When the user is ready to fire a prompt, move it to the top-level
`prompts/` directory:

    mv prompts/drafts/X.md prompts/X.md

The fswatch-driven launchd watcher (if installed; see
`scripts/README.md`) detects the move and invokes CC automatically.
```

### `scripts/watch-prompts.sh`

```bash
#!/usr/bin/env bash
# Watch the prompts/ top-level directory for new .md files and auto-invoke
# Claude Code when one appears. Designed to be run via launchd as a long-
# lived service. See scripts/README.md for install instructions.

set -uo pipefail

PROMPTS_DIR="/Users/odedfuhrmann/projects/forge-moda-bootstrap/prompts"
LOG_FILE="$HOME/Library/Logs/forge-prompts-watcher.log"
DEBOUNCE_SECONDS=2

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

log "Watcher starting; PROMPTS_DIR=$PROMPTS_DIR"

# fswatch options:
#   --event Created     — only new files
#   --event MovedTo     — files moved INTO the dir from elsewhere (covers `mv drafts/X.md X.md`)
#   --include "\\.md$"  — only markdown
#   --exclude ".*"      — exclude everything else (combined with --include this is "only .md")
#   --recursive=false   — top-level only
#
# We also explicitly check the file path in the loop to filter out
# events from drafts/ / feedback/ / etc. subdirs that fswatch might
# still surface depending on macOS version.

LAST_TRIGGER=""
LAST_TRIGGER_TS=0

fswatch \
  --event Created \
  --event MovedTo \
  --include "\\.md$" \
  --exclude ".*" \
  "$PROMPTS_DIR" \
  | while read -r changed_path; do
    # Top-level filter: changed_path must be directly inside PROMPTS_DIR,
    # not in any subdir.
    parent="$(dirname "$changed_path")"
    if [[ "$parent" != "$PROMPTS_DIR" ]]; then
      continue
    fi

    # Debounce: skip if same file triggered within the last N seconds.
    now=$(date +%s)
    if [[ "$changed_path" == "$LAST_TRIGGER" ]] && \
       (( now - LAST_TRIGGER_TS < DEBOUNCE_SECONDS )); then
      continue
    fi
    LAST_TRIGGER="$changed_path"
    LAST_TRIGGER_TS="$now"

    log "Detected new prompt: $changed_path — invoking CC"

    # Invoke CC. cd to bootstrap dir so CC's queue convention paths resolve.
    # The "do prompt" verb is the queue protocol's single-prompt trigger.
    cd "$(dirname "$PROMPTS_DIR")"
    if claude -p "do prompt" >> "$LOG_FILE" 2>&1; then
      log "CC invocation finished cleanly for $changed_path"
    else
      log "CC invocation FAILED for $changed_path (exit $?)"
    fi
  done
```

Make executable: `chmod +x scripts/watch-prompts.sh`.

### `scripts/com.frmoded.forge-prompts-watcher.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.frmoded.forge-prompts-watcher</string>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/Users/odedfuhrmann/projects/forge-moda-bootstrap/scripts/watch-prompts.sh</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Users/odedfuhrmann/Library/Logs/forge-prompts-watcher.stdout.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/odedfuhrmann/Library/Logs/forge-prompts-watcher.stderr.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <!-- Ensure PATH includes brew-installed fswatch + the claude CLI. -->
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
```

If the user's `claude` CLI lives somewhere unusual (e.g., `~/.local/bin/claude` or a custom install), append that to the `PATH` env var. CC should `which claude` to verify and adjust if needed.

### `scripts/install-watcher.sh`

```bash
#!/usr/bin/env bash
# Install the forge prompts watcher as a launchd LaunchAgent.
# Idempotent: detects existing install and reloads instead of erroring.

set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_SRC="$SCRIPTS_DIR/com.frmoded.forge-prompts-watcher.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.frmoded.forge-prompts-watcher.plist"
LABEL="com.frmoded.forge-prompts-watcher"

# Sanity check fswatch is installed.
if ! command -v fswatch >/dev/null 2>&1; then
  echo "ERROR: fswatch not found. Install with: brew install fswatch"
  exit 1
fi

# Sanity check claude CLI.
if ! command -v claude >/dev/null 2>&1; then
  echo "WARNING: claude CLI not found in PATH. The watcher will fail until claude is installed."
fi

# Make watcher script executable.
chmod +x "$SCRIPTS_DIR/watch-prompts.sh"

# Unload existing if present.
if launchctl list "$LABEL" >/dev/null 2>&1; then
  echo "Existing watcher found; reloading."
  launchctl unload "$PLIST_DST" 2>/dev/null || true
fi

# Copy plist.
mkdir -p "$HOME/Library/LaunchAgents"
cp "$PLIST_SRC" "$PLIST_DST"

# Load.
launchctl load "$PLIST_DST"

echo "✓ Watcher installed and loaded."
echo "  Log: ~/Library/Logs/forge-prompts-watcher.log"
echo "  Status: launchctl list $LABEL"
echo "  Tail logs live with: tail -f ~/Library/Logs/forge-prompts-watcher.log"
```

### `scripts/uninstall-watcher.sh`

```bash
#!/usr/bin/env bash
# Uninstall the forge prompts watcher.

set -euo pipefail

PLIST_DST="$HOME/Library/LaunchAgents/com.frmoded.forge-prompts-watcher.plist"
LABEL="com.frmoded.forge-prompts-watcher"

if launchctl list "$LABEL" >/dev/null 2>&1; then
  launchctl unload "$PLIST_DST" 2>/dev/null || true
fi

if [[ -f "$PLIST_DST" ]]; then
  rm -f "$PLIST_DST"
  echo "✓ Watcher uninstalled."
else
  echo "Watcher not installed (no plist at $PLIST_DST)."
fi
```

### `scripts/README.md`

```markdown
# Prompts watcher

Auto-invokes Claude Code when a new prompt lands at the top level of `prompts/`.

## Prereq

`brew install fswatch`

## Install

```bash
bash scripts/install-watcher.sh
```

Verify: `launchctl list com.frmoded.forge-prompts-watcher` shows the service.

Tail logs live:

```bash
tail -f ~/Library/Logs/forge-prompts-watcher.log
```

## Authoring flow

1. Cowork authors a prompt at `prompts/drafts/<timestamp>-<name>.md`.
2. You read the prompt + Cowork's summary.
3. When ready, fire by moving:

   ```bash
   mv prompts/drafts/<timestamp>-<name>.md prompts/<timestamp>-<name>.md
   ```

4. fswatch detects the move, invokes `claude -p "do prompt"`, CC drains.
5. CC writes feedback to `prompts/feedback/`, moves the prompt to `done/`.

The watcher only triggers on new top-level files. Edits to drafts, files in `drafts/`, `feedback/`, etc. don't trigger.

## Pausing

Temporary pause:

```bash
launchctl unload ~/Library/LaunchAgents/com.frmoded.forge-prompts-watcher.plist
```

Re-enable:

```bash
launchctl load ~/Library/LaunchAgents/com.frmoded.forge-prompts-watcher.plist
```

## Uninstall

```bash
bash scripts/uninstall-watcher.sh
```
```

## Implementation notes

### fswatch event filtering

macOS fswatch sometimes surfaces events from subdirectories even with `--recursive=false` (the flag is unreliable across fswatch versions). The shell loop's explicit `parent != PROMPTS_DIR` check is the reliable filter.

### Debounce edge cases

The 2-second debounce handles:
- Save-twice (autosave + manual save in editor).
- Move-then-edit-then-save (treats the edit as a no-op).
- Filesystem event coalescing on macOS (occasionally fires twice for one logical event).

Two seconds is conservative; could go to 500ms if it feels sluggish. Don't go higher than 5 — would mask genuine successive fires.

### PATH gotcha

launchd processes inherit a minimal PATH that doesn't include `/opt/homebrew/bin` or the user's shell-rc additions. The plist's `EnvironmentVariables.PATH` is essential — without it, `fswatch` and `claude` will be "command not found" from the watcher's perspective even though they work from your shell.

CC verifies the actual install path of `claude` (`which claude`) and adjusts the PATH in the plist if needed. Common locations: `/opt/homebrew/bin/claude`, `~/.local/bin/claude`, `~/bin/claude`.

### KeepAlive caveat

`KeepAlive: true` means launchd restarts the script if it exits. If `claude` itself blocks (e.g., interactive prompt waiting for input that won't come), the watcher script blocks too — KeepAlive won't help. `claude -p` runs non-interactively so this shouldn't bite, but if you see the watcher "stuck," kill the claude process manually.

### Logging discipline

The watcher logs to `~/Library/Logs/forge-prompts-watcher.log`. CC includes Year-Month-Day-HHMMSS timestamps so log entries align with feedback file timestamps. Useful when debugging "did this prompt fire automatically or manually."

## Tests + smoke

### Auto-verified by CC

- `brew list fswatch` → confirms fswatch installed (or install it).
- `bash scripts/install-watcher.sh` exits 0; service shows in `launchctl list`.
- Tail `~/Library/Logs/forge-prompts-watcher.log` shows the "Watcher starting" line within a few seconds of install.
- **Smoke fire**: `touch prompts/auto-fire-smoke-test.md` (empty file). Wait 3-5 seconds. Log shows "Detected new prompt" line + "CC invocation finished" line. CC's invocation will see "queue empty" (empty file isn't a valid prompt) — that's fine; the smoke verifies the watcher fired, not CC did useful work.
- **Cleanup**: remove `prompts/auto-fire-smoke-test.md` after the smoke. Optionally `mv` to `done/` to mirror the queue convention.
- `bash scripts/uninstall-watcher.sh` exits 0; service no longer in `launchctl list`. Then reinstall to leave the watcher live for ongoing use.

### Deferred to user (truly UI-side)

- The actual end-to-end flow: Cowork drafts a prompt → save → user `mv`'s to top-level → watcher fires → CC processes. This requires Cowork (me) to author a real prompt to drafts/ in a separate conversation turn, then user moves it. Not something CC can fully simulate in one drain.

## Out of scope

- Watch any directory beyond `prompts/` top-level.
- Per-prompt opt-in/out auto-fire frontmatter.
- Complex queue management (CC's existing convention covers ordering).
- A daemon that runs on Linux (launchd is macOS-only). If the user ever uses Linux, write a systemd unit then.
- A GUI status indicator.
- Notification on CC invocation (e.g., system notification when CC finishes). Add later if useful.
- Slack/email integration on CC failures.

## Report when done

Per protocol 8-section.

1. **Files added** — full tree of new files under `scripts/` and `prompts/drafts/`.
2. **Install smoke output** — `bash scripts/install-watcher.sh` output; `launchctl list` confirmation.
3. **Auto-fire smoke output** — log lines from the `touch prompts/auto-fire-smoke-test.md` test, including the "Detected new prompt" + "CC invocation finished" lines.
4. **Cleanup confirmation** — fake smoke file removed.
5. **Git ops** — commit message, SHA, push to main.
6. **Any deviation and why.**
7. **One observation.**

## Commits + push

forge-moda-bootstrap isn't currently a git repo (per prior prompts). If it isn't, skip git ops — flag in feedback. If it IS a git repo, commit with: `[2026-05-24-0200-fswatch-watcher] fswatch + launchd prompt watcher + drafts/ convention`.

## Don'ts

- **Don't watch subdirectories** of `prompts/`. Top-level only.
- **Don't trigger on file edits.** New files / moves into top-level only.
- **Don't add complex queue logic.** CC's `do prompt` already handles ordering.
- **Don't make the install script destructive.** Reload existing install, don't error.
- **Don't write to /etc/ or any system path.** Per-user only (`~/Library/LaunchAgents/`).
- **Don't add a daemon for Linux.** macOS only for now.
- **Don't add a "claude not installed" hard error.** Warn but proceed — user may install claude after the watcher.
- **Don't bake any secrets into the script.** No tokens, no keys.
- **Don't enable auto-fire on `drafts/` changes.** That defeats the gate.
