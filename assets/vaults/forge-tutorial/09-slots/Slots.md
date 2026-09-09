*Chapter 9*

Every value so far, you wrote yourself: `"Ada"`, `72`, `<3, 2, 1>`. This last
chapter is the fun one. You can leave a value *blank* — describe what you want in
plain English — and the engine fills it in for you.

Open the [[octopus_fact]] note and **run** it. You'll see something
like:

```
Octopuses have three hearts.
```

You didn't type that fact. The engine did.

## What's new - The {{ }} value slot

Open the note and look. The key line is:

> Let fact = {{a random fun fact about octopuses}}.

The new piece is `{{ … }}` — a **value slot**. Inside the double curly braces you
write a *request* in plain English instead of a value. When you run it, the
engine reads your request, works out a value that fits, and drops it in — here
it filled `fact` with a real octopus fact, and the next line returned it.

This is the whole idea in one line: you say what you want; the engine helps
make it real.

## Where the answer goes

You've seen a `# Python` section in every note so far — it's the code that
runs, translated from your Recipe. In earlier chapters that translation is
**automatic and exact**, so the engine could redo it any time for free.

A slot note is different. **Run [[octopus_fact]] first if you haven't, then**
open its `# Python` — where `{{ … }}` was, there's now an actual fact, because
the **LLM had to think it up**. That takes a real moment, so the engine asks
**once**, when it first translates the Recipe, and **saves the answer** —
it never asks again unless you change the Recipe, including the words inside
the slot.

## Exercise - Ask about something else

Change `octopuses` to something you're curious about — volcanoes, the moon, your
favorite animal:

> Let fact = {{an interesting fact about volcanoes}}.

**Run** it again. Because you changed the Recipe, the engine fills the slot
afresh — a brand-new fact about your new subject. Same loop as always — *change
one thing, run it, see what happened* — now with the engine doing some of the
writing for you.

## If you want to overrule it (optional, advanced)

Don't like the answer it picked? You can replace it directly by editing the
Python facet. Once you hand-edit that code, the plugin treats your edit as
authoritative and won't overwrite it the next time the note runs. It's a peek
at the ceiling — you never *have* to do this, but it's there when you want
full control.

## That's the tour

You started by making the computer say hello. Nine chapters later you're naming
values, writing your own notes, composing them, branching, looping, holding
data, recursing — and now handing part of the work to the engine itself.
Everything else you build is these same pieces, combined your way.

From here the wide walls open up: the music and simulation domains let you
compose songs and run models with the very same notes-and-clicks you already
know. Go make something you care about.

**Next Lesson:** none — that's the whole tutorial. Nicely done.
