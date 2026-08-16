# Trustworthy relay read

Decides whether the **absence** of a result from a relay query can be
believed. Getting this wrong is how a replaceable event gets replaced with
nothing.

This is the entry that matters most for [the favorites
spec](../../pc20-favorites.md). Rule 1 of
[Merging](../../pc20-favorites.md#merging) — never publish on a read you
don't trust — needs a definition of "trust", and this is it.

## Where it lives today

| Repo | Path | State | Read at |
|---|---|---|---|
| `boostmebitch` | `lib/nostr/read-trust.ts` | **canonical**, 124 lines | `1f26ba0` |
| `stablekraft-app` | `lib/nostr/relay-read.ts` | diverged, see below | `db2eb22f` |

Two implementations, same reasoning, different code. Both cite the same two
measured failures.

## What ships

[`read-trust.ts`](../modules/nostr/read-trust.ts) — **zero imports**, and deliberately so. A
plain-Node check script in that repo loads the module directly to pin the
shipping rule, and any import at all — even a type-only one — would break
that. A reimplemented copy in the check script would stay green while the
real rule drifted, which is the failure being guarded.

The rule:

```
trustworthy = event_in_hand or (reached > 0 and answered >= reached)
```

Both halves are load-bearing, and the naive version gets the second one
backwards:

**`reached > 0`.** In nostr-tools a failed connection calls `handleClose(i)`,
which calls `handleEose(i)`. So with nothing reachable, the aggregate EOSE
fires immediately and vacuously — **measured at 19 ms with no network at
all**. "Every reachable relay confirmed none" is trivially true when the
reachable set is empty, so being offline reads as a cleared library. In
boostmebitch that meant an offline hydrate took the `'ok'` branch and
replaced the store with the empty result.

**Never-connected relays are excluded from `reached`, not counted as
answers.** Requiring every *listed* relay to answer means one permanently
dead entry in a default relay list leaves every read degraded forever — and
dead entries in default lists are common and long-lived, precisely because
nothing surfaces them. A relay that connects and then hangs is a different
thing: a genuine unknown, still counted in `reached`, correctly degrading the
read.

`>=` rather than `===` so a miscount fails open on the arithmetic instead of
wedging every read of the session at degraded.

It also exports `acceptsEvent()`, an intake predicate applied **before** the
`created_at` comparison. A foreign event with a newer timestamp otherwise
takes the `latest` slot on its timestamp and discarding it afterwards throws
away the real event it displaced — turning a good read into an empty one,
which is the exact state this module exists to keep separate from a real
absence.

### The synthetic EOSE

nostr-tools fakes an EOSE on a timer when a relay never sends one
(`baseEoseTimeout` = 4400 ms), and there is no way to tell it from a real one
at the callback — it is the same function either way. So the only defence is
to ensure it cannot fire inside the window you are counting in.

The file's own header records that this is currently **not** true everywhere
in boostmebitch: `FEED_QUERY_MAX_WAIT_MS` is 8000 and loses the race to 4400,
"which is why `collectEventsByAuthors` has been reporting synthetic EOSEs as
real ones". The margin is kept small on purpose, because
`Subscription.close()` does not clear `eoseTimeoutHandle` — only
`receivedEose()` does — so the timer outlives the subscription.

## How stablekraft-app diverges

`lib/nostr/relay-read.ts` reaches the same formula but differs three ways:

1. **`===` instead of `>=`.** Strictly worse for the reason above: a miscount
   wedges every read at degraded rather than failing open.
2. **The decision is welded to the subscription loop.** There is no pure
   predicate to test or to pin from a script.
3. **Intake filters on author only.** `preferAuthoredEvent` checks
   `candidate.pubkey !== pubkey` and nothing else — no kind check, no `d`-tag
   check.

That third one has a concrete consequence for kind 10333. The favorites event
is plain-replaceable and carries no `d` tag, so an *addressable* event that
happens to share kind 10333 — which is possible precisely because the kind is
[self-assigned, not NIP-allocated](../../pc20-favorites.md#core-architecture)
— passes stablekraft's intake and can be laundered into the user's favorites.
boostmebitch passes `dTag: ''` explicitly, and `''` matches an absent `d`.

## Known gaps

- The 8000 ms feed-query window in boostmebitch is a known live bug, recorded
  in the file and not yet fixed. The extracted copy documents it; it does not
  cure it.
- Neither implementation distinguishes a relay that returned an error from
  one that returned nothing. Both count as "did not answer".
- `stablekraft-app` has a test for its version (`relay-read.test.ts`);
  boostmebitch pins its rule with `scripts/check-readtrust.mjs`. Neither
  tests the other's edge cases.
