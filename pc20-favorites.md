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

Entries are [NIP-73](https://github.com/nostr-protocol/nips/blob/master/73.md)
identifiers, one `i` tag each, grouped by medium to avoid repeating it per
feed. `k` tags name the identifier *kinds* the event contains — **one per
distinct kind, at the end**, not one per entry.

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

**Take an entry's kind from the identifier, never from an adjacent tag.** The
kind is already the identifier's prefix, so a `k` beside every `i` restates
what position 1 has just said. On the first real event published in this
format that cost 423 `k` tags carrying two distinct values — about 11 KB of a
36 KB event, 28% of it, on a list of 196 feeds and 227 items.

An earlier revision of this document paired a `k` with every `i`, so **a
reader must accept both forms**: ignore `k` entirely when parsing entries and
derive the kind from the identifier, and the two layouts become the same
event. A reader that walks `i`/`k` in pairs will not read a list written by
the current rule, and the symptom is an empty library rather than an error.

Trailing `k` tags are safe because `k` takes no part in grouping — only `i`
and `medium` are positional. A `k` landing mid-list is inert, but emit them
at the end anyway so nothing invites a parser to treat them as delimiters.

Derive the kind from a known-kinds table rather than by scanning the string.
Item guids are routinely permalink URLs, so "everything before the last
colon" on `podcast:item:guid:https://example.com/ep/42` yields
`podcast:item:guid:https` — a `k` value no relay filter will ever match,
which breaks `#k` discovery without breaking anything visible.

### Grouping rules

- `medium` is a *running* value: it applies to every entry that follows it
  until the next `medium` tag appears.
- An `["i", "podcast:guid:…"]` entry starts a new feed group, tagged with
  whatever the current medium is.
- Subsequent `["i", "podcast:item:guid:…"]` entries belong to the most
  recently opened feed group, until the next `podcast:guid` entry or `medium`
  tag appears.
- Keep same-medium feeds contiguous when building the list — interleaving
  media types defeats the point of grouping and makes the block boundaries
  ambiguous to parse.
- **An entry before any `medium` tag has an UNKNOWN medium.** Do not default
  it to `podcast` or to anything else. A writer whose feed never declared
  `<podcast:medium>` has nowhere else to put it: appending the entry instead
  makes it inherit whatever medium was declared last, and inventing a
  `["medium", "unknown"]` tag writes a value no reader has been told about.
  Placing such groups ahead of the first `medium` tag is deliberate and
  correct. A resolved lookup wins over the hint anyway, so recording "not
  told" as unknown costs a reader nothing — whereas defaulting turns an
  absence into a claim, and it is wrong for exactly the half of the list the
  hint exists to separate.

Tag order is therefore load-bearing, and this is the easiest thing in the
format to break by accident. An item's parent feed and its medium are both
carried by *position*, not by anything on the entry itself, so a client that
parses entries into structs and rebuilds the tag array from them — sorting,
deduplicating, or emitting the groups in a different order — silently
reattaches every item to the wrong feed. Preserve the order you read, and
append rather than rebuild.

Where preserving read order and keeping same-medium feeds contiguous
conflict — because the writer before you interleaved them — **contiguity
wins**. Reordering groups within a medium block reattaches nothing, since an
item always travels directly beneath its own feed entry, while a broken block
silently re-labels every entry after the boundary.

### A feed group is not always a favorite

Opening a feed group is the only way to say which feed an item came from, so
**a group appears whether or not the user favorited the feed**. Nothing in
the event distinguishes a group opened to place a track from a feed the user
chose. In the first real list published in this format, 196 groups carried
only 82 favorited feeds; the other 114 existed solely so a favorited track
could name its parent.

Two consequences, and both cost data if you get them wrong:

- **A group with items under it is not evidence the feed was favorited.** A
  reader that treats every `podcast:guid` entry as a favorited feed
  manufactures favorites the user never made — an implementation read its own
  output back and would have created 114 album favorites on the next page
  load. Treat an *itemless* group as an unambiguous feed favorite and a group
  with items as unknowable. Inventing a favorite is worse than missing one,
  and the missing case corrects itself as soon as the feed is the only thing
  left on that group.
- **Unfavoriting a feed while a track of it stays favorited is invisible.**
  The placement group and the feed favorite are the same bytes, so there is
  no way to express the removal until the last track goes too. A writer
  cannot signal it and a reader cannot detect it.

### Medium is a hint, not a source of truth

The `medium` tag exists purely so a client can bucket "Podcast" vs. "Music"
on load without an API round trip first. It is **not** authoritative — apps
resolve `feedGuid` / `itemGuid` against the Podcast Index (or their own feed
cache) to get real metadata: title, artwork, audio URL, and the feed's actual
`<podcast:medium>` value. That lookup should win if it ever disagrees with
the hint stored here (e.g. a feed changes medium after this list was last
published).

Publish the medium only from what a feed actually declared. An app's own
internal classification is not the same thing and usually carries a default —
publishing that default makes a guess look authoritative, and a guess on this
list is sticky, because no other app has any reason to correct it.

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
- **No way to tell a foreign entry from one you removed.** Without a
  baseline — the id list you last agreed with the relay on — an entry present
  on the list and absent from your local state is either something another
  app added or something this device just unfavorited. A single writer never
  faces the question. A second one must answer it before it publishes, and
  the two answers trade against each other: prefer the list and unfavoriting
  stops working, prefer local state and you delete the other app's entries.

## Test vectors

A conforming implementation should pin at least these. They are stated as
behaviors rather than fixtures so they can be written against any test
runner.

**1. A foreign entry survives your republish.** Read a list containing a feed
group your app cannot resolve, publish, and the group and its items must come
back byte-identical and in the same position. This is the vector that catches
a writer built from local state alone, which is the natural way to write one.

**2. An empty list is distinguishable from a read that never happened.** A
relay answering "I have nothing" and a relay that never answered must produce
different results. Believing the second is how a whole library gets
republished as empty.

**3. Idempotence.** Read your own output, merge, publish: the tag array must
be byte-identical. A format whose writers are not idempotent has two apps
rewriting the event against each other forever, with neither wrong and
neither converging.

**4. An unrecognized tag or identifier kind survives.** A `k` naming a kind
you never emit, an `i` whose prefix is not in your table, a tag type you have
no meaning for — all of them belong to a writer newer than you, and must be
carried through untouched.

**5. Placement.** An item entry attaches to the most recently opened feed
group, not the first and not the nearest by any other measure, and a group
with no `medium` tag above it reads as unknown rather than `podcast`.

**6. A URL-shaped item guid does not corrupt its `k` tag.** The kind comes
from the table, so `podcast:item:guid:https://example.com/ep/42` yields
`podcast:item:guid` and never `podcast:item:guid:https`.

**7. Both `k` layouts parse identically.** One `k` per distinct kind and a
`k` paired with every `i` describe the same list; a reader that treats them
differently silently loses every entry written by the other revision.

## Open questions / not yet resolved

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
  URL if a Podcast Index lookup fails. Dropping them costs the only answer
  available for an entry Podcast Index cannot resolve at all — a feed that
  404s and was never indexed leaves a guid and nothing else.
