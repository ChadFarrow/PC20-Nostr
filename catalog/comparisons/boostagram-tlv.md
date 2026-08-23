# Boostagram TLV records (bLIP-10)

Packs boost metadata — podcast, episode, feed GUID, sender, message, amount —
into the TLV records that ride along with a keysend payment. Custom record
`7629169` carries the boostagram JSON; `7629175` carries the Podcast Index
feed GUID.

Also the split arithmetic: given a `<podcast:value>` block's recipients and
their shares, how many sats each one gets.

**Nothing could be extracted for this feature.** That is the finding, not an
oversight - and it is why
[`../recipes/boostagram-keysend/`](../recipes/boostagram-keysend/) is
**authored** rather than extracted. Everything below is what that recipe had to
be written from, and what it is checked against.

## Why nothing could be extracted

One live site implements it: DoerfelVerse, in
`ITDV-Lightning/utils/payment-utils.ts` (231 lines, read at `4bc69b2`). Two
things make it unshippable — TLV construction is module-private, and the app
is hardcoded into the records it builds.

`createBoostTLVRecords` is **private** inside `payment-utils.ts`, so there is
nothing to extract without rewriting it — and rewriting is exactly what this
catalog does not do. Everything here is byte-identical to something running in
production; the moment a file gets reshaped for extraction it stops being the
thing that was tested by real traffic.

## Do not copy ITDV's payment-utils

It has DoerfelVerse compiled into the records it builds:

- `app_name: metadata.appName || 'ITDV App'` at line 45, and `'ITDV App'`
  again at lines 63, 84 and 114
- line 52:
  `feedId: metadata.feedUrl === 'https://www.doerfelverse.com/feeds/bloodshot-lies-album.xml' ? "6590183" : "6590182"`

That last line picks a Podcast Index feed ID by string-comparing against one
album's URL, with a different hardcoded ID as the fallback for **every other
feed in existence**. Copied into another app, it silently attributes every
boost to one of two DoerfelVerse feeds.

## What any replacement has to get right

Recorded because these are the properties that make split arithmetic safe, and
the shipped code does not have them.

**Reject malformed input rather than mis-paying.** A total share of zero makes
`Math.floor(amount * share / 0)` produce `NaN` for every recipient. A negative
share makes the last recipient's `amount - allocated` **over-pay** — with
shares `[-1, 2]`, destination B receives twice the boost. Both values arrive in
a `<podcast:value>` block, which is to say from someone else's feed, which is
to say you do not control them.

**Send the remainder to the last recipient.** Every recipient but the last
gets `floor(amount * share / total)`; integer division otherwise loses sats on
most three-way splits.

**One `boost_uuid` across the splits, a separate `uuid` per payment.** That is
what lets a receiver reassemble the parts of one boost into a single
boostagram rather than showing several unrelated payments.

## What ships now, and what it is worth

[`../recipes/boostagram-keysend/`](../recipes/boostagram-keysend/) carries all
five properties above, plus a decoder. It is authored, so it makes a weaker
promise than every other recipe here: no site is running it. Read its first
paragraph before copying it.

Checked against the failures on this page rather than against a site:

| Property | How it was checked |
|---|---|
| Zero total refused | shares `[0, 0]` throw instead of producing `NaN` |
| Negative share refused | shares `[-1, 2]` throw instead of paying B twice the boost |
| Remainder to the last recipient | 1000, 999, 1, 7 and 33333 sats each split three ways add back up exactly |
| One `boost_uuid`, separate `uuid`s | three payments, one `boost_uuid`, three `uuid`s |
| Nothing branded | `appName` and `feedId` are required parameters with no defaults |

## Known gaps

- **Still nothing extracted.** The recipe closes the feature, not the
  extraction: no live site runs this code, and the branded private
  implementation above is still the only production one.
- **Inbound decoding is now possible but unproven.** The catalog's decoder is
  tested against boostagrams the catalog itself builds. It has not been run
  against records from a wallet in the wild, which is where the spellings
  differ - some wallets hand custom records over base64-encoded, which is
  handled, and no doubt some do something else, which is not.
- **A boostagram verifies nothing and cannot.** It is metadata a stranger
  attached to a payment: the app name, the sender name and the amount in it are
  whatever they typed. Take the amount you were paid from your wallet.
- **No `<podcast:valueTimeSplit>` support**, because no live site here parses
  that tag either, so there was nothing to base it on.
