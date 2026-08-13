# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## What this repo is

A **specification repo — prose only, no code**. There is nothing to build,
lint, or test. `pc20-favorites-single-list.md` is the entire deliverable: an
app-neutral format for syncing a user's podcast and music favorites between
Podcasting 2.0 apps over Nostr, as a single replaceable event at kind 10333.
The audience is an implementer of a *third* app who has only this document.

## The spec is ahead of every implementation

Read this before treating any line in the document as established.

The spec was **authored, not extracted**. No shipping app publishes kind
10333 — not `~/Vibe/boostmebitch`, not `~/Vibe/stablekraft-app`. Every rule
in it is a design decision someone made, not a behavior observed in
production.

The practical consequence: do not write "both apps do X", and do not cite
implementation behavior as support for a claim. There is no such support
yet. When a rule needs justification, justify it by naming the failure it
prevents.

## The implementation repos are read-only

`~/Vibe/boostmebitch` and `~/Vibe/stablekraft-app` are sources to read,
never targets to change: no edits, no commits, no branches, no PRs, no
"while I'm in here" fixes. Read them as much as a claim requires — that is
how one gets verified — but what comes back lands here, as spec text or as a
known-gap note, never as a patch over there.

## Invariants a change must not quietly break

- **Tag order is semantic.** `medium` is a running value that applies to
  every entry after it, and item entries belong to the most recently opened
  feed group. An item's parent feed and its medium are carried by position,
  not by anything on the entry itself, so any client that sorts, dedupes, or
  rebuilds the tag array from parsed structs silently reattaches every item
  to the wrong feed. Nothing else in the format recovers the association.
- **Medium is a hint, never truth.** A Podcast Index lookup on the guid wins
  over the stored hint whenever they disagree.
- **The single-writer assumption is what makes wholesale replacement safe.**
  Republishing overwrites the entire list. Remove that assumption and the
  format loses data with nothing to catch it — so any rule that invites a
  second concurrent writer needs to say what happens when two publishes
  race.
- **Kind 10333 is self-assigned, not NIP-allocated.** Say so wherever it
  matters, and keep the collision cost stated: relay filters are
  kind-scoped, so a later NIP landing on the same number would put two
  unrelated event types into every query either app makes.

## Conventions

- **Voice.** Second person to the implementer, normative and specific, with
  the failure mode named — "do X, because otherwise Y is silently lost".
  Prefer stating the bug that motivates a rule over abstract justification.
  Keep the existing hard-wrapped prose (~80 cols); long URLs may overrun.
- **Branches.** `spec/<topic-in-kebab-case>` off `main`, merged via PR.
- **Commits.** Subject is a claim, not a changelog line — "Aggregate EOSE is
  not proof the read happened", not "update spec". The body is long-form:
  what was believed, what was measured, what changed, with real numbers
  where there are any.
- **Review what you're committing.** `git status` and `git show --stat`
  before and after. There is **no `.gitignore`** in this repo, so a
  `.DS_Store` or an editor swap file goes in with the prose and stays in the
  history.
