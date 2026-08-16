# WebLN client

Detects a WebLN provider (an Alby-style browser extension), enables it, and
sends payments and keysends through it.

This is the easiest entry in the catalog: four repos ship it and all four
ship the **same bytes**. There is no divergence to reconcile and no judgement
to make about which copy is right.

## Where it lives today

| Repo | Path | State | Read at |
|---|---|---|---|
| `ITDV-Lightning` | `lib/webln-service.ts` | **shipped** (arbitrary — all four identical) | `4bc69b2` |
| `NMNU` *(test site)* | `lib/webln-service.ts` | identical copy, md5 `9737d315` | `2b9a78f` |
| `TRM-Lightning` *(test site)* | `lib/webln-service.ts` | identical copy, md5 `9737d315` | `0a0fff8` |
| `lnaddress-music` *(test site)* | `lib/webln-service.ts` | identical copy, md5 `9737d315` | `c16f68b` |
| `stablekraft-app` | — | **absent** | `db2eb22f` |

All four are md5 `9737d315a9d7fd3aaf555e07c1834ab8`, 177 lines, verified at
`origin/HEAD` rather than in a local checkout.

## What ships

[`webln-service.ts`](../modules/lightning/webln-service.ts) — zero imports. It typechecks under
`strict` with nothing installed at all, which makes it the cheapest thing in
here to adopt.

`ITDV-Lightning` is named as the source only because the manifest needs one
repo in the row. Any of the four would have produced the same file.

## How each site diverges

They don't. That is the finding.

**`stablekraft-app` does not have this file.** It depends on `webln` and
`@getalby/bitcoin-connect` directly and reaches for the provider through
Bitcoin Connect instead. So "all the Lightning sites share a WebLN service"
would be wrong — four of the five do, and the biggest one doesn't.

## Known gaps

- Untested. No repo has a test for this file, so "identical in four places"
  means four copies of the same unverified behaviour, not four confirmations.
- Because it is identical everywhere, nothing here tells you whether it is
  *good* — only that it is consistent. The first bug found in it is a bug in
  four sites at once.
