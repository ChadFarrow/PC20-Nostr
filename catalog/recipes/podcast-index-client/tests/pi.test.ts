/**
 * Checks for the claims in this recipe's README, run against the shipped file
 * with fetch stubbed - no Podcast Index key and no network needed.
 *
 *   npm i -D tsx typescript
 *   npx tsx tests/pi.test.ts
 *
 * Never put a real key in this file. The values below are placeholders.
 */

import { createHash } from 'node:crypto';
import {
  piConfigured, fetchPodcastByGuid, fetchPodcastByFeedUrl, fetchEpisodeByGuid,
} from '../files/pi';

let bad = 0;
const fail = (m: string) => { console.log('FAIL   ' + m); bad++; };
const ok = (m: string) => console.log('ok     ' + m);

type Call = { url: string; headers: Record<string, string> };
function stub(answer: () => Response | Promise<Response>): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: (init?.headers ?? {}) as Record<string, string> });
    return answer();
  }) as typeof fetch;
  return calls;
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function main() {
  delete process.env.PODCAST_INDEX_KEY;
  delete process.env.PODCAST_INDEX_SECRET;
  piConfigured() ? fail('configured with no key') : ok('not configured without a key');

  // Read at CALL time, not at import: a key set after import still counts.
  process.env.PODCAST_INDEX_KEY = 'TESTKEY';
  process.env.PODCAST_INDEX_SECRET = 'TESTSECRET';
  process.env.APP_NAME = 'my-app/1.0';
  piConfigured() ? ok('key set after import is picked up') : fail('key set after import ignored');

  {
    const calls = stub(() => json({ feed: { id: 920666, title: 'Podcasting 2.0' } }));
    const r = await fetchPodcastByGuid('917393e3-1b1e-5cef-ace4-edaa54e1f810');
    r && 'found' in r ? ok('feed found') : fail(`feed lookup gave ${JSON.stringify(r)}`);
    const h = calls[0].headers;
    const expect = createHash('sha1').update('TESTKEY' + 'TESTSECRET' + h['X-Auth-Date']).digest('hex');
    h.Authorization === expect ? ok('Authorization is sha1(key + secret + X-Auth-Date)') : fail('auth hash wrong');
    h['X-Auth-Key'] === 'TESTKEY' ? ok('X-Auth-Key sent') : fail('X-Auth-Key missing');
    Math.abs(Number(h['X-Auth-Date']) - Date.now() / 1000) < 5 ? ok('X-Auth-Date is Unix seconds now') : fail('X-Auth-Date wrong');
    h['User-Agent'] === 'my-app/1.0' ? ok('User-Agent comes from APP_NAME') : fail(`User-Agent is ${h['User-Agent']}`);
    calls[0].url === 'https://api.podcastindex.org/api/1.0/podcasts/byguid?guid=917393e3-1b1e-5cef-ace4-edaa54e1f810'
      ? ok('byguid URL') : fail(`byguid URL was ${calls[0].url}`);
  }
  {
    const calls = stub(() => json({ episode: { id: 1 } }));
    const r = await fetchEpisodeByGuid('feed-guid', 'item guid&x=1');
    r && 'found' in r && calls[0].url.endsWith('/episodes/byguid?guid=item%20guid%26x%3D1&podcastguid=feed-guid')
      ? ok('episode lookup sends both guids, escaped') : fail(`episode URL was ${calls[0].url}`);
  }
  {
    const calls = stub(() => json({ feed: { id: 1 } }));
    await fetchPodcastByFeedUrl('https://example.com/feed.xml?a=1&b=2');
    calls[0].url.endsWith('/podcasts/byfeedurl?url=https%3A%2F%2Fexample.com%2Ffeed.xml%3Fa%3D1%26b%3D2')
      ? ok('feed URL escaped') : fail(`byfeedurl URL was ${calls[0].url}`);
  }

  // The three states. "Could not ask" must never look like "not found",
  // or a cache stores a rate-limited lookup as a permanent miss.
  const cases: [string, () => Response | Promise<Response>, 'found' | 'miss' | 'null'][] = [
    ['400 (how PI says not found)', () => json({}, 400), 'miss'],
    ['404', () => json({}, 404), 'miss'],
    ['200 with an empty feed object', () => json({ feed: {} }), 'miss'],
    ['200 with an empty feed array', () => json({ feed: [] }), 'miss'],
    ['200 with no feed field', () => json({ status: 'true' }), 'miss'],
    ['401 (bad key)', () => json({}, 401), 'null'],
    ['429 (rate limited)', () => json({}, 429), 'null'],
    ['500', () => json({}, 500), 'null'],
    ['network error', () => { throw new TypeError('fetch failed'); }, 'null'],
    ['body that is not JSON', () => new Response('<html>', { status: 200 }), 'null'],
  ];
  for (const [why, answer, want] of cases) {
    stub(answer);
    const r = await fetchPodcastByGuid('x');
    const got = r === null ? 'null' : 'found' in r ? 'found' : 'miss';
    got === want ? ok(`${why} -> ${want}`) : fail(`${why} -> ${got}, expected ${want}`);
  }

  console.log(bad ? `\n${bad} FAILED` : '\nall passed');
  process.exit(bad ? 1 : 0);
}
main();
