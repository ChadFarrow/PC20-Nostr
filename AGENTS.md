# AGENTS.md

You are probably here because someone asked you to add a Podcasting 2.0 or
Lightning feature to **their** app and pointed you at this repo. This file is
for you.

If instead you were asked to change **this** repo, read
[`CLAUDE.md`](CLAUDE.md): it holds the rules for maintaining it, and most of
them do not apply to a reader.

## Find the feature

Fetch one file:

```
https://raw.githubusercontent.com/ChadFarrow/PC20-Nostr/main/catalog/recipes/index.json
```

It lists every recipe with its tier, a one-line summary, its packages, its
environment variables, and where its manifest and README are. Each path in it
is relative to the repo root; prefix `raw_base` to fetch one.

| You want to | Recipe |
|---|---|
| read a Podcasting 2.0 RSS feed into typed data | `podcast-feed-parser` |
| fetch a user-supplied URL on a server without an SSRF hole | `safe-feed-fetch` |
| look a feed or episode up in Podcast Index | `podcast-index-client` |
| read a `podcast:chapters` file | `chapters-json` |
| write a musicL playlist feed | `musicl-playlist-feed` |
| check a feed's Podcasting 2.0 tags in a page | `pc20-feed-validator` |
| connect a Lightning wallet and pay | `lightning-wallet-payments` |
| send a boost with its metadata | `boostagram-keysend` on top of `lightning-wallet-payments` |
| store boost metadata behind a URL | `boostbox-client` on top of `lightning-wallet-payments` |
| offer "install as app" | `pwa-install-prompt` |

## Install one

1. Read `catalog/recipes/<name>/feature.json`. Its fields are described in
   [`catalog/recipes/README.md`](catalog/recipes/README.md#for-an-agent).
2. Read the recipe's `README.md`, all of it. The section on what will bite
   you is the part a quick install skips and a user pays for.
3. Copy each file in `files[]` from `from` to `to`, **byte for byte**. Change
   the folder prefix to fit the target app if you must, but keep the files'
   positions relative to each other: some import each other by relative path.
4. Install `dependencies`. Set every variable in `env`. A variable marked
   `server-only` must never get a `NEXT_PUBLIC_`, `VITE_` or `REACT_APP_`
   prefix: those are served to every visitor.
5. Apply every entry in `rename`. They are real app names, hosts and policies
   from the site the code came from, with the reason each one matters.
6. Run the recipe's `tests/`, if it has any (`npx tsx tests/<file>.ts`).
7. Tell your user every `caveat` that applies to their app.

## Rules that save your user

- **Copy first, change after, in a separate step.** A recipe file is
  byte-identical to code that serves real traffic (`extracted`), or to that
  code plus a named fix (`patched`). Change it while copying and
  nobody can tell your bug from the original. A file marked `authored` was
  written for this catalog and no site runs it; its README says so first.
- **Take `catalog/recipes/`, not `catalog/modules/`.** A module is evidence of
  what a site runs, known bugs included. The Lightning modules can be charged
  an arbitrary amount; the recipe fixes that.
- **Never fetch a user- or feed-supplied URL from a server with a plain
  `fetch`.** Use `safe-feed-fetch`.
- **A feed's ids are strings.** Never parse a guid, an `itemGuid` or a
  `customValue` as a number: `0012345` and `12345` are different payment
  targets.

## The specs

Two draft specs live at the root:
[`pc20-favorites.md`](pc20-favorites.md) (kind 10333, sharing favorites
between apps over Nostr) and
[`nip-value-playback-events.md`](nip-value-playback-events.md). Implement
against those two only; the other documents explain them and define nothing.
`conformance/` runs the favorites spec's 31 test vectors against your code.
Terms: [`GLOSSARY.md`](GLOSSARY.md).

## License

MIT. See [`LICENSE`](LICENSE).
