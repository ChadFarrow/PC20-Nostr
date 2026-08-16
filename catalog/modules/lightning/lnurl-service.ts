import { bech32 } from 'bech32';

/**
 * LNURL Service for handling Lightning Network URL protocols
 * Implements NIP-57 LNURL flow for zaps
 */

export interface LNURLResponse {
  callback: string;
  maxSendable: number;
  minSendable: number;
  metadata: string;
  tag: string;
  allowsNostr?: boolean;
  nostrPubkey?: string;
}

export interface LNURLInvoiceResponse {
  pr: string; // Lightning invoice (BOLT11)
  successAction?: {
    tag: string;
    message?: string;
  };
  routes?: any[];
}

export class LNURLService {
  // Cache for LNURL metadata to avoid repeated lookups
  private static metadataCache: Map<string, { data: LNURLResponse; timestamp: number }> = new Map();
  private static readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Decode an LNURL or Lightning Address
   */
  static decodeLNURL(lnurlOrAddress: string): string {
    // Check if it's a Lightning Address (user@domain.com)
    if (lnurlOrAddress.includes('@')) {
      const [username, domain] = lnurlOrAddress.split('@');
      return `https://${domain}/.well-known/lnurlp/${username}`;
    }

    // Otherwise decode the LNURL
    try {
      const decoded = bech32.decode(lnurlOrAddress, 1000);
      const data = bech32.fromWords(decoded.words);
      return Buffer.from(data).toString('utf8');
    } catch (error) {
      console.error('Failed to decode LNURL:', error);
      throw new Error('Invalid LNURL format');
    }
  }

  /**
   * Fetch LNURL metadata from endpoint with caching
   */
  static async fetchLNURLMetadata(url: string): Promise<LNURLResponse> {
    // Check cache first
    const cached = this.metadataCache.get(url);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < this.CACHE_DURATION) {
      console.log(`🚀 Using cached LNURL metadata for ${url}`);
      return cached.data;
    }

    try {
      console.log(`🔄 Fetching fresh LNURL metadata for ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch LNURL metadata: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Validate required fields
      if (!data.callback || data.minSendable === undefined || data.maxSendable === undefined) {
        throw new Error('Invalid LNURL response: missing required fields');
      }

      // Cache the result
      this.metadataCache.set(url, { data: data as LNURLResponse, timestamp: now });
      
      return data as LNURLResponse;
    } catch (error) {
      console.error('Error fetching LNURL metadata:', error);
      throw error;
    }
  }

  /**
   * Request a Lightning invoice for a zap
   */
  static async requestZapInvoice(
    lnurlMetadata: LNURLResponse,
    amountMillisats: number,
    zapRequest: string, // Serialized zap request event
    comment?: string
  ): Promise<LNURLInvoiceResponse> {
    // Validate amount is within bounds
    if (amountMillisats < lnurlMetadata.minSendable || amountMillisats > lnurlMetadata.maxSendable) {
      throw new Error(
        `Amount ${amountMillisats} is outside bounds [${lnurlMetadata.minSendable}, ${lnurlMetadata.maxSendable}]`
      );
    }

    // Build callback URL with parameters
    const callbackUrl = new URL(lnurlMetadata.callback);
    callbackUrl.searchParams.set('amount', amountMillisats.toString());
    
    // Add zap request for NIP-57
    if (lnurlMetadata.allowsNostr && zapRequest) {
      callbackUrl.searchParams.set('nostr', zapRequest);
    }

    // Add comment if provided and supported
    if (comment) {
      callbackUrl.searchParams.set('comment', comment);
    }

    try {
      const response = await fetch(callbackUrl.toString());
      if (!response.ok) {
        throw new Error(`Failed to get invoice: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.pr) {
        throw new Error('Invalid invoice response: missing pr field');
      }

      return data as LNURLInvoiceResponse;
    } catch (error) {
      console.error('Error requesting invoice:', error);
      throw error;
    }
  }

  /**
   * Full flow: Get invoice from LNURL or Lightning Address
   */
  static async getZapInvoice(
    lnurlOrAddress: string,
    amountMillisats: number,
    zapRequestEvent: any,
    comment?: string
  ): Promise<string> {
    try {
      // 1. Decode LNURL or Lightning Address to get URL
      const url = this.decodeLNURL(lnurlOrAddress);
      
      // 2. Fetch LNURL metadata
      const metadata = await this.fetchLNURLMetadata(url);
      
      // Check if zaps are supported
      if (!metadata.allowsNostr) {
        console.warn('This LNURL endpoint does not support zaps');
      }
      
      // 3. Request invoice with zap request
      const invoiceResponse = await this.requestZapInvoice(
        metadata,
        amountMillisats,
        JSON.stringify(zapRequestEvent),
        comment
      );
      
      return invoiceResponse.pr;
    } catch (error) {
      console.error('Failed to get zap invoice:', error);
      throw error;
    }
  }

  /**
   * Get a simple payment invoice from Lightning Address (without zap request)
   */
  static async getPaymentInvoice(
    lnurlOrAddress: string,
    amountMillisats: number,
    comment?: string
  ): Promise<string> {
    try {
      // 1. Decode LNURL or Lightning Address to get URL
      const url = this.decodeLNURL(lnurlOrAddress);
      
      // 2. Fetch LNURL metadata
      const metadata = await this.fetchLNURLMetadata(url);
      
      // 3. Request invoice without zap request (simple payment)
      const callbackUrl = new URL(metadata.callback);
      callbackUrl.searchParams.set('amount', amountMillisats.toString());
      
      if (comment) {
        callbackUrl.searchParams.set('comment', comment);
      }
      
      const response = await fetch(callbackUrl.toString());
      if (!response.ok) {
        throw new Error(`Failed to get invoice: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.pr) {
        throw new Error('Invalid invoice response: missing pr field');
      }

      return data.pr;
    } catch (error) {
      console.error('Failed to get payment invoice:', error);
      throw error;
    }
  }

  /**
   * Extract metadata from LNURL response
   */
  static parseMetadata(metadataStr: string): { [key: string]: string } {
    try {
      const metadata = JSON.parse(metadataStr);
      const result: { [key: string]: string } = {};
      
      for (const [type, content] of metadata) {
        result[type] = content;
      }
      
      return result;
    } catch (error) {
      console.error('Failed to parse metadata:', error);
      return {};
    }
  }
}