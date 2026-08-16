import { 
  SimplePool, 
  finalizeEvent, 
  type Event,
  type EventTemplate,
  type Filter
} from 'nostr-tools';

/**
 * NIP-57: Lightning Zaps
 * Kind 9735 - Zap Receipt
 * 
 * Zap receipts are created by Lightning nodes/services when a zap payment is completed.
 * They provide proof of payment and link the payment to the original zap request.
 */

export interface ZapReceipt {
  id: string;
  pubkey: string; // Lightning node/service that created the receipt
  created_at: number;
  amount: number; // Amount in millisats
  bolt11: string; // The paid invoice
  preimage?: string; // Payment preimage (proof of payment)
  zapRequest?: Event; // The original kind 9734 zap request
  recipient: string; // Recipient's pubkey
  sender?: string; // Sender's pubkey (if not anonymous)
  comment?: string; // Comment from the zap request
  eventId?: string; // If zapping a specific event
  addressTag?: string; // If zapping a parameterized replaceable event
}

export interface ZapRequestTag {
  type: string;
  value: string | number;
}

export class ZapReceiptService {
  private pool: SimplePool;
  private relays: string[];

  constructor(relays: string[] = []) {
    // Temporarily disable pool to prevent subscription errors
    this.pool = new SimplePool();
    this.relays = relays.length > 0 ? relays : [
      'wss://relay.damus.io',
      'wss://relay.nostr.band',
      'wss://nos.lol',
      'wss://relay.snort.social'
    ];
  }

  /**
   * Parse a kind 9735 zap receipt event
   */
  parseZapReceipt(event: Event): ZapReceipt | null {
    if (event.kind !== 9735) {
      console.error('Invalid event kind for zap receipt:', event.kind);
      return null;
    }

    try {
      // Extract bolt11 invoice from tags
      const bolt11Tag = event.tags.find(tag => tag[0] === 'bolt11');
      if (!bolt11Tag || !bolt11Tag[1]) {
        console.error('Zap receipt missing bolt11 tag');
        return null;
      }

      // Extract preimage from tags
      const preimageTag = event.tags.find(tag => tag[0] === 'preimage');
      
      // Extract description tag which contains the zap request
      const descriptionTag = event.tags.find(tag => tag[0] === 'description');
      let zapRequest: Event | undefined;
      let amount = 0;
      let comment: string | undefined;
      let sender: string | undefined;

      if (descriptionTag && descriptionTag[1]) {
        try {
          zapRequest = JSON.parse(descriptionTag[1]) as Event;
          
          // Extract amount from zap request
          const amountTag = zapRequest.tags.find(tag => tag[0] === 'amount');
          if (amountTag && amountTag[1]) {
            amount = parseInt(amountTag[1]);
          }

          // Extract comment from zap request content
          if (zapRequest.content) {
            comment = zapRequest.content;
          }

          // Sender is the pubkey of the zap request
          sender = zapRequest.pubkey;
        } catch (e) {
          console.error('Failed to parse zap request from description:', e);
        }
      }

      // Extract recipient (p tag)
      const recipientTag = event.tags.find(tag => tag[0] === 'p');
      if (!recipientTag || !recipientTag[1]) {
        console.error('Zap receipt missing recipient (p tag)');
        return null;
      }

      // Extract event being zapped (e tag)
      const eventTag = event.tags.find(tag => tag[0] === 'e');
      
      // Extract address tag for parameterized replaceable events (a tag)
      const addressTag = event.tags.find(tag => tag[0] === 'a');

      return {
        id: event.id,
        pubkey: event.pubkey,
        created_at: event.created_at,
        amount,
        bolt11: bolt11Tag[1],
        preimage: preimageTag?.[1],
        zapRequest,
        recipient: recipientTag[1],
        sender,
        comment,
        eventId: eventTag?.[1],
        addressTag: addressTag?.[1]
      };
    } catch (error) {
      console.error('Error parsing zap receipt:', error);
      return null;
    }
  }

  /**
   * Fetch zap receipts for a specific pubkey
   */
  async fetchZapReceipts(
    pubkey: string,
    options: {
      limit?: number;
      since?: number;
      until?: number;
      includeReceived?: boolean;
      includeSent?: boolean;
    } = {}
  ): Promise<ZapReceipt[]> {
    const {
      limit = 100,
      since,
      until,
      includeReceived = true,
      includeSent = false
    } = options;

    const filters: Filter[] = [];

    // Filter for zaps received by this pubkey
    if (includeReceived) {
      const receivedFilter: Filter = {
        kinds: [9735],
        '#p': [pubkey],
        limit
      };
      if (since) receivedFilter.since = since;
      if (until) receivedFilter.until = until;
      filters.push(receivedFilter);
    }

    // Filter for zaps sent by this pubkey (need to look in zap request)
    if (includeSent) {
      // This is more complex as we need to find receipts where the zap request
      // was created by this pubkey. We'll need to fetch and filter.
      const sentFilter: Filter = {
        kinds: [9735],
        limit: limit * 2 // Fetch more since we'll filter
      };
      if (since) sentFilter.since = since;
      if (until) sentFilter.until = until;
      filters.push(sentFilter);
    }

    // Query each filter separately and combine results
    const allEvents: Event[] = [];
    for (const filter of filters) {
      const events = await this.pool.querySync(this.relays, filter);
      allEvents.push(...events);
    }
    const events = allEvents;
    
    const receipts: ZapReceipt[] = [];
    for (const event of events) {
      const receipt = this.parseZapReceipt(event);
      if (receipt) {
        // If looking for sent zaps, filter by sender
        if (includeSent && !includeReceived) {
          if (receipt.sender === pubkey) {
            receipts.push(receipt);
          }
        } else if (!includeSent && includeReceived) {
          if (receipt.recipient === pubkey) {
            receipts.push(receipt);
          }
        } else {
          // Include both sent and received
          if (receipt.sender === pubkey || receipt.recipient === pubkey) {
            receipts.push(receipt);
          }
        }
      }
    }

    // Sort by created_at descending (newest first)
    receipts.sort((a, b) => b.created_at - a.created_at);

    // Apply limit after filtering
    return receipts.slice(0, limit);
  }

  /**
   * Fetch zap receipts for a specific event
   */
  async fetchEventZaps(
    eventId: string,
    options: {
      limit?: number;
      since?: number;
      until?: number;
    } = {}
  ): Promise<ZapReceipt[]> {
    const { limit = 100, since, until } = options;

    const filter: Filter = {
      kinds: [9735],
      '#e': [eventId],
      limit
    };
    if (since) filter.since = since;
    if (until) filter.until = until;

    const events = await this.pool.querySync(this.relays, filter);
    
    const receipts: ZapReceipt[] = [];
    for (const event of events) {
      const receipt = this.parseZapReceipt(event);
      if (receipt) {
        receipts.push(receipt);
      }
    }

    // Sort by created_at descending (newest first)
    receipts.sort((a, b) => b.created_at - a.created_at);

    return receipts;
  }

  /**
   * Subscribe to live zap receipts
   * TEMPORARILY DISABLED to prevent filter errors
   */
  subscribeToZaps(
    filters: {
      pubkeys?: string[];
      eventIds?: string[];
      since?: number;
    },
    callbacks: {
      onZap: (receipt: ZapReceipt) => void;
      onError?: (error: Error) => void;
    }
  ) {
    // Return a dummy subscription that doesn't do anything
    return {
      close: () => {}
    };
  }

  /**
   * Calculate total zaps amount for a pubkey or event
   */
  async calculateTotalZaps(
    target: { pubkey?: string; eventId?: string },
    options: {
      since?: number;
      until?: number;
    } = {}
  ): Promise<{ count: number; totalAmount: number; receipts: ZapReceipt[] }> {
    let receipts: ZapReceipt[] = [];

    if (target.pubkey) {
      receipts = await this.fetchZapReceipts(target.pubkey, {
        ...options,
        includeReceived: true,
        includeSent: false
      });
    } else if (target.eventId) {
      receipts = await this.fetchEventZaps(target.eventId, options);
    }

    const totalAmount = receipts.reduce((sum, receipt) => sum + receipt.amount, 0);

    return {
      count: receipts.length,
      totalAmount,
      receipts
    };
  }

  /**
   * Verify a zap receipt's authenticity
   */
  async verifyZapReceipt(receipt: ZapReceipt | Event): Promise<boolean> {
    let zapReceiptEvent: Event;
    
    if ('kind' in receipt && receipt.kind === 9735) {
      zapReceiptEvent = receipt as Event;
    } else {
      // If it's our parsed ZapReceipt, we need the original event
      // This would require storing the original event in our ZapReceipt interface
      console.warn('Cannot verify parsed zap receipt without original event');
      return false;
    }

    try {
      // Verify the zap receipt has required tags
      const bolt11Tag = zapReceiptEvent.tags.find(tag => tag[0] === 'bolt11');
      const descriptionTag = zapReceiptEvent.tags.find(tag => tag[0] === 'description');
      const pTag = zapReceiptEvent.tags.find(tag => tag[0] === 'p');

      if (!bolt11Tag || !descriptionTag || !pTag) {
        console.error('Zap receipt missing required tags');
        return false;
      }

      // Parse and verify the zap request inside the description
      if (descriptionTag[1]) {
        try {
          const zapRequest = JSON.parse(descriptionTag[1]) as Event;
          
          // Verify the zap request is kind 9734
          if (zapRequest.kind !== 9734) {
            console.error('Invalid zap request kind:', zapRequest.kind);
            return false;
          }

          // Verify the zap request has required tags
          const amountTag = zapRequest.tags.find(tag => tag[0] === 'amount');
          const relaysTag = zapRequest.tags.find(tag => tag[0] === 'relays');
          const pTagRequest = zapRequest.tags.find(tag => tag[0] === 'p');

          if (!amountTag || !relaysTag || !pTagRequest) {
            console.error('Zap request missing required tags');
            return false;
          }

          // Verify the recipient matches between receipt and request
          if (pTag[1] !== pTagRequest[1]) {
            console.error('Recipient mismatch between receipt and request');
            return false;
          }

          return true;
        } catch (e) {
          console.error('Failed to parse/verify zap request:', e);
          return false;
        }
      }

      return false;
    } catch (error) {
      console.error('Error verifying zap receipt:', error);
      return false;
    }
  }

  /**
   * Format amount from millisats to a readable string
   */
  formatAmount(millisats: number): string {
    const sats = Math.floor(millisats / 1000);
    
    if (sats >= 100000000) { // 1 BTC
      return `${(sats / 100000000).toFixed(8)} BTC`;
    } else if (sats >= 1000000) {
      return `${(sats / 1000000).toFixed(2)}M sats`;
    } else if (sats >= 1000) {
      return `${(sats / 1000).toFixed(1)}k sats`;
    }
    
    return `${sats} sats`;
  }

  /**
   * Close all subscriptions and connections
   */
  close() {
    this.pool.close(this.relays);
  }
}

// Singleton instance
let zapReceiptService: ZapReceiptService | null = null;

export function getZapReceiptService(relays?: string[]): ZapReceiptService {
  if (!zapReceiptService) {
    zapReceiptService = new ZapReceiptService(relays);
  }
  return zapReceiptService;
}