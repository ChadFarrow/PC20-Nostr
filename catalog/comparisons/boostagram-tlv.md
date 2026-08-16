# Boostagram TLV records (bLIP-10)

Packs boost metadata — podcast, episode, feed GUID, sender, message, amount —
into the TLV records that ride along with a keysend payment. Custom record
`7629169` carries the boostagram JSON; `7629175` carries the Podcast Index
feed GUID.

Also the split arithmetic: given a `<podcast:value>` block's recipients and
their shares, how many sats each one gets.

**Nothing is shipped for this feature.** That is the finding, not an omission.

## Why nothing ships

The best implementation is `libre-listener-wallet-monorepo`'s
`packages/shared/src/v4v-utils.ts` — but that is a third-party fork, not one
of these sites, so it is out of scope for redistribution here.

Every remaining implementation lives inside a `utils/payment-utils.ts` that
keeps `createBoostTLVRecords` **module-private**, so there is nothing to
extract without rewriting — and rewriting is exactly what this catalog does
not do. The one production copy, `ITDV-Lightning`'s, additionally hardcodes
the app into the records it builds.

| Repo | Path | Status |
|---|---|---|
| `ITDV-Lightning` | `utils/payment-utils.ts` (231L) | production, but branded — see below |
| `TRM-Lightning` *(test site)* | `utils/payment-utils.ts` (333L) | de-branded, but a test site |
| `lnaddress-music` *(test site)* | `lib/tlv-utils.ts` + `lib/constants.ts` | best field shape, but a test site |
| `libre-listener-wallet-monorepo` | `packages/shared/src/v4v-utils.ts` | third-party fork, out of scope |
| `helipad` | `src/boost.rs` | the decoder side, in Rust |

## Do not copy ITDV's payment-utils

It is the only production implementation, and it has DoerfelVerse compiled
into it:

- `app_name: metadata.appName || 'ITDV App'` at line 45, and `'ITDV App'`
  again at lines 63, 84 and 114
- line 52:
  `feedId: metadata.feedUrl === 'https://www.doerfelverse.com/feeds/bloodshot-lies-album.xml' ? "6590183" : "6590182"`

That last line picks a Podcast Index feed ID by string-comparing against one
album's URL, with a different hardcoded ID as the fallback for **every other
feed in existence**. Copied into another site, it silently attributes every
boost to one of two DoerfelVerse feeds.

## What the out-of-scope implementations do better

Recorded because these are the properties any future implementation needs.

`libre-listener`'s version **refuses malformed split input instead of
mis-paying**, and names both failures it prevents:

- a total share of zero makes `Math.floor(amount * share / 0)` produce `NaN`
  for every recipient
- a negative share makes the last recipient's `amount - allocated`
  **over-pay** — with shares `[-1, 2]`, destination B receives twice the boost

Both inputs come from a `<podcast:value>` block, which is to say from someone
else's feed, which is to say you do not control them.

It also sends the **remainder to the last recipient** — every recipient but
the last gets `floor(amount * share / total)` — because integer division
otherwise loses sats on most three-way splits. And it uses one `boost_uuid`
across the splits with a separate `uuid` per payment, which is what lets a
receiver reassemble the parts of one boost, and what `helipad` keys on.

`lnaddress-music` is the only one that names the TLV types as constants
(`PODCAST_BOOST 7629169`, `TIP_NOTE 7629171`, `SPHINX_COMPAT 133773310`) and
separates TLV construction from payment code. It also re-implements the split
arithmetic three times inside its own `utils/payment-utils.ts`.

## Known gaps

- **No split/TLV code ships at all.** The safest arithmetic is out of scope,
  and the only production copy is branded and private.
- Any future extraction needs the zero-total guard, the negative-share guard
  and remainder-to-last. Absent those, malformed feed data becomes
  mis-directed money.
- There is **no TypeScript boostagram parser anywhere** in these repos. The
  decoder half exists only in `helipad`'s `src/boost.rs`, in Rust, so no site
  can read an inbound boostagram it did not send.
