# Cross-app Podcast Favorites on Nostr

A user's favorites should follow them between apps. This document specifies
how a Podcasting 2.0 app stores a user's podcast and music favorites on
Nostr, so that favoriting something in one app makes it favorited in every
other app the same person signs into: one flat list, one event.

**Any app may read and write it.** There is no primary writer, no ownership
and no out-of-band coordination — a user signed into three apps across two
devices has five writers, all equal, none aware of the others. That is the
point of the format, and it is also the source of every rule in
[Merging](#merging) below.

Those rules are not optional. The event is replaceable, so a writer that
publishes what it holds without reading first does not merely lose a race: it
deletes every entry the other four writers added, silently, on someone else's
device, with no undo and nothing on screen anywhere. **A blind publish is
data loss, not a conflict.**

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
    ["visibility", "public"],

    ["medium", "podcast"],
    ["i", "podcast:guid:<feedGuid>", "", "fav"],
    ["i", "podcast:item:guid:<itemGuid>"],

    ["medium", "music"],
    ["i", "podcast:guid:<feedGuid>", "", "placement"],
    ["i", "podcast:item:guid:<itemGuid>"],

    ["k", "podcast:guid"],
    ["k", "podcast:item:guid"]
  ],
  "content": ""
}
```

`content` is empty **on a list with no private entries**, which is what this
example shows. It is not a constant: it is the one free slot in the event, and
[rule 4](#4-carry-what-you-cant-read) requires you to republish whatever you
found there byte for byte. Copying the `""` above into a writer is how another
app's data gets deleted.

An `i` tag is `["i", identifier, hint, marker]`, and this document counts those
positions from zero: the identifier is at **position 1**, NIP-73's URL hint at
**position 2**, and the feed-favorite marker at **position 3**. The marker says
whether the user favorited the FEED, as opposed to the group being open only so
the item under it can name a parent — see [Saying whether a feed is
favorited](#saying-whether-a-feed-is-favorited). The show above is favorited;
the album below it is not, and only one of its tracks is. An item entry takes
no marker: nothing but a favorite puts one on the list.

`visibility` says which half the list lives in — see [The list is public or
private](#the-list-is-public-or-private-and-the-event-says-which). It takes no
part in grouping, and a reader that has never seen it ignores it safely.

**`alt` is a NIP-31 label, not data.** Emit `["alt", "PC 2.0 Favorites"]` as
the first tag, exactly once, and regenerate it on every publish rather than
carrying the value you read: the event can hold only one, and a client with no
definition for kind 10333 renders whatever is there. It takes no part in
grouping, and a reader discards it. ([Vector 21](#test-vectors).)

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
- **An item entry with no feed group open above it has no parent.** Nothing in
  this document writes one, and another writer may. Read it as an entry whose
  parent is unknown, carry it where it sits, and let it neither open nor close
  a group: moved to after a feed entry it would become that feed's item. A
  reader that treats it as junk deletes a favorite; one that lets it close the
  open group re-parents everything after it. ([Vector 20](#test-vectors).)
- **The same feed may appear as two groups.** That is well-formed — each item
  still attaches to the group most recently opened above it — and a writer
  that models groups by feed guid meets the second one already taken. Fold its
  items into the first, or carry both; never skip it. The items under a
  duplicate are real favorites and are named nowhere else.
  ([Vector 19](#test-vectors).) The two copies need not agree about the feed
  either: resolve the marker **per feed**, not per group, because the favorite
  is a property of the feed and not of the group that happens to carry it.
- **Nothing past the identifier takes part in grouping.** The hint at position
  2 and the marker at position 3 are read off the entry they sit on; they open
  nothing, close nothing, and re-parent nothing.

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
**a group appears whether or not the user favorited the feed**. In the first
real list published in this format, 196 groups carried only 82 favorited
feeds; the other 114 existed solely so a favorited track could name its
parent.

For most of this document's life nothing in the event told the two apart, and
that cost data in both directions. A reader that treated every `podcast:guid`
entry as a favorited feed manufactured favorites the user never made — an
implementation read its own output back and would have created 114 album
favorites on the next page load. Going the other way, unfavoriting a feed
while a track of it stayed favorited could not be said at all, and neither
could favoriting a feed *alongside* one of its tracks: both read back as a
group that might exist only for placement. One implementation measured 46 of
a user's 94 album favorites in that state — recoverable from that device's own
cache, and lost outright on a fresh install.

**The entry now says which**, and the next section is how. What follows here is
what a reader does with an entry that does not say, because a list written
before the marker existed is still a list somebody's favorites are on.

- **An ITEMLESS group is an unambiguous feed favorite.** Nothing else would
  have put it there.
- **A group with items and no marker is UNKNOWABLE.** Do not resolve it either
  way. Inventing a favorite is worse than missing one, and the missing case
  corrects itself as soon as the feed is the only thing left on that group, or
  as soon as an app that knows the answer states it.

### Saying whether a feed is favorited

A feed favorite and an item favorite are separate, independent things. Saving
one episode of a show you do not follow is an ordinary state, and so is
following a show none of whose episodes you have saved. **Position 3 of a feed
`i` tag** says which:

```json
["i", "podcast:guid:<feedGuid>", "", "fav"]
["i", "podcast:guid:<feedGuid>", "", "placement"]
```

- `fav` — the user favorited this feed.
- `placement` — this group is open only so the items under it can name a
  parent. The user has not favorited the feed.
- **Anything else, or nothing at all, states nothing**, and the reader falls
  back to the rules in the section above. Treat an unknown value as absent and
  carry the tag: it belongs to a writer newer than you.

**Position 2 is NIP-73's URL hint, and stays that way.** Write `""` when you
have no hint. This format has no use for the slot yet — see [Open
questions](#open-questions--not-yet-resolved) — but a generic NIP-73 consumer
reads position 2 as a URL, and handing it the string `fav` is a bug in
somebody else's client that nothing here can fix afterwards. A marker
therefore always ships four elements.

**Item entries take no marker.** An item on this list is a favorite; nothing
else puts one there, and nothing nests below it. Position 3 on an item entry
is unspecified — carry it, do not read it.

**Resolve the marker per FEED, not per group.** One feed may open two groups
([vector 19](#test-vectors)), and two writers need not have said the same
thing. A statement outranks silence in either direction, and `fav` outranks
`placement`, because `placement` means "I only needed a parent here" and never
"the user does not want this feed". So: any copy saying `fav` makes the feed
favorited; failing that, any copy saying `placement` makes it not; failing
that, the fallback rules above apply. The same order settles the two copies
that a whole-list move folds into one ([vector 15](#test-vectors)) — take the
strongest marker either copy held, or the favorite is dropped on the strength
of which half was concatenated first.

#### Writing one

**Favoriting is an addition; unfavoriting is a removal.** They are not
symmetric, and the [Merging](#merging) rules already say why.

- **Emit `fav` for a feed you hold as favorited.** An addition needs nothing
  but your own local state.
- **Emit `placement` for a group you opened yourself to place an item**, and
  for a feed favorite the user removed **in your app** — meaning your baseline
  claims it. Removing a favorite is a removal, and removals go through the
  baseline exactly as dropping an entry does.
- **Carry, and never restate, the marker on an entry you are only carrying.**
  You do not know whether that show is favorited; the absent marker is
  precisely that. Stamping `fav` there manufactures the 114 again, one level
  up. Stamping `placement` deletes a favorite that no other app can put back,
  because the app that knew has no reason to publish again.
- **A `fav` your baseline does not claim is another app's, and holding the
  feed as a mere placement does not beat it.** Overwrite it and that app
  restates it on its next cycle, you overwrite it again, and the two of you
  rewrite the event at each other forever — each publish locally reasonable,
  the only symptom being that it never stops.
- **Express a removal by writing `placement`, never by leaving the marker
  off.** An unmarked entry means "nobody has said", so an unmarked removal is
  invisible to every reader, and on a group whose last item has also gone it
  reads back as a favorite — the one the user just dropped, returning.
- **A group with nothing to place and no favorite on it is not an entry.**
  Drop it.

**Your local state needs three values for a feed, not two:** favorited, not
favorited, and *not known*. An app that adopts the shared list into its own
library (rule 2 describes both models) meets unmarked groups with items, and
the honest answer for those is the third one. Collapse it into either boolean
and your next publish states something the user never said.

**A feed favorite is a claim of its own in the baseline.** The entry and the
marker are two different assertions — a group can be on the list because your
device placed a track under it while a different app is the one saying the
show is favorited — so a baseline that records only identifiers cannot express
taking the favorite back, and cannot tell your own past `fav` from somebody
else's. Record it separately, per half, under the same rules as everything
else in [rule 2](#2-keep-a-baseline). ([Vectors 25, 26 and
27](#test-vectors).)

**On a mixed list the gap narrows rather than closing.** A writer that has
never heard of the marker carries it — [rule 4](#4-carry-what-you-cant-read)
covers the whole tag, extra elements included — so nothing it does destroys
one. What it cannot do is *change* one, so a show unfavorited in that app
while a track of it stays favorited is still invisible, exactly as before.
That is the old behavior, unchanged, and it is why the prerequisite below is
worth stating.

**The prerequisite: stop rebuilding `i` tags from your own model.** A writer
that emits `["i", id]` for every entry it read drops every marker on the list
in one publish, silently, and the result looks exactly like nobody having
favorited any of those shows. Carrying the whole tag was already the rule; it
now has data behind it that a reader can see.

**Status: nothing implements this, and BOTH existing writers would destroy a
marker today.** Read at `stablekraft-app@4722dd8`
(`lib/nostr/favorites-single-list.ts`) and `boostmebitch@938f90d`
(`lib/nostr/favorites-list.ts`). Each parses the list into an ordered node
list, and each re-emits a node it could place as a bare two-element tag:
`tagsFromNodes` pushes `['i', feed]` and `['i', id]` per group, `tagsFromList`
pushes `['i', showId(...)]` and `['i', itemId(...)]`. boostmebitch states it as
an invariant in its file header — "An `i` tag is bare — `['i',
'<identifier>']`, two elements."

Only a tag they could NOT place survives whole. Both call that a loose node and
copy the array as it arrived, and stablekraft's comment on it says the intent
outright: a third element "survives a round trip; re-rendering it from our own
model would not". A well-formed `podcast:guid:` is placed, so it is re-rendered
— and a marker on it is gone on the first publish after the read, silently,
with the writer that erased it seeing a list that looks correct.

So the prerequisite is not a caution about some future writer. It is work in
two repos, and it comes first.

That is also the one thing about the sequencing that is heavier than it looks,
because the rest of it is lighter than the private half's. `content` had to be
carried by everyone *before* anyone could write into it, since a writer
following this document to the letter republished `""` and destroyed what it
found. A marker needs no such round once the rebuilding stops: carrying the
whole tag is already rule 4, and a writer that honours it preserves markers it
has never heard of without being told.

**Half of the local state already exists in one app.** `stablekraft-app`
carries `favorited` on its group model, sets it true when the feed itself is a
favorite, and its own comment records why it goes no further: "Not expressible
on the wire ... meaningful on the way OUT and always false on the way back IN."
That is the field this section gives a wire format to. It is a boolean, though,
and this section needs three values — `false` on the way back in is the
`unknown` case answered as "not favorited", which is the guess that deletes a
favorite no other app will restate.

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

### The list is public or private, and the event says which

A list is wholly in the plaintext tags or wholly in the encrypted `content`.
It is never split across the two, and an entry is never in both.

**A `visibility` tag states which.** It is the mode of the whole list, not of
the app that wrote it, and any app may change it at any time.

```json
["visibility", "public"]
["visibility", "private"]
```

Multi-letter on purpose: relays index single-letter tags, so an `["v", …]`
would let a `#v=private` filter enumerate the pubkeys that keep a private
list. Nothing else about it is positional — put it next to `alt` and treat it,
like `k`, as taking no part in [grouping](#grouping-rules).

**Why a tag, when the encryption already says it.** Almost. "Whichever half
holds entries is the mode" answers correctly for every list that has entries,
and it is what both existing implementations do. It cannot answer for a list
that has none — a new account, or one whose last favorite was just removed —
and that is not an edge case, it is where every user starts. An app that
guesses `public` there and publishes their next favorite has written a
relay-indexed `i` tag for someone who chose Private in another app an hour
ago, and `i` cannot be taken back. Guessing `private` is wrong the other way
round and merely annoying. There is no safe default, so the event has to say.

The second thing the tag buys is a **direction to fold in**. Before it, a list
found with entries in both halves ([vector 15](#test-vectors)) was ambiguous:
you could carry it, which is what that vector requires, but nothing said which
half the user had actually asked for. Now something does.

**Absent, it is inferred, and that is the whole migration.** No `visibility`
tag means: entries in exactly one half, that half is the mode; entries in
both, or in neither, **ask the user and publish nothing until they answer.**
Every list published before this section reads correctly under that rule. And
a writer whose standing setting names the EMPTY half of such a list follows
the list or asks; it does not act on the setting. That is one app overruling
another, which is the same conflict a stated mode exists to settle — both
existing implementations stop and ask there.

**The tag is written on a choice, and carried once it is there.** A writer
emits it for the first time when the user picks Public or Private in that
app, and from then on every writer carries it forward on every publish —
regenerated from what it read, never replayed as a foreign tag, or the event
states the mode twice with the stale copy second. A writer's standing setting
never stamps the tag onto a list that has none: that states a mode nobody
picked, and on a list that already has a private half the stamp is what would
license disclosing it. So a legacy list stays untagged until somebody chooses,
which is what both existing implementations do. Emit it on a public choice as
much as on a private one, or its absence stays ambiguous forever.

**Changing the mode requires being able to read BOTH halves.** An app whose
signer has no NIP-44 cannot see the private half, so it cannot move those
entries and cannot honestly claim the list is public — it would be stating a
convergence it is not able to perform, and the entries it cannot see would sit
encrypted under a tag saying they are not. Such an app carries `content`
verbatim, keeps writing into the half the tag names if it can, and says on
screen that it cannot open the other one. An empty `content` satisfies this
trivially, which is why a fresh list can be set either way by anybody.

**That requirement is what makes the tag consent.** The old rule here was an
asymmetry: public → private could move another app's entries because it only
reduces exposure, and private → public could not, because publishing an `i`
tag is a disclosure and irreversible. The asymmetry existed because no app
could tell the user's intent for the whole list from the event. The tag is
that intent, stated by an app that could see everything it was about to
disclose — so with the tag present the move is symmetric:

- **A writer that finds the tag and the entries disagreeing, and can read both
  halves, converges toward the tag.** One copy of each entry, in the half the
  tag names, and the other half emptied.
- **A writer that cannot read both halves does not converge.** It carries, and
  it reports the state rather than leaving it silent.
- **With no tag, the old asymmetry still applies** — public → private moves
  everything, private → public moves only what your baseline claims. There is
  no stated intent to act on, so the conservative rule stands.

**"Not on Nostr" is a local choice and is not on the wire.** An app that stops
syncing withdraws the entries its own baseline claims and publishes nothing
further; the list, the tag and every other app's entries are unaffected. There
is no third `visibility` value, and writing one would tell every other writer
to stop on the strength of one device's setting.

### Writing the private half

The private half is a tag array, stringified, encrypted to the author's own
key with NIP-44, and put in `content`. The [grouping rules](#grouping-rules)
apply inside it unchanged. Four rules govern the bytes, and each one is a
defect an implementation shipped before it was written down here.

- **The plaintext carries no `?`.** Write the character as its six-character
  JSON escape, `\u003f`, before handing the string to the signer. A NIP-55
  signer URL-decodes the whole `nostrsigner:` URI and only then splits it on
  `?`, so a plaintext carrying one is truncated there and the request comes
  back malformed — with an error that reads as "signer not installed". Item
  guids are routinely permalink URLs, so this is not an edge case: one
  favorited track with a query string in its guid breaks every private publish
  on that device, forever. Percent-encoding does not help, because `%3F`
  decodes back into the character it splits on. The JSON escape does, because
  every reader already understands it: `JSON.parse` returns the same string
  byte for byte in any implementation, so a writer that never heard of this
  rule still reads the list. ([Vector 22](#test-vectors).)
- **A plaintext that is not a tag array is an unreadable half.** Treat it
  exactly as a decrypt that failed: carry `content` byte for byte, publish
  nothing derived from it, and say so on screen. A `JSON.parse` that succeeds
  on `{}` or on `"a string"` otherwise marks the half readable and empty, and
  the next republish rewrites `content` from that emptiness — another app's
  entries gone, from a decrypt that worked. ([Vector 23](#test-vectors).)
- **Refuse to publish a plaintext past 60,000 bytes.** NIP-44 v2 as first
  published capped plaintext at 65,535 bytes, and a signer built to that text
  rejects a payload across the line — so on that device the list reads back
  as empty, not as an error. The margin under 65,536 is for what NIP-44 adds
  on the way to `content`: it pads to a power-of-two chunk and base64-encodes,
  about 1.5×. Refusing costs the user one favorite and a message; publishing
  costs them the whole list on whichever app hits the cliff, with nothing on
  screen saying why. About 500 favorites fit. ([Vector 24](#test-vectors).)
- **Compare decrypted arrays, never ciphertext.** NIP-44 draws a fresh nonce
  per encryption, so identical entries produce different bytes every time, and
  a ciphertext comparison republishes on every load, forever. Compare the
  ciphertext only where you could not decrypt it — there, byte-identity is the
  carry rule.

## Merging

Every publish is a full replacement, and every app may publish. So a writer's
job is not "serialize my favorites" — it is **read the current event, fold my
changes into it, and write back everything else untouched.**

### 1. Read before every publish, and never publish on a read you don't trust

Do not expose a "publish my favorites" entry point at all. Make reading part
of the same call, so no caller can skip it: the read is the only thing that
makes the write safe.

A relay query returning nothing has two meanings — "nobody has it" and
"nothing answered in time" — and under wholesale replacement, acting on the
second is the most expensive mistake this format allows. One bad read,
republished, is the entire list, for every app the user owns. **Publish
nothing unless the read is trustworthy.**

Count relays yourself: `trustworthy = event_in_hand OR (reached > 0 AND
answered == reached)`, where `reached` counts relays that accepted a
connection and stayed up, excluding ones that never connected — requiring
every *listed* relay to answer means one permanently dead default degrades
every read forever. An aggregate EOSE from a relay library is not proof: in
at least one library a failed connection is folded into the same callback, so
being offline reports "everyone answered, nobody has it" in about 19 ms.
Libraries also synthesize an EOSE on a timer, indistinguishable from a real
one at the callback, so push that timer past your own deadline.

Withholding a publish is invisible to the user, and on a device with no local
cache it renders identically to "your favorites are gone". Say so in the UI;
a silent correct decision cannot be told apart from a broken one.

### 2. Keep a baseline

The event carries no provenance. Nothing on an entry says which app added it
or when, so when the list and your local state disagree, the disagreement is
ambiguous:

> The list has an entry. Your local state doesn't.
> Either another app just added it, or you just removed it.

Identical bytes, opposite meanings, and both naive answers destroy something:
prefer the list and unfavoriting silently stops working forever; prefer local
state and you delete every entry the other apps added.

So each writer keeps a **baseline**: the set of identifiers it last agreed
with the relay on, stored privately on the device. It is not on the wire,
other apps never see it, and no two writers need theirs to agree.

- Record it **only after a publish is confirmed by a relay.** A baseline
  written for an event that never landed says "I am already asserting this",
  which is exactly what stops the entry from ever being retried.
- Record only **your own** contribution, never the whole list you just
  published — otherwise the entries you were carrying on another app's behalf
  become yours to delete on the next cycle.
- **"Your own" means what you will keep asserting, not what you wrote.** The
  two implementations of this format draw that line in different places and
  both are conformant, so it is worth stating exactly. One records the entries
  it holds locally. The other adopts the list it read into its own library —
  it renders the whole thing and lets the user unfavorite any of it — and
  records that, foreign entries included.

  The second is not the clobber this rule forbids, because adoption makes the
  claim true: those entries are in its local set, so it goes on asserting them
  and the removal test never fires by accident. An app that renders the shared
  list as one library **has** to claim what it renders, or the user can never
  unfavorite an entry another app added.

  So the test is not where the ids came from. It is whether you will still be
  holding them next cycle: **you may claim an entry you have adopted and will
  keep asserting; you may never claim one you are merely carrying.** Everything
  below about two halves is that same sentence applied per half — you adopt out
  of the half you write into, and you only carry the other.
- **A feed favorite is a claim of its own, beside the entry's.** The two are
  separate assertions about the same feed — you may be the reason the group is
  on the list without being the reason it is marked `fav`, and the other way
  round — so record them separately or you can express neither removal. A
  baseline holding only identifiers reads the next cycle's `placement` against
  the wrong thing, and the marker either never comes off or comes off an entry
  another app is asserting. See [Saying whether a feed is
  favorited](#saying-whether-a-feed-is-favorited).
- A baseline describes **one list**. Never seed it from another list, another
  address, or an older format's baseline: that asserts you published ids to
  an event you have never written to, and the first entry that matches gets
  read as "mine, and I removed it" and deleted. An implementation shipped
  exactly that and destroyed an album favorite that existed only on the other
  app's side.
- **Losing it is safe; guessing is not.** An empty baseline yields no
  removals, so the next publish is a pure union. Start there.
- **If the event has two halves, answer "your own contribution" for each half
  separately — and the half you did not publish into has no new contribution,
  so its claims are CARRIED, never recomputed.** Under one whole-list choice a
  writer feeds its local entries into one half and passes the other an empty
  list. Recompute that half's claims from what you merged and you claim every
  entry in it, another writer's included; nothing backs the claim next cycle,
  so rule 3's *an entry in your baseline, absent locally* row fires on the
  whole half at once and deletes it.
  Carrying instead keeps the claims made while that half *was* the one you
  wrote into, so moving an entry between halves still works.

  Two things make this hard to catch. The damage needs **two cycles** — the
  first publish emits correct bytes and only the baseline recorded beside it
  is wrong — and the first cycle need not publish at all, because a writer
  that records a baseline when the bytes already match records the bad one
  anyway. One implementation shipped this in both directions at once; see test
  vector 14.

### 3. The merge

Walk the entries you read, **in order**, and emit:

| what you find | what to do |
|---|---|
| an entry you hold locally | keep it |
| an entry not in your baseline | **carry it** — another app added it |
| an entry in your baseline, absent locally | drop it — you removed it |
| anything you can't parse | carry the whole tag — see 4 below |

Then append entries you hold that weren't on the list at all — **unless your
baseline names them**, in which case another app removed them and re-adding
is a resurrection loop: the entry returns on every load, forever, on every
device.

Three consequences worth stating outright, because each is a way to delete
someone else's data while looking correct:

- **Reconcile items under every feed group, not only groups you still hold.**
  Otherwise unfavoriting a track whose album you have since dropped never
  propagates.
- **Reconcile the feed favorite separately from the entry.** The rows above
  decide whether a `podcast:guid` entry survives; they do not decide what its
  marker says. Run the same three questions against the marker, against its
  own baseline claim: hold it favorited and it is `fav`; claim it and no
  longer hold it and it is `placement`; neither hold nor claim it and it is
  carried exactly as read. This is what lets a show be unfavorited while one
  of its episodes stays — the entry stays, because the episode still needs a
  parent, and the marker is where the removal is said.
- **A feed group survives while any item under it does**, even when your
  baseline says the feed is yours and you no longer hold it. The group is the
  only thing naming those items' parent; dropping it takes another app's
  tracks with it. Drop it only once nothing is left to place.
- **Entries you read keep their position; yours append.** Imposing your own
  order on every republish makes two apps reorder the event against each
  other forever, each publish locally reasonable, the only symptom being that
  it never stops. **This holds inside a group as much as between them**: the
  items you read keep their order, and a new item goes at the end of its own
  group's run — not at the end of the event, where it attaches to whichever
  group was opened last, and not ahead of the items already read, which is the
  local-first order. The two existing implementations disagreed on exactly
  this for the format's first three weeks, and the event was rewritten back
  and forth in production the whole time. ([Vector 18](#test-vectors).)

### 4. Carry what you can't read

An identifier kind outside your table, a tag type you have no meaning for, a
`k` naming a kind you never emit, a `podcast:guid:` whose guid is malformed —
all of it belongs to a writer newer or older than you. Carry the **whole
tag**, not a value re-rendered from your own model: a later revision may put
something at a position you don't read yet.

**"Whole tag" means every element of it**, and this is no longer hypothetical:
positions 2 and 3 of an `i` carry a URL hint and a [feed-favorite
marker](#saying-whether-a-feed-is-favorited). A writer that rebuilds entries as
`["i", id]` type-checks, renders correctly, and erases every marker on the list
in one publish. ([Vector 27](#test-vectors).)

An unparseable entry must not close the open feed group either. An
unrecognized `i` sitting between a feed and its items must not re-parent
everything after it — the entries around it belong to a writer that knew what
it meant, and your not understanding one of them is not licence to move the
others.

"I can't render this" is not the same claim as "this is junk". Deleting an
entry should be a thing the user asked for.

#### `content` is carried too, and this rule did not used to say so

Everything above is about **tags**, and for most of this document's life that
was the whole of it — `content` was empty, the Data Structure example showed
`""`, and no rule mentioned it. That silence is a trap, so it is worth being
explicit about what it costs.

`content` is the only free slot in the event. A writer that supports a
[private half](#open-questions--not-yet-resolved) puts NIP-44 ciphertext
there. A writer that does not, and that follows this document to the letter,
republishes the empty string the format has specified from the start. The
first favorite toggled in the second app erases every private entry the first
one wrote: silently, on someone else's device, with no undo, on a replaceable
event that keeps no history to recover from — while behaving correctly by the
document it was written against.

So, as a rule and not as advice:

> **Republish `event.content` byte for byte, unless you encrypted the bytes
> you are replacing it with.** An empty `content` on a republish must be what
> the read actually held.

Two things follow, and both are easy to get wrong in the same direction:

- **Do not give the value a default.** A default is how a `""` gets written
  back in by habit — one caller that omits the argument compiles, type-checks
  and deletes another app's data. Building a list from scratch is the only
  case with nothing to carry, and it can say so at the call site.
- **Capture it on the read.** An implementation that never reads
  `event.content` has nothing to put back even in principle, which is the
  state both existing implementations were in when this was found.

Carrying is **mandatory**. Using `content` is **optional** — an app that never
encrypts anything still conforms, and that combination is the only one that
does not destroy data.

### 5. Publish only when the bytes change

Compare your merged tag array against the array you read, byte for byte. If
they match, publish nothing.

Compare against **the read**, not against a digest of your own last publish —
only the former notices that another app has edited the event since. This is
also test vector 3 executed on every cycle in production rather than only in
a test: if your merge is not idempotent, two apps rewrite the event against
each other indefinitely.

## What this format does not do

- **No split between shows and items ACROSS EVENTS.** A show favorite and an
  episode favorite are separate things on the list — [position
  3](#saying-whether-a-feed-is-favorited) is what makes them separate — but
  both live in the one event, so a large favorites list risks hitting relay
  size caps (~128 KB on nos.lol).
  Item favorites accumulate an order of magnitude faster than feed
  favorites — a listener saving individual tracks passes a thousand without
  trying, where the same person follows perhaps forty shows — so the tracks
  are what eventually make a publish fail, and they take the show
  subscriptions down with them.
- **No provenance, and so no last-write-wins.** Nothing on an entry records
  which app added it or when, which is why every writer has to keep its own
  baseline (see [Merging](#merging)) instead of deriving the answer from the
  event. Per-entry authorship, tombstones for removals, or timestamps would
  each remove that requirement and let a reader work it out from the wire
  alone. All three cost bytes on a list whose whole purpose is to hold as
  many entries as it can, and none is specified here.
- **No concurrency control.** Two apps that read the same version and publish
  within a second of each other will still lose one set of changes; the merge
  rules make each publish *correct with respect to what it read*, not
  serialized. `created_at` and relay last-write-wins decide the survivor. In
  practice favorites are toggled by one human at human speed, so the window
  is small — but it is real, and it is why a client should re-read rather
  than assume its own last publish is still current.

## Test vectors

A conforming implementation should pin at least these. They are stated as
behaviors rather than fixtures so they can be written against any test
runner.

**1. A foreign entry survives your republish.** Read a list containing a feed
group your app cannot resolve, publish, and the group and its items must come
back byte-identical, in the same relative position, under the same medium.
Your own new feed lands at the end of its medium run — which need not be the
end of the event. This is the vector that catches a writer built from local
state alone, which is the natural way to write one.

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

**8. An entry you removed disappears; an entry you never published does not.**
The same input — on the list, absent from your local state — must produce
opposite results depending on the baseline. Pin both directions from one
fixture, or an implementation that ignores the baseline entirely passes the
half you wrote.

**9. An entry another app removed is not resurrected.** Hold it locally, put
it in your baseline, read a list without it, and it must stay gone. The
obvious append-everything-local step re-adds it, and because the same step
runs on the next load, the favorite returns forever on every device.

**10. A baseline is never written for a publish that didn't land.** Simulate
a publish that reaches no relay: the baseline must be unchanged, so the next
toggle retries. Recording it anyway is what makes a lost publish permanent —
the entry is now "already asserted" and is never sent again.

**11. A group whose last item you removed goes, but one with a foreign item
left under it stays.** Both are "a feed in my baseline that I no longer
hold"; only the first is a removal you may express. Getting this wrong
deletes another app's tracks along with the group that named their parent.

**12. An opaque `content` survives a republish by a writer that cannot read
it.** The sibling to vector 1, for the half of the event that is not tags.
Read a list whose `content` is a string you have no way to interpret, change
a favorite, publish, and it must come back byte-identical. Pin the inverse in
the same breath — a list built from scratch is legitimately empty — or a
writer that simply never touches the field passes on a technicality.

Both existing implementations passed every vector above it while blanking
`content` on the first favorite anyone toggled, because none of them looked
at that field. That is what makes this one worth stating separately.

**13. Going private takes the whole list, and coming back does not.** Read a
list holding entries you did not write and cannot resolve, choose Private,
and every entry must move — yours and theirs. Then read the result with a
standing setting of Public and no choice, holding whatever this device now
holds: the list says private, so a writer either follows it and publishes
nothing, or asks — and if it publishes at all, only the entries its baseline
claims may return to the tags, and nothing is lost from either half. The two
halves of this vector fail in opposite directions: the first leaves a user
97% private with nothing on screen saying which entries are still public, and
the second publishes another app's private entry as a relay-indexed `i` tag.

**14. A writer does not delete the half it does not write into — and this
takes TWO cycles to observe.** Read an event with entries in both halves,
where the ones in the half you do not publish into are not yours. Run a full
cycle, feed the baseline it recorded back in, and run a second. The foreign
entries must still be there after the second. One cycle cannot see this: the
first publish emits correct bytes and only the baseline beside them is wrong,
so every single-cycle vector above passes over it. One implementation shipped
it in both directions at once: the same writer, in public mode, published an
empty `content` over a private half it was carrying, and in private mode
published an empty tag list over a public one. Whichever half a writer does
not feed is the half at risk, so a writer with only one half is not exempt —
it is simply not yet in a position to notice.

Pin the control in the same fixture, or a writer that never claims anything
passes: a list adopted off the relay must still enter the baseline for the
half you *do* write into, or a later move between halves copies instead of
moving, and the entries the user asked to hide stay in plaintext beside the
encrypted copy.

**15. A list found with entries in BOTH halves is carried, then converged
once.** Read an event whose public tags and whose decrypted `content` name
some of the same entries, where the private half also holds entries the public
half does not. A cycle must return both halves intact: an entry appearing
twice is not evidence that either copy is yours, and a writer that tidies the
list by emptying one deletes entries it never wrote. Then converge, with the
baseline claiming the inactive half and the device still holding what it
claims — a claim without the entry behind it is a removal, rule 3 — and pin
the thing only this state can produce — **an entry that was in both halves must be emitted ONCE**. The
claimed-back copy is the same entry, not a second one, and concatenating them
opens a second group for one feed and double-counts it for every reader. The
reference implementation did exactly that, and no vector above reaches the
state that shows it. Carrying it silently is the other failure: every entry in
the overlap is public, so a user who chose Private has not got it and nothing
says so. Measured: 284 public, 287 encrypted, 284 in both, on an account whose
every screen said it was fine. Vector 13 pins the switch; this pins what the
next reader owes the result.

**16. The stated mode outranks whatever the halves happen to hold.** Two
fixtures, and the first is the one nothing else can reach. Read a list with
`["visibility","private"]`, **no entries in either half**, and publish one
local favorite: it must land in `content`, not in the tags. Every rule above
answers this from emptiness, and emptiness has no answer — an implementation
that infers the mode discloses that favorite as a relay-indexed `i` tag, on
the account of a user who chose Private somewhere else. Then the converging
half: read a list with `["visibility","public"]` whose `content` still decodes
to entries, and a writer that can read both halves must emit each of them
once, in the tags, with the private half emptied. The tag is the consent that
licenses that move; without the tag, [vector 13](#test-vectors)'s conservative
rule still applies and the same fixture must NOT move them.

**17. A writer that cannot read a half may not restate the mode.** Same
`["visibility","private"]` list, `content` this writer's codec cannot decode,
and the writer set to public. It must publish `content` byte-identical, must
not emit `["visibility","public"]`, and must not move anything. This is the
disclosure the [read-both-halves
rule](#the-list-is-public-or-private-and-the-event-says-which) exists for: an
app claiming a list is public while the entries it cannot see stay encrypted
has published a false statement about someone's privacy, and the next app to
believe it converges on the strength of it. Pin the control in the same
fixture — the same writer, the same list, but `content` it CAN decode — or an
implementation that never restates the mode at all passes.

**18. Items keep their wire order, and a new item lands at the end of its own
group.** Read a list with two groups, hold the first group's items in a
different order plus one new item, and publish: the items already read keep
their order, the new one follows them and precedes the next group, and it
parses with its own feed as parent. Three well-formed wrong answers: local
order first (the other app then imposes its order back, forever), appended to
the end of the event (it re-parents to the last group), or sorted by anything.

**19. The same feed twice on the wire loses no item.** Read a list in which
one feed opens two groups, each with an item, and both a carry and a change
of your own must leave every item under that feed. A writer that models
groups by guid meets the second one already taken, and skipping it drops the
item beneath — a real favorite, named nowhere else.

**20. An item before any feed group is carried, in place, and opens nothing.**
Parse it as an entry with no parent; the items after the next feed entry
belong to that feed, not to it. Republish, and it is still there, still ahead
of the first group — moved to after a feed entry it would become that feed's
item.

**21. Exactly one `alt`, ours, first.** Read a list whose `alt` carries some
other label, publish a change, and the event's first tag is
`["alt", "PC 2.0 Favorites"]` with no second `alt` beside it.

**22. The private plaintext carries no `?`.** Encode an item whose guid holds
a query string: the plaintext contains no `?` character, `JSON.parse` of it
returns the original tags, and a full cycle in private mode gives the guid
back out of `content` unchanged.

**23. A plaintext that is not a tag array is an unreadable half, not an empty
one.** `{}`, a string, an array holding a non-array, an array holding a
non-string all decode to null — and `[]` to an empty list. Put such bytes in
`content`: a public-half change carries them byte for byte, and a writer set
to private publishes nothing, because it may not write into a half it could
not read.

**24. A private half past the NIP-44 v2 cliff is refused.** Hold enough items
that the plaintext exceeds 60,000 bytes, set private, and the cycle publishes
nothing and claims nothing. The same shape well under the line publishes. Grow
the fixture from the writer's own plaintext, so the vector tracks the cap
rather than a guess about bytes per entry.

**25. A feed favorite and an item favorite are stated separately.** Favorite
one episode of a show you do not follow: the group opened for it says
`placement`, and the marker sits at position 3 with `""` at position 2, which
is NIP-73's. Then favorite the show as well — the state this format could not
express at all before, because a feed favorited alongside one of its tracks
read back as a group that might exist only to place the track. Same group,
same item, `fav`, and the item still parses with that feed as its parent. Pin
the reading of a list that has no markers in the same fixture — itemless is a
favorite, with items is unknowable, and answering `true` there is the mutation
that manufactured 114 album favorites off one real list. Pin the folding too:
one feed with two copies, disagreeing, resolves to the strongest either held,
whether they are two groups on the wire or the two halves of a whole-list
move.

**26. Unfavoriting the show keeps the episode, and says so.** Read a list with
a `fav` feed and an item under it, hold the feed as not favorited with your
baseline claiming the favorite, and publish: the marker becomes `placement`,
the item is still there, and it still parses with that feed as its parent. The
removal must be STATED — a writer that expresses it by leaving the marker off
has said "nobody knows" rather than "not favorited", and on a group whose last
item has also gone that reads back as the favorite the user just dropped. Pin
the other direction from the same fixture — drop the episode, keep the show —
and pin the conflict: a `fav` your baseline does not claim is another app's,
and holding the feed as a placement does not beat it. Overwriting it has the
two of you rewriting the event at each other forever.

**27. A marker is carried whole, and never invented for an entry you carry.**
Rule 4 inside an `i` tag. A writer with no notion of markers — nothing in its
local state says favorited or not — republishes position 3 and any hint beside
it byte-identical; rebuilding entries as `["i", id]` erases every marker on
the list in one publish and looks exactly like nobody having favorited those
shows. Then the inverse, which is the 114 one level up: a writer that DOES
know about markers may not stamp its own answer onto a group it is merely
carrying. It does not know, `fav` invents a favorite, `placement` deletes one
no other app will restate, and the absent marker is the only honest output.

## Open questions / not yet resolved

- **The list is public, and a private half is optional to support but not
  optional to carry.** Every entry is a tag, tags are plaintext, and `i` is a
  single-letter tag, so relays index it: a `#i` filter answers "which pubkeys
  favorited this feed". The list is searchable in reverse, not merely readable
  by someone who already has the pubkey. `content` is the only free slot in the
  event, and on a list with no private half it is empty.

  The shape this would take is
  [NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md)'s split:
  public entries stay in tags, private entries go in `content` as a JSON array
  that mimics the tag array, stringified and encrypted with
  [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md) to the
  author's own key. The [grouping rules](#grouping-rules) apply inside that
  array unchanged, because it is a tag array: `medium` still runs, and an item
  still attaches to the group above it. The two halves are two lists with two
  orderings, and no entry is in both. A user's list is all public or all
  private — **never split per entry**, which an earlier revision of this
  document allowed and which is settled in [The list is public or
  private](#the-list-is-public-or-private-and-the-event-says-which) — and an
  app that never encrypts anything still conforms, because carrying is
  mandatory and using it is not.

  **What no app may do is drop the half it does not use.** This used to be the
  blocker, and it is now [rule 4's `content`
  clause](#content-is-carried-too-and-this-rule-did-not-used-to-say-so) with
  [test vector 12](#test-vectors) beside it: carrying is mandatory, using it is
  optional, and that is the only combination that does not destroy data.

  **The choice belongs to the LIST, not to the app**, and getting this backwards
  produces a list that is 97% private. It was tried the other way first, on the
  reasonable-sounding rule that an app may only move entries it wrote: a user
  set one app to Private, its own 436 entries were encrypted, and 13 written by
  a second app stayed in the tags — public, relay-indexed, and searchable in
  reverse. Measured, on a real account. The user had made a privacy choice and
  the format had honoured most of it, which is the kind of partial that is worse
  than a clear no: nothing on screen said which entries were still public, and
  the remedy was to go and make the same choice again in every other app they
  had ever signed into.

  So: **the whole list has one mode, every writer puts its entries in that
  half, and the event says which.** That is the `visibility` tag, and the rules
  for reading it, changing it and folding a list toward it are in [The list is
  public or private](#the-list-is-public-or-private-and-the-event-says-which).
  Setting Private in any one app moves everything, including entries that app
  cannot resolve and did not write.

  Absent the tag, the mode is inferred from whichever half holds entries, and
  the direction of travel is asymmetric:

  - **public → private may move another app's entries.** It only ever *reduces*
    exposure, it is reversible by any app that can decrypt, and the entries are
    carried whole rather than dropped. The worst case is an entry sitting in a
    half its author has not learned to read yet, which is what the sequencing
    below exists to prevent.
  - **private → public may NOT.** It is a disclosure, it publishes an `i` tag
    relays index, and it cannot be taken back. Move only what your baseline says
    you put there, and carry the rest where it is.

  With the tag present the asymmetry lifts, because the thing it was
  compensating for — no way to know the user's intent for the whole list — is
  exactly what the tag supplies, and only an app that could read both halves is
  allowed to have written it.

  **A reader shows the private half whatever its own last choice was.** The
  entries are the user's, whoever wrote them, and rendering them discloses
  nothing. An implementation that filters the half it is not currently writing
  down to what its own baseline claims — a natural way to keep one app from
  adopting another's entries — hides the user's own favorites from them, on the
  device they just made the choice on.

  **The remaining sequencing is reader-first, and it is not optional.** A
  writer that encrypts before every other writer carries `content` does not
  fail loudly — it silently makes those favorites disappear on the far side,
  which is worse than the format it replaced. So: land the carry rule (done),
  ship it in **both** implementations, and only then let either one start
  writing a private half.

  Moving *another app's* entries has a further prerequisite on top of that, and
  it is the same shape one step along: an app must be able to **read and render**
  the private half before anything moves entries into it on its behalf. Until
  then the move is indistinguishable from a deletion on that app's screen. Ship
  the reading everywhere, then let the whole-list move go on.

  Four further things break, and none of them is optional either — the rules
  for the bytes themselves are in [Writing the private
  half](#writing-the-private-half):

  - **Idempotence, immediately.** NIP-44 draws a fresh nonce per encryption,
    so the same entries produce different bytes every time. The byte
    comparison in rule 5 therefore always differs, and every load republishes
    — two apps rewriting the event against each other forever, this time
    self-inflicted. Compare the *decrypted* array against the decrypted array
    you read, and compare ciphertext only where you could not decrypt it.
  - **A signer that cannot decrypt looks exactly like an empty private half.**
    Not every NIP-07 or NIP-46 signer implements `nip44`. Treat a decryption
    failure as a degraded read under rule 1: carry the ciphertext, publish
    nothing derived from it, and say so on screen. The user cannot otherwise
    tell "hidden here by choice" from "this app has not shipped support yet",
    and both render as a shorter list.
  - **Size, at about 1.5×.** NIP-44 pads to a power-of-two chunk, then base64
    encodes: 25 KB of tag JSON becomes 37 KB of `content`, and 90 KB becomes
    128 KB. The ~128 KB relay cap named above is then reached at roughly 90 KB
    of entries rather than 128 KB, so privacy costs about a third of the list
    — paid in item favorites, which are what fill it.
  - **The 64 KB boundary is an interop cliff, not a cap.** NIP-44 v2 as
    originally published capped plaintext at 65535 bytes. The current text
    allows 2^32-1 and switches to a 6-byte length prefix at 65536, so a
    library built to the older text rejects a payload across that line. A
    private list that grows past 64 KB may be unreadable in an app whose
    `nip44` is a year old — and unreadable is indistinguishable from empty.
    Stay under it until signers catch up.

  The baseline gains a job too: record which half an entry was in. Moving an
  entry from public to private is a removal and an addition, and a baseline
  that remembers only the identifier reads the move as "mine, and I removed
  it" on the next cycle and deletes it — the same failure as seeding a
  baseline from another list. Rule 2 says how the two halves' claims differ:
  the half you write into is recomputed, the half you carry keeps what it had.

  **Rendering both halves as one library is not the same as adopting both.**
  An app that shows the union — the natural thing, since it is one person's
  favorites — still has to keep the set it renders apart from the set it
  claims, because local state goes wholly into the half that app writes into.
  Adopt an entry out of the other half and the next publish moves it across.
  Which way that cuts is the asymmetry above: on a whole-list move to private
  it is the point, and the entry is meant to travel. Going the other way it
  is a **disclosure** — the entry reappears as a plaintext `i` tag, relays
  index `i`, and the `#i` filter named above now answers for it — so out of
  the private half you may adopt only what your baseline already claims, and
  you carry the rest where it is. Carrying an entry and showing it are fine
  together; carrying it and *owning* it is not.

  What stays public whatever you do: the pubkey, the kind, `created_at`, and
  the event size. An observer still learns that this person keeps podcast
  favorites, roughly how many, and when they last changed them. Padding hides
  the exact count, not the order of magnitude.

  If waiting for both writers to ship the carry rule is not acceptable, the
  alternative is a second self-assigned kind for the private list. A writer
  never touches a kind it does not know, so an old app cannot clobber it. That
  costs a second read on every load, a rule for moving an entry between the
  two events without a crash in between duplicating or losing it, and a second
  helping of the collision cost named in [Core
  Architecture](#core-architecture).
- Optional NIP-73-style relay/URL hints (position 2 on `i` tags) are not
  currently used; could be added later as a fallback path to the raw feed
  URL if a Podcast Index lookup fails. Dropping them costs the only answer
  available for an entry Podcast Index cannot resolve at all — a feed that
  404s and was never indexed leaves a guid and nothing else. The slot is still
  free: the [feed-favorite marker](#saying-whether-a-feed-is-favorited) took
  position 3 and writes `""` here precisely so a hint can arrive later without
  a migration, and so a generic NIP-73 consumer never reads a marker as a URL.
