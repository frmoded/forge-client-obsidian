# Chapter 1 — Hello

The oldest tradition in programming: make the computer say hello.

Open the [[hello_world]] note. Before you can run it, click the **hammer
icon** in its toolbar — tooltip **"Forge this note"** — once. That opens the
Forge panel and connects it to this note; **Run** stays greyed out until you
do. Now press **Run**:

```
hello, world
```

That's it. You ran a program. **Forge, then Run** is the sequence for every
note in this tutorial. (Tip: middle-click a note to open it in its own tab,
alongside this lesson.)

## What you're looking at

Two parts of the note matter here. The **frontmatter** (between the `---`
lines) is just its label — `type: action` means it does something; ignore the
rest for now. The **Recipe** is the whole program, one line:

> Return "hello, world".

**Return** hands back a result. **"hello, world"** is the text, always
double-quoted. Every instruction ends in a `.`.

## Exercise

Replace `"hello, world"` with your own text — keeping the quotes — then Forge
and Run again. That's the loop for the whole tutorial: **change one thing,
Forge it, run it, see what happened.**

## The hammer's other job

Above the Recipe, under *Description*, is a plain-English sentence. Edit it,
and the same hammer click re-derives the Recipe from those words via an AI —
it may **snap to something new** rather than change slightly, since prose is
interpreted, not copied. Want an exact string? Write it in the Recipe
directly. (To undo an AI re-derive: type `Return "hello, world".` back in and
Forge once more.)

## Palette focus

The palette on the right shows every construct; this chapter only needs
**Return**. `Let`, `If`, `For each`, `Call` come in [[Variables]],
[[Conditionals]], [[Loops]], [[Functions]].

**What's next:** [[hello_world]]

**After this chapter:** [[Variables]]
