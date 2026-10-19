#!/usr/bin/env python3
"""Drain 2026-10-20-1100 §2 — the old-vs-new OUTPUT comparison for the four hand-written library notes the 1530 review recommended re-deriving.

For each note it runs (a) the Python the note SHIPPED, hand-written, and (b) the Python the REAL engine transpiles from the note's Recipe
(`resolve_action_code(snippet, force=True)` — what a hammer click / Run write-back receives) through the engine's own executor, under the same
random seeds, and summarises what each produced: staves, note count, and a digest of every note event (staff, offset, pitches, length).
It also runs the OLD Python under two seeds, so the file can say whether the output is random at all (it is, for slow_burn): a difference
between old and new is only meaningful next to the difference between old and old.

The result is committed as test/fixtures/engine-transpile/rederive-comparison.json and pinned by src/rederive-comparison.test.ts, which also keeps
the shipped bytes of the four notes AS THEY WERE (`old_note`) — a test that took its "before" from the moving source tree would expire the moment
the notes are re-derived.

Usage (the forge engine's own virtualenv; music21 8.3 is in it):
  ~/projects/forge/.venv/bin/python scripts/compare-rederived-output.py [--forge ~/projects/forge] [--vault NAME=PATH]... [--rev music-theory=<sha>]... [--out FILE]
Vaults are read from `git archive <rev or HEAD>` of the given checkouts, never their working trees. Run it at the commit BEFORE the notes were
re-derived (music-theory baf108d); afterwards old and new Python are the same text and the comparison is trivially identical.
"""
import argparse, hashlib, json, os, random, re, subprocess, sys, tempfile, warnings

NOTES = ['music-theory/slow_burn/chorus', 'music-theory/slow_burn/solo_chorus', 'music-theory/percussion/loom', 'music-theory/slow_burn/slow_burn']
VAULTS = ['forge-tutorial', 'music-theory', 'forge-moda', 'music-core']
SEEDS = [1, 2]


def summarise(result):
    """Staves, note count, and a digest of every note event, so 'identical' means identical note for note (rests are not events)."""
    from music21 import stream
    if not isinstance(result, stream.Stream):
        return {'kind': type(result).__name__}
    parts = list(result.parts) or [result]
    staves = []
    for p in parts:
        ev = []
        for el in p.recurse().getElementsByClass('GeneralNote'):
            if el.isRest:
                continue
            pitches = [x.nameWithOctave for x in el.pitches] if getattr(el, 'pitches', None) else [str(getattr(el, 'displayName', ''))]
            ev.append([round(float(el.getOffsetInHierarchy(p)), 4), type(el).__name__, pitches, round(float(el.quarterLength), 4)])
        staves.append(ev)
    return {
        'staves': len(parts),
        'notes': sum(len(e) for e in staves),
        'digest': hashlib.sha256(json.dumps(staves, sort_keys=True).encode()).hexdigest()[:16],
    }


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.dirname(here)
    ap = argparse.ArgumentParser()
    ap.add_argument('--forge', default=os.path.join(repo, '..', 'forge'))
    ap.add_argument('--vault', action='append', default=[], metavar='NAME=PATH')
    ap.add_argument('--rev', action='append', default=[], metavar='NAME=REV')
    ap.add_argument('--out', default=os.path.join(repo, 'test', 'fixtures', 'engine-transpile', 'rederive-comparison.json'))
    args = ap.parse_args()
    warnings.filterwarnings('ignore')
    forge = os.path.abspath(args.forge)
    where = {v: os.path.abspath(os.path.join(repo, '..', v)) for v in VAULTS}
    for spec in args.vault:
        name, _, path = spec.partition('=')
        where[name] = os.path.abspath(os.path.expanduser(path))
    rev = {v: 'HEAD' for v in VAULTS}
    for spec in args.rev:
        name, _, r = spec.partition('=')
        rev[name] = r
    sys.path.insert(0, forge)
    import numpy
    from forge.core.snippet_registry import SnippetRegistry
    from forge.core.graph_resolver import GraphResolver
    from forge.core.executor import resolve_action_code, exec_python, extract_python

    engine_sha = subprocess.run(['git', '-C', forge, 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
    out = {'engine_sha': engine_sha, 'seeds': SEEDS, 'vault_shas': {}, 'notes': {}}
    with tempfile.TemporaryDirectory() as root:
        for v in VAULTS:
            os.makedirs(os.path.join(root, v))
            arc = subprocess.run(['git', '-C', where[v], 'archive', rev[v]], capture_output=True, check=True).stdout
            subprocess.run(['tar', '-x', '-C', os.path.join(root, v)], input=arc, check=True)
            out['vault_shas'][v] = subprocess.run(['git', '-C', where[v], 'rev-parse', rev[v]], capture_output=True, text=True).stdout.strip()
        reg = SnippetRegistry()
        reg.scan(root)
        resolver = GraphResolver(reg)

        def run(rel, code, seed):
            random.seed(seed)
            numpy.random.seed(seed)
            _stdout, result = exec_python(code, {}, resolver=resolver, vault_path=os.path.join(root, rel.split('/')[0]), registry=reg,
                                          snippet_id=rel, domains=['music'], declared_inputs=[])
            return summarise(result)

        for rel in NOTES:
            text = open(os.path.join(root, rel + '.md'), encoding='utf-8').read()
            old_py = extract_python(text)
            new_py = resolve_action_code(resolver.resolve(rel), force=True)
            m = re.search(r'^# Recipe[ \t]*\n(.*?)(?=^# |\Z)', text, re.M | re.S)
            entry = {'old_note': text, 'recipe': (m.group(1) if m else '').strip(), 'old_python': old_py, 'new_python': new_py,
                     'old': {str(s): run(rel, old_py, s) for s in SEEDS}, 'new': {str(s): run(rel, new_py, s) for s in SEEDS}}
            same_each_seed = all(entry['old'][str(s)] == entry['new'][str(s)] for s in SEEDS)
            same_shape = all(entry['old'][str(s)]['staves'] == entry['new'][str(s)]['staves'] and entry['old'][str(s)]['notes'] == entry['new'][str(s)]['notes'] for s in SEEDS)
            entry['old_depends_on_seed'] = entry['old'][str(SEEDS[0])]['digest'] != entry['old'][str(SEEDS[1])]['digest']
            entry['verdict'] = 'identical' if same_each_seed else ('same-structure' if same_shape else 'different')
            out['notes'][rel] = entry
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, indent=1, sort_keys=True, ensure_ascii=False)
        fh.write('\n')
    print(json.dumps({k: {'verdict': v['verdict'], 'old_depends_on_seed': v['old_depends_on_seed'], 'old': v['old'], 'new': v['new']} for k, v in out['notes'].items()}, indent=1))


if __name__ == '__main__':
    main()
