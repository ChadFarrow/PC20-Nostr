# PC20-Nostr

Two things, both reference material for building Podcasting 2.0 apps.

## [catalog/recipes/](catalog/recipes/) — take a feature and use it

Saw something on one of these sites and want it in your own app? Point your
coding agent at [`catalog/recipes/`](catalog/recipes/).

Each recipe holds the working code — byte-identical to what is running in
production, not a tidied-up illustration — plus a manifest listing its
dependencies, where each file goes, and which constants you must rename.

| Recipe | Files | Install | Seen on |
|---|---|---|---|
| [Podcasting 2.0 feed validator](catalog/recipes/pc20-feed-validator/) | 1 | nothing | [itdv.podtards.com/feed-validator](https://itdv.podtards.com/feed-validator) |
| [PWA install prompt](catalog/recipes/pwa-install-prompt/) | 2 | nothing | [itdv.podtards.com](https://itdv.podtards.com) |

The sites: [DoerfelVerse](https://itdv.podtards.com),
[Boost Me Bitch](https://boostmebitch.com),
[Project StableKraft](https://stablekraft.app),
[MSP 2.0](https://musicsideproject.com),
[Chad and Reeds Podcast](https://candr.space).

## [pc20-favorites.md](pc20-favorites.md) — the spec

An app-neutral format for syncing a user's podcast and music favorites between
Podcasting 2.0 apps over Nostr, as a single replaceable event at kind
**10333**. The audience is an implementer of a *third* app who has only this
document.

It is authored, not extracted — every rule began as a design decision, and its
implementations are young. Read it as a proposal with live failure modes
behind it, not as settled practice.

Kind 10333 is **self-assigned, not NIP-allocated**. Relay filters are
kind-scoped, so a later NIP landing on the same number would put two unrelated
event types into every query either app makes. Confirm there is still no
collision before depending on it.

[nostrhub-io-submission.md](nostrhub-io-submission.md) is the submission note.

## How the halves relate

The spec says what the wire format is. The catalog says which code implements
it correctly today, and where each app falls short.
[`comparisons/favorites-10333.md`](catalog/comparisons/favorites-10333.md) is
the join between them, and
[`comparisons/trustworthy-read.md`](catalog/comparisons/trustworthy-read.md)
defines the "trust" that the spec's [Merging](pc20-favorites.md#merging) rules
depend on.

## Working in here

The site repos under `~/Vibe` are **sources to read, never targets to
change**. Read them through `origin/HEAD`, not the local checkout — 9 of 15
clones were behind their remote when this was built, and two were not even on
their default branch. Never `git pull` in one; a pull rewrites the working
tree, and at least one is carrying thousands of uncommitted files.

```bash
git -C ~/Vibe/<repo> fetch origin --quiet
git -C ~/Vibe/<repo> show origin/HEAD:<path>

./catalog/check-drift.sh              # has any extracted file drifted?
./catalog/check-recipes.sh --network  # are the recipes still safe and live?
```

See [CLAUDE.md](CLAUDE.md) for the full conventions.
