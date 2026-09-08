# Conformance suite

The 31 test vectors that pin
[`../pc20-favorites.md`](../pc20-favorites.md), as code you can run against
your own implementation. They are stated as behaviors in
[`vectors.md`](vectors.md) beside this file.

Behaviors rather than fixtures means they can be written against any test
runner. Until this directory existed that meant every implementer
hand-translated them and hoped.
Both existing apps found their defects by shipping instead — one of them
records fifteen, and notes that the worst passed every check the other fourteen
added.

## Run it

```bash
node --test conformance/vectors.test.mjs
```

**Name the file, not the directory.** `node --test conformance/` fails with
`Cannot find module` on Node 22 — it resolves the argument as a module before it
looks for tests. Nothing is wrong with your setup.

No dependencies, no build step, no `package.json`. Node 18 or newer.

## Point it at your app

Either change one line at the top of `vectors.test.mjs`:

```js
const ADAPTER = await import(/* ... */ './reference/favorites.mjs');   // <- your module here
```

or leave this repo untouched and name your shim from your own checkout, which
is how the two existing apps run it:

```bash
PC20_FAVORITES_ADAPTER=./scripts/conformance-adapter.mjs \
  node --test ../PC20-Nostr/conformance/vectors.test.mjs
```

Your module exports the functions in [`adapter.d.ts`](adapter.d.ts). Two do the
work:

| | |
|---|---|
| `parseTags(tags)` | Tag array in, structure out. Vectors 5, 6, 7, 19, 20, 25, 28. |
| `plan({read, local, baseline, mode})` | One publish cycle, decided but not sent. Everything else. |
| `encodePlaintext` / `decodePlaintext` / `seal` | The bytes on either side of the signer. Vectors 22, 23, 24. |

Both are pure, so the suite needs no relay, no signer and no clock. A failure
is your merge, never your test environment.

These carry most of the weight, and each is a bug somebody has already
shipped. The spec states rules about bytes; this is the shape of the code that
keeps you from breaking them, which is why it lives here and not there:

- **`read: null` is not an empty list.** `null` means the read is not
  trustworthy; `{tags: [], content: ''}` means the relay answered and has
  nothing. Same code path for both republishes a whole library as empty.
- **`publish: null` is a valid outcome.** It is how "the bytes did not change"
  is said. A writer that always publishes has two apps rewriting the event
  against each other forever.
- **`baselineIfLanded` is returned, not recorded.** A baseline written for an
  event that never reached a relay says "I am already asserting this", so the
  entry is never retried — lost permanently, while the UI reports success.
- **`favorited` on a local group is a plain boolean**, and false is an
  ordinary answer. A feed entry is written only when it is true, so a feed you
  hold only to supply its items' feed guid never reaches the list at all.
- **A baseline claim on an item is the PAIR**, built with `itemClaim`. An item
  guid is unique inside its feed and is not globally unique, so a baseline
  keyed on the identifier alone cannot tell two items in two feeds apart and
  removing one removes both.
- **Make the read part of the same call.** Do not expose a "publish my
  favorites" entry point at all — `plan` takes `read` for exactly this reason.
  A caller that *can* publish without reading eventually will, and under
  wholesale replacement that is the whole list.
- **Do not give the carried `content` a default.** A default is how a `""`
  gets written back by habit: one caller that omits the argument compiles,
  type-checks and deletes another app's data. Building a list from scratch is
  the only case with nothing to carry, and it can say so at the call site.
- **Capture `content` on the read.** An implementation that never reads the
  field has nothing to put back even in principle, which is the state both
  existing implementations were in when this was found.
- **`capabilities` is optional, and its default is ON.** Export it only to
  declare a feature the spec makes optional to OFFER — today just
  `artistFavorites`. It skips the originating part of that feature's vector and
  nothing else; carrying is mandatory and still runs. An adapter that exports
  nothing is tested in full, because silence must never skip a check.

If your app's shapes differ, adapt in the shim rather than editing the vectors.
The vectors are the spec; the shim is yours.

## What each vector catches

One line each. The full statement of every vector is in
[`vectors.md`](vectors.md), and the numbering matches it exactly.

| # | What it catches |
|---|---|
| 1 | A writer built from local state alone — the natural way to write one |
| 2 | A failed read treated as an empty list |
| 3 | A merge that is not idempotent, so two apps never converge |
| 4 | Dropping a tag, `k` value or identifier written by a newer app; an unreadable position 2 read as a feed favorite |
| 5 | Items reattached to the wrong feed; an unknown medium defaulted to `podcast` |
| 6 | An entry kind read off position 1 alone, so `podcast:item:guid` never reaches the event; and `podcast:item:guid:https` — a `k` value no relay filter matches |
| 7 | A reader that walks `i`/`k` in pairs, showing an empty library and no error; a writer that compares the read as it arrived and republishes a list nothing changed about |
| 8 | A baseline ignored, so removals either never propagate or delete everything |
| 9 | The resurrection loop: an entry another app deleted returning on every load |
| 10 | A lost publish made permanent by recording its baseline anyway |
| 11 | Removing a feed favorite dragging somebody's saved items out with it |
| 12 | Blanking `content` over another app's encrypted entries |
| 13 | A user left 97% private, or a private entry disclosed as a relay-indexed `i` tag |
| 14 | Deleting what you do not write into — invisible for one whole cycle |
| 15 | A list stuck with entries in both places: tidied away, or converged into a duplicated `i` tag |
| 16 | A stated mode ignored on an empty list; a public default that outranks a writer set to private, or that fires over a `content` it cannot read |
| 17 | A list declared public while the entries in it stayed encrypted |
| 18 | Two apps reordering entries at each other forever; a new entry splitting a medium run in two, or landing at the end of the run instead of its band |
| 19 | A duplicate feed entry folded in a way that loses an item, or loses the favorite |
| 20 | An item naming no feed deleted as junk, handed a feed guid nobody knows, or banded in behind an album and given that album's |
| 21 | A foreign `alt` carried beside ours, or ours not first |
| 22 | A literal `?` in the plaintext, breaking every private publish through a NIP-55 signer |
| 23 | A non-array plaintext read as "empty", so the next republish erases it |
| 24 | A private list past the NIP-44 v2 cliff, read back as empty on an older signer |
| 25 | A feed the user never favorited written to the list; two items sharing an item guid folded into one |
| 26 | Unfavoriting a feed taking its saved item with it, or deleting a favorite another app made |
| 27 | Entries rebuilt as `['i', id]`, stripping the feed guid that makes an item resolvable at all |
| 28 | An artist entry given a feed guid, or made an item of the entry above it; an app claiming `artistFavorites: false` that originates one anyway |
| 29 | A removal suspended while the list changes mode — lost for one cycle, then for good |
| 30 | An emptied `medium` run left behind, so an empty `content` reads as one somebody owns |
| 31 | A baseline claim outliving its entry, so the next app to write that entry has it deleted |

## The suite is mutation-tested

A suite that passes everything is worth nothing. Each vector was checked by
breaking the reference on purpose and confirming the right one fails:

| Break the reference this way | Vectors that catch it |
|---|---|
| Hardcode `content: ''` on republish | **12, 13** |
| Recompute the inactive place's baseline claims | **14** |
| Publish local state, ignore the read | 1, 3, 4, 8, 9, 11, 13, 14 |
| Compare against your own last publish, not the read | 1, 2, 3, 4, 6, 8, 10, 11, 12 |
| Never compare at all — always publish | 3, 8, 9 |
| Ignore the baseline | 8, 11 |
| Append everything held locally | 9 |
| Drop a group whose own entry was dropped | 11 |
| Drop tags you cannot parse | 4 |
| Default an unknown medium to `podcast` | 5 |
| Take the kind by splitting at the last colon | 6 |
| Walk `i`/`k` in pairs | 7 |
| Record the baseline inside `plan` | 10 |
| Infer the mode from emptiness, ignoring `visibility` | **16** |
| Withhold the publish on an empty untagged list instead of defaulting to public | **16** |
| Fold the public default into the inferred mode, so it outranks a writer's setting | **16**, 22, 24 |
| Judge a list empty by its entries rather than by `content === ''` | **16** |
| Let a standing preference restate a mode you cannot honour | **17** |
| Re-encode an opaque `content` as an empty array | **17** |
| Append a known group's new items to the end of the event | **18** |
| Put local items ahead of the ones read | **18** |
| Emit band 3 before band 2 | 1, 2, 7, 10, **18**, 28 |
| Append a new entry at the end of the run instead of its band | **18**, 28 |
| Skip the by-feed grouping inside band 3 | **18** |
| Put an item that names no feed in band 3 | **20** |
| Band a run that holds a tag you cannot classify | **4** |
| Declare `artistFavorites: false` from an adapter that originates one | **28** |
| Skip a duplicate feed group | **19** |
| Drop an item that has no group above it | **20** |
| Compare against the read as it arrived instead of reframed | **7**, 17 |
| Carry the `alt` you read | **21** |
| Hand the signer a plaintext with a literal `?` | **22** |
| Read a non-array plaintext as an empty list | **23** |
| Publish a private list past 60,000 bytes | **24** |
| Rebuild `i` tags as `['i', id]` on emit, dropping half the pair | **6, 25, 27** |
| Read an item's feed from the entry above it, ignoring position 1 | **5, 25, 26** |
| Drop the legacy path, so a two-element item names no feed | **4, 27** |
| Republish a legacy item without rewriting it | **27** |
| Invent a feed guid for an item whose feed nobody knows | **20** |
| Key an entry on position 1 alone rather than on the pair | 2, 3, 10, 11, 18, 19, **25, 26** |
| Derive an entry's `k` kind from position 1 alone | **6** |
| Read an unrecognised position 2 as a feed favorite | **4** |
| Write a feed entry for a feed you hold only to supply a feed guid | **25** |
| Let an artist entry be an item of the entry above it | **28** |
| Write a feed guid onto an artist entry | **28** |
| Adopt every entry read on the outer merge of a whole-list move | **29** |
| Adopt every entry read on the merge of the place being moved from | **29** |
| Claim an entry back out of the other place on your baseline alone | **29** |
| Keep a `medium` run the claim-back emptied | **30** |
| Carry a claim for an entry you removed from that place | **31** |
| Retire a carried claim on absence alone, ignoring what you hold | **31** |

The first two rows are not hypothetical. They are the two defects that reached
production on 2026-08-25, and they are why this directory exists.

## `reference/`

An **authored** implementation — it has never served traffic. It exists so the
31 assertions have something to run against, and as a worked example to read
beside the spec. It is not a recommendation and not an extraction.

For code a real site runs, see
[`../catalog/modules/nostr/favorites-list.ts`](../catalog/modules/nostr/favorites-list.ts),
with its trade-offs in
[`../catalog/comparisons/favorites-10333.md`](../catalog/comparisons/favorites-10333.md).

One simplification: the reference's encrypted entries use a reversible,
unauthenticated codec rather than NIP-44. The vectors only care whether a
writer can read `content` or not, and a fake codec models that without making the
suite depend on a crypto library. Real NIP-44 differs in one way that matters —
it draws a fresh nonce per encryption, so identical entries produce different
ciphertext every time. Compare **decrypted arrays**, never ciphertext, or rule
5 never holds and every load republishes.

## Adding a vector

A new normative rule in the spec needs a numbered entry in
[`vectors.md`](vectors.md), and that entry needs a case here. That is what stops the gap this directory closed from reopening the next
time an app discovers a defect the hard way.
