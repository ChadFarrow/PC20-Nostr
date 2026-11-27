# Safe feed fetch

Fetch a URL that came from a user or from a feed — an RSS URL someone pasted,
a `<podcast:chapters url>`, a `<podcast:remoteItem feedUrl>` — on your server,
without letting it reach your own network.

Every Podcasting 2.0 app does this, and a plain `fetch(url)` on a server is an
SSRF hole: the URL can point at `169.254.169.254` (cloud metadata),
`localhost`, a router, or a public name that resolves to any of those. This
catalog withdrew its last guard over exactly this
([`../../comparisons/image-proxy-ssrf.md`](../../comparisons/image-proxy-ssrf.md)),
so this recipe ships with the tests that prove it refuses what that one let
through.

**Running at** <https://boostmebitch.com> (Boost Me Bitch), behind its feed,
artwork, audio, OPML, playlist and LNURL routes.

## Difficulty: drop-in

Two files, no packages, nothing to rename.

## What you get

| File | Put it at |
|---|---|
| `files/safe-fetch.ts` | `lib/safe-fetch.ts` |
| `files/capped-body.ts` | `lib/capped-body.ts` |

217 + 178 lines.

```ts
import { safeFetch } from '@/lib/safe-fetch';
import { readCappedText } from '@/lib/capped-body';

const res = await safeFetch(feedUrl, {
  signal: AbortSignal.timeout(8_000),          // safeFetch sets no timeout
  headers: { 'User-Agent': 'your-app/1.0' },   // and no User-Agent
});
if (!res.ok) throw new Error(`feed answered ${res.status}`);
const xml = await readCappedText(res);         // throws past 8 MB; never res.text()
```

That is the shape the live site uses for every feed read. Hand `xml` to
[`podcast-feed-parser`](../podcast-feed-parser/).

## What you need

Node 18+ on the server. `safe-fetch.ts` imports `node:dns/promises`, so it
cannot go in a browser bundle. `capped-body.ts` imports nothing and works in a
browser too — use it there for any third-party body.

## Next.js: this fetch turns `revalidate` off

**`safeFetch` always sends `cache: 'no-store'` and drops any `next` option
you pass, and you cannot opt out.** That is on purpose. On a cacheable fetch
Next reads a second copy of the whole body to store it, outside the 8 MB cap,
so an attacker-chosen URL could fill your server's memory. Do not delete the
override to get caching back.

What it does to a route or page with `export const revalidate = N` (ISR),
tested with `next build` on Next 15.5.28:

- **The build passes, and the route is no longer static.** Next sees the
  `no-store` fetch and makes the route dynamic (`ƒ` in the build output). It
  ignores your `revalidate` without a warning, so every request fetches the
  feed again.
- **A `catch` around `safeFetch` runs during the build.** Next stops the
  prerender by throwing its own error into your code: `Dynamic server usage:
  Route /x couldn't be rendered statically because it used revalidate: 0
  fetch`. If your `catch` retries or waits, each retry gets the same error,
  and the prerender can pass Next's 60-second limit and fail the build. A real
  app hit exactly this on its first build with this recipe: its parser retried
  every feed. Call `unstable_rethrow(err)` (from `next/navigation`) first in
  each such `catch`, so Next gets its error back.

To keep a cache, pick one:

- **Cache the result, not the response.** Wrap the fetch, the capped read
  and your parse in `unstable_cache` (from `next/cache`). In the same test the
  route stayed static (`○`, revalidate 1m), the cache entry held only the
  value the function returned, and under `next start` the route served the
  cached body, then a fresh one after the 60 s. The response never goes through Next's data
  cache, so the cap still holds. Return plain data, never the `Response`.
  It suits a fixed list of feeds: the URL is part of the cache key, so a URL
  taken from the request adds one cache entry per distinct URL. Tested on a
  route handler, on Next 15.5.28 only.

  ```ts
  import { unstable_cache } from 'next/cache';

  export const revalidate = 300;

  const getFeed = unstable_cache(async (url: string) => {
    const res = await safeFetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`feed answered ${res.status}`);
    return parse(await readCappedText(res));   // your parser: plain data out
  }, ['feed'], { revalidate: 300 });
  ```

- **Render on request, cache at the CDN.** Set
  `export const dynamic = 'force-dynamic'`, so the build does not try to
  prerender the route, and answer with a `Cache-Control` such as
  `public, max-age=60, s-maxage=300, stale-while-revalidate=600`. That is the
  header the live site's feed route sends (`app/api/feed/route.ts` at
  `cd940d36`), with no `revalidate` at all. The first request after a CDN miss
  pays for the whole fetch.

## What it refuses

Each hop, the first request and every redirect, is checked twice: once on the
URL as written, then on every address DNS returns for its host.

- **Schemes** other than `http:` and `https:`.
- **Names**: `localhost`, `*.localhost`, `*.local`, `*.internal` — also with a
  trailing dot, which DNS treats as the same name and a naive `endsWith` does
  not.
- **IPv4**: loopback, RFC 1918, link-local and cloud metadata, `0/8`,
  carrier-grade NAT `100.64/10` (where a tailnet lives), multicast, reserved,
  and the IETF test and benchmark ranges. Decimal, octal, hex and short forms
  (`2130706433`, `0177.0.0.1`, `127.1`) are normalised by the URL parser first
  and refused.
- **IPv6**: `::` and all of `::/96` (loopback, and v4-mapped in the hex form
  Node rewrites it to — the bypass that withdrew the last guard), NAT64
  `64:ff9b::`, 6to4 `2002::`, Teredo, link-local, site-local, unique-local,
  discard-only and multicast `ff00::/8`. The live site's copy has no multicast
  rule; this recipe adds it (see [Provenance](#provenance)).
- **A public name that resolves to any of the above**, such as
  `127.0.0.1.nip.io`. A name that does not resolve is refused too: it fails
  closed.
- **Redirects** are followed by hand, at most 5, each one re-checked; a
  caller cannot opt back into automatic following.

`readCappedText` counts bytes as they arrive. A lying or missing
`Content-Length` does not help an attacker fill your memory.

## What will bite you

**DNS rebinding still gets through.** The check resolves the name, then
`fetch` resolves it again to connect. A DNS server that answers the first with
a public address and the second with a private one wins. The file says so in
its header. Closing it needs a custom dialer that connects to the address that
was checked; none of the five live sites does that today.

**The port is not restricted.** A public host is reachable on any port. If
you only ever want web servers, refuse a non-empty `port` other than 80 and
443 before you call `safeFetch`.

**The errors name the host.** They are written for your logs. Answer a client
with a generic 400 or 502, not the message.

**`http:` is allowed on purpose.** Many real podcast feeds are still plain
http.

## Tests

`tests/ssrf.test.ts` runs the full list above against the shipped bytes —
literals, redirects, DNS and the body cap — and needs no network except one
DNS lookup, which it reports as SKIP when there is none. Every rule in both
files was removed in turn — each range, each name, the scheme check, the
per-hop checks, the redirect cap, the three body caps: 42 mutations when the
recipe shipped, and the multicast rule added since — and the test failed for
every one.

```bash
npm i -D tsx typescript
npx tsx tests/ssrf.test.ts
```

## Provenance

`boostmebitch` `origin/main` at `815c551f`. MIT. `capped-body.ts` is
byte-identical. `safe-fetch.ts` is `patched`: one rule added to `PRIVATE_V6`,
IPv6 multicast `ff00::/8`, which the site's list does not have. A connect to a
multicast address fails anyway, so the rule makes the refusal explicit; it
closes no reachable hole. Do not diff the file against the site and "fix" the
difference. Rows in [`../../PROVENANCE.tsv`](../../PROVENANCE.tsv). Why this guard and not the
other two live ones:
[`../../comparisons/feed-parsing.md`](../../comparisons/feed-parsing.md#feed-fetching).
