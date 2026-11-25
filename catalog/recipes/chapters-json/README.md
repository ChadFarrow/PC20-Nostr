# Chapters JSON

Parse the file a `<podcast:chapters url type="application/json+chapters">`
points at, and survive the one corruption that has been measured in the wild.

A real episode shipped a chapters file with a stray `0` before every one of
its 25 `"title"` keys. `JSON.parse` stops at the first one, and an app shows
"no chapters" — which looks exactly like an episode that never had any. The 25
chapters were intact.

`parseChaptersJson` tries a strict `JSON.parse` first. Only if that throws
does it remove orphan digit runs that sit between a `,` and the next `"`
**outside any string**, and parse again. That pattern cannot occur in valid
JSON, so a valid file is never rewritten, and a chapter title that happens to
contain `, 0 "` is left alone. Anything else still throws the original error.

**Running at** <https://boostmebitch.com> (Boost Me Bitch), behind its
chapters route.

## Difficulty: drop-in

One file, no imports, nothing to rename.

## What you get

| File | Put it at |
|---|---|
| `files/chapters-json.ts` | `lib/chapters-json.ts` |

131 lines.

```ts
import { safeFetch } from '@/lib/safe-fetch';          // the safe-feed-fetch recipe
import { readCappedText } from '@/lib/capped-body';
import { parseChaptersJson } from '@/lib/chapters-json';

const res = await safeFetch(chaptersUrl, { signal: AbortSignal.timeout(8_000) });
const data = parseChaptersJson(await readCappedText(res));
const chapters = Array.isArray((data as { chapters?: unknown }).chapters)
  ? (data as { chapters: { startTime: number; title?: string }[] }).chapters
  : [];
```

## What will bite you

**It returns `unknown`.** It parses; it does not check the shape. Read
`chapters`, check each `startTime` is a number, and decide what you do with
an entry that has no title.

**The URL comes from a feed.** Fetch it on a server with
[`safe-feed-fetch`](../safe-feed-fetch/), or in the browser, where the user's
own network is not yours to protect — but then the publisher's CORS headers
decide whether you get it at all.

**Do not widen the repair.** The file's own header explains why: every rule
that accepts more is a rule that lets a feed steer your parser.

## Tests

```bash
npm i -D tsx typescript
npx tsx tests/chapters.test.ts
```

## Provenance

`boostmebitch` `origin/main` at `815c551f`, byte-identical. MIT. Row in
[`../../PROVENANCE.tsv`](../../PROVENANCE.tsv).
