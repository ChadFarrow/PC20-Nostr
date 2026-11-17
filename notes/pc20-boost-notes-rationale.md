# Why the boost-note format is the way it is

Companion to [pc20-boost-notes.md](../pc20-boost-notes.md). **Nothing here is
normative.** The spec states rules; this file records why each one exists —
what was seen, what broke, and what was considered and rejected. What each app
writes today, with the commit it was read at, is in
[the survey](pc20-boost-notes-survey.md).

Every section is anchored so the spec can link to it.

The spec is a draft written on 2026-11-16, the evening boostmebitch rewrote its
own boost sentence. Most of the evidence below is from that rewrite and from
reading seven other repos the same night. **None of the rules has run in more
than one app yet**, so read each one as a decision with a named failure behind
it, not as observed practice.

The first draft left five questions open. Chad answered all five on
2026-11-16, the same night; each section one of them settled quotes his answer:
[`by` on an album](#by), [`via` in every note](#via),
[no note for an auto-boost](#pressed), [default sender names](#who), and
[the `sender` tag](#sender).

---

## The sentence names what was paid, then where it was found
<a id="what-then-where"></a>

The note that started this was rev.hodl's, `b1d67bdd…`, on 2026-11-16:

```
rev.hodl boosted 121 sats → ITDV music playlist
📻 Sing For You
```

The sats went to "Sing For You" by The Doerfels, from the album "Disco Swag -
The Album". The playlist got nothing. The arrow pointed at the container, which
only lists the track. Chad, on that note: *"the info here for the track and
playlist thats being boosted is a little confusing and hard to know whats
happening"*. He proposed *"rev.hodl boosted 121 sats to Sing For You from the
ITDV music playlist"*, added that the wording *"might just be a general issue
also"*, and chose one pattern for every boost note, not a playlist fix. That is
the pattern on boostmebitch's branch `feat/boost-note-wording`, and it is the
pattern here.

The same mistake is in three more repos, on songs inside episodes rather than
playlists:

- candr.space, episode 002, during the Matt Finlay track: about 91% of the sats
  go to the artist, and the note says `→ Chad and Reeds Podcast`. The track is
  in the `i` tags as two guids and nowhere in the text.
- The MSP 2.0 bot (boostbox) on a music show:
  `Matt Finlay boosted 116 sats → Mutton, Mead & Music` with
  `📻 163rd Edition - ChadF / MSP2.0` under it. The song is a guid in the tags.
- candr-boost (thelounge-candr) writes `⚡ [<show>] [<episode>] …` with no song
  at all.

**Why one sentence and not labelled lines.** boostmebitch's old note used a
`📻` line for the episode and a `🎵` line for the song; v4v-toolkit and
libre-relay-bot use `📻`, `🎙️`, `🎵`, `🎧`, `🎶`. A label says what kind of
thing a line names. It does not say which one was paid, and that is the
question a reader has. libre-relay-bot shows the problem at its worst: it
prints the announcer's fields under three emoji, and the bot does not know what
the middle fields hold.

**Why `from` and `of`.** `from` is where the listener found the thing; `of`
ties an episode to its show, so a song in an episode reads
`to <song> by <artist> from <episode> of <show>` — what, who, where, in that
order, with no second line.

## `<who>` is the name the payment carried
<a id="who"></a>

**The note and the boostagram describe one boost, so they name one sender.**
The recipient reads `sender_name` in the boostagram; everybody else reads the
note. When the two differ, at least one is wrong, and nobody can tell which.

**The sentence is often the only place the sender appears.** A site signs the
note for a signed-out listener (boostmebitch's `/api/nostr/site-sign`,
DoerfelVerse's `/api/nostr/publish`), and a bot signs every note it posts. In
both cases the note's key is not the listener's. boostmebitch's own comment
calls the name "load-bearing for site-signed notes". StableKraft leaves the
sender out because the listener's own key signs its notes, which is true for
that path and false the moment the sentence is copied into a one-line form, a
quote or a bot.

**A name is data, not a switch.** DoerfelVerse used the sender name
`Auto Boost` as a flag to hide its `From:` line on auto-boosts. Since
2026-08-04 its publish route rebuilds the track without `senderName`, so every
note lost its sender — and the flag went with it, so the rule that hid the line
stopped working too. One field doing two jobs failed at both.

**`Boosted`, not `Someone`.** boostmebitch, candr.space and boostbox already
write `Boosted <N> sats` when there is no name; candr-boost writes `Someone`.
`Boosted` states no fact the app does not have.

**Default names stay.** boostmebitch sends `boostmebitch.com user`,
candr.space `candr.space listener`, StableKraft `StableKraft.app user` on
auto-boosts, and DoerfelVerse `Super Fan` or `Anonymous`, when the listener
gives no name. boostmebitch does it on purpose — its BOOST ALL note uses the
default "rather than attributing itself back to the user". The first draft
asked whether to keep them or to send no name and let the sentence say
`Boosted`. Chad decided on 2026-11-16: *"Yes, keep the default sender."*

So the default is what the payment carried, and rule 1 prints it like any
name: `boostmebitch.com user boosted 100 sats to …`. That is what every
receiver prints today, so the decision changes no receiver. The `Boosted` form
stays for a boostagram that carries no name at all. What rule 1 still forbids
is a name that exists in the note alone — a default the boostagram never
carried.

## `<N>` is what the listener chose
<a id="intent"></a>

**bLIP-10 defines it that way.** `value_msat_total` is *"the actual number
someone entered in their player, for numerology purposes"*. The sentence is
about what the person did, and they pressed 121.

**Chad decided it on 2026-11-16:** the note keeps the amount the sender typed
— *"leave it like it is"*.

**The playback-events draft already says so, from the other side.**
[nip-value-playback-events.md](../nip-value-playback-events.md#kind-3369-value-playback-receipt)
makes a receipt's `amount` what SETTLED and states that a kind `1` boost note
does the opposite on purpose. The two rules agree; they describe different
things.

**The cost is real and is stated rather than hidden.** rev.hodl's note says 121
while 6 settled (boostmebitch's design note for the rewrite). A reader of the
note cannot see that. The settled sum was rejected because it is not known when
the note is written: a wallet reply that times out is not a refusal, a slow leg
can settle after the note goes out, and a kind `1` cannot be corrected later.
An amount that is true of the press is better than one that is a guess about
the payment.

**Digits only.** v4v-toolkit formats with `toLocaleString()`, whose output
depends on the locale of the machine that runs it — `1,000`, `1.000` or
`1 000` for one boost. boostbox writes `3333` in the note and `3,333` on its
banner and web card. Digits read the same everywhere. candr.space rounds
(`Math.round`) where the others round down; the two differ only on a total that
is not a whole number of sats.

## A song is named only when its leg settled
<a id="song"></a>

boostmebitch's `boostNoteTrack` names a song inside an episode only when a leg
that pays the song's block settled. Otherwise a boost whose song leg failed,
while the show's share went through, would name an artist who got nothing, in a
note nobody can edit.

**The fallback is still true.** The listener pressed boost on the episode, and
the show's share was paid, so `to Episode 146 from Homegrown Hits` is correct
when the song cannot be named. That is also what receivers fall back to today:
a receiver holds one leg and cannot see the others, so it goes by what the
boostagram names (`remote_feed_guid`, `remote_item_guid`). boostbox reads no
titles, candr.space keeps only the song's two guids, and the Helipad bot finds
the track and artist names (`actualTrackName`, `artistName`) and does not use
them. For all three the fallback is no worse than the note they write now.

## `by` is for music
<a id="by"></a>

`by <artist>` is there to name who made a song or an album, which on a music
boost is who got paid. A podcast's `author` is its host, so `by` on an episode
repeats the show, and on many feeds the field holds a network or a company.
boostmebitch writes no `by` on an episode for that reason.

**An album gets one, which boostmebitch's branch does not do.** DoerfelVerse
and StableKraft both write an album boost as `"Disco Swag - The Album" by The
Doerfels` today, and an album title alone often does not say whose it is. It
is the one place this draft departs from the branch Chad chose, so the first
draft left it open. Chad decided on 2026-11-16: yes, with
*"ChadF boosted 100 sats to Disco Swag - The Album by The Doerfels"* as the
example. The branch has to add it.

**Dropped when it equals the title.** A self-titled release would otherwise
read `to Kurtis by kurtis`. boostmebitch compares ignoring case.

**Dropped when unknown, not waited for.** boostmebitch looks the artist up
while the wallet pays and gives up after two seconds; a miss costs the words
`by <artist>` and nothing else.

## `via` is in every note
<a id="via"></a>

Every receiver already names the listener's app: candr-boost,
boost-after-boost, libre-relay-bot and the Helipad bot as `via <app>`, boostbox
as an app link line. The bot's own key signs the note and its `client` tag
names the bot, so without `via` the note says nothing about where the listener
was.

**A sender writes it too.** The first draft made it a MAY for a sender: the
sender is the app, and its `client` tag already says so. Chad decided on
2026-11-16 that every app adds it — *"Yes, add the app."* — with
*"rev.hodl boosted 121 sats to Sing For You by The Doerfels from ITDV music
playlist via BoostMeBitch"* as the example. A tag is not part of the text: it
does not travel when the sentence is copied into a one-line form, a quote or a
bot's note, and the sentence is meant to read the same from every app.

**A sender writes the name it sends as `app_name`**, so the note and the
boostagram name one app, as they name one sender ([`<who>`](#who)).

**The cost is one `via` shown twice.** boostmebitch's note card prints the
`client` tag as `via …` (`components/nostr-note-card.tsx:451`, read at
`c873817`), so on that card its own boost notes would name the app twice until
the card stops doing it for a boost note.

## Names are cleaned before they go in
<a id="clean"></a>

**Every title is text a feed wrote about itself.** A newline in one would add a
line to the note. When a site key signs the note, that line carries the site's
signature. boostmebitch's `noteTrackText` flattens and caps each name at 120
characters for that reason.

**An empty part is left out with its word**, so a missing title never gives
`boosted 100 sats to  from Homegrown Hits`.

**No quotes around titles.** StableKraft and DoerfelVerse quote the title, and
a title that already has quotes comes out doubled — DoerfelVerse's real note of
2025-12-11 reads `""Nate's got it""`.

## The `⚡ Boost ⚡` first line
<a id="header"></a>

boostmebitch, candr.space and boostbox open their notes with it; the last two
copy boostmebitch's layout on purpose. It tells a reader what the note is
before the message, which can be anything — `$btc`, or a bare GIF URL.
boostmebitch's site-sign route refuses a body without it
(`BOOST_CONTENT_PREFIX`, `app/api/nostr/site-sign/route.ts`). It is a SHOULD
because the `t` tag, not the text, is what marks a boost note for a program.

## One identifier per `i` tag
<a id="one-identifier"></a>

[NIP-73](https://github.com/nostr-protocol/nips/blob/master/73.md) gives an
`i` tag an optional URL hint as its second element, and kind `1` is rendered
by general clients that follow NIP-73. boostmebitch puts its landing URLs there
and candr.space its home page.

Kinds `10333` and `3369` put the item guid at position 2 instead — a
`<podcast:remoteItem>` as one tag — because no general client renders them.
A NIP-73 client reading that layout on a kind `1` would show the item guid as a
link. The playback-events draft already records the difference
([What this format does not do](../nip-value-playback-events.md#what-this-format-does-not-do)):
a `#i` filter written for one layout does not find the other, so read the kind
before you read the tag.

## The first feed is the item's own feed
<a id="first-feed"></a>

rev.hodl's note again. Its tags paired the playlist's `podcast:guid` with a
`podcast:item:guid` from the album feed. Readers take a note's first
`podcast:guid` as the feed of its item; boostmebitch's own card asked
`/api/episode-by-guid` for the track under the playlist's guid, got a 404, and
showed the playlist alone. The boostagram's `remote_feed_guid` and the quoted
zap receipt both named the album — only the note was wrong. boostmebitch's
branch writes the item's own feed first, then the item, then the playlist, so
the playlist's page still lists the note through `#i`.

**An item guid is unique only inside its feed**, which is why the Podcast Index
`/episodes/byguid` lookup demands a feed beside it. In a kind `1` the only thing
that pairs an item with its feed is order, so once a note names two feeds, each
`podcast:item:guid` has to sit right after the `podcast:guid` of its own feed
or a reader pairs it with the wrong one.

**With one feed, order is free, and StableKraft relies on it.** Its
`podcastIdentifierTags` (`lib/nostr/boost-note.ts` at `bda27f6d`) writes item,
feed, publisher, and says why: *"order is inert, and 274 published notes
already use ours"*. That is true of a note that names one feed, and rule 15
says so rather than asking 274 notes' worth of habit to change for nothing. It
stops being true the day StableKraft names a song inside an episode or a
playlist row.

**The song a split paid comes after the episode.** boostmebitch and candr.space
both add the song's feed and item guids after the episode pair already. The
episode stays first because that is where the listener pressed boost.

## A guid is dropped, never cut
<a id="truncate"></a>

boostmebitch drops a track guid too long for its site-sign route (which refuses
a tag value over 512 characters) rather than cutting it: a shortened guid is a
different guid, and it names a different item or none.

## The `sender` tag holds a hex key
<a id="sender"></a>

**Five receivers write one today, all as an `npub`.** boostbox writes
`["sender", <npub>]` from the boostagram's `sender_npub` or a hex `sender_id`
(`sender-npub`, `src/boostbox/boostagram.clj` at `7ca76b5`). The Helipad bot
writes one from `nip19.npubEncode` (`lib/sender-tag.ts` at `cad5916`). The three
thelounge-candr bots share one `lib/payer-pubkey.js`, byte-identical in all
three at `7fa1095`, which also writes an `npub`. No sender app writes one.

**Chad decided on 2026-11-16 to keep it and give it one form.** The first draft
asked whether to standardise the tag or drop it; the answer was standardise,
with a hex key as other Nostr tags use. The bots that write an `npub` change.

**Why hex.** `p` and `P` hold a key as 64 hex characters, and
[NIP-19](https://github.com/nostr-protocol/nips/blob/master/19.md) says its
bech32 forms *"are not meant to be used inside the standard NIP-01 event
formats or inside the filters, they're meant for human-friendlier display and
input only"*. A reader that compares a `sender` with an event's `pubkey` or a
`p` tag otherwise has to know which form it holds and decode it first. NIP-19
also asks clients to *"still accept keys in both hex and npub format for
now"*, and the notes these bots have already posted cannot be edited, so a
reader decodes an old `npub` (rule 23).

**Why not a `p` tag.** boostbox's own comment says it: a `p` tag *"would put
this bot's signed note in the mentions of whatever npub a payer named: a
notification the payer chose, the recipient cannot decline, and no one can
delete."* `sender` records who paid and notifies nobody. It is a multi-letter
tag, so relays do not index it either; a reader finds a payer's boosts by
reading the notes, not by a `#sender` filter.

## A note is for a boost a person pressed
<a id="pressed"></a>

[nip-value-playback-events.md](../nip-value-playback-events.md) is built on
this split: a boost the listener pressed already has a kind `1`, and streams
and auto-boosts get kinds `3369` / `33369` / `23369` because a kind `1` for each
would flood a feed — a ten-minute settle interval is six notes an hour, and the
person buried is the listener who opted in.

DoerfelVerse posts a kind `1` for every auto-boost (`Auto boost for "<title>"`,
`contexts/AudioContext.tsx` at `aedd069`). StableKraft posts none. The first
draft made it a SHOULD NOT and left it open, because it changes what
DoerfelVerse does today. Chad decided on 2026-11-16: *"Auto boost should not
post to Nostr."* So it is a MUST NOT, for the app that sent the auto-boost and
for a receiver alike. The payment is not touched: the recipient still gets the
sats and the boostagram's metadata. Only the note goes.

**A stream payment stays a SHOULD NOT.** The question named auto-boosts, and
the answer did not reach streams, so their rule is the first draft's.

**This rule is about kind `1`.** Whether an auto-boost may ever be published as
a playback event is a question for
[that draft](../nip-value-playback-events.md), whose privacy section already
says to ask the listener separately and to default to off. Nothing here asks an
app to write one.

**A receiver has only `action` to go by, and it is not always there.**
[bLIP-10](https://github.com/lightning/blips/blob/master/blip-0010.md) names two
values, `boost` and `stream`. StableKraft sends `auto` on an auto-boost;
Helipad numbers that action `4`, and the Helipad bot's default send rules drop
it with streams (`DEFAULT_SEND_RULES`, `lib/config.ts` at `cad5916`).
DoerfelVerse sends its auto-boost as `action: 'boost'` with `sender_name`
`Auto Boost` (`createSimpleWebLNTLVRecords`, `utils/payment-utils.ts` at
`aedd069`), so no receiver can tell it from a boost a person pressed. For that
boost, only DoerfelVerse can keep it off Nostr, so the rule binds the app that
sent it and not only the receivers.

## A boost is not posted twice
<a id="twice"></a>

boost-after-boost and libre-relay-bot skip a boost sent through BoostMeBitch or
BoostMeBuddy, because that app posts its own note. Without the skip, one boost
shows twice in a follower's feed — once from the listener, once from the bot.
The match is on `app_name`; nothing in a boostagram says "this boost already
has a note".

## Readers read the tags
<a id="read-tags"></a>

DoerfelVerse's `/boosts` page reads its own notes back with regular
expressions (`parseBoostFromEvent`, `app/boosts/page.tsx`). A change to its
template needs a change to the parser in the same commit, and the parser still
has to read every note published under the old one, because a kind `1` cannot
be edited and a deletion is only a request. boostmebitch parses nothing: it
matches its own notes on tags. Moving to this format is exactly the template
change that breaks a parser, which is why the rule is to read the tags.

## What was considered and rejected
<a id="rejected"></a>

**Keep each app's layout.** Chad asked for one format across his apps, and a
listener who follows two of them sees one boost described two ways.

**The arrow, `<who> boosted <N> sats → <show>`** (boostmebitch before the
branch, candr.space, boostbox). It names the container whatever was paid.
That is the bug Chad saw.

**The bracket line, `⚡ [<show>] [<episode>] <who> boosted …`** (candr-boost,
and the announcer lines boost-after-boost copies). Same order — the container
first — and no place for a song.

**The Fountain style, `⚡ <N> sats • "<title>" by <artist>`** (StableKraft,
DoerfelVerse). It names the right thing on a track, but it has no sender, no
`from`, and quotes that double. StableKraft's comment calls it "Fountain-style";
whether Fountain itself still writes it was not checked.

**Labelled lines** (v4v-toolkit, libre-relay-bot, boostmebitch's old `📻` and
`🎵`). See [the first section](#what-then-where).

**The settled amount.** See [`<N>`](#intent).

**`via` from receivers only** — the first draft's rule. Chad chose every app.
See [`via`](#via).

**No default name, so the sentence says `Boosted`.** Chad kept the defaults.
See [`<who>`](#who).

**An `npub` in `sender`, or no `sender` tag at all.** See
[the `sender` tag](#sender).
