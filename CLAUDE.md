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

A **reference repo with four parts**, none of which is an application.

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
3. **The conformance suite.** `conformance/` — the favorites spec's 28 test
   vectors, executable. `node --test conformance/vectors.test.mjs` (name the
   file, not the directory: `node --test conformance/` fails to resolve on
   Node 22). Zero dependencies, no build step. An implementer points the
   adapter at their own merge and runs the same 28. The reference under
   `conformance/reference/` is **authored** — it has never served traffic, and
   it is there so the assertions have something to run against.
4. **The catalog.** `catalog/` — working features from ChadFarrow's
   Podcasting 2.0 sites, packaged so someone else can add them to their own
   app. Four parts: `recipes/` (the front door), `modules/` (shared source),
   `comparisons/` (why each shipped copy won), `analysis/` (the scripts
   behind every number). See `catalog/README.md`.

One page sits outside those four. `pc20-favorites-feed-guid-migration.md` says
what `stablekraft-app` and `boostmebitch` each have to change so an item entry
carries the guid of its feed, read at `4722dd8` and `938f90d`. It is the only page here
that tells another repo what to do, and it is a **plan, not an extraction** —
no line of it has run in either app. It is therefore the page that rots
fastest: every line number in it is a claim about a file this repo does not
own. Re-read before trusting it, correct it or delete it, and never let it
imply either app agreed to any of it.

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

**On 2026-08-25 the two went out of step in a way the spec says destroys data,
and it was closed the same night.** Recorded because the window was real, the
order it happened in is the thing to learn from, and a reader who finds only the
happy ending will not know why the rule is worded the way it is.

§4 requires `content` to come back byte for byte, and the private-half section
requires that carry to ship in *both* apps before either starts encrypting. It
did not happen in that order. `stablekraft-app` shipped a NIP-44 ciphertext into
`content` and switched a real account to private while `boostmebitch@edffe3c`
still hardcoded `content: ''` in `publishFavoritesTags` and never read
`event.content` at all. For about an hour, one favorite toggled in boostmebitch
would have erased 436 encrypted entries — silently, on someone else's device,
with no undo, on a replaceable event that keeps no history. Exactly the loss §4
exists to prevent, reached by shipping the halves in the wrong order rather than
by getting any rule wrong.

Both now carry it: `boostmebitch@791dae6` (#222, #232) and `stablekraft-app@75a8fbf0`
(#225, #226, #227). The spec gained the rule that had been missing —
`content` is carried, not only tags (#23) — and the rule that the near miss
argued for: the privacy choice belongs to the LIST, not the app (#25), because
the first attempt at it left a user 97% private with nothing on screen naming
the rest.

**Do not read that as "both apps agree" and stop checking.** They agree on this,
today, at those two SHAs. The sentence to avoid is still the general one.

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

- **An entry names its own feed; only `medium` is positional.** An item tag
  is `["i", itemId, feedGuid]`, so sorting or rebuilding the array cannot
  reattach it. `medium` is still a running value applying to every entry after
  it, so a reorder costs a wrong label — which a Podcast Index lookup
  corrects — rather than a wrong feed, which nothing corrected. The old rule
  was the reverse and it is the reason this one is written down.
- **An item guid is not an address.** `<podcast:guid>` is globally unique by
  construction and outlives the feed URL; an item's `<guid>` is unique only
  inside its feed, which is why `/episodes/byguid` demands a feed identifier
  beside it. So position 2 is mandatory on an item entry, identity is the
  PAIR — dedupe or claim on the item guid alone and two items in two feeds
  fold into one — and a writer that rebuilds entries as `["i", id]` does not
  drop a label, it makes those favorites unresolvable by everyone forever.
- **One favorite, one tag.** A feed entry appears only when the user favorited
  the feed. Nothing is on the list for structural reasons, so there is no
  favorite-versus-placement question and no marker to answer it. A brief
  revision of the spec had one at position 2; the feed guid took the slot,
  because that was the value actually missing.
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
- **A normative rule needs a vector, and a vector needs a case.** A new
  "you must do X" in `pc20-favorites.md` earns a numbered entry under **Test
  vectors**, and that entry earns a case in `conformance/vectors.test.mjs`
  with the same number. The 14 vectors were prose for the document's whole
  life, and in that time both apps discovered the same class of defect by
  shipping it to a real user. A rule nobody can run is a rule the next
  implementer learns the expensive way.
- **A vector that no mutation can kill is not a vector.** Before adding one,
  break the reference on purpose and confirm yours is what fails.
  `conformance/README.md` carries the matrix; every one of the 28 is killed by
  at least one mutation, and the first two rows of that table are the defects
  that actually reached production on 2026-08-25.
- **The feed-guid migration has shipped data behind it, unlike the marker.**
  Every list in production writes items as two elements. A reader must accept
  both forms — three elements means the feed guid is at position 2, two means
  it comes from the feed entry above, as before — and a writer fills it in on
  its next publish. Both apps must read position 2 before either stops writing
  the placement feed entries, or a reader still on the old rules loses every
  item whose feed entry disappeared.
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
