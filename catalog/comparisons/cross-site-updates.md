# Fixes one site has and another does not

The five sites share no git history, so nothing propagates between them
automatically. When one gets a fix, the others keep the bug until somebody
carries it across by hand — and nobody has been tracking which ones are owed.

This page is that list, read at:
`ITDV-Lightning@4bc69b2`, `boostmebitch@1f26ba0`, `stablekraft-app@22298c5f`,
`MSP-2.0@c294548`, `candr.space@21da719`.

Nothing here is a change to a site. This repo records; the sites stay
read-only.

## 1. Project StableKraft has an arbitrary file read that DoerfelVerse fixed

`stablekraft-app/app/api/optimized-images/[filename]/route.ts`:

```ts
const filePath = path.join(optimizedDir, filename);
if (!fs.existsSync(filePath)) { ... }
const fileBuffer = fs.readFileSync(filePath);
```

No traversal check, no extension allowlist, no containment re-check.

`ITDV-Lightning`'s copy of the same route has `resolveSafePath()`, which
rejects `..`, path separators, null bytes and leading dots, requires a known
image extension, and verifies
`resolved.startsWith(OPTIMIZED_DIR + path.sep)`.

It arrived in commit `d575454`, *"fix(security): close arbitrary file read,
unauthenticated admin API, and proxy XSS"*, and the message records the bug as
**verified exploitable on a running server**: Next hands the dynamic segment
over already percent-decoded, so `..%2F..%2F.env.local` escaped the directory
and the endpoint served `package.json`, private feed URLs, `.env.local` and
`/etc/hosts` — unauthenticated, in production.

StableKraft has the same dynamic segment and the same `path.join`.

**Port:** copy `resolveSafePath` and the 404-for-everything behaviour, ~40
lines. One adaptation — StableKraft also serves `.mp4`/`.webm`, so extend the
content-type map. Take the streaming rewrite at the same time; StableKraft
still `readFileSync`s a directory holding 20–35 MB files. Also drop its
`error.message` passthrough, which echoes filesystem paths.

## 2. StableKraft's media proxies serve any content type from its own origin

`app/api/proxy-audio/route.ts` sets `Content-Type` straight from upstream with
no gate, so `?url=…/x.html` renders attacker HTML on `stablekraft.app`. The
image route checks only `startsWith('image/')`, which admits `image/svg+xml`,
served with `Access-Control-Allow-Origin: *` and **no** `X-Content-Type-Options`,
CSP or `Content-Disposition`.

`ITDV-Lightning/lib/proxy-guard.ts` has `isAllowedMediaType` and
`hardeningHeadersFor`, which emit for SVG:

```ts
headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
headers['Content-Disposition'] = 'attachment';
```

The consequence is XSS on the origin holding Nostr session state and wallet
connections.

**Port with care.** That same guard has three SSRF bypasses of its own — see
[image-proxy-ssrf.md](image-proxy-ssrf.md). Take the **response-side** half
(`isAllowedMediaType`, `hardeningHeadersFor`), which is sound; do not adopt
its request-side host checks as-is.

## 3. MSP 2.0 ships no security headers at all

Verified: `MSP-2.0/vercel.json` contains exactly one headers block, and its
only key is `Cache-Control`. No HSTS, `X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy` or CSP — on a site with a Nostr signer
and an admin surface.

`candr.space/_headers` and `boostmebitch/next.config.mjs` both have full sets.
Boost Me Bitch's four directives — `base-uri 'self'`, `object-src 'none'`,
`frame-ancestors 'none'`, `form-action 'self'` — constrain nothing a normal
app does.

**Port:** copy the values into a `headers` block in `vercel.json`. Fifteen
minutes, zero risk, and the cheapest security win across all five sites.

## 4. Two sites read the spoofable end of `x-forwarded-for`

`MSP-2.0/api/_utils/rateLimiter.ts` and
`ITDV-Lightning/app/api/nostr/publish/route.ts` both take
`forwarded.split(',')[0]` — the **leftmost** entry.

`boostmebitch/lib/rate-limit.ts` explains why that is backwards:
`x-forwarded-for` is client-supplied and a trusted proxy *appends* the real
peer, so the leftmost entry is attacker-controlled. Rotating it lands every
request in a fresh bucket and defeats the limiter entirely. Boost Me Bitch
prefers `x-real-ip` and falls back to the **rightmost** hop.

MSP's bucket `Map` is also never swept or capped — one entry per distinct IP,
forever — where Boost Me Bitch bounds it at 20,000 with insertion-order
eviction.

This matters most on DoerfelVerse's endpoint, because that one signs as the
site: the rate limit is the only control on the signing oracle.

**Port:** near copy-paste. MSP needs `NextResponse` → `VercelResponse`.

## 5. Boost Me Bitch relays credentials across redirects

Its `lib/safe-fetch.ts` redirect loop does `url = new URL(loc, url).toString()`
with no userinfo handling. `MSP-2.0/api/_utils/safeFetch.ts` strips it, and
says why:

> Node's fetch turns `https://user:pass@host` into an Authorization header,
> and `new URL(location, current)` carries userinfo straight through — so a
> caller that rejects credentials on the URL it was handed is still a
> credential relay one redirect later.

Narrow — it needs a feed URL carrying credentials — but Boost Me Bitch fetches
exactly those. **Port: two lines.**

Worth noting the reverse trade: Boost Me Bitch's `safe-fetch.ts` is the best
SSRF guard in the set, with `redirect: 'manual'`, re-validation on every hop,
a hop cap, and a denylist covering CGNAT, trailing-dot FQDNs, NAT64, 6to4 and
Teredo. Both DoerfelVerse and StableKraft would benefit from it, and neither
resolves hostnames today.

## 6. Smaller, cheap, mechanical

**StableKraft `public/force-clear-cache.js`** has no try/catch, so
`localStorage.clear()` throwing in Safari private mode kills everything after
it — the service-worker unregister and Cache API delete never run. The script
exists to rescue users stuck on a stale service worker, so it fails exactly
when it is needed. DoerfelVerse wraps each call. Six lines.

**StableKraft `lib/nostr/zaps.ts`** has the NIP-57 kinds inverted — 9735 for
the request and 9736 for the receipt, where the spec says 9734 and 9735. Both
DoerfelVerse and Boost Me Bitch get it right. It is **dead code**; only
`lib/nostr/index.ts` re-exports it and nothing calls it. Fix or delete it
before something does. See [zap-receipts.md](zap-receipts.md).

**StableKraft duplicates the Podcast Index SHA-1 auth inline across ~11 route
files.** DoerfelVerse, MSP 2.0 and Boost Me Bitch each have exactly one
helper. Boost Me Bitch's is the best — a typed `PiHttpError` carrying the
status so callers can tell "Podcast Index doesn't know this" from an outage.
See [podcast-index-auth.md](podcast-index-auth.md).

## Two suspicions that were wrong

Recorded so they are not raised again.

**StableKraft does not have an old site-signing pattern.** It has no site key
at all — no `SITE_NOSTR*` variable anywhere. `app/api/nostr/boost/route.ts`
requires the caller to supply a signed event and verifies it. That is
architecturally safer than either DoerfelVerse's or Boost Me Bitch's approach,
because there is no signing oracle to abuse. See
[site-identity-signing.md](site-identity-signing.md).

**StableKraft's stubbed `extractValue4Value` does not mean it lacks V4V.** The
stubs in `lib/rss-parser/` are dead weight on one legacy path. Its real
implementation is `lib/lightning/value-parser.ts`, which is *more* capable
than DoerfelVerse's — it understands `keysendFallback`, `nostrPubkey` and
`lnurlFallback`. The genuine losses from the stubs are `podcast:funding` links
and podroll discovery, not payment splits.

## Diverged past the point of porting

Same filename, different product. Do not attempt file-level ports:

| File | DoerfelVerse | StableKraft |
|---|---|---|
| `contexts/AudioContext.tsx` | 782 | 4884 |
| `components/AdminPanel.tsx` | 477 | 2915 |
| `app/api/feeds/route.ts` | 20 | 958 |
| `lib/rss-parser.ts` | 1952 | 4 (re-export shim) |
| `lib/url-utils.ts` | 287 | 879 |
| `app/api/albums/route.ts` | 151 | 637 |

Two run the other way — StableKraft ahead, DoerfelVerse behind, and equally
un-portable: `lib/monitoring.ts` (206 vs 345) and `lib/cdn-utils.ts` (63 vs
221).

## One shared file worth fixing once

`lib/logger.ts`, `lib/error-utils.ts`, `lib/api-utils.ts`,
`components/ErrorBoundary.tsx` and four `app/api/admin/*` routes are
byte-identical between DoerfelVerse and StableKraft. Keeping them that way is
cheap and worth doing deliberately.

Note that `lib/api-utils.ts` — identical in both — carries an unbounded `Map`
used as a rate limiter and another as a cache. Fixing it once fixes both
sites. Boost Me Bitch's `lib/bounded-cache.ts` is the reference, and its
header documents the exact bug: entries past their TTL stopped being *served*
but were never *deleted*, so every distinct URL an attacker or a large podroll
could name pinned a response body in memory forever.
