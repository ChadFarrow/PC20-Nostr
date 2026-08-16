# Kind 10333 favorites

The wire format and merge for [cross-app podcast
favorites](../../pc20-favorites.md). This is the one entry in the catalog
where the spec came first and the code implements it, rather than the other
way round.

Two implementations exist. Nothing else in any repo writes kind 10333.

## Where it lives today

| Repo | Path | State | Read at |
|---|---|---|---|
| `boostmebitch` | `lib/nostr/favorites-list.ts` | **canonical**, 722 lines | `1f26ba0` |
| `stablekraft-app` | `lib/nostr/favorites-single-list.ts` | diverged, 662 lines | `db2eb22f` |
| `StableKraft-Nostr-Fix` | — | predates 10333, still on kinds 30001/30002 | `—` |

Supporting modules — boostmebitch: `favorites.ts`, `favorites-sync.ts`,
`favorites-hydrator.ts`, `read-trust.ts`. stablekraft-app:
`favorites-sync-client.ts`, `pc20-identifiers.ts`, `relay-read.ts`.

## Read this before comparing the two

**Both apps' source comments about each other are out of date, and so was the
first draft of this page.**

`favorites-list.ts` carries a header listing five deliberate divergences from
stablekraft. It was accurate when written. Re-read against
`stablekraft-app@db2eb22f`, **two of the five no longer hold** — stablekraft
has since fixed both. An audit that trusted that header, or that read the
local `~/Vibe/stablekraft-app` checkout (three commits stale at the time this
was written), reports bugs that were fixed upstream.

This is the concrete reason for the
[read-through-`origin/HEAD` rule](../README.md#never-read-the-local-checkout).
Two independently-maintained implementations of one spec generate stale
cross-references faster than anyone updates them.

## What ships

[`favorites-list.ts`](../modules/nostr/favorites-list.ts) — zero imports, same discipline as
`read-trust.ts`.

### Where the two now agree

- **Item removals reconcile under every group**, not only groups the device
  still holds. stablekraft's `mine` branch now filters against its published
  record. Divergence 1 in boostmebitch's header is stale.
- **A published group keeps its place while any item under it survives.**
  Both guard with `publishedFeeds.has(guid) && survivors.length === 0`.
  Divergence 2 is stale — both do the right thing, for the reason the spec
  gives: the group is the only thing naming its items' parent, so dropping
  one that still carries another app's tracks takes those tracks with it.
- Both keep a private per-device baseline, both refuse to publish on a
  degraded read, both preserve `foreignTags`/`foreignKinds`, and both derive
  the identifier kind from position 1 rather than walking `i`/`k` in pairs.

### Where they still differ

**1. Item order — the convergence bug.** boostmebitch keeps wire order and
appends local-only items: `[...kept, ...mine.itemGuids.filter(...)]`.
stablekraft puts local first: `[...mine.itemGuids, ...group.itemGuids.filter(...)]`.

Imposing local order on every republish means the two apps reorder the event
at each other forever. Each publish is locally reasonable; the only symptom
is that it never stops. Because [tag order is
semantic](../../pc20-favorites.md#grouping-rules), this is not cosmetic
churn — it is a rewrite of the meaningful part of the event, on every cycle.

stablekraft already applies the correct rule to loose nodes, with the
matching comment ("moving it is how two writers end up reordering the event
against each other forever"). It just doesn't apply it to items.

**2. The append pass and resurrection.** boostmebitch filters local groups
absent from the wire against the baseline — `fresh = itemGuids.filter(guid =>
!publishedItems.has(itemId(guid)))` — so an entry another app *removed* is
not re-added. stablekraft's append loop is unconditional:

```js
for (const group of local) {
  if (emitted.has(group.feedGuid)) continue;
  nodes.push({ t: 'group', group });
}
```

An entry this device published, that another writer has since deleted, comes
back on the next cycle. On the device that deleted it, the favorite returns
by itself.

**3. Loose entries can never be unfavorited in stablekraft.** It carries
loose nodes verbatim and never removes them. boostmebitch removes one when
the baseline says this device published it and no longer holds it — checking
*both* halves of the baseline, because a malformed `podcast:guid:` may have
been recorded on the feeds side; which half it landed in is an accident of
history, whether we published it is the question.

**4. The change gate.** boostmebitch's `planFavoritesPublish` compares
`JSON.stringify(tags) === JSON.stringify(input.readTags)` — the merged output
against **the bytes actually read**. That doubles as running the spec's
idempotence vector in production on every cycle. It is a pure function
returning `'degraded' | 'unchanged' | 'nothing-to-create' | 'publish'`, so
the decision is testable without a relay.

stablekraft compares a digest against `localStorage` — against its own last
publish, not against the wire. Its own comments record the bootstrap bug that
caused: on a device whose list already matched, the record was left empty
forever, the digest matched on every load, and the fix for the resurrection
loop could not engage at all.

### What stablekraft does better

**Duplicate groups on the wire.** stablekraft folds the second occurrence's
items into the first. boostmebitch skips it outright — `if
(taken.has(group.feedGuid)) continue;` — which drops that group's items. They
are real favorites and are named nowhere else, so they are lost.

**Staged rollout of destructive operations.** stablekraft gates inbound
deletes behind `SHARED_FAVORITES_APPLY_DELETES`, off by default and log-only,
plus `SHARED_FAVORITES_IMPORT_UNKNOWN` and an allowlist. For an operation
that silently destroys data on someone else's device, shipping it in
observe-only mode first is the right instinct.

### Structural idea worth copying

boostmebitch **exports no "publish my favorites" function at all**.
`syncFavorites` is the only writer and it always reads first;
`scheduleSyncFavorites` is deliberately dropped from the barrel file. A blind
publish is not discouraged, it is unavailable.

Given that a blind publish is [data loss rather than a
conflict](../../pc20-favorites.md), making it unreachable from the module
surface is worth more than any amount of documentation telling callers not to
do it.

## Known gaps

- These two apps still disagree on item order, so the event is being
  rewritten back and forth in production right now. Neither side has adopted
  the other's fix. This is the single highest-value thing to resolve.
- boostmebitch's duplicate-group data loss is unfixed.
- The extracted file is the merge and wire format only. The read/publish
  driver (`favorites.ts`), the cycle serializer (`favorites-sync.ts`) and the
  hydrator are not extracted — they depend on that app's pool and storage.
  Read them in place.
- Neither implementation has been checked against the spec's
  [test vectors](../../pc20-favorites.md#test-vectors) by anything in this
  repo. boostmebitch runs an equivalent of vector 1 implicitly through its
  change gate; that is not the same as running them.
