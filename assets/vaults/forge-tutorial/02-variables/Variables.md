# Chapter 2 — Variables

In chapter 1 you printed a fixed message. This time, let's give values names so
we can build with them.

Open the **greeting** note and **Forge** (🔥) it. You'll see:

```
Hello, Ada
```

## What's new

Open the note and look — it does three small things, each on its own line:

- it names a value: `Let name = "Ada"` makes a box called `name` holding the
  text `"Ada"`;
- it builds a greeting: `Let greeting = "Hello, " + name` — and **`+`**
  joins two pieces of text, so this becomes `"Hello, Ada"`;
- it prints the result with [[print]].

Two new ideas, both small:

- **Let … = …** gives a value a name. Now you can use the name instead of
  typing the value again.
- **`+`** joins two pieces of text. (You'll meet it again with numbers, where
  it adds.)

Notice [[print]] is handed `greeting` with **no quotes** — because `greeting`
is a *name* standing for a value, not the literal word "greeting". Quotes mean
"the exact text"; no quotes means "the value with this name".

> The **Let** chip is now in your 🔥 palette — click it to drop a fresh
> `Let … = …` line into any note.

## Exercise

Open the **greeting** note, change `"Ada"` to your own name, and Forge again —
the greeting follows. Then try changing `"Hello, "` to `"Hi there, "`. Two boxes,
one result: that's what variables buy you.

## Palette focus

Focus on **Let** and **Call [[print]]** for this chapter. The `Let ... = ...`
construct binds a name to a value — you'll see it twice in `greeting`. Ignore
`Return`, `If`, `Otherwise`, `For each` for now — those come in later chapters
([[Functions]], [[Conditionals]], [[Loops]]).

When you're ready, go to [[Functions]] — where you make your own reusable steps.
