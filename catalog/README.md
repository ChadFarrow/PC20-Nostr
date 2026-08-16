# Feature catalog

Canonical implementations of the features that appear in more than one of
ChadFarrow's sites, with the code beside the prose.

This exists because the sites are not independent codebases. They are a
handful of codebases forked repeatedly, and the copies no longer agree. When
you ask "how do we resolve a Lightning address?", there are four answers in
four repos and three of them are missing something. This directory records
which one is right and what the others are missing.

Read [Overlap](#overlap) for the map, then the feature doc for whatever
you're about to touch.

## How to use a catalog entry

Each feature is a pair: a `.md` explaining it, and the extracted source file
beside it. The `.md` is what you read. The `.ts` is byte-identical to the
repo it came from — no header was added, no import was rewritten — so
adopting it into a site is a copy, and checking it for drift is a `diff`.

`PROVENANCE.tsv` records the repo, ref, commit and path every file was taken
from. `./check-drift.sh` reads that manifest and tells you whether any
extracted file has been edited here or moved upstream.

```
./check-drift.sh          # all catalog files current
```

## Extracted code must compile on its own

A file only lands here if it typechecks under `strict` with nothing but its
**external** packages available. That is the whole admission test: a file
that needs an app-internal import is not a shared piece yet, it is a piece of
one app, and copying it into a second app drags the app along with it.

Files that fail the test are still documented — the doc cites them in place
and says what couples them. `MSP-2.0/src/utils/xmlParser.ts` is the clearest
case: it is the best feed parser in any of these repos and the only one with
real tests, and it imports five sibling modules, so it is cited and not
extracted.

Current state: all 8 extracted files typecheck clean under `strict: true`
with only `bech32`, `nostr-tools` and `@types/node` installed.

## Overlap

### The sites are six codebases, not thirty-five

Established from shared git objects, not from names:

| Pair | Shared commits | What it means |
|---|---|---|
| `stablekraft-app` ↔ `StableKraft-Nostr-Fix` | 2971 | The same repo. Both begin at `9a9375d3` (2025-07-21) and split at `76ed7512` (2026-04-14). The Fix is a stale snapshot; don't mine it. |
| `MSP-2.0` ↔ `MSP-2.0-Desktop-App` | 500 of 501 | Desktop is downstream **and ahead**. Check Desktop before treating MSP-2.0 as canonical. |
| `ITDV-Lightning` ↔ `lnaddress-music` | 193 | A true fork. Identical first commit, "Initial commit - ITDV Lightning" (2025-09-06). |
| `TRM-Lightning`, `NMNU` | 0 | **Not** forks of each other — siblings. TRM's first commit is literally "Initial commit: RSS Music Site Template". |
| `podroll-atlas` ↔ `music-atlas` | squashed | `music-atlas` is the fork; `index.html` differs by 47 lines. |

On GitHub, `HPM-Lightning`, `ITDV-Site` and `RSS-music-site-template` all
carry the same package version `1.2a587df`, and `ITDV-Lightning`'s
package.json is *named* `hpm-lightning`.

### How far the copies have drifted

Hashing every non-vendored `.ts`/`.tsx` of 2 KB or more:

- **26 files are byte-identical across 3 or more repos.** `lib/logger.ts`,
  `lib/monitoring.ts`, `lib/error-utils.ts` and `components/ErrorBoundary.tsx`
  are the same bytes in all six of ITDV-Lightning, NMNU, StableKraft-Nostr-Fix,
  TRM-Lightning, lnaddress-music and stablekraft-app.
- **65 files sit at the same path in 3 or more repos and have diverged.**

The diverged ones are the expensive half. Six repos carry six different
versions of `contexts/AudioContext.tsx` (4884 / 3701 / 417 lines),
`components/AlbumCard.tsx`, `components/NowPlayingScreen.tsx`,
`lib/url-utils.ts`, `app/api/proxy-image/route.ts` (466 / 421 / 97 lines) and
`app/api/publishers/route.ts`. `hooks/useNWC.ts` is four repos and four
versions; `lib/feed-parser.ts` is six repos and four versions.

### Canonical picks

Verified at `origin/HEAD`, not against a local checkout — see
[Never read the local checkout](#never-read-the-local-checkout).

| Feature | Canonical | Doc |
|---|---|---|
| WebLN client | identical in 4 repos | [webln-client.md](lightning/webln-client.md) |
| NWC client | `lnaddress-music` | [nwc-client.md](lightning/nwc-client.md) |
| LNURL-pay | `lnaddress-music` | [lnurl-pay.md](lightning/lnurl-pay.md) |
| Boostagram TLV | `libre-listener-wallet-monorepo` | [boostagram-tlv.md](lightning/boostagram-tlv.md) |
| Zap receipts | identical in 4 repos | [zap-receipts.md](lightning/zap-receipts.md) |
| Trustworthy relay read | `boostmebitch` | [trustworthy-read.md](nostr/trustworthy-read.md) |
| Kind 10333 favorites | `boostmebitch` | [favorites-10333.md](nostr/favorites-10333.md) |
| Podcast Index auth | `MSP-2.0` | [podcast-index-auth.md](rss-pc20/podcast-index-auth.md) |
| RSS feed parsing | `MSP-2.0-Desktop-App` (cited, not extracted) | [feed-parsing.md](rss-pc20/feed-parsing.md) |

### Not covered yet

The app shell and player are the most duplicated code in the whole set and
none of it is here. `AudioContext.tsx` at 4884 lines is not extractable
without being broken up first, and breaking it up is a change to an
implementation repo, which this repo does not make.

RSS feed *parsing* is documented but not extracted, for the same reason —
every parser in every repo imports its own app's siblings.

## Never read the local checkout

Every canonical pick in this directory was read through `origin/HEAD`. That
is not fussiness. When this catalog was built, **9 of 15 clones under
`~/Vibe` were behind their remote** — including both kind-10333
implementations. `TRM-Lightning` was 19 commits behind. `MSP-2.0` and
`Helipad-to-Nostr-BoostBot` were not even on their default branch.

So a canonical pick made by reading `~/Vibe/<repo>/lib/thing.ts` is a pick
made from whatever happened to be checked out, and it will be wrong roughly
half the time.

```bash
git -C ~/Vibe/<repo> fetch origin --quiet
git -C ~/Vibe/<repo> show origin/HEAD:<path>
git -C ~/Vibe/<repo> rev-parse --short origin/HEAD
```

`fetch` writes only to `.git/refs` and never touches the working tree, which
keeps this inside the rule that implementation repos are read-only.

**Do not `git pull` in one of these repos to "get current".** A pull rewrites
the working tree. `musicL-playlist-updater` has thousands of uncommitted
files sitting in it; a pull there destroys work that exists nowhere else.

## A row without a commit SHA is unverified

Say so, in the row. A stale example is worse than no example, because it will
be trusted and it will be wrong. The SHA is what makes the claim checkable a
month from now:

```bash
git -C ~/Vibe/<repo> diff <sha> origin/HEAD -- <path>
```

Empty output means the doc still describes the code.

## Name the app

Do not write "the sites do X". With six forks in play that sentence is wrong
more often than it is right — the whole reason this directory exists is that
they *don't* do the same thing. Name the app, say what that app does, and
say what the difference costs.
