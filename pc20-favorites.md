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
  vector 13.

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
- **A feed group survives while any item under it does**, even when your
  baseline says the feed is yours and you no longer hold it. The group is the
  only thing naming those items' parent; dropping it takes another app's
  tracks with it. Drop it only once nothing is left to place.
- **Entries you read keep their position; yours append.** Imposing your own
  order on every republish makes two apps reorder the event against each
  other forever, each publish locally reasonable, the only symptom being that
  it never stops.

### 4. Carry what you can't read

An identifier kind outside your table, a tag type you have no meaning for, a
`k` naming a kind you never emit, a `podcast:guid:` whose guid is malformed —
all of it belongs to a writer newer or older than you. Carry the **whole
tag**, not a value re-rendered from your own model: a later revision may put
something at a position you don't read yet.

An unparseable entry must not close the open feed group either. An
unrecognized `i` sitting between a feed and its items must not re-parent
everything after it — the entries around it belong to a writer that knew what
it meant, and your not understanding one of them is not licence to move the
others.

"I can't render this" is not the same claim as "this is junk". Deleting an
entry should be a thing the user asked for.

**This rule covers `content`, not only tags.** `content` is the one free slot
in the event and it is shared like everything else here. A writer that has
never heard of a private half must still republish the bytes it read, verbatim
— it has nothing to decrypt, nothing to parse, and nothing to understand, only
bytes to put back. Republishing `""` because that is what the format has
always specified erases whatever another app put there: silently, on someone
else's device, with no undo, and while behaving correctly by every other rule
in this document. kind:10333 is replaceable and keeps no history, so there is
nothing to recover from.

Support for a private half is optional. Carrying one is not. Any republish
path whose `content` is a literal rather than a value threaded from the read
is the bug — a default parameter is how it gets written.

### 5. Publish only when the bytes change

Compare your merged tag array against the array you read, byte for byte. If
they match, publish nothing.

Compare against **the read**, not against a digest of your own last publish —
only the former notices that another app has edited the event since. This is
also test vector 3 executed on every cycle in production rather than only in
a test: if your merge is not idempotent, two apps rewrite the event against
each other indefinitely.

## What this format does not do

- **No split between shows and items.** Everything lives in one event, so a
  large favorites list risks hitting relay size caps (~128 KB on nos.lol).
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
it.** Read an event whose `content` is a non-empty string your app has no
meaning for, change a favorite, publish, and `content` must come back byte
for byte. The sibling to vector 4, and the one that decides whether a private
half can exist at all. Pin the inverse too, or an implementation that simply
never touches `content` passes: a list built from scratch has an empty
`content`, and a republish is empty only when the event you read was.

**13. A writer does not delete the half it does not write into — and this
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

## Open questions / not yet resolved

- **Unfavoriting a feed while a track of it stays favorited is
  inexpressible**, and it is the one gap in this format with no client-side
  workaround. The placement group and the feed favorite are the same bytes,
  so a writer cannot signal the removal and a reader cannot detect it. Worse,
  the same ambiguity means a feed favorited *alongside* one of its tracks
  cannot be published as a favorite at all: it reads back as a group that may
  exist only to place the track. One implementation measured 46 of a user's
  94 album favorites in that state — recoverable only from that device's own
  cache, and lost outright on a fresh install.

  A marker would close both halves, and the third element of an `i` tag is
  the obvious slot since nothing uses it yet. It needs a form older readers
  ignore safely — they already carry unknown tag positions verbatim — and it
  needs writers to stop rebuilding `i` tags from their own model before it
  can survive a round trip.
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
  orderings, and no entry is in both. A user's list could then be all public,
  all private, or split per entry, and an app that never encrypts anything
  would still conform.

  **What no app may do is drop the half it does not use, and rule 4 now says
  so.** It did not always: rule 4 was written about tags, so a writer following
  this document to the letter republished the empty string the format has
  specified from the start, and the first favorite toggled in such an app
  erased every private entry — silently, on someone else's device, with no undo
  — precisely the loss [Merging](#merging) exists to prevent, while breaking no
  rule. That is why the carry had to ship BEFORE any private half existed to
  lose: optional support with a mandatory carry rule is the only combination
  that does not destroy data. Rule 4 covers `content`, test vector 12 pins it,
  and both writers implement it.

  Four further things break, and none of them is optional either:

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

  - **Rendering both halves as one library is not the same as adopting both.**
    An app that shows the union — the natural thing, since it is one person's
    favorites — has to keep the rendered set separate from the set it
    republishes, because local state goes wholly into the half that app writes
    into. Adopt an entry out of the other half and the next publish moves it
    across. For the user's own entries mid-switch that is the feature. For
    another writer's it is a migration nobody asked for, and in the
    private-to-public direction it is a **disclosure**: the entry reappears as
    a plaintext `i` tag, relays index `i`, and the `#i` filter named above now
    answers for it. The baseline is the only thing that can tell the two
    apart, so adopt from the half you do not write into only what your
    baseline already claims. Carrying an entry and showing it are fine
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
- Optional NIP-73-style relay/URL hints (third element on `i` tags) are not
  currently used; could be added later as a fallback path to the raw feed
  URL if a Podcast Index lookup fails. Dropping them costs the only answer
  available for an entry Podcast Index cannot resolve at all — a feed that
  404s and was never indexed leaves a guid and nothing else.
