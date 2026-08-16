# PC20-Nostr

Two things, both reference material for building Podcasting 2.0 apps.

## [pc20-favorites.md](pc20-favorites.md) — the spec

An app-neutral format for syncing a user's podcast and music favorites
between Podcasting 2.0 apps over Nostr, as a single replaceable event at kind
**10333**.

The audience is an implementer of a *third* app who has only this document.
It is authored, not extracted — every rule began as a design decision, and
the two shipping implementations are days old, so read it as a proposal with
live failure modes behind it rather than as settled practice.

Kind 10333 is **self-assigned, not NIP-allocated**. Relay filters are
kind-scoped, so a later NIP landing on the same number would put two
unrelated event types into every query either app makes. Confirm there is
still no collision before depending on it.

[nostrhub-io-submission.md](nostrhub-io-submission.md) is the submission note
for that spec.

## [catalog/](catalog/) — the feature catalog

Canonical implementations of features that appear in more than one of
ChadFarrow's sites, with the code beside the prose.

It exists because the sites are not independent codebases. They are a handful
of codebases forked repeatedly, and the copies no longer agree: **26 files
are byte-identical across three or more repos, and 65 more sit at the same
path in three or more repos and have diverged.** Six repos carry six
different versions of `contexts/AudioContext.tsx`.

So "how do we resolve a Lightning address?" has four answers in four repos,
and three of them are missing LUD-12. The catalog records which one is right
and what the others are missing.

Start at [catalog/README.md](catalog/README.md).

## How the two halves relate

The spec says what the wire format is. The catalog says which code
implements it correctly today, and where each app falls short.

[catalog/nostr/favorites-10333.md](catalog/nostr/favorites-10333.md) is the
join between them, and
[catalog/nostr/trustworthy-read.md](catalog/nostr/trustworthy-read.md) is the
definition of "trust" that the spec's
[Merging](pc20-favorites.md#merging) rules depend on.

## Working in here

The implementation repos under `~/Vibe` are **sources to read, never targets
to change**. Read them as much as a claim requires; what comes back lands
here as spec text or a catalog entry, never as a patch over there.

Read them through `origin/HEAD`, not the local checkout — when this catalog
was built, 9 of 15 clones were behind their remote and two were not on their
default branch. Never `git pull` in one; `musicL-playlist-updater` has
thousands of uncommitted files in it.

```bash
git -C ~/Vibe/<repo> fetch origin --quiet
git -C ~/Vibe/<repo> show origin/HEAD:<path>
./catalog/check-drift.sh            # is every extracted file still current?
```

See [CLAUDE.md](CLAUDE.md) for the full conventions.
