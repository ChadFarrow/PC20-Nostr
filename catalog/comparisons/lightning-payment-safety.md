# Lightning payment safety — what the shipped modules do not check

The Lightning modules in [`../modules/lightning/`](../modules/lightning/) are
reference code, extracted byte-identical from DoerfelVerse. A security review
of this repo found three issues in them. They are recorded here rather than
patched, because an extracted file that diverges from the running site stops
being evidence of anything.

**These are live on the site, not only in the catalog.** The first one can
cost real money.

Read at `ITDV-Lightning` `origin/main` `4bc69b2`.

## 1. A hostile Lightning address can charge any amount

`lnurl-service.ts` never decodes the invoice it returns. The only check is
that the field is present:

```ts
const data = await response.json();
if (!data.pr) {
  throw new Error('Invalid invoice response: missing pr field');
}
return data.pr;
```

The bounds check earlier in the function validates the **request** against
`minSendable`/`maxSendable` — values supplied by the same remote server — and
says nothing about the response.

`nwc-service.ts` then hands it straight to the wallet:

```ts
const invoice = await LNURLService.getPaymentInvoice(lnAddress, amountMillisats, comment);
console.log(`💳 NWC got invoice for ${lnAddress}, paying via NWC`);
return await this.payInvoice(invoice);
```

NWC `pay_invoice` pays what the **invoice** says, not what the app asked for.

### The attack

A Lightning address is not something the user vets — it arrives in a
`<podcast:value>` block in someone else's RSS feed, or in a Nostr profile. The
attacker controls that endpoint.

1. User taps boost for 100 sats.
2. App requests an invoice for 100,000 msat.
3. Attacker's callback returns a bolt11 for **5,000,000 sats**.
4. `payInvoice` pays it. Nothing in this path shows the user the invoice
   amount before it settles.

The same gap lets a hostile server return an invoice payable to a different
node than the named recipient, because nothing binds the invoice to the
metadata that described it — so a value-split recipient can be silently
substituted.

### The fix

Decode before paying, and treat the decoded amount as the truth. Add
`light-bolt11-decoder`, then in `lnurl-service.ts` replace each bare
`return data.pr` with a checked return:

```ts
import { decode } from 'light-bolt11-decoder';

/**
 * Never hand a wallet an invoice we have not read.
 *
 * The amount is set by the remote LNURL server, which for a Lightning address
 * out of a podcast feed is a stranger. `pay_invoice` pays what the invoice
 * says, so an unchecked one is the server naming its own price — and the user
 * approved a different number.
 */
function assertInvoiceMatches(pr: string, expectedMsat: number): string {
  const decoded = decode(pr);

  const amountSection = decoded.sections.find((s: any) => s.name === 'amount');
  const invoiceMsat = amountSection ? Number(amountSection.value) : NaN;
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
  const timestamp = decoded.sections.find((s: any) => s.name === 'timestamp')?.value;
  const expiry = decoded.sections.find((s: any) => s.name === 'expiry')?.value ?? 3600;
  if (timestamp && Date.now() / 1000 > Number(timestamp) + Number(expiry)) {
    throw new Error('Invoice has expired');
  }

  return pr;
}
```

and call it at both sites:

```ts
if (!data.pr) {
  throw new Error('Invalid invoice response: missing pr field');
}
return assertInvoiceMatches(data.pr, amountMillisats);
```

Two things to add alongside it:

- **Show the decoded amount, not the requested one**, in any confirmation UI.
  The decoded value is the only number that describes what will actually be
  spent.
- **LUD-06 description hash.** A complete implementation also checks the
  invoice's `purpose_commit_hash` equals `sha256(metadata.metadata)` from the
  LNURL response. That is what binds the invoice to the metadata describing
  the payee, and it is what closes the recipient-substitution half. The amount
  check above is the urgent part; this is the correct part.

## 2. Three SSRF sinks in the same file

- **The bech32 branch enforces no scheme.** LUD-01 requires `https:` (or
  `.onion` over http). The decoded payload is fetched verbatim, so an `lnurl1…`
  string decoding to `http://169.254.169.254/…` or `http://127.0.0.1:8500/…`
  is fetched as-is.
- **The address branch does not validate the domain.** `x@127.0.0.1:8500` and
  `x@metadata.internal` both produce a request to an internal host. The
  username half is interpolated without escaping, so `../` in it walks the
  path and a `?` rewrites the query.
- **The remote `callback` is trusted blindly.** Only its presence is checked,
  so a compromised LNURL server returns a callback pointing at your own
  internal network and gets a second-hop request from your infrastructure —
  with the zap request attached as a query parameter.

This matters more than it looks because the module has no browser-only guard,
and the realistic deployment is a Next.js server route.

**Fix:** enforce `https:` on both the decoded LNURL and `metadata.callback`;
reject private, loopback and link-local hosts after resolution;
`encodeURIComponent` the username; require the domain to be a bare registrable
hostname.

## 3. `verifyZapReceipt` does not verify anything

`zap-receipt-service.ts` exposes a function whose name promises validation and
which returns `true` after checking only that some tags exist and two pubkeys
match. Missing, all required by NIP-57:

- no `verifyEvent` on the receipt **or** on the kind-9734 embedded in
  `description`, so the reported sender is a self-declared pubkey
- no check that the receipt's author is the recipient's LNURL `nostrPubkey` —
  the module parses `allowsNostr`/`nostrPubkey` elsewhere and never consults
  it here, so any pubkey on any relay can mint a receipt
- the `bolt11` tag is stored and never decoded, so the amount is never checked
- the `preimage` — the one field that is actual proof of payment — is stored
  at line 120 and never hashed against the invoice's payment hash

The amount reported to callers is read from the *request* inside `description`
rather than from the invoice, and `parseInt` on a non-numeric value yields
`NaN`, which poisons any total computed by summing receipts.

Anything gating supporter perks, leaderboards or paid content on this returns
access for zero sats.

**Fix:** `verifyEvent` on both events; require
`receipt.pubkey === nostrPubkey` from the recipient's own LNURL metadata;
take the amount from the decoded `bolt11`; where a preimage is present check
`sha256(preimage) === payment_hash`; guard every `parseInt` with
`Number.isFinite`. Until then, rename it — a caller reading
`if (verifyZapReceipt(e))` reasonably believes something was verified.

## 4. Secret material reaches the console

- `nwc-service.ts` logs the first 10 hex characters of the NWC client secret —
  40 bits of a **spending key** — beside the relay URL and wallet pubkey
  needed to use it. Truncation is obfuscation, not redaction.
- `nwc-service.ts` and `webln-service.ts` both log the raw wallet response,
  which carries `preimage`. A preimage is bearer proof-of-payment: L402-style
  paywalls and receipt verifiers accept it as evidence the presenter paid.

Both land in the browser console, readable by any extension with host access
and by any console-capturing telemetry (Sentry, LogRocket).

**Fix:** log presence, not values — `{ ok: !response.error, code: response.error?.code }`.
Never log key material or a preimage, at any length, and put the rest behind a
debug flag that is off by default.

## Not affected

`read-trust.ts` and `favorites-list.ts` were reviewed and are clean: genuinely
import-free, no network or storage, and all untrusted relay data flows into
`Map`/`Set`/array structures rather than computed object keys, so there is no
prototype-pollution surface. `podcast-index-auth.ts` is clean — the secret is
consumed inside the digest and never returned in a header.

One note for third-party copiers of `podcast-index-auth.ts`: it must stay
server-side. Under Next.js the non-`NEXT_PUBLIC_` vars are `undefined` in a
client bundle and `getAuthHeaders()` safely returns `null`, but a bundler that
inlines the whole environment (Vite `define`, CRA `REACT_APP_*`) would ship
the API secret to browsers. `import 'server-only'` turns that into a build
error.
