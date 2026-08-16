# Catalog

Working features from ChadFarrow's Podcasting 2.0 sites, packaged so someone
else can add them to their own app.

**If you saw something on one of these sites and want it, go to
[`recipes/`](recipes/).** The rest of this directory is how the code in there
was chosen.

```
recipes/      ← start here. One directory per feature, with install steps
modules/      shared source used across features
comparisons/  why each shipped copy won, and what it is missing
analysis/     the scripts that produced every number on this page
```

## The sites

Every recipe's code comes from one of these, and every URL was checked over
HTTP rather than taken from a README:

| Site | URL | Repo |
|---|---|---|
| DoerfelVerse | <https://itdv.podtards.com> | `ITDV-Lightning` |
| Boost Me Bitch | <https://boostmebitch.com> | `boostmebitch` |
| Project StableKraft | <https://stablekraft.app> | `stablekraft-app` |
| MSP 2.0 | <https://musicsideproject.com> | `MSP-2.0` |
| Chad and Reeds Podcast | <https://candr.space> | `candr.space` |

Related, GitHub-only: [`lnurl-test-feed`](https://github.com/ChadFarrow/lnurl-test-feed)
and [`boostbox`](https://github.com/ChadFarrow/boostbox), a self-hosted
Podcasting 2.0 boost-metadata service.

**Test deployments are not sources.** `TRM-Lightning`, `NMNU` and
`lnaddress-music` are test sites; their code is compared here but never
shipped, because a stranger installing a recipe should get something real
users have exercised. `check-recipes.sh` enforces this — it was written after
three files were extracted from a test site by mistake.

## Why this exists

These sites are not independent codebases. They are a handful of codebases
forked repeatedly, and the copies no longer agree.

Hashing every non-vendored `.ts`/`.tsx` of 2 KB or more: **26 files are
byte-identical across three or more repos, and 65 more sit at the same path in
three or more repos and have diverged.** Six repos carry six different
versions of `contexts/AudioContext.tsx` — 4884, 3701 and 417 lines among
them.

So "how do we resolve a Lightning address?" has four answers in four repos and
three of them are missing LUD-12. Somebody has to write down which one is
right, or the question gets re-answered differently every time.

## How much of the divergence is real

Not a summary — a measurement, reproducible via [`analysis/`](analysis/):

| | |
|---|---|
| Identical across the fork family | `webln-service.ts`, `zap-receipt-service.ts`, `logger.ts`, `error-utils.ts` |
| Really diverged | 13 of 17 candidate files — **none** purely cosmetic |
| Of the diverged surface | **72.3% of normalized lines are already common** (10,781 shared vs 4,128 differing) |

`nwc-service.ts` is 91–92% common across four copies with an identical public
API; `boost-to-nostr-service.ts` 95–96%. Some of what looks like divergence is
dependency skew — the `subscribeMany` filter arity tracks `nostr-tools`
versions 2.16.2 through 2.23.9, not anybody's design decision.

## Fork lineage

From shared git objects, not from names:

| Pair | Shared commits | Meaning |
|---|---|---|
| `stablekraft-app` ↔ `StableKraft-Nostr-Fix` | 2971 | The same repo; the Fix is a stale snapshot |
| `MSP-2.0` ↔ `MSP-2.0-Desktop-App` | 500 of 501 | Desktop is downstream **and ahead** |
| `ITDV-Lightning` ↔ `lnaddress-music` | 193 | A true fork |
| `TRM-Lightning`, `NMNU` | 0 | **Not** forks of each other — siblings of `RSS-music-site-template` |

## Rules this directory is held to

Two scripts, both runnable:

```bash
./check-drift.sh              # has any extracted file drifted from its source?
./check-recipes.sh            # are the recipes safe to hand a stranger?
./check-recipes.sh --network  # ...and does every "seen on" link still answer?
```

**Extracted code is byte-identical to its source.** No added header, no
reformatting, no rewritten import. Provenance lives in `PROVENANCE.tsv`, so
adopting a file is a copy and checking it is a `diff`.

**A file only ships if it compiles alone**, under `strict`, with nothing but
its external packages. A file needing an app-internal import is not a shared
piece yet — it gets documented in place instead, as
[`comparisons/feed-parsing.md`](comparisons/feed-parsing.md) does for the RSS
parsers.

**Read `origin/HEAD`, never the local checkout.** When this was built, 9 of 15
clones under `~/Vibe` were behind their remote and two were not on their
default branch. A pick made from a working tree is a pick from whatever
happened to be checked out.

```bash
git -C ~/Vibe/<repo> fetch origin --quiet    # touches .git/refs only
git -C ~/Vibe/<repo> show origin/HEAD:<path>
```

**Never `git pull` in one of those repos.** `musicL-playlist-updater` has
thousands of uncommitted files; a pull there destroys work that exists nowhere
else.

**Name the app.** Never "the sites do X" — with six forks in play that
sentence is wrong more often than right, which is the entire reason this
directory exists.

## Not covered

The app shell and player are the most duplicated code in the set and none of
it is here: `contexts/AudioContext.tsx` is 4884 lines and the now-playing bar
closes at 20 files and 7,438 lines. RSS parsing is compared but not shipped —
every parser imports its own app's siblings.

No split/TLV code ships either. The safest implementation is a third-party
fork, and the only production copy hardcodes an app name and two feed IDs. See
[`comparisons/boostagram-tlv.md`](comparisons/boostagram-tlv.md).
