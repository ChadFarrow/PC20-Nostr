# Zap receipts (NIP-57)

Reads kind 9735 zap receipts back off relays and matches them to payments the
app made: parse the receipt's `description` tag back into the original kind
9734 zap request, pull out amount, sender and the event or address zapped.

Like the WebLN client, four repos ship the same bytes.

## Where it lives today

| Repo | Path | State | Read at |
|---|---|---|---|
| `ITDV-Lightning` | `lib/zap-receipt-service.ts` | **canonical** (arbitrary — all four identical) | `4bc69b2` |
| `NMNU` | `lib/zap-receipt-service.ts` | identical copy, md5 `6e0d7662` | `2b9a78f` |
| `TRM-Lightning` | `lib/zap-receipt-service.ts` | identical copy, md5 `6e0d7662` | `0a0fff8` |
| `lnaddress-music` | `lib/zap-receipt-service.ts` | identical copy, md5 `6e0d7662` | `c16f68b` |

All four are md5 `6e0d7662bf7119a13e4933210f3c2dc8`, 407 lines, verified at
`origin/HEAD`.

## The canonical implementation

[`zap-receipt-service.ts`](zap-receipt-service.ts) — one external import,
`nostr-tools`.

## How each site diverges

They don't.

## Do not take stablekraft-app's

`stablekraft-app/lib/nostr/zaps.ts` implements the same feature with the
**wrong kind numbers**. It signs the zap request as kind 9735 and expects the
receipt as kind 9736. NIP-57 specifies 9734 for the request and 9735 for the
receipt.

The consequence is total rather than partial: `parseZapReceipt` filters for
9736, no relay will ever return one, so it matches nothing, ever. The
function cannot succeed.

It has no callers outside worktree copies — it is dead code — so nothing is
broken in production today. The same file with the same bug is in
`StableKraft-Nostr-Fix`, which inherited it. Anyone wiring up zaps in
stablekraft-app by reaching for the file already named `zaps.ts` will adopt
the bug.

The correct server-side counterpart, if you need to *issue* receipts rather
than read them, is `Helipad-to-Nostr-BoostBot/lib/nostr-bot.ts` — it signs
the 9734, builds the 9735 with the serialized request in `description`, and
publishes both alongside a kind 1.

## Known gaps

- Untested in all four repos.
- Nothing here verifies that the receipt's `bolt11` amount matches the
  request's `amount` tag. `boostmebitch/lib/v4v/zap.ts` does check invoice
  amount against the requested amount before paying, on the sending side.
  Doing the same on the receiving side has not been written anywhere.
