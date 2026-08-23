/**
 * Proof for the two claims this recipe's README makes about safety.
 *
 * Run it. A recipe whose value proposition is safety should not ask you to
 * take the paragraph's word for it - that is how the image proxy in this
 * catalog shipped an SSRF guard that did not guard.
 *
 *   npm i -D tsx typescript bech32 light-bolt11-decoder
 *   npx tsx tests/guards.test.ts
 */

import { isBlockedHost, assertInvoiceMatches } from '../files/lnurl-service';

let bad = 0;
const fail = (m: string) => { console.log('FAIL   ' + m); bad++; };
const ok = (m: string) => console.log('ok     ' + m);

/** Must never be requested. */
const MUST_BLOCK = [
  'localhost', 'LOCALHOST', 'localhost.', 'foo.internal', 'db.local',
  '127.0.0.1', '127.1.2.3', '10.0.0.1', '172.16.0.1', '172.31.255.255',
  '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '198.18.0.1',
  '224.0.0.1', '255.255.255.255',
  '[::1]', '[::]', '[fc00::1]', '[fd12:3456::1]', '[fe80::1]', '[febf::1]',
  // One address, three spellings. A guard that knows only the dotted form
  // lets the other two through - the bypass the image proxy shipped.
  '[::ffff:127.0.0.1]', '[::ffff:7f00:1]', '[0:0:0:0:0:ffff:7f00:1]',
  // Cloud metadata behind a mapped address, both spellings.
  '[::ffff:169.254.169.254]', '[::ffff:a9fe:a9fe]',
];

/** Must still work. A guard that blocks real wallets is not shipped twice. */
const MUST_ALLOW = [
  'getalby.com', 'strike.me', 'zbd.gg', 'example.co.uk',
  '8.8.8.8', '1.1.1.1', '[2001:4860:4860::8888]',
];

for (const h of MUST_BLOCK) if (!isBlockedHost(h)) fail(`${h} was allowed`);
for (const h of MUST_ALLOW) if (isBlockedHost(h)) fail(`${h} was blocked`);
ok(`${MUST_BLOCK.length} private hosts refused, ${MUST_ALLOW.length} real hosts allowed`);

// The money bug: ask for 100 sats, be handed an invoice for 1,500.
const INVOICE_1500_SAT =
  'lnbc15u1p3xnhl2pp5jptserfk3zk4qy42tlucycrfwxhydvlemu9pqr93tuzlv9cc7g3sdqsvfhkcap3xyhx7un8' +
  'cqzpgxqzjcsp5f8c52y2stc300gl6s4xswtjpc37hrnnr3c9wvtgjfuvqmpm35evq9qyyssqy4lgd8tj637qcjp05' +
  'rdpxxykjenthxftej7a2zzmwrmrl70fyj9hvj0rewhzj7jfyuwkwcg9g2jpwtk3wkjtwnkdks84hsnu8xps5vsq4gj5hs';

try {
  assertInvoiceMatches(INVOICE_1500_SAT, 100_000);
  fail('a 1,500,000 msat invoice was accepted against a 100,000 msat request');
} catch (e) {
  const m = (e as Error).message;
  if (m.includes('does not match')) ok('overcharge refused: ' + m);
  else fail('overcharge refused for the wrong reason: ' + m);
}

// This invoice is years old, so the expiry guard fires before the amount one.
// What matters is that a matching amount is not rejected AS a mismatch.
try {
  assertInvoiceMatches(INVOICE_1500_SAT, 1_500_000);
  ok('matching amount accepted');
} catch (e) {
  const m = (e as Error).message;
  if (m.includes('expired')) ok('expiry guard fired on a stale invoice');
  else fail('matching amount rejected for the wrong reason: ' + m);
}

console.log(bad === 0 ? 'ALL GUARD TESTS PASSED' : `${bad} FAILURES`);
process.exit(bad === 0 ? 0 : 1);
