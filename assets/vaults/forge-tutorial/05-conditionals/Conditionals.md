*Chapter 5*

Programs get interesting when they make choices. This system does that with
**If** and **Otherwise**.

Open the [[weather]] note and **run** it:

```
It's pleasant.
```

## What's new - We now have if statements

Open the note and look. It sets a value, `temperature`, to `72`, and then
makes a choice:

```
If temperature > 80:
  Return "It's hot.".
Otherwise:
  Return "It's pleasant.".
```

Each choice's lines are **indented** underneath it — that's how the engine
knows which lines belong to the `If` and which belong to the `Otherwise`.
Since `72` is not greater than `80`, it skips the first block and runs the
`Otherwise` one — so you get "It's pleasant." Whichever branch runs, its
`Return` hands that string back as the note's result.

`>` (is greater than) is one of several comparisons you can use — there's also
`<` (is less than), `>=` (is at least), `<=` (is at most), `==` (equals), and
`!=` (does not equal).

## Exercise - Cross the threshold

Open the [[weather]] note, change `72` to `95`, and run again. Now the
condition is true, so you'll see "It's hot." Try a few values right around `80`
to find the dividing line.

## A choice with a fixed set of options

Open [[mood]] and run it — you'll see:

```
Hey hey hey!!!
```

Look at its `style` input. Every input you've met so far has been open text —
type whatever you like. `style` instead declares a **fixed set of choices**,
which makes it render as a **dropdown** in the run panel instead of a text
box: pick `"cheerful"`, `"formal"`, or `"sleepy"` rather than typing freely.
Inside the Recipe it's still just a string, and this note's Recipe uses
exactly the `If` you just learned to pick a reply based on which one you
chose. Change the dropdown to `"formal"` and run again — you'll see "Good day
to you." instead of "Hey hey hey!!!"

A dropdown is worth reaching for whenever an input only ever makes sense as
one of a short, known list — it stops the person running the note from typing
something the Recipe doesn't expect, and it pairs naturally with `If` to
branch on the choice.

**Next Lesson:** [[Loops]]
