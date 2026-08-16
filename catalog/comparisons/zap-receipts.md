# Zap receipts (NIP-57)

Reads kind 9735 zap receipts back off relays and matches them to payments the
app made: parse the receipt's `description` tag into the original kind 9734
zap request, then pull out amount, sender and the event or address zapped.

## Where it lives

| Site | Repo | Path | State | Read at |
|---|---|---|---|---|
| DoerfelVerse | `ITDV-Lightning` | `lib/zap-receipt-service.ts` | **shipped**, 407 lines | `4bc69b2` |
| Project StableKraft | `stablekraft-app` | `lib/nostr/zaps.ts` | **broken — do not use** | `db2eb22f` |

Shipped as
[`../modules/lightning/zap-receipt-service.ts`](../modules/lightning/zap-receipt-service.ts).
One external import, `nostr-tools`.

## StableKraft's version uses the wrong kind numbers

`stablekraft-app/lib/nostr/zaps.ts` signs the zap request as **kind 9735** and
expects the receipt as **kind 9736**. NIP-57 specifies **9734** for the
request and **9735** for the receipt.

The consequence is total rather than partial. `parseZapReceipt` filters for
9736; no relay will ever return one, so it matches nothing, ever. The function
cannot succeed under any input.

Nothing is broken in production today — it has no callers outside worktree
copies, so it is dead code. The hazard is that it is the file anyone wiring up
zaps in that repo would reach for, and its name gives no hint that it is
wrong.

**Fixing it is a change to that repo, which this one does not make.** Recorded
here so the next person to open `zaps.ts` starts with the answer.

## Known gaps

- No test coverage.
- Nothing verifies that a receipt's `bolt11` amount matches the request's
  `amount` tag. `boostmebitch/lib/v4v/zap.ts` does check invoice amount
  against the requested amount before paying, on the sending side; the
  equivalent check on the receiving side is written nowhere.
