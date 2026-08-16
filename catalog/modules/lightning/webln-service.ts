/**
 * WebLN Service for Lightning Network payments in the browser
 * Handles wallet connections and payment requests
 */

export interface WebLNProvider {
  enable(): Promise<void>;
  sendPayment(paymentRequest: string): Promise<SendPaymentResponse>;
  makeInvoice(args?: RequestInvoiceArgs): Promise<RequestInvoiceResponse>;
  signMessage(message: string): Promise<SignMessageResponse>;
  verifyMessage(signature: string, message: string): Promise<void>;
  getInfo(): Promise<GetInfoResponse>;
}

export interface SendPaymentResponse {
  preimage: string;
  paymentHash?: string;
  route?: any;
}

export interface RequestInvoiceArgs {
  amount?: number | string;
  defaultAmount?: number | string;
  minimumAmount?: number | string;
  maximumAmount?: number | string;
  defaultMemo?: string;
}

export interface RequestInvoiceResponse {
  paymentRequest: string;
  paymentHash: string;
  rHash: string;
}

export interface SignMessageResponse {
  message: string;
  signature: string;
}

export interface GetInfoResponse {
  node?: {
    alias: string;
    pubkey: string;
    color?: string;
  };
  methods?: string[];
  version?: string;
  supports?: string[];
}

declare global {
  interface Window {
    webln?: WebLNProvider;
  }
}

export class WebLNService {
  private static provider: WebLNProvider | null = null;

  /**
   * Check if WebLN is available
   */
  static isAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.webln;
  }

  /**
   * Enable WebLN provider
   */
  static async enable(): Promise<WebLNProvider> {
    if (!this.isAvailable()) {
      throw new Error('WebLN is not available. Please install a Lightning wallet extension.');
    }

    try {
      await window.webln!.enable();
      this.provider = window.webln!;
      console.log('✅ WebLN enabled successfully');
      return this.provider;
    } catch (error) {
      console.error('Failed to enable WebLN:', error);
      throw new Error('Failed to connect to Lightning wallet');
    }
  }

  /**
   * Pay a Lightning invoice
   */
  static async payInvoice(invoice: string): Promise<SendPaymentResponse> {
    if (!this.provider) {
      await this.enable();
    }

    try {
      console.log('💸 Sending payment...');
      const response = await this.provider!.sendPayment(invoice);
      console.log('✅ Payment successful:', response);
      return response;
    } catch (error) {
      console.error('Payment failed:', error);
      throw error;
    }
  }

  /**
   * Get wallet info
   */
  static async getInfo(): Promise<GetInfoResponse> {
    if (!this.provider) {
      await this.enable();
    }

    try {
      return await this.provider!.getInfo();
    } catch (error) {
      console.error('Failed to get wallet info:', error);
      throw error;
    }
  }

  /**
   * Create an invoice
   */
  static async makeInvoice(args?: RequestInvoiceArgs): Promise<RequestInvoiceResponse> {
    if (!this.provider) {
      await this.enable();
    }

    try {
      return await this.provider!.makeInvoice(args);
    } catch (error) {
      console.error('Failed to create invoice:', error);
      throw error;
    }
  }

  /**
   * Sign a message
   */
  static async signMessage(message: string): Promise<SignMessageResponse> {
    if (!this.provider) {
      await this.enable();
    }

    try {
      return await this.provider!.signMessage(message);
    } catch (error) {
      console.error('Failed to sign message:', error);
      throw error;
    }
  }

  /**
   * Check if user has a WebLN wallet and prompt to install if not
   */
  static async checkAndPromptWallet(): Promise<boolean> {
    if (this.isAvailable()) {
      return true;
    }

    const message = `
      To send zaps, you need a Lightning wallet browser extension.
      
      Popular options:
      • Alby (https://getalby.com)
      • Joule (https://lightningjoule.com)
      • BlueWallet (https://bluewallet.io)
      
      Would you like to learn more about Lightning wallets?
    `;

    if (confirm(message)) {
      window.open('https://www.lopp.net/lightning-information.html', '_blank');
    }

    return false;
  }
}