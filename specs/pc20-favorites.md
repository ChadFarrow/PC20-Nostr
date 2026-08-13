# Cross-app podcast favorites on Nostr

A user's favorites should follow them between podcast apps. This describes one
shared list on Nostr that any app can read and write, so favoriting a show in
one app makes it favorited in every other app the same person signs into.

Implemented by **Boost Me Bitch** and **StableKraft**. Nothing here is specific
to either — a third app needs only this document.

## TL;DR

- One event per user: `kind 30078`, `d = podcast:favorites`, content empty and
  public, one `i` tag per favorite (NIP-73 identifiers).
- An entry may carry an advisory `<podcast:medium>` at **tag position 4**, so a
  music app can tell an album from a talk show without a lookup. It is a cache
  of what you'd otherwise resolve, not the truth: never overwrite another
  writer's non-empty hint, never truncate positions you don't understand, and
  never read a missing hint as `podcast`.
- It's a library ("saved to listen to"), not a public like — don't render save
  counts or feed it into recommendations.
- The list has many writers and no partial update, so never publish your local
  set and never publish the raw union of local and remote. Publish a delta
  computed against a per-device baseline of *your own* past contribution — see
  "The merge" below, and read it twice.
- Never publish over a read that might have failed silently. A degraded read
  and an empty list look identical to a user unless you say which one
  happened — and your relay library's aggregate EOSE is **not** by itself
  proof the read succeeded. Count reached-vs-answered relays yourself.

---

## The event

One [NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md)
application-data event per user, at a fixed, app-neutral address:

| | |
|---|---|
| `kind` | `30078` (NIP-78 application data) |
| `d` tag | `podcast:favorites` |
| `title` tag | `Podcast Favorites` — nothing renders it; it keeps the event self-describing |
| `content` | empty string, and **public** |

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
    // position 3 empty: a feed has no parent. Position 4 says it's music.
    ["i", "podcast:guid:917393e3-1b1e-5cef-ace4-edaa54e1f810",
          "https://example.com/feed.xml",
          "",
          "music"],

    // an episode / track — the RSS item's <guid>
    ["i", "podcast:item:guid:https://example.com/ep/42",
          "https://example.com/feed.xml",
          "podcast:guid:917393e3-1b1e-5cef-ace4-edaa54e1f810",
          "podcast"],

    // hints are optional and independent — an entry may carry none at all
    ["i", "podcast:guid:d3f8b1a2-4c5e-5a6b-9c8d-7e6f5a4b3c2d"],

    ["k", "podcast:guid"],
    ["k", "podcast:item:guid"]
  ],
  "content": ""
}
```

### Tag positions

- **Position 1** — the NIP-73 identifier. This is the merge key; nothing else
  identifies an entry.
- **Position 2** — NIP-73's optional URL hint. Use the **feed's RSS URL**. It
  lets an app resolve an entry without a Podcast Index key.
- **Position 3** — *extension*: `podcast:guid:<feedGuid>` of an item's parent
  feed. Podcast Index's `/episodes/byguid` wants `podcastguid`, so an item guid
  on its own is not a reliable lookup. Writers **should** emit it.

- **Position 4** — *extension*: the entry's Podcasting 2.0
  [`<podcast:medium>`](https://podcasting2.org/podcast-namespace/tags/medium) —
  `podcast`, `music`, `video`, `film`, `audiobook`, `newsletter`, `blog`,
  `publisher`, the `…L` list variants, and whatever the namespace adds next.
  Without it the list is undifferentiated: a music album and a talk show are
  both `podcast:guid:<uuid>`, so every app renders the other's favorites mixed
  into its own.

  It is **advisory** — a cache of what a reader could resolve for itself, and it
  can go stale when a feed retags. Details in
  "[Reconciling hints](#reconciling-hints)"; the essentials:

  - The vocabulary is **not a closed set**. Preserve a value you don't
    recognize; a value you've never heard of is one a newer app has.
  - Lowercase when you originate a value. Never rewrite someone else's case —
    normalization is a write, and every write is churn.
  - On a `podcast:item:guid` entry it means **the medium of the feed named in
    position 3**; Podcasting 2.0 has no per-item medium. If that feed is also on
    the list under its own `podcast:guid`, the feed entry's hint wins — never
    derive a feed's hint from one of its items.
  - `publisher` is legal on a `podcast:guid` entry, since publisher feeds carry
    `<podcast:medium>publisher</podcast:medium>`. Prefer the
    `podcast:publisher:guid` identifier where you have the choice; it is
    self-describing at position 1.

- **Any position left unknown while a later one is present is held open with an
  empty string, never shifted.** An entry with a parent feed but no URL hint is
  `["i", <id>, "", <feedRef>]`, not `["i", <id>, <feedRef>]`.

- Extensions are additive and safe to **ignore**: an app reading only positions
  1–2 sees an ordinary, well-formed NIP-73 tag. They are *not* safe to **drop**.
  Ignoring a position when you read is fine; ignoring it when you rebuild the
  tag deletes another app's data. See "Reconciling hints".

- `k` tags: one per **distinct** identifier kind present, not one per favorite.
  Recognized kinds are `podcast:guid`, `podcast:item:guid` and
  `podcast:publisher:guid`. Derive the kind from that table and from **position
  1 only** — *not* by scanning for a colon, since item guids are routinely
  permalink URLs and `podcast:item:guid:https://…` would yield
  `podcast:item:guid:https`; and *not* from position 4, which is a medium, not
  an identifier kind. A `["k", "music"]` tag is meaningless and pollutes the
  `#k` discovery filter every app relies on. Position 4 also never changes an
  entry's kind: a `podcast:guid` entry hinted `publisher` is still a
  `podcast:guid` entry.

### Removal

An entry is unfavorited by being **absent from the next revision**. Kind 30078
is addressable/replaceable, so the newest event at this `d` wins outright.

Do **not** publish NIP-09 kind-5 deletions for favorites. They are unnecessary
here, and a kind-5 targeting this event's address doesn't remove entries
selectively — per NIP-09, an `a`-tag deletion instructs relays to delete *all
versions* of the addressed event up to the deletion's timestamp. Applied here,
that's the entire shared list, every app's entries at once, not just yours.

---

## The merge — read this part twice

The list is **one replaceable event with many writers**. There is no partial
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
favorite only when it is in your baseline and absent from the list. Never
"everything I hold that isn't on the list": on the first run the list is empty
because nothing has published to it yet, and that rule reads an empty list as
"the user cleared everything" and wipes their library. An absent baseline means
you have never agreed to anything, so you may not delete at all.

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
and looks exactly like one that succeeded — so report both through **one** flag.
And a retry makes concurrent reads reachable for the first time, so make the
read single-flight; a double-tap must not run two read-merge-publish cycles.

### Reconciling hints

Everything above decides **membership** — which identifiers are on the list —
and it does that on raw strings alone. The hints at positions 2–4 are a
*second, subordinate pass* that runs only over entries membership already kept.
That pass may never add an entry, remove one, or change its identifier. Keeping
the two separate is what lets a hint be mutable without putting a favorite at
risk.

**Overlay, don't rebuild.** Reconstruct an `i` tag by overlaying the positions
you understand onto the tag you read, index by index, and never truncate to the
length of your own struct. This is the rule that is easiest to violate without
noticing, because the natural implementation violates it: parse each tag into
`{id, feedUrl, feedRef}`, merge those, write them back out — and every position
past the third is gone, on every entry, on every publish, with no error and
nothing on screen to show for it. Both reference implementations do exactly
this today. Store the tail you didn't understand and re-emit it.

**A non-empty hint you didn't write is not yours to change.** Fill positions
that are empty or absent; leave the rest alone, even when you resolved a
different value and are confident yours is better:

```
for each position p in 2, 3, 4:
  next[p] = latest[p] if latest[p] is non-empty else mine[p]
```

The tempting rule — "prefer my own resolved value" — is what makes two apps
holding different values rewrite the event against each other on every publish,
forever. Neither is wrong and neither converges. Stickiness terminates: after
one publish the value stops moving.

This applies to positions 2 and 3 as much as to 4, and it is a change from what
the reference implementations do — both take `mine.feedUrl ?? latest.feedUrl`,
i.e. mine wins. Two apps holding different feed URLs for one `podcast:guid` is
*more* likely than two holding different mediums: `http` versus `https`, a
Podcast Index-canonical URL versus the publisher's, a proxy versus the origin.

Position 2 gets one exception, because a URL can be shown to be wrong: you may
replace a non-empty hint given **positive evidence** the existing one is dead —
it 404s, it permanently redirects, Podcast Index reports it gone. Not merely
because yours differs. Position 4 has no such evidence channel, so it is
strictly sticky.

**Never publish solely to upgrade a hint.** Fill hints opportunistically, on a
publish you were already making for a real favorite or unfavorite. A bulk
"backfill medium onto every entry" pass is an unprompted write to a replaceable
multi-writer event, run by two apps at once — the shape of every failure in this
document.

**An unrecognized value is not an empty one.** Don't overwrite it, don't drop
it, don't normalize its case. This is the same rule as for unknown `i` tags and
unrecognized `k` values, one level down, and it fails the same way: "I don't
recognize this, so it's junk" is a judgement only the user gets to make.

**Absent means unknown — not a default.** An entry with no position 4 is an
entry whose medium you have not been told, and the honest renderings are "look
it up" or "put it somewhere neutral". Substituting a default is the inverse of
the bug this section exists to prevent: the shared list carries podcasts *and*
music by design, so an app that assumes one gets it wrong for the other half of
the list and shows the user the same undifferentiated pile they started with.

Correcting a hint you believe is wrong is fine as an **explicit user action** —
the same standard as cleaning up malformed entries below. It is automatic
correction that churns.

### Carry what you can't read

The merge decides **membership** on raw identifier strings. Never interpret an
entry to decide whether it survives, and never drop one for being unrecognized:

- A music app has no UI for `podcast:item:guid:` entries a podcast app added.
- A podcast app has no UI for `podcast:publisher:guid:`.
- Neither knows what a third app will add next.

Preserve unknown `i` tags verbatim, hints and all — and read "verbatim"
**positionally**, on *every* `i` tag rather than only the ones whose identifier
you couldn't parse. A tag is preserved when every position survives, including
positions past the end of whatever struct you parsed it into. An entry whose
identifier you understood perfectly and whose position 4 you silently deleted
was not preserved. See "Reconciling hints".

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
3. Fall back to the position-2 URL hint — fetch the feed, or
   `GET /api/1.0/podcasts/byfeedurl?url=<hint>`.

Given a `podcast:item:guid:<guid>`:

1. Look it up locally by item guid.
2. Podcast Index:
   `GET /api/1.0/episodes/byguid?guid=<guid>&podcastguid=<feedGuid from position 3>`.
3. Fall back to the position-2 feed URL and search its items.

Resolution is a fan-out over the whole list, so **probe first, then batch**: one
sequential request, and if it fails with a 5xx, skip the rest rather than
opening one socket per favorite against an endpoint that is already down. Cache
results; a returning user hydrates on every page load.

**Position 4 is what you have before any of that happens.** It lets you sort the
list into music and podcasts on first paint, rather than leaving the user with
one undifferentiated pile that reshuffles as lookups land. Once an entry
resolves, prefer the medium you resolved — it is current and the hint may not
be. A disagreement is a stale hint, not an error: render your own value, and
don't republish to correct the wire (see "Reconciling hints"). The hint keeps
earning its place for entries you haven't resolved yet and for entries that no
longer resolve at all — a dead or delisted feed can't be categorized any other
way, which is to say the hint matters most exactly where losing it costs the
most.

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
- **Watch the size.** The tag list grows without bound as favorites accumulate,
  and relays enforce their own max event size — a large enough library can get
  a publish rejected outright. Treat that the same as any other failed write
  (see above): don't silently drop entries, surface it and retry rather than
  truncating the list to fit. **That covers hints as well as entries.** Hints
  are most of the bytes — a feed URL at position 2 runs 40–80 characters against
  a medium's 5–10 — so shedding them is the obvious way to squeeze under a
  limit, and it is the same silent loss one level down: they belong to whichever
  writer put them there.

---

## Migrating an existing list

An app that already had its own favorites list can adopt this one without losing
anything:

1. Read both the old address and `podcast:favorites`.
2. **Only if both reads are trustworthy**, merge the old entries in with an
   *empty baseline* — a migration only ever adds, and passing the old ids as a
   baseline would read anything already on the shared list as a removal.
3. Publish the shared list. Leave the old event in place; it costs nothing and
   is the rollback path.
4. **Record the baseline from your local set, not from the old list.** This is
   the step that looks like a detail and isn't.

Step 4 is worth spelling out, because "the entries I just moved across" is the
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

---

## Test vectors

Concrete fixtures for the cases most worth pinning in a test suite. Identifiers
below are shorthand (`"a"`, `"b"`) for real NIP-73 identifiers — substitute
those when adapting these. The merge vectors (1–2) show sets of identifiers,
since membership is all they turn on; the hint vectors (3–9) show whole `i`
tags, since positions are the point.

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
      "https://example.com/feed.xml",
      "podcast:guid:917393e3-1b1e-5cef-ace4-edaa54e1f810",
      "podcast"]
```

Correct: match the identifier's declared prefix against the recognized-kinds
table → `podcast:item:guid`.

Wrong: scan for the first colon and stop → `podcast:item:guid:https`, which is
not a recognized kind and silently drops the entry from the `#k` discovery
filter.

Also assert the event carries **no** `["k", "music"]`. Position 4 is a medium,
not an identifier kind.

### 4. Tail preservation — a position you don't understand survives a republish

```jsonc
// on the wire, from an app newer than yours
["i", "a", "https://example.com/feed.xml", "", "music", "something-new"]

// after your read → merge → write, with the entry unchanged:
["i", "a", "https://example.com/feed.xml", "", "music", "something-new"]
```

Assert position 5 is still there. This is the general rule, not a medium rule —
pin it with a value your parser has no field for, because a test written only
against position 4 passes the day someone adds position 6.

Note what this vector requires of the fixture. A round-trip assertion whose
input is built from your own struct cannot fail: you write three positions, read
three positions back, and the comparison is vacuously true while the code
truncates everything else. **The fixture has to contain something your struct
can't hold**, or the test pins nothing. Both reference implementations have such
an assertion and both pass it while truncating.

### 5. Idempotence — the same inputs twice produce the same event

```jsonc
latest = [["i", "a", "", "", "music"]]      // another app's hint
local  = ["a"], baseline = ["a"]            // you resolved "podcast" for "a"

// first publish: the foreign hint is kept, not replaced
next  = [["i", "a", "", "", "music"]]

// now feed that back in as `latest` and merge again:
next' = [["i", "a", "", "", "music"]]       // identical
```

Assert `next' == next` exactly. **This is the vector worth copying first.** A
hint that flip-flops is invisible to any single-pass assertion — each publish
looks locally reasonable, and the bug is only that it never stops. Two apps
running "prefer my own resolved value" pass every other test here and rewrite
the event against each other forever.

### 6. Never blank a hint you don't have

```jsonc
latest = [["i", "a", "", "", "music"]]
local  = ["a"]                              // you have no medium for "a"

next   = [["i", "a", "", "", "music"]]      // unchanged — absent ≠ "clear it"
```

### 7. Fill an empty hint, holding earlier positions open

```jsonc
latest = [["i", "a", "https://example.com/feed.xml"]]
local  = ["a"]                              // you resolved medium = music

next   = [["i", "a", "https://example.com/feed.xml", "", "music"]]
```

Position 3 is held open with an empty string. Shifting `"music"` into position 3
would claim it as a parent feed guid.

### 8. An unrecognized medium survives contact with your app

```jsonc
latest = [["i", "a", "", "", "somethingL"]]
local  = ["a"]                              // you resolved medium = music

next   = [["i", "a", "", "", "somethingL"]]
```

Not overwritten with your value, not dropped, not case-normalized, and it
produces no `k` tag. A medium you don't recognize is one a newer app does.

### 9. A missing hint is unknown, not a default

```jsonc
latest = [["i", "a", "https://example.com/feed.xml"]]
```

Assert your renderer treats `a` as *medium unknown* — resolve it or bucket it
neutrally. Asserting the absence of a default is worth the trouble because the
failure is silent and plausible: the shared list carries podcasts and music at
once, so whichever way you default, you are wrong about half of it.

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

Both pin the same vectors as the Test vectors section above, plus the
clobber case, the two empty-local cases, and the URL-shaped item guid — those
four are the ones worth copying if you implement this, together with tail
preservation and idempotence (vectors 4 and 5), which are what keep the hints
from being quietly destroyed.

**Known gap in both, as of the position-4 hint being added here.** Each parses
an `i` tag into a three-field struct — `{id, feedUrl, feedRef}`, filled from
`tag[1]`, `tag[2]`, `tag[3]` — and rebuilds the tag from that struct on
republish, so position 4 and anything after it is dropped on every publish, for
every entry. Don't copy that shape. It predates this document's position-4
extension but not the rule it breaks: "Carry what you can't read" has always
asked for `i` tags to be preserved hints and all.

Don't trust their round-trip assertions to catch it in your own port, either.
Both have a check named for losslessness — `scripts/check-favsync.mjs` in Boost
Me Bitch, `shared-favorites.test.ts` in StableKraft — and both compare against a
fixture built from those same three fields, so neither *can* fail on the
truncation that is actually happening. Test vector 4 is the fixture that breaks
the tie, and the reason it insists on a position your struct has no room for.
