# Boost Notes

`draft` — written 2026-11-16 for review. Chad answered its five open
questions the same day, and the rules below follow his answers. **No app
writes this yet.**

One sentence says what a boost paid for, where the listener found it, and
which app they used, in every app that writes about a boost:

```
rev.hodl boosted 121 sats to Sing For You by The Doerfels from ITDV music playlist via BoostMeBitch
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
   payment carried, cleaned as rule 8 says. An app that sends its own default
   when the listener gives no name (`boostmebitch.com user`) keeps it, and the
   sentence prints it like any other name. With no name at all, the sentence
   starts `Boosted <N> sats`. Do not make one up for the note alone
   (`Someone`). ([why](notes/pc20-boost-notes-rationale.md#who))

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
   ChadF boosted 100 sats to Homegrown Hits via BoostMeBitch
   ChadF boosted 100 sats to Episode 146 from Homegrown Hits via BoostMeBitch
   ChadF boosted 100 sats to Disco Swag - The Album by The Doerfels via BoostMeBitch
   ChadF boosted 121 sats to Sing For You by The Doerfels from Disco Swag - The Album via BoostMeBitch
   rev.hodl boosted 121 sats to Sing For You by The Doerfels from ITDV music playlist via BoostMeBitch
   ChadF boosted 100 sats to Copenhagen by Alice from Episode 146 of Homegrown Hits via BoostMeBitch
   ChadF boosted 300 sats to 3 tracks from Homegrown Hits (100 each) via BoostMeBitch
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
   An album boost says it too: `to Disco Swag - The Album by The Doerfels`.
   A podcast episode or show never says `by`. Leave it out when the artist
   is unknown, or when it equals `<what>` ignoring case.
   ([why](notes/pc20-boost-notes-rationale.md#by))

7. **Every sentence ends with `via <app>`, the app the listener used** — in
   a sender's note and in a receiver's alike. `<app>` is the boostagram's
   `app_name`, cleaned as rule 8 says. A sender MUST write it, with the same
   name it sends as `app_name`. A receiver MUST write it when the boostagram
   carries an `app_name`, and leaves it out, with its word, when it does not.
   ([why](notes/pc20-boost-notes-rationale.md#via))

8. **Every name is feed text, so clean it before it goes in.** Turn each run
   of whitespace, newlines included, into one space; trim; cap at 120
   characters. A part that comes out empty is left out with its word, so the
   sentence never ends `to` or `from` with nothing after it. The sentence
   MUST be one line.
   ([why](notes/pc20-boost-notes-rationale.md#clean))

9. **BOOST ALL is one note, not one per track.** `<n>` counts the tracks the
   boost paid, and `<N>` is the sum of what the listener chose for those
   tracks. ` (<each> each)` MAY follow `<where>`, before ` via <app>`, when
   every track got the same amount, and the tracks MAY be listed under the
   sentence, one `• <track>` line each.

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
| `sender` | the listener's public key, 64 lowercase hex characters | MAY, when the app knows the key |
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

17. **A `sender` tag MUST hold the listener's key as 64 lowercase hex
    characters** — the form `p` and `P` use — never an `npub`. It names who
    paid; it is not a `p` tag, so it notifies nobody.
    ([why](notes/pc20-boost-notes-rationale.md#sender))

## Which boosts get a note

18. **A note is for a boost a person pressed.** An auto-boost MUST NOT get a
    kind `1`, from the app that sent it or from a receiver. The payment and
    its boostagram still go out; only the note is left out. A stream payment
    SHOULD NOT get one either. A receiver knows which it holds only from the
    boostagram's `action`. This rule is about kind `1` only;
    [the playback events](nip-value-playback-events.md) are a separate draft.
    ([why](notes/pc20-boost-notes-rationale.md#pressed))

19. **One boost, one note,** however many legs it split into.

20. A receiver SHOULD skip a boost whose sender app posts its own note, or
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

21. Flatten the message to one line, as rule 8 does for names.

## If you only read

22. **Read the tags, never the sentence.** Take the amount from `amount` and
    the feed and the item from `i`. A kind `1` cannot be edited, so every
    layout any app ever wrote stays on the relays; a parser of the sentence
    has to read all of them, and it breaks on the next one.
    ([why](notes/pc20-boost-notes-rationale.md#read-tags))

23. Find boost notes with the filter `{"kinds": [1], "#t": ["boostagram"]}`,
    or with `#i` for a feed or an item. A note written before this format may
    carry no `t` tag, and an `npub` in its `sender` tag; decode that to hex
    before you compare it with a key.

## Test vectors

Each row is one input and the exact output it gives.

Unless a row says otherwise: sender `ChadF`, 100 sats, show `Homegrown Hits`
(a podcast), episode `Episode 146`, `app_name` `Fountain`.

| # | Input | Expected |
|---|---|---|
| 1 | no episode | `ChadF boosted 100 sats to Homegrown Hits via Fountain` |
| 2 | `sender_name` empty | `Boosted 100 sats to Episode 146 from Homegrown Hits via Fountain` |
| 3 | episode title empty | `ChadF boosted 100 sats to Homegrown Hits via Fountain` |
| 4 | song `Copenhagen` by `Alice` in the episode; its leg FAILED, the show's settled | `ChadF boosted 100 sats to Episode 146 from Homegrown Hits via Fountain` |
| 5 | as 4, the song's leg settled, artist unknown | `ChadF boosted 100 sats to Copenhagen from Episode 146 of Homegrown Hits via Fountain` |
| 6 | track `Kurtis`, artist `kurtis`, album `Night Drive` | `ChadF boosted 100 sats to Kurtis from Night Drive via Fountain` |
| 7 | the podcast's author is `Chad` | `ChadF boosted 100 sats to Episode 146 from Homegrown Hits via Fountain` — no `by` |
| 8 | 3333 sats | `ChadF boosted 3333 sats to …` — never `3,333` |
| 9 | 1000 sats in three legs, one leg failed | `ChadF boosted 1000 sats to …`, and `["amount","1000000"]` |
| 10 | episode title `Episode\n146` | `ChadF boosted 100 sats to Episode 146 from Homegrown Hits via Fountain`, one line |
| 11 | one-line form; sender `rev.hodl`, 121 sats, track `Sing For You` by `The Doerfels` on `ITDV music playlist`, message `great track` | `⚡ rev.hodl boosted 121 sats to Sing For You by The Doerfels from ITDV music playlist saying "great track" via Fountain` |
| 12 | BOOST ALL, 3 tracks at 100 each, one track's payment failed | `ChadF boosted 200 sats to 2 tracks from Homegrown Hits (100 each) via Fountain` |
| 13 | a playlist row: track `T` in feed `A`, playlist feed `P` | `i` tags in this order: `podcast:guid:A`, `podcast:item:guid:T`, `podcast:guid:P` |
| 14 | song `S` in feed `B`, paid by a split inside episode `E` of feed `F` | `i` tags in this order: `podcast:guid:F`, `podcast:item:guid:E`, `podcast:guid:B`, `podcast:item:guid:S` |
| 15 | one track `T` in feed `A`, nothing else | `podcast:item:guid:T` then `podcast:guid:A` is as valid as the reverse |
| 16 | album `Disco Swag - The Album` by `The Doerfels`, no track | `ChadF boosted 100 sats to Disco Swag - The Album by The Doerfels via Fountain` |
| 17 | `sender_name` is the app's default `boostmebitch.com user`; `app_name` `BoostMeBitch` | `boostmebitch.com user boosted 100 sats to Episode 146 from Homegrown Hits via BoostMeBitch` |
| 18 | a receiver; the boostagram has no `app_name` | `ChadF boosted 100 sats to Episode 146 from Homegrown Hits` — no `via` |
| 19 | an auto-boost: the sending app's own, or a boostagram with `action` `auto` at a receiver | no kind `1`; the payment and its boostagram still go out |
| 20 | the app knows the listener's key as `npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6` | `["sender","3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"]` — the pair is [NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md)'s own example |

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
