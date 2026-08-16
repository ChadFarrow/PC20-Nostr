import { 
  SimplePool, 
  finalizeEvent, 
  generateSecretKey, 
  getPublicKey,
  nip04,
  type Event,
  type EventTemplate
} from 'nostr-tools';
import { safeLocalStorage } from '@/lib/safe-storage';

export interface NWCConnection {
  relay: string;
  walletPubkey: string;
  secret: Uint8Array;
  publicKey: string;
  allRelays?: string[];
}

export interface PaymentRequest {
  invoice: string;
  amount?: number;
  description?: string;
}

export interface PaymentResponse {
  preimage?: string;
  error?: string;
}

export interface BalanceResponse {
  balance?: number;
  error?: string;
}

export class NWCService {
  private pool: SimplePool;
  private connection: NWCConnection | null = null;
  private relays: string[] = [];
  private isConnecting: boolean = false;
  private lastConnectionAttempt: number = 0;
  private isCashuWallet: boolean = false;
  private connectionCache: Map<string, { connection: NWCConnection, timestamp: number }> = new Map();

  constructor() {
    this.pool = new SimplePool();
  }

  /**
   * Detect if wallet is Cashu-based
   */
  private detectCashuWallet(connectionString: string, relay: string): boolean {
    // Check for cashu.me patterns
    if (relay.includes('cashu') || relay.includes('cashume')) {
      return true;
    }
    
    // Check connection string for Cashu indicators
    if (connectionString.includes('cashu') || connectionString.includes('mint')) {
      return true;
    }
    
    return false;
  }

  /**
   * Parse NWC connection string (nostr+walletconnect://...)
   */
  parseConnectionString(connectionString: string): NWCConnection {
    console.log('🔍 Parsing connection string:', connectionString.substring(0, 50) + '...');
    
    // Check cache first (valid for 10 minutes)
    const cached = this.connectionCache.get(connectionString);
    if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
      console.log('🚀 Using cached connection');
      return cached.connection;
    }
    
    // Clean up connection string (remove any whitespace/newlines)
    connectionString = connectionString.trim();
    
    let url: URL;
    try {
      url = new URL(connectionString);
    } catch (error) {
      console.error('Invalid URL format:', error);
      throw new Error('Invalid NWC connection string format. Please ensure it starts with nostr+walletconnect://');
    }
    
    if (!url.protocol.startsWith('nostr+walletconnect:')) {
      throw new Error('Invalid NWC connection string protocol. Expected nostr+walletconnect://');
    }

    const walletPubkey = url.hostname || url.pathname.replace('//', '');
    const params = new URLSearchParams(url.search);
    
    // Get all relay parameters (Cashu.me provides multiple)
    const relays = params.getAll('relay');
    const relay = relays[0] || params.get('relay'); // Use first relay as primary
    const secret = params.get('secret');
    
    console.log('🔍 Parsed params:', { 
      relay, 
      allRelays: relays,
      secret: secret ? secret.substring(0, 10) + '...' : null, 
      walletPubkey: walletPubkey ? walletPubkey.substring(0, 10) + '...' : null 
    });
    
    if (!relay) {
      throw new Error('Missing relay parameter in NWC connection string');
    }
    if (!secret) {
      throw new Error('Missing secret parameter in NWC connection string');
    }
    if (!walletPubkey) {
      throw new Error('Missing wallet pubkey in NWC connection string');
    }

    // Validate secret is hex
    if (!/^[0-9a-fA-F]+$/.test(secret)) {
      throw new Error('Invalid secret format - must be hexadecimal');
    }
    
    // Ensure secret is 64 hex chars (32 bytes)
    if (secret.length !== 64) {
      throw new Error(`Invalid secret length - expected 64 hex characters, got ${secret.length}`);
    }

    const secretKey = Uint8Array.from(
      secret.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
    );
    
    const connection = {
      relay,
      walletPubkey,
      secret: secretKey,
      publicKey: getPublicKey(secretKey),
      allRelays: relays
    };
    
    // Cache the connection
    this.connectionCache.set(connectionString, {
      connection,
      timestamp: Date.now()
    });
    
    return connection;
  }

  /**
   * Connect to a wallet using NWC connection string
   */
  async connect(connectionString: string): Promise<void> {
    try {
      console.log('🔌 Attempting to connect to NWC wallet...');
      this.connection = this.parseConnectionString(connectionString);
      // Use all available relays for better connectivity
      this.relays = this.connection.allRelays && this.connection.allRelays.length > 0 
        ? this.connection.allRelays 
        : [this.connection.relay];
      
      // Detect Cashu wallet and set flag
      this.isCashuWallet = this.detectCashuWallet(connectionString, this.connection.relay);
      if (this.isCashuWallet) {
        console.log('🥜 Detected Cashu wallet - keysend payments will be disabled');
      }
      
      console.log('📡 Using relays:', this.relays);
      
      // Test connection by fetching info with longer timeout for Cashu.me
      console.log('🔍 Testing connection by fetching wallet info...');
      const info = await this.getInfo();
      
      if (info.error) {
        console.error('❌ Failed to get wallet info:', info.error);
        throw new Error(`Failed to connect: ${info.error}`);
      }
      
      console.log('✅ Connected to NWC wallet:', info);
      
      // Store the connection string for future use
      if (typeof window !== 'undefined') {
        safeLocalStorage.setItem('nwc_connection_string', connectionString);
      }
    } catch (error) {
      this.connection = null;
      this.relays = [];
      console.error('❌ Connection failed:', error);
      throw error;
    }
  }

  /**
   * Disconnect from wallet
   */
  disconnect(): void {
    this.connection = null;
    this.relays = [];
    this.isCashuWallet = false;
    this.pool.close(this.relays);
  }

  /**
   * Check if wallet is connected
   */
  isConnected(): boolean {
    return this.connection !== null;
  }

  /**
   * Check if connected wallet is Cashu-based
   */
  isCashu(): boolean {
    return this.isCashuWallet;
  }

  /**
   * Send NWC request
   */
  private async sendNWCRequest(method: string, params: any = {}): Promise<any> {
    if (!this.connection) {
      throw new Error('Not connected to wallet');
    }

    const request = {
      method,
      params
    };

    // Encrypt the request
    const encrypted = await nip04.encrypt(
      this.connection.secret,
      this.connection.walletPubkey,
      JSON.stringify(request)
    );

    // Create NWC event (kind 23194)
    const eventTemplate: EventTemplate = {
      kind: 23194,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', this.connection.walletPubkey]],
      content: encrypted
    };

    const event = finalizeEvent(eventTemplate, this.connection.secret);

    // Send event and wait for response
    const response = await this.waitForResponse(event);
    
    if (!response) {
      throw new Error('No response from wallet');
    }

    // Decrypt response
    const decrypted = await nip04.decrypt(
      this.connection.secret,
      this.connection.walletPubkey,
      response.content
    );

    return JSON.parse(decrypted);
  }

  /**
   * Wait for NWC response
   */
  private async waitForResponse(requestEvent: Event): Promise<Event | null> {
    if (!this.connection) return null;

    return new Promise((resolve) => {
      let responseReceived = false;
      let relayErrors = 0;
      const maxRelayErrors = this.relays.length * 2; // Allow some relay failures
      
      const sub = this.pool.subscribeMany(
        this.relays,
        [
          {
            kinds: [23195], // NWC response kind
            authors: [this.connection!.walletPubkey],
            '#e': [requestEvent.id],
            since: requestEvent.created_at - 60 // Look back 60 seconds in case of timing issues
          }
        ],
        {
          onevent: (event) => {
            if (!responseReceived) {
              responseReceived = true;
              console.log('📥 Received NWC response from wallet');
              sub.close();
              resolve(event);
            }
          },
          oneose: () => {
            // Relay subscription established - only log for Cashu wallets if there are issues
          },
          onclose: (reason) => {
            relayErrors++;
            // Only log relay errors if we're having significant issues
            if (relayErrors > maxRelayErrors && !responseReceived) {
              console.warn('⚠️ Multiple relay connection issues, but continuing...');
            }
          }
        }
      );

      // Publish request with reduced logging for Cashu wallets
      if (this.isCashuWallet) {
        console.log('📤 Publishing NWC request to Cashu relays...');
      } else {
        console.log('📤 Publishing NWC request to relays:', this.relays);
      }
      
      const publishPromises = this.pool.publish(this.relays, requestEvent);
      
      // Handle publish failures gracefully
      publishPromises.forEach((promise, index) => {
        promise.catch((error) => {
          // Only log if we're not getting responses from any relay
          if (!responseReceived && relayErrors < maxRelayErrors) {
            console.warn(`📡 Relay ${this.relays[index]} publish failed:`, error.message);
          }
        });
      });

      // Aggressive timeout optimization for bridge operations
      const timeout = this.isCashuWallet ? 15000 : 20000; // Further reduced for faster bridge processing
      setTimeout(() => {
        if (!responseReceived) {
          sub.close();
          console.log(`⏱️ NWC request timed out after ${timeout/1000} seconds`);
          resolve(null);
        }
      }, timeout);
    });
  }

  /**
   * Get wallet info
   */
  async getInfo(): Promise<any> {
    try {
      return await this.sendNWCRequest('get_info');
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<BalanceResponse> {
    try {
      const response = await this.sendNWCRequest('get_balance');
      console.log('🔍 Full NWC balance response:', response);
      console.log('🔍 Balance value:', response.result?.balance, 'Type:', typeof response.result?.balance);
      return {
        balance: response.result?.balance
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Pay a Lightning invoice
   */
  async payInvoice(invoice: string): Promise<PaymentResponse> {
    try {
      const response = await this.sendNWCRequest('pay_invoice', { invoice });
      
      if (response.error) {
        return { error: response.error.message || response.error };
      }
      
      return {
        preimage: response.result?.preimage
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Create a Lightning invoice
   */
  async makeInvoice(amount: number, description?: string): Promise<{ invoice?: string; payment_hash?: string; error?: string }> {
    try {
      const response = await this.sendNWCRequest('make_invoice', {
        amount,
        description
      });
      
      if (response.error) {
        return { error: response.error.message || response.error };
      }
      
      return {
        invoice: response.result?.invoice,
        payment_hash: response.result?.payment_hash
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Pay Lightning address by resolving to invoice first
   */
  async payLightningAddress(lnAddress: string, amount: number, comment?: string): Promise<PaymentResponse> {
    try {
      console.log(`🔗 NWC resolving Lightning address to invoice: ${lnAddress}`);
      
      const { LNURLService } = await import('./lnurl-service');
      const amountMillisats = amount * 1000; // Convert sats to millisats
      
      const invoice = await LNURLService.getPaymentInvoice(
        lnAddress,
        amountMillisats,
        comment
      );
      
      console.log(`💳 NWC got invoice for ${lnAddress}, paying via NWC`);
      
      return await this.payInvoice(invoice);
    } catch (error) {
      console.error('❌ Lightning address payment failed:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Pay keysend (direct payment without invoice)
   */
  async payKeysend(pubkey: string, amount: number, tlvRecords?: any): Promise<PaymentResponse> {
    // Skip keysend for Cashu wallets as they don't support it
    if (this.isCashuWallet) {
      console.log('🥜 Skipping keysend payment - Cashu wallets do not support keysend');
      return { error: 'Keysend payments are not supported by Cashu wallets. Please use Lightning addresses or invoices instead.' };
    }

    try {
      // Convert sats to msats for NWC (if not already in msats)
      const amountMsats = amount < 1000000 ? amount * 1000 : amount;
      
      // Only include TLV records if they are provided and not empty
      const paymentParams: any = {
        pubkey,
        amount: amountMsats
      };
      
      if (tlvRecords && tlvRecords.length > 0) {
        paymentParams.tlv_records = tlvRecords;
        
        // Enhanced TLV debugging for Helipad compatibility
        console.log('🔍 NWC SERVICE - TLV Records Debug:');
        console.log('📊 TLV Record Count:', tlvRecords.length);
        
        tlvRecords.forEach((record: any, index: number) => {
          console.log(`📋 TLV Record ${index + 1}:`);
          console.log(`   Type: ${record.type}`);
          console.log(`   Value Length: ${record.value ? record.value.length : 0} chars`);
          
          // Decode and log the actual content for debugging
          if (record.value) {
            try {
              const decoded = Buffer.from(record.value, 'hex').toString('utf8');
              console.log(`   Decoded Content:`, decoded);
              
              // If it's JSON, parse and pretty print
              if (decoded.startsWith('{') || decoded.startsWith('[')) {
                try {
                  const parsed = JSON.parse(decoded);
                  console.log(`   Parsed JSON:`, JSON.stringify(parsed, null, 2));
                } catch (e) {
                  console.log(`   Raw Text:`, decoded);
                }
              } else {
                console.log(`   Raw Text:`, decoded);
              }
            } catch (e) {
              console.log(`   Raw Hex:`, record.value.substring(0, 100) + '...');
            }
          }
          console.log('   ─────────────────────');
        });
      }
      
      console.log('⚡ Sending keysend payment:', paymentParams);
      
      const response = await this.sendNWCRequest('pay_keysend', paymentParams);
      
      console.log('⚡ Keysend payment response:', response);
      
      if (response.error) {
        console.error('❌ Keysend payment error:', response.error);
        return { error: response.error.message || response.error };
      }
      
      return {
        preimage: response.result?.preimage
      };
    } catch (error) {
      console.error('💥 Keysend payment exception:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Look up invoice status
   */
  async lookupInvoice(invoice: string, paymentHash?: string): Promise<{ settled?: boolean; paid?: boolean; error?: string }> {
    try {
      const params: any = { invoice };
      if (paymentHash) {
        params.payment_hash = paymentHash;
      }
      
      const response = await this.sendNWCRequest('lookup_invoice', params);
      
      if (response.error) {
        return { error: response.error.message || response.error };
      }
      
      return {
        settled: response.result?.settled,
        paid: response.result?.paid
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * List transactions
   */
  async listTransactions(params?: { from?: number; until?: number; limit?: number }): Promise<any> {
    try {
      return await this.sendNWCRequest('list_transactions', params);
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

// Singleton instance
let nwcService: NWCService | null = null;

export function getNWCService(): NWCService {
  if (!nwcService) {
    nwcService = new NWCService();
    // Store global reference for context checking
    if (typeof window !== 'undefined') {
      (window as any).__nwcService = nwcService;
    }
  }
  return nwcService;
}