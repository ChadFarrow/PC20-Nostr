# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## What this repo is

A **specification repo — prose only, no code**. There is nothing to build,
lint, or test. `pc20-favorites.md` is the entire deliverable: an
app-neutral format for syncing a user's podcast and music favorites between
Podcasting 2.0 apps over Nostr, as a single replaceable event at kind 10333.
The audience is an implementer of a *third* app who has only this document.

## The spec is ahead of its implementations, and there are now two

Read this before treating any line in the document as established.

The spec was **authored, not extracted**. Every rule in it began as a design
decision someone made rather than a behavior observed in production, and most
still are.

Both implementations went live on 2026-08-13: `~/Vibe/stablekraft-app`
publishes and reads kind 10333 in production, and `~/Vibe/boostmebitch`
started publishing it the same evening. That is **two writers, one user, one
day old** — a source of measurements (event sizes, group counts, bugs each
actually hit) and not evidence that a rule is settled.

The second writer is what moved [Merging](pc20-favorites.md#merging) from
precaution to the section with live failure modes behind it. It did not make
the two apps agree, so **do not write "both apps do X"** — that sentence is
now wrong more often than it used to be, not less. As of 2026-08-14 they
agree on the wire format and diverge on §4, *Carry what you can't read*: one
carries foreign tags, foreign `k` values and unparseable `i` entries through
a republish, the other drops them. Name the app, say what it does, and keep
the rule justified by the failure it prevents rather than by the fact that
someone shipped it.

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
- **Merging is what makes wholesale replacement safe — there is no
  single-writer assumption left to lean on.** Any app may write this event,
  so a writer that publishes what it holds without reading first does not
  lose a race, it deletes every entry the other writers added: silently, on
  someone else's device, with no undo. The Merging section is what stands in
  for the assumption the format used to make, and every part of it is
  load-bearing — read before every publish, never publish on a read you
  don't trust, keep a private per-device baseline to tell a foreign entry
  from one you removed, carry what you can't parse, and publish only when
  the bytes change. A change that weakens any of those needs to say which
  data gets destroyed instead.
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
