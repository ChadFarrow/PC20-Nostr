# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## Reporting Language

Write every reply to the user in ASD-STE100 Simplified Technical English.

- Use only approved STE words, and use one meaning for each word.
- Write short sentences: 20 words maximum for an instruction, 25 for a
  description.
- Give one instruction in each sentence.
- Use the active voice and simple verb tenses.
- Do not use a noun cluster of more than three words.
- Keep the articles. Do not use slang, idioms, or jargon.

This rule applies to chat replies only. Code, code comments, commit messages,
pull request text, file contents, and quoted material keep their normal style —
do not rewrite existing prose into STE.

## What this repo is

A **reference repo with three parts**, none of which is an application.

1. **The favorites spec.** `pc20-favorites.md` — an app-neutral format for
   syncing a user's podcast and music favorites between Podcasting 2.0 apps
   over Nostr, as a single replaceable event at kind 10333. The audience is an
   implementer of a *third* app who has only this document. This part is
   **prose only**; there is nothing to build, lint or test in it.
2. **The playback-events spec.** `nip-value-playback-events.md` — kinds
   3369 / 33369 / 23369, for publishing what a streaming-sats or auto-boost
   payment was for, so the metadata reaches something other than the
   recipient's Lightning node. Also prose only, and **much earlier than the
   favorites spec**: as of 2026-08-25 no allowlisted repo implements these
   kinds on its default branch — only `boostmebitch`, on the unmerged branch
   `claude/new-relay-type-draft-6osmum`. Read its privacy section first.
   Per-track receipts under a listener's own key are a public timestamped
   listening history, and "share my boosts" is not consent for that.
3. **The catalog.** `catalog/` — working features from ChadFarrow's
   Podcasting 2.0 sites, packaged so someone else can add them to their own
   app. Four parts: `recipes/` (the front door), `modules/` (shared source),
   `comparisons/` (why each shipped copy won), `analysis/` (the scripts
   behind every number). See `catalog/README.md`.

The catalog's purpose is to hand one working feature to someone who wants it.
It is **not** a de-duplication project: the five sites share no git history,
and the only real overlap — DoerfelVerse and Project StableKraft — is 6
copy-pasted infrastructure files plus 34 more that have drifted to 13.6%
common.

### Rules that apply to the catalog only

- **Write recipes for a stranger's coding agent, not for Chad.** The reader
  is working in a codebase nobody here has seen, adding one feature they saw
  on a site. They do not care which fork is canonical. They need the files,
  the dependencies, the renames, and what breaks if they skip a step. Save
  the comparison for `comparisons/`.
- **Ship code only from a live site.** The allowlist is `ALLOWED` in
  `catalog/check-recipes.sh`: `ITDV-Lightning`, `boostmebitch`,
  `stablekraft-app`, `MSP-2.0`, `candr.space`. Anything else — unreleased
  prototypes, template clones, third-party forks — is out of scope as a
  source and should not be named in these pages either. A recipe promises the
  feature already works somewhere; code that never served traffic cannot make
  that promise. The rule is written down because code from an unreleased
  prototype reached the catalog before it was.
- **Extracted files are byte-identical to their source.** No provenance
  header, no reformatting, no rewritten import. Provenance lives in
  `catalog/PROVENANCE.tsv`, so adopting a file into a site is a copy and
  checking it for drift is a `diff`. Editing an extracted file in place
  breaks both.
- **A file only lands here if it typechecks under `strict` with nothing but
  its external packages.** A file needing an app-internal import is not a
  shared piece yet — either ship what it imports too, or document it in
  place and say what couples it, as `catalog/comparisons/feed-parsing.md`
  does.
- **A recipe ships the whole import closure.** Run
  `catalog/analysis/feature.py` and compare against `files/`. A missing file
  is the difference between "just add it" and an import error in someone
  else's repo.
- **Never ship a secret in a `NEXT_PUBLIC_` variable.** Next.js inlines every
  `NEXT_PUBLIC_*` value into the browser bundle at build time, so one holding
  a key is served to everybody who loads the page.

  The live sites get the Nostr identity right, and `ITDV-Lightning` shows the
  pattern a recipe should copy: the browser gets
  `NEXT_PUBLIC_SITE_NOSTR_NPUB`, while the nsec stays in `SITE_NOSTR_NSEC`
  and signing happens in `app/api/nostr/publish/route.ts`. That route carries
  a comment recording that the key *used to be* read client-side — the fix,
  not the bug.

  It is not a solved problem though. `ITDV-Lightning/lib/boostbox-service.ts`
  reads `NEXT_PUBLIC_BOOSTBOX_API_KEY`, and is imported by
  `components/BitcoinConnect.tsx` and `contexts/AudioContext.tsx`, both client
  components — so that key is public wherever the variable is set. Grepping
  for `NSEC` alone would have missed it. Check the whole
  `NEXT_PUBLIC_*` surface for anything key-shaped, which is what
  `catalog/check-recipes.sh` does for recipes.
- **A recipe's security claims must be verified before it ships.** The image
  proxy was published with a README stating its guard "rejects non-HTTPS
  targets, private IPv4 and IPv6, localhost and `.internal`". A later review
  found three bypasses — redirects were followed unchecked, `::ffff:` hosts
  defeated the IPv6 test because Node normalises them to hex before the regex
  sees them, and hostnames were never resolved at all. The recipe was
  withdrawn. If a recipe's value proposition is safety, prove the claim
  against the code before writing it down; a stranger's agent copies `files/`
  and may never read the paragraph next to them.
- **Verify a URL before citing it.** `re.podtards.com` appears in
  `ITDV-Lightning/.env.example` and does not resolve; `msp.podtards.com` is
  MSP 2.0's address from before `musicsideproject.com`. A dead "see it
  working here" link discredits everything else on the page.
- **Run both checkers** before trusting or adding an entry:
  `catalog/check-drift.sh` and `catalog/check-recipes.sh --network`.

## The favorites spec is ahead of its implementations, and there are two

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
now wrong more often than it used to be, not less. Name the app, say what it
does, record the SHA you read it at, and keep the rule justified by the
failure it prevents rather than by the fact that someone shipped it.

**As of 2026-08-25 the two are out of step in a way the spec says destroys
data.** §4 requires `content` to come back byte for byte, and the private-half
section requires that carry to ship in *both* apps before either starts
encrypting. It did not happen in that order:

- `stablekraft-app@fbb6612a` writes a NIP-44 ciphertext into `content`
  (`lib/nostr/favorites-privacy.ts`, `lib/nostr/nip44.ts`, and
  `favorites-sync-client.ts:646`), gated by no environment flag, and carries a
  foreign ciphertext it cannot read.
- `boostmebitch@edffe3c` hardcodes `content: ''` in `publishFavoritesTags`
  (`lib/nostr/favorites.ts:129`) and never reads `event.content` at all —
  `favorites-list.ts` does not contain the word.

So a favorite toggled in boostmebitch erases every private entry stablekraft
wrote: silently, on someone else's device, with no undo, on a replaceable
event that keeps no history. That is the exact loss §4 exists to prevent, and
it is not a spec question to re-open. The repos are read-only, so what this
repo does about it is record it and keep the rule stated.

`catalog/comparisons/favorites-10333.md` tracks where the two currently agree
and differ, read at a recorded commit. Update it rather than restating a
divergence here — and re-read both apps first, because that page is now stale:
it is read at `boostmebitch@1f26ba0` and `stablekraft-app@db2eb22f`, and both
have moved (`edffe3c`, `fbb6612a`) with hundreds of lines changed under
`lib/nostr/` in each.

## The implementation repos are read-only

Every repo under `~/Vibe` other than this one — `ITDV-Lightning`,
`boostmebitch`, `stablekraft-app`, `MSP-2.0`, `candr.space` and the rest — is
a source to read, never a target to change: no edits, no commits, no branches,
no PRs, no "while I'm in here" fixes. Read them as much as a claim requires —
that is how one gets verified — but what comes back lands here, as spec text,
a catalog entry or a known-gap note, never as a patch over there.

**Never `git pull` in one.** A pull rewrites the working tree, and at least
one repo under `~/Vibe` is carrying thousands of uncommitted files that exist
nowhere else.

## Read `origin/HEAD`, never the local checkout

The clones under `~/Vibe` are not current. When the catalog was built, **9 of
15 were behind their remote** — one by 19 commits, both kind-10333
implementations by 2 and 3 — and two were sitting on feature branches rather
than their default branch.

So a claim verified by reading `~/Vibe/<repo>/lib/thing.ts` is a claim about
whatever happened to be checked out, and it will be wrong about half the time.
This is not hypothetical: the first draft of
`catalog/comparisons/favorites-10333.md` reported four bugs in stablekraft's merge
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
  from one you removed, carry what you can't parse — `content` included, not
  only tags — and publish only when the bytes change. A change that weakens
  any of those needs to say which data gets destroyed instead.
- **`content` is carried, not only tags.** §4 covers the whole event. A
  writer that has never heard of a private half still republishes the bytes
  it read, verbatim — it has nothing to parse, only bytes to put back.
  Supporting a private half is optional; carrying one is not. A republish
  path whose `content` is a literal rather than a value threaded from the
  read is the bug, and a default parameter is how it gets written.
- **The privacy choice belongs to the list, not to the app.** Whichever half
  holds entries is the mode of the whole list, and every writer puts its
  entries in that half. The direction is asymmetric: public → private *may*
  move another app's entries, because it only reduces exposure and is
  reversible; private → public may not, because it is a disclosure that
  publishes an `i` tag relays index. The other rule — an app moves only what
  it wrote — was tried first: it encrypted 436 entries, left 13 written by a
  second app public and relay-indexed, and said nothing on screen about which
  were which.
- **A baseline answers "your own contribution" once per half.** The half you
  did not publish into has no new contribution, so its claims are carried,
  never recomputed. Recompute them and you claim every entry in that half,
  another writer's included; nothing backs the claim next cycle, so the
  removal test deletes the whole half at once. It takes two cycles to appear —
  the first publish emits correct bytes and only the baseline beside them is
  wrong — so every single-cycle test passes over it.
- **Every kind here is self-assigned, not NIP-allocated**: 10333 for
  favorites, 3369 / 33369 / 23369 for playback events. Say so wherever it
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
