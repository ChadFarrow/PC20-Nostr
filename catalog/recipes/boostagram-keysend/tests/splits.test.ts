/**
 * Proof for the properties comparisons/boostagram-tlv.md says the production
 * implementation lacks. This recipe is authored, so no site's traffic vouches
 * for it - these do instead.
 *
 *   npm i -D tsx typescript
 *   npx tsx tests/splits.test.ts
 */

import { splitBoost, totalAllocated, type ValueRecipient } from '../files/boost-splits';
import { buildKeysendPayments, TLV_BOOSTAGRAM, TLV_FEED_GUID } from '../files/boostagram-tlv';
import { parseBoostagram, groupByBoost } from '../files/boostagram-parse';

let bad = 0;
const fail = (m: string) => { console.log('FAIL   ' + m); bad++; };
const ok = (m: string) => console.log('ok     ' + m);

const node = (c: string, split: number): ValueRecipient =>
  ({ address: c.repeat(66).slice(0, 66), type: 'node', split });
const A = node('a', 60), B = node('b', 30), C = node('c', 10);

// A total share of zero makes floor(amount * share / 0) produce NaN for every
// recipient, and a NaN amount reaches a wallet as garbage.
try { splitBoost(1000, [node('a', 0), node('b', 0)]); fail('zero total accepted'); }
catch { ok('zero total refused rather than paying NaN'); }

// Shares [-1, 2] make a naive remainder pay destination B twice the boost.
try { splitBoost(1000, [node('a', -1), node('b', 2)]); fail('negative share accepted'); }
catch { ok('negative share refused rather than over-paying the last recipient'); }

// Integer division loses sats on most three-way splits unless the last
// recipient takes the remainder.
for (const amount of [1000, 999, 1, 7, 33333]) {
  const parts = splitBoost(amount, [A, B, C]);
  if (totalAllocated(parts) !== amount) fail(`${amount} sats split to ${totalAllocated(parts)}`);
}
ok('three-way splits of 1000, 999, 1, 7 and 33333 sats each add back up exactly');

const { payments, lnAddressRecipients } = buildKeysendPayments(
  splitBoost(1000, [A, B, C]),
  { appName: 'Test App', feedId: 12345, feedGuid: 'a-feed-guid', podcast: 'Show', senderName: 'someone', message: 'hi' }
);
const grams = payments.map((p) => JSON.parse(p.tlvRecords[TLV_BOOSTAGRAM]));

if (payments.length !== 3) fail(`expected 3 payments, got ${payments.length}`);
if (new Set(grams.map((g) => g.boost_uuid)).size !== 1) fail('boost_uuid is not shared');
else ok('one boost_uuid across the splits, so a receiver can reassemble them');
if (new Set(grams.map((g) => g.uuid)).size !== 3) fail('uuids are not distinct');
else ok('a separate uuid per payment');
if (!payments.every((p) => p.tlvRecords[TLV_FEED_GUID] === 'a-feed-guid')) fail('record 7629175 missing');
else ok('record 7629175 carries the feed guid');
if (grams.some((g) => g.value_msat_total !== 1_000_000)) fail('value_msat_total is not the whole boost');
else ok('value_msat_total is the whole boost, value_msat the slice');

// The two things the production copy compiles in, and this one refuses to.
try { buildKeysendPayments(splitBoost(100, [A]), { appName: '', feedId: 1 }); fail('empty appName accepted'); }
catch { ok('empty appName refused - no default to somebody else\'s app'); }
try { buildKeysendPayments(splitBoost(100, [A]), { appName: 'x', feedId: '' }); fail('empty feedId accepted'); }
catch { ok('empty feedId refused - no guessing which show was boosted'); }

// A value block mixing node pubkeys and Lightning addresses is normal.
const mixed = buildKeysendPayments(
  splitBoost(1000, [A, { address: 'someone@getalby.com', type: 'lnaddress', split: 50 }]),
  { appName: 'Test App', feedId: 1 }
);
if (mixed.lnAddressRecipients.length !== 1) fail('lightning address recipient was dropped');
else ok('lightning address recipients returned, not silently dropped');

// Round trip through the decoder.
const parsed = payments
  .map((p) => parseBoostagram(p.tlvRecords))
  .filter((p): p is NonNullable<typeof p> => p !== null);
if (parsed.length !== 3) fail(`round trip parsed ${parsed.length}/3`);
else if (parsed.reduce((s, p) => s + p.sats, 0) !== 1000) fail('round-trip sats do not add up');
else ok('round trip: 3 payments parsed back, 1000 sats total');
if (groupByBoost(parsed).size !== 1) fail('regrouping produced more than one boost');
else ok('three payments regrouped into one boost');

// Inbound records come from strangers. parseInt on a non-numeric value yields
// NaN, and one NaN poisons any total computed by summing boosts.
const JUNK = [
  {}, { [TLV_BOOSTAGRAM]: 'not json' }, { [TLV_BOOSTAGRAM]: '{"app_name":"x"}' },
  { [TLV_BOOSTAGRAM]: '{"app_name":"x","feedID":1,"value_msat":"abc"}' },
  { [TLV_BOOSTAGRAM]: '[]' }, { [TLV_BOOSTAGRAM]: 'null' },
];
for (const junk of JUNK) {
  try {
    const r = parseBoostagram(junk as Record<string, string>);
    if (r && !Number.isFinite(r.sats)) fail('parse produced NaN sats from ' + JSON.stringify(junk));
  } catch { fail('parse threw on ' + JSON.stringify(junk)); }
}
ok(`${JUNK.length} malformed inbound records: no throw, no NaN`);

console.log(bad === 0 ? 'ALL BOOSTAGRAM TESTS PASSED' : `${bad} FAILURES`);
process.exit(bad === 0 ? 0 : 1);
