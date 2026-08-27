# Chapter 2 — Variables

In chapter 1 you returned a fixed message. This time, let's give values names so
we can build with them.

Open the [[greeting]] note and **run** it. You'll see:

```
Hello, Ada
```

## What's new

Three lines: `Let name = "Ada"` names a value — a box called `name` holding
`"Ada"`. `Let greeting = "Hello, " + name` builds on it, and `+` joins text.
`Return greeting` hands back the *value* — no quotes, because quotes would
return the literal word "greeting" instead of what `greeting` holds.

## Exercise

Open the [[greeting]] note, change `"Ada"` to your own name, and run again —
the greeting follows. Then try changing `"Hello, "` to `"Hi there, "`. Two boxes,
one result: that's what variables buy you.

## Now find a bug that isn't yours

Open [[fix_me]] and run it. It's supposed to print a greeting, the same shape
as [[greeting]] — but it doesn't. **It's broken on purpose.** Read its Recipe,
find the one word that shouldn't have quotes around it, fix it, and run again.
Everything you need is already in this chapter.

**What's next:** [[greeting]]

**After this chapter:** [[Functions]]
