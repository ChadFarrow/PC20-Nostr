# Cross-app Podcast Favorites on Nostr

A user's favorites should follow them between apps. This document specifies
how a Podcasting 2.0 app stores a user's podcast and music favorites on
Nostr, so that favoriting something in one app makes it favorited in every
other app the same person signs into: one flat list, one event, no merge
algorithm.

Use this format when favorites can be treated as owned by a single writer —
one primary app or device publishes, others read — or when apps are willing
to coordinate writes out-of-band rather than rely on automatic merge logic.

## Core Architecture

A single custom kind **`10333`** ("PC 2.0 Favorites") — a plain
(non-`d`-tagged) replaceable event, so there is exactly one per pubkey.
Republishing the full tag list replaces the previous version wholesale; that
replacement *is* the sync mechanism.

This is a dedicated kind rather than NIP-78 app-data, chosen to avoid
ambiguity with generic app-data or bookmark-list consumers that might render
or interpret kind 30078 differently. As of this writing, kind `10333` is
unclaimed in the [Nostr kind registry](https://github.com/nostr-protocol/nips/blob/master/README.md),
but it is self-assigned, not registered via any NIP — confirm there's still
no collision before depending on it in production, and treat this doc as the
canonical claim on it.

Self-assignment is not free, and the cost is worth naming: a kind collision
is worse than a `d`-tag collision, because relay filters are kind-scoped, so
a later NIP landing on 10333 would put two unrelated event types into every
query either app makes.

## Data Structure

Entries use paired [NIP-73](https://github.com/nostr-protocol/nips/blob/master/73.md)
`i`/`k` tags — an `i` tag carrying the identifier, a `k` tag naming its
type. Entries are grouped by medium to avoid repeating it per feed.

```json
{
  "kind": 10333,
  "tags": [
    ["alt", "PC 2.0 Favorites"],

    ["medium", "podcast"],
    ["i", "podcast:guid:<feedGuid>"],
    ["k", "podcast:guid"],
    ["i", "podcast:item:guid:<itemGuid>"],
    ["k", "podcast:item:guid"],

    ["medium", "music"],
    ["i", "podcast:guid:<feedGuid>"],
    ["k", "podcast:guid"],
    ["i", "podcast:item:guid:<itemGuid>"],
    ["k", "podcast:item:guid"]
  ],
  "content": ""
}
```

### Grouping rules

- `medium` is a *running* value: it applies to every entry that follows it
  until the next `medium` tag appears. If no `medium` tag has appeared yet,
  default to `"podcast"`.
- An `["i", "podcast:guid:…"]` / `["k", "podcast:guid"]` pair starts a new
  feed group, tagged with whatever the current medium is.
- Subsequent `["i", "podcast:item:guid:…"]` / `["k", "podcast:item:guid"]`
  pairs belong to the most recently opened feed group, until the next
  `podcast:guid` pair or `medium` tag appears.
- Keep same-medium feeds contiguous when building the list — interleaving
  media types defeats the point of grouping and makes the block boundaries
  ambiguous to parse.

Tag order is therefore load-bearing, and this is the easiest thing in the
format to break by accident. An item's parent feed and its medium are both
carried by *position*, not by anything on the entry itself, so a client that
parses entries into structs and rebuilds the tag array from them — sorting,
deduplicating, or emitting the groups in a different order — silently
reattaches every item to the wrong feed. Preserve the order you read, and
append rather than rebuild.

### Medium is a hint, not a source of truth

The `medium` tag exists purely so a client can bucket "Podcast" vs. "Music"
on load without an API round trip first. It is **not** authoritative — apps
resolve `feedGuid` / `itemGuid` against the Podcast Index (or their own feed
cache) to get real metadata: title, artwork, audio URL, and the feed's actual
`<podcast:medium>` value. That lookup should win if it ever disagrees with
the hint stored here (e.g. a feed changes medium after this list was last
published).

## What this format does not do

- **No merge algorithm.** Republishing overwrites the whole list wholesale.
  Two apps writing concurrently will clobber each other's changes, and
  nothing here reconciles them — which is what the single-writer assumption
  above exists to satisfy.
- **No split between shows and items.** Everything lives in one event, so a
  large favorites list risks hitting relay size caps (~128 KB on nos.lol).
  Item favorites accumulate an order of magnitude faster than feed
  favorites — a listener saving individual tracks passes a thousand without
  trying, where the same person follows perhaps forty shows — so the tracks
  are what eventually make a publish fail, and they take the show
  subscriptions down with them.

## Open questions / not yet resolved

- No test vectors defined yet. At minimum they need to cover: republishing
  without clobbering entries the writing app doesn't understand; an empty
  list distinguished from a read that came back empty because no relay
  answered; idempotence, so the same inputs twice produce the same event;
  and preservation of tags a writer does not recognize.
- No behavior specified yet for degraded relay reads, though the
  requirement is clear even where the mechanics aren't written down here: a
  reader must distinguish "no relay answered" from "the list is empty", and
  must never publish over a read that may have failed silently. Wholesale
  replacement makes this the most expensive mistake available in the
  format — one bad read, republished, is the entire list gone. Count
  reached-versus-answered relays yourself; an aggregate EOSE from a relay
  library is not by itself proof the read succeeded.
- Optional NIP-73-style relay/URL hints (third element on `i` tags) are not
  currently used; could be added later as a fallback path to the raw feed
  URL if a Podcast Index lookup fails.
