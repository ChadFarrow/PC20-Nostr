# Why the image-proxy recipe was withdrawn

There used to be a recipe here offering `ITDV-Lightning`'s image proxy —
`app/api/proxy-image/route.ts` plus `lib/proxy-guard.ts` — and its README said
to take it *instead of writing your own* because of the guard, which it
described as rejecting "non-HTTPS targets, private IPv4 and IPv6, localhost
and `.internal`".

A security review of this repo found the guard does not do that. The recipe
was withdrawn rather than annotated, because its whole value proposition was
the safety it did not provide, and its audience is an agent that copies
`files/` and may never weigh a warning in the prose beside them.

The code is still running on DoerfelVerse. This page records what is wrong
with it so the finding is not lost, and so anyone who already copied it knows
what to fix.

## Three bypasses, all verified

Read at `ITDV-Lightning` `origin/main` `4bc69b2`.

### 1. Redirects are followed and never re-checked

`route.ts:48`:

```ts
const response = await fetch(target.url, {
  headers: upstreamHeaders,
  signal: AbortSignal.timeout(timeoutMs),
});
```

No `redirect` option, so the WHATWG default `follow` applies — up to 20 hops.
`validateProxyTarget()` ran once, against the *initial* URL. Nothing revalidates
a `Location`: not the scheme, not the host, not the address class.

An attacker serves `https://evil.example/cover.jpg` returning
`302 Location: http://169.254.169.254/latest/meta-data/…` and the proxy
fetches cloud metadata. `isAllowedMediaType` stops a `text/plain` body being
*returned*, but the request is still made, and the error string
`` `Failed to fetch image: ${response.status} ${response.statusText}` ``
discriminates 200/401/403/404/refused — enough to enumerate internal hosts and
ports. Any internal endpoint serving `image/*` is streamed back in full.

### 2. `::ffff:` addresses walk straight through

`proxy-guard.ts:43-52`:

```ts
const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(host);
if (mapped) return isPrivateIPv4(mapped[1]);
```

That regex can never match, because Node's URL parser rewrites the embedded
IPv4 into hex before the guard sees the hostname:

```
https://[::ffff:169.254.169.254]/  ->  hostname [::ffff:a9fe:a9fe]
https://[::ffff:127.0.0.1]/        ->  hostname [::ffff:7f00:1]
https://[::ffff:10.0.0.1]/         ->  hostname [::ffff:a00:1]
```

Step `::ffff:a9fe:a9fe` through `isPrivateIPv6`: it is not `::1` or `::`, does
not start with `fc`, `fd` or `fe80`, and fails the dotted-quad regex. The
function returns `false` and the request is allowed. On a dual-stack host the
OS dials the mapped IPv4 — the cloud metadata service — from a single
unauthenticated request, with no DNS control and no redirect needed.

`fec0::/10` (site-local) and `64:ff9b::/96` (NAT64) are unhandled too.

### 3. Hostnames are never resolved

The IP checks only fire when the caller typed a literal IP. A DNS name passes
every branch untouched, and `route.ts` then resolves it independently at fetch
time. `https://169-254-169-254.nip.io/` reaches link-local. This is not even a
rebinding race — nothing resolves at validation time at all, so there is
nothing to race.

The port is never inspected either, so once a host resolves internally the
whole port range is reachable.

## What the guard *does* get right

Worth keeping, because a replacement should not regress these:

- **Alternate IPv4 encodings are handled.** Verified: `https://2130706433/`,
  `https://0177.0.0.1/`, `https://0x7f.0.0.1/` and `https://127.1/` all
  normalise to `127.0.0.1` and are correctly blocked. The private-range list
  (127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, 0/8, 100.64/10, 224+) is
  complete, and malformed input fails closed.
- **Userinfo smuggling does not work.** `https://good.com@169.254.169.254/`
  parses `hostname` to the IP and is blocked.
- **The response side is sound.** The `image/` content-type gate,
  `X-Content-Type-Options: nosniff`, and for SVG both a
  `default-src 'none'; … sandbox` CSP and `Content-Disposition: attachment`
  are applied after the manual header block, so they cannot be overwritten. No
  content type both passes the gate and stays script-executable. Stored XSS
  through the proxy was specifically checked and is not reachable.

## What a correct guard needs

1. **Resolve, then pin.** `dns.promises.lookup(host, { all: true })`, reject if
   *any* returned address is loopback, private, link-local, CGNAT, ULA or
   multicast, then dial the vetted address — a custom `undici` Agent with a
   pinned `lookup` — so the address checked is the address connected to. This
   closes both #3 and classic rebinding.
2. **`redirect: 'manual'`**, re-running full validation on each `Location`,
   with a hop cap.
3. **Parse IPv6 numerically**, not by string prefix: split into hextets,
   detect `::ffff:0:0/96` as hextets 0–4 zero and hextet 5 `0xffff`, then feed
   the embedded address through the IPv4 check. Cover `fec0::/10` and
   `64:ff9b::/96`. A maintained CIDR library such as `ipaddr.js` is a better
   answer than hand-rolled prefix tests.
4. **Restrict the port** to empty or 443.
5. **Do not echo upstream status text** back to the caller; it is a response
   oracle.

## For anyone who already copied it

The recipe was published in this repo before the review. If you took it,
apply the four items above, or drop the proxy behind an allowlist of the image
hosts you actually use — which for a podcast app is a short and knowable list.
