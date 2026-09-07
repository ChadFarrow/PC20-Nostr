# Adopting the feed-favorite marker

What `stablekraft-app` and `boostmebitch` each have to change so a show
favorite and an episode favorite become two answers instead of one, per
[Saying whether a feed is
favorited](pc20-favorites.md#saying-whether-a-feed-is-favorited).

Nothing is broken today. No list carries a marker, so nothing is at risk and
nothing is urgent. This is the precondition for a feature, not a repair — with
one exception, in stage 1, which is worth doing whether or not the marker ever
ships.

**Read on 2026-09-07 at `stablekraft-app@4722dd8` and `boostmebitch@938f90d`.**
Every line number below is at those commits and will drift. This page is a
plan, not an extraction: no line of it has been run in either app, and the
shapes it suggests are the smallest ones that satisfy the vectors, not designs
either codebase has agreed to.

## The order is not a preference

1. **Both apps stop rebuilding `i` tags.** Until this is in both, neither may
   write a marker.
2. **Either app reads the marker.** Any order, once stage 1 is everywhere.
3. **Either app writes the marker.** Any order, once stage 1 is everywhere.

The reason is one-directional damage. App A writes `["i", feed, "fav"]`.
App B reads the list, rebuilds the entry as `["i", feed]`, and republishes. The
marker is gone — silently, on someone else's device, and app B's screen looks
correct throughout. Both apps are writers, so both must be able to carry before
either starts writing.

This is the same shape as the `content` sequencing that
[rule 4](pc20-favorites.md#4-carry-what-you-cant-read) exists for, with one
difference in each direction. Lighter: carrying a whole tag is *already* rule
4, so an app that honours it preserves a marker it has never heard of, with no
new rule to learn. Heavier: neither app honours it for an entry it can place,
so the carry is not free here — it is stage 1.

## Stage 0: run the vectors you already run

Both repos have this wired, which is most of the work already done.

| | how | runner | adapter |
|---|---|---|---|
| stablekraft-app | `npm run check:conformance` | `scripts/conformance.ts` | `lib/nostr/favorites-conformance-adapter.ts` |
| boostmebitch | `npm run check:conformance` | `scripts/conformance.mjs` | `scripts/conformance-adapter.mjs` |

Both find the suite at `../PC20-Nostr` or wherever `PC20_NOSTR_DIR` points, so
pull this repo and run it. Expect **25, 26 and 27 red** — that is the correct
result for an app that has not shipped the marker, and it is the signal each
stage below turns green.

Expect **28 red only on its last assertion**, which is originating an artist
favorite. Neither app can do that and neither is wrong for it; see [What not to
change](#what-not-to-change).

## Stage 1: stop rebuilding `i` tags

Both apps parse the list into an ordered node list, and both are right to —
tag order is the data, and both file headers say so at length. The defect is
narrower than that: **a node the app could PLACE is re-emitted from the model
rather than from the tag.** A node it could not place is already carried whole,
which is why the fix is small.

An `i` tag is `["i", identifier, marker]`. Position 2 is what gets dropped,
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
  favorited: boolean;
  /** Positions 2+ of the `i` tag as READ. Not ours to author or to drop. */
  extra?: string[];
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

### What stage 1 alone buys

A list carrying markers written by anyone survives both apps untouched. That is
the whole prerequisite, and it is worth landing on its own: it is also what
lets a later revision put something at position 3, which nothing defines yet,
without a second round of this.

Vector 27 goes green here. 25 and 26 do not.

## Stage 2: read the marker

The reading rules are in [Saying whether a feed is
favorited](pc20-favorites.md#saying-whether-a-feed-is-favorited); the two that
bite are that the answer is **per feed, not per group**, and that a group with
items and no marker stays **unknowable** rather than becoming a `false`.

### stablekraft-app

`SingleListGroup.favorited` already exists, and its comment states the exact
limitation this closes:

> Not expressible on the wire — see the header — so it is meaningful on the way
> OUT and always false on the way back IN.

So the field is right and its type is not. `parseSingleList:784` hardcodes
`favorited: false`, which under the new rules is a **statement** that the feed
is not favorited. It has to become "not told". Widen the field to
`true | false | null` and let the marker, then the itemless fallback, then
`null` decide it.

`partitionSingleList` (`:810`) is where the answer reaches the rest of the app,
and its `shows` array is what a caller would otherwise read as "these are
favorites".

### boostmebitch

`FeedGroup` (`:223`) has no such field at all — but the app has the *reading*
already, one level up. `partitionList` (`:1777`) emits
`{ feedGuid, medium, itemless }`, and `itemless` is precisely the fallback rule
this document keeps: an empty group is an unambiguous feed favorite. The
hydrator consumes it at `lib/nostr/favorites-hydrator.ts:565-573` and
`:734-750`, with comments that already say why a group with items cannot be
read back as a favorite.

So the change is to let a marker **override** `itemless`, not to replace it.
Add the marker to `FeedGroup`, resolve per feed, and give the hydrator a
three-valued answer instead of a boolean. Where it currently reasons "itemless,
therefore a favorite", it gains "marked `fav`, therefore a favorite" ahead of
that and "marked `placement`, therefore not" beside it — and `null` stays the
case it already handles by declining to decide.

Vector 25's reading half goes green here.

## Stage 3: write the marker

Three things, and the second is the one with no analogue in either app yet.

### Local state needs three values

An app that adopts the shared list into its own library meets unmarked groups
with items, and the honest answer for those is "not known". Collapse it into
either boolean and the next publish states something the user never said:
`true` manufactures a favorite, `false` deletes one no other app will restate.

SK's shim currently hardcodes it — `favorited: true` at
`lib/nostr/favorites-conformance-adapter.ts:168` — which is the right stand-in
for a contract that had no such field and the wrong one now. It has to come
from the contract's `favorited`, `null` included.

### The feed favorite is a claim of its own

The entry and the marker are two different assertions. Your device can be the
reason a group is on the list without being the reason it is marked `fav` — you
opened it to place a track, another app said the user follows the show — so a
baseline holding only identifiers can express neither removal.

Both baselines already split by *thing*, so the shape is there:

| | now | needs |
|---|---|---|
| stablekraft-app | `PublishedRecord { feeds, items }` (`:416`) | a third set for claimed feed favorites, per half |
| boostmebitch | `FavoritesBaseline { feeds, items, privateFeeds?, privateItems? }` (`:301`) | `favFeeds?` and `privateFavFeeds?`, on the same optional-reads-as-empty rule the private pair already uses |

BMB's existing comment on why `privateFeeds` had to be separate — "against a
single shared baseline those two steps cancel destructively" — is the same
argument one level down, and the same optional-and-absent-reads-as-`[]`
migration works.

### Favoriting is an addition; unfavoriting is a removal

The asymmetry is the whole of the write path, and it is what stops two apps
rewriting the event at each other forever:

- Hold the feed as favorited → emit `fav`. An addition needs only local state.
- Hold it as a placement **and your baseline claims the favorite** → emit
  `placement`. That is the user unfavoriting the show in your app, and it holds
  even when the group survives to place somebody else's items.
- Hold it as a placement and your baseline does **not** claim the favorite →
  emit `fav`, unchanged. It is another app's claim and a placement does not
  beat it.
- Do not hold the feed at all → carry whatever the wire says. You do not know.

And: **express the removal by writing `placement`, never by leaving the marker
off.** Unmarked means "nobody has said", so an unmarked removal is invisible to
every reader, and on a group whose last item has also gone it reads back as the
favorite the user just dropped.

Vectors 25 and 26 go green here.

## What not to change

**Artists.** Both apps place a `podcast:publisher:guid` entry as a loose entry
— carried whole, opening no group, closing none — and stablekraft pins it in a
test (`lib/nostr/favorites-single-list.test.ts:510`, "an unrecognized
identifier kind is never guessed at — and never dropped"). That is correct, and
it is now written down as [An artist is a favorite
that opens nothing](pc20-favorites.md#an-artist-is-a-favorite-that-opens-nothing).
This repository's own reference implementation was the reader that had it
wrong, and it was changed rather than either app.

Neither app can *originate* an artist favorite: `parseShowGuid` in each is
show-prefix only, so a publisher identifier never becomes a local entry. That
is the optional half — carrying one is mandatory, offering the feature is not —
and it is the one assertion in vector 28 that an app without artist favorites
is expected to fail.

**The node-list parse.** Both apps got the hard part right. The rebuild is a
detail inside a design that is correct, and stage 1 is the smallest possible
change to it, not a rewrite.

## How you know it worked

`npm run check:conformance` in each repo, 28 green. Then break your own merge
on purpose and confirm the right vector fails — the matrix in
[`conformance/README.md`](conformance/README.md) says which, and these are the
rows that matter here:

| break it this way | should fail |
|---|---|
| rebuild `i` tags as `['i', id]` on emit | 25, 26, 27, 28 |
| express a feed-favorite removal by leaving the marker off | 25, 26 |
| let a `placement` you hold overwrite a `fav` you do not claim | 26 |
| read an unmarked group with items as a feed favorite | 25, 27 |
| stamp your own answer on a group you only carry | 8, 27 |
| never claim a feed favorite in the baseline | 25 |

A suite that goes green without those going red has not tested anything.
