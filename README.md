# PC20-Nostr

Working code from five live Podcasting 2.0 sites, packaged so you can drop a
feature into your own app. Plus a draft spec for syncing favorites over Nostr.

New to the terms? → **[GLOSSARY.md](GLOSSARY.md)**

## Take a feature

Each recipe holds the code, a `feature.json` saying where every file goes, and
a README saying what breaks if you skip a step.

| Recipe | Files | Install | Running on |
|---|---|---|---|
| [Lightning wallet payments](catalog/recipes/lightning-wallet-payments/) | 5 | 3 packages | [DoerfelVerse](https://itdv.podtards.com) |
| [Boostagram over keysend](catalog/recipes/boostagram-keysend/) | 3 | nothing | nobody yet |
| [BoostBox client](catalog/recipes/boostbox-client/) | 3 | nothing | nobody yet |
| [Feed validator](catalog/recipes/pc20-feed-validator/) | 1 | nothing | [DoerfelVerse](https://itdv.podtards.com/feed-validator) |
| [PWA install prompt](catalog/recipes/pwa-install-prompt/) | 2 | nothing | [DoerfelVerse](https://itdv.podtards.com) |

To send sats, start with **Lightning wallet payments** — the other two build on
it. Read its safety section first: this code had a bug that let a stranger
charge any amount, and the recipe is where it is fixed.

*Running on "nobody yet"* means the code was written for this repo rather than
taken from a site. Both say so in their first line.

→ **[catalog/](catalog/)** — where the code came from, and what it is missing.

## The spec

**[pc20-favorites.md](pc20-favorites.md)** syncs a user's favorites between
apps over Nostr, as one replaceable event at kind 10333. Two apps ship it.
Read it as a proposal with real failure modes behind it, not as settled
practice.

## Working on this repo

→ **[CLAUDE.md](CLAUDE.md)**. `catalog/check-recipes.sh` and
`catalog/check-drift.sh` decide whether a change may land.
