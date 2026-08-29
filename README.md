# PC20-Nostr

Working code from five live Podcasting 2.0 sites, packaged so you can drop a
feature into your own app. Plus two draft specs for carrying Podcasting 2.0 data
over Nostr.

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

## The specs

Both are proposals with real failure modes behind them, not settled practice.
Both use self-assigned kinds — check the registry for a collision before you
depend on either.

**[pc20-favorites.md](pc20-favorites.md)** syncs a user's favorites between
apps over Nostr, as one replaceable event at kind 10333. Two apps ship it.

Adding it to a third? Run the spec's 14 test vectors against your own code:

```bash
node --test conformance/vectors.test.mjs
```

No dependencies and no build step — point the adapter at your merge and the
same 14 run against it. → **[conformance/](conformance/)**. Both existing apps
found their defects by shipping instead; one of them logged fifteen, and the
worst passed every check the other fourteen added.

**[nip-value-playback-events.md](nip-value-playback-events.md)** publishes
what a streaming-sats or auto-boost payment was for, at kinds 3369 / 33369 /
23369, so the metadata reaches something other than the recipient's Lightning
node. One app implements the receipt kind, on a branch, unmerged — so it is
the earlier of the two by a wide margin. Its privacy section is the part to
read first: per-track receipts under a listener's own key are a public
timestamped listening history, and "share my boosts" is not consent for it.

**[pc20-favorites-vs-list-feeds.md](pc20-favorites-vs-list-feeds.md)** puts the
favorites spec beside the format Podcasting 2.0 already has for the same
payload: a `musicL` feed of `<podcast:remoteItem>`s. Spec against spec, no
proposal, and it prices what each side pays for its choice.

## Working on this repo

→ **[CLAUDE.md](CLAUDE.md)**. `catalog/check-recipes.sh`,
`catalog/check-drift.sh` and `node --test conformance/vectors.test.mjs` decide
whether a change may land.
