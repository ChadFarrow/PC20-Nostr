# NWC client (NIP-47)

Talks to a user's wallet over Nostr Wallet Connect: parse the
`nostr+walletconnect://` string, connect to the wallet's relay, and issue
`pay_invoice`, `make_invoice`, `pay_keysend`, `get_balance`, `get_info`,
`lookup_invoice` and `list_transactions` as NIP-47 kind 23194 requests.

Four repos implement the same class with the same method names. All four
files differ. This is the entry where the copies have drifted furthest
without anyone deciding to change anything.

## Where it lives today

| Repo | Path | State | Read at |
|---|---|---|---|
| `lnaddress-music` | `lib/nwc-service.ts` | **canonical**, 603 lines | `c16f68b` |
| `ITDV-Lightning` | `lib/nwc-service.ts` | diverged, 557 lines | `4bc69b2` |
| `NMNU` | `lib/nwc-service.ts` | diverged, 556 lines | `2b9a78f` |
| `TRM-Lightning` | `lib/nwc-service.ts` | diverged, 554 lines | `0a0fff8` |

Four files, four distinct hashes. The same class, the same public methods,
the same NIP-47 kinds, the same Cashu-wallet keysend-skip heuristic — and no
two of them the same bytes.

There is a fifth, unrelated implementation as a React hook in four repos at
`hooks/useNWC.ts`, also four versions. Not covered here.

## The canonical implementation

[`nwc-service.ts`](nwc-service.ts) — one external import, `nostr-tools`.

It wins on the relay keepalive. `startKeepalive()` opens a throwaway
subscription every 30 seconds to keep the WebSocket to the wallet's relay
from going idle, and `stopKeepalive()` clears it on disconnect. The other
three have no equivalent.

What that buys: an NWC relay that drops idle sockets leaves the other three
apps holding a connection that looks live and isn't. The failure surfaces at
the worst moment — the user taps boost, the request goes into a dead socket,
and the payment hangs rather than failing cleanly.

## How each site diverges

Beyond the keepalive the deltas are small and mostly cosmetic — a few
shifted lines, different log strings. All four share:

- the same `detectCashuWallet()` heuristic, which skips keysend on Cashu
  wallets because they can't do it
- the same NIP-47 request/response kinds (23194 / 23195)
- the same `parseConnectionString` shape

Because the differences are small and undocumented, **do not assume a fix in
one is present in the others**. They are close enough to look
interchangeable and different enough that they aren't.

## Known gaps

- The keepalive is the only reason this copy was picked, and it is a
  heuristic, not a fix: a 30-second dummy subscription is a workaround for
  not knowing whether the socket is alive. Nothing here does an actual
  liveness check before sending a payment.
- Nothing distinguishes "the payment definitely failed" from "we don't know".
  `boostmebitch/lib/v4v/nwc.ts` has an explicit `NwcIndeterminateError` for
  exactly that case, plus capability discovery and a lease pool; it is the
  richer implementation but it is coupled to that app and did not pass the
  standalone-compile test. Read it before extending this one.
- If you want a minimal teaching version rather than a production one,
  `is-this-thing-on/src/useNWC.js` is a working NWC React hook in 136 lines.
