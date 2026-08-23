/**
 * Value split arithmetic for a Podcasting 2.0 <podcast:value> block.
 *
 * Given the recipients in a feed's value block and the size of a boost, work
 * out how many sats each one gets.
 *
 * The shares arrive in someone else's RSS feed, which is to say you do not
 * control them, which is why most of this file is refusal rather than
 * arithmetic.
 */

export interface ValueRecipient {
  /** Node pubkey for keysend, or a Lightning address for an LNURL payment. */
  address: string;
  /** 'node' for keysend, 'lnaddress' for a Lightning address. */
  type?: string;
  /** Relative weight. Shares are relative to their sum, not to 100. */
  split: number;
  /** Optional display name, carried into the boostagram. */
  name?: string;
  /** Custom keysend TLV key, where a recipient needs one (wallet providers do). */
  customKey?: string;
  customValue?: string;
  /** A recipient marked fee takes its share off the top, before the rest split. */
  fee?: boolean;
}

export interface SplitAllocation {
  recipient: ValueRecipient;
  /** Whole sats to send this recipient. Never zero - see splitBoost. */
  sats: number;
}

/**
 * Divide `totalSats` across `recipients` by their shares.
 *
 * Throws rather than mis-paying. The failures worth naming:
 *
 * - A total share of zero makes `floor(amount * share / 0)` produce NaN for
 *   every recipient, and a NaN amount reaches a wallet as garbage.
 * - A negative share makes a naive `amount - allocated` remainder *over-pay*
 *   the last recipient: with shares [-1, 2], destination B receives twice the
 *   boost.
 *
 * Both values come out of a feed, so neither is hypothetical.
 */
export function splitBoost(
  totalSats: number,
  recipients: ValueRecipient[]
): SplitAllocation[] {
  if (!Number.isInteger(totalSats) || totalSats <= 0) {
    throw new Error(`Boost amount must be a positive whole number of sats, got ${totalSats}`);
  }
  if (recipients.length === 0) {
    throw new Error('No recipients in the value block');
  }
  for (const r of recipients) {
    if (!Number.isFinite(r.split) || r.split < 0) {
      throw new Error(
        `Recipient ${r.address} has share ${r.split}; a negative or non-finite share ` +
          'makes the remainder over-pay somebody'
      );
    }
    if (!r.address) {
      throw new Error('Recipient has no address');
    }
  }

  const total = recipients.reduce((sum, r) => sum + r.split, 0);
  if (total <= 0) {
    throw new Error('Recipient shares total zero; every allocation would be NaN');
  }

  const allocations: SplitAllocation[] = [];
  let allocated = 0;

  // Every recipient but the last gets floor(amount * share / total). Integer
  // division otherwise loses sats on most three-way splits, so the last
  // recipient takes the remainder and the parts add back up to the boost.
  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    const sats =
      i === recipients.length - 1
        ? totalSats - allocated
        : Math.floor((totalSats * recipient.split) / total);
    allocated += sats;
    allocations.push({ recipient, sats });
  }

  // A zero-sat keysend is not a payment; it is a failed one that looks sent.
  // Dropping them here is better than each caller discovering it separately.
  return allocations.filter((a) => a.sats > 0);
}

/**
 * Check that a set of allocations still adds up to the boost.
 *
 * Cheap, and it is the assertion that catches a future edit to the loop above.
 */
export function totalAllocated(allocations: SplitAllocation[]): number {
  return allocations.reduce((sum, a) => sum + a.sats, 0);
}
