# Cross-app podcast favorites on Nostr

A user's favorites should follow them between podcast apps. This describes two
shared lists on Nostr that any app can read and write — one for shows and
albums, one for episodes and tracks — so favoriting something in one app makes
it favorited in every other app the same person signs into.

Implemented by **Boost Me Bitch** and **StableKraft**. Nothing here is specific
to either — a third app needs only this document.

## TL;DR

- Two events per user, both `kind 30078` with content empty and public, one `i`
  tag per favorite (NIP-73 identifiers): `d = podcast:favorites` for shows,
  albums and publishers, `d = podcast:favorites:items` for episodes and tracks.
  Which list an entry belongs to is derived from its identifier, not chosen.
- An `i` tag carries the identifier at position 1 and, for items, the parent
  feed's `podcast:guid` at position 3 — Podcast Index needs it to resolve an
  episode. Position 2 is legacy: preserve what you find, write nothing new, and
  **hold it open with an empty string** rather than closing the gap. An item
  tag is `["i", <id>, "", <parentGuid>]`.
- It's a library ("saved to listen to"), not a public like — don't render save
  counts or feed it into recommendations.
- Each list has many writers and no partial update, so never publish your local
  set and never publish the raw union of local and remote. Publish a delta
  computed against a per-device baseline of *your own* past contribution — see
  "The merge" below, and read it twice.
- Never publish over a read that might have failed silently. A degraded read
  and an empty list look identical to a user unless you say which one
  happened — and your relay library's aggregate EOSE is **not** by itself
  proof the read succeeded. Count reached-vs-answered relays yourself.

---

## The events

Two [NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md)
application-data events per user, at fixed, app-neutral addresses. Which one an
entry belongs to is decided by its identifier, not by the app that adds it:

| `d` tag | holds | identifier kinds |
|---|---|---|
| `podcast:favorites` | shows, albums, publishers | `podcast:guid`, `podcast:publisher:guid` |
| `podcast:favorites:items` | episodes, tracks | `podcast:item:guid` |

Both are `kind 30078` with `content` an empty string and **public**, and both
carry a `title` tag that nothing renders — `Podcast Favorites` and `Podcast
Favorite Items` — to keep the event self-describing.

**Placement is derived, never chosen.** Match the identifier's declared prefix
against the recognized-kinds table above and the address follows. This is the
property that makes splitting safe: if an entry could plausibly land in either
list, two apps would disagree, and an entry added to one list and removed from
the other is an entry that comes back. Deriving placement removes the choice,
so there is nothing to disagree about. An identifier kind not in that table
has no derivation, so put it on `podcast:favorites` and treat that as the
default home. A new kind must be added to the table here before anyone writes
it, or two apps will place it differently and the entry will bounce between
the lists forever.

**Why two events.** Item favorites accumulate an order of magnitude faster than
feed favorites — a listener saving individual music tracks passes a thousand
without trying, where the same person follows perhaps forty shows. Every
publish replaces the whole event and relays cap event size, so one list means
the tracks eventually make the publish fail and take the podcast subscriptions
down with them. Two events mean the volume-heavy list can only break itself.
See "Watch the size" under Publishing notes for the measured limits.

### It is a library, not a like

This list records **what a user has saved to listen to**, so their library follows
them between apps. It is deliberately *not* an endorsement, and an implementer
should not render it as one — no public like counts, no "N people saved this",
no feeding it into recommendations as a positive signal. People save things they
are unsure about and things they would not recommend.

If you want the public, social version — "I like this episode", countable, shown
to other people — that already exists and is a different event:
[NIP-25](https://github.com/nostr-protocol/nips/blob/master/25.md) **kind 17**
reactions, which carry the same NIP-73 `podcast:guid` / `podcast:item:guid`
identifiers and are what Fountain uses. Emit both if your app has both concepts.
Do not derive one from the other.

### On `content` being plaintext

This is a choice, not a constraint, and it is worth being explicit because the
obvious assumption is wrong in both directions.

**Encryption is available.** NIP-51-style private items are encrypted to the
user's *own* key, so any app holding their signer can decrypt them — a second
app reads them fine. "Other apps couldn't read it" is not a reason to skip
encryption.

**The actual costs are these.** A decrypt on every read: instant on a NIP-07
browser extension, but seconds or a phone tap on NIP-46/Amber, on every page
load unless you cache the plaintext against the event's `created_at`. And
nothing without a signer can read the list at all — no server-side resolution,
no debugging it from a relay query.

The reference implementations chose plaintext. **Say so in your UI**: the list is
public and signed by the user's key, so anyone can see what they have saved — the
same posture as a Nostr follow list. That is a disclosure even though it is not
an endorsement.

One clarification worth being explicit about: this isn't a per-item switch you
can flip later while keeping today's tag layout. The identifiers live in `i`
tags, which are always visible regardless of what `content` holds — that's
what makes the list readable to any app that doesn't already know the format.
Real encryption would mean moving entries into `content` the way NIP-51 does
for private bookmark items, which is a different event shape, not a config
change to this one. Plaintext-vs-encrypted is a fork in the design, decided by
the tag-based structure below, not a runtime option within it.

### Why not a NIP-51 bookmark set?

The obvious home is kind `30003`, and it's wrong. Kind 30003 is *user-named
bookmark collections* — saved links and articles. Two things follow, and both
are bad:

- **A generic Nostr client lists someone's podcast favorites among their
  bookmarks**, which is the wrong category. Podcasts aren't links you saved.
- **Any bookmark client that lets them edit a set will clobber this list**, and
  its author is doing nothing wrong. Kind 30003 is theirs to write, and they
  have no reason to implement the merge discipline below.

The second one is the real problem: it's silent data loss caused by a
well-behaved third party. Kind 30078 is app-defined data at a `d`-addressed
slot, so no generic client renders or rewrites it. That's exactly the property
this needs, and it's available today with no coordination.

A dedicated kind number would be cleaner still, but that needs the NIP process
and a number nobody else will use. Until there's a reason to spend that, 30078
is the home.

Items are [NIP-73](https://github.com/nostr-protocol/nips/blob/master/73.md)
external content identifiers, one `i` tag each:

```jsonc
{
  "kind": 30078,
  "tags": [
    ["d", "podcast:favorites"],
    ["title", "Podcast Favorites"],

    // a podcast / album — Podcasting 2.0 <podcast:guid>
    ["i", "podcast:guid:917393e3-1b1e-5cef-ace4-edaa54e1f810"],
    ["i", "podcast:guid:d3f8b1a2-4c5e-5a6b-9c8d-7e6f5a4b3c2d"],

    ["k", "podcast:guid"]
  ],
  "content": ""
}
```

```jsonc
{
  "kind": 30078,
  "tags": [
    ["d", "podcast:favorites:items"],
    ["title", "Podcast Favorite Items"],

    // an episode / track — the RSS item's <guid>, then its parent feed.
    // Position 2 is held open: it is NIP-73's URL slot, and this format
    // no longer writes it.
    ["i", "podcast:item:guid:https://example.com/ep/42",
          "",
          "podcast:guid:917393e3-1b1e-5cef-ace4-edaa54e1f810"],

    ["k", "podcast:item:guid"]
  ],
  "content": ""
}
```

### Tag positions

- **Position 1** — the NIP-73 identifier. This is the merge key; nothing else
  identifies an entry.

- **Position 2** — **reserved: preserve it, never write it.** This is NIP-73's
  optional URL hint, and earlier revisions of this document told you to put the
  feed's RSS URL here. They no longer do. Any app implementing this has a
  Podcast Index key and `podcast:guid` resolves without a hint, so the URL was
  redundant on every path that mattered — while being the largest field on the
  tag and the one two apps were most likely to hold different values for
  (`http` versus `https`, a Podcast Index-canonical URL versus the publisher's,
  a proxy versus the origin).

  Events written against those earlier revisions still carry one, and both
  reference implementations still write one today. Carry it forward untouched;
  see "Carry what you can't read". Do not write a new one, and do not strip an
  existing one — deleting another writer's data is the failure this whole
  document exists to prevent, and it does not become acceptable because the
  field was deprecated.

- **Position 3** — the `podcast:guid:<feedGuid>` of an item's parent feed.
  **Required on the items list**: Podcast Index's `/episodes/byguid` wants
  `podcastguid`, so an item guid on its own is not a reliable lookup, and an
  entry without it may be unresolvable by anyone, forever. If you have an item
  guid but not its parent feed's guid, resolve the parent before you write the
  entry. If you cannot, write the entry anyway with position 3 empty rather
  than dropping the favorite — an unresolvable entry the user can see and clean
  up beats a save that silently never syncs — and fill position 3 on a later
  publish once you know it. Absent on the feeds list, where an entry has no
  parent.

- **Positions past 3 are not defined.** Preserve anything you find there
  verbatim. A position you don't recognize is one a newer app understands.

- **A position left empty while a later one is present is held open with an
  empty string, never shifted.** An item entry is `["i", <id>, "", <feedRef>]` —
  position 2 stays blank rather than closing up. Shifting the parent guid into
  position 2 would make every event written under the earlier revisions parse
  as having a parent feed of `https://…`.

- `k` tags: one per **distinct** identifier kind present in that event, not one
  per favorite. Recognized kinds are `podcast:guid`, `podcast:item:guid` and
  `podcast:publisher:guid`. Derive the kind from the recognized-kinds list
  above and from **position 1 only** — *not* by scanning for a colon, since
  item guids are routinely permalink URLs and `podcast:item:guid:https://…`
  would yield `podcast:item:guid:https`, which is not a recognized kind and
  silently drops the entry from the `#k` discovery filter every app relies on.

### Overlay, don't rebuild

Reconstruct an `i` tag by overlaying the positions you understand onto the tag
you read, index by index, and never truncate to the length of your own struct.

This is the rule that is easiest to violate without noticing, because the
natural implementation violates it: parse each tag into `{id, feedUrl,
feedRef}`, merge those, write them back out — and every position past the third
is gone, on every entry, on every publish, with no error and nothing on screen
to show for it. Both reference implementations do exactly this today.

It matters more now that position 2 is legacy rather than less. An app that
rebuilds `["i", id, "", parent]` from a two-field struct deletes a feed URL
that a *shipping* app wrote, on every publish. Store the tail you didn't
understand and re-emit it.

### Removal

An entry is unfavorited by being **absent from the next revision**. Kind 30078
is addressable/replaceable, so the newest event at its `d` wins outright.

Do **not** publish NIP-09 kind-5 deletions for favorites. They are unnecessary
here, and a kind-5 targeting this event's address doesn't remove entries
selectively — per NIP-09, an `a`-tag deletion instructs relays to delete *all
versions* of the addressed event up to the deletion's timestamp. Applied here,
that's the entire shared list, every app's entries at once, not just yours.

---

## The merge — read this part twice

Each list is **one replaceable event with many writers**. There is no partial
update: every publish replaces the whole thing. So a naive writer destroys other
apps' data, and there is no error, no undo, and no sign of it on the device that
did it.

Two obvious approaches are both wrong:

- **Publish your local set.** Erases every entry added by another app.
- **Publish the union of local and remote.** Never removes anything, so
  unfavoriting silently stops working — forever, on every device.

Instead, each app keeps a **baseline**: the identifiers *it itself contributed*
as of its last sync, persisted locally per user. It publishes a *delta applied
to a fresh read*:

```
publish():
  latest, trustworthy = read()
  if not trustworthy: abort and retry later

  adds    = local    - baseline     # I added these
  removes = baseline - local        # I removed these
  next    = (latest - removes) ∪ adds

  write(next)
  baseline = next ∩ local           # MY contribution, not the whole list
```

Two details in there are easy to get wrong and both cost data:

- **`∪ adds`, not `∪ local`.** Appending your whole local set puts back
  anything another app removed while you still had it — the user unfavorites in
  app A, opens app B, and it returns. Only entries absent from your baseline are
  genuine local additions.
- **`baseline = next ∩ local`, not `baseline = next`.** `removes` is
  `baseline − local`, and `local` can only ever hold what your app can
  represent. A baseline holding the whole published list therefore turns every
  foreign identifier into one of your removals on the *next* publish — you delete
  another app's entries one toggle later. Store only what you contributed.

**Run this per list, independently — and partition `local` as well.** Two
addresses means two baselines, two reads and two publishes. It also means two
*local* sets, and this is the part that is easy to miss. Derive each entry's
placement from its identifier, exactly as a writer does, and run the merge for
list `L` over only the entries that derive to `L`:

```
for each list L:
  local_L    = { e in local : placement(e) == L }
  baseline_L = your stored baseline for L
  publish(L, local_L, baseline_L)
```

Running the merge for one list against your *whole* local set publishes
everything to both lists. `adds = local − baseline` sweeps in every track while
you are publishing the feeds list, and every show while you are publishing the
items list. Both lists end up holding everything, the size pressure the split
exists to isolate is back on the feeds list, and you have manufactured the exact
added-to-one-list-removed-from-the-other churn that deriving placement was meant
to prevent. Both reference implementations hold a single combined favorites
store today, so this is the shape a port will start from.

Keep the two lists' failures independent too — a degraded read on the items list
must not block a publish to the feeds list, and a publish rejected for size on
one list must not abort the other. Coupling them hands the volume-heavy list's
size pressure straight to the list the split exists to protect.

Which gives exactly the three properties the feature needs:

1. An entry another app added while you were offline is in `latest` but not in
   `baseline`, so it is never mistaken for one of your removals. It survives.
2. An entry *you* removed **is** in `baseline` and not in `local`, so it is
   deleted — unfavoriting propagates.
3. An empty local set with an empty baseline deletes nothing (a device that has
   not hydrated yet is not making a claim), while an empty local set with a full
   baseline is a real clear-all and is honoured.

### Worked example

App A's baseline (its own last-known contribution) is `{x, y}`. Its local set
is now `{x, z}` — it removed `y` and added `z`. Meanwhile App B, unseen by A,
added `w` to the shared list while A was offline, so a fresh read returns
`latest = {x, y, w}`.

```
adds    = local − baseline   = {x, z} − {x, y}    = {z}
removes = baseline − local   = {x, y} − {x, z}    = {y}
next    = (latest − removes) ∪ adds
        = ({x, y, w} − {y}) ∪ {z}
        = {x, w} ∪ {z}
        = {x, w, z}
baseline' = next ∩ local     = {x, w, z} ∩ {x, z} = {x, z}
```

`w` survives untouched even though A never knew about it, `y` is gone because A
removed it, and A's new baseline is only what A can still vouch for — `w` is
not in it, so a future removal of `w` by A alone won't happen by accident.

**Baseline is per device, not per account.** Two devices signed into the same
app are, as far as this algorithm is concerned, two independent writers — each
computes its own adds/removes against its own last-known contribution, exactly
as if they were different apps. That's fine, and handled correctly by the
merge as written. It becomes a bug only if an implementer "improves" this by
syncing one shared baseline across a user's devices through their own account
or cloud storage: without proper locking, two devices racing on a shared
baseline reintroduces the exact clobber failure this whole scheme exists to
prevent. Keep the baseline local to the device unless you've built real
concurrency control around sharing it.

**The same asymmetry governs reading.** If your app has its own store to
reconcile against the list — a database, not just a cache — delete a local
favorite only when it is in your baseline and absent from
**the list that entry derives to**. Reconciling your whole store against one
list finds every entry belonging to the other list "absent" and deletes it —
with a single combined store, reconciling against the feeds list wipes the
user's entire track library. Never "everything I hold that isn't on the list":
on the first run the list is empty because nothing has published to it yet,
and that rule reads an empty list as "the user cleared everything" and wipes
their library. An absent baseline means you have never agreed to anything, so
you may not delete at all.

Two cheap guards are worth having if your local store is the only copy of a
favorite. **Cap how much one reconcile may delete** — a mass removal is far more
likely to be a bug than a user action, and a real clear-all still applies once
the remaining set is under the cap. And **ship deletion behind a flag**, running
the reconcile in report-only mode first: you get to watch it be right before it
is allowed to be wrong. An app whose local list is a pure cache of the event
needs neither; an app with a database does.

### Never write on top of a read you didn't get

A relay query returning nothing has two meanings — "nobody has it" and "nothing
answered" — and only the first is data. Treating a timeout as an empty list and
publishing over it wipes the user's favorites across every app they own.

Distinguish them. Practically: an event in hand is proof the query worked;
otherwise only an aggregate EOSE counts, and resolving on a timeout means you
heard nothing. **If the read was degraded, publish nothing.** Losing a republish
is recoverable — the next toggle retries it — and the alternative is not.

That standard applies per relay, not just per query: `read()` means querying
your full relay set and taking the event with the highest `created_at` among
everything that actually answered, not the first response or a single relay's
opinion. A relay that's merely behind — serving a real but stale version of the
event — looks exactly as "trustworthy" as one that's current, and produces the
same data loss as a timeout if you treat its answer as `latest` without
comparing across the set.

Verify what comes back, too. Check the event's signature and that its pubkey
matches the user before treating it as `latest` — a relay serving a forged or
tampered event is a variant of the same problem you're already guarding
against, just with malicious rather than absent data. Reject at **intake**,
not on the winner: a foreign event carrying a newer `created_at` otherwise
takes the `latest` slot on its timestamp, and discarding it afterwards throws
away the genuine event it displaced — turning a good read into an empty one,
which is the very state this section exists to keep separate.

### An aggregate EOSE is not automatically an answer

The advice above — "only an aggregate EOSE counts" — is necessary and it is not
sufficient, because the API that reports the aggregate folds two non-answers
into it and reports both as an answered query. Both of these were measured in a
shipping implementation that had followed this document:

- **A synthesized EOSE.** Client libraries fake one on a timer when a relay
  never sends it: nostr-tools calls `receivedEose()` after `baseEoseTimeout`,
  4400 ms. If your query window is *longer* than that timer, a relay that
  accepted the socket and then said nothing is indistinguishable from one that
  answered "I have none" — the recommended API hands you a timeout wearing an
  EOSE costume. Measured at 4424 ms against a 5 s window.
- **A failed connection counted as an answer.** A relay that never connected can
  still count toward the aggregate, so with nothing reachable the aggregate
  fires immediately and vacuously — measured at **19 ms with no network at
  all**. "Every *reachable* relay confirmed none" is trivially true when the
  reachable set is empty, which makes being offline read as a cleared library.

So count it yourself rather than trusting one callback:

```
reached  = relays that accepted a connection
answered = of those, the ones that sent a REAL eose inside your window

trustworthy = event_in_hand or (reached > 0 and answered == reached)
```

Two details in there:

- **Push the library's synthetic-EOSE timeout past your own deadline** so it can
  never fire inside the window and pose as an answer. Keep that margin *small*:
  the timer usually outlives the subscription (closing a subscription need not
  clear it), so a large value leaves it pending long after the read returned.
- **Exclude relays that never connected from the denominator** rather than
  counting them as answers. Requiring every *listed* relay to answer means one
  permanently dead entry in a default list leaves every read degraded forever —
  and dead entries in default lists are common and long-lived, precisely because
  nothing surfaces them. A relay that *hangs*, by contrast, is a genuine
  unknown and should degrade the read.

Testing this needs a scripted local relay. A correct relay will not hang, serve
another user's event, or serve a tampered one on request — so the failure modes
that matter here cannot be reproduced against the real network, and an
implementation that has only ever been tested against live relays has not
tested this at all.

### And say so

The guard above is silent by construction: it keeps local state, publishes
nothing, and returns. That is correct and it is not enough, because **a degraded
read and an empty list render identically**. On a device with no cache — a new
browser, a private tab, a second device — the result is a blank library with no
explanation, and "we couldn't reach the relays" is visually indistinguishable
from "your favorites are gone".

The failure mode is not the user's confusion, it's yours. When the reference
implementation hit this, production looked broken, the correct code was
suspected twice, and a revert of the safety guard was nearly shipped to fix a
bug that didn't exist. **The guard is most likely to be doubted on the exact
occasion it works.**

So: surface it. A non-blocking notice on the favorites surface — *"Couldn't
reach the relays — showing what's on this device"* — with a retry. Distinguish
the three states a favorites view otherwise collapses into one:

| | |
|---|---|
| **read failed** | say so, offer a retry, show the local copy if you have one |
| **read succeeded, list is empty** | your ordinary empty state |
| **not signed in** | never claim a relay failure — there is nothing to sync |

Two details worth copying. The write path is silent in the same way one screen
removed — a favorite toggled while the relays are unreachable skips its publish
and looks exactly like one that succeeded — so report read failure and write
failure for a given list through **one flag per list**. One flag across both
lists is worse than none: a successful feeds read clears the notice a failed
items read set, and the user gets a clean, confident empty state for their nine
hundred tracks, which is precisely the state this section exists to prevent. If
a single surface shows both lists, it must be able to say that part of what
you are looking at could not be loaded. And a retry makes concurrent reads
reachable for the first time, so make the read single-flight; a double-tap must
not run two read-merge-publish cycles.

### Reading events written before the split

Every event on the wire today was written by the single-list revision of this
document, which put episodes and tracks on `podcast:favorites` alongside shows.
Both reference implementations still do. That is not a malformed event and its
entries are not junk — they are the user's favorites, written correctly against
the spec as it stood.

Three rules, and the third is the one that costs data if you get it wrong:

- **Readers must accept `podcast:item:guid` entries found on
  `podcast:favorites`**, and surface them as the item favorites they are. An
  app that reads only `podcast:favorites:items` for tracks shows a new user an
  empty library while their entire track history sits one address away.
- **Writers must never originate an item entry there.** New item favorites go
  to `podcast:favorites:items`, always.
- **An entry is yours to relocate only if it is in your own baseline for the
  list it currently sits on.** Relocation is a removal plus an add, and removal
  is governed by the merge: `removes = baseline − local`. A foreign entry is
  not in your baseline, so moving it means deleting another app's data, and the
  app that wrote it will republish it on its next toggle. That is the
  add-and-remove-forever loop described under "Migrating an existing list",
  running between two apps instead of within one.

The practical consequence is that `podcast:favorites` will hold a shrinking tail
of item entries for as long as any single-list writer is still active, and that
is fine. Read both lists, merge what you find, and let the tail drain as each
app's own entries migrate under rule three.

### Carry what you can't read

The merge operates on **raw identifier strings**. Never interpret an entry
before merging, and never drop one for being unrecognized:

- A music app has no UI for `podcast:item:guid:` entries a podcast app added.
- A podcast app has no UI for `podcast:publisher:guid:`.
- Neither knows what a third app will add next.

Preserve unknown `i` tags verbatim — and read "verbatim" **positionally**, on
*every* `i` tag rather than only the ones whose identifier you couldn't parse. A
tag is preserved when every position survives, including positions past the end
of whatever struct you parsed it into. An entry whose identifier you understood
perfectly and whose position 2 you silently deleted was not preserved. See
"Overlay, don't rebuild".

Preserve unrecognized top-level tags too, and preserve `k` tags naming kinds you
don't generate — stripping those removes another app's `#k` discovery filter
from the event.

"My app can't display this" and "this is junk" are different claims, and only
the user gets to make the second one. If an app offers a cleanup for malformed
entries, it must be an explicit user action, never automatic.

---

## Resolving an entry

Given a `podcast:guid:<uuid>`:

1. Look it up locally, if you have a catalogue.
2. Podcast Index: `GET /api/1.0/podcasts/byguid?guid=<uuid>`.

Given a `podcast:item:guid:<guid>`:

1. Look it up locally by item guid.
2. Podcast Index:
   `GET /api/1.0/episodes/byguid?guid=<guid>&podcastguid=<feedGuid from position 3>`.

That is the whole resolution path, and it is why position 3 is mandatory on the
items list: without `podcastguid` the lookup is unreliable, and there is no
longer a URL hint to fall back on.

If an entry carries a legacy position-2 URL, you may use it — fetch the feed,
or `GET /api/1.0/podcasts/byfeedurl?url=<hint>`. Do not depend on one being
there, and do not write one.

Resolution is a fan-out over the whole list, so **probe first, then batch**: one
sequential request, and if it fails with a 5xx, skip the rest rather than
opening one socket per favorite against an endpoint that is already down. Cache
results; a returning user hydrates on every page load.

**An entry Podcast Index doesn't know is not an entry you may drop.** A feed
that was never indexed, or has since been delisted, still belongs to the user.
Keep it on the list, keep republishing it, and render it as unresolved — see
"Carry what you can't read".

### What can't be represented

An entry needs a globally-unique identifier. A favorite keyed only on an
app-local database id, or on a feed with no `<podcast:guid>`, cannot go on the
list. Skip it — and, symmetrically, **never delete it during reconciliation**:
something that could never have appeared on the list cannot be missing from it.

---

## Publishing notes

- **Debounce.** Collapse rapid toggles into one read-merge-publish cycle, and so
  one signing prompt. ~0.5–1.5 s works well. One republish per window, not one
  per item — the whole point of a list event.
- **Verify the publish landed.** Some relay clients resolve with per-relay
  results and never reject; an unchecked `await` can't tell "stored" from
  "refused by every relay". Assert at least one success.
- **Connect before you publish** if your relay client requires it. A client that
  iterates only connected relays publishes to nobody, successfully, if you skip
  that step.
- **Relays.** The user's NIP-65 write relays unioned with your defaults. Always
  include the defaults: a dead or AUTH-gated relay in a user's list otherwise
  produces "published to 0 relays".
- **Watch the size.** Each event's tag list grows without bound as favorites
  accumulate and relays cap event size, so a large enough library gets a
  publish rejected outright. Measured against the default relay set on
  2026-08-12, from each relay's NIP-11 `limitation.max_message_length`:

  | relay | bytes |
  |---|---|
  | **nos.lol** | **131,072** |
  | theforest.nostr1.com | 262,200 |
  | relay.snort.social | 524,288 |
  | relay.primal.net | 1,000,000 |
  | relay.damus.io | 1,000,000 |

  You publish to all of them, so the smallest binds. At 128 KB, allowing ~500
  bytes of envelope, that is roughly **2,250 feed entries** at 58 bytes each, or
  **970–1,220 item entries** at 107–134 bytes, the range depending on how long
  the publisher's item guids are. Permalink guids are common and they are the
  single largest field on an item tag.

  Treat a rejection the same as any other failed write: **surface it and retry,
  never truncate the list to fit.** Dropping entries to squeeze under a limit is
  silent data loss wearing a workaround's clothing, and the entries you would
  drop are as likely to be another app's as your own. That covers legacy
  position-2 hints too — shedding them is the same loss one level down.

---

## Migrating an existing list

An app that already had its own favorites list can adopt this one without losing
anything:

1. Read the old address and **both** shared lists.
2. Split the old entries by derived placement, exactly as a writer does: an
   entry goes to the list its identifier kind belongs to, never to whichever
   list you happened to read first.
3. **Per list, and only if that list's read and the old address's read were
   both trustworthy**, merge that list's share of the old entries in with an
   *empty baseline* — a migration only ever adds, and passing the old ids as a
   baseline would read anything already on the shared list as a removal. A
   degraded read of one shared list blocks only its own half; migrate the other
   and retry the blocked one later.
4. Publish each list you migrated. Leave the old event in place; it costs
   nothing and is the rollback path.
5. **Record the baseline from your local set, not from the old list.** This is
   the step that looks like a detail and isn't.

Step 5 is worth spelling out, because "the entries I just moved across" is the
obvious definition of your contribution and it undoes the migration one line
later. The baseline is not a record of authorship — it is a promise that `local`
will keep asserting every id in it, since the next merge computes
`removes = baseline − local`. If your migration runs before those entries have
landed in the store you reconcile against (and it usually does — you migrate
early, you populate late), then a baseline naming the old ids makes your very
next merge read all of them as local removals and publish them straight back
out.

The symptom is a migration that reports success forever and never completes:
"migrated N entries" on every page load, N added and N deleted per load, and
nothing ever accumulating on the shared list. It is easy to miss precisely
because it is safe — the old event is untouched, so nothing is lost, and the
rollback path that protects you is also what hides the bug.

Leaving the migrated ids **out** of the baseline is the correct, conservative
answer: your merge then treats them as another app's entries and carries them
verbatim, which is what the format asks for anyway. They join your baseline on
a later pass, once they have resolved into your store and the promise can be
kept.

Run it on every hydration rather than once. It is a no-op after the first time,
and a user signing in on a second device months later still has their pre-sync
history waiting at the old address.

Splitting before you publish is not optional. An old list holds shows and
tracks together — that is what it was for — so migrating it wholesale into
`podcast:favorites` strands every track on the feeds list, where no app looking
for items will ever read it, and where it counts against the size budget of the
one list the split exists to keep small.

---

## Test vectors

Concrete fixtures for the cases most worth pinning in a test suite. Identifiers
below are shorthand (`"a"`, `"b"`) for full `i` tags; substitute real NIP-73
identifiers when adapting these.

### 1. The clobber case — a foreign entry must survive your republish

```jsonc
// Your app's local state
baseline = ["a"]              // what you last published
local    = ["a"]              // unchanged since baseline

// The shared list has an entry from another app you've never seen
latest = ["a", "b"]           // "b" was added by a different app while you were offline

// Merge:
adds      = local - baseline           = []
removes   = baseline - local           = []
next      = (latest - removes) ∪ adds  = ["a", "b"]
baseline' = next ∩ local               = ["a"]

// Assert: next contains "b". A naive publish(local) would have dropped it.
```

### 2. The two empty-local cases — first run vs. a real clear-all

```jsonc
// 2a — device that has never hydrated: empty local, empty baseline
local = [], baseline = []
latest = ["a", "b"]

adds = [], removes = []
next = latest = ["a", "b"]     // nothing deleted; an unhydrated device makes no claim

// 2b — device that had everything and the user cleared it: empty local, full baseline
local = [], baseline = ["a", "b"]
latest = ["a", "b"]

adds = [], removes = ["a", "b"]
next = latest - removes = []   // a real clear-all, and it is honoured
```

Same inputs (`local = []`), opposite correct outputs — the baseline is what
tells them apart.

### 3. URL-shaped item guid — derive the `k` tag from the table, not by scanning

```jsonc
["i", "podcast:item:guid:https://example.com/ep/42",
      "",
      "podcast:guid:917393e3-1b1e-5cef-ace4-edaa54e1f810"]
```

Correct: match the identifier's declared prefix against the recognized-kinds
table → `podcast:item:guid`.

Wrong: scan for the first colon and stop → `podcast:item:guid:https`, which is
not a recognized kind and silently drops the entry from the `#k` discovery
filter.

Also assert that no `k` tag is ever derived from any position other than 1. A
legacy or newer entry may carry values at positions past 3 that this document
does not define; none of them is an identifier kind, and a `k` tag minted from
one pollutes the `#k` discovery filter every app relies on.

### 4. Tail preservation — a position you don't understand survives a republish

```jsonc
// on the wire: a legacy feed URL at position 2, and a position your
// parser has no field for at all
["i", "a", "https://example.com/feed.xml", "podcast:guid:917393e3-1b1e-5cef-ace4-edaa54e1f810", "something-new"]

// after your read → merge → write, with the entry unchanged:
["i", "a", "https://example.com/feed.xml", "podcast:guid:917393e3-1b1e-5cef-ace4-edaa54e1f810", "something-new"]
```

Assert position 4 is still there. This is the general rule, not a rule about any
one position — pin it with a value your parser has no field for, because a test
written only against the positions you know passes the day someone adds
another.

Everything past position 3 belongs exclusively to somebody else: an earlier
revision of this document, or an app newer than yours. Note what that requires
of the fixture. A round-trip assertion whose input is built from your own struct
cannot fail — you write the positions you know, read them back, and the
comparison is vacuously true while the code truncates everything else. **The
fixture has to contain something your struct can't hold**, or the test pins
nothing. Both reference implementations have such an assertion and both pass it
while truncating.

### 5. Placement — which list an entry belongs to is derived, not chosen

```jsonc
"podcast:guid:917393e3-1b1e-5cef-ace4-edaa54e1f810"
                                     → d = podcast:favorites
"podcast:publisher:guid:8f2c1d4e-…"  → d = podcast:favorites
"podcast:item:guid:https://example.com/ep/42"
                                     → d = podcast:favorites:items
"podcast:season:guid:whatever"       → d = podcast:favorites  (unrecognized
                                        kinds default to the feeds list)
```

Assert placement is computed from the identifier alone and never from which
list the entry was read on. The failure this pins is an app that publishes its
whole local set to both addresses, which puts every track on the feeds list and
every show on the items list in a single publish.

---

## Reference implementations

- **Boost Me Bitch** — `lib/nostr/favorites-merge.ts` (wire format + merge,
  deliberately import-free), `lib/nostr/favorites.ts` (I/O),
  `lib/nostr/favorites-hydrator.ts` (hydration + migration),
  `components/favorites-sync-notice.tsx` (the degraded-read notice). The merge
  is pinned by `npm run check:favsync`.
- **StableKraft** — `lib/nostr/shared-favorites.ts` (wire format + merge + the
  relay read), tested by `npx tsx --test lib/nostr/shared-favorites.test.ts`.
  The read's trust decision is pinned separately by
  `lib/nostr/shared-favorites.relay.test.ts`, which scripts local relays that
  hang, refuse to connect, serve another user's event, or serve a tampered one
  — that harness is what turned up both failures described in "An aggregate
  EOSE is not automatically an answer". `lib/nostr/shared-favorites.relay-probe.ts`
  is the complementary read-only check against the real default relays, since
  fake relays cannot tell you that a relay you actually ship has gone dark.

Both pin the clobber case, the two empty-local cases, and the URL-shaped item
guid. Those three are the ones worth copying if you implement this, together
with tail preservation (vector 4), which is what keeps another writer's data
from being quietly destroyed.

**Known gaps in both, as of this revision.** Each parses an `i` tag into a
three-field struct — `{id, feedUrl, feedRef}` from `tag[1]`, `tag[2]`,
`tag[3]` — and rebuilds the tag from that struct on republish, so anything past
position 3 is dropped on every publish, for every entry. Don't copy that shape;
see "Overlay, don't rebuild".

Both also still write a feed URL at position 2, which earlier revisions of this
document asked for. Nothing breaks while they continue — position 2 is reserved
and preserved precisely so those events stay valid — but a new implementation
should not follow them, and both should stop originating it when convenient.
Neither has implemented the split into two addresses yet.

Don't trust their round-trip assertions to catch the truncation in your own
port, either. Both have a check named for losslessness —
`scripts/check-favsync.mjs` in Boost Me Bitch, `shared-favorites.test.ts` in
StableKraft — and both compare against a fixture built from those same three
fields, so neither *can* fail on the truncation that is actually happening.
Test vector 4 is the fixture that breaks the tie, and the reason it insists on
a position your struct has no room for.
