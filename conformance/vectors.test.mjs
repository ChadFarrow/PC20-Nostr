/**
 * The 15 test vectors of ../pc20-favorites.md, executable.
 *
 * The spec states them as behaviors "so they can be written against any test
 * runner". This is that, for one runner, driven through the two pure
 * functions described in ./adapter.d.ts. Point ADAPTER at your own
 * implementation and the same 15 run against it.
 *
 * Numbering matches the spec exactly. If you add a vector there, add it here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import * as ADAPTER from './reference/favorites.mjs';

const { parseTags, kindOf, plan, decodePrivate, encodePrivate } = ADAPTER;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FEED_A = 'podcast:guid:aaaaaaaa-0000-0000-0000-000000000001';
const ITEM_A1 = 'podcast:item:guid:aaaaaaaa-1111-0000-0000-000000000001';
const ITEM_A2 = 'podcast:item:guid:aaaaaaaa-1111-0000-0000-000000000002';
const FEED_B = 'podcast:guid:bbbbbbbb-0000-0000-0000-000000000002';
const ITEM_B1 = 'podcast:item:guid:bbbbbbbb-1111-0000-0000-000000000001';
const FEED_C = 'podcast:guid:cccccccc-0000-0000-0000-000000000003';

const ALT = ['alt', 'PC 2.0 Favorites'];
const K_FEED = ['k', 'podcast:guid'];
const K_ITEM = ['k', 'podcast:item:guid'];

const ev = (tags, content = '') => ({ kind: 10333, tags, content });
const feed = (id, medium, items = []) => ({ id, medium, items });
const base = (pub = [], priv = []) => ({ public: pub, private: priv });

/** Just the `i` values, in order. */
const ids = (tags) => (tags ?? []).filter((t) => t[0] === 'i').map((t) => t[1]);

/** Position of an identifier in a tag array, or -1. */
const at = (tags, id) => (tags ?? []).findIndex((t) => t[0] === 'i' && t[1] === id);

/** Entry shape without the tag index, so two layouts can be compared. */
const shape = (parsed) =>
  parsed.entries.map((e) => ({
    id: e.id,
    kind: e.kind,
    medium: e.medium,
    parent: e.parent,
  }));

// ---------------------------------------------------------------------------

test('1. A foreign entry survives your republish', () => {
  // A feed group this app cannot resolve: not held locally, not in the
  // baseline. The natural way to write a publisher — emit local state — loses
  // it, and this is the vector that catches that.
  const read = ev([
    ALT,
    ['medium', 'podcast'],
    ['i', FEED_A],
    ['i', ITEM_A1],
    ['medium', 'music'],
    ['i', FEED_B],
    K_FEED,
    K_ITEM,
  ]);

  const { publish } = plan({
    read,
    local: [feed(FEED_A, 'podcast', [ITEM_A1]), feed(FEED_C, 'podcast')],
    baseline: base([FEED_A, ITEM_A1]),
    mode: 'public',
  });

  assert.ok(publish, 'adding a local favorite must produce a publish');
  assert.ok(at(publish.tags, FEED_B) !== -1, 'the foreign feed was dropped');

  // ...and in the same position: still under its own `medium music` run, and
  // still ahead of anything this device appended.
  const mediumMusic = publish.tags.findIndex(
    (t) => t[0] === 'medium' && t[1] === 'music',
  );
  assert.ok(mediumMusic !== -1, 'the foreign group lost its medium run');
  assert.ok(
    mediumMusic < at(publish.tags, FEED_B),
    'the foreign feed moved out of its medium run',
  );
  assert.ok(
    at(publish.tags, FEED_B) < at(publish.tags, FEED_C),
    'entries read keep their position; ours append after them',
  );
});

test('2. An empty list is distinguishable from a read that never happened', () => {
  const local = [feed(FEED_A, 'podcast', [ITEM_A1])];

  // The relay never answered. Rule 1: never publish on a read you don't
  // trust. Believing this is how a whole library gets republished as empty.
  const never = plan({ read: null, local, baseline: base(), mode: 'public' });
  assert.equal(never.publish, null, 'published on an untrustworthy read');
  assert.deepEqual(
    never.baselineIfLanded,
    base(),
    'a skipped publish must not move the baseline',
  );

  // The relay answered "I have nothing". That is a real, empty list.
  const empty = plan({ read: ev([]), local, baseline: base(), mode: 'public' });
  assert.ok(empty.publish, 'an empty list must still accept our first entry');
  assert.deepEqual(ids(empty.publish.tags), [FEED_A, ITEM_A1]);
});

test('3. Idempotence', () => {
  const local = [feed(FEED_A, 'podcast', [ITEM_A1])];

  const first = plan({ read: ev([]), local, baseline: base(), mode: 'public' });
  assert.ok(first.publish);

  // Read our own output back and run the whole cycle again.
  const second = plan({
    read: first.publish,
    local,
    baseline: first.baselineIfLanded,
    mode: 'public',
  });

  assert.equal(
    second.publish,
    null,
    'a writer that is not idempotent has two apps rewriting the event forever',
  );
});

test('4. An unrecognized tag or identifier kind survives', () => {
  const read = ev([
    ALT,
    ['medium', 'podcast'],
    ['i', FEED_A],
    ['i', 'future:thing:abc'], // an identifier kind not in our table
    ['zz', 'a tag type with no meaning here'],
    K_FEED,
    ['k', 'future:thing'], // a `k` naming a kind we never emit
  ]);

  const { publish } = plan({
    read,
    local: [feed(FEED_A, 'podcast'), feed(FEED_C, 'podcast')],
    baseline: base([FEED_A]),
    mode: 'public',
  });

  assert.ok(publish);
  const flat = JSON.stringify(publish.tags);
  assert.ok(flat.includes('future:thing:abc'), 'unknown identifier dropped');
  assert.ok(flat.includes('a tag type with no meaning here'), 'unknown tag dropped');
  assert.ok(flat.includes('"future:thing"'), 'unknown `k` dropped');

  // Rule 4 again: an unparseable entry must not close the open feed group.
  // ITEM_A2 sits after the unreadable identifier and still belongs to FEED_A.
  const parsed = parseTags([
    ['medium', 'podcast'],
    ['i', FEED_A],
    ['i', 'future:thing:abc'],
    ['i', ITEM_A2],
  ]);
  const item = parsed.entries.find((e) => e.id === ITEM_A2);
  assert.equal(item.parent, FEED_A, 'an unparseable entry re-parented the ones after it');
});

test('5. Placement', () => {
  const parsed = parseTags([
    ['i', FEED_C], // before any medium tag
    ['medium', 'podcast'],
    ['i', FEED_A],
    ['i', ITEM_A1],
    ['medium', 'music'],
    ['i', FEED_B],
    ['i', ITEM_B1],
  ]);

  const by = (id) => parsed.entries.find((e) => e.id === id);

  // An item attaches to the MOST RECENTLY OPENED group — not the first, and
  // not the nearest by any other measure.
  assert.equal(by(ITEM_A1).parent, FEED_A);
  assert.equal(by(ITEM_B1).parent, FEED_B);

  // Medium is a running value.
  assert.equal(by(FEED_A).medium, 'podcast');
  assert.equal(by(FEED_B).medium, 'music');

  // A group with no `medium` above it is UNKNOWN, never defaulted to
  // 'podcast'. Defaulting turns an absence into a claim.
  assert.equal(by(FEED_C).medium, null, 'medium was defaulted, not left unknown');
});

test('6. A URL-shaped item guid does not corrupt its `k` tag', () => {
  const urlItem = 'podcast:item:guid:https://example.com/ep/42';

  assert.equal(
    kindOf(urlItem),
    'podcast:item:guid',
    'the kind came from splitting the string, not from the table',
  );
  assert.notEqual(kindOf(urlItem), 'podcast:item:guid:https');

  // And it reaches the wire that way: a `k` no relay filter matches breaks
  // `#k` discovery without breaking anything visible.
  const { publish } = plan({
    read: ev([]),
    local: [feed(FEED_A, 'podcast', [urlItem])],
    baseline: base(),
    mode: 'public',
  });
  const kinds = publish.tags.filter((t) => t[0] === 'k').map((t) => t[1]);
  assert.ok(kinds.includes('podcast:item:guid'));
  assert.ok(!kinds.some((k) => k.includes('https')), `bad k tag: ${kinds}`);
});

test('7. Both `k` layouts parse identically', () => {
  // The layout this document specifies: one `k` per distinct kind, at the end.
  const trailing = [
    ['medium', 'podcast'],
    ['i', FEED_A],
    ['i', ITEM_A1],
    K_FEED,
    K_ITEM,
  ];

  // The layout an earlier revision wrote: a `k` beside every `i`.
  const paired = [
    ['medium', 'podcast'],
    ['i', FEED_A],
    K_FEED,
    ['i', ITEM_A1],
    K_ITEM,
  ];

  assert.deepEqual(
    shape(parseTags(paired)),
    shape(parseTags(trailing)),
    'a reader walking `i`/`k` in pairs shows an empty library, not an error',
  );
});

test('8. An entry you removed disappears; an entry you never published does not', () => {
  // ONE input — FEED_B is on the list and absent from local state — and two
  // baselines. Pinning only one direction lets an implementation that ignores
  // the baseline entirely pass.
  const read = ev([ALT, ['medium', 'podcast'], ['i', FEED_A], ['i', FEED_B], K_FEED]);
  const local = [feed(FEED_A, 'podcast')];

  const mine = plan({ read, local, baseline: base([FEED_A, FEED_B]), mode: 'public' });
  assert.ok(mine.publish, 'removing an entry must produce a publish');
  assert.ok(!ids(mine.publish.tags).includes(FEED_B), 'my own removal did not propagate');

  const theirs = plan({ read, local, baseline: base([FEED_A]), mode: 'public' });
  assert.equal(
    theirs.publish,
    null,
    'an entry we never published is not ours to remove — nothing should change',
  );
});

test('9. An entry another app removed is not resurrected', () => {
  // We hold it, our baseline claims it, and it is gone from the list. Another
  // app removed it. The obvious append-everything-local step re-adds it, and
  // because that step runs on every load the favorite returns forever, on
  // every device.
  const read = ev([ALT, ['medium', 'podcast'], ['i', FEED_A], K_FEED]);

  const { publish } = plan({
    read,
    local: [feed(FEED_A, 'podcast'), feed(FEED_B, 'podcast')],
    baseline: base([FEED_A, FEED_B]),
    mode: 'public',
  });

  assert.equal(publish, null, 'the removed entry was resurrected');
});

test('10. A baseline is never written for a publish that did not land', () => {
  const local = [feed(FEED_A, 'podcast', [ITEM_A1])];
  const start = base();

  const first = plan({ read: ev([]), local, baseline: start, mode: 'public' });
  assert.ok(first.publish);
  assert.notDeepEqual(
    first.baselineIfLanded,
    start,
    'the cycle should have something to record',
  );

  // Deciding a cycle must not record anything. An implementation that writes
  // the baseline as a side effect of planning has already recorded it before
  // anyone knows whether the event landed — which is the bug, in the one
  // place it is easiest to write by accident.
  assert.deepEqual(start, base(), 'planning recorded the baseline as a side effect');

  // The publish reached no relay. `baselineIfLanded` is the whole point of the
  // name: it is NOT recorded. Run the next cycle from the baseline we still
  // hold and the entries must be retried.
  const retry = plan({ read: ev([]), local, baseline: start, mode: 'public' });
  assert.ok(retry.publish, 'a lost publish became permanent');
  assert.deepEqual(ids(retry.publish.tags), [FEED_A, ITEM_A1]);
});

test('11. A group whose last item you removed goes; one with a foreign item left under it stays', () => {
  // Both cases are "a feed in my baseline that I no longer hold". Only the
  // first is a removal this writer may express.
  const mineOnly = ev([
    ALT,
    ['medium', 'podcast'],
    ['i', FEED_A],
    ['i', ITEM_A1],
    K_FEED,
    K_ITEM,
  ]);

  const gone = plan({
    read: mineOnly,
    local: [feed(FEED_C, 'podcast')],
    baseline: base([FEED_A, ITEM_A1]),
    mode: 'public',
  });
  assert.ok(!ids(gone.publish.tags).includes(FEED_A), 'an empty group should go');

  // ITEM_A2 belongs to another app. FEED_A is the only tag naming its parent,
  // so dropping the group takes their track with it.
  const withForeign = ev([
    ALT,
    ['medium', 'podcast'],
    ['i', FEED_A],
    ['i', ITEM_A1],
    ['i', ITEM_A2],
    K_FEED,
    K_ITEM,
  ]);

  const stays = plan({
    read: withForeign,
    local: [feed(FEED_C, 'podcast')],
    baseline: base([FEED_A, ITEM_A1]),
    mode: 'public',
  });

  const out = ids(stays.publish.tags);
  assert.ok(out.includes(ITEM_A2), "another app's track was deleted");
  assert.ok(out.includes(FEED_A), 'the group naming their track was dropped with it');
  assert.ok(!out.includes(ITEM_A1), 'our own removal should still propagate');
  assert.ok(
    at(stays.publish.tags, FEED_A) < at(stays.publish.tags, ITEM_A2),
    'the surviving item must still sit under its parent',
  );
});

test('12. An opaque `content` survives a republish by a writer that cannot read it', () => {
  const OPAQUE = 'sealed-bytes-this-writer-has-no-meaning-for';
  assert.equal(decodePrivate(OPAQUE), null, 'the fixture must be unreadable to us');

  const read = ev([ALT, ['medium', 'podcast'], ['i', FEED_A], K_FEED], OPAQUE);

  const { publish } = plan({
    read,
    local: [feed(FEED_A, 'podcast'), feed(FEED_C, 'podcast')],
    baseline: base([FEED_A]),
    mode: 'public',
  });

  assert.ok(publish, 'adding a favorite must publish');
  assert.equal(
    publish.content,
    OPAQUE,
    'content was blanked — this is the loss that happened in production on 2026-08-25',
  );

  // The inverse, in the same breath. Without it, a writer that simply never
  // touches the field passes on a technicality: it would return '' here too.
  const scratch = plan({
    read: ev([]),
    local: [feed(FEED_A, 'podcast')],
    baseline: base(),
    mode: 'public',
  });
  assert.equal(
    scratch.publish.content,
    '',
    'a list built from scratch is legitimately empty',
  );
});

test('13. Going private takes the whole list, and coming back does not', () => {
  // FEED_B is on the list, is not ours, and we cannot resolve it.
  const read = ev([
    ALT,
    ['medium', 'podcast'],
    ['i', FEED_A],
    ['i', FEED_B],
    K_FEED,
  ]);
  const local = [feed(FEED_A, 'podcast')];

  // public -> private. Every entry moves, ours and theirs. It only ever
  // reduces exposure and is reversible by any app that can decrypt. Moving
  // only what we wrote is what left a real user 97% private.
  const hidden = plan({ read, local, baseline: base([FEED_A]), mode: 'private' });
  assert.ok(hidden.publish);
  assert.deepEqual(ids(hidden.publish.tags), [], 'entries were left in the public half');

  const inPrivate = ids(decodePrivate(hidden.publish.content));
  assert.ok(inPrivate.includes(FEED_A), 'our own entry did not move');
  assert.ok(
    inPrivate.includes(FEED_B),
    "another app's entry stayed public — the user is now partly private with nothing saying which",
  );

  // private -> public is a DISCLOSURE. It publishes an `i` tag relays index
  // and it cannot be taken back, so only what our baseline claims may return.
  const shown = plan({
    read: hidden.publish,
    local,
    baseline: hidden.baselineIfLanded,
    mode: 'public',
  });

  const backOut = ids(shown.publish ? shown.publish.tags : []);
  assert.ok(backOut.includes(FEED_A), 'our own entry should come back');
  assert.ok(
    !backOut.includes(FEED_B),
    "another app's private entry was published as a relay-indexed `i` tag",
  );
  assert.ok(
    ids(decodePrivate(shown.publish.content)).includes(FEED_B),
    'their entry should stay where it is, not be dropped',
  );
});

test('14. A writer does not delete the half it does not write into (TWO cycles)', () => {
  // The half we do NOT publish into holds entries that are not ours.
  const foreignPrivate = encodePrivate([
    ['medium', 'podcast'],
    ['i', FEED_B],
  ]);
  const read = ev(
    [ALT, ['medium', 'podcast'], ['i', FEED_A], K_FEED],
    foreignPrivate,
  );
  const local = [feed(FEED_A, 'podcast')];

  // Cycle 1. Every single-cycle vector above passes over this: the bytes
  // emitted here are correct, and only the baseline recorded beside them is
  // wrong.
  const one = plan({ read, local, baseline: base([FEED_A]), mode: 'public' });
  const afterOne = one.publish ?? read;
  assert.ok(
    ids(decodePrivate(afterOne.content)).includes(FEED_B),
    'cycle 1 already lost the private half',
  );

  // Cycle 2, fed the baseline cycle 1 recorded. If that baseline claimed the
  // half we never write into, rule 3's "in your baseline, absent locally" row
  // now fires on the whole half at once.
  const two = plan({
    read: afterOne,
    local,
    baseline: one.baselineIfLanded,
    mode: 'public',
  });
  const afterTwo = two.publish ?? afterOne;

  assert.ok(
    ids(decodePrivate(afterTwo.content)).includes(FEED_B),
    "cycle 2 deleted the other writer's half — the claims were recomputed, not carried",
  );

  // The control, in the same fixture. A writer that never claims anything
  // also survives the assertion above, and it is broken in the other
  // direction: a later move between halves copies instead of moving, and the
  // entries the user asked to hide stay in plaintext beside the encrypted copy.
  assert.ok(
    one.baselineIfLanded.public.includes(FEED_A),
    'a list adopted off the relay must still enter the baseline for the half we DO write into',
  );
});

test('15. A list found with entries in BOTH halves is carried, then converged once', () => {
  // The state: FEED_A is in both halves, FEED_C only in the private one, and
  // this device's private baseline claims nothing — which is how a real
  // account reached 284 entries in both halves at once.
  const read = ev(
    [ALT, ['medium', 'podcast'], ['i', FEED_A], ['i', FEED_B], K_FEED],
    encodePrivate([['medium', 'podcast'], ['i', FEED_A], ['i', FEED_C]]),
  );
  const local = [feed(FEED_A, 'podcast')];

  // A cycle may not converge the list on its own initiative. Emptying either
  // half deletes entries this writer never wrote, and an entry appearing
  // twice is not evidence that either copy is ours.
  const carried = plan({ read, local, baseline: base([FEED_A]), mode: 'public' });
  const after = carried.publish ?? read;
  assert.deepEqual(
    ids(after.tags),
    [FEED_A, FEED_B],
    'the public half was rewritten by a cycle that was only asked to carry it',
  );
  assert.deepEqual(
    ids(decodePrivate(after.content)),
    [FEED_A, FEED_C],
    'the private half was tidied away — an overlap is not permission to delete it',
  );

  // Converging, once the baseline claims the half. Everything claimed comes
  // back to the tags, and FEED_A must appear ONCE: it was already there, and
  // the claimed-back copy is the same entry, not a second one. Concatenating
  // the two opens a second group for one feed and double-counts it for every
  // reader. Only reachable from this state, which is why no vector above
  // catches it.
  const converged = plan({
    read,
    local,
    baseline: base([FEED_A], [FEED_A, FEED_C]),
    mode: 'public',
  });
  assert.ok(converged.publish, 'converging should publish');
  const out = ids(converged.publish.tags);
  assert.deepEqual(
    out.filter((id) => id === FEED_A).length,
    1,
    'the entry that was in both halves was emitted twice',
  );
  assert.ok(
    out.includes(FEED_C),
    'a claimed private-only entry was deleted rather than moved',
  );
  assert.deepEqual(
    ids(decodePrivate(converged.publish.content)),
    [],
    'the private half should be empty once its claimed entries have moved',
  );
});
