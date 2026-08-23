# Boostagram over keysend (bLIP-10)

**This code has never run in production.** Every other recipe in this catalog
ships what a live site is serving right now. This one cannot, and you should
know that before you copy it.

The reason is written up in
[`../../comparisons/boostagram-tlv.md`](../../comparisons/boostagram-tlv.md):
one live site implements boostagrams, its TLV construction is private to its
own module, and its own app name and two Podcast Index feed IDs are compiled
into the records it builds. Copied unchanged into another app it attributes
every boost to somebody else's show. There was nothing to extract, so this was
written from the requirements that page records instead.

What you get for that trade: the split arithmetic and the record format, with
both documented failure modes designed out, plus a decoder that no codebase in
this catalog has.

## What it does

Take a boost, a `<podcast:value>` block, and what is playing. Get back the
keysend payments to send.

```ts
import { splitBoost } from '@/lib/boost-splits';
import { buildKeysendPayments } from '@/lib/boostagram-tlv';
import { getNWCService } from '@/lib/nwc-service';

const allocations = splitBoost(1000, valueBlock.recipients);   // sats

const { payments, lnAddressRecipients } = buildKeysendPayments(allocations, {
  appName: 'Your App',          // required - no default, see below
  feedId: feed.podcastIndexId,  // required - no default, see below
  feedGuid: feed.guid,
  podcast: feed.title,
  episode: episode.title,
  senderName: 'listener',
  message: 'great episode',
  ts: Math.floor(player.currentTime),
});

const nwc = getNWCService();
for (const p of payments) {
  await nwc.payKeysend(p.destination, p.sats, p.tlvRecords);
}
```

`payKeysend` comes from
[`../lightning-wallet-payments/`](../lightning-wallet-payments/). This recipe
builds what rides along with a payment; it does not send one. Install that one
too.

`lnAddressRecipients` is the recipients in the same value block who cannot take
a keysend. They are returned rather than dropped, because a value block mixing
node pubkeys and Lightning addresses is normal and silently skipping half of it
underpays people. Send those through `payLightningAddress`.

## Install

```bash
# no packages
```

| From | To |
|---|---|
| `files/boost-splits.ts` | `lib/boost-splits.ts` |
| `files/boostagram-tlv.ts` | `lib/boostagram-tlv.ts` |
| `files/boostagram-parse.ts` | `lib/boostagram-parse.ts` |

Nothing to rename — but two things you must **pass**, see below.

## `appName` and `feedId` are required on purpose

They have no defaults, and a call without them throws.

This is the whole reason the production implementation could not be shipped.
It has `app_name: metadata.appName || 'ITDV App'`, so a caller who forgets
sends somebody else's app name to every recipient. And it picks the Podcast
Index feed ID by string-comparing against one album's URL, with a different
hardcoded ID as the fallback for **every other feed in existence**.

A required parameter cannot be forgotten. A default can.

## The two ways split arithmetic goes wrong

Both values come out of a `<podcast:value>` block, which is to say out of
someone else's RSS feed, which is to say you do not control them. `splitBoost`
throws on both rather than paying.

- **A total share of zero.** `floor(amount * share / 0)` is `NaN`, for every
  recipient, and a `NaN` amount reaches a wallet as garbage.
- **A negative share.** With shares `[-1, 2]`, a naive `amount - allocated`
  remainder pays destination B **twice the boost**.

And the one that is not an error, just a leak: every recipient but the last
gets `floor(amount * share / total)`, so the last one takes the remainder.
Without that, integer division loses sats on most three-way splits.

Verified: `1000`, `999`, `1`, `7` and `33333` sats each split three ways add
back up to exactly what went in.

## One `boost_uuid`, a separate `uuid` per payment

A three-way split is three payments. They carry one shared `boost_uuid` and a
fresh `uuid` each. That pair is what lets a receiver reassemble the parts into
a single boostagram rather than showing three unrelated payments — which is
what `groupByBoost` in the parser does.

`value_msat` is this recipient's slice; `value_msat_total` is the whole boost.
Both are sent, because a receiver showing "1000 sats" when it was handed one
300-sat slice is reading the wrong field.

## The records

| Record | Carries |
|---|---|
| `7629169` | the boostagram, as UTF-8 JSON |
| `7629175` | the Podcast Index feed GUID, as UTF-8 text |

## Reading inbound boostagrams

`boostagram-parse.ts` has no counterpart in any codebase this catalog was built
from — every implementation there is an encoder. If you want to show a creator
what they were sent, this is the missing side.

```ts
import { parseBoostagram, groupByBoost } from '@/lib/boostagram-parse';

const parsed = incoming.map((tx) => parseBoostagram(tx.customRecords))
                       .filter((b) => b !== null);

for (const [, parts] of groupByBoost(parsed)) {
  // parts are the splits of one boost
}
```

**Nothing in a boostagram is verified, and nothing can be.** It is metadata a
stranger attached to a payment: the app name, the sender name and the amount in
it are all whatever they typed. Take the amount you were actually paid from
your wallet, never from `value_msat`.

The parser is written accordingly — a malformed record returns `null` instead
of throwing into whatever loop is draining your wallet history, and every
number read out of one is checked with `Number.isFinite` before use, because
`parseInt` on a non-numeric value yields `NaN` and one `NaN` poisons any total
computed by summing boosts.
