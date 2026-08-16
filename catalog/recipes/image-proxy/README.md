# Image proxy with SSRF hardening

A Next.js route that fetches a remote image server-side and serves it from
your own origin. Podcast artwork lives on hosts that block hotlinking, send
no CORS headers, or serve over plain HTTP — proxying fixes all three, and
gives you one place to cache.

The reason to take this one rather than write your own is
`proxy-guard.ts`. "Fetch the URL in the query string" is a server-side
request forgery hole: someone passes `http://169.254.169.254/…` and your
server reads its own cloud credentials back to them.

**Running at** <https://itdv.podtards.com> (DoerfelVerse — Music & Podcast
Hub), behind the album artwork.

## Difficulty: drop-in

Two files, no packages to install. Two constants to rename.

## What you get

| File | Put it at |
|---|---|
| `files/route.ts` | `app/api/proxy-image/route.ts` |
| `files/proxy-guard.ts` | `lib/proxy-guard.ts` |

189 + 147 lines. `route.ts` imports `next/server` and `proxy-guard`.
`proxy-guard.ts` imports nothing at all.

## What you need

Next.js with the App Router. No packages, no environment variables.

Use it as `/api/proxy-image?url=<encoded-image-url>`.

## What to rename

Both are in `files/route.ts` and both currently identify DoerfelVerse:

| Line | Current | Change to |
|---|---|---|
| 33 | `'User-Agent': 'Mozilla/5.0 (compatible; PodtardsImageProxy/1.0)'` | your own app name |
| 147 | `headers.set('X-Image-Proxy', 're.podtards.com')` | your own host, or delete the header |

Leave the User-Agent alone and every image host you hit sees traffic
attributed to Podtards. The `X-Image-Proxy` value is worse than merely wrong:
`re.podtards.com` does not resolve any more, so it advertises a dead host on
every response. Deleting the header is a fine answer.

## What `proxy-guard.ts` actually blocks

`validateProxyTarget()` rejects a target unless it is **HTTPS**, and refuses:

- private IPv4 ranges, checked numerically rather than by string prefix
- private and link-local IPv6, including bracketed forms
- an explicit blocked-hostname set
- anything ending `.localhost` or `.internal`

`isAllowedMediaType()` then constrains what may come back, and
`hardeningHeadersFor()` sets the response headers that stop a proxied file
being interpreted as something executable.

## What will bite you

**Do not relax the HTTPS-only rule** to support a feed still serving artwork
over HTTP. That rule is doing more work than it looks like: it removes an
entire class of redirect-to-internal-host attack. Fix the feed, or fetch that
one host out of band.

**The guard is not a cache.** Every request is a live fetch. Put a CDN or
`Cache-Control` in front of it before pointing a real audience at it, or you
have turned your own origin into the bottleneck you were trying to avoid.

## Provenance

Both files taken byte-identical from `ITDV-Lightning` at `origin/main`
`4bc69b2` — `app/api/proxy-image/route.ts` and `lib/proxy-guard.ts`. Run
`../../check-drift.sh` to confirm.

`stablekraft-app` has a 466-line version of the same route with more caching
behaviour; if you outgrow this one, read that before extending.
