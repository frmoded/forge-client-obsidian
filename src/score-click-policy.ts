// 2026-10-23-0030 — "does a click on an engraved note start playback here?" Yes in every vault except a score-first one, where the click selects (pins a bar, lights a note) and sound is the Score's own
// Play control's job. The ONE answer, handed to the music edition's renderer by every surface that engraves a Score (`renderTaggedMusicXML(host, payload, name, { clickToPlay: scoreClickPlays })`).
// It reads the published profile flag — the very flag the Forge output panel reads — and is asked AT THE CLICK, so it follows the flag live (it is published after the first render) and a forge.toml that
// stops declaring the profile turns it off at once. It never reads the profile itself.
import { messageDelivery } from './score-first-messages-core.ts';

export function scoreClickPlays(): boolean {
  return !messageDelivery.isScoreFirst();
}
