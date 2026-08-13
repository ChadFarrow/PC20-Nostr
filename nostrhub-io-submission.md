<!--
Submission draft for nostrhub.io. This is a summary derived from
pc20-favorites.md, not a second spec: pc20-favorites.md is canonical, and
where the two disagree the spec is right and this file is stale. Every
number here (36 KB, 196 groups, 82 favorited feeds, 227 items) comes from
the first real event published in this format and is quoted from the spec —
do not update one without the other.

Prose is deliberately unwrapped rather than hard-wrapped at ~80 cols like
the spec, because nostrhub renders the markdown and hard wraps survive into
the rendered post.
-->

# Cross-app Podcast Favorites on Nostr

Favorite a show or a track in one Podcasting 2.0 app, and it's favorited in every other app you sign into. One flat list, one event, no merge algorithm.

## How it works

Kind **`10333`** — a plain (non-`d`-tagged) replaceable event, so there is exactly one per pubkey. Republishing the full tag list replaces the previous version wholesale; that replacement *is* the sync mechanism.

Entries are [NIP-73](https://github.com/nostr-protocol/nips/blob/master/73.md) identifiers, one `i` tag each, grouped by medium so it isn't repeated per feed. `k` tags name the identifier *kinds* the event contains — one per distinct kind, at the end, not one per entry.

```json
{
  "kind": 10333,
  "tags": [
    ["alt", "PC 2.0 Favorites"],

    ["medium", "podcast"],
    ["i", "podcast:guid:<feedGuid>"],
    ["i", "podcast:item:guid:<itemGuid>"],

    ["medium", "music"],
    ["i", "podcast:guid:<feedGuid>"],
    ["i", "podcast:item:guid:<itemGuid>"],

    ["k", "podcast:guid"],
    ["k", "podcast:item:guid"]
  ],
  "content": ""
}
```

`medium` is a running value: it applies to every entry after it until the next `medium` tag. A `podcast:guid` entry opens a feed group; the `podcast:item:guid` entries under it belong to that group until the next feed or medium tag.

## Tag order is load-bearing

An item's parent feed and its medium are both carried by *position*, not by anything on the entry itself. A client that parses entries into structs and rebuilds the tag array — sorting, deduplicating, reordering — silently reattaches every item to the wrong feed, and nothing else in the format recovers the association. Preserve the order you read, and append rather than rebuild.

## Three sharp edges

- **A feed group is not always a favorite.** Opening a group is the only way to say which feed an item came from, so a group appears whether or not the user favorited the feed. On the first real list published in this format, 196 groups carried only 82 favorited feeds — the other 114 existed solely so a favorited track could name its parent. Treat an *itemless* group as a real favorite and a group with items as unknowable; inventing a favorite is worse than missing one.
- **`medium` is a hint, never truth.** It exists so a client can bucket "Podcast" vs. "Music" without an API round trip. A Podcast Index lookup on the guid wins whenever they disagree, and an entry sitting before any `medium` tag is *unknown* — not `podcast`.
- **One bad relay read, republished, is the whole list gone.** A relay answering "I have nothing" and a relay that never answered must produce different results. An aggregate EOSE from your relay library is not by itself proof the read succeeded.

## What it doesn't do

No merge algorithm — two apps writing concurrently clobber each other, which is what the single-writer assumption exists to satisfy. No split between shows and items, so the whole list is one event: a real one runs 36 KB for 196 feeds and 227 items, against a ~128 KB relay cap, and item favorites accumulate an order of magnitude faster than feed favorites.

Kind `10333` is **self-assigned, not NIP-allocated** — unclaimed in the kind registry as of this writing, but confirm there's still no collision before depending on it. Relay filters are kind-scoped, so a later NIP landing on 10333 would put two unrelated event types into every query.

Spec, test vectors, and open questions: https://github.com/ChadFarrow/PC20-Nostr
