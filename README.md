# PC20-Nostr

Specs for connecting [Podcasting 2.0](https://podcasting2.org) apps to each
other over [Nostr](https://nostr.com) — shared, app-neutral formats any client
can implement, so a feature works the same way no matter which app someone
happens to be using.

## Specs

- [**Cross-app podcast favorites**](specs/pc20-favorites.md) — one shared
  NIP-78 list of favorites any podcast app can read and write, so favoriting a
  show in one app makes it favorited in every other app the same person signs
  into. Implemented by [Boost Me Bitch](https://github.com/ChadFarrow/boostmebitch)
  and [StableKraft](https://github.com/ChadFarrow/stablekraft-app).

## Why a separate repo

These specs are meant to be implementable by any app, not just the ones that
happened to build them first. Keeping them here — rather than inside one of
the participating apps' own repos — means there's one canonical copy to link
to, version, and open issues/PRs against, instead of several copies that can
silently drift apart.
