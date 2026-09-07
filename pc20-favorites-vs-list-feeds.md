# Kind 10333 and Podcasting 2.0 list feeds

Podcasting 2.0 already has a format for *a set of references to feeds and to
items in other feeds*: the list feed. [`pc20-favorites.md`](pc20-favorites.md)
is a second one on a different transport, holding the same payload — a
`feedGuid`, sometimes an `itemGuid`, resolved at the Podcast Index.

This page records where the two line up and where they part. It exists because
an implementer arriving at kind 10333 has usually written a
`<podcast:remoteItem>` parser already, and because two of the favorites spec's
open questions are questions the namespace answered years ago, by spending
bytes that format chose to save.

**Nothing here changes a rule.** No proposal, no new tag position, no
converter. Read against the namespace docs on 2026-08-27 —
[`remote-item.md`](https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/tags/remote-item.md)
and
[`medium.md`](https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/tags/medium.md)
— and against no running app at all; see [Known gaps](#known-gaps).

## What a list feed is

An RSS feed whose `<podcast:medium>` is a *list* variant. Every medium has
one — the name plus the letter `L`, so `podcast` becomes `podcastL` and
`music` becomes `musicL` — plus a dedicated `mixed` for a list that spans
types. A list feed "should not be expected to have regular `<item>`'s".
It carries `<podcast:remoteItem>` elements instead, and `<podcast:medium>`
appears once per channel.

One element is one reference, complete on its own:

```xml
<podcast:remoteItem
        feedGuid="ff519475-6e90-5231-91a0-37d092088d88"
        feedUrl="https://media.rss.com/joemartinmusic/feed.xml"
        itemGuid="e75771b1-e8d4-4133-9392-c579822247d9"
        medium="music"
/>
```

`feedGuid` is the only required attribute; `feedUrl`, `itemGuid`, `medium` and
`title` are optional. The element is not a playlist construct — it also
appears in `<podcast:podroll>`, `<podcast:valueTimeSplit>` and
`<podcast:publisher>`. Both formats therefore reuse a general-purpose pointer
rather than inventing one, `remoteItem` on the RSS side and NIP-73's `i` on
the Nostr side.

## The two at a glance

| | kind 10333 | list feed |
|---|---|---|
| transport | one replaceable Nostr event | one RSS document at a URL |
| addressed by | the user's pubkey | the feed URL, plus `<podcast:guid>` |
| writers | any app the user signs into | whoever can write the file |
| how many | exactly one per pubkey — no `d` tag | as many feeds as you publish |
| order means | which feed an item belongs to | the order to play them in |
| named | no title, no artwork | a channel, so both |
| ceiling | relay limits, about 128 KB | whatever the host serves |

## The same identifiers

| kind 10333 | list feed |
|---|---|
| `["i", "podcast:guid:X"]`, nothing under it | `<podcast:remoteItem feedGuid="X"/>` |
| `["i", "podcast:guid:X", "podcast:item:guid:Y"]` | `<podcast:remoteItem feedGuid="X" itemGuid="Y"/>` |
| `["medium", "music"]`, running until the next one | `medium="music"` on each element |
| nothing | `feedUrl`, `title` |

Entries map one to one, **including the order and the optionality**: the
required `feedGuid` is position 1, the optional `itemGuid` is position 2, and
an item entry is a `remoteItem` with one more attribute rather than a different
kind of thing. The one difference is encoding — a `remoteItem` attribute holds
a bare guid, an `i` position holds a prefixed NIP-73 identifier — so converting
is stripping or adding `podcast:guid:` and `podcast:item:guid:`. Bookkeeping on
guids rather than translation. Everything below is about the bookkeeping.

## Position against repetition — and the event changed sides

This was the difference the rest followed from, and kind 10333 has since
crossed it.

A `remoteItem` names its feed on the element itself and carries nothing by
position. Kind 10333 used to name it by *position*: an item entry belonged to
the feed entry above it. It now writes the feed guid at position 1 of the item's
own `i` tag and the item guid at position 2 — the `remoteItem` shape in a tag
array, attribute for attribute and in the same order. Only `medium` is still
positional.

The repetition is therefore no longer the list feed's alone, and the price
below is now what kind 10333 pays too. The first real event published in this
format is enough to give it: that list held 196 feed entries and 227 items, of
which only 82 were feeds the user had actually favorited.

- **The old layout:** 196 feed guids + 227 item guids = **423 identifiers.**
- **Either format now:** each of the 227 items also names its feed, and the 114
  entries that existed only to place an item disappear, because nothing needs
  placing any more. So 227 × 2 + 82 = **536 identifiers.**

That is 113 more, and the added ones are all feed guids, which are UUIDs of
36 characters: about **4 KB** on a 36 KB event. The per-entry `k` tags the
same document already removed cost 11 KB. The repetition is therefore about a
third the price of a mistake that format has already paid for and undone.

What bought the 4 KB is the reason the list feed never had these problems: an
item guid is unique only inside its feed, so an entry that does not name its
feed is not an address. The two sections below were open questions about kind
10333 when this page was written, and both are answered the same way the list
feed answers them — by repeating the feed guid.

Count identifiers only. XML says more around each one than a JSON tag array
does, so a generated feed is larger than this in absolute terms; the ratio is
the part worth carrying away.

## What the repetition buys

Two of the favorites spec's open questions do not exist in a list feed, and
both for that one reason.

**A feed entry is not always a favorite.** It used to be true of kind 10333
that the only way to say where an item came from was to open an entry for its
feed, so a feed entry appeared whether or not the user favorited it — 114 of
those 196. A `remoteItem` carries its feed inline, so an item reference needs
no such entry, and a reference with no `itemGuid` is unambiguously the feed.
The question never arose there.

A revision of the spec first answered it with a marker — `fav` or `placement`
on the feed entry, a few bytes per entry rather than a repeated identifier, and
cheaper than the repetition priced above. That marker is gone. Kind 10333 now
does what the list feed does: the item carries the feed guid, so a feed entry
appears only when the user favorited the feed and there is nothing to label.
Both formats now pay identifiers to make the question impossible, and the
event is no longer buying a cheaper answer to a question of its own making.

**No fallback when a guid will not resolve.** The favorites spec considered a
URL hint at position 2 of an `i` tag, so an entry the Podcast Index cannot
resolve would be more than a guid and nothing. The slot went to the item's
identifier instead, which is not really a trade: without it an item favorite
has no address at all. A URL would have been the weaker occupant anyway, for the
reason the namespace itself gives — `<podcast:guid>` is assigned once and
outlives the feed URL, so a stored URL is stalest exactly when it is most
needed. The namespace already spends an
attribute on the fallback, and says why —
`feedUrl` is "beneficial ... for those cases as a fallback", and if both are
present a capable app resolves `feedGuid` and uses it. `title` answers a
second version of the same problem: it lets an app draw the list before any
lookup at all. Kind 10333 carries neither, so an unresolvable entry renders
as nothing, and a cold start renders as nothing until the lookups return.

Record both as evidence about a trade, not as a rule. Nothing here says the
favorites format chose wrong: it bought a smaller event, and a smaller event
is the constraint it is built around.

## What kind 10333 has and a list feed does not

Many equal writers. A user signed into three apps across two devices has five
writers on one event, all equal, none aware of the others, and every one of
them replaces the whole thing on publish. That is why
[Merging](pc20-favorites.md#merging) exists: read before every publish, keep a
private baseline, carry what you cannot parse, `content` included, publish
only when the bytes change.

A list feed has one writer with file access. It needs none of those rules, and
a reader who comes from RSS should not read them as complexity for its own
sake. **They are the cost of the transport, not of the data.** Removals and a
private half are the other two things the event can express and the feed
cannot: nothing in RSS removes an entry from somebody else's copy, and nothing
encrypts half a channel to its author.

## Ordering means two different things

Document order in a list feed is the order to play the tracks in. Somebody
chose it.

Order in kind 10333 is structural. It carries which feed an item belongs to,
which is why the spec forbids sorting, deduplicating or rebuilding the tag
array — doing that reattaches every item to the wrong feed. The order that
results is a record of merge history: entries you read keep their position and
yours append. No one chose it.

So a list feed generated from a 10333 event has a play order that means
nothing, and a 10333 event built from a playlist throws the play order away on
the first merge by another app.

## Identity and sharing

A list feed is a document. It has a `<podcast:guid>`, a title, artwork and a
URL, and anybody who has the URL can fetch it.

Kind 10333 is one event per pubkey with no `d` tag and no title. A user
therefore cannot name a list, cannot keep two, and cannot hand one to someone
else — the event is *my favorites*, not *a list*. Sharing is the thing the
list feed does that the event structurally cannot, and exporting to a `musicL`
feed is the shape that gap has.

## Privacy

Both are public, and the difference is which direction the lookup runs.

`i` is a single-letter tag, so relays index it, and a `#i` filter answers
"which pubkeys favorited this feed". The favorites list is searchable in
reverse — not merely readable by someone who already has the pubkey. A list
feed is readable by anyone holding its URL, and discoverable if it is indexed,
but there is no equivalent query that starts from a track and returns the
people who saved it.

The optional private half in `content` has no counterpart in RSS at all.

## If you convert between them

Facts a bridge has to respect. Each is already argued in the favorites spec;
they are collected here because a converter is where all three get broken at
once.

- **A feed entry is a feed favorite, and nothing else is one.**
  Every `podcast:guid` entry converts to a feed-level `remoteItem`, and an item
  entry converts to a `remoteItem` carrying both guids. There is no third case:
  a converter that also emits a feed-level `remoteItem` for every feed guid it
  sees on an item manufactures favorites the user never made, and on the list
  measured above that is 114 of them.
- **An entry above the first `medium` tag has an unknown medium.** Leave the
  `medium` attribute off. Filling it in turns an absence into a claim, and no
  other app has a reason to correct it.
- **Do not export a private half.** Entries in `content` are there because
  somebody chose to hide them, and a list feed is a public document.
- **A guid is not enough on its own.** The event stores no `feedUrl` and no
  `title`, so anything the Podcast Index cannot resolve converts to a
  `remoteItem` with `feedGuid` and nothing else.

## Known gaps

- **No app was read.** The implementation clones were not reachable from the
  environment this page was written in, so nothing here claims which apps read
  or write a list feed, and no commit is recorded for any of them. Everything
  above is spec against spec.
- **No commit is recorded for the namespace either.** Only the date, 2026-08-27,
  and the two document URLs. GitHub access in that session was scoped to this
  repository.
- **No converter exists**, in this repo or named from it, and this page does
  not specify one.
