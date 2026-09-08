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
Four favorites — a podcast, one episode of a podcast the user does not follow,
an artist, and one track from an album they do not follow — look like this:

```json
{
  "kind": 10333,
  "content": "",
  "tags": [
    ["alt","PC 2.0 Favorites"],
    ["medium","podcast"],
    ["i","podcast:guid:917393e3-1b1e-5cef-ace4-edaa54e1f810"],
    ["i","podcast:guid:bfd4d7c4-eec0-5f6b-90b0-c1eae84b2392",
         "podcast:item:guid:cc59b81e-28a0-4e55-a457-54285c06830a"],
    ["medium","music"],
    ["i","podcast:publisher:guid:7f2e9c11-4b83-5e07-9d62-3a1f5c8b0e94"],
    ["i","podcast:guid:4c1f8e2b-0d6a-5a91-8e35-7b9c2d4f6a10",
         "podcast:item:guid:d2b7f014-3a58-4c6e-9f21-8ad5c3e70b46"],
    ["k","podcast:guid"],
    ["k","podcast:item:guid"],
    ["k","podcast:publisher:guid"]
  ]
}
```

One favorite, one tag. An item names the feed it came from at position 1 and
itself at position 2, so nothing on the list is there for structural reasons
and you can count the user's choices by counting the lines. `content` is empty
only because this list has no private half; it is carried verbatim, never
assumed.

Adding it to a third? Run the spec's 31 test vectors against your own code:

```bash
node --test conformance/vectors.test.mjs
```

No dependencies and no build step — point the adapter at your merge and the
same 31 run against it. → **[conformance/](conformance/)**. Both existing apps
found their defects by shipping instead; one of them logged fifteen, and the
worst passed every check the other fourteen added.

**[nip-value-playback-events.md](nip-value-playback-events.md)** publishes
what a streaming-sats or auto-boost payment was for, at kinds 3369 / 33369 /
23369, so the metadata reaches something other than the recipient's Lightning
node. One receipt:

```json
{
  "kind": 3369,
  "content": "",
  "tags": [
    ["i", "podcast:guid:c90e609a-df1e-596a-bd5e-57bcc8aad6cc",
          "podcast:item:guid:d98d189b-dc7b-45b1-8720-d4b98690f31f"],
    ["k", "podcast:item:guid"],
    ["amount", "30000"],
    ["action", "auto"],
    ["start", "1740000000"],
    ["end", "1740000180"],
    ["position", "412"],
    ["app", "MSP 2.0"],
    ["alt", "30 sats streamed to Copenhagen Time (value playback receipt)"]
  ]
}
```

`amount` is what SETTLED, never what was owed — a value block splits one
payment across several recipients and any leg can fail on its own.

One app implements the receipt kind, on a branch, unmerged — so it is the
earlier of the two by a wide margin. Its privacy section is the part to
read first: per-track receipts under a listener's own key are a public
timestamped listening history, and "share my boosts" is not consent for it.

**[pc20-favorites-vs-list-feeds.md](pc20-favorites-vs-list-feeds.md)** puts the
favorites spec beside the format Podcasting 2.0 already has for the same
payload: a `musicL` feed of `<podcast:remoteItem>`s. Spec against spec, no
proposal, and it prices what each side pays for its choice.

**[pc20-favorites-feed-guid-migration.md](pc20-favorites-feed-guid-migration.md)**
is what the two shipping apps each have to change so an item entry carries the
guid of its feed. Both rebuild `i` tags from their own model today, which
strips that guid — and an item guid is not an address on its own, so the first
stage is work in both repos and it comes before either may write one.

## Working on this repo

→ **[CLAUDE.md](CLAUDE.md)**. `catalog/check-recipes.sh`,
`catalog/check-drift.sh` and `node --test conformance/vectors.test.mjs` decide
whether a change may land.
