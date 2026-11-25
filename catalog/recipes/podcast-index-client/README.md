# Podcast Index client

Look a podcast or an episode up in the [Podcast Index](https://podcastindex.org)
API from your server: by `podcast:guid`, by feed URL, or an episode by its feed
guid and item guid. 112 lines, no packages.

Its one idea is worth more than its size. Every lookup answers one of
**three** things, and they stay apart all the way out:

| Answer | Means | Cache it? |
|---|---|---|
| `{ found: value }` | Podcast Index has it | yes |
| `{ miss: true }` | Podcast Index answered "not found" | yes — a miss is an answer |
| `null` | you could not ask: bad key, 429, 5xx, timeout, garbage body | **never** |

Collapse the third into the second and a rate limit gets stored as "this feed
does not exist" — for as long as your cache lives.

**Running at** <https://boostmebitch.com> (Boost Me Bitch), in the service that
keeps its Podcast Index cache warm.

## Difficulty: drop-in

One file, no packages, two secrets, one string to rename.

## What you get

| File | Put it at |
|---|---|
| `files/pi.ts` | `lib/podcast-index.ts` |

```ts
import { piConfigured, fetchPodcastByGuid, fetchEpisodeByGuid } from '@/lib/podcast-index';

if (!piConfigured()) throw new Error('set PODCAST_INDEX_KEY and PODCAST_INDEX_SECRET');
const r = await fetchPodcastByGuid('917393e3-1b1e-5cef-ace4-edaa54e1f810');
if (r === null) { /* could not ask: retry later, cache nothing */ }
else if ('miss' in r) { /* Podcast Index does not have it */ }
else { const feed = r.found as { id: number; title: string; url: string }; }
```

## What you need

Node 18+ on the server, and three environment variables:

| Variable | What |
|---|---|
| `PODCAST_INDEX_KEY` | your API key, from <https://api.podcastindex.org> |
| `PODCAST_INDEX_SECRET` | your API secret |
| `APP_NAME` | your app's name and version, sent as the User-Agent |

**Both credentials are server-only.** Never give either one a `NEXT_PUBLIC_`
prefix: Next.js inlines those into the JavaScript it serves to every visitor.
Never commit them, and never paste them into a feed, a log or a test. They are
read on every call, not at import, so a rotated key works without a restart.

## What to rename

`files/pi.ts` line **49**:

```ts
'User-Agent': process.env.APP_NAME?.trim() || 'boostmebitch-index/0.1',
```

Set `APP_NAME`, or change the fallback. Podcast Index attributes traffic by
User-Agent, so leaving it labels your requests as another app's.

## What will bite you

**Podcast Index says "not found" in two ways.** HTTP 400 (not 404), and
sometimes HTTP 200 with an empty `feed` object. Both come back as
`{ miss: true }`; a naive `if (data.feed)` treats the empty object as a hit.

**There is no retry.** A 429 returns `null`. Back off and ask again in your
own code — and do not cache the `null`.

**Answers are raw JSON, typed `unknown`.** This client does not define a
`Podcast` type; read the fields you use and type them yourself.

**Three endpoints only.** Adding another is one line on the same `ask()`
helper, which keeps the three-state answer for free.

## Why this one

Every live site builds the same `sha1(key + secret + unixTime)` header, most of
them more than once — one site builds it inline in eleven files beside the
client it already has. If you only want the header, the four-line version is
[`../../modules/rss-pc20/podcast-index-auth.ts`](../../modules/rss-pc20/podcast-index-auth.ts).
This recipe is the smallest one that also gets the answers right. More in
[`../../comparisons/podcast-index-auth.md`](../../comparisons/podcast-index-auth.md).

## Tests

`tests/pi.test.ts` stubs `fetch`, so it needs no key and no network. It checks
the auth hash, the URLs and escaping, and every case in the table above.

```bash
npm i -D tsx typescript
npx tsx tests/pi.test.ts
```

## Provenance

`boostmebitch` `origin/main` at `815c551f`, `services/nostr-index/src/pi.ts`,
byte-identical. MIT. Row in [`../../PROVENANCE.tsv`](../../PROVENANCE.tsv).
