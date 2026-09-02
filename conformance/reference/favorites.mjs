/**
 * AUTHORED. This file has never served traffic.
 *
 * It exists so `../vectors.test.mjs` has something to run against — 24
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
/** The tag naming which half the whole list lives in. Multi-letter on purpose:
 *  relays index single-letter tags, and `#v=private` would enumerate the
 *  pubkeys that keep one. */
export const VISIBILITY = 'visibility';

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

/**
 * The largest plaintext a writer may hand a signer, in UTF-8 bytes.
 *
 * NIP-44 v2 as first published capped plaintext at 65535 bytes; the current
 * text allows more and switches to a 6-byte length prefix at 65536, so a
 * library built to the older text REJECTS a payload across that line — and a
 * private half that cannot be decrypted is indistinguishable from an empty
 * one. Sized under the cliff with room for the 1.5x NIP-44 adds on the way to
 * `content`. Writing the private half, "Refuse to publish past 60,000 bytes".
 */
export const PRIVATE_PLAINTEXT_MAX = 60_000;

/** UTF-8 byte length, which is what the NIP-44 limit counts. */
export const plaintextBytes = (text) => Buffer.byteLength(text, 'utf8');

/**
 * The bytes handed to the signer: a stringified tag array, with `?` written as
 * its six-character JSON escape.
 *
 * Writing the private half, "The plaintext carries no `?`": a NIP-55 signer
 * URL-decodes the whole `nostrsigner:` URI and only then splits it on `?`, so
 * one favorited track with a query string in its guid would otherwise break
 * every private publish on Android, forever. Every JSON reader already
 * understands the escape, so the other app decodes it without being told.
 */
export function encodePlaintext(tags) {
  return JSON.stringify(tags ?? []).replace(/\?/g, '\\u003f');
}

/**
 * The plaintext back into a tag array, or NULL when it is not one.
 *
 * Null, not `[]`, for valid JSON that is not an array of string arrays. A
 * `JSON.parse` that succeeds on `{}` would otherwise mark the half readable
 * and empty, and the next republish rewrites `content` from that emptiness.
 * Writing the private half, "A plaintext that is not a tag array is unreadable".
 */
export function decodePlaintext(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  for (const tag of parsed) {
    if (!Array.isArray(tag) || !tag.every((v) => typeof v === 'string')) return null;
  }
  return parsed;
}

/** NOT encryption — see the header. Stands in for NIP-44 encrypt-to-self. */
export function seal(text) {
  return PRIV_PREFIX + Buffer.from(text, 'utf8').toString('base64');
}

/** The inverse, or null for bytes this writer did not seal. */
function unseal(content) {
  if (!content.startsWith(PRIV_PREFIX)) return null;
  return Buffer.from(content.slice(PRIV_PREFIX.length), 'base64').toString('utf8');
}

/** Plaintext then seal — the shape a real writer follows with NIP-44. */
export function encodePrivate(tags) {
  if (!tags || tags.length === 0) return '';
  return seal(encodePlaintext(tags));
}

/**
 * Returns the decoded tag array, or null when this writer cannot read the
 * bytes. null is the case rule 4 is about: carry them, do not parse them, and
 * never replace them with `''`.
 */
export function decodePrivate(content) {
  if (!content) return [];
  const text = unseal(content);
  if (text === null) return null; // opaque — foreign writer
  return decodePlaintext(text);
}

// ---------------------------------------------------------------------------
// The merge
// ---------------------------------------------------------------------------

/**
 * One `i` per identifier, first position wins.
 *
 * Only reachable from the both-halves state: an entry in BOTH halves is one
 * entry, and a whole-list move that concatenates the halves emits it twice —
 * a second group for the same feed, double-counted by every reader. Vector 15
 * pins it in one direction; the tag makes the other direction reachable too.
 */
function dedupeEntries(tags) {
  const seen = new Set();
  const out = [];
  for (const tag of tags ?? []) {
    if (tag[0] === 'i') {
      if (seen.has(tag[1])) continue;
      seen.add(tag[1]);
    }
    out.push(tag);
  }
  return out;
}

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

  // Which group each emitted `i` belongs to, so a new item for a group that is
  // already on the list can be placed at the end of THAT group's run. Appending
  // it to the end of the event instead re-parents it to whichever group was
  // opened last — well-formed, and wrong. Vector 18.
  const ownerOf = new Map(); // tag index -> group id
  for (const e of parsed.entries) ownerOf.set(e.index, e.parent ?? e.id);

  const out = [];
  const owner = []; // parallel to `out`
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
        owner.push(null);
        emittedMedium = tag[1] ?? null;
      }
      return;
    }
    if (decision.has(index)) {
      if (decision.get(index)) {
        out.push(tag);
        owner.push(ownerOf.get(index) ?? null);
      }
      return;
    }
    out.push(tag); // foreign tag, or an `i` no writer here can parse — carried whole
    owner.push(null);
  });

  // Pass 2: add what we hold that was not on the list.
  //
  // A group already on the list keeps its items in the order they were read,
  // and its new items go at the end of its own run — never at the end of the
  // event, where they would attach to the last group opened, and never ahead
  // of the ones read, which is the local-first order that has two apps
  // rewriting the event against each other forever. Vector 18.
  const onList = new Set(parsed.entries.map((e) => e.id));
  for (const g of localGroups ?? []) {
    const newItems = (g.items ?? []).filter(
      (id) => !onList.has(id) && !claimed.has(id),
    );
    const groupIsNew = !onList.has(g.id) && !claimed.has(g.id);
    if (!groupIsNew && newItems.length === 0) continue;

    if (!groupIsNew && onList.has(g.id)) {
      const at = owner.lastIndexOf(g.id);
      if (at !== -1) {
        out.splice(at + 1, 0, ...newItems.map((id) => ['i', id]));
        owner.splice(at + 1, 0, ...newItems.map(() => g.id));
        continue;
      }
    }

    const medium = g.medium ?? null;
    if (medium !== emittedMedium) {
      if (medium !== null) {
        out.push(['medium', medium]);
        owner.push(null);
      }
      emittedMedium = medium;
    }
    if (groupIsNew) {
      out.push(['i', g.id]);
      owner.push(g.id);
    }
    for (const id of newItems) {
      out.push(['i', id]);
      owner.push(g.id);
    }
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
function frame(entryTags, carried = [], visibility = null) {
  const kinds = [];
  for (const t of entryTags) {
    if (t[0] !== 'i') continue;
    const k = kindOf(t[1]);
    if (k && !kinds.includes(k)) kinds.push(k);
  }
  for (const k of carried) {
    if (k !== undefined && !kinds.includes(k)) kinds.push(k);
  }
  const head = visibility ? [['alt', ALT], [VISIBILITY, visibility]] : [['alt', ALT]];
  return [...head, ...entryTags, ...kinds.map((k) => ['k', k])];
}

/** Entry-bearing tags only — what `mergeHalf` consumes. */
const stripFrame = (tags) =>
  (tags ?? []).filter((t) => t[0] !== 'alt' && t[0] !== 'k' && t[0] !== VISIBILITY);

/**
 * The mode the event STATES, or null when it does not.
 *
 * Null is not "public". It means the list was written before this tag existed,
 * and the caller falls back to inferring the mode from whichever half holds
 * entries — which answers correctly for every list that has any, and cannot
 * answer at all for a list that has none.
 */
export function statedVisibility(tags) {
  for (const t of tags ?? []) {
    if (t[0] !== VISIBILITY) continue;
    if (t[1] === 'public' || t[1] === 'private') return t[1];
  }
  return null;
}

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
export function plan({
  read,
  local = [],
  baseline,
  mode = 'public',
  canReadPrivate = true,
  userChose = false,
}) {
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
  // `canReadPrivate: false` stands in for a signer with no NIP-44. It is not
  // the same as an unparseable payload and it reaches the same place: bytes we
  // must carry and may not reason about.
  //
  // EXCEPT when there is nothing there. An empty `content` is readable by
  // anybody — there is no half to be blind to — so a signer with no NIP-44 may
  // still set the mode on a fresh list. Treating empty as opaque would freeze
  // every new account on such a signer at whatever the first writer guessed.
  const readPrivate =
    canReadPrivate || readContent === '' ? decodePrivate(readContent) : null;

  // What the EVENT says, which is not the same as what this writer wants.
  // Null means the list predates the tag.
  const stated = statedVisibility(read.tags);
  const opaque = readPrivate === null;

  // The fallback for a list with no tag: whichever half holds entries. It
  // answers for every list that has any, and it cannot answer for one that has
  // none — which is the gap the tag exists to close.
  const hasPublicEntries = readTags.some((t) => t[0] === 'i');
  const hasPrivateEntries = (readPrivate ?? []).some((t) => t[0] === 'i');
  const inferred =
    hasPublicEntries && !hasPrivateEntries
      ? 'public'
      : hasPrivateEntries && !hasPublicEntries
        ? 'private'
        : null; // both, or neither — a question, not an answer

  // `mode: null` is a writer with no stored preference: it follows the list.
  // If the list cannot say either, it must ASK — publishing on a guess is how
  // a favorite someone hid becomes a relay-indexed `i` tag.
  const listMode = stated ?? inferred;
  if (mode === null && listMode === null) {
    return { publish: null, baselineIfLanded: base };
  }
  const wanted = mode ?? listMode;

  // CHANGING A STATED MODE TAKES TWO THINGS, and neither is this writer's
  // standing preference.
  //
  //   the user asking for it — a stored setting that merely disagrees is two
  //   apps holding different answers about one shared event, and letting the
  //   one that loaded last win is how a list flips halves on a page load;
  //
  //   being able to read BOTH halves — an app whose signer has no NIP-44
  //   cannot move what it cannot see, so claiming the list is public would
  //   publish a false statement about someone's privacy, and the next writer
  //   to believe it converges on the strength of it.
  const mayChange = userChose && !opaque;
  const effective = stated && stated !== wanted && !mayChange ? stated : wanted;

  // The tag is carried forward once the list has one, and written for the
  // first time only when the user has actually chosen. A writer stamping its
  // own default on a legacy list would state a mode nobody picked — and on a
  // list that already has a private half, that stamp is what would license
  // disclosing it.
  const mayState = userChose || stated !== null;

  // The public direction is a DISCLOSURE, so it moves another app's entries
  // only on a stated intent. Without one, the conservative rule stands and we
  // take back only what our own baseline claims.
  const licensedPublic =
    effective === 'public' &&
    (stated === 'public' || (mayChange && wanted === 'public'));

  const goingPrivate = effective === 'private';
  const activeReadTags = goingPrivate ? (readPrivate ?? []) : readTags;
  const inactiveReadTags = goingPrivate ? readTags : (readPrivate ?? []);
  const activeBaseline = goingPrivate ? base.private : base.public;
  const inactiveBaseline = goingPrivate ? base.public : base.private;

  // We cannot read the private half. Carry the bytes and never touch them.
  // Rule 4's `content` clause: "Republish event.content byte for byte, unless
  // you encrypted the bytes you are replacing it with."
  const privateIsOpaque = opaque;

  let mergedActive;
  let mergedInactive;

  if (goingPrivate && privateIsOpaque) {
    // Another writer owns the private half and we cannot merge into it.
    // Do not switch on top of bytes we cannot read — that would drop them.
    //
    // NULL, not `[]`. An empty array is a private half we are asserting is
    // empty, and it re-encodes to real bytes that replace theirs — rule 4's
    // `content` clause broken by the one branch that exists to honour it.
    // Vector 17 is what caught this; vector 12 never reaches this branch,
    // because it reads the opaque half from the OTHER side.
    mergedActive = null;
    mergedInactive = readTags;
  } else if (goingPrivate) {
    // public → private takes the WHOLE list, ours and theirs. It only ever
    // reduces exposure, and it is reversible by any app that can decrypt.
    const moving = mergeHalf(inactiveReadTags, local, inactiveBaseline, {
      adoptAll: true,
    });
    mergedActive = dedupeEntries(
      mergeHalf([...activeReadTags, ...moving], local, activeBaseline, {
        adoptAll: true,
      }),
    );
    mergedInactive = [];
  } else if (licensedPublic && inactiveReadTags.some((t) => t[0] === 'i')) {
    // THE STATED MODE IS THE CONSENT, and it is the only thing that lifts the
    // private → public asymmetry. Two ways to have it: the event already says
    // public — which only a writer that could read both halves may have
    // written — or the user is choosing it right now, in an app that can see
    // everything it is about to disclose. Either way the whole list moves and
    // each entry is emitted once.
    // No local state on the moving side: `moving` is what the OTHER half
    // holds, not our own favorites a second time. The outer merge appends
    // those once, where they belong.
    const moving = mergeHalf(inactiveReadTags, [], inactiveBaseline, {
      adoptAll: true,
    });
    mergedActive = dedupeEntries(
      mergeHalf([...activeReadTags, ...moving], local, activeBaseline, {
        adoptAll: true,
      }),
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
      // Skip anything the active half ALREADY holds. An entry can sit in both
      // halves at once — see vector 15 — and concatenating the claimed-back
      // ones unconditionally emits that identifier twice, which opens a second
      // group for the same feed and double-counts it for every reader. Only
      // reachable from the both-halves state, which is why no vector below 15
      // caught it.
      const already = new Set(
        mergedActive.filter((t) => t[0] === 'i').map((t) => t[1]),
      );
      const claimedBack = inactiveReadTags.filter(
        (t) => t[0] === 'i' && returning.has(t[1]) && !already.has(t[1]),
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
    mayState ? effective : stated,
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
  // Compare against the read FRAMED AS IT WAS — its own `visibility`, not
  // ours. Otherwise a list that predates the tag differs from itself forever
  // and every load republishes. A list that genuinely lacks the tag does
  // differ, once, and that publish is the migration.
  const unchanged =
    sameTags(publicTags, frame(readTags, carriedKinds, stated)) &&
    JSON.stringify(privateTags ?? readPrivate) === JSON.stringify(readPrivate);

  // Writing the private half: a plaintext past the NIP-44 v2 cliff reads back
  // as EMPTY on an older signer, not as an error. Refusing costs one favorite;
  // publishing costs the whole list on that device. Vector 24.
  if (
    !unchanged &&
    privateTags !== null &&
    privateTags.some((t) => t[0] === 'i') &&
    plaintextBytes(encodePlaintext(privateTags)) > PRIVATE_PLAINTEXT_MAX
  ) {
    return { publish: null, baselineIfLanded: base };
  }

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
