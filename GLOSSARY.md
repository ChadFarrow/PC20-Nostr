# Glossary

Every term this repo uses without stopping to explain it. One or two sentences
each, plus where it turns up here.

If you know Podcasting 2.0 and Lightning already, skip to
[the recipes](catalog/recipes/).

---

## Podcasting 2.0

**Podcasting 2.0** — an effort to add features to podcasting that the original
RSS format never had: chapters, transcripts, cross-app comments, and payments.
It works by adding new tags to a podcast's existing RSS feed.

**The `podcast:` namespace** — those new tags. They live alongside the ordinary
RSS ones, so an old podcast app ignores them and a new one reads them. Tags
look like `<podcast:guid>`, `<podcast:value>`, `<podcast:person>`.
[The feed validator recipe](catalog/recipes/pc20-feed-validator/) checks a feed
for twenty of them.

**Podcast Index** — an open, free index of podcasts, and the directory most
Podcasting 2.0 apps look things up in. It gives every feed a numeric **feed ID**
and tracks its **feed GUID**.

**Feed GUID / item GUID** — a permanent identifier for a show or an episode
that does not change when its URL does. This is what lets two apps agree they
are talking about the same podcast.

**`<podcast:remoteItem>`** — a tag that points at another feed, or at one item
inside another feed, by GUID rather than by copying it. `feedGuid` is the only
required attribute; `feedUrl`, `itemGuid`, `medium` and `title` are optional.

**List feed / `musicL`** — an RSS feed that carries `<podcast:remoteItem>` tags
instead of episodes. Its `<podcast:medium>` is a medium name with `L` added, so
`musicL` is a music playlist and `podcastL` is a list of shows. It holds much
the same thing as kind 10333;
[the two compared](pc20-favorites-vs-list-feeds.md).

**Value 4 Value (V4V)** — the idea that listeners pay what a show is worth to
them, as they listen, rather than through ads or a subscription. In practice
that means streaming sats and boosts.

**`<podcast:value>` block** — the tag in a feed that says who gets paid and in
what proportion. It lists recipients (a node key or a Lightning address) and a
**split**, a relative share. It comes from someone else's feed, so nothing in
it is trustworthy — see
[boostagram-tlv.md](catalog/comparisons/boostagram-tlv.md) for what goes wrong
when you assume otherwise.

---

## Money

**Bitcoin / Lightning Network** — Lightning is a payment network built on top
of Bitcoin. It settles small payments quickly and cheaply, which is what makes
paying a podcaster a few cents mid-episode possible at all.

**sat** — a satoshi, one hundred-millionth of a bitcoin. The unit people
actually talk in. **msat** is a thousandth of a sat, and it is what Lightning
software counts in, so amounts are usually multiplied by 1000 somewhere.

**Invoice / bolt11** — a payment request. `bolt11` is the format; an invoice is
a long string starting `lnbc…` that names an amount, a recipient and an expiry.
**Read one before you pay it**: a wallet pays what the invoice says, not what
you meant to send.

**Lightning address** — an email-shaped address like `someone@getalby.com` that
you can send sats to. Your app turns it into a URL and asks that server for an
invoice.

**LNURL** — the protocol behind that. It defines how an app asks a server for
an invoice. A Lightning address is a friendly spelling of an LNURL.

**keysend** — a payment sent straight to a node's public key, with no invoice
asked for first. This matters for podcasting because you can attach data to it,
which an invoice payment cannot carry.

**Boost** — a listener sending sats on purpose, usually with a message
attached, as opposed to sats streaming quietly while an episode plays.

**Boostagram** — the message and metadata that ride along with a boost: the
show, the episode, the timestamp, the sender's name, what they said.

**TLV record** — the slot a keysend payment carries extra data in. TLV stands
for type-length-value; in practice it is a numbered field. Record **7629169**
carries the boostagram and **7629175** carries the feed GUID.

**bLIP-10** — the specification that assigned those two record numbers and
defined what goes in them. [The boostagram
recipe](catalog/recipes/boostagram-keysend/) implements it.

**WebLN** — a browser API. A Lightning wallet browser extension puts
`window.webln` on the page, and your app asks it to pay. Nothing to configure,
but it only exists on desktop.

**NWC / Nostr Wallet Connect** — the other way to reach a wallet. The user
pastes a `nostr+walletconnect://…` string once, and your app talks to their
wallet through a Nostr relay. Works on mobile, and unlike WebLN it can send
keysend.

**Preimage** — 32 bytes the recipient reveals when a payment settles. It is
proof the payment happened, and anyone holding it can present it as such, so it
should never be logged.

**Zap** — a Lightning payment recorded publicly on Nostr, so a post can show
who paid and how much. Defined by **NIP-57**, which uses two event kinds: 9734
is the request, 9735 is the **zap receipt** the recipient's server publishes.

**BoostBox** — a small self-hostable service that stores a boost's metadata and
gives you back a short URL. You put that URL in the payment description, so the
boost survives a wallet that drops TLV records.
[Upstream](https://github.com/noblepayne/boostbox), MIT licensed.

---

## Nostr

**Nostr** — "Notes and Other Stuff Transmitted by Relays". A protocol for
publishing signed messages to servers anyone can run. There is no central
account: your identity is a keypair.

**Relay** — one of those servers. Clients publish to several and read from
several, because any one of them can be down, slow, or missing your data.

**Event** — one signed message. Every event has a **kind**, a number saying
what sort of thing it is: kind 1 is a note, kind 0 is a profile.

**Replaceable event** — a kind where a newer event from the same author
replaces the older one, rather than adding to it. Good for a list you keep
updating. Dangerous if two apps write it without reading first, because the
second one overwrites everything the first added.

**kind 10333** — the number [this repo's spec](pc20-favorites.md) uses for a
user's podcast and music favorites. It is **self-assigned, not allocated by any
NIP**, so a future NIP could land on the same number.

**NIP** — a Nostr Implementation Possibility, the numbered documents that
define how things work. NIP-57 is zaps, NIP-47 is wallet connect.

**npub / nsec** — a public and a private key in their readable form. `npub` is
safe to publish and identifies you. **`nsec` is the secret**; anything holding
it can post as you, so it must never reach a browser.

---

## Other things you will meet here

**SSRF** — server-side request forgery: tricking your server into making a
request on an attacker's behalf, usually at something inside your own network.
It is why the recipes here refuse to fetch private addresses, and why
[one recipe was withdrawn](catalog/comparisons/image-proxy-ssrf.md).

**`NEXT_PUBLIC_`** — a Next.js prefix. Any environment variable with it is
baked into the JavaScript sent to browsers, so a secret with that prefix is
public. [The BoostBox recipe](catalog/recipes/boostbox-client/) exists mainly
to avoid this.

**PWA** — a progressive web app: a website a phone can install like an app.
[There is a recipe for the install prompt](catalog/recipes/pwa-install-prompt/).

**Extracted / patched / authored** — this repo's labels for where a file came
from. Extracted is byte-identical to a live site, patched is a site's file plus
a named security fix, authored means nobody runs it in production. Every file
in a recipe declares one. See [catalog/recipes/](catalog/recipes/).
