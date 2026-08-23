# Lightning wallet payments

Connect a Lightning wallet from the browser and send a payment: to a Lightning
address, to a bolt11 invoice, or by keysend straight to a node.

Two transports, because wallets support different ones:

- **WebLN** — an extension wallet already in the page (`window.webln`). No
  configuration; the user approves each payment in the extension.
- **Nostr Wallet Connect (NIP-47)** — a `nostr+walletconnect://` string the
  user pastes once. Works on mobile, where there is no extension, and is the
  only one of the two that can send keysend.

## Read this before you copy anything

**These files are patched, not byte-identical to the site they came from.**
Every other recipe here ships exactly what production runs. This one does not,
and the difference is deliberate: a security review found four issues in this
code, one of which lets a stranger charge your users an arbitrary amount. The
site still has them.

The fixes shipped here are listed per file in `feature.json` under `fixes`, and
explained in
[`../../comparisons/lightning-payment-safety.md`](../../comparisons/lightning-payment-safety.md).
The one that matters most:

> A Lightning address is not something the user vets — it arrives in a
> `<podcast:value>` block in someone else's RSS feed. The unfixed code asks
> that endpoint for an invoice worth 100 sats, never reads the invoice that
> comes back, and hands it to the wallet. `pay_invoice` pays what the
> **invoice** says. A 5,000,000-sat bolt11 settles with nothing on screen.

`lnurl-service.ts` now decodes every invoice and refuses one whose amount is
not the amount you asked for.

**Do not diff these files against the live site and "fix" the difference.**
The difference is the point.

## Install

```bash
npm i bech32 nostr-tools@2.16.2 light-bolt11-decoder
```

Copy the five files to the paths in `feature.json`. They must stay siblings —
`nwc-service.ts` imports `./lnurl-service` at runtime, and `@/lib/safe-storage`
at build time.

| From | To |
|---|---|
| `files/webln-service.ts` | `lib/webln-service.ts` |
| `files/lnurl-service.ts` | `lib/lnurl-service.ts` |
| `files/nwc-service.ts` | `lib/nwc-service.ts` |
| `files/safe-storage.ts` | `lib/safe-storage.ts` |
| `files/node-host-resolver.ts` | `lib/node-host-resolver.ts` |

Nothing to rename. These files carry no app name and read no environment
variable.

### On the server, wire up the resolver first

```ts
import { setHostResolver } from '@/lib/lnurl-service';
import { nodeHostResolver } from '@/lib/node-host-resolver';

setHostResolver(nodeHostResolver);
```

Do this once where your server starts — a route handler module, or
`instrumentation.ts` under Next.js. **Until you do, server-side calls throw.**

That is on purpose. A Lightning address names a hostname, and a hostname is
only half-checked without DNS: `evil.example.com` can have an A record of
`169.254.169.254`, and on a server that request leaves your infrastructure
rather than a user's laptop. Failing closed is what stops the gap reaching
production via someone who never read this paragraph. In a browser no resolver
is needed and none is asked for.

## Use

```ts
import { WebLNService } from '@/lib/webln-service';
import { getNWCService } from '@/lib/nwc-service';

// Extension wallet
if (WebLNService.isAvailable()) {
  await WebLNService.enable();
  await WebLNService.payInvoice(bolt11);
}

// NWC: the user pastes nostr+walletconnect://... once
const nwc = getNWCService();
await nwc.connect(connectionString);
await nwc.payLightningAddress('someone@getalby.com', 100);   // sats
await nwc.payKeysend(destinationPubkey, 100, tlvRecords);    // sats
```

`payKeysend` is what carries a boostagram. Building the TLV records that ride
along with it is [`../boostagram-keysend/`](../boostagram-keysend/).

## Pin `nostr-tools` to exactly 2.16.2

Not a caret range. `nwc-service.ts` calls
`subscribeMany(relays, [filter], params)`, and the second parameter became a
bare `Filter` in **2.17.0**:

```
2.16.2  subscribeMany(relays: string[], filters: Filter[], params)
2.17.0  subscribeMany(relays: string[], filter: Filter,    params)   <- breaks here
```

From 2.17.0 the file stops compiling, and in 2.24.2 `subscribeMany` forwards
its second argument straight to `subscribe`, so the array becomes a malformed
`REQ` and the subscription **silently never fires**. That surfaces as every NWC
payment hanging rather than failing, which is a much worse afternoon than a
build error.

## What this still does not do

Named because a recipe that lets you move money should not be vague about its
edges.

- **The invoice guard checks the amount, not the payee.** LUD-06
  description-hash binding — confirming the invoice's `purpose_commit_hash`
  equals `sha256` of the LNURL metadata — is what stops a hostile server
  substituting a different recipient inside a value split. Not implemented.
- **DNS rebinding is still open.** The guard resolves the hostname and `fetch`
  resolves it again; a record that changes in between defeats the check.
  Closing it means pinning the socket to the address that was checked, which is
  an agent-level concern. Put an egress policy in front of the process if you
  handle untrusted Lightning addresses at scale.
- **No LUD-12 comment negotiation.** A comment is appended with no check that
  the endpoint accepts one and no length check, so an endpoint advertising
  `commentAllowed: 0` rejects the whole callback and the payment fails with
  nothing on screen saying why.
- **No NWC relay keepalive.** A wallet relay that drops idle sockets leaves a
  connection that looks live and is not — again a hang rather than an error.
- **Zap receipts are not here.** `zap-receipt-service.ts` stays in
  [`../../modules/lightning/`](../../modules/lightning/), because its
  `verifyZapReceipt` returns `true` after checking almost nothing. Anything
  gating supporter perks or paid content on it grants access for zero sats.
