# Recipes

**If you saw something on one of these sites and want it in your own app,
this is the section to point your coding agent at.**

Each recipe is a directory holding the working code, a manifest describing
what it needs, and a README explaining how to install it and what will break
if you skip a step. The code is byte-identical to what is running in
production — not a tidied-up illustration of it.

## Available now

| Recipe | Tier | Files | Install | Seen on |
|---|---|---|---|---|
| [pc20-feed-validator](pc20-feed-validator/) | drop-in | 1 | nothing | [itdv.podtards.com/feed-validator](https://itdv.podtards.com/feed-validator) |
| [pwa-install-prompt](pwa-install-prompt/) | drop-in | 2 | nothing | [itdv.podtards.com](https://itdv.podtards.com) |

## One recipe has been withdrawn

There was an **image proxy** here. A security review of this repo found three
bypasses in the SSRF guard the recipe was built around — the guard did not do
what its README said it did. It was removed rather than annotated, because its
entire value was the safety it did not provide.

What was wrong, and what a correct guard needs:
[`../comparisons/image-proxy-ssrf.md`](../comparisons/image-proxy-ssrf.md).

## Tiers, so you know what you're agreeing to

- **drop-in** — one or two files, no packages to install. Copy, rename the
  handful of constants the README names, done.
- **wired** — needs packages, environment variables and usually a React
  provider or an API route. Still mechanical, but there are steps to miss.
- **not-portable** — documented but not shipped, because the honest file count
  makes copying a worse idea than reading. The now-playing bar pulls **20
  files and 7,438 lines**; a recipe claiming otherwise would waste more of
  your time than no recipe at all.

## For an agent

Read `<recipe>/feature.json`. It is the machine-readable half and carries
everything needed to install without parsing prose:

| Field | Use |
|---|---|
| `tier` | `drop-in` \| `wired` \| `not-portable` |
| `files[]` | `{from, to}` — `to` is the path in the target repo |
| `dependencies` | npm packages to install; `{}` means none |
| `peer` | framework versions assumed |
| `env` | environment variables to set |
| `rename` | **app-specific constants that must be changed**, with file and line |
| `caveats` | what breaks, and the non-obvious prerequisites |
| `source` | repo, ref and commit the code was taken from |

**Do not skip `rename`.** These files come from real sites, so they carry
real app names. Copying `pwa-install-prompt` unchanged offers your users an
app called DoerfelVerse.

## What these recipes are held to

`../check-recipes.sh` enforces all of it, and `--network` also confirms every
"seen on" link still answers:

1. Code comes only from one of the five live sites. A recipe promises the
   feature already works somewhere, and code that has never served real
   traffic cannot make that promise.
2. Every file a recipe lists exists, and every file on disk is listed.
3. No `@/…` import goes unshipped. An unshipped import is the difference
   between "just add it" and an import error in your repo.
4. No recipe references a secret in a `NEXT_PUBLIC_` variable — those are
   bundled into public JavaScript.
5. Every app-specific constant appears in `rename`.
6. No recipe links to a dead or superseded URL.

## Related

- [`../modules/`](../modules/) — shared source used across features, extracted
  the same way.
- [`../comparisons/`](../comparisons/) — why each canonical copy won. Written
  for the maintainer, not for you.
- [`../analysis/`](../analysis/) — the scripts that produced every number here.
