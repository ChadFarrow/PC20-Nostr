# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A **specification repo — prose only, no code**. There is nothing to build, lint,
or test here; `README.md` and `specs/*.md` are the entire deliverable. The specs
describe app-neutral formats for connecting Podcasting 2.0 apps over Nostr, so
the audience is an implementer of a *third* app who has only this document.

The one spec today is `specs/pc20-favorites.md` (cross-app podcast favorites via
NIP-78 kind 30078 at `d = podcast:favorites`).

## The spec lives downstream of two implementations

`specs/pc20-favorites.md` is written against two shipping apps in sibling repos —
**Boost Me Bitch** (`~/Vibe/boostmebitch`) and **StableKraft**
(`~/Vibe/stablekraft-app`) — and the "Reference implementations" section at the
bottom names the exact files and test commands in each. That section is a
contract with those repos, not decoration:

- Before changing normative text, check what those implementations actually do.
  Most of this document's hard-won rules (the baseline asymmetries, the
  degraded-read guard, the synthetic-EOSE problem) came from a bug found in
  production, not from design — new claims should come the same way.
- If you touch file paths, test commands, or behaviour attributed to either app,
  verify against that repo. Stale cross-references are the main way this file
  rots.
- The "Test vectors" section is duplicated as real tests in both apps. Changing
  a vector here means changing it in three places.
- **A rule can outrun one app, but say so.** The position-4 medium hint is
  implemented by StableKraft and not by Boost Me Bitch, and the spec's
  "Reference implementations" section says which is which rather than writing
  "both". Boost Me Bitch still truncates `i` tags past position 3 and still has
  a losslessness assertion that passes vacuously, because its fixture is built
  from the same three fields it tests; StableKraft closed both when it added the
  hint. When the second app catches up, those notes are what get deleted — don't
  leave one describing a gap that has closed, and don't let a per-app note decay
  back into "both".

## The implementation repos are read-only

`~/Vibe/boostmebitch` and `~/Vibe/stablekraft-app` are sources to read, never
targets to change: no edits, no commits, no branches, no PRs, no "while I'm in
here" fixes. Read them as much as a claim requires — that is the only way one
gets verified — but what comes back lands here, as spec text or as a known-gap
note, never as a patch over there.

The reason is the circularity this document already warns about one level down.
The spec's authority is that it describes what two apps independently do; a rule
checked against code written to satisfy that rule is checked against nothing.
That is test vector 4's vacuous fixture, one level up — and it fails the same
way: silently, looking like confirmation.

The truncation gap in both apps is the live case. It is documented, not fixed,
and closing it is not this repo's work.

## Invariants a change must not quietly break

These are the load-bearing parts. Edits elsewhere are ordinary prose work; edits
to these need the same care as a code change, because an implementer following a
weakened version loses user data silently:

- **The merge algorithm** (`adds`/`removes`/`next`/`baseline = next ∩ local`) and
  the two asymmetries called out under it (`∪ adds` not `∪ local`;
  `baseline = next ∩ local` not `next`). The worked example must stay
  arithmetically consistent with the pseudocode.
- **The trust rule for reads** — `trustworthy = event_in_hand or (reached > 0 and
  answered == reached)` — and the reasons an aggregate EOSE alone doesn't
  satisfy it.
- **Kind 30078, not NIP-51 kind 30003**, and the reason (a well-behaved bookmark
  client would clobber the list).
- **The membership/hints split.** Membership is decided on raw identifier
  strings alone; reconciling the hints at positions 2–4 is a subordinate pass
  that may never add an entry, remove one, or change its identifier. Every rule
  about hints depends on this separation holding.
- **Tag position semantics** (1 = identifier/merge key, 2 = feed URL hint,
  3 = parent `podcast:guid` extension, 4 = advisory `<podcast:medium>`), the
  hold-open-with-empty-string rule for skipped positions, and deriving `k` tags
  from the recognized-kinds table and position 1 only — never by scanning for a
  colon, never from position 4.
- **Overlay, don't rebuild**, and **sticky hints** (a non-empty hint you didn't
  write is not yours to change; the alternative makes two apps rewrite the event
  against each other forever). These are what keep position 4 from being a
  liability.

## Conventions

- **Voice.** Second person to the implementer, normative and specific, with the
  failure mode named — "do X, because otherwise Y is silently lost". Prefer
  stating the bug that motivated a rule over abstract justification. Keep the
  existing hard-wrapped prose (~80 cols).
- **Branches.** `spec/<topic-in-kebab-case>` off `main`, merged via PR — e.g.
  `spec/aggregate-eose-is-not-an-answer`.
- **Commits.** Subject is a claim, not a changelog line ("Aggregate EOSE is not
  proof the read happened"). The body is long-form: what was believed, what was
  measured, what changed, and any measurements with real numbers. See `4b40e65`
  for the house style.
- **Review what you're committing.** `git status` and `git show --stat` before
  and after. There is no `.gitignore` here, so an editor swap file or a
  `.DS_Store` goes in with the prose and stays in the history.
