# RSS feed parsing

Turning a podcast or music RSS feed into typed albums, tracks, value blocks,
persons, chapters and remote items.

**Compared, not shipped.** Every parser depends on sibling modules in its own
app, so none passes the
[standalone-compile test](../README.md#rules-this-directory-is-held-to). This
page says which one to read.

## Where it lives

| Site | Repo | Path | Lines | Read at |
|---|---|---|---|---|
| MSP 2.0 | `MSP-2.0` | `src/utils/xmlParser.ts` | 934 | `c294548` |
| Project StableKraft | `stablekraft-app` | `lib/rss-parser/index.ts` | 805 | `db2eb22f` |
| Project StableKraft | `stablekraft-app` | `lib/rss-parser-db.ts` | 1594 | `db2eb22f` |
| DoerfelVerse | `ITDV-Lightning` | `lib/rss-parser.ts` | 1952 | `4bc69b2` |

`lib/feed-parser.ts` is a separate thing again, present in both
`stablekraft-app` and `ITDV-Lightning` at ~355–363 lines and **95.6%
identical** — one of the few files these two sites have not driven apart.

Between them the live sites ship three XML parsing libraries: `fast-xml-parser`,
`rss-parser` and `xml2js`.

## Which one to read

**`MSP-2.0/src/utils/xmlParser.ts`.** It is the only parser in any of these
repos with real test coverage — a 597-line suite beside it — and the only one
that is pure functions with no database or Next.js coupling.

It is also the only parser that **round-trips losslessly**.
`captureUnknownElements()` keeps channel elements it does not recognise, so
they survive a parse-edit-regenerate cycle. Without that, a feed *editor*
silently deletes every tag its author had not heard of — which, for a
namespace as young as Podcasting 2.0, is most of them.

That instinct is the same one behind [carry what you can't
read](../../pc20-favorites.md#4-carry-what-you-cant-read) in the favorites
spec, arrived at independently for RSS.

## How the sites diverge

**StableKraft runs two parsers at once.** `lib/rss-parser/` is the DOM-based
path (`@xmldom/xmldom` on the server, browser `DOMParser` on the client);
`lib/rss-parser-db.ts` is a separate 1594-line `fast-xml-parser` ingestion
path used by `lib/feed-parsing.ts`. They are unrelated code answering the same
question, and a fix to one does not reach the other.

**StableKraft's modular split stubs out the parts a V4V app needs.** The
directory layout is right — `lib/rss-parser.ts` is now a four-line
`@deprecated` re-export over `lib/rss-parser/{index,types,utils}.ts` — but
`extractFunding`, `extractPodroll` and `extractValue4Value` return empty or
`undefined`, and `parsePublisherFeedInfo` logs "not implemented" and returns
`null`. A value-for-value app cannot use a parser whose `extractValue4Value`
returns nothing, so this cannot be the common base until those are filled in.

**DoerfelVerse's is the largest at 1952 lines and has content policy compiled
into it.** `parseAlbumFeed` carries roughly 350 lines keyed on specific album
titles — branches on `'autumn rust'` and `'doerfel'`, chapter URLs matched by
filename, a hardcoded timestamp comment. That is per-album behaviour living
inside a general parser; it cannot be parameterised, only removed.

**The public API differs in ways that break drop-in replacement.**
`parseAlbumFeed` takes `(feedUrl, trackFilter?)` in DoerfelVerse and
`(feedUrl)` elsewhere; `parsePublisherFeed` returns `RSSPublisherItem[]` in
DoerfelVerse and `{ publisherInfo, remoteItems }` in StableKraft.

## Feed fetching is a separate problem

Fetching an arbitrary user-supplied feed URL server-side is an SSRF sink.
`MSP-2.0` guards it: `api/_utils/urlSafety.ts` (`assertPublicHttpUrl`) and
`api/_utils/safeFetch.ts`, referenced from 14 files, with tests.

`ITDV-Lightning` has its own `lib/proxy-guard.ts` for the image proxy, but do
not reach for it — a review found three SSRF bypasses in it, and the recipe
that shipped it was withdrawn. See
[image-proxy-ssrf.md](image-proxy-ssrf.md).

Not extracted here because `safeFetch.ts` imports `urlSafety.js`, which
re-exports from `rateLimiter.js`.

## Known gaps

- No comparison of what each parser actually *extracts*. Line counts say they
  differ; they do not say which one drops `<podcast:valueTimeSplit>` or
  mishandles a CDATA title. That comparison is the work this page does not do.
- Nothing here covers feed *generation*. `MSP-2.0/src/utils/xmlGenerator.ts`
  is the tested one; `stablekraft-app/app/api/generate-playlist-rss/route.ts`
  is the musicL playlist variant.
- No live site parses `<podcast:valueTimeSplit>` at all.
