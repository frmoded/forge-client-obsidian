*Chapter 4*

[[welcome]] called a second note, [[greet]], to do part of its work — that's
**composition**: notes calling notes, how this system scales from tiny
pieces to big things.

Open [[describe_it]] and **run** it:

```
This is wonderful.
```

## What's new - One note calling another

[[describe_it]] is short. It calls [[excited_word]], stores what comes back
in `word`, and returns `"This is " + word + "."` — the new idea is one line:

> Let word = Call [[excited_word]].

[[excited_word]] is tiny too — `Return "wonderful".` [[describe_it]] doesn't
care *how* it decides, it just uses what comes back. Small pieces, combined.

## Exercise - Change a called note

Open [[excited_word]], change `"wonderful"` to anything you like, save it,
then **run** [[describe_it]] again. You changed one small note and the
bigger one followed — that's composition working for you.

**Next Lesson:** [[Conditionals]]
