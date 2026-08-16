/**
 * Shared safety checks for the media proxy routes (`/api/proxy-image`,
 * `/api/proxy-audio`, `/api/proxy-video`).
 *
 * These routes fetch a caller-supplied URL server-side and stream the result
 * back from our own origin. Two things follow from that and both are handled
 * here rather than in each route:
 *
 * 1. **The response is same-origin.** Passing an upstream `Content-Type`
 *    straight through means anyone could serve arbitrary HTML — and therefore
 *    script — from this domain via `?url=https://evil.example/x.html`. The
 *    media-type check below is what stops that.
 * 2. **The fetch originates from our server.** Restricting the destination to
 *    public HTTPS addresses keeps the proxy from being pointed at loopback or
 *    private-network hosts.
 */

/** Hosts that must never be proxied: loopback, link-local, and cloud metadata. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

function isPrivateIPv4(hostname: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;

  const [a, b] = [Number(match[1]), Number(match[2])];
  if ([a, b, Number(match[3]), Number(match[4])].some((n) => n > 255)) return true; // malformed

  if (a === 10 || a === 127 || a === 0) return true; // private, loopback, "this host"
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata 169.254.169.254
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIPv6(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === '::1' || host === '::') return true; // loopback / unspecified
  if (host.startsWith('fc') || host.startsWith('fd')) return true; // unique local
  if (host.startsWith('fe80')) return true; // link-local
  // IPv4-mapped (::ffff:127.0.0.1) — check the embedded address too.
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(host);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

export type ProxyTargetResult =
  | { ok: true; url: URL }
  | { ok: false; error: string; status: number };

/**
 * Parse and vet a caller-supplied proxy target.
 * Returns the parsed URL, or the reason it was rejected.
 */
export function validateProxyTarget(rawUrl: string | null | undefined): ProxyTargetResult {
  if (!rawUrl) {
    return { ok: false, error: 'Missing url parameter', status: 400 };
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: 'Invalid URL format', status: 400 };
  }

  if (url.protocol !== 'https:') {
    return { ok: false, error: 'Only HTTPS URLs are allowed', status: 400 };
  }

  const hostname = url.hostname.toLowerCase();
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.internal') ||
    isPrivateIPv4(hostname) ||
    isPrivateIPv6(hostname)
  ) {
    return { ok: false, error: 'Destination not allowed', status: 403 };
  }

  return { ok: true, url };
}

/**
 * Media types a browser will execute or render as a document. Serving any of
 * these from our origin turns the proxy into an XSS primitive, so they are
 * refused outright regardless of which proxy route asked.
 */
const ACTIVE_CONTENT_TYPES = [
  'text/html',
  'application/xhtml',
  'text/xml',
  'application/xml',
  'text/javascript',
  'application/javascript',
  'application/ecmascript',
  'text/ecmascript',
  'application/pdf',
];

/**
 * Check an upstream Content-Type against what the route is willing to serve.
 *
 * `allowedPrefixes` are matched against the bare media type, e.g. `['image/']`.
 * `application/octet-stream` is accepted when `allowOctetStream` is set —
 * plenty of podcast hosts serve MP3s that way, and an opaque byte stream is not
 * something a browser will execute.
 */
export function isAllowedMediaType(
  contentType: string | null,
  allowedPrefixes: string[],
  { allowOctetStream = false }: { allowOctetStream?: boolean } = {}
): boolean {
  if (!contentType) return allowOctetStream;

  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  if (ACTIVE_CONTENT_TYPES.some((blocked) => mediaType.startsWith(blocked))) return false;
  if (allowOctetStream && mediaType === 'application/octet-stream') return true;

  return allowedPrefixes.some((prefix) => mediaType.startsWith(prefix));
}

/**
 * SVG is a legitimate `image/*` type that can carry script, so it can't just be
 * waved through by the media-type check. Callers serve it with these headers,
 * which stop it being used as a script host while still letting it render as
 * an image inside an `<img>` tag.
 */
export function hardeningHeadersFor(contentType: string | null): Record<string, string> {
  const mediaType = (contentType || '').split(';')[0].trim().toLowerCase();
  const headers: Record<string, string> = { 'X-Content-Type-Options': 'nosniff' };

  if (mediaType === 'image/svg+xml') {
    headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    headers['Content-Disposition'] = 'attachment';
  }

  return headers;
}
