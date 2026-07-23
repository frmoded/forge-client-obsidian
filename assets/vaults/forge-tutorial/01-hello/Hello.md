# Chapter 1 — Hello

The oldest tradition in programming: make the computer say hello.

Open the **hello_world** note and **Forge** (🔥) it. You'll see:

```
hello, world
```

That's it. You ran a program.

> **Tip:** open a note in its own tab — middle-click it in the file list, or
> right-click it → *Open in new tab* — to keep this lesson and the note side
> by side.

## What you're looking at

Open the **hello_world** note and look at it. A note has two parts that matter
here: the frontmatter and the Recipe.

**The frontmatter** — the little block at the very top, between the `---` lines —
is just the note's label. It says `type: action` (this note *does* something)
and `inputs: []` (it asks you for nothing). You can ignore the rest for now.

**The Recipe** — under the *Recipe* heading — is the whole program, and it's
one line:

> Return "hello, world".

Read it out loud — it almost reads like English, and that's the point. It says:
*hand back the text "hello, world" as this note's result.*

- **Return** is the **output verb** — the word that tells Forge what this note
  hands back when you 🔥 it. Every note that produces a result uses `Return`.
- **"hello, world"** is the **text** being returned. Text always goes in double
  quotes.
- The line starts with **Return** and ends with a **.** — every instruction does.

When you Forge it (the 🔥 button), Forge reads that Recipe, works out what to
run, and shows you the result.

## Exercise

In the **hello_world** note, replace `"hello, world"` with your own text —
your name, a greeting, anything — keeping the double quotes. Then Forge it again.
The output changes to match.

That's the loop you'll use for the whole tutorial: **change one thing, Forge it,
see what happened.**

## Palette focus

The chip palette on the right shows every construct available. In this chapter
you only need **Return** — the one construct in `hello_world`. You'll see other
palette entries like `Let`, `If`, `For each`, `Call` — ignore them for now.
We'll cover each one in later chapters (`Let` in [[Variables]], `Call` in
[[Functions]], `If` in [[Conditionals]], `For each` in [[Loops]]).

When you're ready, go to [[Variables]] — where we start giving names to things.
