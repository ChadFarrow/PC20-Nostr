# Dependency drift across the five sites

Read from each repo's `package-lock.json` — the lockfile, not the manifest,
because the declared range and the installed version differ in ways that
matter here.

`ITDV-Lightning@4bc69b2` · `boostmebitch@1f26ba0` · `stablekraft-app@22298c5f`
· `MSP-2.0@c294548` · `candr.space@21da719`.

## The landmine: DoerfelVerse cannot take any `nostr-tools` update

It declares `"nostr-tools": "^2.16.2"`. That range permits **2.17.0 through
2.24.2, every one of which breaks it.**

```
2.16.2  subscribeMany(relays: string[], filters: Filter[], params)
2.17.0  subscribeMany(relays: string[], filter: Filter,    params)   <- breaks here
2.24.2  subscribeMany(relays: string[], filter: Filter,    params)
```

Two call sites pass the filter in an array:

- `ITDV-Lightning/lib/nwc-service.ts:277` — the NWC response listener, i.e.
  the payments path
- `ITDV-Lightning/lib/boost-to-nostr-service.ts:992`

Only the lockfile pin at 2.16.2 keeps the site building. A fresh
`npm install` resolves higher, and since `next.config.js` sets no
`typescript.ignoreBuildErrors`, the build fails hard rather than degrading.

And if it ever *did* run, 2.24.2's `subscribeMany` forwards its second argument
straight to `subscribe`, so the array becomes a malformed `REQ` and the
subscription silently never fires.

**Cheapest correct move:** change the manifest to `"2.16.2"` exact today. That
converts a latent build-breaker into a documented pin, one line, zero risk.
Then fix the two call sites and move to 2.24.2 when convenient — that unblocks
eight releases of relay-handling fixes.

The other sites are clear: Boost Me Bitch and MSP 2.0 already use the
post-2.17 form, and StableKraft uses `querySync` and per-relay
`relay.subscribe([filter])`, whose array signature is unchanged.

Boost Me Bitch is the inverse case — pinned at an exact `2.19.4` while its
source is already forward-compatible. It could take 2.24.2 whenever.

## Shared advisory: all three Next sites are below the security floor

| Site | Next version | Declared |
|---|---|---|
| DoerfelVerse | **15.4.8** | `15.4.8` (exact) |
| Boost Me Bitch | **15.5.20** | `^15.1.6` |
| Project StableKraft | **15.5.19** | `^15.5.9` |

The floor is **15.5.21**; latest 15.x is 15.5.23. The advisories below it
include middleware/proxy bypass and SSRF in Server Actions.

Boost Me Bitch and StableKraft declare caret ranges, so an update fixes them
without touching the manifest. DoerfelVerse pins exactly and needs a manifest
edit.

**Stay on 15.x.** 16.3.1 is a major.

## The easy win: DoerfelVerse's worst dependencies are ones it never imports

It carries far more advisories than any other site, and most come from
packages with **zero import sites** — verified by grep across the repo:

| Package | Import sites | Notes |
|---|---|---|
| `axios` | **0** | 11 high advisories, incl. full MitM via `config.proxy` prototype pollution |
| `xmldom` | **0** | 1 critical + 5 high; deprecated, **no fix will ever ship** |
| `date-fns` | **0** | 40 months old |
| `rss-parser` | **0** | |
| `xml2js` | **0** | |

`axios` and `xmldom` alone account for 17 high/critical findings and nothing
imports either. Deleting those lines from `package.json` is the highest-value,
lowest-risk change available.

Do not confuse `xmldom` with **`@xmldom/xmldom`**, which *is* used
(`lib/rss-parser.ts`) and should go 0.9.8 → 0.9.11 — 5 high, patch-level, and
the existing `^0.9.8` range already permits it.

Also worth taking:

- `fast-xml-parser` → 5.11.0 (2 critical). Mild behavioural risk: 5.5.6+ added
  entity-expansion limits, so smoke-test feed ingest.
- MSP 2.0's `@vercel/blob` 2.0.0 → 2.8.0. Its only three advisories come from
  `undici@5.28.4`, and there is no fix in the 5.x line — 2.8.0 moves to
  undici 6.
- StableKraft's `axios` 1.17.0 → 1.19.0. Unlike DoerfelVerse's, this one is
  genuinely used.

## Version spread worth knowing

| Package | Oldest | Newest | Latest |
|---|---|---|---|
| `nostr-tools` | DoerfelVerse 2.16.2 | StableKraft 2.23.1 | 2.24.2 |
| `react` | DoerfelVerse / StableKraft **18.3.1** | Boost Me Bitch / MSP 19.2.x | 19.2.8 |
| `eslint` | DoerfelVerse / StableKraft **8.57.1** (EOL) | Boost Me Bitch / MSP 9.39.x | — |
| `@getalby/sdk` | DoerfelVerse 5.1.2 | StableKraft 6.0.2 | 8.0.3 |

React 18.3.1 is 28 months old, and you are maintaining two React majors across
four sites.

One live inconsistency: StableKraft pins `prisma` at `6.16.2` exactly but
`@prisma/client` at `^6.16.2`, which has resolved to 6.19.2. Prisma requires
the CLI and client on the same version, so `prisma generate` runs from 6.16.2
against a 6.19.2 client. Pin both or caret both.

## Sequencing that matters

`@getalby/bitcoin-connect` 3.10.0 → 3.12.3 on DoerfelVerse pulls
`@getalby/sdk ^8.0.3`, which itself requires `nostr-tools ^2.23.3`. **Do the
`subscribeMany` fix first**, or that upgrade either fails or installs a second
copy of `nostr-tools`.

## Do not update

None of these is security-driven, and each is a major:

- `next` → 16.x — stay on 15.5.23
- `typescript` → 7.x
- `react` → 19 on DoerfelVerse and StableKraft — schedule it deliberately,
  do not fold it into a security pass
- `tailwindcss` → 4.x — a config and engine rewrite; do all three Next sites
  together or none
- `eslint` → 10.x, `@noble/*` → 2.x on candr.space, `prisma` → 7.x

Two more that need a plan rather than a bump: `next-pwa` 5.6.0 is 48 months
old and unmaintained, and `@vercel/postgres` is deprecated upstream in favour
of `@neondatabase/serverless`.

## Clean

`candr.space` has two production dependencies and **zero advisories**. It is
also the only site that pins `@noble/curves` exactly — worth keeping, since v2
removed the extensionless `secp256k1` subpath its `worker/auth.js` imports. A
safe bump inside v1 is 1.9.1 → 1.9.7.
