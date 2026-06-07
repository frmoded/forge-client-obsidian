# Chapter 4 — Composition

Remember `welcome.md` from when you first opened Forge? It called a second
snippet, `greet`, to do part of its work. That's **composition**: snippets
calling snippets. It's the heart of how Forge scales from tiny pieces to big
things.

This chapter has two snippets. Open the **describe_forge** snippet and **Forge** (🔥) it:

```
Forge is wonderful.
```

## What's new

`describe_forge.md` is short:

```
Set word to [[excited_word]]().
Do [[print]]("Forge is " plus word plus ".").
```

The new part is `[[excited_word]]()` — that's a **call to another snippet**. When
`describe_forge` runs, it asks `excited_word` to do its job and hands back the
result, which we store in `word`.

Now open the **excited_word** snippet in this same folder. It's tiny:

```
Give back "wonderful".
```

That's a whole snippet whose only job is to give back a word. `describe_forge`
doesn't care *how* `excited_word` decides — it just uses what comes back. Small
pieces, combined.

> `excited_word` shows up as a chip in your 🔥 palette — because it's a building
> block you can call from anywhere, just like `print`.

## Exercise

Open the **excited_word** snippet and change `"wonderful"` to `"powerful"` (or
anything you like). Save it, then **Forge** 🔥 the **describe_forge** snippet
again. You changed one small snippet, and the bigger one followed. That's
composition working for you.

Want to go further? In the file list, right-click `excited_word.md` → **Make a
copy**, rename it (say `another_word.md`), give back a different word, and point
`describe_forge` at your new snippet instead of `excited_word`.

When you're ready, go to [[Conditionals]] — where snippets start making choices.
