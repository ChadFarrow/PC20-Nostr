# Value Playback Events on Nostr

`draft` `optional`

Kinds `3369`, `33369`, `23369`

A Podcasting 2.0 app moves money continuously while something plays —
streaming sats on a timer, auto-boosts fired by playback position. That
payment carries rich metadata, and today the metadata reaches exactly one
party. This document specifies how an app publishes it on Nostr instead, so
an artist, a host, a dashboard or a stats page can read what was paid for
without asking anyone's Lightning node.

**These kinds describe UNATTENDED payments — `stream` and `auto`.** A boost
the listener pressed already has a first-class artifact: a kind `1` note, or
a [NIP-57](https://github.com/nostr-protocol/nips/blob/master/57.md) zap
receipt when the recipient's LN service supports one. Publishing a second
record for the same button press gives every consumer a de-duplication
problem in exchange for nothing. Emit these for the payments that have no
artifact at all.

## Motivation

Payment metadata rides in TLV record `7629169` on the Lightning payment
itself, which means it is visible to the recipient's node and lost to
everything else. A listener who streams sats for six hours produces no public
trace that any of it happened.

The two obvious vehicles both fail, for opposite reasons. Kind `1` floods a
social feed with machine output — a ten-minute settle interval is six notes
an hour, and the person being buried is the listener who opted in. Kind `9735`
zap receipts only exist for payments that went through the NIP-57 LNURL path;
keysend pays nothing to Nostr, and a value block splitting across four
recipients produces four payments and, at best, one receipt.

These kinds are queryable by any client and rendered by none. That is the
whole design: the data becomes available without becoming content.

## Kinds

| Kind | Range | Retention | Purpose |
| --- | --- | --- | --- |
| `3369` | regular | stored | one receipt per payment interval |
| `33369` | addressable | latest per `(pubkey, kind, d)` | one author's totals per feed or item |
| `23369` | ephemeral | not stored | live ticker for overlays |

The ranges are the ones
[NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) defines:
`1000 <= n < 10000` is regular, `20000 <= n < 30000` is ephemeral, and
`30000 <= n < 40000` is addressable. All three reference content using
[NIP-73](https://github.com/nostr-protocol/nips/blob/master/73.md) `i` and `k`
tags, so a consumer queries every event for a feed, an episode or a track with
one `#i` filter regardless of which kind produced it.

**All three kinds are self-assigned, not NIP-allocated.** As of this writing
none of them appears in the
[Nostr kind registry](https://github.com/nostr-protocol/nips/blob/master/README.md);
confirm there is still no collision before depending on them in production,
and treat this document as the canonical claim. The cost is worth naming
because it is the same one kind `10333` carries: relay filters are
kind-scoped, so a later NIP landing on `3369` puts two unrelated event types
into every query any implementer of this document makes, with no way to tell
them apart from the filter alone.

## Kind 3369: Value Playback Receipt

A regular event describing sats sent during one interval of playback.

`.content` is the boostagram message when one exists, and an empty string
otherwise. An unattended payment has no message, so in practice it is empty.

### Tags

| Tag | Value | Required | Notes |
| --- | --- | --- | --- |
| `i` | `podcast:guid:<feed guid>` | yes | optional url hint as third element |
| `k` | `podcast:guid` | yes | NIP-73 content id kind |
| `i` | `podcast:item:guid:<item guid>` | no | present when the payment targets a track or episode |
| `k` | `podcast:item:guid` | no | for music feeds the item is the track |
| `i` | `podcast:publisher:guid:<guid>` | no | artist-level rollups |
| `k` | `podcast:publisher:guid` | no | |
| `amount` | millisats, string | yes | what SETTLED — see below |
| `action` | `stream` \| `auto` | yes | mirrors the TLV `action` field |
| `start` | unix seconds | yes | wall clock, start of the interval |
| `end` | unix seconds | yes | wall clock, end of the interval |
| `alt` | human-readable summary | yes | NIP-31 — see below |
| `position` | seconds into the item | no | playback position, the TLV `ts` field |
| `session` | opaque string | no | groups consecutive intervals of one listen |
| `app` | app name | no | TLV `app_name` |
| `name` | sender display name | no | TLV `sender_name` |
| `p` | recipient pubkey | no | when a recipient's Nostr identity is known |
| `bolt11` | invoice | no | omit for keysend |
| `preimage` | payment preimage | no | omit when the rail returns none |

**`amount` is what settled, never what was owed.** The two differ more often
than they look like they should: a value block splits one payment across
several recipients and any leg can fail on its own, so an app that publishes
the intended total produces a public record overstating what moved, and
nothing downstream can tell it from a true one. Sum the legs that returned
success.

This is deliberately the opposite of the convention a kind `1` boost note
follows, where the amount is the listener's *intent* — "boosted 100 sats"
should survive one failed leg, because the sentence is about what the person
did. A receipt is not about what the person did. Do not copy the note's rule
here because the two fields have the same name.

**Do not publish a receipt for a payment whose outcome you do not know.**
This is the rule most likely to be skipped and the most expensive to skip.
[NIP-47](https://github.com/nostr-protocol/nips/blob/master/47.md) gives a
wallet a bounded time to reply, and a reply timeout is not a refusal: the
request was published, the wallet may well have paid, and no preimage exists
either way. An app treating that as failure and one treating it as success
are both asserting something they cannot support. A boost UI can render the
ambiguity as a third state and let the person look at their wallet. A signed
event on a relay has no third state and cannot be corrected. Publish for legs
that provably settled; stay silent for the rest.

**`alt` is required here even though NIP-31 makes it a SHOULD.** No client
renders these kinds — that is the point of them — so an `alt` is the only
thing standing between a general-purpose client and an empty box. A receipt
is machine data that will nonetheless be looked at by people debugging why
their sats are not arriving.

**Derive an entry's kind from the identifier, not from an adjacent tag.** The
kind is already the identifier's prefix. Pairing each `i` with a `k` is the
layout NIP-73 itself shows and is fine at this scale — a receipt carries at
most three identifiers — but a reader that walks `i`/`k` in pairs will fail on
a writer that emits one `k` per distinct kind at the end, which is what
[pc20-favorites.md](pc20-favorites.md) requires for a list where the pairing
cost 11 KB of a 36 KB event. Accept both layouts. Use a known-kinds table
rather than splitting the string: item guids are routinely permalink URLs, so
"everything before the last colon" on
`podcast:item:guid:https://example.com/ep/42` yields `podcast:item:guid:https`,
a `k` value no relay filter will ever match.

**`start` and `end` describe an interval, not a moment.** Without them a
consumer cannot distinguish a retried publish from a second payment, which
matters because publishing and paying are not atomic and never will be.

**`position` is separate from `start`/`end` on purpose.** Wall-clock time and
playback position diverge on seek, pause and repeat, and reconstructing what a
listener actually heard needs both.

**The identifiers must be the ones the PAYMENT carried**, not the ones
describing whatever is playing when the receipt is written. On a music show
the two come apart routinely: a settle is a lump for time already listened, so
by the time it fires the player has usually moved to the next track. An app
that re-derives the identifiers at publish time names the wrong song, and
because the boostagram named the right one there is nothing on either side
saying they disagree. Capture them with the payment.

```json
{
  "kind": 3369,
  "content": "",
  "tags": [
    ["i", "podcast:guid:c90e609a-df1e-596a-bd5e-57bcc8aad6cc"],
    ["k", "podcast:guid"],
    ["i", "podcast:item:guid:d98d189b-dc7b-45b1-8720-d4b98690f31f"],
    ["k", "podcast:item:guid"],
    ["amount", "30000"],
    ["action", "auto"],
    ["start", "1740000000"],
    ["end", "1740000180"],
    ["position", "412"],
    ["session", "0f3a9c21"],
    ["app", "MSP 2.0"],
    ["alt", "30 sats streamed to Copenhagen Time (value playback receipt)"]
  ]
}
```

## Kind 33369: Value Playback Summary

An addressable event holding aggregate totals, so a consumer fetches one event
instead of pulling and summing every receipt.

**A summary is DERIVED, never accumulated.** It is a pure function of the
`3369` receipts it summarizes: read them, sum them, publish the result. An app
that instead keeps a running counter and adds to it has built something nobody
else can reproduce or check, and — because the event is replaceable — something
a second writer silently destroys.

That single decision is what makes the kind safe to share, so the rest of this
section is mostly its consequences.

### Scope: the author, not the app

**A `33369` summarizes every `3369` by its own author for that id, whichever
app wrote them.** It is not "what this app paid" and it is not a global total
across everyone.

`.d` is the full NIP-73 id being summarized, for example
`podcast:item:guid:d98d189b-dc7b-45b1-8720-d4b98690f31f`. Use the id verbatim
rather than a bare guid, or feed-level, item-level and publisher-level
summaries collide in one namespace.

This is what removes the collision rather than managing it. Addressable events
are keyed by `(pubkey, kind, d)`, so two people never collide — different
pubkey, different address. The only collision available is **one person, two
apps, one key, same `d`**, and author scope dissolves it: both apps read the
same receipts from the same relays and compute the same `amount` and `count`,
so the second writer finds nothing to say and stays quiet. Two writers
converge on a value instead of fighting over it, and no coordination is needed
to arrange that — but see rule 3 below for the comparison that has to be made
for this to hold, which is not the obvious one.

**Do not namespace `d` by app to sidestep this.** It removes the collision by
removing the sharing: a consumer then has to discover every app the person has
ever used before it can trust a total, and an app the person stopped using
leaves a permanently stale address that still answers queries.

Kind `10333` solves its version of this with a read-merge-union, which works
because favorites are set members. Totals are not — merging two numbers whose
overlap is unknown double-counts — so the answer here is not to merge two
results but to make both writers compute the same one.

### Monotonicity

**`amount` and `count` MUST NOT decrease at a given address.** A writer that
computes a total lower than the one already stored there has an incomplete
view, not a smaller truth: publish nothing.

The justification is in the domain rather than in the protocol. Payments are
append-only in reality — a payment that happened does not un-happen — so the
only honest reason a derived total shrinks is that the writer failed to see
some receipts. Relays lose events, an app queries a narrower relay set, a
timeout truncates a page. Every one of those looks identical to "there is
genuinely less", and picking the safe direction means never erasing the record
of money that did move.

This is also what stops the pathological case. Two apps with **partial and
different** views of the receipts would otherwise flip-flop forever, each
publish locally reasonable, the only symptom being that it never stops.
Monotonicity converts that into a settle: the value rises to the most complete
view any single writer has, and then stops.

**Be clear about what that costs.** When no writer can see every receipt, the
total is an understatement and nothing on the wire says so. `count` is what
makes it detectable — a consumer that can see more receipts than the summary
counts knows the summary is behind. That is why `count` is required here and
optional on a receipt.

### Publishing rules

These are the same three [`10333`](pc20-favorites.md#merging) follows, for the
same reasons.

1. **Read the current summary before every publish**, and compare against what
   you derived. This is what enforces monotonicity, and it is the only way to
   notice another writer.
2. **Never publish on a read you do not trust.** An empty or partial answer
   from the relays means "nothing replied" at least as often as it means
   "nothing is there", and a summary derived from a truncated receipt query is
   exactly the understatement [Monotonicity](#monotonicity) exists to suppress.
   A read that did not demonstrably reach a relay is not a zero.
3. **Publish only when `amount` or `count` changes — compare the DERIVED
   VALUES, never the bytes.** A summary recomputed on a timer is unchanged
   almost every time, and republishing it is pure relay churn on a kind whose
   volume section already names rate limits as the binding constraint.

   The comparison must be on the two numbers because **the rest of the event
   legitimately differs between writers and a byte test would loop forever**.
   `alt` is free-text and two implementations will not phrase it the same way;
   `first` and `last` are optional, so one writer emits them and another does
   not. Under a byte test each app then sees an event that "changed", rewrites
   it, and hands the other app the same trigger — two writers rewriting one
   address against each other indefinitely, every publish locally reasonable,
   the only symptom being that it never stops. Kind `10333` has this failure
   mode too and names it for the same reason.

### Tags

| Tag | Value | Required |
| --- | --- | --- |
| `d` | NIP-73 id being summarized | yes |
| `i`, `k` | as in `3369` | yes |
| `amount` | total millisats over the author's receipts | yes |
| `count` | number of receipts aggregated | yes |
| `alt` | human-readable summary | yes |
| `first` | unix seconds, earliest receipt counted | no |
| `last` | unix seconds, latest receipt counted | no |

`.content` MAY carry a JSON object with additional breakdown. A consumer MUST
NOT require it, and a writer MUST NOT put anything there that the tags
contradict.

```json
{
  "kind": 33369,
  "content": "",
  "tags": [
    ["d", "podcast:item:guid:d98d189b-dc7b-45b1-8720-d4b98690f31f"],
    ["i", "podcast:item:guid:d98d189b-dc7b-45b1-8720-d4b98690f31f"],
    ["k", "podcast:item:guid"],
    ["amount", "1420000"],
    ["count", "84"],
    ["first", "1739900000"],
    ["last", "1740000180"],
    ["alt", "1420 sats streamed to this track by me in total"]
  ]
}
```

Note the `alt`: a summary speaks for one person's payments, and its
human-readable form should say so. "1420 sats streamed to this track" reads as
a global figure and is the wrong claim by however many other listeners there
are.

### Totals across people

**A consumer that wants "what has this track earned" sums the `33369` events
from every author**, one `#d` or `#i` filter, no coordination. Author scope is
what makes that sum correct: each event covers a disjoint set of payments, so
there is nothing to de-duplicate.

**A global total is not expressible as a `33369` and this document does not
try.** A podcaster publishing what their show earned would be summarizing
payments they did not make and hold no receipts for — an assertion no consumer
can check against anything, which is a different kind of object from a derived
summary and needs its own design. That also settles a question the earlier
draft left open: the choice was never "podcaster-signed or app-signed", because
those two answer different questions.

## Kind 23369: Value Playback Ticker

An ephemeral event with the same tag structure as `3369`. Relays forward it to
currently-subscribed clients and do not store it. Intended for live dashboards
and stream overlays where history is unwanted and persistence should not
accumulate.

A publisher MAY emit both `23369` and `3369` for the same payment — the
ephemeral one for immediate display, the regular one for the durable record.

**Do not treat an empty read as evidence a relay refused it.** Not storing an
ephemeral event is the correct behavior, so a relay that accepts the write and
returns nothing on a subsequent `REQ` is working. A relay that stores it is
ignoring the range, which costs storage but still delivers. Only a rejected
write is a refusal, and any acceptance test that conflates the first case with
a failure will report every conforming relay as broken.

## Relay guidance

**Volume is the settle interval divided into the listening time, multiplied by
the number of independent payment targets — not a fixed rate.** An app
settling every three minutes against one value block produces about 480
receipts a day of continuous listening. The same app settling every ten
minutes produces 144. But an app that accrues into a bucket per
`<podcast:valueTimeSplit>` track settles each bucket against its own value
block, and one that follows a live show's value block emits at every block
change — which on a music show is once per song, several times the timer rate,
concentrated into the exact hours a show is on air. Size against the per-track
case, because that is what meets a rate limit first.

Publishers SHOULD keep listener-rate `3369` and `23369` traffic off
general-purpose relays — a relay they operate, or the author's own write
relays — and publish `33369` summaries outward.

**But receipts must stay readable by anything that will derive a summary from
them, and that makes relay placement a correctness rule rather than a courtesy
one.** A `33369` is a pure function of the author's receipts, which is the
whole reason two apps under one key converge on the same total instead of
overwriting each other. Send those receipts somewhere only one app can read
and the property is gone: each app derives from a different subset, the
monotonicity rule pins the total at whichever view happened to be widest, and
every writer with a narrower one goes permanently silent. So publish `3369` to
relays the AUTHOR reads — their NIP-65 write set is the obvious choice, since
that is where their other apps already look — rather than to a set private to
one app. "Off the general-purpose relays" and "somewhere only I can see" are
different instructions, and only the first one is meant here.

**Verify acceptance by writing AND reading back, per relay.** A relay may
answer `OK true` and store nothing, and a publisher trusting the `OK` then
believes it holds a durable record it does not have. General-purpose relays
store any regular kind by default, but many relays in ordinary use are not
general-purpose — an index, an app's own relay, a cache — and a kind
allowlist is invisible until you write to one. Neither the valid NIP-01 range
nor the absence of a registry collision predicts what a given relay does.

Relays MAY reject `3369` events whose `start`/`end` interval overlaps an
already-stored event with the same `session` tag from the same pubkey.

## Privacy considerations

**A listener's signing key plus per-track receipts is a complete, public,
timestamped listening history.** This is a large disclosure and it is not
obvious to a person who has agreed to "share my boosts". Those are two
different things: one note per button press describes a payment the person
chose to make and chose to announce; a receipt stream describes everything
they listened to, including the parts they did not choose to announce and the
hours during which they did it. An app that has consent for the first does not
have consent for the second. Ask separately, and default to off.

Publishers SHOULD sign these events with a key that is not the listener's
social identity key. Options, in rough order of preference:

1. The app's or podcaster's server signs, having received the metadata out of
   band.
2. A per-session ephemeral key, discarded afterwards.
3. The listener's identity key, only on explicit opt-in.

**Anonymous payments MUST NOT be published under an identity key, and there is
no partial version of this.** An app that lets a listener pay anonymously
typically implements it by dropping the sender fields, so the tempting reading
is that a receipt without a `name` tag satisfies the promise. It does not: the
event is **signed**, so the author pubkey is present whatever the tags say,
and it is the same pubkey the anonymity setting exists to withhold. There is
no quieter receipt to send. The answer is no event.

**A summary is a sharper disclosure than the receipts it derives from, and
author scope is what makes it so.** A `33369` sits at a stable, guessable
address — `(pubkey, 33369, <the NIP-73 id>)` — so a `#d` filter answers "who
has streamed to this track" directly, and each answer carries a total and a
date range rather than requiring anyone to assemble one. Receipts are already
public and already `#i`-indexed, so this reveals no new fact; what it changes
is the cost of asking, from a query plus arithmetic to a single lookup. It is
also monotonic and therefore permanent by design. An app that offers receipts
and summaries as one setting should say that the second one is the searchable
half, and an app offering them separately should default the summary off even
when receipts are on.

The same reasoning constrains option 1. A server signing on every listener's
behalf pools their histories under one key, which removes the per-listener
disclosure and creates a single pubkey emitting every listener's events — an
easier target for a relay rate limit, and a single record whose compromise is
worse than any individual one. It is the right choice for a podcaster
publishing their own show's totals and the wrong one for an app publishing its
users' listening.

## Test vectors

A conforming implementation should pin at least these. They are stated as
behaviors rather than fixtures so they can be written against any test runner.

**1. A partly-failed batch publishes the settled amount.** Given a value block
of four recipients where one leg fails, the receipt's `amount` equals the sum
of the three that succeeded, not the total requested. A test that only ever
exercises the all-succeed path passes against an implementation that publishes
intent.

**2. An indeterminate leg publishes nothing.** Given a wallet that accepts the
request and never replies, no receipt is emitted for that leg — neither a
success nor a zero. Assert on the absence.

**3. An anonymous payment publishes nothing.** With the app's anonymity
setting on, no event is signed at all. Asserting only that the `name` tag is
absent passes against an implementation that still leaks the pubkey, which is
the whole failure.

**4. The identifiers follow the payment, not the playhead.** Accrue against
one track, advance playback to a second, then settle. The receipt's `i` tags
name the first track. This is the vector that catches re-deriving identifiers
at publish time, and it cannot fire on a show with a single value block.

**5. A reader accepts both `k` layouts.** A receipt with `k` paired after each
`i` and one with a single trailing `k` per distinct kind parse to the same
entries.

**6. An ephemeral write that reads back empty is a pass.** An acceptance check
against a relay reports a stored `23369` and an absent one as two different
successes, and only a rejected write as a failure.

**7. Two writers converge on a summary instead of overwriting it.** Give two
writers the same author key and the same visible receipts, let the first
publish a `33369` for one `d`, then run the second. It must publish nothing.
Two things are being tested at once and both fail silently on their own: a
writer that keeps a running counter instead of deriving computes a different
number and overwrites, and a writer that compares the whole event instead of
`amount`/`count` sees its own `alt` wording differ and rewrites. **Give the
two writers different `alt` text and different `first`/`last` behaviour**, or
the second half of the vector cannot fail and the ping-pong reaches production
instead.

**8. A shrinking total publishes nothing.** With a summary of 84 receipts
already stored, hand a writer a receipt query that returns only 40 of them.
It must publish nothing, leaving the stored 84. Assert on the absence of a
publish, not on the value it computed — an implementation that derives 40
correctly and then sends it has done the arithmetic right and the protocol
wrong.

**9. An untrustworthy read publishes nothing.** Same as 8, with a receipt query
that fails or returns nothing at all rather than returning a subset. A derived
total of zero must never reach a relay. This is a separate vector from 8
because the code paths differ: 8 is caught by comparing against the stored
value, 9 is caught before there is anything to compare, and an implementation
that only has the first check will publish a zero into an address whose stored
value it could not read either.

## What this format does not do

- **No proof of payment for keysend.** `preimage` is optional because most
  rails do not hand one back, and keysend has no invoice to carry in `bolt11`
  either. A receipt is therefore an assertion by its author, not something a
  consumer can verify — which is fine for stats and wrong for anything
  settling an account. Do not build a payout system on it.
- **No de-duplication of receipts across apps, and none needed.** A listener
  signed into two apps on two devices streams from both, and each publishes
  its own receipts. Those are distinct payments, so summing them is correct.
  `session` groups one app's consecutive intervals and says nothing across
  apps, so it cannot be used to tell one listen from two.
- **No headcount.** Summing `33369` events answers "what did this track earn
  from people who publish", and counting their authors gives a floor on how
  many people that was — never the real audience, since a listener who has not
  opted in leaves nothing behind at all. Treat both numbers as a lower bound
  and do not present either as reach.
- **No retraction.** A receipt published in error stays published: there is no
  tombstone, and `5`-kind deletion is a request rather than a guarantee.
  Summaries inherit this and make it sharper — they are monotonic, so an
  overstatement caused by a receipt that should not have been published cannot
  be corrected downward by any writer following this document. Deleting the
  receipt does not lower the summary.

## Open questions

- **Whether monotonicity should ever be escapable.** `amount` and `count` at
  an address never decrease, which is right for a record of payments that
  really happened and wrong for a person who wants their listening history
  reduced. Today the only retraction available is deleting the underlying
  receipts and abandoning the summary, which leaves a permanently overstated
  event that still answers queries. A signed downward revision would need a
  way to distinguish "I mean this" from "my relay read was short", and nothing
  here provides one — a `reset` marker a writer could set by mistake would
  hand every incomplete view a licence to erase the total.
- **Whether `amount` should be the sender's total or the individual split
  amount.** Per-split receipts describe payments more accurately and multiply
  event count by the number of recipients — on a four-way block that is four
  times the volume the [Relay guidance](#relay-guidance) already calls the
  binding constraint. This document specifies the total that settled, which is
  one event per interval per target. A per-leg variant would need its own tag
  to name the recipient and is not specified here.
- **Whether an app should be able to publish a receipt at all**, given the
  [privacy](#privacy-considerations) section, or whether option 1 and option 2
  are the only defensible sources. The listener-key path is specified because
  attribution is what makes a listener want to publish, and forbidding it in a
  document nobody is obliged to follow would produce apps that do it anyway
  without the opt-in.

## Implementations

**One, on a branch, not merged.** `boostmebitch` implements kind `3369` only,
for streaming settles, off by default, in
[`lib/nostr/value-playback.ts`](https://github.com/ChadFarrow/boostmebitch/blob/631c1f6a74a84053a1a3101342d63e10a4d6e6f8/lib/nostr/value-playback.ts)
and the emitter in `lib/v4v/streaming.ts`, at commit `631c1f6`
(branch `claude/new-relay-type-draft-6osmum`; the blob link is pinned to the SHA
because the branch name contains slashes and GitHub cannot parse it in a
path). It does not implement `23369` or `33369`.

That is one writer, unmerged, and no measurements from production. **Read
every rule above as a design decision with a named failure mode behind it, not
as observed practice.** Several came out of building that implementation —
rules 1 through 4 in [Test vectors](#test-vectors) each describe something the
obvious code does wrong — but "an implementer found this while writing it" is
weaker evidence than "an implementation shipped it and the bug appeared", and
nothing here has the second kind yet.

Relay acceptance is **unmeasured**. The ranges are valid and the registry is
clear, and neither fact predicts a given relay's answer; see
[Relay guidance](#relay-guidance) for what to test and why the ephemeral case
needs two success outcomes.
