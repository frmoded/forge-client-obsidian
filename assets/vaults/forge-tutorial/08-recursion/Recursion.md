# Chapter 8 — Recursion

Here's a surprising idea: a snippet is allowed to call **itself**. That's
**recursion**, and it's a tidy way to solve a problem by doing a little bit and
handing the rest to another copy of itself.

Open the **show_factorial** snippet and **Forge** (🔥) it. You'll see:

```
120
```

## What's new

There are two snippets. The star is `factorial`, and it calls itself:

```
If n is at most 1:
    Give back 1.
Give back n times [[factorial]](n=n minus 1).
```

`factorial` takes an input `n` (see `inputs: [n]` in its frontmatter).
`factorial` of `5` means `5 × 4 × 3 × 2 × 1`, which is `120`.

- **The stopping point.** `If n is at most 1: Give back 1.` Without it, the
  snippet would call itself forever. Every recursion needs a stopping point.
- **The step toward it.** `Give back n times [[factorial]](n=n minus 1).` To
  find factorial of `5`, it gives back `5 times factorial(n=4)` — which asks for
  `factorial(n=3)`, and so on down to `1`, where it stops. Then all those
  answers multiply back up to `120`.

The second snippet, `show_factorial`, just calls it and prints:

```
Do [[print]]([[factorial]](n=5)).
```

(Notice `n=5` — same rule as chapter 3: a snippet that takes an input is called
by name.)

Everything here you've already met — `Give back`, `If` — just pointed at the
same snippet that contains it. That's all recursion is.

## Exercise

1. Open `show_factorial` and change `n=5` to `n=6`. **Forge** 🔥 it — the answer
   jumps to `720`.
2. Try `n=3` and check it by hand: `3 × 2 × 1 = 6`.

That's the core tour. One more idea — letting Forge fill in a value for you with
`{{ … }}` slots — is coming soon in [[Slots]].
