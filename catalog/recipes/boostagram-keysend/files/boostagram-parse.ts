/**
 * Read an inbound boostagram.
 *
 * This half exists nowhere in the codebases this catalog was built from: every
 * implementation there is an encoder. If you want to show someone what they
 * were sent, rather than only what you sent, this is the missing side.
 *
 * Everything here arrives from a stranger who paid you, so nothing is trusted:
 * fields are checked before use and a malformed record returns null rather
 * than throwing into whatever loop is draining your wallet's history.
 */

import { TLV_BOOSTAGRAM, TLV_FEED_GUID, type Boostagram } from './boostagram-tlv';

/** How a wallet hands you custom records. Values are UTF-8 text or base64. */
export type InboundTlv = Record<string | number, string>;

export interface ParsedBoost {
  boostagram: Boostagram;
  /** Record 7629175, where the sender included it. */
  feedGuid?: string;
  /** Sats this payment carried, taken from value_msat. */
  sats: number;
  /** Sats for the whole boost across its splits, from value_msat_total. */
  totalSats?: number;
}

function decodeRecord(raw: string): string | null {
  if (!raw) return null;
  // A record that already parses as JSON is UTF-8 text. Otherwise try base64,
  // which is how several wallets hand custom records over.
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return trimmed;
  try {
    const decoded =
      typeof atob === 'function'
        ? atob(trimmed)
        : Buffer.from(trimmed, 'base64').toString('utf8');
    return decoded.trim().startsWith('{') ? decoded : null;
  } catch {
    return null;
  }
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * `parseInt` on a non-numeric value yields NaN, and a NaN poisons any total
 * computed by summing boosts. Every number read out of a stranger's record
 * goes through here.
 */
function readNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse the custom records from one inbound keysend.
 *
 * Returns null when there is no boostagram in them - a plain keysend with no
 * record 7629169 is a normal thing to receive, not an error.
 */
export function parseBoostagram(records: InboundTlv): ParsedBoost | null {
  const raw = records[TLV_BOOSTAGRAM] ?? records[String(TLV_BOOSTAGRAM)];
  if (typeof raw !== 'string') return null;

  const json = decodeRecord(raw);
  if (json === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const source = parsed as Record<string, unknown>;

  const appName = readString(source, 'app_name');
  const feedId = source['feedID'];
  if (!appName || feedId === undefined || feedId === null || feedId === '') {
    // Both are required by the format. Without them the record cannot be
    // attributed to an app or a show, which is all a boostagram is for.
    return null;
  }

  const valueMsat = readNumber(source, 'value_msat');
  const valueMsatTotal = readNumber(source, 'value_msat_total');

  const boostagram: Boostagram = {
    action: (readString(source, 'action') as Boostagram['action']) ?? 'boost',
    app_name: appName,
    feedID: typeof feedId === 'number' || typeof feedId === 'string' ? feedId : String(feedId),
    value_msat: valueMsat ?? 0,
    value_msat_total: valueMsatTotal ?? valueMsat ?? 0,
    uuid: readString(source, 'uuid') ?? '',
    boost_uuid: readString(source, 'boost_uuid') ?? '',
  };

  const appVersion = readString(source, 'app_version');
  if (appVersion) boostagram.app_version = appVersion;
  const itemId = source['itemID'];
  if (typeof itemId === 'string' || typeof itemId === 'number') boostagram.itemID = itemId;
  for (const key of ['podcast', 'episode', 'guid', 'episode_guid', 'url', 'name', 'sender_name', 'message'] as const) {
    const value = readString(source, key);
    if (value) boostagram[key] = value;
  }
  const ts = readNumber(source, 'ts');
  if (ts !== undefined) boostagram.ts = ts;

  const feedGuidRecord = records[TLV_FEED_GUID] ?? records[String(TLV_FEED_GUID)];

  return {
    boostagram,
    feedGuid: typeof feedGuidRecord === 'string' && feedGuidRecord ? feedGuidRecord : boostagram.guid,
    sats: Math.floor((valueMsat ?? 0) / 1000),
    totalSats: valueMsatTotal === undefined ? undefined : Math.floor(valueMsatTotal / 1000),
  };
}

/**
 * Group parsed boosts back into whole boosts.
 *
 * A three-way split arrives as three payments. They share a `boost_uuid`, so
 * this is what turns them back into one entry in a listener's feed instead of
 * three unrelated ones. Records with no `boost_uuid` are each their own group,
 * keyed by `uuid`, so nothing is silently merged.
 */
export function groupByBoost(boosts: ParsedBoost[]): Map<string, ParsedBoost[]> {
  const groups = new Map<string, ParsedBoost[]>();
  for (let i = 0; i < boosts.length; i++) {
    const boost = boosts[i];
    const key = boost.boostagram.boost_uuid || boost.boostagram.uuid || `ungrouped:${i}`;
    const existing = groups.get(key);
    if (existing) existing.push(boost);
    else groups.set(key, [boost]);
  }
  return groups;
}
