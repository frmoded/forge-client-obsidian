# Chapter 4 — Composition

Remember `welcome.md` from when you first opened the vault? It called a second
note, `greet`, to do part of its work. That's **composition**: notes
calling notes. It's the heart of how this system scales from tiny pieces to
big things.

This chapter has two notes. Open the [[describe_it]] note and **run** it:

```
This is wonderful.
```

## What's new

Open [[describe_it]] and look — it's short. It calls another note,
[[excited_word]], stores what comes back in `word`, and then returns
`"This is " + word + "."`. The new idea is that one line:

> Let word = Call [[excited_word]].

That [[excited_word]] is a **call to another note**. When [[describe_it]]
runs, it asks [[excited_word]] to do its job and hands back the result.

Now open the [[excited_word]] note in this same folder. It's tiny:

> Return "wonderful".

That's a whole note whose only job is to return a word. [[describe_it]]
doesn't care *how* it decides — it just uses what comes back. Small pieces,
combined.

## Exercise

Open the [[excited_word]] note, change `"wonderful"` to `"powerful"` (or
anything you like), save it, then **run** the [[describe_it]] note
again. You changed one small note, and the bigger one followed. That's
composition working for you.

Want to go further? Right-click `excited_word.md` → **Make a copy**, rename it
(say `another_word.md`), return a different word, and point [[describe_it]]
at your new note instead.

## Palette focus

Focus on chained **Call [[...]]** patterns and **Let ... = Call ...** in this
chapter. You've already met all the Recipe constructs the sample uses; the new
skill is nesting them. Ignore `If`, `Otherwise`, `For each` for now —
[[Conditionals]] and [[Loops]] cover those.

**What's next:** [[describe_it]]

**Order in this chapter:** [[describe_it]] → [[excited_word]]

**After this chapter:** [[Conditionals]]
