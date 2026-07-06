# Chapter 3 — Functions

So far each note does its thing top to bottom. Sometimes you want a step you
can name once and reuse with different inputs. In Forge, you do that by making
**another note** — one that takes an input and returns something. That's a
function.

Open the **cheer** note and **Forge** (🔥) it. You'll see:

```
hooray!
```

## What's new

There are two notes here. The reusable one is **excited**, and it's one line:

> Return word + "!".

Its frontmatter says `inputs: [word]` — it takes one input, called `word`, and
**returns** that word with a `"!"` on the end. `Return` is how a note hands a
result back to whoever called it.

Then **cheer** uses it:

> Let shout = Call [[excited]] with word="hooray".
> Call [[print]] with text=shout.

- [[excited]] is called with `word="hooray"` — that hands it the input `word`
  set to `"hooray"`.
- Notice the `word=` part. When a note takes an input, you pass it **by
  name** — `word="hooray"`, not just `"hooray"`. Leaving off the `word=` is the
  most common early mistake: Forge needs the name to know which input you mean.
- [[excited]] returns `"hooray!"`, and [[print]] shows it.

A note that takes an input and returns something is Forge's idea of a
**function**: a named, reusable step. And making one is just making another
note.

> **Return** is now in your 🔥 palette.

## Exercise (make your own)

Let's write a function of your own.

1. In the file list, right-click `excited.md` and choose **Make a copy**. Rename
   the copy to `question.md`.
2. Open `question.md` and change its line to `Return word + "?".`
3. Open **cheer**, change the call from **excited** to **question**, and **Forge**
   🔥 it. You'll see `hooray?`.

You just created a note, named it, and called it — the same loop you'll use
to build anything in Forge.

## Palette focus

Focus on **Return**, **Let**, and **Call [[...]]** for this chapter. The
`Return ...` construct is how a note hands a result back to its caller.
Ignore `If`, `Otherwise`, `For each` for now — those come in later chapters
([[Conditionals]], [[Loops]]).

When you're ready, go to [[Composition]] — where notes call each other in
chains.
