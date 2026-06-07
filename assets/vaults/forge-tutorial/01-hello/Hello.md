# Chapter 1 — Hello

The oldest tradition in programming: make the computer say hello.

Open the **hello_world** snippet and **Forge** (🔥) it. You'll see:

```
hello, world
```

That's it. You ran a program.

## What you're looking at

Open the **hello_world** snippet and look at it. A Forge snippet has two parts.

**The frontmatter** — the block fenced by `---` at the very top:

```
type: action
inputs: []
facet_form: canonical
description: Your very first Forge snippet...
```

This is the snippet's label. `type: action` means it *does* something (as
opposed to just holding a value). `inputs: []` means it asks you for nothing.
You can ignore the rest for now.

**The English** — under the `# English` heading:

```
Do [[print]]("hello, world").
```

That one line is the whole program. Read it out loud — it almost reads like
English, and that's the point. It means: *do the thing called `print`, and hand
it the text `"hello, world"`.*

- `[[print]]` is a **call** — double square brackets name a piece you're using.
  `print` is a built-in piece that shows text as output.
- `"hello, world"` is the **text** you're handing it. Text always goes in
  double quotes.
- The line starts with `Do` and ends with a `.` — every instruction does.

> **Heads up — what you'll see in Obsidian.** In Obsidian's default *Live
> Preview*, the `[[ ]]` brackets are styled away, so this line shows up as
> `Do print("hello, world").` with no brackets. They're still in the file —
> Obsidian just hides them. To see snippets exactly as they're written in this
> tutorial, switch your editor to **Source mode**: open the command palette
> (`Cmd-P` on macOS, `Ctrl-P` on Windows/Linux) and run *"Toggle Live
> Preview/Source mode"*. (`Cmd-E` / `Ctrl-E` flips between editing and reading
> views — useful, but it doesn't reveal the brackets; Source mode is the one
> that does.)

When you Forge (the 🔥 button), Forge reads that English, turns it into
something the computer runs, and shows you the result. No magic, just
translation.

## Exercise

Change the message. In the **hello_world** snippet, replace `"hello, world"` with your own
text — your name, a greeting, anything — keeping the double quotes:

```
Do [[print]]("hello, Tamar").
```

Forge again. The output changes to match. That's the loop you'll use for
the whole tutorial: **change one thing, Forge it, see what happened.**

When you're ready, go to [[Variables]] — where we start giving names to things.
