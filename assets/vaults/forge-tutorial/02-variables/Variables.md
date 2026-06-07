# Chapter 2 — Variables

In chapter 1 you printed a fixed message. This time, let's give values names so
we can build with them.

Open the **greeting** snippet and **Forge** (🔥) it. You'll see:

```
Hello, Ada
```

## What's new

Look at the English:

```
Set name to "Ada".
Set greeting to "Hello, " plus name.
Do [[print]](greeting).
```

Two new ideas, both small:

- **`Set … to …`** gives a value a name. `Set name to "Ada"` makes a box called
  `name` holding the text `"Ada"`. Now you can use `name` instead of typing
  `"Ada"` again.
- **`plus`** joins two pieces of text. `"Hello, " plus name` becomes
  `"Hello, Ada"`. (You'll meet `plus` again with numbers, where it adds.)

Notice the last line prints `greeting` with **no quotes** — because `greeting`
is a name standing for a value, not the literal word "greeting". Quotes mean
"the exact text"; no quotes means "the value with this name".

> The **Set** chip is now in your 🔥 palette. Click it to drop a fresh
> `Set … to …` line into any snippet.

## Exercise

Change `"Ada"` to your own name and Forge again — the greeting follows.
Then try changing `"Hello, "` to `"Hi there, "`. Two boxes, one result: that's
what variables buy you.

When you're ready, go to [[Functions]] — where you make your own reusable steps.
