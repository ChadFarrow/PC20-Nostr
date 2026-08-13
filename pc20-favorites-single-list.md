# Cross-app Podcast Favorites on Nostr (Single-List Variant)

This document specifies a simpler alternative to
[`pc20-favorites.md`](pc20-favorites.md) for syncing podcast and music
favorites across apps using Nostr. The original spec's two-list, NIP-78 +
merge-algorithm approach proved overcomplicated in practice. This variant
trades away multi-app conflict resolution for a much smaller surface area:
one flat list, one event, no merge algorithm.

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

## Data Structure

Entries use paired [NIP-73](https://github.com/nostr-protocol/nips/blob/master/73.md)
`i`/`k` tags — one pair for the identifier, a separate `k` tag naming its
type — rather than the single 5-position `i` tag array used in the split-list
spec. Entries are grouped by medium to avoid repeating it per feed.

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

## Trade-offs vs. the split-list spec

- **No merge algorithm.** Republishing overwrites the whole list wholesale.
  Two apps writing concurrently will clobber each other's changes — there is
  no baseline/delta reconciliation like `pc20-favorites.md` implements.
- **No split between shows and items.** Everything lives in one event, so a
  very large favorites list risks hitting relay size caps (~128 KB on
  nos.lol) sooner than the two-list approach would.
- **Simpler for a single writer.** Appropriate when one app owns writes (or
  apps coordinate updates out-of-band) and other apps just need to read the
  same list — the common case this variant is meant for.

## Open questions / not yet resolved

- No test vectors defined yet — see `pc20-favorites.md`'s six test cases for
  the shape these should probably take (clobber behavior, empty-list vs.
  degraded-read disambiguation, idempotence of republishing, etc.).
- No behavior specified yet for degraded relay reads (partial data vs. truly
  empty list) — the split-list spec's guidance on distinguishing "nobody has
  it" from "nothing answered" applies conceptually here too but hasn't been
  adapted.
- Optional NIP-73-style relay/URL hints (third element on `i` tags) are not
  currently used; could be added later as a fallback path to the raw feed
  URL if a Podcast Index lookup fails.
