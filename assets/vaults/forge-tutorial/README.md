# The Forge Tutorial

Welcome. This tutorial keeps things deliberately simple: every example runs,
every chapter adds exactly one new idea, and every chapter ends with a small
tweak you make yourself.

You don't need to know how to program. You need curiosity and a willingness to
change one thing and click again.

## You've already made something

When you first opened Forge, a file called `welcome.md` was sitting at the top
of your vault. If you Forge-clicked it, you saw it say hello — and quietly call
a second snippet, `greet`, to do part of the work. That was Forge in miniature:
small pieces that run, and that call each other.

This tutorial slows that moment down and shows you how it works, one idea at a
time, until you're writing your own.

## How to use it

Each chapter is a folder. Inside a chapter you'll find:

- a short **lesson note** (named after the chapter, like `Hello`) — read it first;
- one or more **snippets** (`.md` files) — the working examples;
- an **Exercise** at the end of the lesson — a one-line change to try.

The rhythm for every chapter is the same:

1. Read the lesson note.
2. Open the snippet and **Forge** 🔥 it. See the result.
3. Do the Exercise: change one thing, Forge it again, see what changed.

That loop — *click, tweak, click* — is the whole point. Forge is cheap to
re-run, so play.

## The chapters

1. [[Hello]] — your first Forge-click, and your first look at a snippet's parts.
2. [[Variables]] — naming values with *Set … to …*.
3. [[Functions]] — defining your own reusable steps.
4. [[Composition]] — snippets calling snippets.
5. [[Conditionals]] — *If … Otherwise …*.
6. [[Loops]] — *For each … in …*.
7. [[Data]] — snippets that hold values, and walking through lists.
8. [[Recursion]] — a snippet that calls itself.
9. [[Slots]] — letting Forge fill in a value for you with `{{ … }}`.

Chapter 9 is the one to look forward to: it's where you stop *typing* values and
start *describing* them. Write `{{ a calm shade of blue }}` and Forge fills in
the rest — plain English in, a real working value out.

Want the deep language reference instead of the gentle walk? That's the E--
language tutorial (coming later) — this one keeps things concrete.

> **Status:** all nine chapters are written and runnable. Chapters 1–8 are
> verified; chapter 9 (Slots) uses the slot-resolution + `# Python` cache
> mechanism confirmed working end-to-end on v0.2.75.
