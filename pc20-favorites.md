# Cross-app Podcast Favorites on Nostr

Favorite a show or a track in one Podcasting 2.0 app, and it is favorited in
every other app you sign into. One flat list, one event.

**Any app may read and write it, and the event is replaceable.** So a writer
that publishes without reading first does not lose a race — it deletes every
entry the other apps added, silently, on someone else's device, with no undo.
[Merging](#merging) is what makes wholesale replacement safe, and it is not
optional. ([why](notes/pc20-favorites-rationale.md#blind-publish))

This document is rules. The reasons, the measurements and the history are in
[the rationale](notes/pc20-favorites-rationale.md), and every rule links its
own with a `(why)`. The 31 test vectors are stated in
[conformance/vectors.md](conformance/vectors.md) and are code you can run
against your own merge:

```bash
node --test conformance/vectors.test.mjs
```

## The event

Kind **`10333`**, a plain (non-`d`-tagged) replaceable event: exactly one per
pubkey. Republishing the full tag list replaces the previous version wholesale,
and that replacement *is* the sync mechanism.

`10333` is **self-assigned, not NIP-allocated.** Relay filters are kind-scoped,
so a later NIP landing on it would put two unrelated event types into every
query either app makes. Confirm there is still no collision.
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
    ["i", "podcast:guid:9b0a2a1e-7c3d-53f8-b6a4-2f1c8d0e5b77"],
    ["i", "podcast:guid:4c1f8e2b-0d6a-5a91-8e35-7b9c2d4f6a10",
          "podcast:item:guid:d2b7f014-3a58-4c6e-9f21-8ad5c3e70b46"],
    ["i", "podcast:guid:4c1f8e2b-0d6a-5a91-8e35-7b9c2d4f6a10",
          "podcast:item:guid:e8c04a97-165b-4d2f-a730-5c9e1b8f2a41"],

    ["k", "podcast:guid"],
    ["k", "podcast:item:guid"],
    ["k", "podcast:publisher:guid"]
  ],
  "content": ""
}
```

Six favorites, six `i` tags: one podcast, one episode of a podcast they do not
follow, one artist, one album, and two tracks from an album they do not follow.
You can count the user's choices by counting the lines.

`content` is empty here **only because this list has no private entries.** It
is not a constant — see [rule 4](#4-carry-what-you-cannot-read).

## Entries

One `i` tag per favorite, holding
[NIP-73](https://github.com/nostr-protocol/nips/blob/master/73.md) identifiers
with their prefixes. Nothing is on the list for structural reasons: if it is
there, the user chose it.

| tag | meaning |
|---|---|
| `["i","podcast:guid:F"]` | feed favorite — a podcast or an album |
| `["i","podcast:guid:F","podcast:item:guid:X"]` | item `X` of feed `F` — an episode or a track |
| `["i","podcast:publisher:guid:P"]` | artist; belongs to no feed |
| `["i","podcast:item:guid:X"]` | **legacy** item; feed from the entry above |

Position 1 is the feed, position 2 is the item, and **nothing is defined past
position 2.** Every entry names its own feed, so no reader reconstructs it from
position and no reorder can move it
([why](notes/pc20-favorites-rationale.md#entry-names-its-feed)); an item guid is
unique only inside its feed, so it is not an address on its own
([why](notes/pc20-favorites-rationale.md#item-guid-not-an-address)). The two
positions are `<podcast:remoteItem>`'s two attributes, restated as one tag
([why](notes/pc20-favorites-rationale.md#remoteitem)).

Four rules, all load-bearing:

- **Tell a feed entry from an item entry by LENGTH, never by position 1.**
  Their position 1 is byte-for-byte the same string, so keying on it folds them
  together and one disappears. (Vector 25)
- **An entry's kind is the kind of its LAST identifier** — position 2 when
  there is one. Read position 1 alone and `podcast:item:guid` never reaches the
  `k` tags, so `#k` discovery stops finding item favorites. (Vector 6)
- **A position 2 you cannot read makes the entry unreadable, not a feed
  favorite.** Carry it whole; reading it as one turns a newer writer's entry
  into a followed show. (Vector 4)
- **Derive kinds from a known-kinds table, never by splitting the string.**
  Item guids are routinely permalink URLs, so "everything before the last
  colon" yields `podcast:item:guid:https` — a `k` value no relay filter
  matches. (Vector 6)

**An artist entry is bare and belongs to no feed.** It is never an item of the
entry above it. Carrying one is mandatory; offering the feature is not — and an
app that does offer it owes the `k` tag, or `#k` discovery misses every artist
favorite it publishes. (Vector 28)
([why](notes/pc20-favorites-rationale.md#artist-entries))

**Legacy lists.** Every list published before this revision writes items as two
elements, with the feed carried by the entry above, so **a reader MUST accept
both forms.** A writer rewrites such a tag on its next publish — the **whole
tag**, position 1 included — from the feed it just read positionally, and the
rewrite must be idempotent. (Vector 27) An item with no feed entry above it is
unresolvable by anyone: carry it as it arrived, render what you can, never
delete it, and never invent or borrow a feed guid, because a wrong one resolves
to the wrong thing. Emit it in [band 0](#bands). (Vector 20)
([why](notes/pc20-favorites-rationale.md#legacy-items))

## `medium`

A **running value**: it applies to every entry after it until the next `medium`
tag. It is the only tag whose position carries meaning.

- **An entry before any `medium` tag is UNKNOWN.** Do not default it to
  `podcast`, and do not invent a `["medium","unknown"]` tag.
- **Publish only a medium the feed declared** in `<podcast:medium>`. An app's
  internal classification carries a default, and a guess here is sticky — no
  other app has reason to correct it.
- **It is a hint, not truth.** A Podcast Index lookup on the guid wins whenever
  they disagree. ([why](notes/pc20-favorites-rationale.md#medium-hint))

Keep same-medium entries contiguous. A medium must not open a second run.

## Tag order

| tag | where |
|---|---|
| `alt` | first, exactly once; regenerated rather than carried, discarded on read (Vector 21) |
| `visibility` | not positional; put it next to `alt` |
| `medium` | opens a run; applies until the next one |
| `i` | inside its run, by band |
| `k` | at the end, one per distinct kind; order among them unspecified |

Emit one `k` per distinct kind, not one per `i`. **A reader MUST accept both
layouts and MUST ignore `k` when parsing entries**, deriving the kind from the
identifier. A reader that walks `i`/`k` in pairs shows an empty library rather
than an error. (Vector 7)
([why](notes/pc20-favorites-rationale.md#trailing-k))

### Bands

Prescribing the order is what makes two writers converge; preserving it does
not. ([why](notes/pc20-favorites-rationale.md#band-order)) Inside one `medium`
run, emit entries in four bands:

| band | what | order inside it |
|---|---|---|
| 0 | items naming **no** feed | as read, untouched |
| 1 | artists — `podcast:publisher:guid` | as read; a new one at the end |
| 2 | albums and podcasts — two-element `podcast:guid` | as read; a new one at the end |
| 3 | episodes and songs | grouped by the feed they name, groups in order of first appearance; a new item joins its feed's group |

- **A new entry goes at the end of its band, inside its run** — not ahead of
  what you read, and not at the end of the event, which opens a second run for
  a medium that already has one. (Vector 18)
- **A run holding a tag you cannot classify is emitted as read**, in wire
  order. A tag with no kind has no band; do not invent a place for it.
  (Vector 4)
- **A duplicate feed entry is well-formed.** Fold it or carry it; neither can
  move an item. (Vector 19)

## Public and private

A list is **wholly** in the plaintext tags or **wholly** in the encrypted
`content`. It is never split, and no entry is in both.

`["visibility","public"]` or `["visibility","private"]` states the mode of the
whole list, and any app may change it. It is multi-letter on purpose: relays
index single-letter tags, and a `#v=private` filter would enumerate the pubkeys
keeping a private list.

- **Absent, infer it:** entries in exactly one half means that half is the
  mode. Entries in **both halves, or in neither: ask the user and publish
  nothing until they answer.**
  ([why](notes/pc20-favorites-rationale.md#no-safe-default))
- **The tag is written on a user's choice and carried thereafter.** A writer's
  standing setting never stamps it onto a list that has none.
- **Changing the mode requires being able to read BOTH halves.** An app whose
  signer has no NIP-44 carries `content` verbatim, does not restate the mode,
  and **says on screen that it cannot open the other half.** (Vector 17)
- **A writer that can read both, and finds the tag and the entries
  disagreeing, converges toward the tag** — one copy of each entry, other half
  emptied. An entry that was in both halves is emitted **once**.
  (Vectors 15, 16)
- **With no tag the move is asymmetric:** public → private may move another
  app's entries; private → public may move **only** what your baseline claims,
  because an `i` tag is a disclosure and cannot be undone. (Vector 13)
- **A failed decrypt is a degraded read, not an empty half.** Carry the
  ciphertext, publish nothing derived from it, say so on screen.
- **Show the private half whatever your own last choice was** — but rendering
  is not adopting. Out of the private half, adopt only what your baseline
  already claims.
  ([why](notes/pc20-favorites-rationale.md#privacy-belongs-to-the-list))
- There is no third value. "Not on Nostr" is a local choice: withdraw what your
  baseline claims and publish nothing further.

**Ship it in this order.** Land [the carry rule](#4-carry-what-you-cannot-read)
in every writer first, and only then let any of them start writing a private
half. An app must also read and render that half before anything moves entries
into it on its behalf, or the move is indistinguishable from a deletion on that
app's screen. ([why](notes/pc20-favorites-rationale.md#private-half-sequencing))

**The bytes.** The private half is a tag array, stringified, encrypted to your
own key with
[NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md), in
`content`. The `medium` and [band](#bands) rules apply inside it unchanged.

- **No `?` in the plaintext** — write its six-character JSON escape,
  `\u003f`. A NIP-55 signer splits the decoded URI on `?`, and the truncated
  request comes back as "signer not installed". (Vector 22)
- **A plaintext that is not a tag array is an unreadable half**, not an empty
  one: `{}`, a string, and an array holding a non-string all decode to null,
  while `[]` is an empty list. (Vector 23)
- **Refuse to publish a plaintext past 60,000 bytes.** A signer built to
  NIP-44 v2 as first published rejects more, and the list then reads back as
  empty rather than as an error. (Vector 24)
- **A half holding no entries is `content: ''`** — not the encryption of an
  empty array, and not of a `medium` run you emptied. (Vector 30)
- **Compare decrypted arrays, never ciphertext.** NIP-44 draws a fresh nonce
  per encryption, so a ciphertext comparison republishes on every load forever.

## Merging

A writer's job is not "serialize my favorites". It is **read the current event,
fold your changes into it, and write everything else back untouched.**

### 1. Read first, and never publish on a read you do not trust

Do not expose a "publish my favorites" entry point at all — make the read part
of the same call, so no caller can skip it. A relay query returning nothing
means either "nobody has it" or "nothing answered in time", and acting on the
second republishes the whole list as empty. Count relays yourself:

```
trustworthy = event_in_hand OR (reached > 0 AND answered == reached)
```

`reached` excludes relays that never connected, or one dead default degrades
every read forever. **An aggregate EOSE from a relay library is not proof:**
libraries fold failed connections into the same callback and synthesize EOSE on
a timer. **Withholding a publish must be visible in the UI** — it renders
identically to "your favorites are gone". (Vector 2)
([why](notes/pc20-favorites-rationale.md#trustworthy-read))

### 2. Keep a baseline

The event carries no provenance, so "on the list, absent from your local state"
is ambiguous: another app just added it, or you just removed it. Identical
bytes, opposite meanings.
([why](notes/pc20-favorites-rationale.md#no-provenance))

A **baseline** is the set of identifiers you last agreed with the relay on,
stored privately on the device. It is not on the wire, and no two writers need
theirs to agree.

- **Record it only after a relay confirms the publish.** A baseline written for
  an event that never landed says "I am already asserting this", which stops
  the entry from ever being retried. (Vector 10)
- **Record only what you will keep asserting.** You may claim an entry you have
  adopted and will keep asserting; you may never claim one you are merely
  carrying.
- **A claim on an item is the PAIR**, feed guid and item guid. (Vector 25)
- **A baseline describes one list.** Never seed it from another list, another
  address, or an older format's baseline.
- **Losing it is safe; guessing is not.** An empty baseline yields no removals,
  so the next publish is a pure union.
- **With two halves, answer per half.** The half you write into is recomputed;
  **the half you did not publish into has its claims carried, never
  recomputed** — recompute and [the removal row](#3-the-merge) fires on the
  whole half at once. (Vector 14)
- **Retire a carried claim when the entry is gone from that half AND you no
  longer hold it.** Either alone keeps it. A half you could not read is a half
  you did not edit. (Vector 31)

### 3. The merge

Walk the entries you read, **in order**, and emit:

| what you find | what to do |
|---|---|
| an entry you hold locally | keep it |
| an entry not in your baseline | **carry it** — another app added it |
| an entry in your baseline, absent locally | drop it — you removed it |
| anything you cannot parse | carry the whole tag — [rule 4](#4-carry-what-you-cannot-read) |

Then append entries you hold that were not on the list — **unless your baseline
names them**, in which case another app removed them and re-adding is a
resurrection loop. (Vectors 8, 9)

Run those rows against **every** entry, feeds and items alike: unfavoriting an
item whose feed you dropped still propagates, and dropping a feed favorite never
touches an item. (Vectors 11, 26) Match on the whole key. Emit each run in
[band order](#bands). **Moving the list between halves is a merge, not a
copy** — the rows run on both halves that cycle like any other, and claiming an
entry
back on the baseline alone does not keep a removal, it **publishes** it.
(Vector 29)

### 4. Carry what you cannot read

An identifier kind outside your table, a tag type you have no meaning for, a
`k` naming a kind you never emit, a malformed guid — carry the **whole tag**,
every element, not a value re-rendered from your own model. A writer that
rebuilds entries as `["i", id]` type-checks, renders correctly, and strips
every item of the guid that makes it resolvable; position 3 is undefined and is
exactly where a newer writer puts the next thing. (Vector 27) An unparseable
entry must not end a legacy run. (Vector 4)
([why](notes/pc20-favorites-rationale.md#carry-rule))

> **`content` is carried too. Republish `event.content` byte for byte, unless
> you encrypted the bytes you are replacing it with.**

Do not give that value a default: a default is how a `""` gets written back by
habit, and one caller that omits the argument compiles, type-checks and deletes
another app's data. Capture it on the read, or you have nothing to put back
even in principle. **Carrying is mandatory; using `content` is optional** —
that combination is the only one that does not destroy data. (Vector 12)

### 5. Publish only when the bytes change

Compare your merged array against the array you read, **put through your own
framing first**: regenerate `alt`, `visibility` and the trailing `k` on both
sides, then compare byte for byte. If they match, publish nothing.

Two conforming events differ, so comparing the read as it arrived reports a
change on a list nothing changed about — and if the other app compares raw too,
neither of you ever stops. Compare against **the read**, never against a digest
of your own last publish; only the former notices that another app has edited
the event since. (Vectors 3, 7)
([why](notes/pc20-favorites-rationale.md#reframed-bytes))

## What it does not do

Alternatives considered are in
[the rationale](notes/pc20-favorites-rationale.md#what-this-format-does-not-do).

- **One event holds everything**, so a large list risks relay size caps
  (~128 KB on nos.lol), reached at ~90 KB of entries once encrypted. Item
  favorites fill it an order of magnitude faster than feed favorites.
- **No fallback URL.** Position 2 holds the item, so an entry is guids and
  nothing else. An unresolvable entry is still somebody's favorite: carry it
  and render what you can.
- **A generic NIP-73 consumer shows the wrong thing for an item favorite** — it
  resolves position 1, which is the feed.
- **No per-item relay filter.** Relays index `i` at position 1, so `#i` for a
  feed returns feed and item favorites together. A kind:1 boost note tags the
  episode instead, so a filter written for one does not find the other.
- **No way to say an item is NOT a favorite.** A removal is an absence, which
  is what makes [the baseline](#2-keep-a-baseline) load-bearing.
- **No provenance, so no last-write-wins, and no concurrency control.** Two
  apps publishing within a second of each other still lose one set of changes;
  `created_at` and relay last-write-wins decide the survivor.
- **The pubkey, the kind, `created_at` and the event size stay public in either
  mode.** Padding hides the exact count, not the order of magnitude.

---

Why each rule exists: [the rationale](notes/pc20-favorites-rationale.md).
The vectors: [conformance/vectors.md](conformance/vectors.md).
