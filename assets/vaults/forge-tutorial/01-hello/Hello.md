# Chapter 1 — Hello

The oldest tradition in programming: make the computer say hello.

Open the [[hello_world]] note and **run** it. You'll see:

```
hello, world
```

That's it. You ran a program.

> **Tip:** open a note in its own tab — middle-click it in the file list, or
> right-click it → *Open in new tab* — to keep this lesson and the note side
> by side.

## What you're looking at

Open the [[hello_world]] note and look at it. A note has two parts that matter
here: the frontmatter and the Recipe.

**The frontmatter** — the little block at the very top, between the `---` lines —
is just the note's label. It says `type: action` (this note *does* something).
There's no `Input` declaration in the Recipe below, so it asks you for nothing.
You can ignore the rest for now.

**The Recipe** — under the *Recipe* heading — is the whole program, and it's
one line:

> Return "hello, world".

Read it out loud — it almost reads like English, and that's the point. It says:
*hand back the text "hello, world" as this note's result.*

- **Return** is the **output verb** — the word that tells the engine what this
  note hands back when you run it. Every note that produces a result uses
  `Return`.
- **"hello, world"** is the **text** being returned. Text always goes in double
  quotes.
- The line starts with **Return** and ends with a **.** — every instruction does.

When you run it, the engine reads that Recipe, works out what to do, and shows
you the result.

## Exercise

In the [[hello_world]] note, replace `"hello, world"` with your own text —
your name, a greeting, anything — keeping the double quotes. Then run it again.
The output changes to match.

That's the loop you'll use for the whole tutorial: **change one thing, run it,
see what happened.**

## One more experiment

Earlier this chapter said the note has two parts that matter *here*. There's
a third: above the Recipe, under the *Description* heading, is a sentence in
plain English. The **hammer** button asks an AI to re-derive the Recipe from
those words — change a word there and press it.

Notice the Recipe may **snap to something new** rather than change slightly:
your prose is interpreted, not copied. When you want an exact string, say it
in the Recipe — that layer does exactly what it says.

> **Putting it back:** the hammer overwrites the one-line Recipe you just
> read. When you're done experimenting, type `Return "hello, world".` back
> into the Recipe. That layer is yours to write by hand, always.

## Palette focus

The chip palette on the right shows every construct available. In this chapter
you only need **Return** — the one construct in [[hello_world]]. You'll see other
palette entries like `Let`, `If`, `For each`, `Call` — ignore them for now.
We'll cover each one in later chapters (`Let` in [[Variables]], `Call` in
[[Functions]], `If` in [[Conditionals]], `For each` in [[Loops]]).

**What's next:** [[hello_world]]
