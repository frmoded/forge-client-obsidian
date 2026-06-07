# Chapter 6 — Loops

When you want to do the same thing several times, you use a **loop**.

Open the **countdown** snippet and **Forge** (🔥) it:

```
3
2
1
Liftoff!
```

## What's new

```
For each number in <3, 2, 1>:
    Do [[print]](number).
Do [[print]]("Liftoff!").
```

- **`For each number in <3, 2, 1>:`** runs the indented body once for every item
  in the list, giving the current item the name `number` each time around.
- The `Do [[print]]("Liftoff!")` line is **not** indented under the loop, so it
  runs once, after the loop finishes.

One thing to notice: the list is written with **angle brackets** — `<3, 2, 1>` —
not square brackets. In Forge, square brackets are reserved for snippet calls
like `[[print]]`, so lists use `<…>` instead.

> The **For each** chip is now in your 🔥 palette — the last piece of core
> vocabulary.

## Exercise

Add more numbers to the list — try `<5, 4, 3, 2, 1>` — and Forge again.
The countdown grows on its own, no extra print lines needed. Then change
`"Liftoff!"` to your own send-off.

When you're ready, go to [[Data]] — where snippets start holding values for you.
