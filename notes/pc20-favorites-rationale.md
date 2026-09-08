# Why the favorites format is the way it is

Companion to [pc20-favorites.md](../pc20-favorites.md). **Nothing here is
normative.** The spec states rules; this file records why each one exists —
what was believed, what was measured, what broke, and what was considered and
rejected. An implementation written against this file alone will not
interoperate.

Every section is anchored so the spec can link to it. If you arrived from a
`(why)` link, the section you want is the one you landed on.

---

## Blind publish
<a id="blind-publish"></a>

The event is replaceable, so republishing the full tag list replaces the
previous version wholesale. That replacement *is* the sync mechanism, and it is
also the whole danger.

There is no primary writer, no ownership and no out-of-band coordination — a
user signed into three apps across two devices has five writers, all equal,
none aware of the others. That is the point of the format, and it is the source
of every rule in the spec's Merging section.

A writer that publishes what it holds without reading first does not merely
lose a race: it deletes every entry the other four writers added, silently, on
someone else's device, with no undo and nothing on screen anywhere. **A blind
publish is data loss, not a conflict.**

## Kind choice
<a id="kind-choice"></a>

A single custom kind `10333` ("PC 2.0 Favorites"), a plain (non-`d`-tagged)
replaceable event, so there is exactly one per pubkey.

This is a dedicated kind rather than NIP-78 app-data, chosen to avoid ambiguity
with generic app-data or bookmark-list consumers that might render or interpret
kind 30078 differently. As of this writing, kind `10333` is unclaimed in the
[Nostr kind
registry](https://github.com/nostr-protocol/nips/blob/master/README.md), but it
is self-assigned, not registered via any NIP — confirm there is still no
collision before depending on it in production, and treat the spec as the
canonical claim on it.

Self-assignment is not free, and the cost is worth naming: a kind collision is
worse than a `d`-tag collision, because relay filters are kind-scoped, so a
later NIP landing on 10333 would put two unrelated event types into every query
either app makes.

## An entry names its own feed
<a id="entry-names-its-feed"></a>

This is the rule the format's first revision got wrong and paid for. An item
used to belong to the most recently opened feed entry above it, so any client
that sorted, deduped, or rebuilt the tag array silently reattached every item
to the wrong feed, and nothing else in the format recovered the association.

Now an item carries the guid of its own feed at position 1 and its own
identifier at position 2. Two things follow that could not be said before.
Sorting is safe, which is what makes the prescribed [band order](#band-order)
possible at all. And a feed entry can be removed without stranding anything,
because it is no longer the only tag naming those items' feed — an earlier
revision needed a rule saying "a feed entry survives while any item under it
does", and that rule is gone.

### The three states, and what each costs

```json
["i", "podcast:guid:<feedGuid>"]

["i", "podcast:guid:<feedGuid>", "podcast:item:guid:<itemGuid>"]

["i", "podcast:guid:<feedGuid>"],
["i", "podcast:guid:<feedGuid>", "podcast:item:guid:<itemGuid>"]
```

They favorited the feed and saved no items. They saved one item from a feed
they have not favorited. They did both. The third is two tags because the user
made two separate choices, not because an item needs a feed entry beside it.

The middle case is the one that pays for this layout. An earlier revision could
not write it at all: an item named only itself, so the only way to record where
it came from was to open a feed entry above it — and that put feeds on the list
the user had never favorited. On the first real list published in this format,
**114 of 196 feed entries were that**, and 46 of one user's 94 album favorites
could not be published at all.

### The marker that used to be at position 2

A brief revision of the spec put a marker at position 2, `fav` or `placement`,
to tell a feed the user chose from a feed that was only holding an item. A feed
entry now appears only when the user favorited the feed, so there is nothing
left to label, and the slot went to the item guid — the value that was actually
missing.

Nothing had ever published a marker, so moving that slot moved nothing. Items
have shipped, which is why the [feed-guid migration](#legacy-items) is real and
the dual-read rule is mandatory.

## `remoteItem`, restated as one tag
<a id="remoteitem"></a>

A favorite is a remote item, and the
[namespace](https://podcasting2.org/docs/podcast-namespace/tags/remote-item)
has already answered both questions this layout asks:

> **feedGuid** (required): The `<podcast:guid>` of the remote feed being
> pointed to. >
> **itemGuid** (optional): If this remote item element is intended to point to
> an `<item>` in the remote feed, this attribute should contain the value of
> the `<guid>` of that `<item>`.

The required half names the feed; the optional half narrows it to one item. So
the order is the namespace's order, and **the element count is the whole
difference between a feed favorite and an item favorite** — their position 1 is
byte-for-byte the same string. That is not a coincidence to work around, it is
the same statement `remoteItem` makes with a present-or-absent attribute.

A feed is a feed whatever its medium: an album is a feed and a track is an item
in it, so music needs no third kind of guid.

**One thing the format does NOT copy from `remoteItem`: position 2 carries the
`podcast:item:guid:` prefix.** The attribute holds a bare `<guid>`; this tag
holds a full NIP-73 identifier, for about 18 bytes an entry — roughly 4 KB on a
list of 227 items. What that buys is a tag whose two halves each say what they
are, which is the same reason position 1 is not a bare feed guid either. A
converter to and from a list feed strips or adds the prefix, and that is the
whole of the difference.

**A note on names, because three of them mean one thing.** `<podcast:guid>`,
`remoteItem`'s `feedGuid`, and the Podcast Index `podcastguid` parameter are
three names for the same value: the channel-level UUIDv5 seeded with the feed
URL. `itemGuid` is a different kind of identifier — a plain RSS `<item><guid>`,
with no global scope; the [`<podcast:guid>`
page](https://podcasting2.org/docs/podcast-namespace/tags/guid) is
channel-level only and never mentions item guids. And `podcast:guid` and
`podcast:item:guid` are **NIP-73 identifier kinds, not namespace tags** —
`podcast:item:guid` does not exist at podcasting2.org, so do not go looking for
it there.

## An item guid is not an address
<a id="item-guid-not-an-address"></a>

[`<podcast:guid>`](https://podcasting2.org/docs/podcast-namespace/tags/guid) is
a UUIDv5 seeded with the feed URL, assigned once and kept for the life of the
podcast even when that URL changes. An item's `<guid>` is unique only *inside*
its feed. The Podcast Index reflects this exactly: `/episodes/byguid` takes the
item guid **plus** a `feedid`, `feedurl` or `podcastguid`, and its own
documentation says the item guid "may not be globally unique". It does not
merely fail to find such a lookup, it refuses to attempt one:

```
GET /api/1.0/episodes/byguid?guid=cc59b81e-28a0-4e55-a457-54285c06830a

{"status":"false", "id":null, "url":null, "podcastGuid":null,
 "guid":"cc59b81e-28a0-4e55-a457-54285c06830a",
 "description":"This call requires either a valid `feedid`, `feedurl` or
  `podcastguid` argument. "}
```

So an item entry stripped of its feed is not a mislabelled favorite, it is an
unresolvable one — nobody can ever look it up again, including the writer that
stripped it.

**Identity is therefore the pair.** The same item guid under two different feed
guids is two different items, and a writer that dedupes or claims on the item
guid alone folds them into one and deletes a favorite.

## Legacy items, and why the dual read is mandatory
<a id="legacy-items"></a>

Every list published before the feed-guid revision writes items as two
elements, `["i", "podcast:item:guid:<itemGuid>"]`, with the feed carried by the
entry above. Both shipped writers did this. Dropping the legacy row does not
lose a label, it makes every item favorite in production unresolvable.

**Two shapes from drafts of the spec are not forms.** One put the item at
position 1 and the feed at position 2; another kept position 2 but wrote the
item guid there bare, with no prefix. Nothing ever published either, so there
is nothing to read and no path to write for them.

An item with no feed entry above it cannot be resolved by anyone. Do not invent
a feed guid for it: a wrong feed guid resolves to the wrong thing, which is
worse than resolving to nothing, and a placeholder guid is an invented one.

## Band order
<a id="band-order"></a>

**Prescribing the order is what makes it converge; preserving it never did.**

An earlier revision said "entries you read keep their position, yours append",
because two apps imposing their own orders rewrite the event at each other
forever — which the two shipped implementations did, in production, for three
weeks. That failure needs two DIFFERENT orders. One order in the document
removes it: preserving only converges if every writer preserves, while a
prescribed order converges even against a writer that does not sort, because
that writer keeps what it read.

**Banding is safe only because [an entry names its own
feed](#entry-names-its-feed).** Under the first revision, moving a track away
from the album above it destroyed the association. Getting the order wrong now
costs churn and contiguity; it used to cost an item its feed.

**Band 0 is not cosmetic.** A legacy `["i", "podcast:item:guid:<itemGuid>"]`
takes its feed from the most recent feed entry above it. Move every feed entry
above every item and such an entry resolves to the last album in band 2 — a
wrong feed, worse than the nothing it had. Ahead of band 2 there is no feed
entry to mistake for its parent; an artist is never a feed, so band 1 beside it
is harmless. A resolvable legacy item never lands in band 0, because the same
publish rewrites it.

**A run holding a tag you cannot classify is emitted as read**, because a tag
with no kind has no band, and inventing a place for it is how a carried tag
ends up somewhere that changes what it means.

**A duplicate feed entry is well-formed.** Two writers each stated the same
favorite. Fold it or carry it; neither can move an item, because no item
depends on it. Under the old grouping this was the dangerous case: each copy
opened a group, and a writer that modelled groups by guid met the second one
already taken and dropped the item beneath it.

## Trailing `k` tags
<a id="trailing-k"></a>

**Take an entry's kind from the entry, never from an adjacent tag.** The kind
is derivable from the tag itself, so a `k` beside every `i` restates what the
entry has just said. On the first real event published in this format that cost
423 `k` tags carrying two distinct values — about 11 KB of a 36 KB event, 28%
of it, on a list of 196 feeds and 227 items.

An earlier revision of the spec paired a `k` with every `i`, which is why a
reader must accept both layouts. A reader that walks `i`/`k` in pairs will not
read a list written by the current rule, and the symptom is an empty library
rather than an error.

Trailing `k` tags are safe because `k` takes no part in anything else. A `k`
landing mid-list is inert, but emit them at the end anyway so nothing invites a
parser to treat them as delimiters.

**Derive the kind from the whole entry, not from position 1 alone.** Position 1
is `podcast:guid:` on a feed favorite and on an item favorite alike, so a
writer that reads only position 1 emits `podcast:guid` for both, and
`podcast:item:guid` never reaches the event at all. `#k` discovery then misses
every item favorite on every list.

**Use a known-kinds table rather than scanning the string.** Item guids are
routinely permalink URLs, so "everything before the last colon" on
`podcast:item:guid:https://example.com/ep/42` yields `podcast:item:guid:https`
— a `k` value no relay filter will ever match, which breaks `#k` discovery
without breaking anything visible. This applies at position 2 as much as at
position 1: both hold a prefixed identifier, and a URL-shaped item guid is the
value most likely to be there.

## Artist entries
<a id="artist-entries"></a>

Music has three levels — artist, album, track — and this list carries two of
them as entry kinds. The third does not need carrying. **Favoriting an artist
means "show me this artist's whole catalogue", and the catalogue is named in
the publisher feed**, not here. So the entry stands alone:

```json
["i", "podcast:publisher:guid:<publisherGuid>"]
```

It belongs to no feed. There is no item identifier to put at position 2, and
nothing above it is a feed of which an artist could be an item. It is never an
item of the entry above it, because an artist is not a track. Nothing on the
list belongs to an artist either: an album entry is a feed favorite in its own
right and names no artist.

An album is an ordinary feed entry — `podcast:guid:` with `medium` set to a
music value — and a track is an ordinary item entry carrying its album's feed
guid. Everything about entries applies to albums and tracks unchanged, and the
numbers behind it were measured on music in the first place. `medium` takes no
part in any of it.

**This is written down because the three answers disagreed.** The document had
said nothing about publisher guids at all. Read on 2026-09-07:
`stablekraft-app@4722dd8` (`lib/nostr/pc20-identifiers.ts`,
`favorites-single-list.ts`) and `boostmebitch@938f90d`
(`lib/nostr/favorites-list.ts`) both place a publisher entry as a loose entry —
carried whole, opening nothing — and stablekraft pins it in a test. This
repository's own reference implementation treated it as a feed that opens a
group, so a track after an artist entry parsed with the **artist** as its
parent in one reader and the **album** as its parent in the other two. The apps
were right; the reference was changed. That whole class of disagreement is now
unreachable: a track names its own feed, so no entry between it and its album
can move it.

## The medium hint
<a id="medium-hint"></a>

The `medium` tag exists purely so a client can bucket "Podcast" vs. "Music" on
load without an API round trip first. It is not authoritative — apps resolve
`feedGuid` / `itemGuid` against the Podcast Index (or their own feed cache) to
get real metadata: title, artwork, audio URL, and the feed's actual
`<podcast:medium>` value. That lookup should win if it ever disagrees with the
hint stored here, for instance when a feed changes medium after the list was
last published.

An app's own internal classification is not the same thing as a declared medium
and usually carries a default. Publishing that default makes a guess look
authoritative, and a guess on this list is sticky, because no other app has any
reason to correct it.

A resolved lookup beating the stored medium is also what prices the one
positional tag left: reordering the array costs a wrong label that corrects
itself, rather than a wrong feed that nothing corrects.

## Where the default is safe, and where it is not
<a id="no-safe-default"></a>

**Why a tag, when the encryption already says it.** Almost. "Whichever of the
two holds entries is the mode" answers correctly for every list that has
entries, and it is what both existing implementations do. It cannot answer for
a list that has none — a new account, or one whose last favorite was just
removed — and that is not an edge case, it is where every user starts.

This document used to say there was no safe default, and that every writer had
to ask there. The rule was right about the danger and wrong about the price. An
"ask the user" flow sits in front of a brand-new account's first favorite, in
every app, forever; an app that does not offer private lists at all has no
question it can honestly put; and the state it protects — nobody anywhere has
ever chosen a mode — is not the state the danger lives in.

**So the default is public, and it is narrow.** It applies when there is no
`visibility` tag, no `i` tag, and `content` is the empty string. Nothing has
been chosen and nothing can be disclosed, because there is nothing there. The
default writes no tag: a tag states a user's choice, and a default is the
absence of one.

Two neighbouring states keep the old rule, and each is a way the default turns
back into the disclosure it replaced.

- **A `content` this writer cannot account for is somebody's encrypted list.**
  An empty tag list is not an empty list. Default there and the next publish
  puts `i` tags beside ciphertext, splitting a list under the rule that says a
  list is wholly public or wholly private. This is why emptiness is tested on
  the `content` STRING rather than on whether entries came back from it — a
  decode returns nothing both for a `content` that is empty and for one this
  writer cannot read, and only the first is safe. Vector 30's rule that an
  emptied `content` encodes to `''` is what makes the string trustworthy.
- **The default is a tiebreak, never an inference.** An inferred mode outranks
  a writer's own standing setting, deliberately: acting on the setting is one
  app silently overruling another. Put the default in the inference and it
  inherits that rank, so a writer whose user chose Private meets a fresh list,
  finds "the list says public", and publishes their first favorite in
  plaintext. Same disclosure, arrived at from the other side. It is an answer
  for a writer that has no preference either, and nothing more.

A list holding entries in both places still asks. There the guess is not about
a favorite nobody has made yet — it is about entries somebody already hid.

The second thing the tag buys is a **direction to fold in**. Before it, a list
found with entries in both places was ambiguous: you could carry it, which is
what the spec requires, but nothing said which the user had actually asked for.
Now something does.

**The tag is consent, which is why changing the mode requires reading both the
tags and `content`.** The old rule was an asymmetry: public → private could
move another app's entries because it only reduces exposure, and private →
public could not, because publishing an `i` tag is a disclosure and
irreversible. The asymmetry existed because no app could tell the user's intent
for the whole list from the event. The tag is that intent, stated by an app
that could see everything it was about to disclose — so with the tag present
the move is symmetric. Absent the tag, the conservative rule still stands.

An app whose signer has no NIP-44 cannot read the encrypted entries, so it
cannot move those entries and cannot honestly claim the list is public — it
would be stating a convergence it is not able to perform, and the entries it
cannot see would sit encrypted under a tag saying they are not.

**"Not on Nostr" is a local choice and is not on the wire.** There is no third
`visibility` value, and writing one would tell every other writer to stop on
the strength of one device's setting.

## The privacy choice belongs to the list, not to the app
<a id="privacy-belongs-to-the-list"></a>

Getting this backwards produces a list that is 97% private.

It was tried the other way first, on the reasonable-sounding rule that an app
may only move entries it wrote: a user set one app to Private, its own 436
entries were encrypted, and 13 written by a second app stayed in the tags —
public, relay-indexed, and searchable in reverse. Measured, on a real account.
The user had made a privacy choice and the format had honoured most of it,
which is the kind of partial that is worse than a clear no: nothing on screen
said which entries were still public, and the remedy was to go and make the
same choice again in every other app they had ever signed into.

So the whole list has one mode, every writer puts its entries where that mode
says, and the event says which.

**Rendering both places as one library is not the same as adopting both.** An
app that shows the union — the natural thing, since it is one person's
favorites — still has to keep the set it renders apart from the set it claims,
because local state goes wholly into the place that app writes into. Adopt an
entry out of the other and the next publish moves it across. On a whole-list
move to private that is the point, and the entry is meant to travel. Going the
other way it is a **disclosure**: the entry reappears as a plaintext `i` tag,
relays index `i`, and an item favorite discloses more than itself on the way
out — its feed guid is what lands at position 1, so publishing one saved
episode puts the show into the relay's index of that feed. Carrying an entry
and showing it are fine together; carrying it and *owning* it is not.

**A reader shows a private list's entries whatever its own last choice was.**
The entries are the user's, whoever wrote them, and rendering them discloses
nothing. An implementation that filters the place it is not currently writing
down to what its own baseline claims — a natural way to keep one app from
adopting another's entries — hides the user's own favorites from them, on the
device they just made the choice on.

## The order private lists had to ship in
<a id="private-list-sequencing"></a>

A writer that encrypts before every other writer carries `content` does not
fail loudly — it silently makes those favorites disappear on the far side,
which is worse than the format it replaced.

That is not hypothetical. On 2026-08-25 `stablekraft-app` shipped a NIP-44
ciphertext into `content` and switched a real account to private while
`boostmebitch` still hardcoded `content: ''` on republish and never read
`event.content` at all. For about an hour, one favorite toggled in the second
app would have erased 436 encrypted entries — silently, on someone else's
device, with no undo, on a replaceable event that keeps no history. It was
closed the same night, and both apps now carry `content`.

The sequencing rule in the spec is what that hour bought, and it has two steps
because the second is one step further along the same shape: an app must be
able to **read and render** the encrypted entries before anything moves entries
into it on its behalf, or the move is indistinguishable from a deletion on that
app's screen.

### What NIP-44 costs

- **Idempotence, immediately.** NIP-44 draws a fresh nonce per encryption, so
  the same entries produce different bytes every time. A byte comparison of
  ciphertext therefore always differs, and every load republishes — two apps
  rewriting the event against each other forever, this time self-inflicted.
- **A signer that cannot decrypt looks exactly like an empty `content`.** Not
  every NIP-07 or NIP-46 signer implements `nip44`. The user cannot otherwise
  tell "hidden here by choice" from "this app has not shipped support yet", and
  both render as a shorter list.
- **Size, at about 1.5×.** NIP-44 pads to a power-of-two chunk, then base64
  encodes: 25 KB of tag JSON becomes 37 KB of `content`, and 90 KB becomes 128
  KB. The ~128 KB relay cap is then reached at roughly 90 KB of entries rather
  than 128 KB, so privacy costs about a third of the list — paid in item
  favorites, which are what fill it.
- **The 64 KB boundary is an interop cliff, not a cap.** NIP-44 v2 as
  originally published capped plaintext at 65535 bytes. The current text allows
  2^32-1 and switches to a 6-byte length prefix at 65536, so a library built to
  the older text rejects a payload across that line. A private list that grows
  past 64 KB may be unreadable in an app whose `nip44` is a year old — and
  unreadable is indistinguishable from empty.

### The `?` in the plaintext

A NIP-55 signer URL-decodes the whole `nostrsigner:` URI and only then splits
it on `?`, so a plaintext carrying one is truncated there and the request comes
back malformed — with an error that reads as "signer not installed". Item guids
are routinely permalink URLs, so this is not an edge case: one favorited track
with a query string in its guid breaks every private publish on that device,
forever. Percent-encoding does not help, because `%3F` decodes back into the
character it splits on. The six-character JSON escape `\u003f` does, because
every reader already understands it: `JSON.parse` returns the same string byte
for byte in any implementation, so a writer that never heard of the rule still
reads the list.

### An empty `content` that encodes to ciphertext

A `medium` run left with nothing under it is not cosmetic: it makes an empty
`content` encode to real ciphertext, and ciphertext is how the next writer
knows somebody owns those bytes. A signer with no NIP-44 cannot open those
bytes, so it reads them as a private list it must not disturb and declines to
change the mode on top of what it cannot see — which is the correct rule,
reached on false evidence. The user asks for private, the app agrees the
request is legitimate, the list stays public, and nothing on screen says why.

### An alternative that was considered

If waiting for both writers to ship the carry rule had not been acceptable, the
alternative was a second self-assigned kind for the private list. A writer
never touches a kind it does not know, so an old app cannot clobber it. That
costs a second read on every load, a rule for moving an entry between the two
events without a crash in between duplicating or losing it, and a second
helping of the collision cost named under [kind choice](#kind-choice).

## No provenance
<a id="no-provenance"></a>

Nothing on an entry says which app added it or when, so when the list and your
local state disagree, the disagreement is ambiguous:

> The list has an entry. Your local state doesn't.
> Either another app just added it, or you just removed it.

Identical bytes, opposite meanings, and both naive answers destroy something:
prefer the list and unfavoriting silently stops working forever; prefer local
state and you delete every entry the other apps added. That is why every writer
has to keep its own baseline instead of deriving the answer from the event.

Per-entry authorship, tombstones for removals, or timestamps would each remove
that requirement and let a reader work it out from the wire alone. All three
cost bytes on a list whose whole purpose is to hold as many entries as it can,
and none is specified.

### What "your own contribution" means

The two implementations draw that line in different places and both are
conformant, so it is worth stating exactly. One records the entries it holds
locally. The other adopts the list it read into its own library — it renders
the whole thing and lets the user unfavorite any of it — and records that,
foreign entries included.

The second is not a clobber, because adoption makes the claim true: those
entries are in its local set, so it goes on asserting them and the removal test
never fires by accident. An app that renders the shared list as one library
**has** to claim what it renders, or the user can never unfavorite an entry
another app added.

So the test is not where the ids came from. It is whether you will still be
holding them next cycle.

A feed favorite needs no claim of its own any more. It is an ordinary entry, so
its presence on the list is the favorite and taking it back is an ordinary
removal. An earlier revision needed a second claim because a feed entry could
be on the list for two unrelated reasons at once.

**Never seed a baseline from another list**, another address, or an older
format's baseline: that asserts you published ids to an event you have never
written to, and the first entry that matches gets read as "mine, and I removed
it" and deleted. An implementation shipped exactly that and destroyed an album
favorite that existed only on the other app's side.

### Why the per-place baseline rule is hard to catch

The damage needs **two cycles** — the first publish emits correct bytes and
only the baseline recorded beside it is wrong — and the first cycle need not
publish at all, because a writer that records a baseline when the bytes already
match records the bad one anyway. One implementation shipped it in both
directions at once: the same writer, in public mode, published an empty
`content` over encrypted entries it was carrying, and in private mode published
an empty tag list over a public one.

## Reading, and why an EOSE is not proof
<a id="trustworthy-read"></a>

A relay query returning nothing has two meanings — "nobody has it" and "nothing
answered in time" — and under wholesale replacement, acting on the second is
the most expensive mistake this format allows. One bad read, republished, is
the entire list, for every app the user owns.

An aggregate EOSE from a relay library is not proof: in at least one library a
failed connection is folded into the same callback, so being offline reports
"everyone answered, nobody has it" in about 19 ms. Libraries also synthesize an
EOSE on a timer, indistinguishable from a real one at the callback.

`reached` excludes relays that never connected, because requiring every
*listed* relay to answer means one permanently dead default degrades every read
forever.

Withholding a publish is invisible to the user, and on a device with no local
cache it renders identically to "your favorites are gone". A silent correct
decision cannot be told apart from a broken one.

## Carrying what you cannot read
<a id="carry-rule"></a>

"I can't render this" is not the same claim as "this is junk". Deleting an
entry should be a thing the user asked for.

The cost of forgetting went up with the feed-guid revision. A writer that
rebuilds entries as `["i", id]` type-checks, renders correctly, and strips
every item on the list of the one value that makes it resolvable — not a label,
the address. Nobody can look those favorites up again, including the writer
that did it.

`content` is the only free slot in the event, and for most of the spec's life
no rule mentioned it: `content` was empty, the example showed `""`, and a
writer that followed the document to the letter republished the empty string
the format had specified from the start. That silence is what
[2026-08-25](#private-list-sequencing) cost an hour of.

## Normalising before you compare
<a id="reframed-bytes"></a>

Two conforming events differ. A reader MUST accept a `k` beside every `i`, and
a writer MUST emit one `k` per distinct kind at the end. Both layouts are
legal, they mean the same list, and they differ byte for byte. The position of
`alt`, the position of `visibility` and the order of the `k` tags are free in
the same way.

Compare the read as it arrived and every one of those reports a change on a
list you have no reason to touch — and if the other app compares raw too,
neither of you ever stops. That is the failure the rule exists to prevent,
reached by following its first sentence literally.

What you normalise is exactly what carries no meaning. `medium` is positional
and stays where it is, band order is prescribed so both writers reach it
anyway, and an entry you cannot parse is carried untouched — so a genuine
difference still shows up as one.

Comparing against the read rather than against a digest of your own last
publish is test vector 3 executed on every cycle in production rather than only
in a test: if your merge is not idempotent, two apps rewrite the event against
each other indefinitely.

## What this format does not do
<a id="what-this-format-does-not-do"></a>

- **No split between shows and items ACROSS EVENTS.** A show favorite and an
  episode favorite are separate entries on the list, but both live in the one
  event, so a large favorites list risks hitting relay size caps (~128 KB on
  nos.lol). Item favorites accumulate an order of magnitude faster than feed
  favorites — a listener saving individual tracks passes a thousand without
  trying, where the same person follows perhaps forty shows — so the tracks are
  what eventually make a publish fail, and they take the show subscriptions
  down with them.
- **No fallback URL, and position 2 is spent.** An entry is guids and nothing
  else. Resolving them is the only way to reach a title, artwork or a feed URL,
  so a feed that 404s and was never indexed leaves a reader with a guid and
  nothing to render. NIP-73 has an optional URL hint at position 2 for exactly
  this, and this format puts the item's identifier there instead.

  That is a deliberate trade, and it is not close: without position 2 an item
  favorite has no address at all, while without a URL hint it merely renders
  poorly. There is one slot, and only one of the two candidates is
  load-bearing. A URL would also have been the weaker occupant on its own terms
  — `<podcast:guid>` is *designed* to outlive the feed URL, so the stored URL
  is most likely to be stale at exactly the moment it is most needed.
- **A generic NIP-73 consumer shows the wrong thing for an item favorite.** It
  resolves position 1, which on an item entry is the feed, so it renders the
  show where one episode was meant, and reads the item's identifier at position
  2 as a URL. This format cannot fix that in somebody else's client afterwards.
  The alternative was to put the item guid at position 1, which resolves
  correctly in such a client and costs the ability to tell a feed favorite from
  an item favorite by anything the namespace already defines.
- **A per-item relay filter is not available on this kind.** Relays index `i`
  at position 1 only, and position 1 is the feed guid for a feed favorite and
  an item favorite alike. So `#i` for a feed guid returns both, together, and
  there is no filter that returns one item's favorites. Counting or discovering
  by item means fetching the lists and reading position 2.
- **An item is addressed differently here than in a kind:1 note.** A boost note
  tags the episode as `["i", "podcast:item:guid:<itemGuid>"]`, which is
  NIP-73's own convention and is what both shipped apps write. This list, and
  [the playback events](../nip-value-playback-events.md), put the feed at
  position 1 instead. A `#i` filter written for one does not find the other,
  and nothing in either format signals the difference.
- **No way to say an item is NOT a favorite.** The list holds choices, so a
  removal is an absence. That is what makes the baseline load-bearing: without
  one, a writer cannot tell an entry it removed from an entry another app
  added, and there is nothing on the wire to ask.
- **No provenance, and so no last-write-wins.** See [above](#no-provenance).
- **No concurrency control.** Two apps that read the same version and publish
  within a second of each other will still lose one set of changes; the merge
  rules make each publish *correct with respect to what it read*, not
  serialized. `created_at` and relay last-write-wins decide the survivor. In
  practice favorites are toggled by one human at human speed, so the window is
  small — but it is real.
- **The pubkey, the kind, `created_at` and the event size stay public whatever
  the mode.** An observer still learns that this person keeps podcast
  favorites, roughly how many, and when they last changed them. Padding hides
  the exact count, not the order of magnitude.
