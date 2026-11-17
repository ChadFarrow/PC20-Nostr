# Boost Notes

`draft` — written 2026-11-16 for review. **No app writes this yet**, and
nothing here is settled until that review says so.

One sentence says what a boost paid for and where the listener found it, in
every app that writes about a boost:

```
rev.hodl boosted 121 sats to Sing For You by The Doerfels from ITDV music playlist
```

Eight of ChadFarrow's repos have code that writes a boost up, in five
layouts. In four of them, a boost to a song is written as a boost to the show
or the playlist that holds it. What each one writes is in
[the survey](notes/pc20-boost-notes-survey.md). This document is the format
they would share instead.

This document is rules. The reasons are in
[the rationale](notes/pc20-boost-notes-rationale.md), and every rule links its
own with a `(why)`. Every **MUST** is a claim about bytes another app can
check.

## Words used here

- **The message** — what the listener typed: the boostagram's `message`.
- **The sentence** — the one line the app writes about the boost.
- **The note** — the kind `1` Nostr event that carries both.
- **A sender** — an app the listener boosts from, which posts its own note.
  **A receiver** — a bot that posts the boosts a node received, under its own
  key.
- **A leg** — one payment of a boost that a value block splits across
  several recipients.

## The sentence

```
<who> boosted <N> sats to <what>[ by <artist>][ from <where>][ via <app>]
```

1. **`<who>` is the boostagram's `sender_name`** — the same string the
   payment carried, cleaned as rule 8 says. With no name, the sentence starts
   `Boosted <N> sats`. Do not make one up for the note alone (`Someone`).
   ([why](notes/pc20-boost-notes-rationale.md#who))

2. **`<N>` is the amount the listener chose** — `value_msat_total` ÷ 1000,
   rounded down — never the sum that settled and never one leg. Write it as
   digits only, with no thousands separator: `3333`, not `3,333`.
   ([why](notes/pc20-boost-notes-rationale.md#intent))

3. **`<what>` is the thing the sats went to; `<where>` is where the listener
   found it.** What comes first.
   ([why](notes/pc20-boost-notes-rationale.md#what-then-where))

   | The boost | `<what>` | `by` | `<where>` |
   |---|---|---|---|
   | A podcast | show title | — | — |
   | An episode | episode title | — | show title |
   | An album | album title | artist | — |
   | A track, on its own album | track title | artist | album title |
   | A track, on a playlist | track title | artist | playlist title |
   | A song inside an episode or a live show | song title | artist | `<episode> of <show>` |
   | BOOST ALL | `<n> tracks` | — | album, playlist or show title |

   ```
   ChadF boosted 100 sats to Homegrown Hits
   ChadF boosted 100 sats to Episode 146 from Homegrown Hits
   ChadF boosted 50 sats to Disco Swag - The Album by The Doerfels
   ChadF boosted 121 sats to Sing For You by The Doerfels from Disco Swag - The Album
   rev.hodl boosted 121 sats to Sing For You by The Doerfels from ITDV music playlist
   ChadF boosted 100 sats to Copenhagen by Alice from Episode 146 of Homegrown Hits
   ChadF boosted 300 sats to 3 tracks from Homegrown Hits (100 each)
   ```

4. **A playlist is a `<where>`, never a `<what>`,** when the boost was for a
   track on it. It lists the track; the track's own feed is its parent.
   ([why](notes/pc20-boost-notes-rationale.md#what-then-where))

5. **Name a song inside an episode only when a leg that pays the song
   settled, and you know its title.** Otherwise `<what>` is the episode,
   and the song is in the tags alone. A receiver names the song when the
   boostagram it received names it and it can find the title.
   ([why](notes/pc20-boost-notes-rationale.md#song))

6. **`by <artist>` follows a music title only** — a track, an album, a song.
   A podcast episode or show never says `by`. Leave it out when the artist
   is unknown, or when it equals `<what>` ignoring case.
   ([why](notes/pc20-boost-notes-rationale.md#by))

7. **`via <app>` names the app the listener used** (`app_name`). A receiver
   SHOULD add it: the note is signed by the bot, so nothing else names the
   listener's app. A sender MAY add it.
   ([why](notes/pc20-boost-notes-rationale.md#via))

8. **Every name is feed text, so clean it before it goes in.** Turn each run
   of whitespace, newlines included, into one space; trim; cap at 120
   characters. A part that comes out empty is left out with its word, so the
   sentence never ends `to` or `from` with nothing after it. The sentence
   MUST be one line.
   ([why](notes/pc20-boost-notes-rationale.md#clean))

9. **BOOST ALL is one note, not one per track.** `<n>` counts the tracks the
   boost paid, and `<N>` is the sum of what the listener chose for those
   tracks. ` (<each> each)` MAY follow when every track got the same amount,
   and the tracks MAY be listed under the sentence, one `• <track>` line
   each.

## The note

Kind `1`. The blocks below, in this order, one blank line between each:

```
⚡ Boost ⚡

<the message>

<the sentence>

<links>

<banner image URL>

<nostr:npub… mentions>

<nostr:nevent… of a quoted zap receipt>
```

10. The first line SHOULD be `⚡ Boost ⚡`.
    ([why](notes/pc20-boost-notes-rationale.md#header))
11. **The message is the boostagram's `message`, trimmed, and otherwise as
    typed.** Leave its block out when it is empty.
12. Every block after the sentence is optional. Keep the order of the ones
    you write.

### Tags

| Tag | Value | |
|---|---|---|
| `i` | `podcast:guid:<feedGuid>`, optional URL hint | MUST, when the feed guid is known |
| `i` | `podcast:item:guid:<itemGuid>`, optional URL hint | MUST, when the boost was for an item |
| `i` | `podcast:publisher:guid:<guid>`, optional URL hint | MAY |
| `k` | the kind of an `i` tag's identifier | one for each kind the `i` tags hold |
| `amount` | millisats, as a string | MUST — the same number `<N>` comes from |
| `t` | `boostagram` | MUST |
| `t` | `value4value` | MAY |
| `client` | the app's name | MAY |
| `p` | a person the note mentions | MAY |
| `q` | the zap receipt the body quotes | with that `nevent` |

13. **One identifier in each `i` tag.** Position 2 is NIP-73's URL hint, so
    the item guid gets a tag of its own. This is NOT the layout of kind
    `10333` or `3369`, which put the item guid at position 2.
    ([why](notes/pc20-boost-notes-rationale.md#one-identifier))

14. **The first `podcast:guid` MUST be the feed the boosted item lives in.**
    A playlist that lists the item is not its feed.
    ([why](notes/pc20-boost-notes-rationale.md#first-feed))

15. **When the note names more than one feed, each `podcast:item:guid` comes
    right after the `podcast:guid` of its own feed.** The boosted item's pair
    goes first, then the song a split paid, then the playlist the listener
    found the item on. With one feed and one item, their order is free.
    ([why](notes/pc20-boost-notes-rationale.md#first-feed))

16. **A guid too long to send is left out, never cut short.** A shortened
    guid names a different item.
    ([why](notes/pc20-boost-notes-rationale.md#truncate))

## Which boosts get a note

17. **A note is for a boost a person pressed.** A stream payment and an
    auto-boost SHOULD NOT get a kind `1`;
    [the playback events](nip-value-playback-events.md) carry those.
    ([why](notes/pc20-boost-notes-rationale.md#pressed))

18. **One boost, one note,** however many legs it split into.

19. A receiver SHOULD skip a boost whose sender app posts its own note, or
    the boost appears twice. ([why](notes/pc20-boost-notes-rationale.md#twice))

## One line

IRC, logs and dashboards SHOULD use the same sentence, with the message in
quotes before `via`:

```
⚡ <who> boosted <N> sats to <what>[ by <artist>][ from <where>][ saying "<message>"][ via <app>]
```

```
⚡ ChadF boosted 100 sats to 006. I play favorites :) from Chad and Reeds Podcast saying "IRC++ 2" via Fountain
```

20. Flatten the message to one line, as rule 8 does for names.

## If you only read

21. **Read the tags, never the sentence.** Take the amount from `amount` and
    the feed and the item from `i`. A kind `1` cannot be edited, so every
    layout any app ever wrote stays on the relays; a parser of the sentence
    has to read all of them, and it breaks on the next one.
    ([why](notes/pc20-boost-notes-rationale.md#read-tags))

22. Find boost notes with the filter `{"kinds": [1], "#t": ["boostagram"]}`,
    or with `#i` for a feed or an item. A note written before this format may
    carry no `t` tag.

## Test vectors

Each row is one input and the exact output it gives.

Unless a row says otherwise: sender `ChadF`, 100 sats, show `Homegrown Hits`
(a podcast), episode `Episode 146`.

| # | Input | Expected |
|---|---|---|
| 1 | no episode | `ChadF boosted 100 sats to Homegrown Hits` |
| 2 | `sender_name` empty | `Boosted 100 sats to Episode 146 from Homegrown Hits` |
| 3 | episode title empty | `ChadF boosted 100 sats to Homegrown Hits` |
| 4 | song `Copenhagen` by `Alice` in the episode; its leg FAILED, the show's settled | `ChadF boosted 100 sats to Episode 146 from Homegrown Hits` |
| 5 | as 4, the song's leg settled, artist unknown | `ChadF boosted 100 sats to Copenhagen from Episode 146 of Homegrown Hits` |
| 6 | track `Kurtis`, artist `kurtis`, album `Night Drive` | `ChadF boosted 100 sats to Kurtis from Night Drive` |
| 7 | the podcast's author is `Chad` | `ChadF boosted 100 sats to Episode 146 from Homegrown Hits` — no `by` |
| 8 | 3333 sats | `ChadF boosted 3333 sats to …` — never `3,333` |
| 9 | 1000 sats in three legs, one leg failed | `ChadF boosted 1000 sats to …`, and `["amount","1000000"]` |
| 10 | episode title `Episode\n146` | `ChadF boosted 100 sats to Episode 146 from Homegrown Hits`, one line |
| 11 | one-line form; sender `rev.hodl`, 121 sats, track `Sing For You` by `The Doerfels` on `ITDV music playlist`, message `great track`, app `Fountain` | `⚡ rev.hodl boosted 121 sats to Sing For You by The Doerfels from ITDV music playlist saying "great track" via Fountain` |
| 12 | BOOST ALL, 3 tracks at 100 each, one track's payment failed | `ChadF boosted 200 sats to 2 tracks from Homegrown Hits (100 each)` |
| 13 | a playlist row: track `T` in feed `A`, playlist feed `P` | `i` tags in this order: `podcast:guid:A`, `podcast:item:guid:T`, `podcast:guid:P` |
| 14 | song `S` in feed `B`, paid by a split inside episode `E` of feed `F` | `i` tags in this order: `podcast:guid:F`, `podcast:item:guid:E`, `podcast:guid:B`, `podcast:item:guid:S` |
| 15 | one track `T` in feed `A`, nothing else | `podcast:item:guid:T` then `podcast:guid:A` is as valid as the reverse |

These are prose. They become code under [conformance/](conformance/) once the
wording is approved, the way the favorites vectors did.

## Not covered

- **The boostagram itself** (TLV `7629169`). [bLIP-10](https://github.com/lightning/blips/blob/master/blip-0010.md)
  defines it. The survey lists where these apps differ from it.
- **Banner images and web cards.** They SHOULD keep the same order: what in
  the big line, where in the small one.
- **The LNURL comment and the BOLT11 description.** BoostBox writes those.
- **A translation.** Not specified. The note is public and read in every
  client, and this draft assumes English.

## Open questions

- **`by <artist>` on an album.** Rule 6 adds it. boostmebitch's branch
  `feat/boost-note-wording` does not; DoerfelVerse and StableKraft write it
  today.
- **`via <app>` from a sender.** Rule 7 makes it optional. Should every note
  name the app, or only a receiver's?
- **Auto-boost notes.** Rule 17 follows the playback-events draft.
  DoerfelVerse posts a note for every auto-boost today.
- **Default sender names.** Four apps fill `sender_name` with a default
  when the listener gives no name — `boostmebitch.com user`,
  `candr.space listener`, `StableKraft.app user`, and `Super Fan` or
  `Anonymous` on DoerfelVerse. Rule 1 prints it as a name, in every app that
  reads the boost. Keep the defaults, or send no name and let the sentence
  say `Boosted`?
- **A `sender` tag.** Three receivers write one; boostbox and the Helipad
  bot put the listener's npub in it. `p` and `P` tags hold a hex key, not an
  npub. Standardise it, or drop it?
