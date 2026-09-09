*Chapter 3*

So far each note does its thing top to bottom. Sometimes you want a step you
can name once and reuse with different inputs. In this system, you do that by
making **another note** — one that takes an input and returns something.
That's a function.

Open the [[cheer]] note and **run** it. You'll see:

```
hooray!
```

## What's new - Calling a function with an input

There are two notes here. The reusable one is [[excited]], and it's one line:

> Return word + "!".

Its Recipe begins with `Input word: str = "hooray".` — that's how a note
declares a parameter: a name, a type, and (optionally) a default. It takes one
input, called `word`, and **returns** that word with a `"!"` on the end.
`Return` is how a note hands a result back to whoever called it.

Then [[cheer]] uses it:

> Let shout = Call [[excited]] with word="hooray".
> Return shout.

- [[excited]] is called with `word="hooray"` — setting its input `word` to `"hooray"`.
- Notice the `word=` part — inputs are passed **by name**, not positionally.
  Leave it off and you'll see exactly what happens in the next exercise.
- [[excited]] returns `"hooray!"`, and `Return` hands that back to whoever
  ran [[cheer]] — the Output panel shows it.

## Exercise - Fix a bug

Open [[fix_the_call]] — it's broken exactly that way. Run it, read the real
error, then fix the call.

## Exercise - Two inputs

Open [[function_inputs]] and run it — it takes **two** inputs, `first_name`
and `last_name`, and joins them:

```
Ada Lovelace
```

## Exercise - Make your own function

Let's write a function of your own.

1. In the file list, right-click `excited.md` and choose **Make a copy**. Rename
   the copy to `question.md`.
2. Open `question.md` and change its line to `Return word + "?".`
3. Open [[cheer]], change the call from [[excited]] to **question**, and **run**
   it. You'll see `hooray?`.

You just created a note, named it, and called it — the same loop you'll use
to build anything here.

**Next Lesson:** [[Composition]]
