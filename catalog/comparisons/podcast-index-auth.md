# Podcast Index API authentication

Every Podcast Index request needs three headers: your API key, a Unix
timestamp, and `sha1(key + secret + timestamp)` as the `Authorization` value.
It is four lines of code, and it is the most duplicated logic across these
sites.

## Where it lives

| Site | Repo | Path | State | Read at |
|---|---|---|---|---|
| MSP 2.0 | `MSP-2.0` | `api/_utils/podcastIndex.ts` | **shipped**, 22 lines | `c294548` |
| Project StableKraft | `stablekraft-app` | `lib/podcast-index-api.ts` **and 13 others** | diverged, see below | `db2eb22f` |
| DoerfelVerse | `ITDV-Lightning` | `lib/podcast-index.ts` + 1 more | diverged | `4bc69b2` |

Shipped as
[`../modules/rss-pc20/podcast-index-auth.ts`](../modules/rss-pc20/podcast-index-auth.ts)
— one exported function, one import (`node:crypto`).

MSP 2.0's wins on being the smallest correct version with no app coupling.
There is nothing clever to get right here; the value of naming one is that the
others stop existing.

**One thing to change on adoption.** The `User-Agent` is hardcoded to
`MSP2.0/1.0 (Music Side Project Studio)`. That is the app it came from, not a
constant. Podcast Index uses it to attribute traffic, so leaving it in place
makes another app's requests look like MSP 2.0's.

## StableKraft builds it inline fourteen times

Nine route handlers construct the header from scratch —
`app/api/podcastindex/route.ts`, `app/api/import-missing-feeds/route.ts`,
`app/api/investigate-missing-feeds/route.ts`,
`app/api/import-specific-feeds/route.ts`,
`app/api/resolve-missing-feeds/route.ts`,
`app/api/playlist/parse-feeds-stream/route.ts`,
`app/api/admin/fix-feed-urls/route.ts`,
`app/api/admin/populate-feeds/route.ts`,
`app/api/admin/populate-all-sas-feeds/route.ts` — plus five library modules:
`lib/feed-parsing.ts`, `lib/publisher-detector.ts`, `lib/rss-parser/index.ts`,
`lib/v4v-resolver.ts`, and `lib/podcast-index-api.ts` itself.

That last one is the point. The repo **has** a shared client with
`getAuthHeaders()` at `lib/podcast-index-api.ts:121`. Thirteen other files do
not call it. Across the repo, 71 files mention `X-Auth-Key`.

What it costs: rotating a key, changing the User-Agent, or adding a retry
means finding fourteen sites, and missing one produces a single endpoint that
401s under a condition nobody reproduces on purpose.

## Known gaps

- **Nothing rate-limits or retries.** Every caller on every site handles a 429
  differently, or not at all. Worth its own entry once one of them does it
  well enough to copy.
- The shipped version reads `process.env` at module load, so it captures
  whatever was set at import time. Fine for a server route; surprising in a
  long-lived process that expects to pick up rotated credentials.
