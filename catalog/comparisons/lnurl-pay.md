# LNURL-pay and Lightning Address

Turns a Lightning Address (`name@domain`) or a bech32 `lnurl1…` string into a
payable bolt11 invoice: decode, fetch the endpoint's metadata, check the
amount is in range, call back for the invoice.

Four repos implement it. Three ship identical bytes. The fourth is a genuine
superset — and is a test site, so it is not what gets shipped.

## Where it lives today

| Repo | Path | State | Read at |
|---|---|---|---|
| `ITDV-Lightning` | `lib/lnurl-service.ts` | **shipped**, 233 lines, md5 `2b60ac00` | `4bc69b2` |
| `NMNU` *(test site)* | `lib/lnurl-service.ts` | identical to ITDV | `2b9a78f` |
| `TRM-Lightning` *(test site)* | `lib/lnurl-service.ts` | identical to ITDV | `0a0fff8` |
| `lnaddress-music` *(test site)* | `lib/lnurl-service.ts` | superset, 279 lines | `c16f68b` |

The first three are the same git blob, `5099ea73`.

## What ships, and why it is not the best copy

[`../modules/lightning/lnurl-service.ts`](../modules/lightning/lnurl-service.ts)
— ITDV-Lightning's version. One external import, `bech32`.

It is chosen because **DoerfelVerse is a production site and the other three
repos are test deployments.** Recipes ship code that real users have
exercised; that rule outranks feature completeness, and here it costs
something real.

## What the shipped copy is missing

`lnaddress-music`'s copy is a strict superset — additive only, no signature
changed — and implements **LUD-12 comment negotiation**, which the shipped
one does not:

- It reads `commentAllowed` from the endpoint metadata and negotiates two
  ways: **throwing** for zaps (a zap carries a signed request, so silently
  altering what it says is worse than refusing) and **truncating** for plain
  boosts (losing a boost message is bad; failing to pay the artist over one
  is worse).
- It exposes `getCommentInfo()` so a UI can size or hide the comment box
  before the user types.
- It parses `allowsNostr` / `nostrPubkey`, letting a caller choose between a
  real zap and a plain boostagram *before* spending.

The shipped copy appends `?comment=` blind, with no check that the endpoint
accepts comments and no length check. An endpoint advertising
`commentAllowed: 0` may reject the whole callback, so the invoice request
fails and the boost never sends — with nothing on screen explaining why. An
endpoint with a limit either truncates silently or returns a 400. Both look
like "boosts randomly don't work for some artists".

**This is a known gap, not a decision that the shipped behaviour is correct.**
The fix exists and is proven; it is sitting in a test repo.

That three production-adjacent copies are byte-identical is worth stating on
its own: this is not three independent oversights, it is one oversight
propagated twice by forking.

## Known gaps

- LUD-12, as above.
- No test coverage in any copy.
- The shipped copy logs the full callback URL and comment text at
  `console.log`. Harmless in a browser you own; think before it runs anywhere
  the console is collected.
- `stablekraft-app` resolves Lightning addresses inside `lib/v4v-resolver.ts`
  rather than a dedicated LNURL module. Not compared here.
