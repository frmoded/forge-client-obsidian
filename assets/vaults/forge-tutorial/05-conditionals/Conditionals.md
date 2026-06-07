# Chapter 5 — Conditionals

Programs get interesting when they make choices. Forge does that with **If** and
**Otherwise**.

Open the **weather** snippet and **Forge** (🔥) it:

```
It's pleasant.
```

## What's new

```
Set temperature to 72.
If temperature is greater than 80:
    Do [[print]]("It's hot.").
Otherwise:
    Do [[print]]("It's pleasant.").
```

- **`If <condition>:`** runs the indented lines beneath it *only when the
  condition is true*. Here the condition is `temperature is greater than 80`.
- **`Otherwise:`** runs its indented lines when the condition was *false*.

`temperature` is `72`, which is not greater than `80`, so Forge skips the first
block and runs the `Otherwise` block — "It's pleasant."

The phrase `is greater than` is one of several you can use: there's also
`is less than`, `is at least`, `is at most`, `equals`, and `does not equal`.

> The **If** and **Otherwise** chips are now in your 🔥 palette.

## Exercise

Change `72` to `95` and Forge again. Now the condition is true, so you'll
see "It's hot." Try a few values right around `80` to find the dividing line.

When you're ready, go to [[Loops]] — where snippets repeat themselves.
