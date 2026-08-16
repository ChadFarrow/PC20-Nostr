# NWC client (NIP-47)

Talks to a user's wallet over Nostr Wallet Connect: parse the
`nostr+walletconnect://` string, connect to the wallet's relay, and issue
`pay_invoice`, `make_invoice`, `pay_keysend`, `get_balance`, `get_info`,
`lookup_invoice` and `list_transactions` as NIP-47 kind 23194 requests.

Four repos, four distinct files, one identical public API.

## Where it lives today

| Repo | Path | Lines | Read at |
|---|---|---|---|
| `ITDV-Lightning` | `lib/nwc-service.ts` | **shipped**, 557 | `4bc69b2` |
| `NMNU` *(test site)* | `lib/nwc-service.ts` | 556 | `2b9a78f` |
| `TRM-Lightning` *(test site)* | `lib/nwc-service.ts` | 554 | `0a0fff8` |
| `lnaddress-music` *(test site)* | `lib/nwc-service.ts` | 603 | `c16f68b` |

There is a fifth, unrelated implementation as a React hook at
`hooks/useNWC.ts` in the same four repos, also four versions. Not covered
here.

## What ships

[`../modules/lightning/nwc-service.ts`](../modules/lightning/nwc-service.ts)
— ITDV-Lightning's version. One external import, `nostr-tools`.

DoerfelVerse is the production site; the other three are test deployments.

## How much of the divergence is real

Measured on comment- and logging-stripped source, the four copies are
**91–92% identical**. The public API is the same in all four — same exports,
same order, same names, nothing present in one and missing from another:
`NWCConnection`, `PaymentRequest`, `PaymentResponse`, `BalanceResponse`,
`class NWCService`, `getNWCService()`.

Three differences account for nearly all of it, and only one is a design
decision:

1. **A storage shim.** ITDV imports `safeLocalStorage` from
   `@/lib/safe-storage`; the others inline `typeof window !== 'undefined'`
   guards. Same key (`nwc_connection_string`), same value, same guard —
   effectively cosmetic.
2. **`subscribeMany` filter arity.** One copy passes an array of filters,
   the others a bare object. This is **not a design choice** — it tracks
   locked `nostr-tools` versions (ITDV 2.16.2, TRM 2.19.3, lnaddress 2.23.9).
   Dependency skew wearing the costume of divergence.
3. **A relay keepalive**, in `lnaddress-music` only. See below.

All four share the same `detectCashuWallet()` heuristic — skip keysend on
Cashu wallets, which cannot do it — and the same NIP-47 kinds, 23194/23195.

## What the shipped copy is missing

`lnaddress-music` adds `startKeepalive()` / `stopKeepalive()`: a throwaway
subscription every 30 seconds, wired at connect and torn down at disconnect,
to stop the socket to the wallet's relay going idle.

Without it, a relay that drops idle connections leaves the app holding a
socket that looks live and is not. The failure lands at the worst possible
moment — the user taps boost, the request goes into a dead socket, and the
payment hangs instead of failing cleanly.

**Known gap.** The fix is 30 lines and additive, but it is in a test repo.

Worth noting the keepalive is itself a workaround: a periodic dummy
subscription substitutes for not knowing whether the socket is alive. Nothing
in any copy does a real liveness check before spending.

## Do not assume a fix in one is in the others

The copies are close enough to look interchangeable and different enough that
they are not. A patch to one has never propagated.

## Known gaps

- The keepalive, as above.
- **Nothing distinguishes "the payment definitely failed" from "we don't
  know."** `boostmebitch/lib/v4v/nwc.ts` has an explicit
  `NwcIndeterminateError` for exactly that, plus capability discovery and a
  lease pool. It is the richer implementation and it is from a production
  site — but it is coupled to that app and does not pass the
  standalone-compile test, so it is cited rather than shipped. Read it before
  extending this one.
- The `nostr-tools` version spread across these repos is wide enough that a
  shared copy would need a pinned peer version.
