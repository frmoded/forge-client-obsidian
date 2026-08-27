# Chapter 2 — Variables

In chapter 1 you returned a fixed message. This time, let's give values names so
we can build with them.

Open the [[greeting]] note and **run** it. You'll see:

```
Hello, Ada
```

## What's new

Open it and look. It does three things, one per line:

- it names a value: **`Let … = …`** — `Let name = "Ada"` makes a box called
  `name` holding the text `"Ada"`, so you can use the name instead of typing
  the value again;
- it builds a greeting: `Let greeting = "Hello, " + name` — and **`+`** joins
  two pieces of text, so this becomes `"Hello, Ada"`. You'll meet `+` again
  with numbers, where it adds;
- it returns the result.

Notice `Return` is handed `greeting` with **no quotes** — because `greeting`
is a *name* standing for a value, not the literal word "greeting". Quotes mean
"the exact text"; no quotes means "the value with this name".

> The **Let** chip is now in your palette — click it to drop a fresh
> `Let … = …` line into any note.

## Exercise

Open the [[greeting]] note, change `"Ada"` to your own name, and run again —
the greeting follows. Then try changing `"Hello, "` to `"Hi there, "`. Two boxes,
one result: that's what variables buy you.

## Now find a bug that isn't yours

Open [[fix_me]] and run it. It's supposed to print a greeting, the same shape
as [[greeting]] — but it doesn't. **It's broken on purpose.** Read its Recipe,
find the one word that shouldn't have quotes around it, fix it, and run again.
Everything you need is already in this chapter.

## Palette focus

This chapter's only new chip is **Let** — you'll see it twice in [[greeting]].
`Return` carries over from chapter 1. The palette has more chips than that
(`If`, `Otherwise`, `For each` among them); they wait for later chapters
([[Conditionals]], [[Loops]]) and won't come up again here.

**What's next:** [[greeting]]

**After this chapter:** [[Functions]]
