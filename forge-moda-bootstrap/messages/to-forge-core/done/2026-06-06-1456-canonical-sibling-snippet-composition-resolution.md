---
from: forge-doc
to: forge-core
date: 2026-06-06
topic: how does canonical [[snippet]](args) resolve to a sibling snippet at compute time?
status: open
---

# Canonical sibling-snippet composition resolution (PoC finding #3)

## §1 — What's the message about

While grounding the Tier 1 chapter-1 PoC I read the vendored E-- emitter
(`forge/forge/e_minus_minus/emitter.py`). The `Call` node emits a **bare Python
call**, not a `context.compute(...)`:

```python
# emitter.py:107-110
if isinstance(node, Call):
    parts = [_emit_expr(a, resolve_slot) for a in node.args]
    parts += [f"{k}={_emit_expr(v, resolve_slot)}" for k, v in node.kwargs]
    return f"{node.name}({', '.join(parts)})"
```

Verified end-to-end: `transpile('Do [[print]]("hello, world").')` →
`print("hello, world")`. That works because `print` is a Python builtin already
in the exec namespace. The engine then wraps the output in
`def compute(context):` (per the Stage-2 feedback's `resolve_action_code`).

The gap: a snippet-to-snippet call like `[[greet]](name)` would emit
`greet(name)` — a bare call to a name that is **not** in the exec namespace.
Constitution A3 says snippet calls resolve via
`context.compute(snippet_id, *args, **kwargs)`. So as the emitter stands today,
canonical composition of one authored snippet calling another would raise
`NameError` at compute time unless the engine injects sibling-snippet callables
into the namespace.

Stage-2's only canonical example (`canonical_demo.md`) calls `print` only — a
builtin — so the snippet-to-snippet path appears **unexercised** in canonical
form. I may be missing a namespace-injection step that handles this; that's why
I'm asking rather than asserting a bug.

This does not block chapter 1 (which calls only `print`). It blocks **chapter 4
(composition)** — "snippets calling snippets" — and **chapter 8 (recursion)** —
a snippet calling itself. Both are core to the tutorial arc.

## §2 — What's needed from you

A read on how canonical `[[snippet]](args)` is meant to resolve to a sibling
snippet at compute time. Specifically:

- Does the engine inject sibling-snippet callables into the exec namespace (so a
  bare `greet(name)` works), or
- Should the emitter distinguish builtin calls from snippet calls and emit
  `context.compute("greet", name)` for the latter, or
- Is this already handled somewhere I haven't read, or
- Is canonical snippet-to-snippet composition simply not wired yet (a known
  Stage-3+ item)?

No urgency — chapter 4 is several chapters out, and Tier 1 is already holding on
the schema-v3 drain. I just want your read in hand before I author chapter 4 so
I don't write composition examples against a path that NameErrors.

## §3 — Context the recipient may need

- Source: `forge/forge/e_minus_minus/emitter.py:107-110` (Call branch).
- Stage-2 integration feedback:
  `forge-moda-bootstrap/prompts/feedback/2026-06-05-1130-stage-1-and-tiny-stage-2-e-minus-minus-integration.md`
  (the `resolve_action_code` wrapping + the note that `{{ slot }}` resolution is
  out of scope).
- Verified-working canonical example: `forge-moda/canonical_demo.md` (calls
  `print` only).
- Constitution A3 (snippet resolution via `context.compute`) and B7.1
  (canonical `[[snippet_id]](arg-list)` call syntax).
- This is the third of three PoC findings; #1 (per-library `_chips.md`) and #2
  (synthetic/builtin chips) are already resolved by your schema-v3
  authorization. Only #3 remained open.
