# Chapter 8 — Recursion

Here's a surprising idea: a note is allowed to call **itself**. That's
**recursion** — a tidy way to solve a problem by doing a little bit and handing
the rest to another copy of itself.

Open the **show_factorial** note and **Forge** (🔥) it. You'll see:

```
120
```

## What's new

The star is the **factorial** note, and it calls *itself*. It takes an input
`n` (see `inputs: [n]` in its frontmatter). `factorial` of `5` means
`5 × 4 × 3 × 2 × 1`, which is `120`. Open it and look — two ideas are at work:

- **A stopping point.** If `n` is at most `1`, it returns `1`. Without a
  stopping point, the note would call itself forever.
- **A step toward it.** Otherwise it returns `n` times [[factorial]] of
  `n minus 1` — to find `factorial` of `5` it asks for `factorial` of `4`, which
  asks for `3`, and so on down to `1`, where it stops. Then all those answers
  multiply back up to `120`.

The second note, **show_factorial**, just calls it and prints the result:

> Let result = Call [[factorial]] with n=5.
> Call [[print]] with text=result.

(Notice `n=5` — same rule as chapter 3: a note that takes an input is called
by name.)

Everything here you've already met — `Return`, `If`, calling a note — just
pointed at the same note that contains it. That's all recursion is.

## Exercise

Open the **show_factorial** note and change `n=5` to `n=6`. **Forge** 🔥 it —
the answer jumps to `720`. Then try `n=3` and check it by hand: `3 × 2 × 1 = 6`.

## Palette focus

No new palette constructs in this chapter — recursion re-uses `Let`, `Call`,
`If`, and `Return`. The new mental idea is a note calling **itself** by
name via `Call [[factorial]]` from inside `factorial`. Watch the base-case
guard (the `If n < 2` branch) — recursion without a base case runs forever.

That's the core tour. One more idea — letting Forge fill in a value for you with
`{{ … }}` — is next in [[Slots]].
