# LNURL-pay and Lightning Address

Turns a Lightning Address (`name@domain`) or a bech32 `lnurl1…` string into a
payable bolt11 invoice: decode, fetch the endpoint's metadata, check the
amount is in range, call back for the invoice.

Four repos implement it. Three ship identical bytes; the fourth is a genuine
superset and is the one to take.

## Where it lives today

| Repo | Path | State | Read at |
|---|---|---|---|
| `lnaddress-music` | `lib/lnurl-service.ts` | **canonical**, 279 lines | `c16f68b` |
| `ITDV-Lightning` | `lib/lnurl-service.ts` | diverged — 233 lines, md5 `2b60ac00` | `4bc69b2` |
| `NMNU` | `lib/lnurl-service.ts` | identical to ITDV, md5 `2b60ac00` | `2b9a78f` |
| `TRM-Lightning` | `lib/lnurl-service.ts` | identical to ITDV, md5 `2b60ac00` | `0a0fff8` |

## The canonical implementation

[`lnurl-service.ts`](lnurl-service.ts) — one external import, `bech32`.

It wins on LUD-12, the comment extension. The other three know nothing about
it; this one reads `commentAllowed` off the endpoint metadata and negotiates
against it in two different modes:

- **Strict, for zaps** (`requestInvoiceWithZap`): throws if a comment was
  supplied and the endpoint advertises `commentAllowed: 0`, and throws if the
  comment is longer than the limit. A zap carries a signed request; silently
  changing what it says is worse than refusing.
- **Graceful, for plain payments** (the boost path): if the endpoint takes no
  comments the comment is dropped with a warning; if it is too long it is
  truncated to `commentAllowed`. The payment still goes through. Losing a
  boost message is bad, failing to pay the artist because of one is worse.

It also exposes `getCommentInfo()` so the UI can size or hide a comment box
before the user types into it, and it parses `allowsNostr` / `nostrPubkey`,
which is what lets a caller decide between a real zap and a plain boostagram
*before* spending.

## How each site diverges

**`ITDV-Lightning`, `NMNU` and `TRM-Lightning` set `?comment=` blind.** They
append the comment to the callback URL with no check that the endpoint
accepts one and no check on its length.

What that costs: an endpoint that advertises `commentAllowed: 0` is within
its rights to reject the whole callback, so the invoice request fails and the
boost doesn't send — for a reason that appears nowhere in the UI. An endpoint
with a limit of, say, 140 either truncates silently or 400s. Both failure
modes look like "boosts randomly don't work on some artists".

That these three are byte-identical is worth noting on its own: they are not
three independent bugs, they are one bug that got copied twice.

## Known gaps

- The canonical copy logs a lot at `console.log`/`console.warn`, including
  the full callback URL and the comment text. Fine in a browser app you own,
  worth thinking about before it runs anywhere the console is collected.
- No test coverage in any of the four repos. The best-tested LNURL code in
  the set is `libre-listener-wallet-monorepo`'s
  `packages/libre-listener-wallet/src/lnurl-client.ts` — 44 lines, injectable
  `fetchImpl`, with unit tests. It resolves an address to an invoice and does
  nothing else. If you want the *tested* one rather than the *complete* one,
  that is where it is.
- `stablekraft-app` resolves Lightning addresses somewhere in `lib/v4v-resolver.ts`
  rather than in a dedicated LNURL module. Not compared here.
