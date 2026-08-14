# Canonical Voice Order

percussion_lab sections all return a Score with the same seven voice positions in the same order: **kick, snare, closed hi-hat, open hi-hat, low tom, mid tom, crash**. A section that doesn't play a given instrument still gets a rest-filled part at that position — it's never just omitted.

This isn't cosmetic. [[sequence]] merges same-instrument staves across sections by matching voice position first, then instrument identity. If closed hi-hat sat at a different position in two different sections, the merge would produce two separate staves with padded, misaligned measures instead of one continuous stave — exactly the failure [[voices_canonical]] exists to prevent.

Any new section snippet should build through [[voices_canonical]] rather than hand-assembling the seven parts, so the ordering contract holds automatically.

Part of [[notation]].
