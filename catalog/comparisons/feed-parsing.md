# RSS feed parsing

Turning a podcast or music RSS feed into typed albums, tracks, value blocks,
persons, chapters and remote items.

**Cited, not extracted.** Every parser in every repo depends on sibling
modules in its own app, so none of them passes the
[standalone-compile test](../README.md#extracted-code-must-compile-on-its-own).
This page says which one to read and which to stop copying.

## Where it lives today

| Repo | Path | Lines | State | Read at |
|---|---|---|---|---|
| `MSP-2.0-Desktop-App` | `src/utils/xmlParser.ts` | 935 | **best to read** (not shipped) | `f67c9b7` |
| `MSP-2.0` | `src/utils/xmlParser.ts` | 934 | one line behind Desktop | `c294548` |
| `stablekraft-app` | `lib/rss-parser/index.ts` | 805 | diverged (split into 3 files) | `db2eb22f` |
| `stablekraft-app` | `lib/rss-parser-db.ts` | 1594 | **a second, unrelated parser** | `db2eb22f` |
| `NMNU` *(test site)* | `lib/rss-parser.ts` | 1423 | diverged (monolith ancestor) | `2b9a78f` |
| `ITDV-Lightning` | `lib/rss-parser.ts` | 1952 | diverged | `4bc69b2` |

`lib/feed-parser.ts` is a *fourth* thing, present at 471–474 lines in
stablekraft-app, NMNU and ITDV-Lightning in three different versions.

Your sites ship three XML parsing libraries between them — `fast-xml-parser`,
`rss-parser` and `xml2js` — and several ship all three at once.

## Which one to read

**`MSP-2.0-Desktop-App/src/utils/xmlParser.ts`.** It wins on being the only
parser in any repo with real test coverage — `xmlParser.test.ts` is **1056
lines** there, against 597 in MSP-2.0 and zero everywhere else. It is
`fast-xml-parser`, pure functions, no database and no Next.js coupling.

Take Desktop's, not MSP-2.0's: Desktop is the downstream fork and is ahead,
and the test suite is where the gap shows.

It is also the only parser that **round-trips losslessly**.
`captureUnknownElements()` keeps channel elements it doesn't recognise so
they survive a parse-edit-regenerate cycle. Nothing else does this, and
without it any feed *editor* silently deletes every tag its author hadn't
heard of — which for a namespace as young as Podcasting 2.0 is most of them.

That behaviour is the same instinct as [carry what you can't
read](../../pc20-favorites.md#4-carry-what-you-cant-read) in the favorites
spec, arrived at independently for RSS.

## How each site diverges

**`stablekraft-app` runs two parsers at once.** `lib/rss-parser/` is the
DOM-based path (`@xmldom/xmldom` on the server, browser `DOMParser` on the
client); `lib/rss-parser-db.ts` is a separate 1594-line `fast-xml-parser`
ingestion path used by `lib/feed-parsing.ts`. They are unrelated code
answering the same question, and a fix to one does not reach the other.

**`NMNU` is the common ancestor, still monolithic.** Same class name, same
static method names (`detectFeedType`, `parseAlbumFeed`, `parseMultipleFeeds`,
`parsePublisherFeedInfo`, `parsePublisherFeed`), same dual-environment xmldom
trick. stablekraft split it into three files and changed the API on the way:
NMNU's `parsePublisherFeed` returns `RSSPublisherItem[]`, stablekraft's
returns `{ publisherInfo, remoteItems }`. That is a real break, not drift.

**`ITDV-Lightning`'s is the largest at 1952 lines** and diverged from the
same ancestor again.

## Feed fetching is a separate problem, and two repos get it wrong

Fetching an arbitrary user-supplied feed URL server-side is an SSRF sink. The
MSP repos guard it: `api/_utils/urlSafety.ts` (`assertPublicHttpUrl`) and
`api/_utils/safeFetch.ts`, referenced from 14 files in MSP-2.0 and 13 in
Desktop, with tests.

`HGH-checker/api/proxy.js` and `Auto-musicL-Maker/api/proxy.js` have **zero
references to any URL-safety check**. They fetch what they're given.

Not extracted here because `safeFetch.ts` imports `urlSafety.js` which
re-exports from `rateLimiter.js`. Read them in `MSP-2.0-Desktop-App`, whose
`urlSafety.ts` is 230 lines against MSP-2.0's 126.

## Known gaps

- No comparison has been made of what each parser actually *extracts*. The
  line counts say they differ; they don't say which one drops
  `<podcast:valueTimeSplit>` or mishandles a CDATA title. That comparison is
  the work this page doesn't do.
- `TRM-Lightning/lib/podcast-parser.ts` is the only code anywhere that parses
  `<podcast:valueTimeSplit>`, and `TRM-Lightning/lib/payment-recipient-utils.ts`
  is the only place recipient extraction is factored into its own module.
  Both deserve their own entry.
- Nothing here covers feed *generation*. `MSP-2.0-Desktop-App/src/utils/xmlGenerator.ts`
  is the tested one; `stablekraft-app/app/api/generate-playlist-rss/route.ts`
  is the musicL playlist variant.
