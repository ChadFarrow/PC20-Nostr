# BoostBox client, with the key on the server

[BoostBox](https://github.com/noblepayne/boostbox) is a small self-hostable
service (MIT, Clojure) that stores Podcasting 2.0 payment metadata and hands
back a short URL for it. You put that URL in the payment description, so a
boost's message, show, episode and splits stay reachable even when the wallet
in between drops custom TLV records — which is most of them.

**This code has never served production traffic.** It is written against
BoostBox's documented API, not extracted from a site running it. No BoostBox
source is redistributed here.

## The reason this recipe exists

BoostBox authenticates with an `X-Api-Key` header. The obvious way to send one
from a Next.js app is to read `NEXT_PUBLIC_BOOSTBOX_API_KEY` in the component
that boosts.

That does not do what it looks like it does. **Next.js inlines every
`NEXT_PUBLIC_*` value into the browser bundle at build time**, so the key is
served to everybody who loads the page, and anybody who reads it can write
boosts under your name until you rotate it.

A live Podcasting 2.0 site does exactly this today: `lib/boostbox-service.ts`
reads `NEXT_PUBLIC_BOOSTBOX_API_KEY` and is imported by two client components.

This recipe is the shape that does not. The browser calls your own route; the
route holds the key.

```
browser  ──POST /api/boostbox──▶  your route  ──POST /boost + X-Api-Key──▶  BoostBox
(no key)                          (the key)
```

## Install

```bash
# no packages
```

| From | To |
|---|---|
| `files/boostbox-types.ts` | `lib/boostbox-types.ts` |
| `files/boostbox-client.ts` | `lib/boostbox-client.ts` |
| `files/route.ts` | `app/api/boostbox/route.ts` |

Set two environment variables, **neither with a `NEXT_PUBLIC_` prefix**:

```bash
BOOSTBOX_API_KEY=your-real-key
BOOSTBOX_URL=https://your-boostbox-instance
```

If you add the prefix to make an import error go away, you have put the key
back in the bundle. The fix for that error is to call the route, not to import
the route's module.

### Do not keep the default key

BoostBox ships with `v4v4me` as its default. Anyone who knows the project knows
it, so a deployment still using it is an open write endpoint. **The route
refuses to run with that value** and returns 503 rather than pretending it is
configured.

## Use

Submit *before* you pay, because `receipt.desc` is what you want to send as the
payment description.

```ts
import { submitBoost, buildSubmission } from '@/lib/boostbox-client';

const receipt = await submitBoost(buildSubmission({
  action: 'boost',
  split: recipient.split,
  value_msat: allocation.sats * 1000,   // this recipient's slice
  value_msat_total: totalSats * 1000,   // the whole boost
  message: 'great episode',
  app_name: 'Your App',
  sender_name: 'listener',
  feed_guid: feed.guid,
  feed_title: feed.title,
  item_guid: episode.guid,
  item_title: episode.title,
  recipient_name: recipient.name,
  recipient_address: recipient.address,
  position: Math.floor(player.currentTime),
}));

// receipt.desc is 'rss::payment::boost <url> great episode'
await nwc.payInvoice(invoice);          // memo: receipt.desc
```

`value_msat` is this recipient's slice and `value_msat_total` is the whole
boost — the same distinction the boostagram records make, and the same way to
get it wrong. [`../boostagram-keysend/`](../boostagram-keysend/) produces both
numbers from a value block.

## The two work together

They solve the same problem from opposite ends.

- **[`boostagram-keysend`](../boostagram-keysend/)** attaches the metadata to
  the payment as TLV records. Complete, but only survives if every hop keeps
  custom records.
- **This recipe** stores the metadata somewhere and puts a URL in the payment
  description. Less data, but a description survives hops that records do not.

Send both. They cost one extra request between them.

## What the route does and does not do

**Does:**

- Holds the key. Nothing key-shaped reaches the browser.
- Forwards only the fields BoostBox documents. A route that relays whatever it
  was handed is a way to send arbitrary bodies to another service using your
  credentials.
- Builds its target from `BOOSTBOX_URL` and never from the request, so it
  cannot be pointed somewhere else.
- Validates types before forwarding, truncates strings at 4096 characters, sets
  a 10-second timeout, and refuses redirects.
- Returns 502 with no upstream body. An error message from another service is
  not yours to relay verbatim.

**Does not:**

- **Prove a payment happened.** BoostBox stores what you tell it. A boost
  record is a claim, not a receipt.
- **Rate-limit.** The route is as open as whatever sits in front of it. Put
  your own limiter there if the endpoint is public.
- **Wrap `GET /boost/{id}`.** It needs no key — it returns an HTML page with
  the JSON in a URL-encoded `x-rss-payment` header. Call it directly.
