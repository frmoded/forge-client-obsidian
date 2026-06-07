# Chapter 9 — Slots

Every value so far, you wrote yourself: `"Ada"`, `72`, `<3, 2, 1>`. This last
chapter is the fun one. You can leave a value *blank* — describe what you want
in plain English — and Forge fills it in for you.

Open the **octopus_fact** snippet and **Forge** (🔥) it. You'll see something
like:

```
Octopuses have three hearts.
```

You didn't type that fact. Forge did.

## What's new

Look at the English:

```
Set fact to {{an interesting fact about octopuses}}.
Do [[print]](fact).
```

The new piece is `{{ … }}` — a **value slot**. Inside the double curly braces
you write a *request* in plain English instead of a value. When you Forge-click,
Forge reads your request, figures out a value that fits, and drops it in. Here it
filled `fact` with a real fact about octopuses, then printed it.

This is the whole idea of Forge in one line: you say what you want; Forge helps
make it real.

## Where the answer goes

Forge-click `octopus_fact` once, then **look at the snippet again**. Something
changed: a new `# Python` section appeared at the bottom, holding the answer
Forge filled in.

That's on purpose. Filling a slot takes a real moment of thinking, so Forge does
it **once**, writes the answer into `# Python`, and remembers it. Click again and
it's instant — Forge reads the saved answer instead of working it out afresh.
(Your earlier snippets never grew a `# Python` section because they had nothing
to remember — they're worked out fresh every time, which is quick and free.)

So a slot is asked *once* and then frozen: re-running gives the same fact, every
time. Change the English, though — including the words inside the slot — and
Forge knows the request is different and fills it in anew.

## Exercise

Change `octopuses` to something you're curious about — `volcanoes`, `the moon`,
your favorite animal:

```
Set fact to {{an interesting fact about volcanoes}}.
```

**Forge** 🔥 it again. Because you changed the English, Forge fills the slot
afresh — a brand-new fact, about your new subject. That's the loop you've used
the whole tutorial — *change one thing, Forge it, see what happened* — now with
Forge doing some of the writing for you.

## If you want to overrule Forge (optional, advanced)

Don't like the answer Forge picked? You can replace it. This one's for the
curious, because it means stepping out of English for a moment and into the
`# Python` section, which is real code:

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

From here, the wide walls open up: the music and simulation domains let you
compose songs and run models with the very same snippets-and-Forge-clicks you
already know. Go make something you care about.
