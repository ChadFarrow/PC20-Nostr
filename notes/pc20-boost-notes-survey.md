# How each app writes a boost today

What ChadFarrow's apps and bots say when somebody boosts, read on 2026-11-16.
This is the evidence behind the draft [pc20-boost-notes.md](../pc20-boost-notes.md);
the reasons drawn from it are in [the rationale](pc20-boost-notes-rationale.md).
**Nothing here is normative.**

**Every line number below is a claim about a file this repo does not own.**
Re-read before trusting one. The pages that rot fastest here are the ones that
name another repo's code, and this is one of them.

## How this was read

One read-only agent per repo reported that repo's templates, a real or
realistic example of each output, and the fields each one uses. Then the note
body template of every repo below was read again at the SHA in its row, and
those templates are quoted from the code. **The tags, the other outputs and the
examples are from those reports and were not all re-read**; where one was, the
text says so.

No repo was changed. The reads were `git show origin/HEAD:<path>` after a
`git fetch`, or `gh api` for a repo not cloned on this machine.

**Why this is not in `catalog/comparisons/`.** It has to name bots and tools
that are not live sites, and `catalog/check-recipes.sh` step 8 refuses two of
those names (`Helipad-to-Nostr-BoostBot`, `v4v-toolkit`) anywhere in the
catalog. The catalog's job is handing a stranger working code; this page's job
is a format decision, so it lives beside the spec instead.

## The eight repos

A **sender** is the app the listener boosts from; it posts its own note. A
**receiver** is a bot that posts the boosts a node received, under the bot's
key.

| Repo | Role | Note text built in | Read at | Layout |
|---|---|---|---|---|
| `boostmebitch` | sender | `lib/nostr/boost-notes.ts` `formatContent` | `c873817` (main); `05eeec5` (branch) | arrow → sentence |
| `candr.space` | sender | `index.html` `window.CANDR.boostNoteTemplate` | `7fe38cf` | arrow |
| `stablekraft-app` | sender | `components/Lightning/BoostButton.tsx` `handleBoost` | `bda27f6d` | bullet |
| `ITDV-Lightning` | sender | `lib/boost-to-nostr-service.ts` `createBoostContent` | `aedd069` | bullet |
| `boostbox` | receiver: Boostr_Bot, the MSP 2.0 bot | `src/boostbox/boostagram.clj` `->note-content` | `7ca76b5` | arrow |
| `Helipad-to-Nostr-BoostBot` | receiver | `lib/nostr-bot.ts` `postBoostToNostr` | `cad5916` | amount |
| `thelounge-candr` | receiver: three bots | `bots/src/candr-boost/lib/boost.js` `formatBoostLine`, and two relays | `7fa1095` | bracket; labelled lines |
| `v4v-toolkit` | none — no app uses it | `src/nostr/boost.ts` `formatBoostNote` | `33a921a` | labelled lines |

Five layouts:

| Layout | Shape | Written by |
|---|---|---|
| arrow | `<who> boosted <N> sats → <show>`, then `📻 <episode>` | boostmebitch (main), candr.space, boostbox |
| bullet | `⚡ <N> sats • "<title>" by <artist>` | StableKraft, DoerfelVerse |
| amount | `⚡ <N> sats`, then `📱 via <app>` | the Helipad bot |
| bracket | `⚡ [<show>] [<episode>] <who> boosted <N> sats saying "…" via <app>` | candr-boost, and the announcer boost-after-boost copies |
| labelled lines | one emoji-labelled line per field | libre-relay-bot, v4v-toolkit |

**In four repos a boost to a song is written as a boost to the show or the
playlist that holds it:** boostmebitch on `main`, candr.space, boostbox and
candr-boost. In three the note names no sender: StableKraft by design,
DoerfelVerse by a bug, and the Helipad bot, which names nothing but the
amount and the app.

---

## boostmebitch — sender

`main` at `c873817`, `formatContent` in `lib/nostr/boost-notes.ts`:

```
⚡ Boost ⚡

<message>

<who> boosted <N> sats → <show>
📻 <episode>
🎵 <song> — <artist>          only when a leg that pays the song settled

<listen link>
<boostmebitch.com link>

<banner image URL>

<nostr:npub… mentions>
```

The real note that started the rewrite, rev.hodl's `b1d67bdd…` of 2026-11-16:

```
rev.hodl boosted 121 sats → ITDV music playlist
📻 Sing For You
```

**The branch `feat/boost-note-wording`, at `05eeec5`, changes it.** The branch
is local — a worktree in the boostmebitch clone, not on GitHub, not merged. Its
design note is `docs/superpowers/specs/2026-11-16-boost-note-wording-design.md`.
It replaces the arrow, `📻` and `🎵` lines with one sentence from
`boostSentence` in `lib/util.ts`:

```
<who> boosted <N> sats to <what>[ by <artist>][ from <where>]
```

```
rev.hodl boosted 121 sats to Sing For You by The Doerfels from ITDV music playlist
```

It also writes a playlist row's own feed first in the tags (`itemFeedGuid`),
keeps the playlist's cover out of the banner, and draws the banner with what
large and `from <where>` small.

**BOOST ALL is not changed yet at `05eeec5`.** `components/boost-all-modal.tsx`
still writes
`<who> boosted <n> tracks on <show> for <N> sats (<each> each)`, then one
`• <track>` line per track. Task 4 of the branch's plan changes it to
`<who> boosted <N> sats to <n> tracks from <show>`.

- **Sender:** the boostagram's `sender_name`. With no name the boostagram
  carries `boostmebitch.com user` (`resolveSenderName`, `lib/brand.ts`), so the
  `Boosted` form is rare in practice.
- **Amount:** `value_msat_total`, the intent.
- **Tags** (from `docs/nostr.md` on the branch): `i`/`k` for the feed and the
  item, with landing URLs as hints; the song's feed and item after them, with
  no second `k`; two `r`; `amount`; `client`; `t` `boostagram` and
  `value4value`; `imeta` for the banner; `p` for mentions.

## candr.space — sender

`window.CANDR.boostNoteTemplate`, `index.html:2807` at `7fe38cf`. The site
posts it only when the listener has a NIP-07 signer and leaves "Post this boost
to Nostr" ticked. Its comment says it copies boostmebitch's shape — the arrow
shape, from before the branch.

```
⚡ Boost ⚡

<message>

<who> boosted <N> sats → <show>
📻 <episode>

https://candr.space/

nostr:nevent1…              the summary zap receipt, when a relay took it
```

- **Sender:** `senderName`; with none, `Boosted <N> sats → <show>`. A boostagram
  with no name carries `candr.space listener`.
- **Show:** the boostagram's `podcast`, or `Chad and Reeds Podcast`.
- **Amount:** `Math.round(value_msat_total / 1000)` — rounded, where the others
  round down.
- **Tags** (read at `7fe38cf`): `i podcast:guid:<show>` with the home page as
  hint, and its `k`; `i podcast:item:guid:<episode>` and its `k`; during a song
  split, the song's feed and item guids as `i` tags with no `k`; `amount`; `q`
  for the receipt; `client candr.space`; `t boostagram`; `t value4value`.
- **The song is in the tags only.** The site keeps the song's two guids, not
  its title. On episode 002, during the Matt Finlay track, about 91% of the sats
  go to the artist and the note says `→ Chad and Reeds Podcast`.

Example, built from the code (the message is made up):

```
⚡ Boost ⚡

Great show about musicL!

rev.hodl boosted 1000 sats → Chad and Reeds Podcast
📻 014. What is a musicL playlist?

https://candr.space/
```

Other outputs: a kind `9735` summary receipt with empty `content`; a boostagram
TLV `7629169`, sent only to a `type="node"` recipient, of which the feed has
none today; an `rss::payment` JSON to BoostBox; the LNURL comment, which is
BoostBox's description line; and the `/boosts` page.

## stablekraft-app — sender

`handleBoost` in `components/Lightning/BoostButton.tsx` at `bda27f6d`; the code
comment calls it "Fountain-style". Only a manual boost, with a Nostr login and
"Post to Nostr" on. **An auto-boost posts no note.**

```
⚡ <N> sats • "<track>"[ by <artist>]

<message>

<nostr:npub… mentions>

<stablekraft.app album URL>
```

- **No sender, no `from`, no app** in the text. The listener's own key signs
  the note, and the `client` tag and the URL name the app.
- **Tags:** `amount` (msat), `preimage`, `image`, `r`, `i`/`k` for the item,
  the feed and the publisher — **item first**, on purpose
  (`podcastIdentifierTags`, `lib/nostr/boost-note.ts`, read at `bda27f6d`:
  *"order is inert, and 274 published notes already use ours"*), `p` per
  person, `client StableKraft`. **No `t` tag.**

Real note, nos.lol, 2026-10-26:

```
⚡ 321 sats • "Cats in the Hall (Live)" by Strange Love

I like this love version 🔥

nostr:npub1l5hw…

https://stablekraft.app/album/strange-love-live-at-rockpile?track=…
```

The boostagram puts the **artist in `podcast`** and the track in `episode`,
adds `album`, and sends the message again in TLV `34349334`. An auto-boost
sends `action: "auto"`, no message, and `sender_name` `<name> via
StableKraft.app`, or `StableKraft.app user` with no name.

## ITDV-Lightning (DoerfelVerse) — sender

`createBoostContent`, `lib/boost-to-nostr-service.ts` at `aedd069`. The site key
signs it, through `app/api/nostr/publish/route.ts`. **Auto-boosts post a note
too** (`contexts/AudioContext.tsx`, with the comment `Auto boost for "<title>"`).

```
⚡ <N> sats • "<title>" by <artist>
From: <album>          only if album ≠ title, ≠ "Shuffle All", and sender ≠ "Auto Boost"

Sent by: <sender>      only if a sender name arrives, and none does now

<message>

🎧 https://itdv.podtards.com/album/<album>#<track>
```

- **The sender is gone from every note.** The publish route rebuilds the track
  from known fields and `senderName` is not one of them (read at `aedd069`).
  The 2025 notes say `Sent by: ChadF`; the report dates the loss to
  2026-08-04. The `Auto Boost` name that hid the `From:` line is lost with it.
- **Quotes double** on a title that has its own: `""Nate's got it""`.
- **An album boost** puts the album in the title place, and then has no
  `From:` line.
- **Tags:** `i`/`k` for the item, the feed and the publisher, each with the
  site URL as hint; `image`. **No `amount`, no `t`, no `p`.**
- **The `/boosts` page parses these notes with regular expressions**
  (`parseBoostFromEvent`, `app/boosts/page.tsx`).

Real notes, the site's key:

```
⚡ 50 sats • "Disco Swag - The Album" by The Doerfels

test

🎧 https://itdv.podtards.com/album/disco-swag-the-album
```

```
⚡ 500 sats • ""Nate's got it"" by The Doerfels
From: Jam with Nate

Sent by: ChadF

🎧 https://itdv.podtards.com/album/jam-with-nate#nates-got-it
```

The first is from 2026-10-30, the second from 2025-12-11.

The boostagram puts the **artist in `podcast`**, sets `feedId` from a hard-coded
pair (`6590183` for one album, `6590182` for every other feed), fills
`remote_*` with the feed's own guids, and gives each leg an equal share in
`value_msat` whatever the split says. A boost with no name sends `Super Fan`
(album) or `Anonymous`. The LNURL comment nests itself:
`Boost for "Boost for "Sing For You" by The Doerfels" by <recipient>`.

## boostbox — receiver (Boostr_Bot, the MSP 2.0 bot)

`ChadFarrow/boostbox`, a fork of
[noblepayne/boostbox](https://github.com/noblepayne/boostbox), running
tardbox.com. `->note-content` in `src/boostbox/boostagram.clj` at `7ca76b5`
(`origin/main`; the local clone is on another branch). It copies boostmebitch's
arrow layout on purpose, and adds an app line.

```
⚡ Boost ⚡

<message>

<who> boosted <N> sats → <show>
📻 <episode>
🎧 Find it on <app>          "▶️ Listen on <app>" when the link goes to the episode
<app link URL>

<banner image URL>
```

- **Amount:** `value_msat_total`, else what was received; for Fountain, the
  amount in Fountain's zap receipt when that is higher. Digits only in the
  note; `3,333` on the banner and the web card.
- **App line** only for the apps in `applinks.clj`.
- **Tags:** `i`/`k` for the feed, the item, the remote feed and item, and the
  publisher; `r` for the BoostBox permalink; `amount`; `client`; `app`;
  `recipient`; `sender` (an npub); `t boostagram`; `t value4value`.
- **No song names.** A boostagram gives the show and episode titles; on a music
  show the song is a remote guid, and the bot reads no titles.

Real notes from relay.primal.net:

```
⚡ Boost ⚡

$btc

chadf@fountain.fm boosted 100 sats → Chad and Reeds Podcast

https://tardbox.com/og/boost.png?art=…&title=Chad+and+Reeds+Podcast&sats=100
```

```
⚡ Boost ⚡

https://media.giphy.com/media/Vi1YAP4jJen4I/giphy.gif

Matt Finlay boosted 116 sats → Mutton, Mead & Music
📻 163rd Edition - ChadF / MSP2.0

https://tardbox.com/og/boost.png?art=…&by=MSP+2.0
```

Other outputs: the banner at `/og/boost.png` (`⚡ <N> SATS`, show, episode); the
tardbox.com card and `/boost/:id` page (From, Amount, Show, Episode, App,
Message, the legs); and the BOLT11 description
`rss::payment::<action> <boostbox URL> <message>`, cut to 639 characters —
which is the LNURL comment candr.space and StableKraft send.

## Helipad-to-Nostr-BoostBot — receiver

`postBoostToNostr`, `lib/nostr-bot.ts:1434` at `cad5916`.

```
<message>

⚡ <N> sats
📱 via <app>

https://lnbeats.com/album/<remote feed guid>       on a music boost
https://podcastindex.org/podcast/<feedId>          otherwise

<nostr:npub… of the show's hosts>

nostr:nevent1…                                    the zap receipt
```

- **No sender, show, episode, song or artist in the text.** The code finds the
  song and its artist (`actualTrackName`, `artistName`) and does not use them.
- **Amount:** `value_msat_total / 1000`, rounded down.
- **Message:** a name in `nameToNpubMap` becomes a `nostr:npub…` mention.
- **Tags:** `p` for each mention and host, `i`/`k` for the feed and the item,
  `image`, `t boostagram`, `t value4value`, `["sender", <npub>]` when the bot
  knows the payer (`nip19.npubEncode`, `lib/sender-tag.ts`).
- **Streams and auto-boosts get no note by default.** `DEFAULT_SEND_RULES` in
  `lib/config.ts` turns on `boost` only; Helipad numbers the actions `1`
  stream, `2` boost, `4` auto (`lib/send-rules.ts`). Both read at `cad5916`.

Example, a real boost captured in `lib/fixtures.ts`:

```
keysend and a custom lnaddress!!!

⚡ 333 sats
📱 via BoostMeBitch

https://podcastindex.org/podcast/946122

nostr:npub1yvsc… nostr:npub19ha7…

nostr:nevent1…
```

Its dashboard has one more line:
`💰 <Boost|Stream|Auto Boost>: <N> sats from <sender> → <podcast> | "<first 50 characters>..."`.

## thelounge-candr — receiver, three bots

At `7fa1095`. **Only candr-boost builds its own sentence.** The other two copy
lines that announcer bots write in IRC channels, and those announcers are not
in this repo, so their wording cannot change here.

**candr-boost** — `formatBoostLine`, `bots/src/candr-boost/lib/boost.js`. One
IRC line in `#candr` or `#greenroom`; the Nostr note is the same text, plus the
receipt's `nevent` when zap receipts are on.

```
⚡ [<show>][ [<episode>]] <who> boosted <N> sats[ saying "<message>"][ via <app>]
```

With no sender the line says `Someone`. Real, 2026-09-13:

```
⚡ [Chad and Reeds Podcast] [006. I play favorites :)] chadf@fountain.fm boosted 100 sats saying "IRC++ 2" via Fountain
```

**boost-after-boost** posts the `#BowlAfterBowl` announcer's line, plus
`#bowlafterbowl #boostafterboost #bowloftrust`. That line is
`<emoji> [<show>] [<episode>] <who> boosted <N> sats saying "<message>" @<h:mm:ss> via <app>`.
It skips boosts sent through BoostMeBitch or BoostMeBuddy, which post their own.

**libre-relay-bot** rewrites the `#SirLibre` announcer's
`<N> sats from <who> via <app> | <field> | … | <comment>` as:

```
⚡ <N> sats from <who> via <app>

🎵 <field 1>

🎧 <field 2>

🎶 <field 3, and each after it>

💬 <comment>

#V4V
https://v4vmusic.com
```

It cannot label the middle fields, because the announcer does not say what they
hold. It also skips BoostMeBitch boosts.

All three tag `amount`, `t` (`boost`, `boostagram`, `value4value`), `app`,
`sender`, and `i`/`k` for the feed and the episode. The `sender` value is an
`npub`: all three call `senderTag` from one `lib/payer-pubkey.js`,
byte-identical in each bot (read at `7fa1095`).

## v4v-toolkit — no app uses it

GitHub only, one commit (`33a921a`, 2026-04-07, "initial scaffold"),
read with `gh api`. `formatBoostNote` in `src/nostr/boost.ts`. Its header says
it is used in the Helipad bot; the Helipad bot at `cad5916` does not import it.

```
⚡ <who> boosted <N> sats
📻 <podcast>
🎙️ <episode>
💬 "<message>"
via <app>
```

`<N>` is formatted with `toLocaleString()`, so it changes with the machine's
locale. Tags: `i podcast:guid` and `i podcast:item:guid` only — no `k`, no
`amount`, no `t`.

---

## What the note text names

`–` means absent. "branch" is boostmebitch's `feat/boost-note-wording`.

| | bmb main | bmb branch | candr.space | StableKraft | DoerfelVerse | boostbox | Helipad bot | candr-boost | libre | v4v-toolkit |
|---|---|---|---|---|---|---|---|---|---|---|
| sender | yes | yes | yes | – | – (bug) | yes | – | yes | yes | yes |
| amount | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| show | arrow | `from` | arrow | – | – | arrow | – | brackets | – | `📻` |
| episode | `📻` | what or `from` | `📻` | – | – | `📻` | – | brackets | field 1 | `🎙️` |
| song, track | `🎵` | what | – | title | title | – | – | – | a field | – |
| artist | `🎵` | `by` | – | `by` | `by` | – | – | – | a field | – |
| album | arrow | `from` | – | – | `From:` | – | link | – | – | – |
| playlist | arrow | `from` | – | – | – | – | – | – | – | – |
| app | – | – | – | – | – | app line | `via` | `via` | `via` | `via` |
| message | yes | yes | yes | yes | yes | yes | yes | `saying` | `💬` | `💬` |

## What the tags carry

| | bmb main | candr.space | StableKraft | DoerfelVerse | boostbox | Helipad bot | thelounge | v4v-toolkit |
|---|---|---|---|---|---|---|---|---|
| `i` feed + item | feed first | feed first | item first | item first | yes | yes | yes | yes, no `k` |
| song a split paid | yes | yes | – | – | remote guids | – | – | – |
| `amount` | intent | intent | yes | – | yes | – | yes | – |
| `t boostagram` | yes | yes | – | – | yes | yes | yes | – |
| `client` | yes | yes | yes | – | yes | – | – | – |
| `sender` | – | – | – | – | npub | npub | npub | – |

## What each would change to match the draft

**A list of differences, not a plan any repo agreed to.** No app has been asked.
It follows Chad's answers of 2026-11-16 to the review's five questions: `by` on
an album, `via <app>` from every app, no note for an auto-boost, default sender
names kept, and the `sender` tag as a hex key.

- **boostmebitch** — the branch already writes the sentence. Left: `by
  <artist>` on an album boost, ` via BoostMeBitch` at the end of the sentence,
  and the BOOST ALL sentence (Task 4 of its plan). Its note card prints the
  `client` tag as `via …` (`components/nostr-note-card.tsx:451` at `c873817`),
  so a boost note shows the app twice there until the card stops.
- **candr.space** — the sentence, with `via <app>`, in place of the arrow and
  `📻` lines. It names a song only after it keeps the song's title, which it
  does not today.
- **StableKraft** — a sender, a `from` and a `via` in the sentence, no quotes
  around the title, `t boostagram`. Its item-first tag order can stay while a
  note names one feed. It already posts no note for an auto-boost.
- **DoerfelVerse** — as StableKraft, plus `senderName` back in the publish
  route, `parseBoostFromEvent` changed in the same commit, `amount` and `t`
  tags, and no note for an auto-boost.
- **boostbox** — the sentence in place of the arrow and `📻` lines; `via <app>`
  in it, with the app link kept as a link line; the `sender` tag as hex, not an
  `npub`.
- **The Helipad bot** — a sentence where it has none, with `via <app>` in it.
  It already finds the song and the artist. The `sender` tag as hex. It
  already posts no auto-boost by default.
- **thelounge-candr** — candr-boost: the one-line form. All three bots: the
  `sender` tag as hex, in `lib/payer-pubkey.js`. The other two copy
  announcers outside the repo, so their sentences cannot change here.
- **v4v-toolkit** — nothing uses it. Bring it in line or remove it.

## Where the boostagram differs, which the draft does not cover

[bLIP-10](https://github.com/lightning/blips/blob/master/blip-0010.md) defines
`podcast` as the podcast's title. StableKraft and DoerfelVerse put the artist
there for music. DoerfelVerse also hard-codes `feedId`, fills `remote_*` with
its own guids and splits `value_msat` evenly. It sends an auto-boost as
`action: 'boost'` with `sender_name` `Auto Boost` (`createSimpleWebLNTLVRecords`,
`utils/payment-utils.ts` at `aedd069`), so a receiver cannot tell it from a
boost a person pressed; StableKraft sends `auto`, which bLIP-10 does not list.
candr.space sends its TLV only to a node recipient, which its feed does not
have, and relies on BoostBox. Each of these shapes what a receiver can write,
and none is decided here.

Four apps send a default `sender_name` for an anonymous listener. That one IS
decided: the review kept the defaults, and the sentence prints them (rule 1).
