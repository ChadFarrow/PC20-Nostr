/**
 * The contract `vectors.test.mjs` drives.
 *
 * Two pure functions. Everything the 17 vectors need is expressible through
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
  /**
   * Which half this writer feeds — the user's privacy setting in your app.
   *
   * NULL means they have no stored setting yet, so this writer follows the
   * list: the `visibility` tag if it has one, otherwise whichever half holds
   * entries. When the list cannot say either — no tag, and both halves empty
   * or both populated — `plan` must return `publish: null` and your app must
   * ask. Publishing on a guess is how a favorite someone hid in another app
   * becomes a relay-indexed `i` tag. Vector 16.
   */
  mode: 'public' | 'private' | null;
  /**
   * Can this writer decrypt the private half?
   *
   * False for a signer with no NIP-44 — a NIP-55 app-to-app signer, a
   * read-only login — and it is a normal state for a real user, not an error.
   * A writer that cannot see a half may not move what is in it and may not
   * restate the mode; it carries `content` and says so on screen. Vector 17.
   *
   * Distinct from a payload your codec cannot parse, which `decodePrivate`
   * already answers with null. Both arrive at the same place.
   */
  canReadPrivate?: boolean;
  /**
   * Is the user CHOOSING this mode right now, as opposed to it being your
   * app's standing setting?
   *
   * Only a choice may write the `visibility` tag for the first time or change
   * one that is already there. A standing setting that merely disagrees with
   * the list is two apps holding different answers about one shared event, and
   * letting whichever loaded last win is how a list flips halves on a page
   * load with nothing on screen. Ask instead.
   *
   * It is also what licenses the private → public whole-list move, together
   * with `canReadPrivate`: the user asked, in an app that could see everything
   * it was about to disclose.
   */
  userChose?: boolean;
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
