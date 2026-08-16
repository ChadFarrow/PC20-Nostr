# Analysis scripts

The numbers in `../comparisons/` and in every recipe's file list came from
these. They are here so the claims are **re-runnable rather than trusted** —
a comparison you cannot reproduce is an opinion.

All four read exclusively through `git show <ref>:<path>` after a `git fetch`.
None of them touches a working tree, so they stay inside the rule that the
implementation repos are read-only. **Do not add a `git pull` to any of
them**; `musicL-playlist-updater` has thousands of uncommitted files and a
pull there destroys work that exists nowhere else.

```bash
python3 closure.py                     # library-boundary closure, all repos
python3 feature.py ITDV-Lightning      # per-feature closure for one repo
python3 semdiff.py                     # identical / cosmetic / real divergence
python3 magnitude.py                   # how big the real divergence is
```

## What each one answers

### `feature.py <repo>` — "what does a stranger actually have to copy?"

Walks the transitive app-internal import graph from a user-visible entry
point and reports the file count, line count and external packages. This is
what produces a recipe's file list; if the closure and the shipped `files/`
disagree, the recipe is broken.

It is also what separates a drop-in from a lie. The feed validator closes at
1 file and no dependencies. The now-playing bar closes at 20–31 files and
7,438–10,830 lines, which is why it is documented as not-portable instead of
being offered as a recipe.

### `closure.py` — "where is the library boundary?"

Same walk, seeded with the whole V4V/feed surface rather than one feature.
The answer that justified this work: in the four sibling sites, that surface
closes at **13–16 app files and 5–6 external packages** (`bech32`,
`nostr-tools`, `react`, `fs`, `path`). It is not deeply entangled with the
apps. `stablekraft-app` is the outlier — it restructured, so only 2 of 12
seed paths exist there.

### `semdiff.py` — "is the divergence real, or just noise?"

Hashes each copy twice: raw, and again after stripping block comments, line
comments, `console.*` lines and whitespace. A file that differs raw but
agrees normalized is cosmetically diverged and can share one implementation
today.

Result across 17 candidate files: **4 identical, 13 really diverged, 0 purely
cosmetic.** That last number is the honest one — the divergence is not just
logging drift.

### `magnitude.py` — "how big is the real divergence?"

Counting distinct versions says *that* copies differ, not whether that is 3
lines or 300. This measures normalized edit distance against the largest copy
(the likely merge target).

Result: **72.3% of the diverged surface is already common** — 10,781 shared
normalized lines against 4,128 differing. `nwc-service.ts` is 91–92% common,
`boost-to-nostr-service.ts` 95–96%. `feed-manager.ts` and
`LightningContext.tsx` are **100% identical** between NMNU and TRM-Lightning.

## Caveats these scripts do not resolve

- **"Real divergence" is not the same as "meaningful divergence."** A changed
  string constant counts as real here. Telling an app constant apart from a
  behavioural fork still needs someone to read the hunks — that judgement is
  what `../comparisons/` records.
- The import regex resolves `@/…` and relative specifiers. Dynamic
  `await import()` inside a function body is caught, but a computed specifier
  is not, so a closure is a lower bound.
- Line counts include comments; the divergence percentages do not.
