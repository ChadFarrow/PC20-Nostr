# Podcast feed parser

Turns a Podcasting 2.0 RSS feed into typed data: the channel and its items,
value blocks and their recipients, persons, funding, the publisher link,
block and locked, images and transcripts. One package, pure functions, no
network I/O in the parse.

Of the RSS parsers across the five live sites, this is the one to take. It is
the only full parser that compiles on its own, it is tested in its own repo
(924 lines, plus a 24-feed round-trip corpus), and it **keeps what it does not
understand** — every tag it has no field for comes back raw rather than
vanishing. Boost Me Bitch's parsing is as well tested, but its typed output is
built inside a 2,726-line file with a dozen app imports. Why the others lost:
[`../../comparisons/feed-parsing.md`](../../comparisons/feed-parsing.md).

**Running at** <https://musicsideproject.com> (MSP 2.0), where every feed
import goes through it.

## Difficulty: wired

Eight files, one package, and four places where the parse changes what the
feed says — one of them a payment destination, which you delete on install
(see [What to rename](#what-to-rename)). Read
[What will bite you](#what-will-bite-you) before you pay anyone from its
output.

## What you get

| File | Put it at |
|---|---|
| `files/utils/xmlParser.ts` | `lib/feed/utils/xmlParser.ts` |
| `files/types/feed.ts` | `lib/feed/types/feed.ts` |
| `files/utils/publisherParties.ts` | `lib/feed/utils/publisherParties.ts` |
| `files/utils/urlValidation.ts` | `lib/feed/utils/urlValidation.ts` |
| `files/utils/comparison.ts` | `lib/feed/utils/comparison.ts` |
| `files/utils/addressUtils.ts` | `lib/feed/utils/addressUtils.ts` |
| `files/utils/audioUtils.ts` | `lib/feed/utils/audioUtils.ts` |
| `files/utils/videoUtils.ts` | `lib/feed/utils/videoUtils.ts` |

2,706 lines. The parser is 1,243 of them and the types 830; the other six come
along because the parser imports them. `audioUtils` and `videoUtils` (325
lines) are there for one constant. The prefix `lib/feed/` is yours to change,
but **keep `utils/` and `types/` as siblings** — the files import each other by
relative path.

```ts
import { parseRssFeed, isPublisherFeed, parsePublisherRssFeed } from '@/lib/feed/utils/xmlParser';

const album = parseRssFeed(xml);             // throws on a document with no rss/channel
album.value.recipients;                       // [{ name, address, split, type, customKey?, customValue?, fee? }]
album.tracks[0].value;                        // item-level value block, when the item has one
album.unknownChannelElements;                 // every channel tag it does not model, raw

if (isPublisherFeed(xml)) parsePublisherRssFeed(xml).remoteItems;  // a label's list of albums
```

## What you need

`npm i fast-xml-parser@^5.3.3`. TypeScript strict passes with nothing else, but
your `tsconfig` `lib` must include `DOM`. It runs in a browser or on Node 19+
(it calls the global `crypto.randomUUID`).

**Fetching is yours.** `parseRssFeed` takes a string. On a server, a feed URL
is user-supplied, so fetch it with
[`safe-feed-fetch`](../safe-feed-fetch/) — a plain `fetch(url)` there is an
SSRF hole.

## What it reads, and what it only carries

| Typed fields | Raw pass-through |
|---|---|
| `podcast:guid`, `podcast:medium`, `podcast:value` + `valueRecipient`, `podcast:person`, `podcast:funding`, `podcast:publisher`, `podcast:block`, `itunes:block`, `podcast:locked`, `itunes:image`, `podcast:image(s)`, `podcast:transcript`, `podcast:alternateEnclosure`, `podcast:txt` (npub only) | `podcast:valueTimeSplit` (in `value.unknownElements`), `podcast:podroll`, `podcast:liveItem`, `podcast:chapters`, and every tag it has never heard of |

Pass-through is fast-xml-parser's object shape: attributes under `@_` keys,
text under `#text`. If you need value time splits — songs inside a podcast
episode paying their artists — you read them out of
`value.unknownElements['podcast:valueTimeSplit']` yourself. No live site has a
portable parser that types them.

**Values stay strings.** The parser never coerces, so an `itemGuid` or a
`customValue` of `0012345` keeps its leading zeros. A coercing parser turns it
into `12345` — a different payment target.

## What to rename

Four entries in `feature.json` `rename`. The one that matters:

**Delete `files/utils/xmlParser.ts` lines 538–545. They rewrite a payment
recipient.** A recipient paying the legacy MSP 1.0 support node (one fixed node
pubkey) comes back as MSP 2.0's Lightning address,
`musicsideproject@getalby.com`, with the same split. MSP's own comment says it
does this so support payments keep flowing after a feed is imported into MSP's
editor. In any other app it means the parse returns a destination the feed does
not contain. The recipe ships the file unchanged because it is byte-identical
to what MSP runs; the `rename` entry tells an agent to delete the block.

The other three are MSP's hosts and route in `fetchFeedFromUrl`
(`isMspUrl` at 1051, `/api/proxy-feed` at 1121). Delete `fetchFeedFromUrl` and
`isMspUrl` if you fetch the XML yourself, which you should on a server.

## What will bite you

**OP3 prefixes are stripped.** An enclosure URL like
`https://op3.dev/e/https://host/ep.mp3` comes back as `https://host/ep.mp3`,
and `album.op3` is set to `true`. MSP strips it so its editor can show the real
file and re-add the prefix on save. A *player* that plays `enclosureUrl` as
returned takes every play out of the podcaster's OP3 statistics. When
`album.op3` is true, put the prefix back before you play.

**An item with no `<guid>` gets a random UUID on every parse.** It is an
editor default, not an identity. Never key storage, favorites or boosts on
`track.guid` unless the feed actually had one.

**Missing values are filled in.** No `podcast:medium` comes back as
`'music'`; no `pubDate` becomes the time of the parse. And `medium` is typed
`'music' | 'video'` but holds whatever string the feed has — `'podcast'`,
`'publisher'` — so do not trust the type in a `switch`.

**The model is MSP's.** A channel is an `Album` and an item is a `Track`. A
podcast feed parses fine into it; the field names just say album.

## Tests

`tests/parse.test.ts` pins every claim above, the four rewrites included, so
this README cannot drift from the code. It passes on the file as shipped and
again after you delete the MSP block, and says which one it saw:

```bash
npm i -D tsx typescript fast-xml-parser
npx tsx tests/parse.test.ts
```

## Provenance

`MSP-2.0` `origin/master` at `b2216ec`, byte-identical. MIT. Rows in
[`../../PROVENANCE.tsv`](../../PROVENANCE.tsv);
[`../../check-drift.sh`](../../check-drift.sh) re-checks them.
