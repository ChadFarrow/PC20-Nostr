# Analysis scripts

The numbers in `../comparisons/` and every recipe's file list came from these.
They are here so the claims are **re-runnable rather than trusted** — a
comparison you cannot reproduce is an opinion.

All four read exclusively through `git show <ref>:<path>` after a `git fetch`.
None touches a working tree, so they stay inside the rule that the site
repos are read-only. **Do not add a `git pull` to any of them** — a pull
rewrites the working tree, and at least one repo under `~/Vibe` is carrying
thousands of uncommitted files that exist nowhere else.

```bash
python3 feature.py ITDV-Lightning   # per-feature closure: what must a stranger copy?
python3 closure.py                  # library-boundary closure across the live sites
python3 overlap.py                  # how much do the live sites actually share?
python3 magnitude.py                # how far apart are the two that do share?
```

## They measure the live sites only

`ITDV-Lightning`, `boostmebitch`, `stablekraft-app`, `MSP-2.0`, `candr.space`.

This matters more than it sounds. An earlier version of this measurement also
included unreleased clones of a starter template. Those clones were nearly
identical to each other by construction, and they dominated every similarity
statistic — producing a headline that the sites were 72.3% common when the
live sites are nothing of the kind. **Comparing copies of a template measures
the template, not the sites.** If you widen the repo list, expect the
similarity numbers to rise and mean less.

## What each one answers

### `feature.py <repo>` — "what does a stranger actually have to copy?"

Walks the transitive app-internal import graph from a user-visible entry point
and reports file count, line count and external packages. This produces a
recipe's file list; if the closure and the shipped `files/` disagree, the
recipe is broken.

It is also what separates a drop-in from a lie. The feed validator closes at 1
file and no dependencies. The now-playing bar closes at 20 files and 7,438
lines, which is why it is documented as not-portable rather than offered as a
recipe.

### `closure.py` — "where is the library boundary?"

The same walk seeded with a whole subsystem rather than one feature, to see
how deeply it is entangled with its app.

### `overlap.py` — "how much do the live sites actually share?"

Across the five live sites, at 2 KB and above:

| | |
|---|---|
| Byte-identical across **3 or more** sites | **0 files** |
| Byte-identical across 2 sites | 6 files |
| Same path in 2 or more sites | 43 files, of which **37 have diverged** |

Every one of the 6 identical files is `ITDV-Lightning` ↔ `stablekraft-app`,
and all 6 are generic infrastructure — `lib/logger.ts`, `lib/error-utils.ts`,
`lib/api-utils.ts`, `components/ErrorBoundary.tsx` and two admin routes.
`candr.space` shares nothing; it has no TypeScript files that size.

So DoerfelVerse and Project StableKraft are the only pair with a real shared
surface, and what they share is plumbing rather than features.

### `magnitude.py` — "how far apart are those two?"

Shared paths say two sites overlap; they do not say the overlap is still
recognisable. On comment- and logging-stripped source, across the 34
shared-but-diverged files:

**13.6% of the diverged surface is still common** — 3,127 identical normalized
lines against 19,833 differing.

The distribution is what matters. A handful of files barely moved —
`lib/hooks/useImageLoader.ts` is 99.3% the same, `lib/feed-manager.ts` 95.3%,
`lib/feed-parser.ts` 95.6%. The features drifted past recognition:
`contexts/AudioContext.tsx` is **2.1% common** at 610 versus 3,166 lines,
`components/AdminPanel.tsx` 5.6% at 425 versus 2,659,
`app/album/[id]/AlbumDetailClient.tsx` 8.3%.

The honest reading: these two sites share no git history at all — the
identical files were copied between projects, not inherited. What they have in
common is a little plumbing, not a maintainable common core. Consolidating the
near-identical utilities would be cheap; consolidating the player would be a
rewrite.

## Caveats these scripts do not resolve

- **"Diverged" is not the same as "meaningfully different."** A changed string
  constant counts. Separating an app constant from a behavioural fork still
  requires reading the hunks — that judgement is what `../comparisons/`
  records.
- The import regex resolves `@/…` and relative specifiers. A computed
  `await import()` specifier is not caught, so a closure is a lower bound.
- Line counts include comments; the divergence percentages do not.
- `overlap.py` compares by path. Code moved to a new path reads as unique to
  each site, so genuine sharing can be undercounted — `stablekraft-app` split
  its RSS parser into a directory, and that split is invisible here.
