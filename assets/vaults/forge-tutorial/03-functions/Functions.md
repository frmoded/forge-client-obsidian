# Chapter 3 — Functions

So far each note does its thing top to bottom. Sometimes you want a step you
can name once and reuse with different inputs. In this system, you do that by
making **another note** — one that takes an input and returns something.
That's a function.

Open the [[cheer]] note and **run** it. You'll see:

```
hooray!
```

## What's new

There are two notes here. The reusable one is [[excited]], and it's one line:

> Return word + "!".

Its Recipe begins with `Input word: str = "hooray".` — that's how a note
declares a parameter: a name, a type, and (optionally) a default. It takes one
input, called `word`, and **returns** that word with a `"!"` on the end.
`Return` is how a note hands a result back to whoever called it. (The note's
frontmatter `inputs:` field reflects this automatically — the engine keeps it
in sync with the Recipe, so you never edit it by hand.)

Then [[cheer]] uses it:

> Let shout = Call [[excited]] with word="hooray".
> Return shout.

- [[excited]] is called with `word="hooray"` — that hands it the input `word`
  set to `"hooray"`.
- Notice the `word=` part. When a note takes an input, you pass it **by
  name** — `word="hooray"`, not just `"hooray"`. Leaving off the `word=` is the
  most common early mistake: the engine needs the name to know which input you
  mean.
- [[excited]] returns `"hooray!"`, and `Return` hands that back to whoever
  ran [[cheer]] — the Output panel shows it.

A note that takes an input and returns something is this system's idea of a
**function**: a named, reusable step. And making one is just making another
note.

> **Return** is now in your palette.

## More on inputs

Two more notes round out this chapter.

Open [[function_inputs]] and run it — it takes **two** inputs, `first_name`
and `last_name`, and joins them. Nothing new syntactically: every
`Input ... = ....` line adds one more parameter, and the note's `inputs:`
frontmatter grows to match. One input or five, the shape is the same.

Open [[mood]] and look at its `style` input. So far every input has been open
text — type whatever you like. `style` instead declares a **fixed set of
choices**, which makes it render as a dropdown in the run panel instead of a
text box: pick `"cheerful"`, `"formal"`, or `"sleepy"` rather than typing
freely. Inside the Recipe it's still just a string — the branching that picks
a reply uses the `If` / `Otherwise` you'll meet properly next chapter. A
dropdown is worth reaching for whenever an input only ever makes sense as one
of a short, known list — it stops the person running the note from typing
something the Recipe doesn't expect.

## Exercise (make your own)

Let's write a function of your own.

1. In the file list, right-click `excited.md` and choose **Make a copy**. Rename
   the copy to `question.md`.
2. Open `question.md` and change its line to `Return word + "?".`
3. Open [[cheer]], change the call from [[excited]] to **question**, and **run**
   it. You'll see `hooray?`.

You just created a note, named it, and called it — the same loop you'll use
to build anything here.

## Palette focus

Focus on **Return**, **Let**, and **Call [[...]]** for this chapter. The
`Return ...` construct is how a note hands a result back to its caller.
Ignore `If`, `Otherwise`, `For each` for now — those come in later chapters
([[Conditionals]], [[Loops]]).

**What's next:** [[cheer]]
