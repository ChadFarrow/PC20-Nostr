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
3. **The conformance suite.** `conformance/` — the favorites spec's 31 test
   vectors, executable. `node --test conformance/vectors.test.mjs` (name the
   file, not the directory: `node --test conformance/` fails to resolve on
   Node 22). Zero dependencies, no build step. An implementer points the
   adapter at their own merge and runs the same 31. The reference under
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

Both implementations went live on 2026-08-13: `~/stablekraft-app`
publishes and reads kind 10333 in production, and `~/boostmebitch`
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
divergence here.

**Its code claims are current; its conclusions are not.** Checked 2026-09-07:
the page reads `boostmebitch@76e1fe6` and `stablekraft-app@95d0a2fa`, and the
three files it actually reads — `lib/nostr/favorites-list.ts`,
`lib/nostr/favorites-single-list.ts`, `lib/nostr/favorites-privacy.ts` — are
byte-identical at those SHAs and at today's `origin/HEAD` (`c483ae8`,
`4722dd8`), despite 57 and 17 commits landing in between. An earlier revision
of this file named two different SHAs and said hundreds of lines had moved
under `lib/nostr/`; both claims were wrong, which is what a SHA in an entry is
for.

What HAS moved is the spec beneath them. Neither app has adopted the feed guid
on the item, the banded runs, or the reframed rule 5, so the page compares two
codebases against a document they now trail. Re-read before trusting a
conclusion, not because the code drifted but because the standard did.

## The implementation repos are read-only

Every repo beside this one — `ITDV-Lightning`, `boostmebitch`,
`stablekraft-app`, `MSP-2.0`, `candr.space` and the rest — is a source to
read, never a target to change: no edits, no commits, no branches, no PRs, no
"while I'm in here" fixes. Read them as much as a claim requires — that is how
one gets verified — but what comes back lands here, as spec text, a catalog
entry or a known-gap note, never as a patch over there.

**Never `git pull` in one.** A pull rewrites the working tree, and at least
one of these repos is carrying thousands of uncommitted files that exist
nowhere else.

### Where they are, and which are not here at all

They sit **directly in `~`**, one directory per repo, beside `~/PC20-Nostr`.
Not under `~/Vibe`; an earlier revision of this file said that and no such
directory exists. Two of the paths do not match the repo name:

| repo | path | note |
|---|---|---|
| `boostmebitch` | `~/boostmebitch` | |
| `stablekraft-app` | `~/stablekraft-app` | |
| `MSP-2.0` | `~/MSP 2.0` | **a space, not a hyphen** — quote it |
| `ITDV-Lightning` | — | **not cloned here** |
| `candr.space` | — | **not cloned here**, and private on GitHub |

`~/boostbox-1` is the clone of `ChadFarrow/boostbox`, which is not on the
allowlist either way. Checked 2026-09-07: 17 repos in `~`, none named `Vibe`.

**Two allowlisted sources are missing, and that is a fact to state rather than
route around.** Read them over the API instead — read-only, and it answers
`origin/HEAD` directly rather than a stale checkout:

```bash
gh api repos/ChadFarrow/<repo>/commits/main --jq '.sha[0:7]'      # the SHA
gh api repos/ChadFarrow/<repo>/contents/<path> --jq '.content' | base64 -d
```

Do not clone one to make a claim easier without being asked. A catalog entry
whose source cannot be read at a recorded SHA is unverified and must say so.

**Known gap: the catalog scripts still hardcode `~/Vibe`.**
`catalog/check-drift.sh` defaults `ROOT` to `$HOME/Vibe`, and `closure.py`,
`feature.py`, `magnitude.py` and `overlap.py` each set
`VIBE = os.path.expanduser("~/Vibe")`. Repointing the base is not enough on
its own either: they build `<root>/<repo name>`, which misses `~/MSP 2.0`, and
they name all five repos, two of which are not cloned here.

Measured on 2026-09-07, so use these results rather than re-deriving them:

- `./catalog/check-recipes.sh --network` — **passes**, all 10 checks. It reads
  only this repo, so the path has no effect on it.
- `./catalog/check-drift.sh ~` — **exit 1**. `PROVENANCE.tsv` has 14 rows: the
  2 `boostmebitch` rows verify clean, and the other 12 report `MISSING REPO`
  (11 `ITDV-Lightning`, not cloned; 1 `MSP-2.0`, whose directory has a space).
  Run without the `~` argument it reports all 14 as missing.

So the drift checker cannot currently confirm 12 of 14 extracted files, and a
number produced by an `analysis/` script has not been reproduced on this
machine. Say that rather than quoting either as verified.

## Read `origin/HEAD`, never the local checkout

The local clones are not current. When the catalog was built, **9 of 15 were
behind their remote** — one by 19 commits, both kind-10333 implementations by
2 and 3 — and two were sitting on feature branches rather than their default
branch.

So a claim verified by reading `~/<repo>/lib/thing.ts` is a claim about
whatever happened to be checked out, and it will be wrong about half the time.
This is not hypothetical: the first draft of
`catalog/comparisons/favorites-10333.md` reported four bugs in stablekraft's merge
that had already been fixed upstream.

```bash
git -C ~/<repo> fetch origin --quiet          # touches .git/refs only
git -C ~/<repo> show origin/HEAD:<path>
git -C ~/<repo> rev-parse --short origin/HEAD # the SHA to record
```

`fetch` never modifies a working tree, so this stays inside the read-only
rule.

**Record the SHA in the entry.** A row without one is unverified and must say
so — a stale example is worse than none, because it will be trusted and it
will be wrong. With the SHA, checking is one command:
`git -C ~/<repo> diff <sha> origin/HEAD -- <path>`.

**Do not trust one implementation's comments about another.** Both apps carry
headers describing how the other one behaves, and both are out of date. Go
and read the other one.

## Invariants a change must not quietly break

- **An entry names its own feed; only `medium` MEANS anything positionally.**
  An item tag is
  `["i", "podcast:guid:<feedGuid>", "podcast:item:guid:<itemGuid>"]` —
  `<podcast:remoteItem>` as one tag, required `feedGuid` then optional
  `itemGuid`, both as full NIP-73 identifiers — so sorting or rebuilding the
  array cannot reattach it. `medium` is still a running value applying to every
  entry after it, so a reorder costs a wrong label — which a
  Podcast Index lookup corrects — rather than a wrong feed, which nothing
  corrected. The old rule was the reverse and it is the reason this one is
  written down.
- **Order is prescribed, not preserved, and only the rule above makes that
  possible.** Each `medium` run is emitted in four bands: items naming no feed,
  then artists, then albums and podcasts, then items grouped by the feed they
  name. Read order stands inside a band and a new entry goes at the end of its
  band. The earlier rule was "keep what you read, append yours", whose failure
  mode needs two apps imposing DIFFERENT orders — one order in the document
  converges even against a writer that does not sort, because that writer keeps
  what it read. Two exceptions carry the whole risk: an item naming no feed
  goes in band 0, because banding it in behind an album silently hands it that
  album's guid; and a run holding a tag you cannot classify is emitted in wire
  order, because a tag with no kind has no band.
- **An item guid is not an address.** `<podcast:guid>` is globally unique by
  construction and outlives the feed URL; an item's `<guid>` is unique only
  inside its feed, which is why `/episodes/byguid` demands a feed identifier
  beside it. So position 2 is mandatory on an item entry, identity is the
  PAIR — dedupe or claim on the item guid alone and two items in two feeds
  fold into one — and a writer that rebuilds entries as `["i", id]` does not
  drop a label, it makes those favorites unresolvable by everyone forever.
- **A feed favorite and an item favorite differ only in length.** Both carry
  `podcast:guid:<feedGuid>` at position 1, exactly as `remoteItem` uses one
  required attribute for both. Three things follow. A key, dedupe or lookup on
  position 1 alone folds a feed favorite together with every item favorite
  under it. An entry's KIND is the kind of its LAST identifier — position 2
  when there is one — or `#k` discovery stops finding item favorites at all.
  And a position 2 you cannot read makes the entry unreadable, never a feed
  favorite: guess and a newer writer's entry becomes a followed show.
- **Relays index position 1, which is now the feed guid for both.** So `#i`
  for a feed returns the feed favorite and every item favorite from it
  together, there is no per-item filter on these kinds, and publishing one
  saved episode puts the show into that index. A kind:1 boost note still tags
  the episode as `podcast:item:guid:<itemGuid>`, so a `#i` written for one
  does not find the other — say so rather than letting it be discovered.
- **One favorite, one tag.** A feed entry appears only when the user favorited
  the feed. Nothing is on the list for structural reasons, so there is no
  favorite-versus-placement question and no marker to answer it. A brief
  revision of the spec had one at position 2; the item guid took the slot,
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
  only tags — and publish only when the bytes change, NORMALISED first (see
  below). A change that weakens any of those needs to say which data gets
  destroyed instead.
- **A move between halves runs rule 3 like any other cycle.** The pass that
  reads one half and emits it into the other looks like a copy, and a writer
  that codes it as one keeps every entry it reads — including the one this
  device claims and no longer holds, which is a removal the user made. That is
  not a removal delayed by a cycle. The baseline written beside the move cannot
  claim an entry the device does not hold, so nothing later can drop it, and
  the favorite comes back on every device for good. THREE passes move entries
  between halves and the rule is the same in all three: the two whole-list
  moves, where the flag doing it had no other effect — the ordinary rule
  already carries an entry you neither hold nor claim, so "adopt everything"
  only ever meant "suppress removals" — and the claim-back, where an app takes
  back what its own baseline names. A claim is not a favorite. The claim-back
  is the one that is worse than a stale entry: it PUBLISHES the removal, as an
  `i` tag relays index, on the one path that exists because a disclosure cannot
  be undone. Vector 29, issues #37 and #39.
- **"Only when the bytes change" means the REFRAMED bytes.** Compare your
  merged array against the read put back through your own framing —
  regenerated `alt`, its own `visibility`, regenerated trailing `k` — never
  against the array as it arrived. Two conforming events differ: a reader must
  accept a `k` beside every `i` while a writer must emit one `k` per distinct
  kind at the end, and the positions of `alt` and `visibility` and the order of
  the `k` tags are free besides. Compare raw and every load of a list the other
  app wrote reports a change on a list nothing changed about; if that app
  compares raw too, neither ever stops — the failure rule 5 exists to prevent,
  reached by obeying its first sentence. Normalise exactly what carries no
  meaning: `medium` stays positional, band order is prescribed so both writers
  reach it anyway, and an unparseable entry is carried untouched, so a real
  difference still shows as one. The document said the wrong thing here for its
  whole life and the reference was right the whole time; that drift is why the
  comparison site now carries a comment naming the case.
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
  CARRYING A CLAIM IS NOT KEEPING IT ALIVE PAST ITS ENTRY, though. A writer
  edits the inactive half too — the claim-back removes entries from it, a
  whole-list move empties it — and a claim left behind by either can never be
  satisfied again, so the only thing it still does is fire the removal row on
  the next app that writes that entry there. Retire it when the entry is gone
  from that half AND you no longer hold it; either alone keeps it, because an
  entry you hold needs its claim as the resurrection guard. Retiring only ever
  removes claims, so it cannot claim what is not yours. Vector 31, issue #41.
- **A normative rule needs a vector, and a vector needs a case.** A new
  "you must do X" in `pc20-favorites.md` earns a numbered entry under **Test
  vectors**, and that entry earns a case in `conformance/vectors.test.mjs`
  with the same number. The 14 vectors were prose for the document's whole
  life, and in that time both apps discovered the same class of defect by
  shipping it to a real user. A rule nobody can run is a rule the next
  implementer learns the expensive way.
- **A vector that no mutation can kill is not a vector.** Before adding one,
  break the reference on purpose and confirm yours is what fails.
  `conformance/README.md` carries the matrix; every one of the 31 is killed by
  at least one mutation, and the first two rows of that table are the defects
  that actually reached production on 2026-08-25.
- **The feed-guid migration has shipped data behind it, unlike the marker.**
  Every list in production writes items as two elements. A reader must accept
  both forms — `["i","podcast:guid:F","podcast:item:guid:X"]` is an item
  entry, while a two-element `["i","podcast:item:guid:X"]` takes its feed from
  the entry above, as before — and a writer rewrites the WHOLE tag on its next
  publish, moving the identifier to position 2 rather than appending. Both
  apps must read the three-element form before either writes it: a reader
  still on the old rules does not merely lose such an entry, it reads
  `podcast:guid:F` at position 1 and turns one saved episode into a favorite
  of the whole show.
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
