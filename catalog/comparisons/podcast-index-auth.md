# Podcast Index API authentication

Every Podcast Index request needs three headers: your API key, a Unix
timestamp, and `sha1(key + secret + timestamp)` as the `Authorization` value.
It is four lines of code. It is also the most duplicated logic in any of
these repos.

## Where it lives today

| Repo | Path | State | Read at |
|---|---|---|---|
| `MSP-2.0` | `api/_utils/podcastIndex.ts` | **canonical** | `c294548` |
| `MSP-2.0-Desktop-App` | `api/_utils/podcastIndex.ts` | identical copy | `f67c9b7` |
| `stablekraft-app` | `lib/podcast-index-api.ts` and 13 others | diverged, see below | `db2eb22f` |
| `lnaddress-music` *(test site)* | `lib/podcast-index.ts` + 5 more | diverged | `c16f68b` |
| `ITDV-Lightning` | `lib/podcast-index.ts` + 1 more | diverged | `4bc69b2` |
| `HGH-checker` | `script.js` (browser WebCrypto) | diverged | `0cce561` |
| `NMNU`, `TRM-Lightning` *(test sites)* | — | absent | — |

## What ships

[`podcast-index-auth.ts`](../modules/rss-pc20/podcast-index-auth.ts) — 22 lines, one exported
function, one import (`node:crypto`).

It wins on being the smallest correct version with no app coupling. There is
nothing clever to get right here; the value of picking one is that the other
copies stop existing.

**One thing to change when you adopt it.** The `User-Agent` is hardcoded to
`MSP2.0/1.0 (Music Side Project Studio)`. That is the app it came from, not a
constant. Set it to the app doing the calling — Podcast Index uses it to
attribute traffic, so leaving MSP's string in place makes another app's
requests look like MSP's.

## How each site diverges

**`stablekraft-app` inlines it 14 times.** Nine route handlers build the
header from scratch — `app/api/podcastindex/route.ts`,
`app/api/import-missing-feeds/route.ts`,
`app/api/investigate-missing-feeds/route.ts`,
`app/api/import-specific-feeds/route.ts`,
`app/api/resolve-missing-feeds/route.ts`,
`app/api/playlist/parse-feeds-stream/route.ts`,
`app/api/admin/fix-feed-urls/route.ts`,
`app/api/admin/populate-feeds/route.ts`,
`app/api/admin/populate-all-sas-feeds/route.ts` — plus five library modules:
`lib/feed-parsing.ts`, `lib/publisher-detector.ts`, `lib/rss-parser/index.ts`,
`lib/v4v-resolver.ts`, and `lib/podcast-index-api.ts` itself.

The last one is the point. stablekraft-app **has** a shared client with
`getAuthHeaders()` at `lib/podcast-index-api.ts:121`. Thirteen other files
don't call it. Across the repo, 71 files mention `X-Auth-Key`.

What that costs: rotating a key, changing the User-Agent, or adding a retry
means finding fourteen sites, and missing one produces a single endpoint
that 401s under a condition nobody reproduces on purpose.

**`HGH-checker`** implements sha1 in the browser over WebCrypto rather than
`node:crypto`, because it runs client-side. That is a real constraint, not
drift — it needs its own version. It calls it at three points in `script.js`
without factoring it out.

**`lnaddress-music` and `ITDV-Lightning`** each carry `lib/podcast-index.ts`
and use it inconsistently alongside inline copies.

## Known gaps

- The two MSP copies are byte-identical today, but `MSP-2.0-Desktop-App` is
  the downstream fork and is ahead overall. If they ever diverge on this
  file, Desktop is the one to re-read.
- Nothing here rate-limits or retries. Every caller in every repo handles a
  429 differently, or not at all. Worth a second entry once one of them does
  it well enough to copy.
