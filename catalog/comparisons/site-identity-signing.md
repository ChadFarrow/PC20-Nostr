# Signing as the site's own Nostr identity

Giving a site its own Nostr keypair, so it can publish events itself — a boost
note for a signed-out visitor, a NIP-05 identity, a kind 0 profile. The site
becomes a participant rather than only a viewer.

It is a good pattern and both DoerfelVerse and Boost Me Bitch use it. It also
puts a private key inside a web app, which is the part that needs care.

## Where it lives

| Site | Repo | Files | Read at |
|---|---|---|---|
| DoerfelVerse | `ITDV-Lightning` | `app/api/nostr/publish/route.ts` | `4bc69b2` |
| Boost Me Bitch | `boostmebitch` | `app/api/nostr/site-sign/route.ts`, `lib/nostr/site-key.ts` | `1f26ba0` |

Not shipped as a recipe: both routes import their own app's services, so
neither drops in. Read them in place.

## Rule 1 — the key never gets a `NEXT_PUBLIC_` name

Next.js inlines every `NEXT_PUBLIC_*` value into the browser bundle at build
time. A signing key with that prefix is handed to every visitor, and minified
JavaScript is not a hiding place — it is a text file.

Both sites keep it server-only: `SITE_NOSTR_NSEC` in DoerfelVerse,
`SITE_NOSTR_SK` in Boost Me Bitch (which accepts nsec or 64-char hex). Neither
value ever reaches the client.

DoerfelVerse's route documents the history in its own header — the key *used
to be* read from `NEXT_PUBLIC_SITE_NOSTR_NSEC`, and the comment records both
the exposure and why it mattered. Boost Me Bitch's `site-key.ts` opens with
`SERVER-ONLY … Never import this from client code`.

**This is the mistake with no recovery.** A leaked API key is rotated in a
minute. A Nostr identity cannot be rotated — the pubkey *is* the identity, so
a leak means abandoning the npub along with its NIP-05, its follower graph and
its history. Prevention is the whole strategy.

## Rule 2 — a signing endpoint is a signing oracle

Moving the key server-side stops it being *stolen*. It does not stop it being
*used*. Anything that will sign on request is an oracle, and the question
becomes: what is the worst event an attacker can make you sign?

Both sites constrain that, by different routes.

**DoerfelVerse builds the event itself.** The endpoint accepts boost fields,
validates each one, and constructs the note server-side — it never signs a
caller-supplied event. The comment says so directly: *"it builds the event
itself from validated boost fields rather than signing a caller-supplied
event, so it can only ever emit a boost note."* Fields are individually length
capped, amount is bounded, and nothing is spread from the request body into
the event, so unexpected keys cannot ride along.

**Boost Me Bitch validates a supplied template.** The client sends an unsigned
template and the route checks it before signing: `kind` must be 1, content
must start with the boost prefix, `created_at` must be within ±5 minutes, and
tags must pass an **allowlist** — `i`, `k`, `r`, `p`, `amount`, `client`, `t`
— with the two `t` markers required, at most 8 `p` tags, and per-tag and total
size caps.

Two of those are worth stealing outright regardless of which shape you copy:

- **Refusing `e` tags.** A boost note never has one, so refusing costs
  nothing. With one, a site-signed event appears to *reply* to any note in the
  world — a far better harassment vehicle than a standalone post. The route's
  comment makes exactly this argument.
- **Capping `p` tags at 8.** Without it, one unauthenticated POST becomes a
  mention-spam blast at 40 strangers from a NIP-05-verified identity.

That route is also honest about what its content check does *not* buy: the
prefix constrains ten characters, and the remaining 2,000 are still the
caller's text under the site's identity. As the comment puts it, arbitrary
text "is the feature, not a hole in it." Nothing regexes that away — which is
why the tag limits, the amplifier, are where the effort goes.

## What neither one does

**Neither authenticates the caller.** Both are open POST endpoints. The shape
constraints mean an attacker can only produce boost-shaped notes, and the rate
limits bound the volume, but the site's identity will still publish on demand
from anyone who finds the URL. That is a deliberate trade — the point is
serving signed-out visitors — but it is the residual risk, and it should be a
decision rather than an oversight.

**Neither rate limit is durable.** DoerfelVerse's is an in-process `Map`, and
its comment concedes the limit is per-instance and would need a shared store
to be robust across serverless instances. On a platform that scales to N
instances, a 10/minute cap is 10 × N.

**Neither verifies that a payment happened.** A boost note says someone sent
sats; nothing proves it. DoerfelVerse's amount bound is labelled *"a sanity
bound, not a payment check."* The site's identity is vouching for a claim it
has not checked.

## Hygiene, verified

Checked across all five live sites at `origin/HEAD`, and in the last 400
commits of each: **no nsec-shaped literal appears anywhere**, in any working
tree or any history. Every repo's `.gitignore` covers `.env`.

Two tracked env files in `ITDV-Lightning` (`.env.basic`, `.env.lightning`)
carry only public config — site name, site URL, a feature flag, the BoostBox
URL — and the one key-shaped entry is empty.

Worth re-running whenever a new site is added; a committed key is unrecoverable
in a way that a committed API key is not.

## If you are adding this to your own app

1. Server-only env var. Never `NEXT_PUBLIC_`, `VITE_` or `REACT_APP_`.
2. Decide what the key may sign, and enforce it in code — either build the
   event server-side, or validate a template against an allowlist. Never sign
   what you are handed.
3. Refuse `e` tags and cap `p` tags, whichever shape you chose.
4. Bound `created_at` skew so notes cannot be back- or post-dated.
5. Rate limit, and know whether your limiter is per-instance.
6. Return 503 when the key is unset, so the feature is simply off rather than
   half-working — both sites do this.
7. Set `dynamic = 'force-dynamic'` and `Cache-Control: no-store`. A cached
   signing response is a replayable signature.
8. Back the key up somewhere you control. There is no reset link.
