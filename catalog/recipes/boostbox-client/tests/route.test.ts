/**
 * Proof that the route holds the key and forwards nothing it was not given.
 *
 * The route imports '@/lib/boostbox-types', so map that alias to files/ in
 * your tsconfig before running:
 *
 *   npm i -D tsx typescript
 *   npx tsx tests/route.test.ts
 */

import { POST } from '../files/route';

let bad = 0;
const fail = (m: string) => { console.log('FAIL   ' + m); bad++; };
const ok   = (m: string) => console.log('ok     ' + m);

const req = (body: unknown) =>
  new Request('http://localhost/api/boostbox', { method: 'POST', body: JSON.stringify(body) });

const VALID = { action: 'boost', split: 1, value_msat: 639000, value_msat_total: 639000,
                timestamp: new Date().toISOString(), message: 'hi', app_name: 'Test' };

// 1. Unconfigured: no key, no URL.
delete process.env.BOOSTBOX_API_KEY; delete process.env.BOOSTBOX_URL;
let r = await POST(req(VALID));
if (r.status !== 503) fail(`unconfigured returned ${r.status}, expected 503`); else ok('unconfigured refuses (503)');

// 2. The shipped default key is refused.
process.env.BOOSTBOX_API_KEY = 'v4v4me';
process.env.BOOSTBOX_URL = 'https://boostbox.example';
r = await POST(req(VALID));
if (r.status !== 503) fail(`default key returned ${r.status}, expected 503`);
else ok('the upstream default key v4v4me is refused');

process.env.BOOSTBOX_API_KEY = 'a-real-key';

// 3. Field validation.
const cases: [string, unknown, number][] = [
  ['missing action',            { ...VALID, action: undefined },          400],
  ['bogus action',              { ...VALID, action: 'steal' },            400],
  ['negative split',            { ...VALID, split: -1 },                  400],
  ['zero value_msat',           { ...VALID, value_msat: 0 },              400],
  ['fractional value_msat',     { ...VALID, value_msat: 1.5 },            400],
  ['non-date timestamp',        { ...VALID, timestamp: 'whenever' },      400],
  ['array body',                [],                                       400],
];
for (const [name, body, expected] of cases) {
  const res = await POST(req(body));
  if (res.status !== expected) fail(`${name}: got ${res.status}, expected ${expected}`);
}
ok(`${cases.length} malformed bodies all rejected with 400`);

// 4. Unknown fields never reach upstream.
let sent: any = null;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init: any) => {
  sent = { url: String(url), headers: init.headers, body: JSON.parse(init.body) };
  return new Response(JSON.stringify({ id: 'x', url: 'https://b/x', desc: 'rss::payment::boost https://b/x hi' }),
                      { status: 201, headers: { 'content-type': 'application/json' } });
}) as any;

r = await POST(req({ ...VALID, evil: 'drop table', __proto__: { polluted: true }, position: 42 }));
globalThis.fetch = realFetch;

if (r.status !== 201) fail(`valid submission returned ${r.status}`); else ok('valid submission returns 201');
if (sent.url !== 'https://boostbox.example/boost') fail(`sent to ${sent.url}`); else ok('sent to the configured host, not one from the request');
if (sent.headers['X-Api-Key'] !== 'a-real-key') fail('api key header missing'); else ok('X-Api-Key attached server-side');
if ('evil' in sent.body) fail('unknown field forwarded upstream'); else ok('unknown fields dropped, not forwarded');
if (sent.body.position !== 42) fail('documented optional field dropped'); else ok('documented optional fields pass through');
if (sent.body.message !== 'hi') fail('message dropped');

console.log(bad === 0 ? 'ALL ROUTE TESTS PASSED' : `${bad} FAILURES`);
process.exit(bad === 0 ? 0 : 1);
