/**
 * The 24 test vectors of ../pc20-favorites.md, executable.
 *
 * The spec states them as behaviors "so they can be written against any test
 * runner". This is that, for one runner, driven through the pure functions
 * described in ./adapter.d.ts. Point ADAPTER at your own implementation and
 * the same 24 run against it.
 *
 * Two ways to point it. Edit the import below, or leave this file alone and
 * set `PC20_FAVORITES_ADAPTER` to the path of your shim — which is what lets
 * an app run this suite from its own checkout without copying it:
 *
 *   PC20_FAVORITES_ADAPTER=./scripts/conformance-adapter.mjs \
 *     node --test ../PC20-Nostr/conformance/vectors.test.mjs
 *
 * Numbering matches the spec exactly. If you add a vector there, add it here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ADAPTER = await import(
  process.env.PC20_FAVORITES_ADAPTER
    ? pathToFileURL(path.resolve(process.env.PC20_FAVORITES_ADAPTER)).href
    : './reference/favorites.mjs'
);

const {
  parseTags,
  kindOf,
  plan,
  decodePrivate,
  encodePrivate,
  encodePlaintext,
  decodePlaintext,
  seal,
} = ADAPTER;

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
const VIS_PUBLIC = ['visibility', 'public'];
const VIS_PRIVATE = ['visibility', 'private'];
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
    at(publish.tags, FEED_A) < at(publish.tags, ITEM_A1) &&
      at(publish.tags, ITEM_A1) < at(publish.tags, FEED_B),
    'entries read keep their relative order',
  );

  // Ours is appended — to the END OF ITS MEDIUM RUN, which is where the
  // grouping rules put a podcast feed, and not necessarily to the end of the
  // event. Either a second `medium podcast` run after FEED_B or a place in the
  // first one is conforming; what is not is landing under `medium music`.
  const parsed = parseTags(publish.tags);
  assert.equal(
    parsed.entries.find((e) => e.id === FEED_C).medium,
    'podcast',
    'our new feed was filed under the wrong medium',
  );
  assert.equal(
    parsed.entries.find((e) => e.id === FEED_B).medium,
    'music',
    'the foreign feed was re-labelled',
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

  // public -> private, as a CHOICE — the user pressed Private here. Every
  // entry moves, ours and theirs. It only ever reduces exposure and is
  // reversible by any app that can decrypt. Moving only what we wrote is what
  // left a real user 97% private.
  const hidden = plan({
    read,
    local,
    baseline: base([FEED_A]),
    mode: 'private',
    userChose: true,
  });
  assert.ok(hidden.publish);
  assert.deepEqual(ids(hidden.publish.tags), [], 'entries were left in the public half');

  const inPrivate = ids(decodePrivate(hidden.publish.content));
  assert.ok(inPrivate.includes(FEED_A), 'our own entry did not move');
  assert.ok(
    inPrivate.includes(FEED_B),
    "another app's entry stayed public — the user is now partly private with nothing saying which",
  );

  // private -> public is a DISCLOSURE. It publishes an `i` tag relays index
  // and it cannot be taken back. The list now SAYS private, and a writer whose
  // standing setting says public is in the conflict the visibility section
  // describes: a standing preference does not restate a stated mode, so it
  // follows the list or asks — both existing apps ask. A writer that does
  // publish here may return only what its own baseline claims. Both answers
  // are conforming; moving FEED_B is not.
  const shown = plan({
    read: hidden.publish,
    // What the device holds now — unchanged for a writer that carries, the
    // whole private half for one that paints the active half into its store.
    local: hidden.holds ?? local,
    baseline: hidden.baselineIfLanded,
    mode: 'public',
  });

  const after = shown.publish ?? hidden.publish;
  const backOut = ids(after.tags);
  assert.ok(
    !backOut.includes(FEED_B),
    "another app's private entry was published as a relay-indexed `i` tag",
  );
  assert.ok(
    ids(decodePrivate(after.content)).includes(FEED_B),
    'their entry should stay where it is, not be dropped',
  );
  assert.ok(
    ids(decodePrivate(after.content)).includes(FEED_A),
    'our own entry must not be lost either — it is private, or it is public, never gone',
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
    local: one.holds ?? local,
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

  // Converging, once the baseline claims the half. This device put FEED_A and
  // FEED_C in the private half and still holds both — a claim without the
  // entry behind it is a removal, rule 3 — so both come to the tags, and
  // FEED_A must appear ONCE: it was already there, and the claimed-back copy
  // is the same entry, not a second one. Concatenating the two opens a second
  // group for one feed and double-counts it for every reader. Only reachable
  // from this state, which is why no vector above catches it.
  const converged = plan({
    read,
    local: [feed(FEED_A, 'podcast'), feed(FEED_C, 'podcast')],
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

test('16. The stated mode outranks whatever the halves happen to hold', () => {
  // FIXTURE 1 — the empty list, which nothing else in this file can reach.
  // Both halves are empty, so "whichever half holds entries is the mode" has
  // no answer, and every implementation before the tag had to guess. Guessing
  // `public` publishes this favorite as a relay-indexed `i` tag on the account
  // of someone who chose Private in another app.
  const emptyPrivate = ev([ALT, VIS_PRIVATE], '');
  const seeded = plan({
    read: emptyPrivate,
    local: [feed(FEED_A, 'podcast')],
    baseline: base(),
    mode: null, // no stored preference: follow the list
  });
  assert.ok(seeded.publish, 'a first favorite must still produce a publish');
  assert.deepEqual(
    ids(seeded.publish.tags),
    [],
    'the favorite was disclosed as a plaintext tag on a list that said private',
  );
  assert.deepEqual(ids(decodePrivate(seeded.publish.content)), [FEED_A]);

  // And with no tag, the same emptiness is a QUESTION. Publishing on a guess
  // is the disclosure; the writer must ask.
  const untagged = plan({
    read: ev([ALT], ''),
    local: [feed(FEED_A, 'podcast')],
    baseline: base(),
    mode: null,
  });
  assert.equal(
    untagged.publish,
    null,
    'an empty untagged list has no mode to infer — asking is the only safe answer',
  );

  // FIXTURE 2 — the tag says public and the private half still holds entries.
  // Only a writer that could read both halves may have written that tag, so it
  // is the user's stated intent for the whole list: finish the move.
  const halfConverged = ev(
    [ALT, VIS_PUBLIC, ['medium', 'podcast'], ['i', FEED_A], K_FEED],
    encodePrivate([['medium', 'podcast'], ['i', FEED_B]]),
  );
  const converged = plan({
    read: halfConverged,
    local: [feed(FEED_A, 'podcast')],
    baseline: base([FEED_A]),
    mode: 'public',
  });
  assert.ok(converged.publish, 'a half-converged list must be finished');
  assert.deepEqual(ids(converged.publish.tags), [FEED_A, FEED_B]);
  assert.deepEqual(
    ids(decodePrivate(converged.publish.content)),
    [],
    'the half the tag does not name must end up empty',
  );

  // The control, and it is the half that fails a naive implementation: the
  // SAME entries with no tag must NOT move. There is no stated intent, so
  // vector 13's conservative rule stands and moving FEED_B would be a
  // disclosure nobody asked for.
  const noTag = plan({
    read: ev(
      [ALT, ['medium', 'podcast'], ['i', FEED_A], K_FEED],
      encodePrivate([['medium', 'podcast'], ['i', FEED_B]]),
    ),
    local: [feed(FEED_A, 'podcast')],
    baseline: base([FEED_A]),
    mode: 'public',
  });
  // A writer may republish here — its canonical rendering of the private half
  // can differ from the bytes another app wrote — but it may not MOVE anything.
  const stillPrivate = noTag.publish ?? noTag.read ?? null;
  const settled = noTag.publish ?? {
    tags: [ALT, ['medium', 'podcast'], ['i', FEED_A], K_FEED],
    content: encodePrivate([['medium', 'podcast'], ['i', FEED_B]]),
  };
  assert.ok(
    !ids(settled.tags).includes(FEED_B),
    "without a stated mode there is nothing to say, and another app's private entry was disclosed",
  );
  assert.ok(
    ids(decodePrivate(settled.content)).includes(FEED_B),
    "without a stated mode another app's private entry stays private",
  );
  void stillPrivate;
});

test('17. A writer that cannot read a half may not restate the mode', () => {
  // `content` this writer's codec cannot decode — another app's NIP-44, or a
  // signer with no `nip44` at all. The user has just chosen Public here.
  const opaque = ev([ALT, VIS_PRIVATE, K_FEED], 'not-something-we-can-decode');

  const { publish } = plan({
    read: opaque,
    local: [feed(FEED_A, 'podcast')],
    baseline: base(),
    mode: 'public',
    userChose: true,
  });

  // Nothing may be said at all. Everything this writer would publish belongs
  // in a half it cannot open, and the one thing it could technically emit —
  // `visibility: public` — would be a false statement about someone's privacy
  // that the next writer converges on the strength of.
  assert.equal(
    publish,
    null,
    'a writer that cannot open the half the list lives in has nothing it may say',
  );

  // The same shape one step along, and the reason `null` above is not enough
  // on its own: a writer that DOES publish here must carry the bytes whole.
  // The reference emitted an encoded empty array instead — rule 4's `content`
  // clause broken by the one branch written to honour it, in a state no
  // earlier vector reaches.
  const carrying = plan({
    read: opaque,
    local: [],
    baseline: base(),
    mode: 'private',
    userChose: true,
  });
  if (carrying.publish) {
    assert.equal(
      carrying.publish.content,
      opaque.content,
      'rule 4: bytes we cannot read are republished byte for byte',
    );
  }

  // The control, in the same fixture: content this writer CAN read. Now the
  // change is honest, so it must go through — an implementation that never
  // restates the mode passes the assertions above for the wrong reason.
  const readable = ev(
    [ALT, VIS_PRIVATE, K_FEED],
    encodePrivate([['medium', 'podcast'], ['i', FEED_B]]),
  );
  const allowed = plan({
    read: readable,
    local: [feed(FEED_A, 'podcast')],
    baseline: base(),
    mode: 'public',
    userChose: true,
  });
  assert.ok(allowed.publish, 'an honest mode change must publish');
  assert.ok(
    allowed.publish.tags.some((t) => t[0] === 'visibility' && t[1] === 'public'),
    'the user chose Public in an app that could see both halves',
  );
  assert.ok(
    ids(allowed.publish.tags).includes(FEED_B),
    'the whole list moves — a stated mode is what lifts the asymmetry',
  );
  assert.deepEqual(ids(decodePrivate(allowed.publish.content)), []);

  // And the boundary: an EMPTY `content` is readable by anybody, because there
  // is no half to be blind to. A signer with no NIP-44 must still be able to
  // set the mode on a fresh list — treating empty as opaque freezes every new
  // account on such a signer at whatever the first writer guessed.
  const fresh = plan({
    read: ev([ALT], ''),
    local: [feed(FEED_A, 'podcast')],
    baseline: base(),
    mode: 'public',
    canReadPrivate: false,
    userChose: true,
  });
  assert.ok(fresh.publish, 'a fresh list must still accept a first favorite');
  assert.ok(
    fresh.publish.tags.some((t) => t[0] === 'visibility' && t[1] === 'public'),
    'nothing was hidden from this writer, so it may say what the list is',
  );
});

test('18. Items keep their wire order, and a new item lands at the end of its own group', () => {
  // Two groups, and the writer holds the first one's items in a DIFFERENT
  // order from the wire, plus one new item for it. Three ways to get this
  // wrong, and each one is a well-formed event:
  //
  //   local order first   — the other app reads it back, imposes ITS order,
  //                         and the two rewrite the event at each other forever
  //   append to the event — the new item lands after FEED_B and re-parents to it
  //   sort by anything    — same as the first, with a different key
  const read = ev([
    ALT,
    ['medium', 'podcast'],
    ['i', FEED_A],
    ['i', ITEM_A1],
    ['i', ITEM_A2],
    ['medium', 'music'],
    ['i', FEED_B],
    ['i', ITEM_B1],
    K_FEED,
    K_ITEM,
  ]);
  const ITEM_A3 = 'podcast:item:guid:aaaaaaaa-1111-0000-0000-000000000003';

  const { publish } = plan({
    read,
    local: [
      feed(FEED_A, 'podcast', [ITEM_A3, ITEM_A2, ITEM_A1]), // held in another order
      feed(FEED_B, 'music', [ITEM_B1]),
    ],
    baseline: base([FEED_A, ITEM_A1, ITEM_A2, FEED_B, ITEM_B1]),
    mode: 'public',
  });

  assert.ok(publish, 'a new item must produce a publish');
  assert.deepEqual(
    ids(publish.tags),
    [FEED_A, ITEM_A1, ITEM_A2, ITEM_A3, FEED_B, ITEM_B1],
    'read order kept, the new item after its own group and before the next',
  );
  const parsed = parseTags(publish.tags);
  assert.equal(
    parsed.entries.find((e) => e.id === ITEM_A3).parent,
    FEED_A,
    'the new item was appended to the event and attached to the wrong group',
  );
});

test('19. The same feed twice on the wire loses no item', () => {
  // A duplicate group is well-formed: a reader attaches each item to the most
  // recently opened group, and both groups name the same feed. A writer that
  // models groups by feed guid meets the second one already "taken" — and
  // skipping it drops ITEM_A2, which is a real favorite named nowhere else.
  const read = ev([
    ALT,
    ['medium', 'podcast'],
    ['i', FEED_A],
    ['i', ITEM_A1],
    ['i', FEED_A],
    ['i', ITEM_A2],
    K_FEED,
    K_ITEM,
  ]);

  // Carry it: nothing local, nothing claimed. Publishing nothing is fine;
  // publishing something must still hold both items under FEED_A.
  const carried = plan({ read, local: [], baseline: base(), mode: 'public' });
  const after = carried.publish ?? read;
  const parents = (tags) =>
    parseTags(tags)
      .entries.filter((e) => e.parent !== null)
      .map((e) => [e.id, e.parent]);
  assert.deepEqual(
    parents(after.tags).sort(),
    [[ITEM_A1, FEED_A], [ITEM_A2, FEED_A]].sort(),
    "the duplicate group's item was dropped, or moved under another feed",
  );

  // Then a real change. The writer folds or carries — either keeps every item
  // under its feed — and adds its own.
  const ITEM_A3 = 'podcast:item:guid:aaaaaaaa-1111-0000-0000-000000000003';
  const { publish } = plan({
    read,
    local: [feed(FEED_A, 'podcast', [ITEM_A1, ITEM_A3])],
    baseline: base([FEED_A, ITEM_A1]),
    mode: 'public',
  });
  assert.ok(publish, 'adding an item must publish');
  assert.deepEqual(
    parents(publish.tags).sort(),
    [[ITEM_A1, FEED_A], [ITEM_A2, FEED_A], [ITEM_A3, FEED_A]].sort(),
    "the duplicate group's item did not survive the writer's own change",
  );
});

test('20. An item before any feed group is carried, in place, and opens nothing', () => {
  // Nothing in this document writes one, and another writer may. It has no
  // parent — that is the whole fact about it — and it must not become the
  // parent of anything, close a group, or move.
  const ORPHAN = 'podcast:item:guid:00000000-9999-0000-0000-000000000001';
  const tags = [
    ALT,
    ['i', ORPHAN],
    ['medium', 'podcast'],
    ['i', FEED_A],
    ['i', ITEM_A1],
    K_FEED,
    K_ITEM,
  ];

  const parsed = parseTags(tags);
  const by = (id) => parsed.entries.find((e) => e.id === id);
  assert.ok(by(ORPHAN), 'an orphan item is an entry, not junk');
  assert.equal(by(ORPHAN).parent, null, 'an orphan has no parent');
  assert.equal(by(ITEM_A1).parent, FEED_A, 'the orphan re-parented the items after it');

  const { publish } = plan({
    read: ev(tags),
    local: [feed(FEED_A, 'podcast', [ITEM_A1]), feed(FEED_C, 'podcast')],
    baseline: base([FEED_A, ITEM_A1]),
    mode: 'public',
  });
  assert.ok(publish);
  assert.ok(ids(publish.tags).includes(ORPHAN), 'the orphan was dropped');
  assert.ok(
    at(publish.tags, ORPHAN) < at(publish.tags, FEED_A),
    'the orphan moved — and after a feed entry it would BE that feed\'s item',
  );
});

test('21. Exactly one `alt`, ours, first', () => {
  // A NIP-31 rendering hint, not user data. A writer regenerates it rather
  // than carrying a foreign value, because the event can hold only one and a
  // reader that has no definition for kind 10333 shows whatever is there.
  const read = ev([
    ['alt', 'Somebody else\'s label'],
    ['medium', 'podcast'],
    ['i', FEED_A],
    K_FEED,
  ]);
  const { publish } = plan({
    read,
    local: [feed(FEED_A, 'podcast'), feed(FEED_C, 'podcast')],
    baseline: base([FEED_A]),
    mode: 'public',
  });
  assert.ok(publish);
  assert.deepEqual(publish.tags[0], ALT, 'alt is the first tag and carries the canonical label');
  assert.equal(
    publish.tags.filter((t) => t[0] === 'alt').length,
    1,
    'a foreign alt was carried beside ours',
  );
});

test('22. The private plaintext carries no `?`', () => {
  // A NIP-55 signer URL-decodes the whole `nostrsigner:` URI and only then
  // splits it on `?`. Item guids are routinely permalink URLs, so one favorited
  // track with a query string would otherwise break every private publish on
  // Android, forever, with an error that reads as "signer not installed". The
  // escape is JSON's own, so every reader already understands it.
  const QUERY_ITEM = 'podcast:item:guid:https://example.com/ep?id=42&x=y';
  const tags = [['medium', 'podcast'], ['i', FEED_A], ['i', QUERY_ITEM]];

  const text = encodePlaintext(tags);
  assert.ok(!text.includes('?'), `the plaintext still carries a "?": ${text}`);
  assert.deepEqual(JSON.parse(text), tags, 'the escape must be one JSON itself understands');
  assert.deepEqual(decodePlaintext(text), tags, 'and round-trip through the reader');

  // And through a whole cycle: what comes back out of `content` is the guid.
  const { publish } = plan({
    read: ev([]),
    local: [feed(FEED_A, 'podcast', [QUERY_ITEM])],
    baseline: base(),
    mode: 'private',
  });
  assert.ok(publish);
  assert.ok(ids(decodePrivate(publish.content)).includes(QUERY_ITEM));
});

test('23. A plaintext that is not a tag array is an unreadable half, not an empty one', () => {
  // `JSON.parse` succeeding is not the same as having read a list. Valid JSON
  // that is not an array of string arrays marks the half "readable and empty"
  // in the obvious implementation, and the next republish rewrites `content`
  // from that emptiness — another app's data gone, from a decrypt that worked.
  assert.equal(decodePlaintext('{"tags":[]}'), null);
  assert.equal(decodePlaintext('"a string"'), null);
  assert.equal(decodePlaintext('[["i","x"],"not a tag"]'), null);
  assert.equal(decodePlaintext('[["i","x"],["i",1]]'), null, 'a non-string element');
  assert.deepEqual(decodePlaintext('[]'), [], 'an empty array IS an empty list');

  // The same rule one level up: bytes this writer can open but not read as a
  // list are carried exactly as an opaque `content` is (vector 12), and a
  // writer may not publish INTO them.
  const notAList = seal('{"not":"a list"}');
  assert.equal(decodePrivate(notAList), null, 'the fixture must be unreadable-as-a-list');
  const read = ev([ALT, ['medium', 'podcast'], ['i', FEED_A], K_FEED], notAList);

  const carrying = plan({
    read,
    local: [feed(FEED_A, 'podcast'), feed(FEED_C, 'podcast')],
    baseline: base([FEED_A]),
    mode: 'public',
  });
  assert.ok(carrying.publish, 'a public-half change still publishes');
  assert.equal(carrying.publish.content, notAList, 'the bytes were rewritten');

  const into = plan({
    read,
    local: [feed(FEED_A, 'podcast')],
    baseline: base([FEED_A]),
    mode: 'private',
  });
  assert.equal(into.publish, null, 'published into a half this writer could not read');
});

test('24. A private half past the NIP-44 v2 cliff is refused, not published', () => {
  // NIP-44 v2 as first published capped plaintext at 65535 bytes, and a signer
  // built to that text rejects a payload across the line — so the list reads
  // back as EMPTY on that device, not as an error. The writer refuses at
  // 60,000 bytes of plaintext, which leaves room for what NIP-44 adds on the
  // way to `content`. Refusing costs one favorite; publishing costs the whole
  // list on the device that hits the cliff.
  const wide = (n) =>
    Array.from({ length: n }, (_, i) =>
      `podcast:item:guid:https://example.com/a-fairly-long-permalink-path/episode-${String(i).padStart(4, '0')}-of-many`,
    );

  // Grow the fixture from the writer's own plaintext, so the vector tracks the
  // cap rather than a guess about bytes per entry.
  let items = wide(200);
  while (encodePlaintext([['i', FEED_A], ...items.map((id) => ['i', id])]).length <= 60_000) {
    items = wide(items.length + 100);
  }
  const over = plan({
    read: ev([]),
    local: [feed(FEED_A, 'podcast', items)],
    baseline: base(),
    mode: 'private',
  });
  assert.equal(over.publish, null, 'a private half past the cliff was published');
  assert.deepEqual(over.baselineIfLanded, base(), 'a refused publish claims nothing');

  // The control: the same shape well under the line publishes.
  const under = plan({
    read: ev([]),
    local: [feed(FEED_A, 'podcast', wide(50))],
    baseline: base(),
    mode: 'private',
  });
  assert.ok(under.publish, 'a private half under the cliff must still publish');
});
