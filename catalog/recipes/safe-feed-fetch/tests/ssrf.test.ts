/**
 * Proof for the safety claims in this recipe's README.
 *
 * The files are extracted, so a live site's traffic vouches that they FETCH.
 * Traffic never vouches that they REFUSE, which is the whole value of the
 * recipe, so every refusal the README promises is pinned here. The address
 * list is the one comparisons/image-proxy-ssrf.md used to withdraw the last
 * guard this catalog shipped, plus the encodings this guard's own comments
 * name.
 *
 *   npm i -D tsx typescript
 *   npx tsx tests/ssrf.test.ts
 *
 * No network needed. One case asks DNS about 127.0.0.1.nip.io (a public
 * wildcard name that answers 127.0.0.1); without DNS it reports SKIP, not ok.
 */

import { assertSafeFetchUrl, isPrivateIp, safeFetch } from '../files/safe-fetch';
import { readCappedText, readBytesUpTo } from '../files/capped-body';

let bad = 0;
const fail = (m: string) => { console.log('FAIL   ' + m); bad++; };
const ok = (m: string) => console.log('ok     ' + m);

function refused(url: string): boolean {
  try { assertSafeFetchUrl(url); return false; } catch { return true; }
}

// --- 1. literal addresses and names -------------------------------------

const MUST_REFUSE: [string, string][] = [
  ['http://127.0.0.1/', 'loopback'],
  ['http://169.254.169.254/latest/meta-data/', 'cloud metadata'],
  ['http://10.0.0.1/', 'RFC 1918 10/8'],
  ['http://172.16.0.1/', 'RFC 1918 172.16/12'],
  ['http://192.168.1.1/', 'RFC 1918 192.168/16'],
  ['http://100.64.0.1/', 'CGNAT / tailnet'],
  ['http://100.127.255.1/', 'CGNAT upper edge'],
  ['http://172.31.255.1/', 'RFC 1918 172.16/12 upper edge'],
  ['http://0.0.0.0/', '0/8'],
  ['http://224.0.0.1/', 'multicast 224/4'],
  ['http://239.255.255.250/', 'multicast SSDP'],
  ['http://240.0.0.1/', 'reserved 240/4'],
  ['http://255.255.255.255/', 'broadcast'],
  ['http://192.0.0.1/', 'IETF protocol assignments 192.0.0/24'],
  ['http://192.0.2.1/', 'TEST-NET-1'],
  ['http://198.51.100.1/', 'TEST-NET-2'],
  ['http://203.0.113.1/', 'TEST-NET-3'],
  ['http://198.18.0.1/', 'benchmarking 198.18/15'],
  ['http://198.19.255.1/', 'benchmarking 198.19'],
  ['http://192.88.99.1/', '6to4 relay anycast'],
  ['http://2130706433/', 'decimal 127.0.0.1'],
  ['http://0177.0.0.1/', 'octal 127.0.0.1'],
  ['http://0x7f.0.0.1/', 'hex 127.0.0.1'],
  ['http://127.1/', 'short 127.0.0.1'],
  ['http://good.example@169.254.169.254/', 'userinfo smuggling'],
  ['http://localhost/', 'localhost'],
  ['http://localhost./', 'localhost with trailing dot'],
  ['http://metadata.google.internal./', '.internal with trailing dot'],
  ['http://printer.local/', '.local'],
  ['http://app.localhost/', '*.localhost'],
  ['http://metadata.google.internal/', '.internal'],
  ['http://[::1]/', 'IPv6 loopback'],
  ['http://[::]/', 'IPv6 unspecified'],
  // The bypass that withdrew the image proxy: Node rewrites the embedded IPv4
  // to hex (::ffff:a9fe:a9fe) before any guard sees the hostname.
  ['http://[::ffff:169.254.169.254]/', 'v4-mapped metadata (hex after parsing)'],
  ['http://[::ffff:127.0.0.1]/', 'v4-mapped loopback'],
  ['http://[::ffff:10.0.0.1]/', 'v4-mapped RFC 1918'],
  ['http://[::7f00:1]/', 'v4-compatible loopback'],
  ['http://[64:ff9b::a9fe:a9fe]/', 'NAT64 metadata'],
  ['http://[64:ff9b::7f00:1]/', 'NAT64 loopback'],
  ['http://[2002:7f00:1::]/', '6to4 loopback'],
  ['http://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/', 'Teredo'],
  ['http://[fe80::1]/', 'link-local'],
  ['http://[fec0::1]/', 'site-local'],
  ['http://[fd00::1]/', 'unique-local'],
  ['http://[fc00::1]/', 'unique-local fc'],
  ['http://[100::1]/', 'discard-only 100::/64'],
  ['file:///etc/passwd', 'file scheme'],
  ['gopher://example.com/', 'gopher scheme'],
  ['ftp://example.com/feed.xml', 'ftp scheme'],
  ['not a url', 'unparseable'],
];
for (const [url, why] of MUST_REFUSE) {
  refused(url) ? ok(`refused ${why}: ${url}`) : fail(`ALLOWED ${why}: ${url}`);
}

const MUST_ALLOW: [string, string][] = [
  ['https://example.com/feed.xml', 'ordinary https feed'],
  ['http://feeds.example.org/rss', 'plain http feed (a long tail of real feeds)'],
  ['https://1.1.1.1/', 'public IPv4 literal'],
  ['https://[2606:4700:4700::1111]/', 'public IPv6 literal'],
  // Prefix tests on a NAME rather than an address once refused these.
  ['https://fdrecords.com/feed.xml', 'public name starting fd'],
  ['https://fcc.gov/', 'public name starting fc'],
  ['https://fe80.example.com/', 'public name starting fe80'],
  // The edges of each refused range, so a widened or narrowed rule shows.
  ['http://172.32.0.1/', 'just above 172.16/12'],
  ['http://100.128.0.1/', 'just above 100.64/10'],
  ['http://223.255.255.1/', 'just below multicast'],
  ['http://198.20.0.1/', 'just above 198.18/15'],
];
for (const [url, why] of MUST_ALLOW) {
  refused(url) ? fail(`refused ${why}: ${url}`) : ok(`allowed ${why}: ${url}`);
}

// isPrivateIp is what the post-DNS check runs on every resolved address, in
// the forms the resolver hands back rather than the forms a URL parser makes.
for (const addr of ['127.0.0.1', '::ffff:127.0.0.1', '::ffff:7f00:1', '169.254.169.254', 'fe80::1%en0']) {
  isPrivateIp(addr) ? ok(`resolved address ${addr} counts as private`)
                    : fail(`resolved address ${addr} counts as public`);
}

// A limit the README states, pinned so the README cannot drift from the code:
// the port is not restricted, so a public host is reachable on any port.
refused('https://example.com:22/')
  ? fail('port 22 refused - the README says ports are NOT restricted; update it')
  : ok('known limit holds: a non-default port on a public host is allowed');

// --- 2. redirects: every hop is checked, and the caller cannot opt out ---

type Call = { url: string; init?: RequestInit };
const realFetch = globalThis.fetch;
function stubFetch(answer: (url: string, n: number) => Response): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return answer(url, calls.length);
  }) as typeof fetch;
  return calls;
}
const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });

// A public IP literal skips DNS, so these run offline.
const PUBLIC = 'http://93.184.215.14/feed.xml';

async function main() {
  {
    const calls = stubFetch(() => redirect('http://169.254.169.254/latest/meta-data/'));
    try { await safeFetch(PUBLIC, { redirect: 'follow' }); fail('redirect to metadata was followed'); }
    catch { calls.length === 1 ? ok('redirect to metadata refused before the second request')
                               : fail(`redirect to metadata made ${calls.length} requests`); }
    calls[0]?.init?.redirect === 'manual'
      ? ok("caller's redirect: 'follow' overridden to 'manual'")
      : fail(`redirect mode reached fetch as ${String(calls[0]?.init?.redirect)}`);
    calls[0]?.init?.cache === 'no-store'
      ? ok("cache forced to 'no-store'")
      : fail(`cache reached fetch as ${String(calls[0]?.init?.cache)}`);
  }
  {
    const calls = stubFetch(() => redirect('http://[::ffff:127.0.0.1]/'));
    try { await safeFetch(PUBLIC); fail('redirect to v4-mapped loopback was followed'); }
    catch { calls.length === 1 ? ok('redirect to v4-mapped loopback refused') : fail('second request made'); }
  }
  {
    const calls = stubFetch((_u, n) => n === 1 ? redirect('/moved.xml') : new Response('<rss/>'));
    try {
      const res = await safeFetch(PUBLIC);
      calls.length === 2 && calls[1].url === 'http://93.184.215.14/moved.xml' && res.status === 200
        ? ok('relative redirect resolved against the current hop and followed')
        : fail(`relative redirect went to ${calls[1]?.url}`);
    } catch (e) { fail(`relative public redirect refused: ${(e as Error).message}`); }
  }
  {
    // The stub gives up after 20 hops so a missing cap fails here, not hangs.
    const calls = stubFetch((_u, n) => n > 20 ? new Response('gave up') : redirect(PUBLIC));
    try { await safeFetch(PUBLIC); fail(`redirect loop not capped (${calls.length} requests)`); }
    catch { calls.length === 6 ? ok('redirect chain capped (1 request + 5 redirects)')
                               : fail(`redirect cap made ${calls.length} requests, expected 6`); }
  }
  {
    // A public host redirecting to another scheme. The literal IP skips DNS,
    // so only the per-hop scheme check stands between it and the request.
    const calls = stubFetch((_u, n) => n === 1 ? redirect('gopher://93.184.215.14/') : new Response('reached'));
    try { await safeFetch(PUBLIC); fail('redirect to gopher: was followed'); }
    catch { calls.length === 1 ? ok('redirect to another scheme refused before the second request')
                               : fail('redirect to gopher: reached fetch'); }
  }
  {
    const calls = stubFetch(() => new Response('never'));
    try { await safeFetch('http://does-not-exist.invalid/feed.xml'); fail('unresolvable host was fetched'); }
    catch { calls.length === 0 ? ok('unresolvable host refused without a request (fails closed)')
                               : fail('unresolvable host reached fetch'); }
  }
  {
    // A public NAME that resolves to loopback passes every literal check; only
    // the resolved-address check stops it.
    const calls = stubFetch(() => new Response('never'));
    try { await safeFetch('http://127.0.0.1.nip.io/feed.xml'); fail('nip.io name resolving to loopback was fetched'); }
    catch (e) {
      const m = (e as Error).message;
      if (calls.length) fail('nip.io name reached fetch');
      else if (m.includes('resolves to a private address')) ok('public name resolving to 127.0.0.1 refused after DNS');
      else console.log('SKIP   nip.io case: no DNS here (' + m + ')');
    }
  }
  globalThis.fetch = realFetch;

  // --- 3. the body cap counts bytes, it does not trust headers -----------

  const stream = (chunks: number, size: number) => new Response(new ReadableStream({
    start(c) { for (let i = 0; i < chunks; i++) c.enqueue(new Uint8Array(size).fill(65)); c.close(); },
  }));
  try { await readCappedText(stream(3, 4), 10); fail('12 streamed bytes passed a 10-byte cap'); }
  catch { ok('streamed body over the cap refused (no Content-Length to trust)'); }
  try { (await readCappedText(stream(3, 4), 12)).length === 12 ? ok('body at the cap read whole') : fail('body at cap misread'); }
  catch { fail('body exactly at the cap refused'); }
  try {
    await readCappedText(new Response('x', { headers: { 'content-length': String(1e12) } }), 1024);
    fail('declared 1 TB body was read');
  } catch { ok('declared length over the cap refused before reading'); }
  // A body with no stream is buffered whole before it can be measured, and is
  // still refused past the cap rather than handed over.
  const unstreamed = { headers: new Headers(), body: null, arrayBuffer: async () => new ArrayBuffer(20) };
  try { await readCappedText(unstreamed, 10); fail('20-byte unstreamed body passed a 10-byte cap'); }
  catch { ok('unstreamed body over the cap refused'); }
  const prefix = await readBytesUpTo(stream(3, 4), 5);
  prefix.bytes.length === 5 && prefix.truncated
    ? ok('readBytesUpTo stops at the cap and reports truncated')
    : fail(`readBytesUpTo gave ${prefix.bytes.length} bytes, truncated=${prefix.truncated}`);

  console.log(bad ? `\n${bad} FAILED` : '\nall passed');
  process.exit(bad ? 1 : 0);
}
main();
