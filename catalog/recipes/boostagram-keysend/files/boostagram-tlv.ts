/**
 * bLIP-10 boostagram TLV records.
 *
 * A keysend payment can carry custom TLV records, and Podcasting 2.0 uses two
 * of them:
 *
 *   7629169  the boostagram itself, as UTF-8 JSON
 *   7629175  the Podcast Index feed GUID, as UTF-8 text
 *
 * That is what turns a bare payment into a boost with a podcast, an episode, a
 * timestamp and a message attached to it.
 */

import type { SplitAllocation } from './boost-splits';

/** Custom record number carrying the boostagram JSON. */
export const TLV_BOOSTAGRAM = 7629169;
/** Custom record number carrying the Podcast Index feed GUID. */
export const TLV_FEED_GUID = 7629175;

export type BoostAction = 'boost' | 'stream' | 'lsat' | 'auto';

/**
 * What the sending app knows about itself and about what is playing.
 *
 * `appName` and `feedId` are required, and that is the whole point of this
 * file. The one production implementation of this feature defaults `app_name`
 * to its own name and picks `feedId` by string-comparing one album's URL, with
 * a hardcoded fallback for every other feed in existence. Copied into another
 * app it silently attributes every boost to somebody else's show. A required
 * parameter cannot be forgotten; a default can.
 */
export interface BoostContext {
  /** Your app's name. No default - see above. */
  appName: string;
  appVersion?: string;
  /** Podcast Index feed ID for what is playing. No default - see above. */
  feedId: string | number;
  /** Podcast Index item ID for the episode, where you have one. */
  itemId?: string | number;
  podcast?: string;
  episode?: string;
  /** The <podcast:guid> of the feed. Goes in record 7629175 as well. */
  feedGuid?: string;
  episodeGuid?: string;
  /** Feed URL. */
  url?: string;
  /** Playback position in whole seconds. */
  ts?: number;
  senderName?: string;
  message?: string;
  action?: BoostAction;
}

/** The bLIP-10 payload, in its wire spelling. */
export interface Boostagram {
  action: BoostAction;
  app_name: string;
  app_version?: string;
  feedID: string | number;
  itemID?: string | number;
  podcast?: string;
  episode?: string;
  guid?: string;
  episode_guid?: string;
  url?: string;
  ts?: number;
  name?: string;
  sender_name?: string;
  message?: string;
  value_msat: number;
  value_msat_total: number;
  /** Unique to this one payment. */
  uuid: string;
  /** Shared by every payment in one boost, so a receiver can reassemble it. */
  boost_uuid: string;
}

export interface KeysendPayment {
  /** Node pubkey to pay. */
  destination: string;
  /** Whole sats for this recipient. */
  sats: number;
  /** TLV records, keyed by record number, values UTF-8 text. */
  tlvRecords: Record<number, string>;
  /** Present when the recipient declared a custom key in the value block. */
  customKey?: string;
  customValue?: string;
}

function newId(): string {
  // crypto.randomUUID is in every browser released since 2021 and in Node 19+.
  // Falling back to Math.random would produce boost_uuids that collide, and a
  // collision merges two people's boosts into one on the receiving end.
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('crypto.randomUUID is unavailable; cannot mint a boost id');
  }
  return crypto.randomUUID();
}

/**
 * Build one boostagram payload.
 *
 * `valueMsat` is what this recipient receives; `valueMsatTotal` is the whole
 * boost. A receiver showing "1000 sats" when it was handed one 300-sat slice
 * of a three-way split is reading the wrong field, so both are sent.
 */
export function buildBoostagram(
  context: BoostContext,
  valueMsat: number,
  valueMsatTotal: number,
  ids: { uuid: string; boostUuid: string }
): Boostagram {
  if (!context.appName) {
    throw new Error('appName is required; a boostagram with somebody else\'s app name is worse than none');
  }
  if (context.feedId === undefined || context.feedId === null || context.feedId === '') {
    throw new Error('feedId is required; guessing it attributes the boost to the wrong show');
  }

  const payload: Boostagram = {
    action: context.action ?? 'boost',
    app_name: context.appName,
    feedID: context.feedId,
    value_msat: valueMsat,
    value_msat_total: valueMsatTotal,
    uuid: ids.uuid,
    boost_uuid: ids.boostUuid,
  };

  if (context.appVersion) payload.app_version = context.appVersion;
  if (context.itemId !== undefined) payload.itemID = context.itemId;
  if (context.podcast) payload.podcast = context.podcast;
  if (context.episode) payload.episode = context.episode;
  if (context.feedGuid) payload.guid = context.feedGuid;
  if (context.episodeGuid) payload.episode_guid = context.episodeGuid;
  if (context.url) payload.url = context.url;
  if (context.ts !== undefined) payload.ts = Math.floor(context.ts);
  if (context.senderName) {
    payload.sender_name = context.senderName;
    payload.name = context.senderName;
  }
  if (context.message) payload.message = context.message;

  return payload;
}

/**
 * Turn split allocations into the keysend payments that carry them.
 *
 * One `boost_uuid` across every payment, a fresh `uuid` per payment. That pair
 * is what lets a receiver reassemble the parts of one boost into a single
 * boostagram instead of showing several unrelated payments.
 *
 * Only recipients payable by keysend come back. A Lightning-address recipient
 * in the same value block needs the LNURL path instead, and is returned
 * separately so it cannot be silently dropped.
 */
export function buildKeysendPayments(
  allocations: SplitAllocation[],
  context: BoostContext,
  boostUuid: string = newId()
): { payments: KeysendPayment[]; lnAddressRecipients: SplitAllocation[] } {
  const totalMsat = allocations.reduce((sum, a) => sum + a.sats, 0) * 1000;

  const payments: KeysendPayment[] = [];
  const lnAddressRecipients: SplitAllocation[] = [];

  for (const allocation of allocations) {
    const { recipient, sats } = allocation;

    // A node pubkey is 33 compressed bytes in hex. Anything else is not a
    // keysend destination, whatever the feed called it.
    const isNode =
      (recipient.type ?? 'node') === 'node' && /^[0-9a-f]{66}$/i.test(recipient.address);
    if (!isNode) {
      lnAddressRecipients.push(allocation);
      continue;
    }

    const boostagram = buildBoostagram(context, sats * 1000, totalMsat, {
      uuid: newId(),
      boostUuid,
    });

    const tlvRecords: Record<number, string> = {
      [TLV_BOOSTAGRAM]: JSON.stringify(boostagram),
    };
    if (context.feedGuid) tlvRecords[TLV_FEED_GUID] = context.feedGuid;

    payments.push({
      destination: recipient.address,
      sats,
      tlvRecords,
      customKey: recipient.customKey,
      customValue: recipient.customValue,
    });
  }

  return { payments, lnAddressRecipients };
}
