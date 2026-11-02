// 2026-10-31-1135 (CCQA smoke 10, B5 and B5x) - a note is checked by the ENGINE before it is written. Every note-creating command (a phrase of any kind, a sentence's phrase, a transform, the notebook's Run, an arrangement, a
// composition) asks this seam with the path and the text it is about to write; the answer is `null` (go ahead) or ONE plain sentence (refuse, write nothing). The check is not a copy of an engine rule: it draws the Score of the
// prospective note with the producers and the engine calls that draw every Score (produce*Note, compute*ScoreViaEngine), so the rule that refuses is the engine's own (compose_sections' meter/steps/group-size check, extend_rhythm's
// 16-step grid, morph_rhythm, mix_rhythm, the region transforms). Pure: the engine and the vault are injected.
import { produceArrangement, type ArrangementDeps } from './arrangement-core.ts';
import { composeMismatchSentence, plainEngineSentence } from './engine-refusal-core.ts';
import { installNotePreflight, installedNotePreflight, type NotePreflight } from './note-preflight-seam.ts';
import { phraseDepsWithSources, produceComposition, type CompositionDeps } from './composition-core.ts';
import { producePhraseNote, type PhraseScoreDeps } from './phrase-core.ts';

export interface PreflightEngine {
  /** The text of a vault note by path (fresh on every call). Rejects when the note is not there. */
  readNote(path: string): Promise<string>;
  compute: PhraseScoreDeps['compute'];
  computeArrangement: ArrangementDeps['compute'];
  computeComposition: CompositionDeps['compute'];
}

const LABEL = /^(?:Phrase|Composition|Arrangement|Score): /;
/** A thrown error that is the ENGINE's refusal (a Python exception, or one of its own `function_name: ...` lines), as against the engine being unavailable: the second must not stop a person from making a note. */
const ENGINE_REFUSAL = /Traceback|\b[A-Za-z]*Error:|\b[a-z]+(?:_[a-z]+)+: /;

export function makeNotePreflight(engine: PreflightEngine): NotePreflight {
  const phrases = (): PhraseScoreDeps => phraseDepsWithSources({ readNote: engine.readNote, compute: engine.compute }, { computeArrangement: engine.computeArrangement, computeComposition: engine.computeComposition });
  return async (path, content) => {
    const name = (path.split('/').pop() ?? path).replace(/\.md$/, '');
    try {
      let out;
      if (path.startsWith('phrases/')) out = await producePhraseNote(phrases(), content, name);
      else if (path.startsWith('arrangements/')) out = await produceArrangement({ phrases: phrases(), compute: engine.computeArrangement }, content, name);
      else if (path.startsWith('compositions/')) out = await produceComposition({ phrases: phrases(), compute: engine.computeComposition, computeArrangement: engine.computeArrangement }, content, name);
      else return null;
      if (out.kind === 'score') return null;
      // "the engine could not build the score (<why>)" is either the engine REFUSING the note (a Python exception, one of its own lines) or the engine being unavailable (not hydrated, still loading): only the first is a reason to
      // refuse. The wrapper reaches us inside a source's refusal too ("the phrase phrase_003 could not be drawn: Score: the engine could not build the score (...)"), so the reason is looked at wherever it sits.
      const why = /the engine could not build the score \(([\s\S]*)\)\s*$/.exec(out.message);
      if (why !== null && !ENGINE_REFUSAL.test(why[1])) return null;
      return out.message.replace(LABEL, '');
    } catch (e) {
      const raw = (e as Error)?.message ?? String(e);
      return ENGINE_REFUSAL.test(raw) ? plainEngineSentence(raw) : null;
    }
  };
}
export { composeMismatchSentence, installNotePreflight, installedNotePreflight, type NotePreflight };
