# Cross-app Podcast Favorites on Nostr (Single-List Variant)

This document specifies how a user's podcast and music favorites follow them
between apps on Nostr: one flat list, one event, no merge algorithm.

An earlier design split favorites across two NIP-78 events — one for shows
and albums, one for episodes and tracks — and reconciled concurrent writers
with a baseline/delta merge algorithm. That approach proved overcomplicated
in practice. This variant trades away its multi-app conflict resolution for
a much smaller surface area.

Use this variant when an app can treat favorites as owned by a single writer
(one primary app/device publishes; others read) or when apps are willing to
coordinate writes out-of-band instead of relying on automatic merge logic.

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

**NIP-51 kind 10054, "Favorite podcasts list", already exists, and is not
this.** It is defined over `p` tags (NIP-F4 podcast pubkeys) and `url` tags
(RSS/XML feed URLs), which rules it out twice over: it cannot name an
individual episode or track at all, and it identifies a feed by URL — the
field two apps are most likely to hold different values for (`http` versus
`https`, a Podcast Index-canonical URL versus the publisher's, a proxy
versus the origin). This list is built on Podcasting 2.0 GUIDs to avoid
exactly that. Kinds 10064 ("Authored podcasts list") and 10154 (NIP-F4
podcast metadata) are adjacent and likewise unrelated.

Self-assignment is not free, and the cost is worth naming: a kind collision
is worse than a `d`-tag collision, because relay filters are kind-scoped, so
a later NIP landing on 10333 would put two unrelated event types into every
query either app makes.

## Data Structure

Entries use paired [NIP-73](https://github.com/nostr-protocol/nips/blob/master/73.md)
`i`/`k` tags — an `i` tag for the identifier, a `k` tag naming its type —
rather than packing the identifier, a URL hint, the parent feed's guid and
the medium into fixed positions of one `i` tag array, as the earlier
two-list design did. Entries are grouped by medium to avoid repeating it
per feed.

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

### Medium is a hint, not a source of truth

The `medium` tag exists purely so a client can bucket "Podcast" vs. "Music"
on load without an API round trip first. It is **not** authoritative — apps
resolve `feedGuid` / `itemGuid` against the Podcast Index (or their own feed
cache) to get real metadata: title, artwork, audio URL, and the feed's actual
`<podcast:medium>` value. That lookup should win if it ever disagrees with
the hint stored here (e.g. a feed changes medium after this list was last
published).

## What this variant gives up

- **No merge algorithm.** Republishing overwrites the whole list wholesale.
  Two apps writing concurrently will clobber each other's changes — there is
  no baseline/delta reconciliation computed against a per-device record of
  what you last contributed.
- **No split between shows and items.** Everything lives in one event, so a
  very large favorites list risks hitting relay size caps (~128 KB on
  nos.lol) sooner than splitting shows and items across two events would.
  Item favorites accumulate an order of magnitude faster than feed
  favorites — a listener saving individual tracks passes a thousand without
  trying, where the same person follows perhaps forty shows — so in one list
  the tracks are what eventually make a publish fail, and they take the show
  subscriptions down with them.
- **Simpler for a single writer.** Appropriate when one app owns writes (or
  apps coordinate updates out-of-band) and other apps just need to read the
  same list — the common case this variant is meant for.

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
  replacement makes this *more* dangerous than it would be under a merge,
  not less — one bad read, republished, is the entire list gone. Count
  reached-versus-answered relays yourself; an aggregate EOSE from a relay
  library is not by itself proof the read succeeded.
- Optional NIP-73-style relay/URL hints (third element on `i` tags) are not
  currently used; could be added later as a fallback path to the raw feed
  URL if a Podcast Index lookup fails.
