# Chapter 3 — Functions

So far each snippet does its thing top to bottom. Sometimes you want a step you
can name once and reuse with different inputs. In Forge, you do that by making
**another snippet** — one that takes an input and gives something back. That's a
function.

Open the **cheer** snippet and **Forge** (🔥) it. You'll see:

```
hooray!
```

## What's new

There are two snippets here. The reusable one is **excited**, and it's one line:

> Give back word plus "!".

Its frontmatter says `inputs: [word]` — it takes one input, called `word`, and
**gives back** that word with a `"!"` on the end. `Give back` is how a snippet
hands a result to whoever called it.

Then **cheer** uses it:

> Do [[print]]([[excited]](word="hooray")).

- [[excited]] is called with `word="hooray"` — that hands it the input `word` set
  to `"hooray"`.
- Notice the `word=` part. When a snippet takes an input, you pass it **by
  name** — `word="hooray"`, not just `"hooray"`. Leaving off the `word=` is the
  most common early mistake: Forge needs the name to know which input you mean.
- [[excited]] gives back `"hooray!"`, and [[print]] shows it.

A snippet that takes an input and gives something back is Forge's idea of a
**function**: a named, reusable step. And making one is just making another
snippet.

> **Give back** is now in your 🔥 palette.

## Exercise (make your own)

Let's write a function of your own.

1. In the file list, right-click `excited.md` and choose **Make a copy**. Rename
   the copy to `question.md`.
2. Open `question.md` and change its line to `Give back word plus "?".`
3. Open **cheer**, change the call from **excited** to **question**, and **Forge**
   🔥 it. You'll see `hooray?`.

You just created a snippet, named it, and called it — the same loop you'll use
to build anything in Forge.

When you're ready, go to [[Composition]] — where snippets call each other in
chains.
