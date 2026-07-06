# Chapter 9 — Slots

Every value so far, you wrote yourself: `"Ada"`, `72`, `<3, 2, 1>`. This last
chapter is the fun one. You can leave a value *blank* — describe what you want in
plain English — and Forge fills it in for you.

Open the **octopus_fact** note and **Forge** (🔥) it. You'll see something
like:

```
Octopuses have three hearts.
```

You didn't type that fact. Forge did.

## What's new

Open the note and look. The key line is:

> Let fact = {{an interesting fact about octopuses}}.

The new piece is `{{ … }}` — a **value slot**. Inside the double curly braces you
write a *request* in plain English instead of a value. When you Forge it, Forge
reads your request, works out a value that fits, and drops it in — here it filled
`fact` with a real octopus fact, and the next line printed it with [[print]].

This is the whole idea of Forge in one line: you say what you want; Forge helps
make it real.

## Where the answer goes

You've seen a `# Python` section in every note so far — it's the code Forge
runs, translated from your Recipe. In the earlier chapters that translation is
**automatic and exact**: the same Recipe always becomes the same Python, with no
thinking required, so Forge could re-make it any time for free.

A slot note's `# Python` is different — open **octopus_fact** and look at it.
Where your `{{ … }}` was, there's now an actual fact, written right into the code.
That fact wasn't a mechanical translation: the **LLM had to think it up** to fill
the slot. And because thinking it up takes a real moment, Forge asks **once** —
when it first translates your Recipe — and **saves the answer** there, so it
never has to ask again. (That's the only time the LLM is involved, and it happens
before the note runs, not while it runs.)

That's the whole point: a slot note's `# Python` is a *remembered answer*, not
just a translation. Run it again and it's instant — Forge reads the saved fact,
no LLM, for free, the same every time. Change the Recipe, though — including the
words inside the slot — and Forge sees a new request, asks the LLM again, and
saves the new answer.

## Exercise

Change `octopuses` to something you're curious about — volcanoes, the moon, your
favorite animal:

> Let fact = {{an interesting fact about volcanoes}}.

**Forge** 🔥 it again. Because you changed the Recipe, Forge fills the slot
afresh — a brand-new fact about your new subject. Same loop as always — *change
one thing, Forge it, see what happened* — now with Forge doing some of the
writing for you.

## If you want to overrule Forge (optional, advanced)

Don't like the answer Forge picked? You can replace it directly by editing the
Python facet. Under the hexa-state visibility contract (see the state suffix
legend in the plugin's INSTALL.md), editing the Python body flips that facet to
`— source` — the plugin recognizes your hand-edit as authoritative and won't
overwrite it on the next forge. It's a peek at the ceiling — you never *have* to
do this, but it's there when you want full control.

## Palette focus

Slots introduce **`{{ ... }}`** — a Recipe-level value slot filled by the LLM
at forge time and cached in the Python facet. No new palette-clickable
construct; the syntax is written by hand inside a `Let ... = ...` line or
inline in a `Call [[...]]` argument.

## That's the tour

You started by making the computer say hello. Nine chapters later you're naming
values, writing your own notes, composing them, branching, looping, holding
data, recursing — and now handing part of the work to Forge itself. Everything
else you build is these same pieces, combined your way.

From here the wide walls open up: the music and simulation domains let you
compose songs and run models with the very same notes-and-Forge-clicks you
already know. Go make something you care about.
