#!/usr/bin/env python3
"""Drain 2026-10-19-0900 §1 — record what the REAL engine hands the plugin when a shipped library note is transpiled.

The hammer click on a library note calls `resolve_action_code(snippet, force=True)` and writes the returned Python back into the note's
`# Python` section (writeSourcePythonBack). Tests that build that Python by hand cannot see how the engine really ends its output; this
records the real thing so `src/python-write-back-real-engine.test.ts` can feed it to the plugin's writer over the SHIPPED bytes.

Usage (run with the engine's own virtualenv, which has PyYAML):
  ~/projects/forge/.venv/bin/python scripts/record-engine-transpile.py [--forge ~/projects/forge] [--vault NAME=PATH]... [--out test/fixtures/engine-transpile/shipped-notes.json]
Each note that already has a `# Python` section also carries its committed bytes (`note`), so the test does not depend on a
working tree that sync or a hammer click has since touched. The vaults are read from the sibling repos' committed HEAD (`git archive HEAD`), never their working trees, so a dirty checkout cannot
leak into the fixture. Notes the engine cannot transpile here (they need music21, which is Pyodide-only on this machine) are listed
under "unavailable" so the test can say what it did not cover.
"""
import argparse, json, os, re, subprocess, sys, tempfile

VAULTS = ['forge-tutorial', 'music-theory', 'forge-moda', 'music-core']


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.dirname(here)
    ap = argparse.ArgumentParser()
    ap.add_argument('--forge', default=os.path.join(repo, '..', 'forge'))
    ap.add_argument('--vault', action='append', default=[], metavar='NAME=PATH',
                    help='read vault NAME from this checkout instead of the sibling repo (repeatable); its committed HEAD is what is recorded')
    ap.add_argument('--out', default=os.path.join(repo, 'test', 'fixtures', 'engine-transpile', 'shipped-notes.json'))
    args = ap.parse_args()
    forge = os.path.abspath(args.forge)
    where = {v: os.path.abspath(os.path.join(repo, '..', v)) for v in VAULTS}
    for spec in args.vault:
        name, _, path = spec.partition('=')
        where[name] = os.path.abspath(os.path.expanduser(path))
    sys.path.insert(0, forge)
    from forge.core.snippet_registry import SnippetRegistry
    from forge.core.graph_resolver import GraphResolver
    from forge.core.executor import resolve_action_code

    engine_sha = subprocess.run(['git', '-C', forge, 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
    notes, unavailable = {}, {}
    with tempfile.TemporaryDirectory() as root:
        shas = {}
        for v in VAULTS:
            src = where[v]
            os.makedirs(os.path.join(root, v))
            arc = subprocess.run(['git', '-C', src, 'archive', 'HEAD'], capture_output=True, check=True).stdout
            subprocess.run(['tar', '-x', '-C', os.path.join(root, v)], input=arc, check=True)
            shas[v] = subprocess.run(['git', '-C', src, 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
        reg = SnippetRegistry()
        reg.scan(root)
        resolver = GraphResolver(reg)
        for dp, _dn, fn in sorted(os.walk(root)):
            for f in sorted(fn):
                if not f.endswith('.md'):
                    continue
                p = os.path.join(dp, f)
                rel = os.path.relpath(p, root)[:-3]
                txt = open(p, encoding='utf-8').read()
                if not re.search(r'^type:\s*action', txt, re.M):
                    continue
                m = re.search(r'^# Recipe[ \t]*\n(.*?)(?=^# |\Z)', txt, re.M | re.S)
                try:
                    py = resolve_action_code(resolver.resolve(rel), force=True)
                except Exception as e:  # noqa: BLE001 — recorded, not hidden
                    unavailable[rel] = type(e).__name__ + ': ' + str(e)[:120]
                    continue
                if py is None:
                    unavailable[rel] = 'engine returned None (not E-- compilable)'
                    continue
                has_python = re.search(r'^# Python[ \t]*$', txt, re.M) is not None
                notes[rel] = {'recipe': (m.group(1) if m else '').strip(), 'python': py}
                if has_python:
                    notes[rel]['note'] = txt          # the committed bytes the plugin would be rewriting
    # The gate (check-open-time-writes) refuses a recording whose digest differs from the BUNDLED engine's: same scope rule as the sync script.
    digest = subprocess.run(
        ['node', '--no-warnings', '--experimental-strip-types', os.path.join(here, 'engine-bundle-digest.mjs'), os.path.join(forge, 'forge')],
        capture_output=True, text=True, check=True).stdout.strip()
    out = {'engine_sha': engine_sha, 'engine_bundle_digest': digest, 'vault_shas': shas, 'notes': notes, 'unavailable': unavailable}
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, indent=1, sort_keys=True, ensure_ascii=False)
        fh.write('\n')
    print(f'{len(notes)} notes recorded, {len(unavailable)} unavailable -> {args.out}')


if __name__ == '__main__':
    main()
