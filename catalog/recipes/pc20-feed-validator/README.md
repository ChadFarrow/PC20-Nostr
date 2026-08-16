# Podcasting 2.0 feed validator

A page that takes a podcast RSS feed URL and reports which Podcasting 2.0
namespace tags it uses, which are missing, and which are malformed.

It checks twenty tags: `podcast:guid`, `podcast:medium`, `podcast:value`,
`podcast:person`, `podcast:location`, `podcast:license`, `podcast:funding`,
`podcast:transcript`, `podcast:chapters`, `podcast:soundbite`,
`podcast:season`, `podcast:episode`, `podcast:trailer`, `podcast:locked`,
`podcast:alternateEnclosure`, `podcast:socialInteract`, `podcast:liveItem`,
`podcast:remoteItem`, `podcast:updateFrequency` and `podcast:payment`.

**Running at** <https://itdv.podtards.com/feed-validator> (DoerfelVerse —
Music & Podcast Hub).

## Difficulty: drop-in

One file. No dependencies to install. No configuration. No app-specific
constants to rename — this is the cleanest thing in the catalog to lift.

## What you get

| File | Put it at |
|---|---|
| `files/page.tsx` | `app/feed-validator/page.tsx` |

707 lines. Its only import is `useState` from React.

## What you need

Next.js with the App Router, and React 18 or newer. Nothing else — no
packages, no environment variables, no API route, no provider.

It is a client component (`'use client'`) and fetches the feed from the
browser.

## What will bite you

**CORS.** The page fetches the feed URL directly from the browser, so a feed
server that does not send `Access-Control-Allow-Origin` will fail with a
network error that looks like the feed is down. It is not — your browser
refused to hand you the response.

Most podcast hosts do send permissive CORS headers, which is why this works
at all as a client-only page. When one doesn't, route the fetch through a
server-side proxy. Do **not** write that proxy as a bare `fetch(req.query.url)`
— that is a server-side request forgery hole, and someone will point it at
your cloud metadata endpoint.

Getting that guard right is harder than it looks: resolve the hostname and
reject the resolved address, pin the connection to the address you checked,
refuse to follow redirects without re-validating them, and parse IPv6
numerically rather than by string prefix.
[`../../comparisons/image-proxy-ssrf.md`](../../comparisons/image-proxy-ssrf.md)
documents three bypasses found in a guard that looked correct, which is worth
reading before writing your own.

**It validates presence and shape, not truth.** A `podcast:guid` that is
well-formed but wrong still passes, and so does a `podcast:value` block
pointing at a node that cannot receive. Treat a green result as "this feed is
syntactically Podcasting 2.0", not "this feed works".

## Provenance

Taken byte-identical from `ITDV-Lightning` at `origin/main` `4bc69b2`,
`app/feed-validator/page.tsx`. Run `../../check-drift.sh` to confirm it still
matches.
