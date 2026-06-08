# Chapter 9 — Slots

Every value so far, you wrote yourself: `"Ada"`, `72`, `<3, 2, 1>`. This last
chapter is the fun one. You can leave a value *blank* — describe what you want in
plain English — and Forge fills it in for you.

Open the **octopus_fact** snippet and **Forge** (🔥) it. You'll see something
like:

```
Octopuses have three hearts.
```

You didn't type that fact. Forge did.

## What's new

Open the snippet and look. The key line is:

> Set fact to {{an interesting fact about octopuses}}.

The new piece is `{{ … }}` — a **value slot**. Inside the double curly braces you
write a *request* in plain English instead of a value. When you Forge it, Forge
reads your request, works out a value that fits, and drops it in — here it filled
`fact` with a real octopus fact, and the next line printed it with [[print]].

This is the whole idea of Forge in one line: you say what you want; Forge helps
make it real.

## Where the answer goes

Forge the **octopus_fact** snippet once, then **look at it again**. Something
changed: a new `# Python` section appeared at the bottom.

Here's what happened. To run your snippet, Forge first **translates** your
English into code it can run. The first time, it reaches your `{{ … }}` slot and
asks the LLM to fill it in — and *that's the only moment the LLM is involved, and
it happens before the snippet runs, not while it runs.* Forge splices the answer
into the translated code, saves that code in the `# Python` section, and
remembers it.

After that, clicking Forge is **instant**: Forge reads the remembered code and
just runs it — no LLM, no re-translating. So a filled slot is asked once and then
settled: re-running gives the same fact, for free, every time. (Your earlier
snippets never grew a `# Python` section because they had nothing to remember —
they're translated fresh on every click, which is fast and free. It's the LLM
step that costs effort, and only slots need it.)

Change the English, though — including the words inside the slot — and Forge sees
the request is different, asks the LLM again, and fills it in anew.

> **If a slot snippet ever feels slow** after you edit it, peek at its
> frontmatter (the block between the `---` lines at the top) and check that the
> line `facet_form: canonical` is still there. Obsidian sometimes drops it when
> you edit a snippet, which makes Forge re-translate on every click instead of
> using the remembered answer. Add the line back and it's quick again.

## Exercise

Change `octopuses` to something you're curious about — volcanoes, the moon, your
favorite animal:

> Set fact to {{an interesting fact about volcanoes}}.

**Forge** 🔥 it again. Because you changed the English, Forge fills the slot
afresh — a brand-new fact about your new subject. Same loop as always — *change
one thing, Forge it, see what happened* — now with Forge doing some of the
writing for you.

## If you want to overrule Forge (optional, advanced)

Don't like the answer Forge picked? You can replace it. This one's for the
curious, because it means stepping out of English and into the `# Python`
section, which is real code:

1. In the frontmatter at the top, add a line: `edit_mode: python`.
2. In the `# Python` section, change the saved value to whatever you want.

Now your edit is the source of truth, and Forge won't touch it. It's a peek at
the ceiling — you never *have* to do this, but it's there when you want full
control.

## That's the tour

You started by making the computer say hello. Nine chapters later you're naming
values, writing your own snippets, composing them, branching, looping, holding
data, recursing — and now handing part of the work to Forge itself. Everything
else you build is these same pieces, combined your way.

From here the wide walls open up: the music and simulation domains let you
compose songs and run models with the very same snippets-and-Forge-clicks you
already know. Go make something you care about.
