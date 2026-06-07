# Chapter 5 — Conditionals

Programs get interesting when they make choices. Forge does that with **If** and
**Otherwise**.

Open the **weather** snippet and **Forge** (🔥) it:

```
It's pleasant.
```

## What's new

Open the snippet and look. It sets a value, `temperature`, to `72`, and then
makes a choice:

- **If** `temperature is greater than 80`, it prints "It's hot."
- **Otherwise**, it prints "It's pleasant."

Each choice's lines are **indented** underneath it — that's how Forge knows which
lines belong to the `If` and which belong to the `Otherwise`. Since `72` is not
greater than `80`, Forge skips the first block and runs the `Otherwise` one — so
you get "It's pleasant."

`is greater than` is one of several comparisons you can use — there's also
`is less than`, `is at least`, `is at most`, `equals`, and `does not equal`.

> The **If** and **Otherwise** chips are now in your 🔥 palette.

## Exercise

Open the **weather** snippet, change `72` to `95`, and Forge again. Now the
condition is true, so you'll see "It's hot." Try a few values right around `80`
to find the dividing line.

When you're ready, go to [[Loops]] — where snippets repeat themselves.
