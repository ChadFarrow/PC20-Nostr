import {
  BOOSTBOX_OPTIONAL_FIELDS,
  BOOSTBOX_REQUIRED_FIELDS,
  type BoostboxReceipt,
  type BoostboxSubmission,
} from '@/lib/boostbox-types';

/**
 * Server route for BoostBox. The API key lives here and nowhere else.
 *
 * This is the whole point of the recipe. BoostBox authenticates with an
 * `X-Api-Key` header, and the obvious way to send one from a Next.js app -
 * reading `NEXT_PUBLIC_BOOSTBOX_API_KEY` in the component that boosts - does
 * not work the way it looks. Next.js inlines every `NEXT_PUBLIC_*` value into
 * the browser bundle at build time, so the key is served to everybody who
 * loads the page, and anybody who reads it can write boosts under your name
 * for as long as it stays valid.
 *
 * A live Podcasting 2.0 site does exactly that today. This is the shape that
 * does not: the browser calls this route, the route holds the key.
 *
 * `BOOSTBOX_API_KEY` and `BOOSTBOX_URL` must NOT carry the `NEXT_PUBLIC_`
 * prefix. If you add it to make an import error go away, you have put the key
 * back in the bundle.
 */

/** Never on the edge runtime: this route reads a server-only secret. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REQUEST_TIMEOUT_MS = 10_000;

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

/**
 * Copy across only the fields BoostBox documents.
 *
 * A route that forwards whatever it was handed is a way to send arbitrary
 * bodies to another service using your credentials. Allow-listing the fields
 * is what keeps this a boost submitter rather than a proxy.
 */
function sanitise(body: Record<string, unknown>): BoostboxSubmission | string {
  for (const field of BOOSTBOX_REQUIRED_FIELDS) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      return `Missing required field: ${field}`;
    }
  }

  const action = body.action;
  if (action !== 'boost' && action !== 'stream') {
    return "action must be 'boost' or 'stream'";
  }

  const split = Number(body.split);
  const valueMsat = Number(body.value_msat);
  const valueMsatTotal = Number(body.value_msat_total);
  if (!Number.isFinite(split) || split < 0) return 'split must be a number of at least 0';
  if (!Number.isInteger(valueMsat) || valueMsat < 1) return 'value_msat must be a whole number of at least 1';
  if (!Number.isInteger(valueMsatTotal) || valueMsatTotal < 1) {
    return 'value_msat_total must be a whole number of at least 1';
  }
  if (typeof body.timestamp !== 'string' || Number.isNaN(Date.parse(body.timestamp))) {
    return 'timestamp must be an ISO-8601 string';
  }

  const extras: Record<string, string | number> = {};
  for (const field of BOOSTBOX_OPTIONAL_FIELDS) {
    const value = body[field];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'string') {
      // Bounded so one caller cannot walk the service into its 413.
      extras[field] = value.slice(0, 4096);
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      extras[field] = value;
    }
  }

  return {
    action,
    split,
    value_msat: valueMsat,
    value_msat_total: valueMsatTotal,
    timestamp: body.timestamp,
    ...extras,
  };
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.BOOSTBOX_API_KEY;
  const baseUrl = process.env.BOOSTBOX_URL;

  if (!apiKey || !baseUrl) {
    // Deliberately vague to the caller, specific in the log. Which of the two
    // is missing is a fact about your deployment, not the browser's business.
    console.error('BoostBox is not configured: set BOOSTBOX_API_KEY and BOOSTBOX_URL');
    return Response.json({ error: 'BoostBox is not configured' }, { status: 503 });
  }

  // The upstream default key ships with BoostBox itself. Anyone who knows the
  // project knows it, so a deployment still using it is an open write endpoint.
  if (apiKey === 'v4v4me') {
    console.error('BOOSTBOX_API_KEY is still the BoostBox default; set a real key');
    return Response.json({ error: 'BoostBox is not configured' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Body is not valid JSON');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return badRequest('Body must be a JSON object');
  }

  const submission = sanitise(body as Record<string, unknown>);
  if (typeof submission === 'string') return badRequest(submission);

  // The target is your configured host, never anything out of the request.
  const target = new URL('/boost', baseUrl);
  if (target.protocol !== 'https:' && target.hostname !== 'localhost') {
    console.error('BOOSTBOX_URL must use https outside local development');
    return Response.json({ error: 'BoostBox is not configured' }, { status: 503 });
  }

  try {
    const upstream = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
      body: JSON.stringify(submission),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'error',
    });

    if (!upstream.ok) {
      // Pass the status through so a caller can tell 400 from 413, but never
      // the body: an upstream error message is not yours to relay verbatim.
      console.error(`BoostBox returned ${upstream.status}`);
      return Response.json({ error: `BoostBox returned ${upstream.status}` }, { status: 502 });
    }

    const receipt = (await upstream.json()) as BoostboxReceipt;
    return Response.json(receipt, { status: 201 });
  } catch (error) {
    console.error('BoostBox request failed:', error instanceof Error ? error.message : 'unknown');
    return Response.json({ error: 'BoostBox request failed' }, { status: 502 });
  }
}
