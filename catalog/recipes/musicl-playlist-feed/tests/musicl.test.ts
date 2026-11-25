/**
 * Checks for the claims in this recipe's README, run against the shipped files.
 *
 *   npm i -D tsx typescript fast-xml-parser
 *   npx tsx tests/musicl.test.ts
 *
 * fast-xml-parser is for this test only (to prove the output is well-formed
 * XML); the recipe itself needs no package.
 */

import { XMLValidator } from 'fast-xml-parser';
import {
  buildMinimalPlaylistXml, remoteItemTracks, parseRemoteItems, isListMedium, isUuid, PODCAST_NS,
} from '../files/musicl-feed';
import { podcastGuidFromUrl, playlistGuid, checkMinimalPlaylistIds } from '../files/musicl-guid';

let bad = 0;
const fail = (m: string) => { console.log('FAIL   ' + m); bad++; };
const ok = (m: string) => console.log('ok     ' + m);
const eq = (got: unknown, want: unknown, m: string) =>
  JSON.stringify(got) === JSON.stringify(want) ? ok(m) : fail(`${m}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// The worked example in the podcast:guid tag's own documentation: the feed
// at mp3s.nashownotes.com/pc20rss.xml has guid 917393e3-...-edaa54e1f810.
// Scheme and trailing slashes are not part of the name.
const PC20 = '917393e3-1b1e-5cef-ace4-edaa54e1f810';
eq(podcastGuidFromUrl('https://mp3s.nashownotes.com/pc20rss.xml'), PC20, 'UUIDv5 matches the podcast:guid spec example');
eq(podcastGuidFromUrl('http://mp3s.nashownotes.com/pc20rss.xml/'), PC20, 'scheme and trailing slash ignored');
eq(podcastGuidFromUrl(''), '', 'empty URL gives no guid');

// A playlist keeps one guid for life: the caller's, or the one its own URL
// gives. Never one minted per build.
const OWN = '3f1d0c52-7a9e-4b8f-9c61-2d5e8a7b4c10';
eq(playlistGuid(OWN.toUpperCase()), OWN, "caller's guid kept, lower-cased");
eq(playlistGuid('not-a-uuid', 'https://mp3s.nashownotes.com/pc20rss.xml'), PC20, 'no valid guid: derived from the playlist URL');
eq(playlistGuid(null, null), null, 'no guid and no URL: null, so the caller must refuse');
eq(checkMinimalPlaylistIds({}).ok, false, 'checkMinimalPlaylistIds refuses a playlist with no identity');
const badPub = checkMinimalPlaylistIds({ guid: OWN, publisherFeedGuid: 'nope' });
eq(badPub.ok ? 'accepted' : badPub.field, 'publisherFeedGuid', 'a bad publisher guid is refused and the field named');

const TRACKS = [
  { feedGuid: '4c1f8e2b-0d6a-5a91-8e35-7b9c2d4f6a10', itemGuid: 'd2b7f014-3a58-4c6e-9f21-8ad5c3e70b46' },
  { feedGuid: '4c1f8e2b-0d6a-5a91-8e35-7b9c2d4f6a10', itemGuid: 'track "2" & <more>' },
  { feedGuid: '', itemGuid: 'dropped: no feed guid' },
];
const xml = buildMinimalPlaylistXml({
  guid: OWN,
  title: 'Rock & <Roll> "Mix"',
  author: "Chad's list",
  description: 'Ten songs\u0001 with a control character',
  link: 'https://example.com/playlists/rock',
  imageUrl: 'https://example.com/a.jpg?x=1&y=2',
  publisher: { feedGuid: '7f2e9c11-4b83-5e07-9d62-3a1f5c8b0e94', feedUrl: 'https://example.com/pub.xml' },
  tracks: TRACKS,
});

XMLValidator.validate(xml) === true ? ok('output is well-formed XML') : fail('output is not well-formed XML');
xml.includes(`xmlns:podcast="${PODCAST_NS}"`) ? ok('podcast namespace is the podcastindex.org URI') : fail('wrong namespace');
xml.includes('<podcast:medium>musicL</podcast:medium>') ? ok('medium defaults to musicL') : fail('medium missing');
xml.includes(`<podcast:guid>${OWN}</podcast:guid>`) ? ok('playlist guid written') : fail('guid missing');
xml.includes('<title>Rock &amp; &lt;Roll&gt; &quot;Mix&quot;</title>') ? ok('title escaped') : fail('title not escaped');
!xml.includes('\u0001') ? ok('XML-forbidden control character removed') : fail('control character written');

const tracks = remoteItemTracks(xml);
eq(tracks.map(t => t.itemGuid), [TRACKS[0].itemGuid, TRACKS[1].itemGuid], 'tracks read back, attributes unescaped, empty feed guid dropped');
const all = parseRemoteItems(xml);
eq(all.filter(r => !r.itemGuid).map(r => r.medium), ['publisher'], 'publisher back-link is a remoteItem but not a track');

// The reader takes attributes by name, in any order and either quote.
eq(remoteItemTracks(`<podcast:remoteItem itemGuid='b' medium="music" feedGuid='a' />`),
   [{ feedGuid: 'a', itemGuid: 'b', medium: 'music' }], 'reader is order- and quote-independent');

try { buildMinimalPlaylistXml({ guid: 'not-a-uuid', title: '', author: '', description: '', link: '', tracks: [] }); fail('non-UUID guid accepted'); }
catch { ok('writer refuses a non-UUID playlist guid'); }
try { buildMinimalPlaylistXml({ guid: OWN, title: '', author: '', description: '', link: '', tracks: [], publisher: { feedGuid: 'x' } }); fail('non-UUID publisher accepted'); }
catch { ok('writer refuses a non-UUID publisher guid'); }

eq(['musicL', 'podcastL', 'mixed', 'music', 'fooL'].map(isListMedium), [true, true, true, false, false], 'list mediums are an allowlist, not endsWith("L")');
eq(isUuid('0190b7a2-6c1e-7d3f-8a4b-123456789abc'), true, 'UUIDv7 accepted');

console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
