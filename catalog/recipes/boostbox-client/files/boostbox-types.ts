/**
 * Shapes for the BoostBox API.
 *
 * BoostBox stores Podcasting 2.0 payment metadata and hands back a short URL
 * for it. That URL goes in the payment description, so a boost survives a hop
 * through a wallet that drops custom TLV records - which is most of them.
 *
 * Kept in its own file so the browser client and the server route share one
 * definition without the browser half importing anything that touches a key.
 */

export type BoostAction = 'boost' | 'stream';

/** What POST /boost accepts. */
export interface BoostboxSubmission {
  action: BoostAction;
  /** This recipient's share of the value block. Minimum 0. */
  split: number;
  /** Millisats to this recipient. Minimum 1. */
  value_msat: number;
  /** Millisats for the whole boost across its splits. Minimum 1. */
  value_msat_total: number;
  /** ISO-8601. */
  timestamp: string;

  group?: string;
  message?: string;
  app_name?: string;
  app_version?: string;
  sender_id?: string;
  sender_name?: string;
  recipient_name?: string;
  recipient_address?: string;
  value_usd?: number;
  position?: number;
  feed_guid?: string;
  feed_title?: string;
  item_guid?: string;
  item_title?: string;
  publisher_guid?: string;
  publisher_title?: string;
  remote_feed_guid?: string;
  remote_item_guid?: string;
  remote_publisher_guid?: string;
}

/** What POST /boost returns on 201. */
export interface BoostboxReceipt {
  id: string;
  /** Public page for this boost. */
  url: string;
  /**
   * Ready-made payment description, of the form
   * `rss::payment::boost <url> <message>`. Put this in the invoice memo or the
   * keysend description so the metadata is reachable from the payment itself.
   */
  desc: string;
}

/** Every optional field BoostBox accepts, so the route can reject the rest. */
export const BOOSTBOX_OPTIONAL_FIELDS = [
  'group', 'message', 'app_name', 'app_version', 'sender_id', 'sender_name',
  'recipient_name', 'recipient_address', 'value_usd', 'position', 'feed_guid',
  'feed_title', 'item_guid', 'item_title', 'publisher_guid', 'publisher_title',
  'remote_feed_guid', 'remote_item_guid', 'remote_publisher_guid',
] as const;

export const BOOSTBOX_REQUIRED_FIELDS = [
  'action', 'split', 'value_msat', 'value_msat_total', 'timestamp',
] as const;
