# Chapter 6 — Loops

When you want to do the same thing several times, you use a **loop**.

Open the **countdown** note and **Forge** (🔥) it:

```
3
2
1
Liftoff!
```

## What's new

Open the note and look. The heart of it is a **For each** line:

> For each number in `<3, 2, 1>`:

This runs the lines indented beneath it once for every item in the list, giving
the current item the name `number` each time around — so it prints `3`, then
`2`, then `1`. After the loop finishes, one last un-indented line prints
`"Liftoff!"`.

Lists are written with **angle brackets**, like `<3, 2, 1>` — that's just how
Forge writes a list of values.

## About `Return` vs `[[print]]`

You've seen `Return` in every chapter so far — it hands one value back as the
note's whole result. Notice this Recipe uses `[[print]] number.` inside the
loop instead. That's on purpose: `Return` **exits** the whole Recipe with a
single value, so a `Return` inside a loop would stop after the first iteration
and you'd never see `2` or `1`. `[[print]]` **emits** one line and lets the
Recipe keep going — which is exactly what you need when a loop is meant to
show multiple things.

Rule of thumb: use `Return` when you have one answer to hand back, and
`[[print]]` when you want to show many things as the note runs.

> The **For each** chip is now in your 🔥 palette — the last piece of core
> vocabulary.

## Exercise

Open the **countdown** note, add more numbers to the list — try
`<5, 4, 3, 2, 1>` — and Forge again. The countdown grows on its own, no extra
lines needed. Then change `"Liftoff!"` to your own send-off.

## Palette focus

Focus on **For each** in this chapter. Loops let you repeat a block once per
item in a list. You've already met `Let`, `Call`, and `If` — this is the last
of the primitive control constructs in the palette. Data notes come next.

When you're ready, go to [[Data]] — where notes start holding values for you.
