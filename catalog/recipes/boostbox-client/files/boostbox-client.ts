import type { BoostboxReceipt, BoostboxSubmission } from '@/lib/boostbox-types';

/**
 * Browser client for BoostBox.
 *
 * Reads no environment variable and holds no key: it calls your own route,
 * which holds the key. That is the only difference between this and the
 * version that serves an API key to every visitor, and it is the reason this
 * file exists.
 */

export interface SubmitOptions {
  /** Where you mounted the route. */
  endpoint?: string;
  signal?: AbortSignal;
}

export class BoostboxError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'BoostboxError';
  }
}

/**
 * Store one boost's metadata and get back a receipt.
 *
 * Do this *before* you pay: `receipt.desc` is the payment description you want
 * to send, so the metadata is reachable from the payment even when the wallet
 * in between drops custom records.
 */
export async function submitBoost(
  submission: BoostboxSubmission,
  options: SubmitOptions = {}
): Promise<BoostboxReceipt> {
  const response = await fetch(options.endpoint ?? '/api/boostbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(submission),
    signal: options.signal,
  });

  if (!response.ok) {
    let message = `BoostBox submission failed (${response.status})`;
    try {
      const body = await response.json();
      if (body && typeof body.error === 'string') message = body.error;
    } catch {
      // Keep the status-based message.
    }
    throw new BoostboxError(message, response.status);
  }

  return (await response.json()) as BoostboxReceipt;
}

/**
 * Build the submission for one recipient of a split boost.
 *
 * `valueMsat` is this recipient's slice, `valueMsatTotal` the whole boost -
 * the same distinction the boostagram records make, and the same way to get it
 * wrong.
 */
export function buildSubmission(
  fields: Omit<BoostboxSubmission, 'timestamp'> & { timestamp?: string }
): BoostboxSubmission {
  return { ...fields, timestamp: fields.timestamp ?? new Date().toISOString() };
}
