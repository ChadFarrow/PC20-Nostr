/**
 * The contract `vectors.test.mjs` drives.
 *
 * Two pure functions. Everything the 14 vectors need is expressible through
 * them, and keeping them pure is what lets the suite run with no relay, no
 * signer, no clock and no network — so a failure is always your merge and
 * never your test environment.
 *
 * These are types for reading. The suite is plain ESM and does not typecheck
 * them; if your app is TypeScript, implement the interface and export the two
 * functions from a `.mjs` shim.
 */

/** A kind:10333 event, or the parts of one this format cares about. */
export interface FavoritesEvent {
  kind?: 10333;
  tags: string[][];
  /**
   * The private half, or ''. NEVER a literal on a republish — see rule 4.
   * Vector 12 is the one that catches a default parameter here.
   */
  content: string;
}

/** One favorited feed and the items favorited under it. */
export interface LocalGroup {
  /** A `podcast:guid:…` or `podcast:publisher:guid:…` identifier. */
  id: string;
  /** The medium hint, or null when the feed never declared one. */
  medium: string | null;
  /** `podcast:item:guid:…` identifiers belonging to this feed. */
  items: string[];
}

/**
 * What this device last agreed with the relay on, PER HALF.
 *
 * Two sets, not one. Moving an entry public -> private is a removal on one
 * side and an addition on the other; against a single shared baseline those
 * cancel and the entry is deleted outright.
 *
 * Stored privately on the device. Not on the wire, never seen by another app,
 * and no two writers need theirs to agree.
 */
export interface Baseline {
  public: string[];
  private: string[];
}

export interface PlanInput {
  /**
   * The event as read, or NULL when the read is not trustworthy.
   *
   * `null` and `{tags: [], content: ''}` are different questions and must
   * produce different answers: "the relay never answered" against "the relay
   * has nothing". Vector 2. Believing the second when you mean the first
   * republishes a whole library as empty.
   */
  read: FavoritesEvent | null;
  /** This device's favorites. */
  local: LocalGroup[];
  /** This device's claims, per half. */
  baseline: Baseline;
  /** Which half this writer feeds. The user's privacy setting in your app. */
  mode: 'public' | 'private';
}

export interface PlanResult {
  /**
   * The event to publish, or NULL to publish nothing.
   *
   * `null` is how rule 5 is expressed: the merged bytes match the bytes read,
   * so there is nothing to say. A writer that always publishes has two apps
   * rewriting the event against each other forever.
   */
  publish: FavoritesEvent | null;
  /**
   * The baseline to record IF AND ONLY IF that publish is confirmed by a
   * relay.
   *
   * Deliberately a returned value rather than a side effect. A baseline
   * written for an event that never landed says "I am already asserting
   * this", which is exactly what stops the entry from ever being retried —
   * the publish is lost permanently while the UI reports success. Vector 10
   * asserts that planning records nothing on its own.
   */
  baselineIfLanded: Baseline;
}

/** The parsed shape of one entry. Vectors 5, 6 and 7 read this. */
export interface ParsedEntry {
  id: string;
  /** From the known-kinds table, never by splitting the string. */
  kind: string;
  /** The running `medium` value, or null when none preceded the entry. */
  medium: string | null;
  /** The feed group this item belongs to, or null for a feed entry. */
  parent: string | null;
  /** Position in the tag array. Order is semantic; keep it. */
  index: number;
}

export interface ParsedList {
  entries: ParsedEntry[];
  groups: Array<{ id: string; medium: string | null; items: string[] }>;
  /** `k` values as read. Never used to derive an entry's kind. */
  kinds: string[];
  /** Tags and identifiers no writer here understands. Carried, not parsed. */
  foreign: Array<{ index: number; tag: string[] }>;
}

export interface FavoritesAdapter {
  /** Tag array in, structure out. Vectors 5, 6, 7. */
  parseTags(tags: string[][]): ParsedList;

  /** The kind of an identifier, or null. Vector 6. */
  kindOf(identifier: string): string | null;

  /** One publish cycle, decided but not sent. */
  plan(input: PlanInput): PlanResult;

  /**
   * The private half decoded, or NULL when this writer cannot read the bytes.
   *
   * `null` is not an error. It is the ordinary case rule 4 is about: another
   * app's half, which you carry verbatim and never parse. Vector 12.
   */
  decodePrivate(content: string): string[][] | null;

  /** The inverse. Real writers use NIP-44 encrypt-to-self. */
  encodePrivate(tags: string[][]): string;
}
