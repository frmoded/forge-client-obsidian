# Chapter 2 — Variables

In chapter 1 you printed a fixed message. This time, let's give values names so
we can build with them.

Open the **greeting** snippet and **Forge** (🔥) it. You'll see:

```
Hello, Ada
```

## What's new

Open the snippet and look — it does three small things, each on its own line:

- it names a value: `Set name to "Ada"` makes a box called `name` holding the
  text `"Ada"`;
- it builds a greeting: `Set greeting to "Hello, " plus name` — and **plus**
  joins two pieces of text, so this becomes `"Hello, Ada"`;
- it prints the result with [[print]].

Two new ideas, both small:

- **Set … to …** gives a value a name. Now you can use the name instead of
  typing the value again.
- **plus** joins two pieces of text. (You'll meet it again with numbers, where
  it adds.)

Notice [[print]] is handed `greeting` with **no quotes** — because `greeting` is
a *name* standing for a value, not the literal word "greeting". Quotes mean "the
exact text"; no quotes means "the value with this name".

> The **Set** chip is now in your 🔥 palette — click it to drop a fresh
> `Set … to …` line into any snippet.

## Exercise

Open the **greeting** snippet, change `"Ada"` to your own name, and Forge again —
the greeting follows. Then try changing `"Hello, "` to `"Hi there, "`. Two boxes,
one result: that's what variables buy you.

When you're ready, go to [[Functions]] — where you make your own reusable steps.
