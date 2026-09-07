# Putting the feed guid on the item

What `stablekraft-app` and `boostmebitch` each have to change so an item entry
carries the guid of its feed, per [One favorite, one
tag](pc20-favorites.md#one-favorite-one-tag).

**Read on 2026-09-07 at `stablekraft-app@4722dd8` and `boostmebitch@938f90d`.**
Every line number below is at those commits and will drift. This page is a
plan, not an extraction: no line of it has been run in either app, and the
shapes it suggests are the smallest ones that satisfy the vectors, not designs
either codebase has agreed to.

## What changed, and why it is not cosmetic

An item entry used to be `["i", "podcast:item:guid:…"]`, and the feed it came
from was whatever feed entry sat above it. It is now
`["i", "podcast:item:guid:…", "<feedGuid>"]`, and the entry above it means
nothing.

The reason is not tidiness. **An item guid is not an address.**
[`<podcast:guid>`](https://podcastindex.org/namespace/1.0) is globally unique
by construction — a UUIDv5 over the feed URL, assigned once and kept for the
life of the podcast even when that URL changes. An item's `<guid>` is unique
only inside its feed, which is why the Podcast Index `/episodes/byguid` lookup
demands a `feedid`, `feedurl` or `podcastguid` beside it and says in its own
documentation that the item guid "may not be globally unique".

So an item stripped of its feed guid is not mislabelled. It is unresolvable,
by every app, forever.

Two things fall out of the format in exchange, and both are why the change is
worth making rather than merely correct:

- **A feed entry now appears only when the user favorited the feed.** There is
  nothing left on the list for structural reasons, so the whole
  favorite-versus-placement question disappears — along with the `fav` /
  `placement` marker a brief revision of this document had introduced to
  answer it. On the first real list, 114 of 196 feed entries were placement.
- **Tag order no longer decides which feed an item belongs to.** Sorting,
  deduping, or rebuilding the array cannot silently reattach an item any more.

## The order is not a preference

1. **Both apps stop rebuilding `i` tags, and both read position 2** — with the
   legacy fallback. Until this is in both, neither may write position 2.
2. **Either app writes position 2 on its items.** Any order, once stage 1 is
   everywhere.
3. **Either app stops writing placement feed entries.** Any order, once stage 2
   is everywhere in that app.

**This sequencing is load-bearing in a way the marker's never was.** Nothing had
ever published a marker, so that ordering protected a feature nobody had. This
one protects live data, in two directions:

- App A writes `["i", item, feedGuid]`. App B rebuilds it as `["i", item]` and
  republishes. The feed guid is gone, and with it the only way anyone can ever
  look that favorite up — silently, on someone else's device, with app B's
  screen correct throughout.
- App A stops writing placement feed entries, because its items no longer need
  them. App B still reads an item's feed from the entry above it, finds none,
  and shows a library of tracks with no albums. If B then rebuilds those items,
  case one happens to all of them at once.

Stage 3 is therefore the one to hold back longest. Writing position 2 while
still emitting the placement feed entries is safe for everybody; dropping those
entries is what breaks a reader that has not shipped stage 1.

## Stage 0: run the vectors you already run

Both repos have this wired, which is most of the work already done.

| | how | runner | adapter |
|---|---|---|---|
| stablekraft-app | `npm run check:conformance` | `scripts/conformance.ts` | `lib/nostr/favorites-conformance-adapter.ts` |
| boostmebitch | `npm run check:conformance` | `scripts/conformance.mjs` | `scripts/conformance-adapter.mjs` |

Both find the suite at `../PC20-Nostr` or wherever `PC20_NOSTR_DIR` points, so
pull this repo and run it. Expect **4, 5, 11, 19, 20, 25, 26 and 27 red** —
that is the correct result for an app that carries an item's feed by position,
and it is the signal each stage below turns green.

Expect **28 red only on its last assertion**, which is originating an artist
favorite. Neither app can do that and neither is wrong for it; see [What not to
change](#what-not-to-change).

## Stage 1: stop rebuilding `i` tags, and read position 2

Both apps parse the list into an ordered node list, and both are right to —
`medium` is still positional, and both file headers say so at length. The defect
is narrower than that: **a node the app could PLACE is re-emitted from the model
rather than from the tag.** A node it could not place is already carried whole,
which is why the fix is small.

An `i` tag is `["i", identifier, feedGuid]`. Position 2 is what gets dropped,
along with anything a writer newer than either app parks behind it.

### stablekraft-app

| what | where |
|---|---|
| `SingleListGroup` — no room for the tag it came from | `lib/nostr/favorites-single-list.ts:72` |
| `parseSingleList` opens the group and discards positions past 1 | `:784` |
| `tagsFromNodes` writes `['i', feed]` and `['i', id]` | `:333`, `:337` |
| `mergeSingleList` rebuilds a held group as `{...mine, …}` | `:530` |

Three edits, and the third is the one that is easy to miss. Adding a field at
parse time is not enough: for a group the app **holds**, the merge builds the
emitted group from `mine` — local state — so anything read off the wire has to
be threaded across explicitly, next to the `medium` line that already does
exactly this ("Prefer what we resolved; fall back to the hint that was already
there rather than blanking it"). The same sentence, applied to the rest of the
tag.

The smallest shape that works:

```ts
export interface SingleListGroup {
  feedGuid: string;
  medium?: string;
  itemGuids: string[];
  /** Positions 2+ of each item's `i` tag as READ. Never ours to drop. */
  itemExtra?: Record<string, string[]>;
}
```

`tagsFromGroups` (`:390`) needs nothing: it builds from local state only, and a
list built from scratch has nothing to carry.

### boostmebitch

| what | where |
|---|---|
| the header states the two-element shape as an invariant | `lib/nostr/favorites-list.ts:23` |
| `FeedGroup` — same gap as SK's group | `:223` |
| the parse branch opens the group and keeps only the guid | `:820` |
| `tagsFromList` writes `['i', showId(…)]` and `['i', itemId(…)]` | `:945`, `:946` |
| `mergeFavoritesList` rebuilds a held group as an object literal | `:1200` |

Same three edits. The literal at `:1200` names its fields one at a time, so a
new field is dropped there by construction rather than by oversight — a spread
would not have been safer, only quieter.

The header comment has to change with the code. It currently reads "An `i` tag
is bare — `['i', '<identifier>']`, two elements", which was true and is the
thing being fixed.

### The legacy fallback is mandatory, not a courtesy

Reading position 2 is only half of stage 1. **A two-element item tag still takes
its feed from the most recent feed entry above it**, exactly as it does today,
and every list in production is full of them. Drop that path and you do not
lose a label — you make every item favorite already published unresolvable.

An unreadable identifier between a feed entry and a two-element item must not
end that run either, or the item is stranded.
([Vector 4](pc20-favorites.md#test-vectors).)

### What stage 1 alone buys

A list carrying feed guids written by anyone survives both apps untouched, and
both apps can read one. That is the whole prerequisite, and it is worth landing
on its own: it is also what lets a later revision put something at position 3,
which nothing defines yet, without a second round of this.

Vectors 4, 5, 19, 20 and 27 go green here. 11, 25 and 26 do not.

## Stage 2: write position 2, and claim the pair

### Every item you emit names its feed

There is no case where an item entry is written without one. The feed guid is
already in hand — it is the group the item sits under in local state — so this
is a one-line change at each of the four emit sites listed above.

**Fill it in on entries you read, too.** A two-element item whose feed you
resolved positionally is republished as three elements with that guid on it.
Each list upgrades itself once, on the first publish after the reader ships, and
the upgrade must be idempotent: reading the result back changes nothing.
([Vector 27](pc20-favorites.md#test-vectors).)

### A baseline claim on an item is the PAIR

This is the part with no analogue in either app, and it is a data-shape change
rather than a line edit. A baseline keyed on the item guid alone cannot tell two
items in two feeds apart, so taking one back removes the other — silently, and
no other app will restate it.

| | now | needs |
|---|---|---|
| stablekraft-app | `PublishedRecord { feeds, items }` (`:416`) | `items` keyed by feed guid **and** item guid, per half |
| boostmebitch | `FavoritesBaseline { feeds, items, privateFeeds?, privateItems? }` (`:301`) | the same, on both `items` and `privateItems` |

An existing baseline holding bare item guids is not wrong, it is
under-specified. Migrate it by pairing each stored item guid with the feed it
currently sits under on the list you just read, and write the paired form from
then on. Doing nothing is also safe until two feeds on one user's list share an
item guid, which is rare and silent, which is the problem.

Vectors 11 and 25 go green here.

## Stage 3: stop writing placement feed entries

A feed entry is written **only** when the user favorited the feed. A feed you
hold merely to supply its items' feed guid is not an entry.

This is the change that makes the list say what it means, and it is the one to
ship last, for the reason in [The order is not a
preference](#the-order-is-not-a-preference): a reader still on the old rules
loses every item whose feed entry you stop writing.

Local state gets simpler rather than harder here. `favorited` on a feed becomes
a plain boolean and false is an ordinary answer — the three-valued "not known"
that a placement marker forced on both apps has nothing left to describe,
because an unmarked feed entry with items under it is not a state that can
occur.

Vector 26 goes green here, and the suite is 28 green.

## What not to change

**Artists.** Both apps place a `podcast:publisher:guid` entry as a loose entry
— carried whole, belonging to nothing — and stablekraft pins it in a test
(`lib/nostr/favorites-single-list.test.ts:510`, "an unrecognized identifier kind
is never guessed at — and never dropped"). That is correct, and it is written
down as [An artist is a favorite that belongs to no
feed](pc20-favorites.md#an-artist-is-a-favorite-that-belongs-to-no-feed). This
repository's own reference implementation was the reader that had it wrong, and
it was changed rather than either app.

Neither app can *originate* an artist favorite: `parseShowGuid` in each is
show-prefix only, so a publisher identifier never becomes a local entry. That
is the optional half — carrying one is mandatory, offering the feature is not —
and it is the one assertion in vector 28 that an app without artist favorites
is expected to fail.

**The node-list parse.** Both apps got the hard part right, and `medium` is
still positional so the ordered walk is still the right shape. The rebuild is a
detail inside a design that is correct, and stage 1 is the smallest possible
change to it, not a rewrite.

## How you know it worked

`npm run check:conformance` in each repo, 28 green. Then break your own merge
on purpose and confirm the right vector fails — the matrix in
[`conformance/README.md`](conformance/README.md) says which, and these are the
rows that matter here:

| break it this way | should fail |
|---|---|
| rebuild `i` tags as `['i', id]` on emit, dropping the feed guid | 25, 27 |
| read an item's feed from the entry above it, ignoring position 2 | 5, 25, 26 |
| drop the legacy path, so a two-element item names no feed | 4, 27 |
| republish a legacy item without filling in its feed guid | 27 |
| key an entry on its identifier alone rather than on the pair | 2, 3, 10, 11, 18, 19, 25, 26 |
| write a feed entry for a feed you hold only to supply a feed guid | 25 |
| invent a feed guid for an item whose feed nobody knows | 20 |

A suite that goes green without those going red has not tested anything.
