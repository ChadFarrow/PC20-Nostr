# Boostagram TLV records (bLIP-10)

Packs boost metadata — podcast, episode, feed GUID, sender, message, amount —
into the TLV records that ride along with a keysend payment. Custom record
`7629169` carries the boostagram JSON; `7629175` carries the Podcast Index
feed GUID.

Also the split arithmetic: given a `<podcast:value>` block's recipients and
their shares, how many sats each one gets.

**Nothing ships for this feature.** That is the finding, not an oversight.

## Why nothing ships

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

## Known gaps

- **No split/TLV code ships at all**, so no recipe can offer boosting.
- The only production implementation is branded and private.
- **No site can read an inbound boostagram it did not send.** Every
  implementation here is an encoder; nothing on the decoding side exists in
  any of these codebases.
