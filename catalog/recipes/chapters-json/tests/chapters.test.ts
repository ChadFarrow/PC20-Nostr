/**
 * Checks for the claims in this recipe's README, run against the shipped file.
 *
 *   npm i -D tsx typescript
 *   npx tsx tests/chapters.test.ts
 */

import { parseChaptersJson, repairOrphanDigits } from '../files/chapters-json';

let bad = 0;
const fail = (m: string) => { console.log('FAIL   ' + m); bad++; };
const ok = (m: string) => console.log('ok     ' + m);
const eq = (got: unknown, want: unknown, m: string) =>
  JSON.stringify(got) === JSON.stringify(want) ? ok(m) : fail(`${m}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const valid = '{"version":"1.2.0","chapters":[{"startTime":0,"title":"Intro"},{"startTime":61.5,"title":"Song"}]}';
eq(parseChaptersJson(valid), JSON.parse(valid), 'valid file parses as plain JSON.parse would');

// The measured corruption: a stray digit run before every "title" key.
const broken = '{"version":"1.2.0","chapters":[{"startTime": 0.000000,\r\n0      "title": "Intro"},'
  + '{"startTime": 61.5,\r\n0      "title": "Song"}]}';
try { JSON.parse(broken); fail('fixture is not actually broken'); } catch { ok('fixture fails strict JSON.parse'); }
eq((parseChaptersJson(broken) as { chapters: { title: string }[] }).chapters.map(c => c.title),
   ['Intro', 'Song'], 'orphan digits before a key are dropped and every chapter survives');

// The pattern inside a string is user-visible text, and must not be touched.
const titled = '{"chapters":[{"startTime":0,"title":"Set 1, 0 \\"live\\""}]}';
eq((parseChaptersJson(titled) as { chapters: { title: string }[] }).chapters[0].title,
   'Set 1, 0 "live"', 'the same pattern inside a title is left alone');
eq(repairOrphanDigits(titled), titled, 'repair returns a string-only match unchanged');

// Not a general repairer: anything else still throws, with the ORIGINAL error.
let original = '';
try { JSON.parse('{"chapters": [}'); } catch (e) { original = (e as Error).message; }
try { parseChaptersJson('{"chapters": [}'); fail('unrelated breakage was "repaired"'); }
catch (e) { (e as Error).message === original ? ok('other breakage throws the original SyntaxError') : fail('error message changed'); }

// The parser does not check the shape. That is the caller's job.
eq(parseChaptersJson('[1,2,3]'), [1, 2, 3], 'shape is not validated (README says so)');

console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
