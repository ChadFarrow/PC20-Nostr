import { bech32 } from 'bech32';
import { decode } from 'light-bolt11-decoder';

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

/**
 * ---------------------------------------------------------------------------
 * Guards added in extraction. The running site does not have these.
 *
 * Everything outside these guards is byte-identical to the source recorded in
 * catalog/PROVENANCE.tsv, except where a call was rerouted through
 * `safeFetch` or `assertInvoiceMatches`. See the recipe README and
 * catalog/comparisons/lightning-payment-safety.md.
 * ---------------------------------------------------------------------------
 */

/**
 * Resolve a hostname to its IP addresses.
 *
 * Kept injectable because this file has to run in a browser too, and a browser
 * has no DNS API. On a server the module refuses to make a request until one
 * is set - see `assertHostAllowed`.
 */
export type HostResolver = (hostname: string) => Promise<string[]>;

let hostResolver: HostResolver | null = null;

export function setHostResolver(resolver: HostResolver | null): void {
  hostResolver = resolver;
}

const BLOCKED_SUFFIXES = ['.internal', '.local', '.localhost', '.onion'];

function ipv4Blocked(a: number, b: number): boolean {
  if (a === 0) return true;                        // "this network"
  if (a === 10) return true;                       // RFC1918
  if (a === 127) return true;                      // loopback
  if (a === 169 && b === 254) return true;         // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;// RFC1918
  if (a === 192 && b === 168) return true;         // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0) return true;           // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true;                       // multicast and reserved
  return false;
}

/**
 * Expand an IPv6 literal to its eight 16-bit groups, or null if it is not one.
 *
 * Written out rather than regex-matched because the compressed forms are
 * exactly where a guard goes wrong: `::ffff:7f00:1` and `::ffff:127.0.0.1`
 * and `0:0:0:0:0:ffff:7f00:1` are one address, and a check that only knows
 * the dotted spelling lets the other two through.
 */
function expandIPv6(host: string): number[] | null {
  let text = host;
  let tail: number[] = [];

  // A trailing dotted quad (::ffff:127.0.0.1) is two groups.
  const dotted = /:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(text);
  if (dotted) {
    const octets = dotted[1].split('.').map(Number);
    if (octets.some((n) => !Number.isInteger(n) || n > 255)) return null;
    tail = [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]];
    text = text.slice(0, dotted.index + 1);
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;

  const parse = (part: string): number[] | null => {
    if (!part) return [];
    const out: number[] = [];
    for (const g of part.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  const head = parse(halves[0].replace(/:$/, ''));
  if (head === null) return null;

  if (halves.length === 1) {
    const all = [...head, ...tail];
    return all.length === 8 ? all : null;
  }

  const rest = parse(halves[1].replace(/^:/, ''));
  if (rest === null) return null;

  const known = head.length + rest.length + tail.length;
  if (known > 8) return null;
  return [...head, ...new Array(8 - known).fill(0), ...rest, ...tail];
}

/**
 * Is this literal address one we must never send a request to?
 *
 * Literal addresses only. A hostname is checked against DNS separately, in
 * `assertHostAllowed`, because that needs a resolver this file cannot assume.
 *
 * IPv6 goes through `expandIPv6` first. Matching the text would repeat the
 * bypass the withdrawn image proxy shipped: `::ffff:` hosts defeated its
 * IPv6 test because Node normalises them to hex before the regex sees them.
 */
export function isBlockedHost(hostname: string): boolean {
  let host = hostname.trim().toLowerCase();
  if (!host) return true;

  // URL keeps IPv6 literals bracketed.
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  // A trailing dot is a valid FQDN and must not defeat a suffix test.
  if (host.endsWith('.')) host = host.slice(0, -1);

  if (host === 'localhost') return true;
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return true;

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const parts = v4.slice(1).map(Number);
    if (parts.some((n) => n > 255)) return true;   // not a valid address at all
    return ipv4Blocked(parts[0], parts[1]);
  }

  if (host.includes(':')) {
    const groups = expandIPv6(host);
    if (!groups) return true;                      // unparseable: refuse it

    // An IPv4-mapped address is the same machine as the IPv4 inside it, and
    // it can be written ::ffff:127.0.0.1, ::ffff:7f00:1, or fully expanded.
    // Expanding first is what makes all three take the same path.
    const mapped =
      groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
    if (mapped) {
      const [hi, lo] = [groups[6], groups[7]];
      return ipv4Blocked(hi >> 8, hi & 0xff);
    }

    if (groups.every((g) => g === 0)) return true;                 // ::
    if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1
    if ((groups[0] & 0xfe00) === 0xfc00) return true;              // fc00::/7
    if ((groups[0] & 0xffc0) === 0xfe80) return true;              // fe80::/10
    return false;
  }

  return false;
}

async function assertHostAllowed(hostname: string): Promise<void> {
  if (isBlockedHost(hostname)) {
    throw new Error(`Refusing to request a private or local host: ${hostname}`);
  }

  if (hostResolver) {
    for (const address of await hostResolver(hostname)) {
      if (isBlockedHost(address)) {
        throw new Error(
          `Refusing to request ${hostname}: it resolves to the private address ${address}`
        );
      }
    }
    return;
  }

  // Fail closed on a server. A hostname is only half-checked without DNS -
  // `evil.example.com` can have an A record of 169.254.169.254 - and the
  // realistic deployment of this file is a route handler, where that request
  // leaves your infrastructure rather than a user's laptop. Refusing here is
  // what stops the gap from being shipped by someone who never read the
  // README.
  if (typeof window === 'undefined') {
    throw new Error(
      'No host resolver is set. Server-side use must call ' +
        'setHostResolver(nodeHostResolver) from ./node-host-resolver first, ' +
        'or hostnames resolving to private addresses are not blocked.'
    );
  }
}

/**
 * Validate a URL before anything is sent to it.
 *
 * LUD-01 requires https, with http permitted only for .onion - and .onion is
 * blocked outright above, because resolving one needs a proxy this code does
 * not have and pretending otherwise fails open.
 */
export async function assertRequestableUrl(raw: string, what: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${what} is not a valid URL`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${what} must use https, got ${url.protocol}`);
  }
  await assertHostAllowed(url.hostname);
  return url;
}

const MAX_REDIRECTS = 3;

/**
 * fetch, with every hop checked.
 *
 * `fetch` follows redirects itself, and a redirect is a second URL nobody
 * validated: a hostile LNURL server answers 302 to http://169.254.169.254/
 * and the guard above never sees it. Following them by hand is the only way
 * the check applies to the request that is actually made.
 */
export async function safeFetch(raw: string, what: string): Promise<Response> {
  let target = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertRequestableUrl(target, what);
    const response = await fetch(url.toString(), { redirect: 'manual' });

    if (response.status < 300 || response.status > 399) return response;

    const location = response.headers.get('location');
    if (!location) return response;
    target = new URL(location, url).toString();
  }
  throw new Error(`${what} redirected more than ${MAX_REDIRECTS} times`);
}

/**
 * Never hand a wallet an invoice we have not read.
 *
 * The amount is set by the remote LNURL server, which for a Lightning address
 * out of a podcast feed is a stranger. `pay_invoice` pays what the invoice
 * says, so an unchecked one is the server naming its own price - and the user
 * approved a different number.
 */
/**
 * Read one section out of a decoded invoice.
 *
 * `sections` is a discriminated union and not every member carries a `value`,
 * so a bare `.value` does not compile. Casting the predicate parameter to
 * `any` hides that rather than answering it, and leaves `undefined` looking
 * like a number.
 */
function sectionValue(
  decoded: ReturnType<typeof decode>,
  name: string
): string | number | undefined {
  const section = decoded.sections.find((s) => s.name === name);
  if (!section || !('value' in section)) return undefined;
  const value = section.value;
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

export function assertInvoiceMatches(pr: string, expectedMsat: number): string {
  const decoded = decode(pr);

  const invoiceMsat = Number(sectionValue(decoded, 'amount'));
  if (!Number.isFinite(invoiceMsat)) {
    throw new Error('Invoice has no amount; refusing to pay an open invoice');
  }
  if (invoiceMsat !== expectedMsat) {
    throw new Error(
      `Invoice amount ${invoiceMsat} msat does not match the requested ${expectedMsat} msat`
    );
  }

  // An expired invoice fails at the wallet, but failing here is clearer and
  // avoids handing a stale payment request to a signer.
  const timestamp = Number(sectionValue(decoded, 'timestamp'));
  const expiry = Number(sectionValue(decoded, 'expiry') ?? 3600);
  if (Number.isFinite(timestamp) && Date.now() / 1000 > timestamp + (Number.isFinite(expiry) ? expiry : 3600)) {
    throw new Error('Invoice has expired');
  }

  return pr;
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
      const parts = lnurlOrAddress.split('@');
      if (parts.length !== 2) {
        throw new Error('Invalid Lightning Address');
      }
      const [username, domain] = parts;

      // The username is interpolated into a path. Unescaped, '../' walks out
      // of /.well-known/lnurlp/ and a '?' rewrites the query, so the address
      // picks the URL rather than naming a user at a domain.
      if (!username || !/^[a-z0-9._%+-]+$/i.test(username)) {
        throw new Error('Invalid Lightning Address username');
      }
      // A bare registrable hostname only: no port, no userinfo, no path.
      if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(domain)) {
        throw new Error('Invalid Lightning Address domain');
      }
      if (isBlockedHost(domain)) {
        throw new Error(`Refusing to request a private or local host: ${domain}`);
      }
      return `https://${domain}/.well-known/lnurlp/${encodeURIComponent(username)}`;
    }

    // Otherwise decode the LNURL
    let target: string;
    try {
      const decoded = bech32.decode(lnurlOrAddress, 1000);
      const data = bech32.fromWords(decoded.words);
      target = Buffer.from(data).toString('utf8');
    } catch (error) {
      console.error('Failed to decode LNURL:', error);
      throw new Error('Invalid LNURL format');
    }

    // The decoded payload is a URL chosen by whoever produced the lnurl1
    // string. Unchecked, `lnurl1...` decoding to http://169.254.169.254/ is
    // fetched as written.
    let url: URL;
    try {
      url = new URL(target);
    } catch {
      throw new Error('Decoded LNURL is not a valid URL');
    }
    if (url.protocol !== 'https:') {
      throw new Error(`Decoded LNURL must use https, got ${url.protocol}`);
    }
    if (isBlockedHost(url.hostname)) {
      throw new Error(`Refusing to request a private or local host: ${url.hostname}`);
    }
    return target;
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
      const response = await safeFetch(url, 'LNURL endpoint');
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

    // Build callback URL with parameters. The callback is chosen by the same
    // remote server that supplied the bounds above, so it is checked here and
    // again by safeFetch before the request goes out.
    if (isBlockedHost(new URL(lnurlMetadata.callback).hostname)) {
      throw new Error('LNURL callback points at a private or local host');
    }
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
      const response = await safeFetch(callbackUrl.toString(), 'LNURL callback');
      if (!response.ok) {
        throw new Error(`Failed to get invoice: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.pr) {
        throw new Error('Invalid invoice response: missing pr field');
      }

      assertInvoiceMatches(data.pr, amountMillisats);

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
      if (isBlockedHost(new URL(metadata.callback).hostname)) {
        throw new Error('LNURL callback points at a private or local host');
      }
      const callbackUrl = new URL(metadata.callback);
      callbackUrl.searchParams.set('amount', amountMillisats.toString());
      
      if (comment) {
        callbackUrl.searchParams.set('comment', comment);
      }
      
      const response = await safeFetch(callbackUrl.toString(), 'LNURL callback');
      if (!response.ok) {
        throw new Error(`Failed to get invoice: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.pr) {
        throw new Error('Invalid invoice response: missing pr field');
      }

      return assertInvoiceMatches(data.pr, amountMillisats);
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