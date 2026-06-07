# Chapter 4 — Composition

Remember `welcome.md` from when you first opened Forge? It called a second
snippet, `greet`, to do part of its work. That's **composition**: snippets
calling snippets. It's the heart of how Forge scales from tiny pieces to big
things.

This chapter has two snippets. Open the **describe_forge** snippet and **Forge**
(🔥) it:

```
Forge is wonderful.
```

## What's new

Open **describe_forge** and look — it's short. It calls another snippet,
[[excited_word]], stores what comes back in `word`, and then prints
`"Forge is " plus word plus "."`. The new idea is that one line:

> Set word to [[excited_word]]().

That [[excited_word]] is a **call to another snippet**. When **describe_forge**
runs, it asks [[excited_word]] to do its job and hands back the result.

Now open the **excited_word** snippet in this same folder. It's tiny:

> Give back "wonderful".

That's a whole snippet whose only job is to give back a word. **describe_forge**
doesn't care *how* it decides — it just uses what comes back. Small pieces,
combined.

> The **excited_word** chip is in your 🔥 palette — a building block you can call
> from anywhere, just like [[print]].

## Exercise

Open the **excited_word** snippet, change `"wonderful"` to `"powerful"` (or
anything you like), save it, then **Forge** 🔥 the **describe_forge** snippet
again. You changed one small snippet, and the bigger one followed. That's
composition working for you.

Want to go further? Right-click `excited_word.md` → **Make a copy**, rename it
(say `another_word.md`), give back a different word, and point **describe_forge**
at your new snippet instead.

When you're ready, go to [[Conditionals]] — where snippets start making choices.
