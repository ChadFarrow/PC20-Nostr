# Modules

Shared source used across features, extracted the same way as
[`../recipes/`](../recipes/): byte-identical to what runs in production, with
provenance in [`../PROVENANCE.tsv`](../PROVENANCE.tsv).

These are ingredients rather than installable features. A recipe tells you
where files go and what to rename; a module is just the file. If you want a
whole working feature, start at [`../recipes/`](../recipes/).

Each module's trade-offs — which copy won, and what the shipped copy is
missing — are in [`../comparisons/`](../comparisons/).

## What's here

| Module | Lines | External imports | From |
|---|---|---|---|
| `lightning/webln-service.ts` | 177 | **none** | ITDV-Lightning |
| `lightning/lnurl-service.ts` | 233 | `bech32` | ITDV-Lightning |
| `lightning/nwc-service.ts` | 557 | `nostr-tools` | ITDV-Lightning |
| `lightning/zap-receipt-service.ts` | 407 | `nostr-tools` | ITDV-Lightning |
| `nostr/read-trust.ts` | 124 | **none** | boostmebitch |
| `nostr/favorites-list.ts` | 722 | **none** | boostmebitch |
| `rss-pc20/podcast-index-auth.ts` | 22 | `node:crypto` | MSP-2.0 |

All seven typecheck under `strict` with only those packages present.

## `nostr-tools` must be pinned below 2.19

`nwc-service.ts` calls `subscribeMany(relays, [filter], params)` with the
filter in an **array**. That signature is `nostr-tools` 2.16.x. From 2.19 the
parameter is a single `Filter`, and the file stops compiling:

```
error TS2345: Argument of type '{ kinds: number[]; ... }[]'
  is not assignable to parameter of type 'Filter'.
```

Verified: **0 errors on 2.16.2, 1 error on 2.24.2.**

`ITDV-Lightning` declares `"nostr-tools": "^2.16.2"`. That caret range permits
2.24.2, so a fresh `npm install` there can resolve to a version its own source
does not compile against — it works today only because the lockfile pins
2.16.2. Anyone copying this module without a lockfile will hit the error
immediately and think the extraction is broken.

Either pin `nostr-tools` to `~2.16.2`, or change the call to pass a bare
filter object. The same call appears with **both** arities across the fork
family, tracking each repo's locked version rather than anyone's intent —
which is why this reads as divergence and is really dependency skew.

`zap-receipt-service.ts` also imports `nostr-tools` but does not use
`subscribeMany`, so it is unaffected.

## What is deliberately missing

No split/TLV module. The safest implementation is a third-party fork and the
only production copy hardcodes an app name and two Podcast Index feed IDs; see
[`../comparisons/boostagram-tlv.md`](../comparisons/boostagram-tlv.md).

`lnurl-service.ts` has no LUD-12 comment negotiation and `nwc-service.ts` has
no relay keepalive. Both gaps are real, both fixes exist — in test-site repos
whose code is not shipped. The comparisons say what each one costs.

## Checking these

```bash
../check-drift.sh    # still byte-identical to the recorded commit?
```
