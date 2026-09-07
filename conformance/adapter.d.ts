/**
 * The contract `vectors.test.mjs` drives.
 *
 * Two pure functions do the work, and a handful of small ones beside them.
 * Everything the 28 vectors need is expressible through them, and keeping them
 * pure is what lets the suite run with no relay, no signer, no clock and no
 * network — so a failure is always your merge and never your test environment.
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

/** One feed on this device, and the items favorited under it. */
export interface LocalGroup {
  /**
   * A `podcast:guid:…` feed, or a `podcast:publisher:guid:…` artist.
   *
   * An artist nests nothing: it is emitted bare, takes no marker, and its
   * `items` are not this format's to place. Vector 28.
   */
  id: string;
  /** The medium hint, or null when the feed never declared one. */
  medium: string | null;
  /** `podcast:item:guid:…` identifiers belonging to this feed. */
  items: string[];
  /**
   * Has the user favorited the FEED, as opposed to the group being here only
   * so the items under it can name a parent?
   *
   * THREE values, not two. `null` — the default, and what an app with no
   * notion of feed-favorite markers passes — means this device does not know,
   * which is the honest answer for a group adopted off the wire with nothing
   * on it. Collapse it into either boolean and the next publish states
   * something the user never said: `true` manufactures a favorite, `false`
   * deletes one no other app will restate. Vectors 25, 26, 27.
   */
  favorited?: boolean | null;
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

/**
 * A feed favorite is a CLAIM OF ITS OWN, beside the entry's.
 *
 * The reference writes it into the same per-half array as `fav:<identifier>`;
 * how you store it is yours, as long as it is a separate answer. Your device
 * may be the reason a group is on the list without being the reason it is
 * marked `fav`, and the other way round — so a baseline holding only
 * identifiers can express neither removal. Vector 26.
 */
export type FavoriteClaim = `fav:${string}`;

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
  /**
   * What this device holds once the publish lands — or absent when a cycle
   * leaves local state alone.
   *
   * Two models exist and both conform. A writer whose local state is a
   * DATABASE the merge never writes (StableKraft) is unchanged by a cycle:
   * foreign entries are carried and never held. A writer whose local state
   * is a CACHE OF THE MERGE (Boost Me Bitch) paints the active half whole —
   * an entry adopted that way is held from then on, claimed in the baseline,
   * and removed by this device only if the user unfavorites it here. The
   * multi-cycle vectors feed this back in as the next cycle's `local`, so
   * each model is tested against what it actually does; the disclosure rules
   * hold either way, because neither model adopts out of the INACTIVE half
   * beyond what its baseline claims.
   */
  holds?: LocalGroup[];
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
  /** Position 3 as read: 'fav', 'placement', or null for anything else. */
  marker?: 'fav' | 'placement' | null;
  /**
   * Resolved for a feed entry: is this FEED favorited?
   *
   * Resolved per feed rather than per group — one feed may open two groups and
   * they need not agree — with a statement outranking silence and `fav`
   * outranking `placement`. `null` where no copy says and the group has items:
   * unknowable, and answering `true` there invents favorites the user never
   * made. Vector 25.
   */
  favorited?: boolean | null;
  /** Position in the tag array. Order is semantic; keep it. */
  index: number;
}

export interface ParsedList {
  entries: ParsedEntry[];
  groups: Array<{
    id: string;
    medium: string | null;
    items: string[];
    marker?: 'fav' | 'placement' | null;
    /** The per-FEED answer, so every group of one feed carries the same one. */
    favorited?: boolean | null;
  }>;
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
   *
   * `null` ALSO for bytes you can open that are not a tag array — see
   * `decodePlaintext`. Vector 23.
   */
  decodePrivate(content: string): string[][] | null;

  /** The inverse: `seal(encodePlaintext(tags))`. Real writers use NIP-44. */
  encodePrivate(tags: string[][]): string;

  /**
   * The bytes handed to the signer, BEFORE encryption: the tag array
   * stringified, with every `?` written as its JSON escape `\u003f`.
   *
   * A NIP-55 signer URL-decodes the whole `nostrsigner:` URI and only then
   * splits it on `?`, and item guids are routinely permalink URLs. Vector 22.
   *
   * `plan` refuses to publish a private half whose plaintext exceeds 60,000
   * UTF-8 bytes — NIP-44 v2's 65,535-byte cliff, less what NIP-44 adds on the
   * way to `content`. Past it the list reads back as EMPTY on an older
   * signer, not as an error. Vector 24.
   */
  encodePlaintext(tags: string[][]): string;

  /**
   * The plaintext back into a tag array, or NULL when it is not one.
   *
   * Valid JSON that is not an array of string arrays is `null`, never `[]`.
   * "Readable and empty" is what the next republish overwrites `content`
   * from. Vector 23.
   */
  decodePlaintext(text: string): string[][] | null;

  /**
   * Encrypt an arbitrary plaintext the way `encodePrivate` does, so a vector
   * can put bytes in `content` that decrypt but are not a list. Vector 23.
   * The reference's codec is a reversible stand-in; a real shim may wrap
   * NIP-44 with a fixed key.
   */
  seal(text: string): string;
}
