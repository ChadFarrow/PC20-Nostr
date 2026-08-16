# Boostagram TLV records (bLIP-10)

Packs boost metadata — podcast, episode, feed GUID, sender, message, amount —
into the TLV records that ride along with a keysend payment. Custom record
`7629169` carries the boostagram JSON; `7629175` carries the Podcast Index
feed GUID.

Also the split arithmetic: given a `<podcast:value>` block's recipients and
their shares, how many sats each one gets.

Every Lightning site has a version of this. They are genuinely different, and
one of them will pay the wrong person if a feed is malformed.

## Where it lives today

| Repo | Path | State | Read at |
|---|---|---|---|
| `libre-listener-wallet-monorepo` | `packages/shared/src/v4v-utils.ts` | **canonical**, 191 lines | `67451af` |
| `lnaddress-music` | `lib/tlv-utils.ts` + `lib/constants.ts` | diverged, best browser-side shape | `c16f68b` |
| `TRM-Lightning` | `utils/payment-utils.ts` | diverged, de-hardcoded | `0a0fff8` |
| `ITDV-Lightning` | `utils/payment-utils.ts` | diverged — **do not copy**, see below | `4bc69b2` |
| `helipad` | `src/boost.rs` | the decoder side, in Rust | — |

## The canonical implementation

[`v4v-tlv.ts`](v4v-tlv.ts) — zero imports.

Two exported functions, `encodeV4VTlvs()` and `calculateSplits()`. It wins on
three things the others don't do:

**It refuses malformed split input instead of mis-paying.** The comment at
line 141 names both failures it prevents. A total share of zero makes
`Math.floor(amount * share / 0)` produce `NaN` for every recipient. A
negative share makes the last recipient's `amount - allocated` **over-pay** —
with shares `[-1, 2]` destination B receives twice the boost. Both inputs
come from a `<podcast:value>` block, which is to say from someone else's
feed, which is to say you do not control them. It throws on all three cases.

**Remainder goes to the last recipient.** Line 162: every recipient but the
last gets `floor(amount * share / total)`, and the last gets whatever is
left. Integer division loses sats otherwise — with three-way splits it loses
them on most boosts.

**One `boost_uuid` across the splits, a separate `uuid` per payment.** That
is what lets a receiver reassemble the parts of one boost, and it is also
what `helipad` keys on.

It sorts and dedupes records by key ascending, which LDK requires.

## How each site diverges

**`ITDV-Lightning/utils/payment-utils.ts` has the app baked into it.** Do not
copy this file:

- `app_name: metadata.appName || 'ITDV App'` at line 45, and `'ITDV App'`
  again at lines 63, 84 and 114
- line 52:
  `feedId: metadata.feedUrl === 'https://www.doerfelverse.com/feeds/bloodshot-lies-album.xml' ? "6590183" : "6590182"`

That last one is a Podcast Index feed ID chosen by a string comparison
against one album's URL, with a different hardcoded ID as the fallback for
*every other feed in existence*. Copied into another site, it silently
attributes every boost to one of two ITDV feeds.

**`TRM-Lightning` is the same file with the app pulled out** — `getSiteName()`
from `lib/site-config.ts` instead of `'ITDV App'`, `'Recipient'` instead of
`'ITDV App'` for the recipient name, and `feedId` passed through from
metadata rather than guessed. If you want the Next.js-shaped version, this is
it.

**`lnaddress-music`** is the only one that names the TLV types as constants
(`PODCAST_BOOST 7629169`, `TIP_NOTE 7629171`, `SPHINX_COMPAT 133773310` in
`lib/constants.ts`) and separates `lib/tlv-utils.ts` from the payment code.
Best browser-side bLIP-10 field shape — feed guid, episode guid,
remote_feed_guid, ts, value_msat_total.

It also re-implements the split arithmetic three times inside its own
`utils/payment-utils.ts`.

## Known gaps

- The canonical file is from a wallet, not a podcast app, so its
  `BoostRecord` has fields a player never sets and lacks some a player wants.
  Adopting it into a Next.js site means reconciling it with the field shape
  in `lnaddress-music/lib/tlv-utils.ts`. Nobody has done that yet.
- `calculateSplits` throws. Every current caller in the music sites assumes
  it can't. Wrap it before adopting, or a malformed feed turns a boost button
  into an unhandled rejection.
- The decoder half is only in `helipad` (`src/boost.rs`), in Rust. There is
  no TypeScript boostagram *parser* anywhere in these repos, so no site can
  read an inbound boostagram it didn't send.
