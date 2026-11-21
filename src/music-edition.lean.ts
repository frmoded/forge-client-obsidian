// LEAN implementation of the music-edition seam: today's behavior on `main`. No music features;
// musicxml payloads are shown as plain text by the caller (every render method returns false).
import type { MusicEdition } from './music-edition.ts';

export const musicEdition: MusicEdition = {
  id: 'lean',
  registerInputWidgets() {
    // Run-input widgets (piano / guitar fretboard / chord builder) are music-domain and are not
    // registered in the lean edition; a widget type in frontmatter falls back to the plain text
    // box plus a Notice naming it.
  },
  registerScaleExplorer() {
    // The Scale Explorer (forge-scale block, side view, command) is music-domain: not registered in the lean edition.
  },
  registerReviewQueue() {
    return null;          // 2026-11-20-1004: the review queue is music-composer code
  },
  stopPlayers() {
    // No MIDI players exist in the lean edition.
  },
  renderMusicXML() {
    return false;
  },
  renderTaggedMusicXML() {
    return false;
  },
};
