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

Favorite a show or a track in one Podcasting 2.0 app, and it's favorited in every other app you sign into. One flat list, one event, and any app may write it.

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

## Any app may write it, so every publish is a merge

There is no primary writer, no ownership and no out-of-band coordination — a user signed into three apps across two devices has five writers, all equal, none aware of the others. The event is replaceable, so a writer that publishes what it holds without reading first does not merely lose a race: it deletes every entry the other writers added, silently, on someone else's device, with no undo. **A blind publish is data loss, not a conflict.**

So read the current event before every publish, and never publish on a read you don't trust. Keep a **baseline** — the set of identifiers you last agreed with the relay on, private to the device and never on the wire. Nothing on an entry records which app added it, so "on the list, absent locally" is otherwise ambiguous between another app's addition and your own removal, and both naive answers destroy something: prefer the list and unfavoriting silently stops working, prefer local state and you delete the other apps' entries. Carry anything you can't parse through untouched. Publish only when the merged bytes differ from the bytes you read.

## Three sharp edges

- **A feed group is not always a favorite.** Opening a group is the only way to say which feed an item came from, so a group appears whether or not the user favorited the feed. On the first real list published in this format, 196 groups carried only 82 favorited feeds — the other 114 existed solely so a favorited track could name its parent. Treat an *itemless* group as a real favorite and a group with items as unknowable; inventing a favorite is worse than missing one.
- **`medium` is a hint, never truth.** It exists so a client can bucket "Podcast" vs. "Music" without an API round trip. A Podcast Index lookup on the guid wins whenever they disagree, and an entry sitting before any `medium` tag is *unknown* — not `podcast`.
- **One bad relay read, republished, is the whole list gone.** A relay answering "I have nothing" and a relay that never answered must produce different results. An aggregate EOSE from your relay library is not by itself proof the read succeeded.

## What it doesn't do

No provenance, and so no last-write-wins — nothing on an entry records which app added it or when, which is why each writer keeps its own baseline instead of working the answer out from the event. No concurrency control: the merge rules make each publish correct with respect to what it read, not serialized, so two apps that read the same version and publish within a second of each other still lose one set of changes. No split between shows and items, so the whole list is one event: a real one runs 36 KB for 196 feeds and 227 items, against a ~128 KB relay cap, and item favorites accumulate an order of magnitude faster than feed favorites.

Kind `10333` is **self-assigned, not NIP-allocated** — unclaimed in the kind registry as of this writing, but confirm there's still no collision before depending on it. Relay filters are kind-scoped, so a later NIP landing on 10333 would put two unrelated event types into every query.

Spec, test vectors, and open questions: https://github.com/ChadFarrow/PC20-Nostr
