# Chapter 7 — Data

Not every note *does* something. Some just *hold* something — a list, a
number, a chunk of text — ready for other notes to use. Those are **data
notes**.

Open the **show_colors** note and **Forge** (🔥) it:

```
red
green
blue
```

## What's new

There are two notes here. First, the **colors** note — open it and look.
It's just a list, with no steps:

```
["red", "green", "blue"]
```

Its frontmatter says `type: data`, which means "this note *is* a value." When
something calls it, it simply hands back that list.

Then the **show_colors** note calls [[colors]] to get the list, names it
`palette`, and loops over it with the **For each** you learned last chapter —
printing each color in turn. Action notes *do*; data notes *hold*;
together they keep your values in one place.

> The **colors** chip is in your 🔥 palette — a value you can drop into any
> note.

## Exercise

Open the **colors** note and add a color — `["red", "green", "blue",
"purple"]` — then **Forge** 🔥 the **show_colors** note again. The loop picks
up your new color with no other changes. The data and the steps that use it stay
separate, which is exactly the point.

Then make a data note of your own: right-click `colors.md` → **Make a copy**,
rename it `animals.md`, and put a list of animals inside. Point a copy of
**show_colors** at it to print your own list.

## Palette focus

This chapter introduces **data notes** — action-note siblings that hold values.
No new palette constructs; the new idea is the note's `type: data` frontmatter.
`colors` is a data note; `show_colors` is a normal action note that consumes
it. Focus on the shape difference between the two.

When you're ready, go to [[Recursion]] — where a step learns to call itself.
