# Chapter 7 — Data

Not every snippet *does* something. Some just *hold* something — a list, a
number, a chunk of text — ready for other snippets to use. Those are **data
snippets**.

Open the **show_colors** snippet and **Forge** (🔥) it:

```
red
green
blue
```

## What's new

There are two snippets here. First, the **colors** snippet — open it and look.
It's just a list, with no steps:

```
["red", "green", "blue"]
```

Its frontmatter says `type: data`, which means "this snippet *is* a value." When
something calls it, it simply hands back that list.

Then the **show_colors** snippet calls [[colors]] to get the list, names it
`palette`, and loops over it with the **For each** you learned last chapter —
printing each color in turn. Action snippets *do*; data snippets *hold*;
together they keep your values in one place.

> The **colors** chip is in your 🔥 palette — a value you can drop into any
> snippet.

## Exercise

Open the **colors** snippet and add a color — `["red", "green", "blue",
"purple"]` — then **Forge** 🔥 the **show_colors** snippet again. The loop picks
up your new color with no other changes. The data and the steps that use it stay
separate, which is exactly the point.

Then make a data snippet of your own: right-click `colors.md` → **Make a copy**,
rename it `animals.md`, and put a list of animals inside. Point a copy of
**show_colors** at it to print your own list.

When you're ready, go to [[Recursion]] — where a step learns to call itself.
