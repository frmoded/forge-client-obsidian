# Cross-cowork message exchange

File-based message passing between cowork sessions in the Forge project family. Replaces the chat-relay model where the driver had to copy/paste message content between sessions.

## Directory structure

```
messages/
├── to-forge-core/          # forge-core's inbox
│   └── done/               # processed messages, audit trail
├── to-forge-doc/           # forge-doc's inbox
│   └── done/
├── to-forge-music/         # forge-music's inbox
│   └── done/
└── to-forge-moda/          # forge-moda's inbox (when an active session exists)
    └── done/
```

## Message file naming

`YYYY-MM-DD-HHMM-short-name.md` — same date-prefix lexicographic pattern as prompts. Sender + topic encoded in the file name + frontmatter.

## Message file structure

```markdown
---
from: forge-music | forge-doc | forge-core | forge-moda | e--
to: forge-core | forge-doc | forge-music | forge-moda
date: 2026-06-06
topic: short subject line
status: open | resolved | superseded
---

# Subject

## §1 — What's the message about

Substance. Diagnosis, request, question, brief — whatever needs to be communicated. Can be multi-paragraph. Can include code blocks, file paths, etc.

## §2 — What the sender wants from the recipient

Specific ask:
- "Please decide between option A and option B"
- "Please draft a CC prompt for X"
- "Please relay this to forge-doc"
- "FYI only; no action needed"

## §3 — Context the recipient may need

References to prior decisions, related files, prior chat exchanges. Briefly.
```

Subsequent updates to the same conversation use the same filename pattern + a `-reply` or `-update` suffix, e.g. `2026-06-06-1430-brief-c-d-e-reply.md`.

## Workflow

### Sending a message

The sender cowork writes the file to the recipient's inbox directly. No driver involvement in the write. The sender signals the driver: "I've written a message for forge-core at `messages/to-forge-core/2026-06-06-1430-foo.md`."

The driver verifies (one-line summary of what's in the message — the safeguard against silently-wrong messages) and notes that the recipient needs to check messages on next session.

### Receiving messages

When the driver tells a cowork "check messages," that cowork:

1. Lists their inbox: `ls forge-moda-bootstrap/messages/to-<self>/*.md`
2. For each message: read end to end.
3. Process: respond (possibly with a new message to the sender's inbox), act on the request, ask the driver for routing if unclear.
4. Move the processed message to `done/`: `mv messages/to-<self>/<message>.md messages/to-<self>/done/`.
5. Report back to the driver what was processed.

### Driver safeguard

When a cowork asks the driver to "tell <recipient> to check messages," the cowork MUST also include a one-line summary of what was written:

> Driver — I wrote a message to forge-doc at `messages/to-forge-doc/2026-06-06-1700-schema-v3-decisions.md`. Subject: schema v3 amendment authorization for per-chapter `_chips.md` walk-up + synthetic chips. Please relay "check messages" to forge-doc.

The driver can intercept if the routing seems wrong before the message gets processed.

## When to use files vs chat

**Use file-based messages when:**
- Substantive brief (multi-paragraph diagnosis, request, finding).
- Cross-session reference (the recipient should be able to come back to it).
- Structured request that needs careful response.
- Anything that would have been "ferry this from forge-music's chat into forge-core's chat."

**Use chat (driver-relays) when:**
- One-line questions with one-line answers.
- Status updates ("done", "fired", "waiting").
- Immediate iteration in an active conversation.

When in doubt, file. The cost of a file is one `Write` call; the cost of chat-relay rot is the same as the cost of cowork-protocol drift — the driver eats the wall-clock waste.

## Audit trail

`done/` preserves all processed messages. Move, don't delete. Naming convention preserves chronological order via the date prefix.

## Cross-project messages

Messages from E-- cowork to Forge cowork (or vice versa) follow the same pattern in the recipient's project. E-- → Forge: write to `forge-moda-bootstrap/messages/to-forge-core/` with `from: e--` in frontmatter. Forge → E--: write to `~/projects/e--/messages/to-e--/` with `from: forge-core` (or whichever cowork).
