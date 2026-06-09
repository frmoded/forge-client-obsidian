# Drafts

Cowork authors prompts here while iterating with the user. A prompt
in `drafts/` is **not** ready to fire — CC will not process it
(the queue convention's `Pick` step scans only the top level of
`prompts/`).

When the user is ready to fire a prompt, move it to the top-level
`prompts/` directory:

```bash
mv prompts/drafts/<timestamp>-<name>.md prompts/<timestamp>-<name>.md
```

The fswatch-driven launchd watcher (if installed; see
`../../scripts/README.md`) detects the move and invokes
`claude -p "do prompt"` automatically. Without the watcher, the
move is harmless — you can still fire manually via `do prompt` /
`drain prompts` in a CC session.

## Why this directory exists

- **Review gate.** A prompt that Cowork authored lives here until
  you've read it + decided it captures what you want.
- **Atomicity.** Moves are filesystem-atomic — no half-saved drafts
  trigger CC accidentally.
- **No editing in-place.** Don't iterate on a draft inside
  top-level `prompts/` — that would race with CC if the watcher is
  installed. Iterate in `drafts/`, then move when ready.
