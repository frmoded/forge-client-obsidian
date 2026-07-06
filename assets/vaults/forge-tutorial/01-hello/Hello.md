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

> Call [[print]] with text="hello, world".

Read it out loud — it almost reads like English, and that's the point. It says:
*call the thing named [[print]], and hand it the text "hello, world" as its
`text` argument.*

- **[[print]]** is a **call** — it names a piece you're using. `print` is a
  built-in piece that shows text as output. It shows up as a link: you're
  pointing at the `print` tool.
- **"hello, world"** is the **text** you're handing it. Text always goes in
  double quotes.
- The line starts with **Call** and ends with a **.** — every instruction does.

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
you only need **Call [[print]]** — the one construct in `hello_world`. You'll
see other palette entries like `Let`, `If`, `For each`, `Return` — ignore them
for now. We'll cover each one in later chapters (`Let` in [[Variables]],
`Return` in [[Functions]], `If` in [[Conditionals]], `For each` in [[Loops]]).

When you're ready, go to [[Variables]] — where we start giving names to things.
