# Modules

Shared source used across features, extracted the same way as
[`../recipes/`](../recipes/): byte-identical to what runs in production, with
provenance in [`../PROVENANCE.tsv`](../PROVENANCE.tsv).

These are ingredients rather than installable features. A recipe tells you
where files go and what to rename; a module is just the file. If you want a
whole working feature, start at [`../recipes/`](../recipes/).

Each module's trade-offs — which copy won, and what the shipped copy is
missing — are in [`../comparisons/`](../comparisons/).

> **Read this before using the Lightning modules.** A security review of this
> repo found three issues in them, one of which lets a hostile Lightning
> address charge an arbitrary amount: the returned invoice is never decoded,
> and the wallet pays what the invoice says. `verifyZapReceipt` also verifies
> nothing, and wallet secret material reaches the console. Exploit paths and a
> paste-ready fix:
> [`../comparisons/lightning-payment-safety.md`](../comparisons/lightning-payment-safety.md).
>
> **These files still have all of it, on purpose.** A module is evidence about
> what a live site runs, so patching it here would destroy the thing it is for.
> If you want working code rather than evidence, take
> [`../recipes/lightning-wallet-payments/`](../recipes/lightning-wallet-payments/)
> instead - same three files, with the issues fixed and each fix named.
>
> Version drift and advisories across the sites these came from:
> [`../comparisons/dependency-drift.md`](../comparisons/dependency-drift.md).

## What's here

| Module | Lines | External imports | From |
|---|---|---|---|
| `lightning/webln-service.ts` | 177 | **none** | ITDV-Lightning |
| `lightning/lnurl-service.ts` | 233 | `bech32` | ITDV-Lightning |
| `lightning/nwc-service.ts` | 557 | `nostr-tools`, **and `@/lib/safe-storage`** | ITDV-Lightning |
| `lightning/zap-receipt-service.ts` | 407 | `nostr-tools` | ITDV-Lightning |
| `nostr/read-trust.ts` | 124 | **none** | boostmebitch |
| `nostr/favorites-list.ts` | 722 | **none** | boostmebitch |
| `rss-pc20/podcast-index-auth.ts` | 22 | `node:crypto` | MSP-2.0 |

Six of the seven typecheck under `strict` with only those packages present.

> **Correction.** This page previously said all seven did, and listed
> `nwc-service.ts`'s external imports as `nostr-tools` alone. Line 10 of that
> file is `import { safeLocalStorage } from '@/lib/safe-storage'`, so it does
> not compile on its own - it needs a file this directory does not ship.
>
> That is the difference between a module and a recipe, and it is why
> [`../recipes/lightning-wallet-payments/`](../recipes/lightning-wallet-payments/)
> ships `safe-storage.ts` alongside it. `check-recipes.sh` step 4 enforces the
> rule for recipes; nothing enforced it here, which is how the claim stayed
> wrong.

## `nostr-tools` must be pinned to 2.16.x

`nwc-service.ts` calls `subscribeMany(relays, [filter], params)` with the
filter in an **array**. That signature exists only in `nostr-tools` 2.16.x.
From the published typings:

```
2.16.2  subscribeMany(relays: string[], filters: Filter[], params)
2.17.0  subscribeMany(relays: string[], filter: Filter,    params)   <- breaks here
2.24.2  subscribeMany(relays: string[], filter: Filter,    params)
```

so the file stops compiling from **2.17.0 onward**:

```
error TS2345: Argument of type '{ kinds: number[]; ... }[]'
  is not assignable to parameter of type 'Filter'.
```

Verified: **0 errors on 2.16.2, 1 error on 2.24.2.**

> An earlier version of this page said the break was at 2.19. It is 2.17.0 —
> the usable range is one minor wide, not three. Corrected after checking the
> typings for each release rather than inferring from the versions in use.

`ITDV-Lightning` declares `"nostr-tools": "^2.16.2"`. That caret range permits
every release from 2.17.0 to 2.24.2, **all of which break it**, so a fresh
`npm install` there resolves to a version its own source cannot compile
against. It works today only because the lockfile pins 2.16.2. Anyone copying
this module without a lockfile hits the error immediately and concludes the
extraction is broken.

Worse than a typecheck failure: in 2.24.2 `subscribeMany` forwards its second
argument straight to `subscribe`, so an array passed there becomes a malformed
`REQ` and the subscription silently never fires.

Either pin `nostr-tools` to `2.16.2` exactly, or change the call to pass a
bare filter object — see
[`../comparisons/dependency-drift.md`](../comparisons/dependency-drift.md) for
both blocking call sites in the site itself.

`zap-receipt-service.ts` also imports `nostr-tools` but does not use
`subscribeMany`, so it is unaffected.

## What is deliberately missing

No split/TLV module, because there is still nothing to extract: the only
live-site implementation keeps its TLV construction private and hardcodes an
app name and two Podcast Index feed IDs. The feature now exists in the catalog
as [`../recipes/boostagram-keysend/`](../recipes/boostagram-keysend/), which is
**authored** rather than extracted and so does not belong in this directory.
See [`../comparisons/boostagram-tlv.md`](../comparisons/boostagram-tlv.md).

`lnurl-service.ts` has no LUD-12 comment negotiation: it appends `?comment=`
with no check that the endpoint accepts comments and no length check, so an
endpoint advertising `commentAllowed: 0` can reject the whole callback and the
payment fails with nothing on screen explaining why.

`nwc-service.ts` has no relay keepalive, so a wallet relay that drops idle
sockets leaves the app holding a connection that looks live and is not — which
surfaces as a payment that hangs rather than failing cleanly.

Both are real limitations of the shipped code, not oversights in the
extraction.

## Checking these

```bash
../check-drift.sh    # still byte-identical to the recorded commit?
```
