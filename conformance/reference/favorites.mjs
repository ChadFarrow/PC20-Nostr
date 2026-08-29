/**
 * AUTHORED. This file has never served traffic.
 *
 * It exists so `../vectors.test.mjs` has something to run against — 14
 * assertions nobody has watched go green are prose in a new costume. It is a
 * worked example of the rules in `../../pc20-favorites.md`, not a
 * recommendation and not an extraction. If you want code a real site runs,
 * `../../catalog/modules/nostr/favorites-list.ts` is the shipped one, and
 * `../../catalog/comparisons/favorites-10333.md` says what it is missing.
 *
 * Deliberately unoptimised and deliberately explicit: every rule below cites
 * the section of the spec it comes from, because the point of this file is to
 * be read beside the document rather than to be fast.
 *
 * ONE SIMPLIFICATION, and it is the only place this diverges from a real
 * implementation. The private half here is encoded with `encodePrivate` /
 * `decodePrivate` below — reversible, unauthenticated, and NOT encryption. A
 * real writer uses NIP-44 encrypt-to-self. The distinction the vectors care
 * about is "can this writer read the half or not", and a fake codec models
 * that without making the suite depend on a crypto library. See the note on
 * idempotence in `plan` for the one place real NIP-44 behaves differently.
 */

export const KIND = 10333;
export const ALT = 'PC 2.0 Favorites';

/**
 * The known-kinds table. Data Structure, "Derive the kind from a known-kinds
 * table rather than by scanning the string": item guids are routinely
 * permalink URLs, so "everything before the last colon" on
 * `podcast:item:guid:https://example.com/ep/42` yields `podcast:item:guid:https`.
 *
 * Longest first so a prefix can never shadow a longer one.
 */
const KNOWN_KINDS = [
  'podcast:publisher:guid',
  'podcast:item:guid',
  'podcast:guid',
];

/** The kind of an identifier, or null when no writer here knows it. */
export function kindOf(identifier) {
  if (typeof identifier !== 'string') return null;
  for (const k of KNOWN_KINDS) {
    if (identifier.startsWith(k + ':')) return k;
  }
  return null;
}

const isFeedKind = (k) => k === 'podcast:guid' || k === 'podcast:publisher:guid';

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Tag array in, structure out. Grouping rules:
 *
 *   - `medium` is a RUNNING value, applying to every entry after it.
 *   - A feed `i` opens a group, tagged with the current medium.
 *   - An item `i` belongs to the MOST RECENTLY OPENED group, until the next
 *     feed entry or the next `medium` tag.
 *   - An entry before any `medium` tag has an UNKNOWN medium — null here,
 *     never defaulted to 'podcast'.
 *   - `k` takes no part in grouping and is never used to derive an entry's
 *     kind. Both `k` layouts therefore parse identically (vector 7).
 *   - An unparseable `i` is carried and does NOT close the open group
 *     (rule 4), or everything after it re-parents.
 */
export function parseTags(tags) {
  let medium = null;
  let group = null;
  const groups = [];
  const entries = [];
  const kinds = [];
  const foreign = [];

  (tags ?? []).forEach((tag, index) => {
    const name = tag[0];
    const value = tag[1];

    if (name === 'medium') {
      medium = value ?? null;
      group = null; // a medium tag closes the open group
      return;
    }
    if (name === 'k') {
      kinds.push(value);
      return;
    }
    if (name === 'alt') return;

    if (name !== 'i') {
      foreign.push({ index, tag });
      return;
    }

    const kind = kindOf(value);
    if (kind === null) {
      // Unreadable identifier. Carried whole, and the open group stays open.
      foreign.push({ index, tag });
      return;
    }

    if (isFeedKind(kind)) {
      group = { id: value, kind, medium, index, items: [] };
      groups.push(group);
      entries.push({ id: value, kind, medium, index, parent: null });
    } else {
      if (group) group.items.push(value);
      entries.push({
        id: value,
        kind,
        medium,
        index,
        parent: group ? group.id : null,
      });
    }
  });

  return { entries, groups, kinds, foreign };
}

/** Whole event in, structure plus the raw halves out. */
export function parse(event) {
  const tags = event?.tags ?? [];
  const content = event?.content ?? '';
  return {
    ...parseTags(tags),
    content,
    private: decodePrivate(content),
  };
}

// ---------------------------------------------------------------------------
// The private half
// ---------------------------------------------------------------------------

const PRIV_PREFIX = 'PRIV1:';

/** NOT encryption. See the header. */
export function encodePrivate(tags) {
  if (!tags || tags.length === 0) return '';
  return PRIV_PREFIX + Buffer.from(JSON.stringify(tags), 'utf8').toString('base64');
}

/**
 * Returns the decoded tag array, or null when this writer cannot read the
 * bytes. null is the case rule 4 is about: carry them, do not parse them, and
 * never replace them with `''`.
 */
export function decodePrivate(content) {
  if (!content) return [];
  if (!content.startsWith(PRIV_PREFIX)) return null; // opaque — foreign writer
  try {
    const parsed = JSON.parse(
      Buffer.from(content.slice(PRIV_PREFIX.length), 'base64').toString('utf8'),
    );
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The merge
// ---------------------------------------------------------------------------

const idsOf = (localGroups) => {
  const out = new Set();
  for (const g of localGroups ?? []) {
    out.add(g.id);
    for (const item of g.items ?? []) out.add(item);
  }
  return out;
};

/**
 * Rule 3, over ONE half's tag array.
 *
 *   an entry you hold locally            keep it
 *   an entry not in your baseline        carry it — another app added it
 *   an entry in your baseline, absent    drop it — you removed it
 *   anything you can't parse             carry the whole tag
 *
 * Then append what you hold that was not on the list, unless the baseline
 * names it — that is another app's removal, and re-adding it is a
 * resurrection loop.
 *
 * `adoptAll` is the public → private whole-list move: every entry travels,
 * including ones this device neither holds nor claims (Open questions, "The
 * choice belongs to the LIST"). It only ever reduces exposure.
 */
function mergeHalf(readTags, localGroups, baselineIds, { adoptAll = false } = {}) {
  const held = idsOf(localGroups);
  const claimed = new Set(baselineIds ?? []);

  const keep = (id) => adoptAll || held.has(id) || !claimed.has(id);

  // Pass 1: decide each entry, keeping read order and position.
  const parsed = parseTags(readTags);
  const decision = new Map(); // tag index -> true/false
  for (const e of parsed.entries) decision.set(e.index, keep(e.id));

  // "A feed group survives while any item under it does." The group is the
  // only thing naming those items' parent; dropping it takes another app's
  // tracks with it.
  for (const g of parsed.groups) {
    if (decision.get(g.index)) continue;
    const anyItemSurvives = parsed.entries.some(
      (e) => e.parent === g.id && decision.get(e.index),
    );
    if (anyItemSurvives) decision.set(g.index, true);
  }

  const out = [];
  let emittedMedium = null;
  (readTags ?? []).forEach((tag, index) => {
    const name = tag[0];
    if (name === 'alt' || name === 'k') return; // regenerated below
    if (name === 'medium') {
      // Carried, but only if something after it still needs it. Emitting a
      // medium run with no entries under it is a byte change for nothing.
      const nextMedium = (readTags ?? []).findIndex(
        (t, i) => i > index && t[0] === 'medium',
      );
      const end = nextMedium === -1 ? readTags.length : nextMedium;
      const anyKept = (readTags ?? []).some(
        (t, i) =>
          i > index &&
          i < end &&
          (decision.get(i) === true ||
            (decision.get(i) === undefined && t[0] === 'i')),
      );
      if (anyKept) {
        out.push(tag);
        emittedMedium = tag[1] ?? null;
      }
      return;
    }
    if (decision.has(index)) {
      if (decision.get(index)) out.push(tag);
      return;
    }
    out.push(tag); // foreign tag, or an `i` no writer here can parse — carried whole
  });

  // Pass 2: append what we hold that was not on the list.
  const onList = new Set(parsed.entries.map((e) => e.id));
  for (const g of localGroups ?? []) {
    const newItems = (g.items ?? []).filter(
      (id) => !onList.has(id) && !claimed.has(id),
    );
    const groupIsNew = !onList.has(g.id) && !claimed.has(g.id);
    if (!groupIsNew && newItems.length === 0) continue;

    const medium = g.medium ?? null;
    if (medium !== emittedMedium) {
      if (medium !== null) out.push(['medium', medium]);
      emittedMedium = medium;
    }
    if (groupIsNew) out.push(['i', g.id]);
    for (const id of newItems) out.push(['i', id]);
  }

  return out;
}

/**
 * `alt` first, entries in the middle, one `k` per distinct kind at the end.
 *
 * `carried` holds `k` values read off the event that this writer does not
 * derive — a kind named by a writer newer than us. Rule 4: carried through
 * untouched, not dropped because we have no meaning for it. Regenerating the
 * derivable ones is what makes both `k` layouts (vector 7) converge on the
 * one the Data Structure section specifies.
 */
function frame(entryTags, carried = []) {
  const kinds = [];
  for (const t of entryTags) {
    if (t[0] !== 'i') continue;
    const k = kindOf(t[1]);
    if (k && !kinds.includes(k)) kinds.push(k);
  }
  for (const k of carried) {
    if (k !== undefined && !kinds.includes(k)) kinds.push(k);
  }
  return [['alt', ALT], ...entryTags, ...kinds.map((k) => ['k', k])];
}

/** Entry-bearing tags only — what `mergeHalf` consumes. */
const stripFrame = (tags) => (tags ?? []).filter((t) => t[0] !== 'alt' && t[0] !== 'k');

/** `k` values on the event that we cannot derive from our own entries. */
const foreignKinds = (tags) =>
  (tags ?? [])
    .filter((t) => t[0] === 'k')
    .map((t) => t[1])
    .filter((v) => !KNOWN_KINDS.includes(v));

const sameTags = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------
// One publish cycle
// ---------------------------------------------------------------------------

/**
 * Decide a cycle without sending it.
 *
 *   read      the event as read, or NULL when the read is not trustworthy
 *   local     this device's favorites, as feed groups
 *   baseline  { public: [ids], private: [ids] } — this device's claims,
 *             PER HALF (rule 2)
 *   mode      'public' | 'private' — the half this writer feeds
 *
 * Returns the event to publish (null = publish nothing) and the baseline to
 * record IF AND ONLY IF that publish lands. Recording it on a publish that
 * reached no relay is what makes a lost publish permanent (vector 10), so the
 * two are deliberately separate values rather than one side effect.
 */
export function plan({ read, local = [], baseline, mode = 'public' }) {
  const base = {
    public: [...(baseline?.public ?? [])],
    private: [...(baseline?.private ?? [])],
  };

  // Rule 1. A read you don't trust is not an empty list. Publishing on one
  // republishes a whole library as empty.
  if (read === null || read === undefined) {
    return { publish: null, baselineIfLanded: base };
  }

  const readTags = stripFrame(read.tags);
  const readContent = read.content ?? '';
  const readPrivate = decodePrivate(readContent); // null = opaque to us

  const goingPrivate = mode === 'private';
  const activeReadTags = goingPrivate ? (readPrivate ?? []) : readTags;
  const inactiveReadTags = goingPrivate ? readTags : (readPrivate ?? []);
  const activeBaseline = goingPrivate ? base.private : base.public;
  const inactiveBaseline = goingPrivate ? base.public : base.private;

  // We cannot read the private half. Carry the bytes and never touch them.
  // Rule 4's `content` clause: "Republish event.content byte for byte, unless
  // you encrypted the bytes you are replacing it with."
  const privateIsOpaque = readPrivate === null;

  let mergedActive;
  let mergedInactive;

  if (goingPrivate && privateIsOpaque) {
    // Another writer owns the private half and we cannot merge into it.
    // Do not switch on top of bytes we cannot read — that would drop them.
    mergedActive = [];
    mergedInactive = readTags;
  } else if (goingPrivate) {
    // public → private takes the WHOLE list, ours and theirs. It only ever
    // reduces exposure, and it is reversible by any app that can decrypt.
    const moving = mergeHalf(inactiveReadTags, local, inactiveBaseline, {
      adoptAll: true,
    });
    mergedActive = mergeHalf(
      [...activeReadTags, ...moving],
      local,
      activeBaseline,
      { adoptAll: true },
    );
    mergedInactive = [];
  } else {
    // private → public may NOT move another app's entries: it is a
    // disclosure, it publishes an `i` tag relays index, and it cannot be
    // taken back. Move only what our baseline says we put there.
    mergedActive = mergeHalf(activeReadTags, local, activeBaseline);
    if (privateIsOpaque) {
      mergedInactive = null; // carry the ciphertext verbatim
    } else {
      const returning = new Set(base.private);
      mergedInactive = inactiveReadTags.filter((t) => {
        if (t[0] !== 'i') return true;
        return !returning.has(t[1]);
      });
      const claimedBack = inactiveReadTags.filter(
        (t) => t[0] === 'i' && returning.has(t[1]),
      );
      mergedActive = mergeHalf(
        [...mergedActive, ...claimedBack],
        local,
        activeBaseline,
      );
    }
  }

  const carriedKinds = foreignKinds(read.tags);
  const publicTags = frame(
    goingPrivate ? mergedInactive : mergedActive,
    carriedKinds,
  );
  const privateTags = goingPrivate ? mergedActive : mergedInactive;

  // Rule 4: an opaque half is republished byte for byte. Note the shape —
  // `content` is a value threaded from the read, never a literal. A default
  // parameter is how a `''` gets written back in by habit.
  const content =
    privateTags === null ? readContent : encodePrivate(privateTags);

  // Rule 5: compare against THE READ, byte for byte. Only that notices that
  // another app has edited the event since.
  //
  // Compare the DECODED private half, not the encoded bytes. Real NIP-44
  // draws a fresh nonce per encryption, so identical entries produce
  // different ciphertext every time and a bytes comparison always differs —
  // every load republishes, forever. The fake codec here is deterministic and
  // would hide that, so the comparison is written the way a real one must be.
  const unchanged =
    sameTags(publicTags, frame(readTags, carriedKinds)) &&
    JSON.stringify(privateTags ?? readPrivate) === JSON.stringify(readPrivate);

  const publish = unchanged ? null : { kind: KIND, tags: publicTags, content };

  // Rule 2, per half. The half we did NOT publish into has no new
  // contribution, so its claims are CARRIED, never recomputed. Recompute them
  // and we claim every entry in it, another writer's included; nothing backs
  // the claim next cycle, so rule 3's "in your baseline, absent locally" row
  // fires on the whole half at once.
  const activeClaims = (goingPrivate ? privateTags ?? [] : publicTags)
    .filter((t) => t[0] === 'i')
    .map((t) => t[1])
    .filter((id) => idsOf(local).has(id) || activeBaseline.includes(id));

  const carriedInactive = inactiveBaseline.filter(
    (id) => !activeClaims.includes(id),
  );

  const baselineIfLanded = goingPrivate
    ? { public: carriedInactive, private: activeClaims }
    : { public: activeClaims, private: carriedInactive };

  return { publish, baselineIfLanded };
}
