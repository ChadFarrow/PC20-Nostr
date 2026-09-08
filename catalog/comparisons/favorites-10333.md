# Kind 10333 favorites

The wire format and merge for [cross-app podcast
favorites](../../pc20-favorites.md). This is the one entry in the catalog
where the spec came first and the code implements it, rather than the other
way round.

Two implementations exist. Nothing else in any repo writes kind 10333.

## Where it lives today

| Repo | Path | Lines | Read at |
|---|---|---|---|
| `boostmebitch` | `lib/nostr/favorites-list.ts` | 2432 | `7503ac5` (2026-09-07) |
| `stablekraft-app` | `lib/nostr/favorites-single-list.ts` + `favorites-privacy.ts` | 1397 + 788 | `fba7681` (2026-09-08) |

Both are `origin/HEAD` as of 2026-09-08. Both carry the `visibility` tag
(PC20-Nostr#30, landed as `boostmebitch@9d55f2a` and `stablekraft-app@4924389`
on 2026-09-02) and the fixes the first conformance run produced
(boostmebitch#294 and stablekraft-app#236, merged 2026-09-03).

**The code moved a long way since this page's previous read.** At
`boostmebitch@76e1fe6` and `stablekraft-app@95d0a2fa` the three files were 1862,
884 and 777 lines. `favorites-list.ts` alone is +633/-63 between `76e1fe6` and
`7503ac5`. Every conclusion below that was drawn at the old SHAs is marked.

Supporting modules — boostmebitch: `favorites.ts`, `favorites-sync.ts`,
`favorites-hydrator.ts`, `read-trust.ts`. stablekraft-app:
`favorites-sync-client.ts`, `pc20-identifiers.ts`, `relay-read.ts`,
`nip44.ts`.

**Neither is "canonical" any more, and this table used to say boostmebitch
was.** That ranking was made when it was 722 lines to stablekraft's 662 and
the format had one half. Both have roughly doubled since, in different
directions and against different pressures, and the ranking did not survive
it. Read whichever answers the question you have, and record the SHA.

### Both have tests, and both now run the spec's

| | Tests covering the format |
|---|---|
| `boostmebitch` | `scripts/check-favsync.mjs` (2762 lines) — `npm run check:favsync`, loading the shipping module under plain Node; every vector replayed against a `naive()` |
| `stablekraft-app` | 2610 lines: `favorites-single-list.test.ts` (1543), `favorites-privacy.test.ts` (1067) |

stablekraft's suite cites this spec's vectors by number and imports nothing
but `node:test` and `node:assert/strict`. It is also, by its own header, where
the vectors came from: *"The spec lists test vectors as an open question;
these are a first set."* (An earlier revision of this page said boostmebitch
had no tests. It had none under `node --test`; it had a check script, and the
page was read too literally.)

**Since 2026-09-02 each app also runs [`../../conformance/`](../../conformance/)
against its own merge** — `npm run check:conformance` in either repo, through a
thin shim (`boostmebitch/scripts/conformance-adapter.mjs`,
`stablekraft-app/lib/nostr/favorites-conformance-adapter.ts`) and the
`PC20_FAVORITES_ADAPTER` hook on `vectors.test.mjs`. Both accept
`PC20_NOSTR_DIR`, so the suite can be pointed at any checkout of this repo. The
first run of each found real defects (below), and four vectors the document
itself had wrong.

## Scored against the current 31, on 2026-09-08

Run today: the vectors at PC20-Nostr `3f44c19` against `boostmebitch@7503ac5`
and `stablekraft-app@fba7681`. **Both score 25 of 31.** Which six differ, and
that is the useful part.

| vector | boostmebitch | stablekraft-app |
|---|---|---|
| 16 — an empty untagged list defaults to public | red | red |
| 18 — band order | **green** | red |
| 25 — feed and item favorites stated separately | red | green |
| 26 — unfavoriting the feed keeps the item | red | red |
| 27 — an entry is carried whole | red | green |
| 28 — an artist entry belongs to no feed | green | red |
| 30 — an empty half is an empty string | red | red |
| 31 — a carried claim retires with its entry | red | red |

Four of those are the spec moving, not the apps breaking:

- **16 is one day old.** Both fail on the same assertion, `an empty untagged
  list defaults to public`. Both still implement the rule it replaced — ask the
  user and publish nothing — which landed in PC20-Nostr#47 today. It fails safe:
  they do nothing where the spec now expects a public publish, on a brand-new
  empty account only.
- **30 and 31 are red in both**, and neither has adopted them yet.
- **18 answers a question this page left open.** boostmebitch bands each
  `medium` run; stablekraft does not. The line below saying it was unverified is
  now resolved.

Two are boostmebitch's own recorded divergences, and its
`scripts/conformance.mjs` header states each by name: 25 fails only its last
assertion, refused by a wholesale-delete guard deliberately stricter than the
suite after an unhydrated store cost a live account 213 groups and 232 items on
2026-08-21; 26 is stage 3 of the feed-guid migration, deliberately unshipped;
27 fails one assertion — that a writer may not claim an entry it carries —
which contradicts the adopt-what-you-render model `adapter.d.ts` documents by
name. That header still says "25 of 28"; the suite is 31 now, so the count is
stale even though all three reasons stand.

**Vector 28 is a question for the spec, not a defect in stablekraft.** It fails
on `favoriting an artist must publish` — the vector hands the adapter a local
artist favorite and requires one. The spec says carrying an artist entry is
mandatory and offering the feature is not, so an app that does not originate
them cannot pass. Either the vector needs a way to opt out of its last part, or
the spec has to say origination is mandatory. It currently says the opposite.

## Read this before comparing the two

**Both apps' source comments about each other went out of date faster than
anyone updated them, and so did the first draft of this page.**

`favorites-list.ts` used to carry a header listing five deliberate divergences
from stablekraft. It was accurate when written; re-read later against
`stablekraft-app@db2eb22f`, two of the five no longer held, because stablekraft
had fixed both. An audit that trusted that header, or that read a stale local
checkout, reported bugs that were fixed upstream.

**That header is gone at `7503ac5`** — the file names StableKraft only where it
records a shared rule or a real event, never as a list of that app's defects.
Deleting it was the right fix and it is the reason this section stays: the
lesson outlived the comment.

This is the concrete reason for the
[read-through-`origin/HEAD` rule](../../CLAUDE.md#read-originhead-never-the-local-checkout).
Two independently-maintained implementations of one spec generate stale
cross-references faster than anyone updates them.

## What ships

[`favorites-list.ts`](../modules/nostr/favorites-list.ts) — zero imports, same discipline as
`read-trust.ts`. Extracted at `76e1fe6`, after boostmebitch#294; before that it
sat at `55a6445`, and before that at `1f26ba0` and 722 lines, which predates
the private half, the `content` carry and the per-half baseline. Anyone who copied it in that window got a file that would
blank another app's private entries.

**The extracted copy still matches `76e1fe6` byte for byte, and its source has
moved on.** `catalog/check-drift.sh` reports `SOURCE MOVED` for it —
`76e1fe6 -> 7503ac5`, +633/-63 — and verifies `modules/nostr/read-trust.ts`
clean at `1f26ba0`. So the file here is a correct snapshot of a version that is
no longer current, and the six red vectors above were scored against `7503ac5`,
not against this copy. Re-extract before quoting it as what the app does today.

**Conformance is not settled by reading either of these.** Run
[`../../conformance/vectors.test.mjs`](../../conformance/vectors.test.mjs)
against your own code instead.

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
- **Since 2026-09-03, the four things below marked FIXED.** They were the
  divergences the first conformance run found, and each app's fix merged the
  next day. Kept here in the past tense because the comparison is the
  record of why the rules are worded as they are.

### Where they still differ

**1. Item order — the convergence bug. FIXED in stablekraft-app#236.** Before
it, boostmebitch keeps wire order and appends local-only items:
`[...kept, ...mine.itemGuids.filter(...)]`. stablekraft puts local first:
`[...mine.itemGuids, ...group.itemGuids.filter(...)]`.

Imposing local order on every republish means the two apps reorder the event
at each other forever. Each publish is locally reasonable; the only symptom
is that it never stops. At the time it was worse than churn: tag order was
semantic — it carried which feed an item belonged to — so each cycle rewrote
the meaningful part of the event.

Both apps keep one order now. Two things changed under them since: an entry
names its own feed, so order carries no meaning left to corrupt; and the spec
prescribes the order rather than asking each writer to preserve what it read —
[Tag order](../../pc20-favorites.md#tag-order), four bands per `medium` run.
**Measured 2026-09-08: boostmebitch emits the bands and passes vector 18;
stablekraft does not.**

**2. The append pass and resurrection. FIXED in stablekraft-app#236.** boostmebitch
filters local groups absent from the wire against the baseline — `fresh =
itemGuids.filter(guid => !publishedItems.has(itemId(guid)))` — so an entry
another app *removed* is not re-added. stablekraft's append loop at
`4924389` was unconditional:

```js
for (const group of local) {
  if (emitted.has(group.feedGuid)) continue;
  nodes.push({ t: 'group', group });
}
```

An entry this device published, that another writer has since deleted, comes
back on the next cycle. On the device that deleted it, the favorite returns
by itself. Vector 9 caught it on the first conformance run; stablekraft-app#236 fixed
it.

**2b. A public writer over a private half it cannot open. FIXED in
stablekraft-app#236.** stablekraft refused EVERY publish when `content` held bytes its
signer could not decrypt, mode regardless. On a list that does not say
private that strands every favorite a NIP-55 user makes there the moment any
other app writes a private half. boostmebitch refuses only a publish that
would have to change `content`. Vector 12; #236 carries the bytes and writes the
public half.

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

**Duplicate groups on the wire. FIXED in boostmebitch#294.** stablekraft folds
the second occurrence's items into the first. boostmebitch at `545c5ca` skipped
it outright — `if (taken.has(group.feedGuid)) continue;` — which drops that
group's items. They are real favorites and are named nowhere else, so they
are lost. Vector 19; #294 folds them, in wire order.

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

### One difference the vectors had to learn to hold

**What "local" means after a cycle.** stablekraft's local state is a database
the merge never writes; its inbound reconcile adds what it can resolve and
nothing else, so a foreign entry is carried and never held. boostmebitch's
local state is a cache of the merge: the hydrator paints the active half
whole, so an entry adopted off the relay is held from then on, claimed in the
baseline, and removed by that device only if the user unfavorites it there.
Both conform — neither adopts out of the INACTIVE half beyond its baseline —
but a multi-cycle vector that feeds the same `local` into cycle two is
testing a state boostmebitch can never be in. The contract gained `holds` for
it (`conformance/adapter.d.ts`), and vectors 13 and 14 feed it back.

## Known gaps

- The extracted file is the merge and wire format only. The read/publish
  driver (`favorites.ts`), the cycle serializer (`favorites-sync.ts`) and the
  hydrator are not extracted — they depend on that app's pool and storage.
  Read them in place.
- `check:conformance` in each app needs a checkout of this repo —
  `../PC20-Nostr` beside it, or `PC20_NOSTR_DIR`. Neither app's CI has that, so it runs by hand,
  which is one step better than the vectors being prose and one step short of
  being a gate. It is also why both apps sat at 25/31 without anything going
  red on them: nothing runs the current vectors on a push.
- The scores above were produced from shallow clones in a sandbox. To reproduce
  them: clone each repo, then
  `PC20_NOSTR_DIR=<this repo> npm run check:conformance`. stablekraft needs
  `tsx`, so its dependencies have to be installed first.
