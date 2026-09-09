*Chapter 7*

Not every note *does* something. Some just *hold* it — these are **data notes**.

Open the [[show_colors]] note and **run** it:

```
red
green
blue
```

## What's new - Notes that just hold data

There are two notes here — first, [[colors]], just a list with no steps:

```
["red", "green", "blue"]
```

Its frontmatter says `type: data` — calling it just hands back the list.

Then [[show_colors]] calls [[colors]], names the list `palette`, and loops
over it with **For each** (same `Return`-vs-`[[print]]` reason as last chapter).

## Exercise - Add your own data

Open the [[colors]] note and add a color — `["red", "green", "blue",
"purple"]` — then **run** the [[show_colors]] note again. The loop picks
up your new color with no other changes. The data and the steps that use it stay
separate, which is exactly the point.

Then make a data note of your own: right-click `colors.md` → **Make a copy**,
rename it `animals.md`, and put a list of animals inside. Point a copy of
[[show_colors]] at it to print your own list.

**Next Lesson:** [[Recursion]]
