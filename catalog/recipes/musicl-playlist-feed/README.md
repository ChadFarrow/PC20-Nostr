# musicL playlist feed

Build a musicL playlist — an RSS feed whose entries are songs from other
feeds, each a `<podcast:remoteItem feedGuid itemGuid>` — and read the
remoteItems back out of any feed. Any Podcasting 2.0 app that plays musicL
plays the result, and each song's boosts go to that song's own artist.

**Running at** <https://stablekraft.app/playlist/maker> (Project StableKraft),
which publishes every playlist through it.

## Difficulty: drop-in

Two files, no packages, nothing to rename.

## What you get

| File | Put it at |
|---|---|
| `files/musicl-feed.ts` | `lib/playlist/musicl-feed.ts` |
| `files/musicl-guid.ts` | `lib/playlist/musicl-guid.ts` |

190 + 87 lines. `musicl-feed.ts` is the writer and the reader and imports
nothing, so it is safe in client code. `musicl-guid.ts` needs node's crypto for
the guid, so keep it on the server.

```ts
import { buildMinimalPlaylistXml, remoteItemTracks } from '@/lib/playlist/musicl-feed';
import { checkMinimalPlaylistIds } from '@/lib/playlist/musicl-guid';

const ids = checkMinimalPlaylistIds({ guid: stored.guid, playlistFeedUrl: 'https://you.example/playlists/rock.xml' });
if (!ids.ok) return badRequest(ids.field, ids.error);

const xml = buildMinimalPlaylistXml({
  guid: ids.guid,
  title: 'Rock', author: 'You', description: 'Ten songs', link: 'https://you.example/rock',
  imageUrl: 'https://you.example/rock.jpg',
  publisher: ids.publisher,                       // optional back-link to your publisher feed
  tracks: [{ feedGuid: '…', itemGuid: '…' }],
});

remoteItemTracks(someFeedXml);                    // [{ feedGuid, itemGuid, feedUrl?, medium?, title? }]
```

## What you need

Nothing to install. Node 18+ for `musicl-guid.ts`.

## The guid is the whole game

A playlist's `<podcast:guid>` is what Podcast Index, favorites lists and boosts
key on. Mint a new one per build and every build is a different feed: the
index lists it again, and a favorite or a boost made yesterday points at a
feed that no longer exists.

So the writer **refuses** a guid that is not a UUID, and `playlistGuid()` gives
you one of two stable answers: the guid you stored, or the one the
`podcast:guid` spec defines for the URL the playlist is hosted at (UUIDv5 of
the URL without its scheme). With neither it returns `null`, and you must
refuse rather than invent one. The spec's own example is pinned in the tests:
`mp3s.nashownotes.com/pc20rss.xml` → `917393e3-1b1e-5cef-ace4-edaa54e1f810`.

## What will bite you

**The XML changes on every build.** `pubDate` and `lastBuildDate` are the build
time. If you podping on change, compare the track list, not the bytes.

**`<language>en</language>` is fixed**, at `musicl-feed.ts` line 158.

**An incomplete track is dropped silently.** A track with no `feedGuid` or no
`itemGuid` is not written. Check your list before you build if you need to
know.

**The reader is a regex over the source text.** It finds every remoteItem in
the document, wherever it is — a podroll's included. `remoteItemTracks` keeps
only those with an `itemGuid`, which is what makes something a song. It reads
attributes by name, in any order, with either quote.

## Tests

`tests/musicl.test.ts`: the spec's guid example, the guid rules, escaping and
control characters, well-formed output, and read-back.

```bash
npm i -D tsx typescript fast-xml-parser   # fast-xml-parser only checks the output is well-formed
npx tsx tests/musicl.test.ts
```

## Provenance

`stablekraft-app` `origin/main` at `826bc612`, byte-identical. MIT. Rows in
[`../../PROVENANCE.tsv`](../../PROVENANCE.tsv). The source repo also carries a
91-line test of its own beside it.
