# Chapter 1 — Hello

The oldest tradition in programming: make the computer say hello.

Open the **hello_world** snippet and **Forge** (🔥) it. You'll see:

```
hello, world
```

That's it. You ran a program.

> **Tip:** open a snippet in its own tab — middle-click it in the file list, or
> right-click it → *Open in new tab* — to keep this lesson and the snippet side
> by side.

## What you're looking at

Open the **hello_world** snippet and look at it. A snippet has two parts.

**The frontmatter** — the little block at the very top, between the `---` lines —
is just the snippet's label. It says `type: action` (this snippet *does*
something) and `inputs: []` (it asks you for nothing). You can ignore the rest
for now.

**The English** — under the *English* heading — is the whole program, and it's
one line:

> Do [[print]]("hello, world").

Read it out loud — it almost reads like English, and that's the point. It says:
*do the thing called [[print]], and hand it the text "hello, world".*

- **[[print]]** is a **call** — it names a piece you're using. `print` is a
  built-in piece that shows text as output. It shows up as a link: you're
  pointing at the `print` tool.
- **"hello, world"** is the **text** you're handing it. Text always goes in
  double quotes.
- The line starts with **Do** and ends with a **.** — every instruction does.

When you Forge it (the 🔥 button), Forge reads that English, works out what to
run, and shows you the result.

## Exercise

In the **hello_world** snippet, replace `"hello, world"` with your own text —
your name, a greeting, anything — keeping the double quotes. Then Forge it again.
The output changes to match.

That's the loop you'll use for the whole tutorial: **change one thing, Forge it,
see what happened.**

When you're ready, go to [[Variables]] — where we start giving names to things.
