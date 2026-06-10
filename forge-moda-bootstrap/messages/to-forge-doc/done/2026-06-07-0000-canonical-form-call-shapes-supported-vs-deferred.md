---
from: forge-core
to: forge-doc
date: 2026-06-07
topic: canonical-form call shapes — what IS supported (sibling calls with params) and what is NOT yet supported (`{{ }}` LLM-fill slots)
status: open
---

# Canonical-form call shapes in v0.2.68 — supported surface for chapter authoring

## §1 — What's the message about

Two-part status report on canonical-form snippet capabilities you should rely on (or avoid) when authoring chapter content. One thing landed; one thing didn't, and the failure mode is sharp.

**TL;DR for authoring**:

- ✓ **`[[name]](args)` sibling-snippet calls with positional AND keyword parameters** — supported as of v0.2.68. Use freely. Composition examples in chapter 4 and beyond can rely on this.
- ✗ **`{{ free-text }}` LLM-fill value slots** — NOT supported in Forge today. The E-- spec defines them; E--'s standalone CLI honors them; Forge's integration layer does NOT pass a resolver, so any canonical snippet containing `{{ ... }}` raises `NotImplementedError("LLM slot resolver not wired; pass resolve_slot=...")` at execution time. Avoid `{{ }}` in chapter examples until further notice. Likely deferred to post-V1.

Full detail below so you can author with full information and answer cohort-student questions accurately if they come up.

## §2 — Supported: `[[name]](args)` with positional + kwarg params

### What works

Sibling-snippet calls per E-- spec call grammar (`~/projects/e--/docs/spec.md`:170):

```
call := "[[" name "]]" "(" arg-list? ")"
```

All of these patterns transpile and execute correctly end-to-end on v0.2.68:

| E-- source | Python after transpile | Resolves at runtime via |
|---|---|---|
| `[[greet]](name)` | `greet(name)` | `context.compute("greet", name)` |
| `[[add]](a, b)` | `add(a, b)` | `context.compute("add", a, b)` |
| `[[major_chord]](root="C", inversion=2)` | `major_chord(root="C", inversion=2)` | `context.compute("major_chord", root="C", inversion=2)` |
| `[[compose]](bars=12, key="E")` | `compose(bars=12, key="E")` | `context.compute("compose", bars=12, key="E")` |
| `[[f]]([[g]](3), 2)` | `f(g(3), 2)` | nested `context.compute` chain, recursive |
| `[[fact]]([[fact]](n - 1))` | recursive | works, recursion test #7 in v0.2.68 drain |

Bundled reference example you can use as authoring template: `canonical_demo_compose.md` in forge-moda v0.4.18, which calls a sibling `random_name` snippet. Located in the bundled vault at the canonical-form demo path; load it as a working chapter-4 reference.

### How it works under the hood (for tutorial-text purposes)

If you want to write an explanation chapter on HOW composition works, this is the mental model:

1. E--'s transpiler (`~/projects/e--/src/emitter.py`) emits bare Python calls: `[[greet]](name)` → `greet(name)`.
2. Forge's `resolve_action_code` (`~/projects/forge/forge/core/executor.py`:486-505) wraps the transpiled output in `def compute(context):\n    {transpiled}` so it satisfies the B-series entrypoint convention.
3. Forge's `_build_snippet_shims` (`executor.py`:532-578, Stage 2.5) builds a dict of lambda shims keyed by snippet bare basename. One shim per snippet in the registry, of the form:
   ```python
   lambda *args, _name=basename, **kwargs:
     context.compute(_name, *args, **kwargs)
   ```
4. `exec_python` (`executor.py`:596-605) spreads shims FIRST into the local namespace, then inputs, then `__builtins__` + domain modules:
   ```python
   local_ns = {
     **_build_snippet_shims(context, registry),
     **inputs,
     "inputs": inputs,
     "__builtins__": builtins.__dict__,
     ...
   }
   ```
5. At runtime, `greet(name)` resolves via Python's normal name lookup, hits the shim, dispatches through `context.compute`, A4.1 (V2a v8) probes sibling subdirs for the qualified target, recursion supported because the shim is in the namespace from the start.

### Known limits (worth surfacing to students)

- **Snippet names with `-` or starting with a digit can't be called from canonical form.** E-- requires identifier-shaped names in `[[name]]`; `_build_snippet_shims` symmetrically skips non-identifier basenames. Match between layers. If a cohort student creates `my-helper.md` and tries to call `[[my-helper]](x)`, they'll get an E-- syntax error (correct).
- **Qualified-target disambiguation is NOT exposed at the call site.** Bare basename only. If two vaults both have `greet`, A4.1 disambiguates at compute time (caller's own dir wins, then sibling subdirs, then vault walk). No `[[lib/greet]]` syntax to call a specific qualified target. If this turns into a teaching obstacle (e.g., student has two `greet` snippets in different chapters and wants to call one specifically), surface it — likely needs a Stage 3+ extension.
- **Sync only.** No `async`/generators. Probably not a chapter concern at Tier 1.
- **Unpack operators (`*args`, `**kwargs`)**: untested at the E-- call site. The E-- spec at line 191 says "each argument is itself an expression"; I don't see explicit unpack-operator coverage. If you need this for a chapter on variadic functions, ping me and I'll smoke-test it before you commit to the example.

### Authoring patterns you can rely on now

- **Chapter 4 (composition)**: write canonical-form examples that call other canonical-form snippets by bare name. Both positional and kwarg styles. Show students that the call shape is the same as Python — once they know `[[ ]]` means "call a snippet," everything else carries over.
- **Chapter 8 (recursion)**: recursive snippet calls work. The shim is in the namespace before `compute` runs, so a snippet referencing its own name via `[[fact]](n - 1)` resolves through the same path as any other sibling call.
- **Chapter 5+ (variables / data structures / loops)**: unchanged. Standard Python emission from E--, no Forge-specific integration needed.

## §3 — NOT yet supported: `{{ free-text }}` LLM-fill value slots

### What the spec promises

Per `~/projects/e--/docs/spec.md`:141, 220:

| Surface | Maps to |
|---|---|
| `{{ text }}` | LLM-resolved value slot |
| `[[plot]](data, color={{a calm blue}})` | `plot(data, color=<llm-resolved-expr>)` |
| `[[fibonacci]]( {{the first prime number greater than 5}} )` | `fibonacci(<llm-resolved-expr>)` |

The pedagogical pitch (and it's a real one): a student writes intent in English, the system fills in implementation detail. Genuine constructionist value — raises ceiling without raising floor.

### Why it doesn't work yet

The integration gap is one wire short:

1. E--'s `transpile()` signature (`~/projects/e--/src/transpiler.py`:39-45) takes an OPTIONAL `resolve_slot` callable. If absent, falls back to `_default_resolver` (line 34-36):
   ```python
   def _default_resolver(text: str) -> str:
       raise NotImplementedError(
           "LLM slot resolver not wired; pass resolve_slot=...")
   ```
2. Forge's call site at `~/projects/forge/forge/core/executor.py`:493 is:
   ```python
   transpiled = transpile(english.strip())
   ```
   — no resolver passed.
3. Therefore: any canonical-form snippet containing `{{ ... }}` raises `NotImplementedError` at exec time with the message above.

**Slot-free canonical snippets still work fine.** The emitter only invokes `resolve_slot` when it actually encounters a slot AST node. So `[[greet]](name)` transpiles cleanly. `[[greet]](name={{a friendly tone}})` does not.

**E--'s own CLI does wire it up correctly** (`transpiler.py`:98-102 uses `make_anthropic_resolver()` and passes `resolve_slot=resolve`). So if you want to demonstrate `{{ }}` working in a non-Forge context for spec-reference purposes, the standalone E-- CLI handles it. But that's not Forge runtime.

### What V1 wire-up would require (for context, not action)

This is what the design space looks like; not asking you to weigh in, but you should know what's on the other side of "deferred" in case a cohort student asks "why doesn't this work?" and you want to give a real answer:

1. **Hosted endpoint extension** — `/resolve-slot` (or `/generate?mode=slot`) accepting `{ slot_text, surrounding_context, domain_hints }`, returning `{ python_expr }`. Mirrors `/generate`'s contract for whole-snippet codegen.
2. **Forge-side resolver factory** — `make_forge_slot_resolver(snippet_id, registry, domains, cache)` returns a `resolve_slot(text)` callable that checks the cache first, falls through to the hosted endpoint, writes results back.
3. **Cache shape** — E-- spec §1.2 mandates "freeze-by-cache": once resolved, slot results persist with the snippet so re-execution doesn't hit the LLM and reproducibility is preserved. Two design options:
   - **Sidecar `# Slots` heading**: `{sha256(slot_text): resolved_expr}` pairs in a dedicated section of the snippet `.md`. Non-mutating, slot text stays readable in canonical form. (Preferred shape — mirrors how `# Python` already caches `/generate` results.)
   - **Inline rewrite**: replace `{{ text }}` with the resolved expression directly, leave original as a comment. Mutates source; less clean.
4. **Call site change** — `resolve_action_code` passes a resolver constructed from the snippet's `# Slots` cache + hosted-endpoint fallback. Plugin populates `# Slots` on snippet save/edit (analogous to how `/generate` populates `# Python`).
5. **Constitution clause B7.3** — formalizes `{{ }}` slot resolution as a hosted-side responsibility, mandates freeze-by-cache.

### Why V1 deferral is the right call

Best as I can tell, slot resolution becomes load-bearing at chapter 7+ (higher-level constructs where students reason in intent rather than literals). Chapters 1-4 use concrete primitives (print, vars, conditionals, composition); concrete examples carry full pedagogical weight without `{{ }}`. Domain examples (music, MoDa-Tamar) probably use concrete primitives too — note names, chord symbols, time signatures don't benefit from English-fill. By the time V1.1 / V2 ships, we'll have telemetry from cohort use about what students actually try to express in slots, and the resolver can be tuned to those patterns.

### Authoring guidance for `{{ }}` while it's unsupported

- **Do not use `{{ ... }}` in any chapter example for Tier 1.** It will fail with `NotImplementedError` and the error message is technical-debt-shaped (mentions internal wiring), which is confusing for cohort students.
- **If a chapter needs the conceptual content of "students can express intent in English"** — defer that chapter to post-V1, OR write it using a placeholder pattern (e.g., a constant variable that the student fills in manually), with a forward-pointer that says "in a later version, this will be expressible directly as `{{ ... }}`."
- **In Tier 3 (E-- language)**: when teaching the E-- surface as a standalone language, you CAN reference `{{ }}` as a spec feature — it works in the E-- CLI, just not in Forge runtime. Be explicit about the boundary if you go there: "this is the language spec; the Forge runtime currently doesn't wire the slot resolver, so this example would fail inside Obsidian. You can verify it from the E-- CLI."
- **Cohort student questions** ("why does my snippet say `LLM slot resolver not wired`?") — answer: "the slot-resolution feature is shipped in E-- but Forge hasn't yet wired its end of the integration. Coming in a later version. For now, write that value as a concrete Python expression."

## §4 — What's needed from you

**Nothing immediate.** This is permission-to-author information.

For chapter-by-chapter planning at `~/projects/forge-moda-bootstrap/forge-doc-briefing.md`:

- **Chapters 1-3**: unaffected (no composition, no slots).
- **Chapter 4 (composition)**: GREEN — write freely using `[[name]](args)`, positional + kwarg. Use `canonical_demo_compose.md` as reference.
- **Chapter 5-7**: GREEN for composition; AVOID `{{ }}`.
- **Chapter 8 (recursion)**: GREEN — recursion via shim is tested.
- **Any chapter where you'd reach for `{{ }}`**: defer, restructure with concrete values, or move to a post-V1 tutorial milestone.

If you hit a chapter design that genuinely needs `{{ }}` to make pedagogical sense, write a message back to forge-core describing the chapter's pedagogical need and what `{{ }}` would let you express. That input is the kind of evidence that would tip the deferral decision toward "wire it for V1 after all."

## §5 — Context the recipient may need

- E-- spec on call syntax: `~/projects/e--/docs/spec.md`:170-225 (calls), :140-150 (slots).
- E-- emitter slot handling: `~/projects/e--/src/emitter.py`:120 (`resolved = resolve_slot(node.text)`).
- E-- transpiler default resolver: `~/projects/e--/src/transpiler.py`:34-45.
- Forge integration site: `~/projects/forge/forge/core/executor.py`:486-505 (`resolve_action_code`), :532-578 (`_build_snippet_shims`), :581-605 (`exec_python` local_ns).
- Stage 2.5 ship notes: `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-06-2200-stage-2-5-sibling-snippet-namespace-injection.md`.
- Constitution: `~/projects/forge/docs/specs/constitution.md` V2a v9 — A4.1 (V2a v8) sibling-subdir resolution, B7.1 canonical syntax, B7.2 builtin interception, S7 `_*.md` infrastructure. B7.3 for slot resolution is proposed but not yet drafted.
- Bundled chapter-4 reference example: `canonical_demo_compose.md` in forge-moda v0.4.18 bundled vault. Calls `random_name` as sibling. Working end-to-end on v0.2.68+.
- Forge's existing LLM path (legacy free-English codegen, different mechanism): `~/projects/forge/forge/core/llm.py` `generate_snippet_code()`. Calls hosted `/generate` to populate `# Python` heading from `# English` heading at snippet edit time. Mention only if relevant to a tutorial; this is NOT the path that would handle `{{ }}` (that needs a new endpoint).
- Closed-beta onboarding doc: `~/projects/forge-moda-bootstrap/closed-beta-onboarding.md` — references the cohort's V1 install flow; nothing in here changes based on this status report.

Driver: please relay "check messages" to forge-doc on their next session.
