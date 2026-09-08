# Cross-app Podcast Favorites on Nostr

**Status: normative.** This document defines the wire format and the writer
behavior an implementation must match. It states rules, not reasons — every
rule here exists because something broke, and the reasoning, the measurements
and the revision history are in
[pc20-favorites-rationale.md](notes/pc20-favorites-rationale.md). Each
section links its own. **A rule whose reason you cannot find is still a rule.**

Conformance is pinned by 31 test vectors. They are stated as behaviors under
[Test vectors](#test-vectors) below and are executable in
[conformance/](conformance/). Run them:

```bash
node --test conformance/vectors.test.mjs
```

A user's favorites follow them between apps: favoriting something in one app
makes it favorited in every other app the same person signs into. One flat
list, one event.

**Any app may read and write it.** There is no primary writer and no ownership
— a user signed into three apps across two devices has five writers, all
equal, none aware of the others. The event is replaceable, so **a writer that
publishes without reading first deletes every entry the other writers added.**
[Merging](#merging) is not optional. A blind publish is data loss, not a
conflict. ([why](notes/pc20-favorites-rationale.md#blind-publish))

---

## 1. Event

Kind **`10333`**, a plain (non-`d`-tagged) replaceable event: exactly one per
pubkey. Republishing the full tag list replaces the previous version wholesale,
and that replacement is the sync mechanism.

`10333` is **self-assigned and not registered via any NIP.** Confirm there is
still no collision before depending on it.
([why](notes/pc20-favorites-rationale.md#kind-choice))

```json
{
  "kind": 10333,
  "tags": [
    ["alt", "PC 2.0 Favorites"],
    ["visibility", "public"],

    ["medium", "podcast"],
    ["i", "podcast:guid:917393e3-1b1e-5cef-ace4-edaa54e1f810"],
    ["i", "podcast:guid:bfd4d7c4-eec0-5f6b-90b0-c1eae84b2392",
          "podcast:item:guid:cc59b81e-28a0-4e55-a457-54285c06830a"],

    ["medium", "music"],
    ["i", "podcast:publisher:guid:7f2e9c11-4b83-5e07-9d62-3a1f5c8b0e94"],
    ["i", "podcast:guid:4c1f8e2b-0d6a-5a91-8e35-7b9c2d4f6a10",
          "podcast:item:guid:d2b7f014-3a58-4c6e-9f21-8ad5c3e70b46"],

    ["k", "podcast:guid"],
    ["k", "podcast:item:guid"],
    ["k", "podcast:publisher:guid"]
  ],
  "content": ""
}
```

`content` is empty here **only because this list has no private entries.** It
is not a constant. See [rule 4](#4-carry-what-you-cannot-read).

---

## 2. Entries

Entries are [NIP-73](https://github.com/nostr-protocol/nips/blob/master/73.md)
identifiers, **one `i` tag per favorite.** Nothing on the list is present for
structural reasons: if it is on the list, the user chose it.

An `i` tag is `["i", feedId, itemId]`, counting from zero — tag name at
position 0, the feed's identifier at **position 1**, and on an item entry the
item's identifier at **position 2**. Both positions hold a full NIP-73
identifier, prefix included. **Nothing is defined past position 2.** An entry
names its own feed, so no reader reconstructs it from position
([why](notes/pc20-favorites-rationale.md#entry-names-its-feed)), an item guid
on its own is not an address at all
([why](notes/pc20-favorites-rationale.md#item-guid-not-an-address)), and the
two positions are `<podcast:remoteItem>`'s two attributes
([why](notes/pc20-favorites-rationale.md#remoteitem)).

| form | meaning |
|---|---|
| `["i","podcast:guid:F"]` | feed favorite (podcast or album) |
| `["i","podcast:guid:F","podcast:item:guid:X"]` | item `X` of feed `F` |
| `["i","podcast:publisher:guid:P"]` | artist; belongs to no feed |
| `["i","podcast:item:guid:X"]` | **legacy** item; feed from the entry above |

A feed is a feed whatever its medium: an album is a feed, a track is an item in
it, and music needs no third kind of guid. An artist entry is bare, two
elements, belongs to no feed, and is never an item of the entry above it.
**Carrying one is mandatory; offering the feature is not** — an app with no
artist favorites in its UI still meets one on a shared list and carries it
whole and in position, and an app that does offer them owes the `k` tag too, or
`#k` discovery misses every artist favorite it publishes. (Vector 28)
([why](notes/pc20-favorites-rationale.md#artist-entries))

Four rules, all load-bearing:

- **Tell a feed entry from an item entry by LENGTH, never by position 1.**
  Their position 1 is byte-for-byte the same string. A dedupe or lookup keyed
  on position 1 alone folds them together and one disappears. (Vector 25)
- **An entry's kind is the kind of its LAST identifier** — position 2 when
  there is one, position 1 otherwise. Read position 1 alone and
  `podcast:item:guid` never reaches the `k` tags, so `#k` discovery stops
  finding item favorites. (Vector 6)
- **A position 2 you cannot read makes the entry unreadable, not a feed
  favorite.** Carry it whole. Reading it as a feed favorite turns a newer
  writer's entry into a followed show. (Vector 4)
- **Derive kinds from a known-kinds table, never by splitting the string.**
  Item guids are routinely permalink URLs, so "everything before the last
  colon" on `podcast:item:guid:https://example.com/ep/42` yields
  `podcast:item:guid:https` — a `k` value no relay filter matches. Applies at
  position 2 as much as position 1. (Vector 6)

### Reading legacy lists

([why](notes/pc20-favorites-rationale.md#legacy-items))

Every list published before this revision writes items as two elements, with
the feed carried positionally by the entry above. **A reader MUST accept both
forms.** A writer rewrites a legacy tag on its next publish using the feed it
just read positionally — replacing the **whole tag**, position 1 included. Each
list upgrades itself once, and the migration must be idempotent. (Vector 27)

An item with no feed entry above it is unresolvable by anyone. **Carry it in
the form it arrived in, render what you can, and do not delete it.** Do not
invent or borrow a feed guid — a wrong feed guid resolves to the wrong thing,
and a placeholder guid is an invented one. Emit it in
[band 0](#bands). (Vector 20)

---

## 3. `medium`

`medium` is a **running value**: it applies to every entry after it until the
next `medium` tag. It is the only positional tag whose position carries
meaning.

- **An entry before any `medium` tag has an UNKNOWN medium.** Do not default it
  to `podcast` or anything else, and do not invent a `["medium","unknown"]`
  tag.
- **Publish only a medium a feed actually declared** in `<podcast:medium>`. An
  app's internal classification usually carries a default, and a guess on this
  list is sticky — no other app has reason to correct it.
- **It is a hint, not a source of truth.** Apps resolve guids against the
  Podcast Index or their own cache for real metadata; **a resolved lookup wins
  over the stored hint.** ([why](notes/pc20-favorites-rationale.md#medium-hint))

Keep same-medium entries contiguous. A medium must not open a second run.

---

## 4. Tag order

| tag | position |
|---|---|
| `alt` | **first, exactly once**, regenerated rather than carried |
| `visibility` | not positional; put it next to `alt` |
| `medium` | opens a run; applies until the next one |
| `i` | inside its run, by band — below |
| `k` | **at the end**, one per distinct kind; order among them unspecified |

`alt` is a [NIP-31](https://github.com/nostr-protocol/nips/blob/master/31.md)
label, not data. Emit `["alt", "PC 2.0 Favorites"]`, regenerate it on every
publish rather than carrying what you read, and discard it when reading.
(Vector 21)

Emit **one `k` per distinct kind, at the end** — not one per `i`. A reader MUST
accept both layouts and MUST ignore `k` when parsing entries, deriving the kind
from the identifier instead. A reader that walks `i`/`k` in pairs will not read
a list written by the current rule, and the symptom is an empty library rather
than an error. (Vector 7) ([why](notes/pc20-favorites-rationale.md#trailing-k))

### Bands

Prescribing the order is what makes two writers converge; preserving order does
not. ([why](notes/pc20-favorites-rationale.md#band-order)) **Inside one
`medium` run, emit entries in four bands:**

| band | what | order inside it |
|---|---|---|
| 0 | items naming **no** feed | as read, untouched |
| 1 | artists — `podcast:publisher:guid` | as read; a new one at the end |
| 2 | albums and podcasts — two-element `podcast:guid` | as read; a new one at the end |
| 3 | episodes and songs | grouped by the feed they name, groups in order of first appearance; a new item joins its feed's group |

- **Do not put your own entries ahead of the ones you read**, and **do not
  append to the end of the event** — that opens a second run for a medium that
  already has one. A new entry goes at the end of its **band**, inside its run.
- **A run holding a tag you cannot classify is emitted as read**, in wire
  order. A tag with no kind has no band; do not invent a place for it.
  (Vector 4)
- **A duplicate feed entry is well-formed.** Fold it or carry it; either
  conforms, and neither can move an item. (Vector 19)

---

## 5. Public and private

A list is **wholly** in the plaintext tags or **wholly** in the encrypted
`content`. It is never split across the two, and an entry is never in both.

`["visibility", "public"]` or `["visibility", "private"]` states the mode of
the whole list. Any app may change it. It is multi-letter on purpose: relays
index single-letter tags, and a `#v=private` filter would enumerate the pubkeys
keeping a private list.

- **Absent, the mode is inferred:** entries in exactly one half means that half
  is the mode. **Entries in both halves, or in neither: ask the user and
  publish nothing until they answer.** A writer whose standing setting names
  the empty half of such a list follows the list or asks — it does not act on
  the setting. ([why](notes/pc20-favorites-rationale.md#no-safe-default))
- **The tag is written on a user's choice and carried thereafter.** A writer
  emits it for the first time when the user picks Public or Private in that
  app; every writer then carries it forward, regenerated from what it read.
  **A writer's standing setting never stamps the tag onto a list that has
  none.**
- **Changing the mode requires being able to read BOTH halves.** An app whose
  signer has no NIP-44 carries `content` verbatim, keeps writing into the half
  the tag names if it can, does not restate the mode, and **says on screen that
  it cannot open the other half.** (Vector 17)
- **A writer that finds the tag and the entries disagreeing, and can read both
  halves, converges toward the tag:** one copy of each entry, in the half the
  tag names, other half emptied. **An entry that was in both halves is emitted
  ONCE.** (Vectors 15, 16)
- **With no tag the asymmetry applies:** public → private may move another
  app's entries; private → public may move **only** what your baseline claims,
  because publishing an `i` tag is a disclosure and cannot be undone.
  (Vector 13)
- **A failed decrypt is a degraded read, not an empty half.** Carry the
  ciphertext, publish nothing derived from it, and say so on screen. The user
  cannot otherwise tell "hidden here by choice" from "this app has not shipped
  support yet", and both render as a shorter list.
- **A reader shows the private half whatever its own last choice was.**
  Filtering the half you are not writing down to what your baseline claims
  hides the user's own favorites from them.
- **Rendering both halves is not adopting both.** Local state goes wholly into
  the half you write into, so an entry you adopt out of the other half travels
  there on your next publish. Out of the private half, adopt only what your
  baseline already claims; carry the rest where it is.
  ([why](notes/pc20-favorites-rationale.md#privacy-belongs-to-the-list))
- There is no third `visibility` value. "Not on Nostr" is a local choice: such
  an app withdraws what its baseline claims and publishes nothing further.

### Shipping order

A writer that encrypts before every other writer carries `content` does not
fail loudly. It makes those favorites disappear on the far side, which is worse
than the format it replaced, and it happened — for about an hour on 2026-08-25,
one favorite toggled in the second app would have erased 436 encrypted entries.
([why](notes/pc20-favorites-rationale.md#private-half-sequencing))

- **Land [the carry rule](#content-is-carried-too) in every writer first**, and
  only then let any of them start writing a private half.
- **An app must read and render the private half before anything moves entries
  into it on its behalf.** Until then the move is indistinguishable from a
  deletion on that app's screen.

### Writing the private half

The private half is a tag array, stringified, encrypted to the author's own key
with [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md), placed
in `content`. The [medium](#3-medium) and [band](#bands) rules apply inside it
unchanged.

- **The plaintext carries no `?`.** Write it as its six-character JSON escape,
  `\u003f`, before handing the string to the signer. A NIP-55 signer
  URL-decodes the whole `nostrsigner:` URI and then splits on `?`, so a
  plaintext containing one is truncated and comes back as an error reading
  "signer not installed". Percent-encoding does not help; `%3F` decodes back
  into the character it splits on. (Vector 22)
- **A plaintext that is not a tag array is an unreadable half**, not an empty
  one. Treat it as a failed decrypt: carry `content` byte for byte, publish
  nothing derived from it, say so on screen. `{}`, a string, an array holding a
  non-array, and an array holding a non-string all decode to null; `[]` decodes
  to an empty list. (Vector 23)
- **Refuse to publish a plaintext past 60,000 bytes.** NIP-44 v2 as first
  published capped plaintext at 65,535, and a signer built to that text rejects
  a payload across the line — the list then reads back as empty rather than as
  an error. The margin covers NIP-44's padding and base64, about 1.5×. Roughly
  500 favorites fit. (Vector 24)
- **A half holding no entries is the empty string.** Emit `content: ''`, not
  the encryption of an empty array and not the encryption of leftover `medium`
  runs. Prune a run you emptied, on whichever side. (Vector 30)
- **Compare decrypted arrays, never ciphertext.** NIP-44 draws a fresh nonce
  per encryption, so a ciphertext comparison republishes on every load forever.
  Compare ciphertext only where you could not decrypt it.

---

## Merging

Every publish is a full replacement and every app may publish. A writer's job
is not "serialize my favorites" — it is **read the current event, fold my
changes into it, and write back everything else untouched.**

### 1. Read before every publish, and never publish on a read you do not trust

**Do not expose a "publish my favorites" entry point at all.** Make reading
part of the same call so no caller can skip it.

A relay query returning nothing means either "nobody has it" or "nothing
answered in time," and acting on the second republishes the entire list as
empty for every app the user owns. Count relays yourself:

```
trustworthy = event_in_hand OR (reached > 0 AND answered == reached)
```

`reached` counts relays that accepted a connection and stayed up, excluding
ones that never connected — requiring every *listed* relay to answer means one
dead default degrades every read forever. **An aggregate EOSE from a relay
library is not proof:** libraries fold failed connections into the same
callback and synthesize EOSE on a timer. Push that timer past your own
deadline.

**Withholding a publish must be visible in the UI.** It renders identically to
"your favorites are gone" on a device with no local cache. (Vector 2)
([why](notes/pc20-favorites-rationale.md#trustworthy-read))

### 2. Keep a baseline

The event carries no provenance, so "on the list, absent from your local state"
is ambiguous — either another app just added it, or you just removed it.
Identical bytes, opposite meanings.
([why](notes/pc20-favorites-rationale.md#no-provenance))

Each writer keeps a **baseline**: the set of identifiers it last agreed with
the relay on, stored privately on the device. It is not on the wire and no two
writers need theirs to agree.

- **Record it only after a publish is confirmed by a relay.** A baseline
  written for an event that never landed says "I am already asserting this,"
  which is what stops the entry from ever being retried. (Vector 10)
- **Record only what you will keep asserting**, not the whole list you
  published. An app that adopts the list it read into its own library — and
  goes on asserting it — may claim those entries; an app merely carrying them
  may not. **You may claim an entry you have adopted and will keep asserting;
  you may never claim one you are merely carrying.**
- **A claim on an item is the PAIR**, feed guid and item guid. An item guid is
  unique only inside its feed, so a baseline keyed on the item guid alone takes
  the wrong favorite. (Vector 25)
- **A baseline describes one list.** Never seed it from another list, another
  address, or an older format's baseline.
- **Losing it is safe; guessing is not.** An empty baseline yields no removals,
  so the next publish is a pure union. Start there.
- **With two halves, answer per half.** The half you write into is recomputed;
  **the half you did not publish into has its claims CARRIED, never
  recomputed.** Recomputing it claims every entry in it, nothing backs the
  claim next cycle, and [rule 3](#3-the-merge)'s removal row fires on the whole
  half at once. (Vector 14)
- **Retire a carried claim when BOTH are true:** the entry is no longer in that
  half, **and** you no longer hold it. Either alone keeps it — an entry still
  in the half has a live claim, and an entry you still hold keeps its claim
  wherever it sits, because there the claim is what stops you re-adding what
  another app removed. Retiring only ever removes claims, so it cannot claim
  what is not yours, and **a half you could not read is a half you did not
  edit** — carry its claims untouched. (Vector 31)

### 3. The merge

Walk the entries you read, **in order**, and emit:

| what you find | what to do |
|---|---|
| an entry you hold locally | keep it |
| an entry not in your baseline | **carry it** — another app added it |
| an entry in your baseline, absent locally | drop it — you removed it |
| anything you cannot parse | carry the whole tag — see [rule 4](#4-carry-what-you-cannot-read) |

Then append entries you hold that were not on the list — **unless your baseline
names them**, in which case another app removed them and re-adding is a
resurrection loop. (Vectors 8, 9)

- **Run the three rows against every entry, feeds and items alike.** They are
  independent favorites: unfavoriting an item whose feed you dropped still
  propagates, and dropping a feed favorite never touches an item.
  (Vectors 11, 26)
- **Match on the whole key.** Same entry only when the feed guid matches too.
- **Emit each run in [band order](#bands)**, new entries at the end of their
  band. (Vector 18)
- **Moving the list between halves is a merge, not a copy.** The three rows run
  on both halves on that cycle like any other. A claim is not a favorite:
  claiming an entry back on the baseline alone does not keep a removal, it
  **publishes** it. (Vector 29)

### 4. Carry what you cannot read

An identifier kind outside your table, a tag type you have no meaning for, a
`k` naming a kind you never emit, a malformed guid — all of it belongs to a
writer newer or older than you. **Carry the whole tag**, not a value re-rendered
from your own model.

**"Whole tag" means every element.** A writer that rebuilds entries as
`["i", id]` type-checks, renders correctly, and strips every item of the feed
guid that makes it resolvable. Position 3 is undefined and is exactly where a
newer writer will put the next thing. (Vector 27)

An unparseable entry **must not end a legacy run**: an unrecognized `i` between
a feed entry and a two-element item must not strand that item. (Vector 4)
([why](notes/pc20-favorites-rationale.md#carry-rule))

#### `content` is carried too

> **Republish `event.content` byte for byte, unless you encrypted the bytes you
> are replacing it with.** An empty `content` on a republish must be what the
> read actually held.

- **Do not give the value a default.** A default is how a `""` gets written
  back by habit — one caller that omits the argument compiles, type-checks, and
  deletes another app's data. Building a list from scratch is the only case
  with nothing to carry, and it can say so at the call site.
- **Capture it on the read.** An implementation that never reads
  `event.content` has nothing to put back even in principle.

Carrying is **mandatory**. Using `content` is **optional**. That combination is
the only one that does not destroy data. (Vector 12)

### 5. Publish only when the bytes change

Compare your merged tag array against the array you read — **put through your
own framing first.** Regenerate `alt`, `visibility` and the trailing `k` tags on
both sides, then compare byte for byte. If they match, publish nothing.

Normalising first is not tidiness: two conforming events differ. Both `k`
layouts are legal and mean the same list, and the positions of `alt` and
`visibility` are free. Compare the read as it arrived and every one of those
reports a change — and if the other app compares raw too, neither of you ever
stops. (Vector 7)

Compare against **the read**, not against a digest of your own last publish;
only the former notices another app has edited the event since. (Vector 3)
([why](notes/pc20-favorites-rationale.md#reframed-bytes))

---

## Known limits

Stated so implementers can plan around them. Reasoning and alternatives
considered are in
[the rationale](notes/pc20-favorites-rationale.md#what-this-format-does-not-do).

- **One event holds everything**, so a large list risks relay size caps
  (~128 KB on nos.lol), reached at ~90 KB of entries once encrypted. Item
  favorites fill it an order of magnitude faster than feed favorites.
- **No fallback URL.** Position 2 holds the item identifier, so an entry is
  guids and nothing else. An unresolvable entry is still somebody's favorite:
  carry it and render what you can.
- **A generic NIP-73 consumer shows the wrong thing for an item favorite** — it
  resolves position 1, which is the feed.
- **No per-item relay filter.** Relays index `i` at position 1 only, so `#i`
  for a feed guid returns feed and item favorites together.
- **An item is addressed differently here than in a kind:1 note**, which tags
  it as `["i","podcast:item:guid:X"]`. Read the kind before you read the tag.
- **No way to say an item is NOT a favorite.** A removal is an absence, which
  is what makes [the baseline](#2-keep-a-baseline) load-bearing.
- **No provenance, and so no last-write-wins.**
- **The pubkey, the kind, `created_at` and the event size stay public whatever
  the mode.** An observer learns that this person keeps podcast favorites,
  roughly how many, and when they last changed them. Padding hides the exact
  count, not the order of magnitude.
- **No concurrency control.** Two apps publishing within a second of each other
  will still lose one set of changes; `created_at` and relay last-write-wins
  decide the survivor. Re-read rather than assume your own last publish is
  current.

---

## Test vectors

A conforming implementation should pin at least these. They are stated as
behaviors rather than fixtures so they can be written against any test
runner.

**1. A foreign entry survives your republish.** Read a list containing a feed
your app cannot resolve and an item of it, publish, and both must come
back byte-identical, in the same relative position, under the same medium.
Your own new feed lands at the end of its own band, inside its medium run —
which need not be the end of the event. This is the vector that catches a
writer built from local state alone, which is the natural way to write one.

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
carried through untouched. Pin that a medium run holding one comes back in wire
order rather than banded: a tag with no kind has no band, and inventing a place
for it is how a carried tag ends up somewhere that changes what it means. Pin
two more places this reaches inside a tag. An
unreadable entry between a feed entry and a legacy item must not end the
legacy run, or that item is stranded with no feed at all. And a `podcast:guid:`
entry whose **position 2** you cannot read is not a feed favorite: carry it
whole, because reading it as one turns a newer writer's entry into a followed
show.

**5. Placement.** An item entry names its own feed, so shuffling the tag array
moves nothing: parse the same entries in two orders and each item keeps the
same feed guid. `medium` is the exception and is still a running value, and an
entry with no `medium` tag above it reads as unknown rather than `podcast`.

**6. An item entry declares a kind position 1 does not say, and a URL-shaped
item guid does not corrupt it.** The kind is the kind of the entry's LAST
identifier, so `["i","podcast:guid:F","podcast:item:guid:X"]` yields
`podcast:item:guid` even though position 1 reads `podcast:guid`. And it comes
from a table rather than from splitting a string, so an item guid of
`https://example.com/ep/42` yields `podcast:item:guid` and never
`podcast:item:guid:https` — at position 2, and at position 1 in the legacy
form. Pin both, from one list: a writer that reads position 1 alone passes the
string half on its own.

**7. Both `k` layouts parse identically, and neither provokes a republish.**
One `k` per distinct kind and a `k` paired with every `i` describe the same
list; a reader that treats them differently silently loses every entry written
by the other revision. Then pin the writer's half from the same fixture: hold
exactly what the paired layout holds, claim it in your baseline, and publish
nothing. The two layouts differ byte for byte while meaning the same thing, so
a writer comparing the read as it ARRIVED rather than [put through its own
framing](#5-publish-only-when-the-bytes-change) republishes a list nothing had
changed — on every load, forever, if the other app does the same.

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

**11. Removing a feed favorite never touches anybody's items.** Read a list
with a feed entry and two items of that feed, one yours and one another app's.
Take back the feed favorite and your own item: both go, theirs stays, and it
still carries the feed guid it cannot be looked up without — which is the same
string the removed feed entry carried, so a writer keyed on position 1 takes
the surviving item with it. An earlier revision
needed a rule to prevent this — the feed entry was the only tag naming those
items' feed, so dropping it deleted another app's tracks. Pin that the
surviving item is complete with no feed entry left on the list at all.

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
the thing only this state can produce — **an entry that was in both halves
must be emitted ONCE**. The
claimed-back copy is the same entry, not a second one, and concatenating them
emits one favorite as two entries and double-counts it for every reader. The
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
rule](#5-public-and-private) exists for: an
app claiming a list is public while the entries it cannot see stay encrypted
has published a false statement about someone's privacy, and the next app to
believe it converges on the strength of it. Pin the control in the same
fixture — the same writer, the same list, but `content` it CAN decode — or an
implementation that never restates the mode at all passes.

**18. A run is emitted in band order, and a new entry joins its own band.**
Read a list with two medium runs, hold the first run's items in a different
order plus one new item, and publish: the run is not split in two and the new
entry does not lead. Then pin the bands from a run that arrives interleaved and
holds one of each level, with a new artist, a new album and a new track: out
come artists, then albums, then tracks grouped by the album they name, each new
entry at the end of its own band. Two well-formed wrong answers: local order
first, and the other app imposes its order back forever; appended to the end of
the event, and a second `medium` run opens for a medium that already had one. A
third looks right until a list holds more than one level — appending at the end
of the RUN rather than the band. And pin idempotence on the banded output, or
the sort itself becomes the thing that never stops.

**19. The same feed twice on the wire loses no item.** Read a list with two
entries for one feed and an item after each. Fold the duplicate or carry it;
either is conforming, and neither may lose an item or lose the favorite itself.
Under the old grouping this was the dangerous case: each copy opened a group,
and a writer that modelled groups by guid met the second one already taken and
dropped the item beneath it.

**20. An item that names no feed is carried, never deleted, and never given
one by being moved.** Parse it with a null feed — do not borrow one from an
unrelated entry and do not invent one, because a wrong feed guid resolves to
the wrong thing and a missing one resolves to nothing. A placeholder guid is an
invented one, and a writer that always fills position 2 writes placeholders.
Republish and the tag is still there, still in its two-element legacy form,
because there was nothing to rewrite it with. Then **re-parse your own output
and assert the feed is still null**, from a fixture where the orphan shares a
run with albums: the tag is byte-identical either way, so a writer that banded
it in beside the other tracks passes everything else while having handed it
whichever album landed last. That is the assertion band 0 exists for. This is
what an item written before this revision looks like when no feed entry
precedes it, and it is unresolvable by anyone, which is not the same as junk.

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

**25. A feed favorite and an item favorite are stated separately.** Save one
item from a feed you have not favorited: ONE tag, the item, carrying the guid
of its feed, and no feed entry at all. This is the case the format could not
write before — it had to open a feed entry to hold the item, which put a feed
the user never chose on the list, 114 of 196 on the first real one. Then
favorite the feed as well and a second tag appears, with the item untouched —
and **pin that the two tags carry the same string at position 1** and differ
only in length, because that is what a reader keyed on position 1 gets wrong.
Pin the mirror case from the same fixture: a feed favorite alone is one tag and
no item. Pin the baseline shape too — a claim on an item is the PAIR, and
**two entries sharing an item guid under different feed guids are two
favorites**: keying on the item guid alone folds them into one, and a claim on
one then removes the other. Pin one entry in both halves, emitted once.

**26. Unfavoriting the feed keeps the item, and needs nothing to say so.**
Read a list with a feed entry and an item of that feed, hold the feed as not
favorited with your baseline claiming it, and publish: the feed entry goes, the
item stays, and it still carries its feed guid. An earlier revision could not
delete that entry — it was the only tag naming the item's feed — so the removal
had to be stated with a marker, and a writer that left the marker off said
"nobody knows" instead. Pin the other direction from the same fixture — drop
the item, keep the feed — and pin the conflict: a feed favorite your baseline
does not claim is another app's, and not holding it here does not beat it.
Deleting it has the two of you rewriting the event at each other forever.

**27. An entry is carried whole, and no writer invents a feed guid.** Rule 4
inside an `i` tag, and the stakes rose with this revision. A writer that
rebuilds entries as `["i", id]` type-checks, renders correctly, and strips
every item of half its address, so nobody can look those favorites up again.
Pin an item carrying an element at position 3 that this writer has no meaning
for: it comes back byte-identical. Then pin the MIGRATION in the same fixture:
a legacy `["i","podcast:item:guid:X"]` takes its feed from the entry above it,
a writer republishes it as `["i","podcast:guid:F","podcast:item:guid:X"]` —
the WHOLE tag, not just an appended element — and reading the result back
changes nothing. A migration that is not idempotent republishes on every load
forever.

**28. An artist entry is a favorite that belongs to no feed.** Read a list with
a `podcast:publisher:guid` entry between an album entry and a track: the artist
carries no item guid, and the track still names the ALBUM. Republish and it
comes back in place and bare. Pin the bare part from the app that HOLDS the
artist as well as one carrying it — that is where a writer reaches for a second
element, because it has state and somewhere to put it, and there is no feed for
an artist to belong to. Everything to here is mandatory for every app, whether
or not it offers artist favorites. The last part is not: origination, `k` tag
included, is what an app that DOES offer them owes — without the `k`, `#k`
discovery misses every artist favorite it ever publishes.

**29. A removal survives a change of mode.** Unfavorite an entry your baseline
claims, and pin that it goes in all four places a mode change puts it. On a
list already private: hold one of two private entries, publish, and the other
is dropped — a merge carrying "it is only changing places" logic on this path
publishes NOTHING here, because the bytes it builds match the ones it read.
On the half being moved INTO: a licensed private → public move with the removed
entry in the public half, which must not come back on the way past. And on the
half being moved FROM: going private with the removed entry in the public half,
which must not ride the move across. And on the claim-back: no `visibility`
tag with BOTH halves populated, so the writer may take back only what its own
baseline names, with the removed entry among what it claims — which must be
dropped from both halves rather than published in the open. Run the last two
for TWO cycles. The baseline written by the first cannot claim an entry the
device does not hold, so a removal that survives either survives every cycle
after it as well — one cycle shows a stale entry, two show that nothing can
ever remove it.

**30. An empty half is an empty string.** Take back the last entry of a
`medium` run — a list with no `visibility` tag and both halves populated, one
private entry your baseline claims and you still hold, moving to the public
half — and pin that `content` comes back as `''` rather than as the encryption
of the run that entry left behind. Then hand the result to a second writer whose
signer has NO NIP-44, holding both feeds, and have its user choose private. It
must reach private. A writer that cannot decrypt reads any ciphertext as a half
another app owns, and refuses to change the mode on top of it; that refusal is
right, and an empty half that encodes to ciphertext makes it fire on nothing.
The second half of this vector is the one that matters — a byte-count
assertion alone does not say what the leftover costs.

**31. A carried claim retires with the entry it names.** Three parts, and the
third is what keeps the first two from becoming an over-correction. Take an
entry back out of the inactive half — unfavorite one your baseline claims
there — and pin that the claim goes with it; then have a second writer put
that entry back into that half and pin that your next cycle leaves it alone.
Repeat on a whole-list move, where the half is emptied outright rather than
edited entry by entry: same rule, same second writer, same outcome. Then pin
the opposite: a second writer removes an entry from the inactive half that you
STILL HOLD, and the claim must survive, because that claim is what stops you
re-adding what somebody else deleted. A test that retires on absence alone
passes the first two and fails this one.

