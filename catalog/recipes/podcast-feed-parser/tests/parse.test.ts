/**
 * Checks for the claims in this recipe's README, run against the shipped files.
 *
 * The source repo has its own 924-line suite and a 24-feed round-trip corpus;
 * those test the editor around this parser too, so they are not copied here.
 * This file pins what a stranger needs to know: which tags come out typed,
 * which come out as raw pass-through, the three places the parser changes
 * what the feed says, and the one MSP rewrite this recipe removed.
 *
 *   npm i -D tsx typescript fast-xml-parser
 *   npx tsx tests/parse.test.ts
 */

import { parseRssFeed, isPublisherFeed, parsePublisherRssFeed } from '../files/utils/xmlParser';

let bad = 0;
const fail = (m: string) => { console.log('FAIL   ' + m); bad++; };
const ok = (m: string) => console.log('ok     ' + m);
const eq = (got: unknown, want: unknown, m: string) =>
  JSON.stringify(got) === JSON.stringify(want) ? ok(m) : fail(`${m}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const LEGACY_NODE = '035ad2c954e264004986da2d9499e1732e5175e1dcef2453c921c6cdcc3536e9d8';
const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
<channel>
  <title>Album &amp; Co</title>
  <description>An album</description>
  <link>https://example.com</link>
  <podcast:guid>4c1f8e2b-0d6a-5a91-8e35-7b9c2d4f6a10</podcast:guid>
  <podcast:medium>music</podcast:medium>
  <podcast:person role="vocals" href="https://example.com/ann">Ann</podcast:person>
  <podcast:value type="lightning" method="keysend" suggested="0.00000005">
    <podcast:valueRecipient name="Band" type="node" address="02aaaa" split="90"/>
    <podcast:valueRecipient name="Old support node" type="node" address="${LEGACY_NODE}" split="5"/>
    <podcast:valueRecipient name="Addr" type="node" address="band@example.com" split="5" customKey="696969" customValue="0012345"/>
    <podcast:valueTimeSplit startTime="10" duration="30" remotePercentage="90">
      <podcast:remoteItem feedGuid="aa" itemGuid="0012345"/>
    </podcast:valueTimeSplit>
  </podcast:value>
  <podcast:podroll><podcast:remoteItem feedGuid="bb"/></podcast:podroll>
  <podcast:publisher>
    <podcast:remoteItem medium="publisher" feedGuid="7f2e9c11-4b83-5e07-9d62-3a1f5c8b0e94" feedUrl="https://example.com/pub.xml"/>
  </podcast:publisher>
  <podcast:funding url="https://example.com/support">Support</podcast:funding>
  <podcast:futureTag foo="1">kept</podcast:futureTag>
  <podcast:liveItem status="live" start="2026-11-24T00:00:00Z"><title>Live</title></podcast:liveItem>
  <item>
    <title>One</title>
    <pubDate>Mon, 23 Nov 2026 12:00:00 GMT</pubDate>
    <guid isPermaLink="false">d2b7f014-3a58-4c6e-9f21-8ad5c3e70b46</guid>
    <enclosure url="https://op3.dev/e/https://example.com/1.mp3" length="5000000" type="audio/mpeg"/>
    <podcast:transcript url="https://example.com/1.srt" type="application/x-subrip"/>
    <podcast:chapters url="https://example.com/1.json" type="application/json+chapters"/>
  </item>
  <item>
    <title>No guid</title>
    <enclosure url="https://example.com/2.mp3" length="0" type="audio/mpeg"/>
  </item>
</channel>
</rss>`;

const a = parseRssFeed(feed);

// --- typed -----------------------------------------------------------------
eq(a.title, 'Album & Co', 'title, entities decoded');
eq(a.podcastGuid, '4c1f8e2b-0d6a-5a91-8e35-7b9c2d4f6a10', 'podcast:guid');
eq(a.medium, 'music', 'podcast:medium');
eq(a.persons.map(p => [p.name, p.href, p.roles[0]?.role]), [['Ann', 'https://example.com/ann', 'vocals']], 'podcast:person');
eq(a.value.suggested, '0.00000005', 'value suggested kept as a string');
eq(a.value.recipients[0], { name: 'Band', address: '02aaaa', split: 90, type: 'node' }, 'valueRecipient');
eq([a.value.recipients[2].type, a.value.recipients[2].customValue], ['lnaddress', '0012345'],
   'an address with @ is typed lnaddress; customValue keeps its leading zeros');
eq(a.funding, [{ url: 'https://example.com/support', text: 'Support' }], 'podcast:funding');
eq(a.publisher, { feedGuid: '7f2e9c11-4b83-5e07-9d62-3a1f5c8b0e94', feedUrl: 'https://example.com/pub.xml' }, 'podcast:publisher remoteItem');
eq(a.tracks[0].guid, 'd2b7f014-3a58-4c6e-9f21-8ad5c3e70b46', 'item guid');
eq(a.tracks[0].transcriptUrl, 'https://example.com/1.srt', 'podcast:transcript');

// --- carried, not parsed --------------------------------------------------
const vts = a.value.unknownElements?.['podcast:valueTimeSplit'] as Record<string, unknown> | undefined;
eq((vts?.['podcast:remoteItem'] as Record<string, string> | undefined)?.['@_itemGuid'], '0012345',
   'valueTimeSplit is raw pass-through (fast-xml-parser shape), ids kept as strings');
eq(Object.keys(a.unknownChannelElements ?? {}).sort(), ['podcast:futureTag', 'podcast:liveItem', 'podcast:podroll'],
   'podroll, liveItem and an unknown future tag are raw pass-through on the channel');
eq(Object.keys(a.tracks[0].unknownItemElements ?? {}), ['podcast:chapters'], 'chapters is raw pass-through on the item');

// --- payment destinations come back as the feed names them -----------------
// MSP's own copy rewrites a recipient paying the legacy MSP 1.0 support node
// into MSP 2.0's Lightning address. This recipe removes that rewrite (the
// 'fixes' entry in feature.json); pinned so it cannot come back unnoticed.
eq(a.value.recipients[1], { name: 'Old support node', address: LEGACY_NODE, split: 5, type: 'node' },
   'the legacy MSP 1.0 node is returned as the feed names it, not rewritten to MSP 2.0');

// --- the three places the parse changes what the feed says -----------------
// Pinned so the README's caveats cannot drift from the code.
eq([a.tracks[0].enclosureUrl, a.op3], ['https://example.com/1.mp3', true],
   'KNOWN: the OP3 analytics prefix is stripped from enclosures, and album.op3 records that it was there');
const again = parseRssFeed(feed);
a.tracks[1].guid && a.tracks[1].guid !== again.tracks[1].guid
  ? ok('KNOWN: an item with no <guid> gets a random UUID, different on every parse')
  : fail('item with no guid: README says the guid is random per parse');
eq(parseRssFeed(feed.replace('<podcast:medium>music</podcast:medium>', '')).medium, 'music',
   'KNOWN: a feed with no podcast:medium comes back as music');

// --- publisher feeds and refusals ------------------------------------------
const pub = `<?xml version="1.0"?><rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0"><channel>
  <title>Label</title><podcast:guid>7f2e9c11-4b83-5e07-9d62-3a1f5c8b0e94</podcast:guid><podcast:medium>publisher</podcast:medium>
  <podcast:remoteItem medium="music" feedGuid="4c1f8e2b-0d6a-5a91-8e35-7b9c2d4f6a10" feedUrl="https://example.com/album.xml"/>
</channel></rss>`;
isPublisherFeed(pub) && !isPublisherFeed(feed) ? ok('isPublisherFeed tells the two apart') : fail('isPublisherFeed wrong');
eq(parsePublisherRssFeed(pub).remoteItems.map(r => r.feedGuid), ['4c1f8e2b-0d6a-5a91-8e35-7b9c2d4f6a10'], 'publisher feed lists its albums');
try { parseRssFeed('<html><body>not a feed</body></html>'); fail('HTML accepted as a feed'); }
catch { ok('a document with no rss/channel is refused'); }

console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
