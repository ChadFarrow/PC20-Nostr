# RSS feed parsing

Turning a podcast or music RSS feed into typed albums, tracks, value blocks,
persons, chapters and remote items — and fetching it safely first.

**Shipped** as [`../recipes/podcast-feed-parser/`](../recipes/podcast-feed-parser/),
with [`../recipes/safe-feed-fetch/`](../recipes/safe-feed-fetch/) for the fetch,
[`../recipes/chapters-json/`](../recipes/chapters-json/) and
[`../recipes/musicl-playlist-feed/`](../recipes/musicl-playlist-feed/). This page
says why those copies won.

**The sites do not parse feeds the same way.** They share the Podcast Index
auth header ([podcast-index-auth.md](podcast-index-auth.md)) and one fork pair,
DoerfelVerse and Project StableKraft. Past that, each reads XML its own way.

## Where it lives

Read at `origin/HEAD` on 2026-11-24.

| Site | Repo | Path | Lines | How it reads XML | Tests beside it | Read at |
|---|---|---|---|---|---|---|
| MSP 2.0 | `MSP-2.0` | `src/utils/xmlParser.ts` | 1243 | `fast-xml-parser` object tree | 924 lines, plus a 24-feed round-trip corpus | `b2216ec` |
| Boost Me Bitch | `boostmebitch` | `lib/feed-xml.ts` + `lib/pi.ts` | 1160 + 2726 | its own string scanner, no XML library | plain-Node check scripts, e.g. `check-value-time-split` 1316 lines | `815c551f` |
| Project StableKraft | `stablekraft-app` | `lib/rss-parser-db.ts` | 1766 | `rss-parser` + `fast-xml-parser` + regex | 3 files, 329 lines | `826bc612` |
| Project StableKraft | `stablekraft-app` | `lib/rss-parser/` | 805 + 317 | DOM (`@xmldom/xmldom`, browser `DOMParser`) | none | `826bc612` |
| DoerfelVerse | `ITDV-Lightning` | `lib/rss-parser.ts` | 1952 | DOM (`@xmldom/xmldom`, browser `DOMParser`) | none | `da54fd3` |

StableKraft also parses with `xml2js` in `lib/music-track-parser/` (about
1,240 lines) and reads value blocks a fourth time in
`lib/lightning/value-parser.ts` (302 lines). That is four XML approaches in one
app, and a fix to one reaches none of the others.

`lib/feed-parser.ts` — a batch orchestrator with no XML of its own — is in both
DoerfelVerse (472 lines) and StableKraft (471). The two differ by 37 lines,
about 96% identical: one of the few files those two sites have not driven
apart.

The fifth site, `candr.space`, is a private repo and is not compared here.

## What each one reads

From reading each parser at the SHA above. The MSP column is also pinned by
the recipe's tests; the others were read, not run.

| Tag | MSP `xmlParser` | BMB `feed-xml` + `pi` | SK `rss-parser-db` | SK `rss-parser/` | ITDV `rss-parser` |
|---|---|---|---|---|---|
| `podcast:guid` | yes | yes ¹ | yes | — | yes |
| `podcast:medium` | yes | yes | yes | — | remoteItem attribute only |
| `podcast:value` + `valueRecipient` | yes | yes | yes | stub | yes ² |
| `podcast:valueTimeSplit` | raw | yes | yes | — | — |
| `podcast:remoteItem` | yes | yes | yes | yes | yes |
| `podcast:podroll` | raw | yes | — | stub | yes |
| `podcast:publisher` | yes | yes | yes | stub | yes |
| `podcast:chapters` | raw | yes | yes, fetches the JSON | — | video and channel paths |
| `podcast:transcript` | yes | yes | — | — | — |
| `podcast:person` | yes | npub only | yes | — | — |
| `podcast:liveItem` | raw | yes | — | yes | — |
| `podcast:block` | yes | — | yes | — | — |
| `podcast:funding` | yes | yes | yes | stub | yes |
| `podcast:txt` (npub) | yes | yes | yes | — | not checked |

*raw* — kept unparsed in the output, in the XML library's object shape, so
nothing is lost but you read it yourself. *stub* — the function exists and
returns nothing.

¹ From Podcast Index JSON in most paths; from the RSS only when resolving a
musicL playlist.
² A channel with no value block takes the first item's: channel lookups use
`getElementsByTagName(…)[0]`, which also searches the items (`:424`, `:941`).

## Which one to take

**MSP 2.0's `xmlParser.ts`**, shipped as the recipe. It is the only full parser
that compiles on its own: with seven sibling files it passes strict TypeScript
with nothing but `fast-xml-parser` (checked 2026-11-24). It is tested, keeps
every value a string so `0012345` stays `0012345`, and keeps every tag it does
not model.

Its gaps are named in the recipe, not hidden: it carries `valueTimeSplit`,
`podroll`, `liveItem` and `chapters` raw rather than typing them, it rewrites
the legacy MSP 1.0 support node to MSP 2.0's address, it strips OP3 prefixes
from enclosures, and it invents a random guid for an item that has none.

**Boost Me Bitch reads the most tags**, value time splits included, and its
check scripts are thorough. But the typed output is built inside `lib/pi.ts`,
2,726 lines with about a dozen app imports, including a 5,960-line
`lib/util.ts`. `lib/feed-xml.ts` lifts out almost alone, but it is a toolkit
of scanners (`findTags`, `channelSlice`, `parsePlaylistRemoteItems`), not a
parser that returns a feed.

**StableKraft's modular parser is still stubbed.** `extractFunding`,
`extractPodroll` and `extractValue4Value` return nothing, and
`parsePublisherFeedInfo` logs "not implemented". A value-for-value app cannot
use a parser whose value extraction is empty.

**DoerfelVerse's has content policy compiled in.** About 350 lines
(`:1108-1460`, plus branches at `:446`, `:773`, `:803`) are keyed on specific
album titles. It has the channel-scoping bug above, no tests, and its fetch
fallback calls `/api/fetch-rss`, a route that does not exist in the repo.

**No live site has a portable parser that types `podcast:valueTimeSplit`.**
Boost Me Bitch and StableKraft both parse it, inside files that cannot leave
their apps. That is the next extraction worth doing.

## The public APIs differ

`parseAlbumFeed` takes `(feedUrl, trackFilter?)` in DoerfelVerse and
`(feedUrl)` elsewhere; `parsePublisherFeed` returns `RSSPublisherItem[]` in
DoerfelVerse and `{ publisherInfo, remoteItems }` in StableKraft. MSP's
`parseRssFeed(xml)` takes a string and does no I/O, which is why it travels.

## Feed fetching

Fetching a user-supplied feed URL on a server is an SSRF sink. Four live
sites have code for it; one guard is clearly the strongest.

| | DNS checked | Redirects | `100.64/10` | IPv6 literals | Body cap |
|---|---|---|---|---|---|
| BMB `lib/safe-fetch.ts` | every hop | manual, 5, each re-checked | refused | refused by prefix, deliberately; public ones allowed | 8 MB, counted while reading |
| MSP `api/_utils/urlSafety.ts` + `safeFetch.ts` | every hop | manual, 5, each re-checked | **allowed** | refused, **by accident** ³ | `readCapped`, size set by the caller (`proxy-feed`: 4 MiB) |
| SK `lib/url-security.ts` + `lib/safe-fetch.ts` | **no** (its own comment says so) | 3, each re-checked | — | string checks only | 12 MiB |
| ITDV `lib/proxy-guard.ts` | **no** | **followed unchecked** | — | **bypassed** | — |

³ MSP hands the bracketed hostname (`[::1]`) to `dns.lookup`, which fails, so
every IPv6 literal is refused as "Could not resolve host" — the private ones
and the public ones alike. Run on 2026-11-24 at `b2216ec`: `100.64.0.1`,
`198.18.0.1` and `192.0.2.1` were allowed; every IPv6 literal, `localhost.`
and `127.0.0.1.nip.io` were refused.

Boost Me Bitch's guard is shipped as
[`../recipes/safe-feed-fetch/`](../recipes/safe-feed-fetch/), with tests that
were each confirmed to fail when the rule they pin is removed. **None of the
four pins the checked address**, so DNS rebinding passes all of them. And
StableKraft's own `parseRSSFeed` does not use its guard: it fetches with a
plain `fetch` and a 30-second timeout. DoerfelVerse's server fetch has no
timeout, no size cap and no guard. Why the DoerfelVerse guard was withdrawn:
[image-proxy-ssrf.md](image-proxy-ssrf.md).

## Feed generation

- **musicL playlists:** StableKraft's `lib/playlist/musicl-feed.ts` +
  `musicl-guid.ts` (277 lines, no imports, tested), shipped as
  [`../recipes/musicl-playlist-feed/`](../recipes/musicl-playlist-feed/). Boost
  Me Bitch's `lib/community/feed-doc.ts` (154) imports an app type. MSP has no
  musicL writer.
- **Full feeds:** `MSP-2.0/src/utils/xmlGenerator.ts` (768 lines, 507 of tests)
  is the tested one. Not shipped: it imports the same closure as the parser
  and more of MSP's editor.

## Known gaps

- No portable `valueTimeSplit` parser, as above.
- Nothing retries a Podcast Index 429 on any site.
- No guard pins the checked address.
- `candr.space` is private and not compared.
