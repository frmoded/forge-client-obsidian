*Chapter 8*

Here's a surprising idea: a note is allowed to call **itself**. That's
**recursion** — a tidy way to solve a problem by doing a little bit and handing
the rest to another copy of itself.

Open the [[show_factorial]] note and **run** it. You'll see:

```
120
```

## What's new - A note calling itself

The star is the [[factorial]] note, and it calls *itself*. It takes an input
`n`, declared right at the top of its Recipe: `Input n: int = 5.`. `factorial`
of `5` means `5 × 4 × 3 × 2 × 1`, which is `120`. Open it and look — two ideas
are at work:

- **A stopping point.** If `n` is at most `1`, it returns `1`. Without a
  stopping point, the note would call itself forever.
- **A step toward it.** If that's not true yet, it returns `n` times
  [[factorial]] of `n minus 1` — so `factorial` of `5` asks for `4`, then `3`,
  down to `1`, where it stops, and the answers multiply back up to `120`.

The second note, [[show_factorial]], just calls it and returns the result:

> Let r = Call [[factorial]] with n=5.
> Return r.

(Notice `n=5` — same named-argument rule as chapter 3.)

## Exercise - Try a different number

Open the [[show_factorial]] note and change `n=5` to `n=6`. **Run** it —
the answer jumps to `720`. Then try `n=3` and check it by hand: `3 × 2 × 1 = 6`.

That's the core tour. One more idea — letting the engine fill in a value for
you with `{{ … }}` — is next in [[Slots]].

**Next Lesson:** [[Slots]]
