# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## What this repo is

A **reference repo with two halves**, neither of which is an application.

1. **The spec.** `pc20-favorites.md` — an app-neutral format for syncing a
   user's podcast and music favorites between Podcasting 2.0 apps over
   Nostr, as a single replaceable event at kind 10333. The audience is an
   implementer of a *third* app who has only this document. This half is
   **prose only**; there is nothing to build, lint or test in it.
2. **The catalog.** `catalog/` — canonical implementations of features that
   appear in more than one of ChadFarrow's sites, each a `.md` explaining
   the feature next to the extracted source file. See
   `catalog/README.md`.

The catalog exists because the sites are a handful of codebases forked
repeatedly: 26 files are byte-identical across 3+ repos and 65 more sit at
the same path in 3+ repos and have diverged. It records which copy is
canonical and what each other one is missing.

### Rules that apply to the catalog only

- **Extracted files are byte-identical to their source.** No provenance
  header, no reformatting, no rewritten import. Provenance lives in
  `catalog/PROVENANCE.tsv`, so adopting a file into a site is a copy and
  checking it for drift is a `diff`. Editing an extracted file in place
  breaks both.
- **A file only lands here if it typechecks under `strict` with nothing but
  its external packages.** A file needing an app-internal import is not a
  shared piece yet — document it in place and say what couples it, as
  `catalog/rss-pc20/feed-parsing.md` does.
- **Run `catalog/check-drift.sh` before trusting an entry**, and after
  adding one.

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

`catalog/nostr/favorites-10333.md` tracks where the two currently agree and
differ, read at a recorded commit. Update it rather than restating a
divergence here, and re-read both apps before trusting it — as of
2026-08-16 they still disagree on item order, which means the event is being
rewritten back and forth in production.

## The implementation repos are read-only

Every repo under `~/Vibe` other than this one — `boostmebitch`,
`stablekraft-app`, the Lightning sites, the MSP pair, all of them — is a
source to read, never a target to change: no edits, no commits, no branches,
no PRs, no "while I'm in here" fixes. Read them as much as a claim requires —
that is how one gets verified — but what comes back lands here, as spec text,
a catalog entry or a known-gap note, never as a patch over there.

**Never `git pull` in one.** A pull rewrites the working tree.
`musicL-playlist-updater` has thousands of uncommitted files sitting in it,
and a pull there destroys work that exists nowhere else.

## Read `origin/HEAD`, never the local checkout

The clones under `~/Vibe` are not current. When the catalog was built, **9 of
15 were behind their remote** — `TRM-Lightning` by 19 commits, both kind-10333
implementations by 2 and 3 — and `MSP-2.0` and `Helipad-to-Nostr-BoostBot`
were sitting on feature branches rather than their default branch.

So a claim verified by reading `~/Vibe/<repo>/lib/thing.ts` is a claim about
whatever happened to be checked out, and it will be wrong about half the time.
This is not hypothetical: the first draft of
`catalog/nostr/favorites-10333.md` reported four bugs in stablekraft's merge
that had already been fixed upstream.

```bash
git -C ~/Vibe/<repo> fetch origin --quiet          # touches .git/refs only
git -C ~/Vibe/<repo> show origin/HEAD:<path>
git -C ~/Vibe/<repo> rev-parse --short origin/HEAD # the SHA to record
```

`fetch` never modifies a working tree, so this stays inside the read-only
rule.

**Record the SHA in the entry.** A row without one is unverified and must say
so — a stale example is worse than none, because it will be trusted and it
will be wrong. With the SHA, checking is one command:
`git -C ~/Vibe/<repo> diff <sha> origin/HEAD -- <path>`.

**Do not trust one implementation's comments about another.** Both apps carry
headers describing how the other one behaves, and both are out of date. Go
and read the other one.

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
