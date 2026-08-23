import { promises as dns } from 'node:dns';

import type { HostResolver } from './lnurl-service';

/**
 * DNS resolution for `lnurl-service`, for server-side use.
 *
 * Kept in its own file so `lnurl-service.ts` stays importable in a browser: a
 * bundler that follows a top-level `node:dns` import into client code fails
 * the build.
 *
 * Wire it up once, wherever your server starts - a route handler module, or
 * `instrumentation.ts` under Next.js:
 *
 *     import { setHostResolver } from './lnurl-service';
 *     import { nodeHostResolver } from './node-host-resolver';
 *     setHostResolver(nodeHostResolver);
 *
 * Until you do, `lnurl-service` refuses to make server-side requests rather
 * than making unchecked ones.
 */
export const nodeHostResolver: HostResolver = async (hostname) => {
  // `all` matters: a hostname with several A records is only as safe as its
  // worst one, and returning the first would let an attacker hide a private
  // address behind a public one.
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  return records.map((r) => r.address);
};

/**
 * What this does not close.
 *
 * The address is resolved here and resolved again by `fetch`, so a DNS record
 * whose TTL expires in between can answer differently the second time - a
 * rebinding attack. Closing that needs the socket pinned to the address that
 * was checked, which is an agent-level concern rather than something this
 * function can do. If you are handling untrusted Lightning addresses at scale,
 * put an egress proxy or a network policy in front of the process as well.
 */
