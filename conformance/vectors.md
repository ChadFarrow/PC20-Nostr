# The 31 test vectors

Behaviors a conforming implementation must pin, stated so they can be written
against any test runner. They are executable in
[`vectors.test.mjs`](vectors.test.mjs):

```bash
node --test conformance/vectors.test.mjs
```

[`README.md`](README.md) has a one-line summary of each, the adapter contract,
and the mutation matrix proving every one of these is killed by at least one
defect. The rules they pin are in
[`../pc20-favorites.md`](../pc20-favorites.md); the reasons are in
[`../notes/pc20-favorites-rationale.md`](../notes/pc20-favorites-rationale.md).


**1. A foreign entry survives your republish.** Read a list containing a feed
your app cannot resolve and an item of it, publish, and both must come back
byte-identical, in the same relative position, under the same medium. Your own
new feed lands at the end of its own band, inside its medium run — which need
not be the end of the event. This is the vector that catches a writer built
from local state alone, which is the natural way to write one.

**2. An empty list is distinguishable from a read that never happened.** A
relay answering "I have nothing" and a relay that never answered must produce
different results. Believing the second is how a whole library gets republished
as empty.

**3. Idempotence.** Read your own output, merge, publish: the tag array must be
byte-identical. A format whose writers are not idempotent has two apps
rewriting the event against each other forever, with neither wrong and neither
converging.

**4. An unrecognized tag or identifier kind survives.** A `k` naming a kind you
never emit, an `i` whose prefix is not in your table, a tag type you have no
meaning for — all of them belong to a writer newer than you, and must be
carried through untouched. Pin that a medium run holding one comes back in wire
order rather than banded: a tag with no kind has no band, and inventing a place
for it is how a carried tag ends up somewhere that changes what it means. Pin
two more places this reaches inside a tag. An unreadable entry between a feed
entry and a legacy item must not end the legacy run, or that item is stranded
with no feed at all. And a `podcast:guid:` entry whose **position 2** you
cannot read is not a feed favorite: carry it whole, because reading it as one
turns a newer writer's entry into a followed show.

**5. Placement.** An item entry names its own feed, so shuffling the tag array
moves nothing: parse the same entries in two orders and each item keeps the
same feed guid. `medium` is the exception and is still a running value, and an
entry with no `medium` tag above it reads as unknown rather than `podcast`.

**6. An item entry declares a kind position 1 does not say, and a URL-shaped
item guid does not corrupt it.** The kind is the kind of the entry's LAST
identifier, so `["i","podcast:guid:F","podcast:item:guid:X"]` yields
`podcast:item:guid` even though position 1 reads `podcast:guid`. And it comes
from a table rather than from splitting a string, so an item guid of
`https://example.com/ep/42` yields `podcast:item:guid` and never
`podcast:item:guid:https` — at position 2, and at position 1 in the legacy
form. Pin both, from one list: a writer that reads position 1 alone passes the
string half on its own.

**7. Both `k` layouts parse identically, and neither provokes a republish.**
One `k` per distinct kind and a `k` paired with every `i` describe the same
list; a reader that treats them differently silently loses every entry written
by the other revision. Then pin the writer's half from the same fixture: hold
exactly what the paired layout holds, claim it in your baseline, and publish
nothing. The two layouts differ byte for byte while meaning the same thing, so
a writer comparing the read as it ARRIVED rather than [put through its own
framing](../pc20-favorites.md#5-publish-only-when-the-bytes-change) republishes
a list nothing had changed — on every load, forever, if the other app does the
same.

**8. An entry you removed disappears; an entry you never published does not.**
The same input — on the list, absent from your local state — must produce
opposite results depending on the baseline. Pin both directions from one
fixture, or an implementation that ignores the baseline entirely passes the
half you wrote.

**9. An entry another app removed is not resurrected.** Hold it locally, put it
in your baseline, read a list without it, and it must stay gone. The obvious
append-everything-local step re-adds it, and because the same step runs on the
next load, the favorite returns forever on every device.

**10. A baseline is never written for a publish that didn't land.** Simulate a
publish that reaches no relay: the baseline must be unchanged, so the next
toggle retries. Recording it anyway is what makes a lost publish permanent —
the entry is now "already asserted" and is never sent again.

**11. Removing a feed favorite never touches anybody's items.** Read a list
with a feed entry and two items of that feed, one yours and one another app's.
Take back the feed favorite and your own item: both go, theirs stays, and it
still carries the feed guid it cannot be looked up without — which is the same
string the removed feed entry carried, so a writer keyed on position 1 takes
the surviving item with it. An earlier revision needed a rule to prevent this —
the feed entry was the only tag naming those items' feed, so dropping it
deleted another app's tracks. Pin that the surviving item is complete with no
feed entry left on the list at all.

**12. An opaque `content` survives a republish by a writer that cannot read
it.** The sibling to vector 1, for the part of the event that is not tags. Read
a list whose `content` is a string you have no way to interpret, change a
favorite, publish, and it must come back byte-identical. Pin the inverse in the
same breath — a list built from scratch is legitimately empty — or a writer
that simply never touches the field passes on a technicality.

A writer can pass every vector above this one while blanking `content` on the
first favorite anyone toggles, because none of them look at that field. That is
what makes this one worth stating separately.

**13. Going private takes the whole list, and coming back does not.** Read a
list holding entries you did not write and cannot resolve, choose Private, and
every entry must move — yours and theirs. Then read the result with a standing
setting of Public and no choice, holding whatever this device now holds: the
list says private, so a writer either follows it and publishes nothing, or asks
— and if it publishes at all, only the entries its baseline claims may return
to the tags, and nothing is lost from either place. The two halves of this
vector fail in opposite directions: the first leaves a user 97% private with
nothing on screen saying which entries are still public, and the second
publishes another app's private entry as a relay-indexed `i` tag.

**14. A writer does not delete what it does not write into — and this takes TWO
cycles to observe.** Read an event with entries in both places, where the ones
you do not publish into are not yours. Run a full cycle, feed the baseline it
recorded back in, and run a second. The foreign entries must still be there
after the second. One cycle cannot see this: the first publish emits correct
bytes and only the baseline beside them is wrong, so every single-cycle vector
above passes over it. It fails in both directions from one mistake: the same
writer, in public mode, publishes an empty `content` over encrypted entries it
was carrying, and in private mode publishes an empty tag list over a public
one. Whichever place a writer does not feed is the one at risk, so a writer
using only one is not exempt — it is simply not yet in a position to notice.

Pin the control in the same fixture, or a writer that never claims anything
passes: a list adopted off the relay must still enter the baseline for the
place you *do* write into, or a later change of mode copies instead of moving,
and the entries the user asked to hide stay in plaintext beside the encrypted
copy.

**15. A list found with entries in BOTH places is carried, then converged
once.** Read an event whose public tags and whose decrypted `content` name some
of the same entries, where `content` also holds entries the tags do not. A
cycle must return both intact: an entry appearing twice is not evidence that
either copy is yours, and a writer that tidies the list by emptying one deletes
entries it never wrote. Then converge, with the baseline claiming the inactive
place and the device still holding what it claims — a claim without the entry
behind it is a removal, rule 3 — and pin the thing only this state can produce
— **an entry that was in both places must be emitted ONCE**. The claimed-back
copy is the same entry, not a second one, and concatenating them emits one
favorite as two entries and double-counts it for every reader. The reference
implementation did exactly that, and no vector above reaches the state that
shows it. Carrying it silently is the other failure: every entry in the overlap
is public, so a user who chose Private has not got it and nothing says so.
Measured: 284 public, 287 encrypted, 284 in both, on an account whose every
screen said it was fine. Vector 13 pins the switch; this pins what the next
reader owes the result.

**16. The stated mode outranks whatever the two places happen to hold, and an
empty list is public.** Four fixtures. Read a list with
`["visibility","private"]`, **no entries in either place**, and publish one
local favorite: it must land in `content`, not in the tags. Every rule above
answers this from emptiness, and the tag is what stops an implementation
disclosing that favorite as a relay-indexed `i` tag on the account of a user
who chose Private somewhere else. Then the **default**: the same empty list
with NO tag, and a writer with no preference of its own, publishes into the
tags and states no mode — nobody has chosen, which is where every new user
starts. Pin the two things that keep the default from spreading, because
without them it becomes the disclosure it replaced. A writer whose own setting
is Private meets the same empty list and its setting stands: the default is a
tiebreak, never something the list infers, or it outranks that setting and
publishes the first favorite in plaintext. And a `content` this writer cannot
account for is somebody's encrypted list, so an empty tag list is not an empty
LIST — default there and the next publish puts `i` tags beside ciphertext,
splitting a list somebody else owns. Then the converging half: read a list with
`["visibility","public"]` whose `content` still decodes to entries, and a
writer that can read both must emit each of them once, in the tags, with
`content` emptied. The tag is the consent that licenses that move; without the
tag, vector 13's conservative rule still applies and the same fixture must NOT
move them.

**17. A writer that cannot read `content` may not restate the mode.** Same
`["visibility","private"]` list, `content` this writer's codec cannot decode,
and the writer set to public. It must publish `content` byte-identical, must
not emit `["visibility","public"]`, and must not move anything. This is the
disclosure the [read-both-places rule](../pc20-favorites.md#public-and-private)
exists for: an app claiming a list is public while the entries it cannot see
stay encrypted has published a false statement about someone's privacy, and the
next app to believe it converges on the strength of it. Pin the control in the
same fixture — the same writer, the same list, but `content` it CAN decode — or
an implementation that never restates the mode at all passes.

**18. A run is emitted in band order, and a new entry joins its own band.**
Read a list with two medium runs, hold the first run's items in a different
order plus one new item, and publish: the run is not split in two and the new
entry does not lead. Then pin the bands from a run that arrives interleaved and
holds one of each level, with a new artist, a new album and a new track: out
come artists, then albums, then tracks grouped by the album they name, each new
entry at the end of its own band. Two well-formed wrong answers: local order
first, and the other app imposes its order back forever; appended to the end of
the event, and a second `medium` run opens for a medium that already had one. A
third looks right until a list holds more than one level — appending at the end
of the RUN rather than the band. And pin idempotence on the banded output, or
the sort itself becomes the thing that never stops.

**19. The same feed twice on the wire loses no item.** Read a list with two
entries for one feed and an item after each. Fold the duplicate or carry it;
either is conforming, and neither may lose an item or lose the favorite itself.
Under the old grouping this was the dangerous case: each copy opened a group,
and a writer that modelled groups by guid met the second one already taken and
dropped the item beneath it.

**20. An item that names no feed is carried, never deleted, and never given one
by being moved.** Parse it with a null feed — do not borrow one from an
unrelated entry and do not invent one, because a wrong feed guid resolves to
the wrong thing and a missing one resolves to nothing. A placeholder guid is an
invented one, and a writer that always fills position 2 writes placeholders.
Republish and the tag is still there, still in its two-element legacy form,
because there was nothing to rewrite it with. Then **re-parse your own output
and assert the feed is still null**, from a fixture where the orphan shares a
run with albums: the tag is byte-identical either way, so a writer that banded
it in beside the other tracks passes everything else while having handed it
whichever album landed last. That is the assertion band 0 exists for. This is
what an item written before this revision looks like when no feed entry
precedes it, and it is unresolvable by anyone, which is not the same as junk.

**21. The framing tags are ours, and they lead.** Read a list whose `alt`
carries some other label, publish a change, and the event's first tag is
`["alt", "PC 2.0 Favorites"]` with no second `alt` beside it. Then pin the mode
beside it: on a list that states one, `visibility` is the SECOND tag,
immediately after `alt`, so the mode is marked at the top and a reader knows it
before parsing an entry. Feed the same fixture with `visibility` somewhere in
the middle — a reader must still find it, and the writer must still emit it
second, which is the pair of rules that lets both be true at once without a
republish.

**22. The private plaintext carries no `?`.** Encode an item whose guid holds a
query string: the plaintext contains no `?` character, `JSON.parse` of it
returns the original tags, and a full cycle in private mode gives the guid back
out of `content` unchanged.

**23. A plaintext that is not a tag array is an unreadable `content`, not an
empty one.** `{}`, a string, an array holding a non-array, an array holding a
non-string all decode to null — and `[]` to an empty list. Put such bytes in
`content`: a change to the tags carries them byte for byte, and a writer set to
private publishes nothing, because it may not write into a `content` it could
not read.

**24. A private list past the NIP-44 v2 cliff is refused.** Hold enough items
that the plaintext exceeds 60,000 bytes, set private, and the cycle publishes
nothing and claims nothing. The same shape well under the line publishes. Grow
the fixture from the writer's own plaintext, so the vector tracks the cap
rather than a guess about bytes per entry.

**25. A feed favorite and an item favorite are stated separately.** Save one
item from a feed you have not favorited: ONE tag, the item, carrying the guid
of its feed, and no feed entry at all. This is the case the format could not
write before — it had to open a feed entry to hold the item, which put a feed
the user never chose on the list, 114 of 196 on the first real one. Then
favorite the feed as well and a second tag appears, with the item untouched —
and **pin that the two tags carry the same string at position 1** and differ
only in length, because that is what a reader keyed on position 1 gets wrong.
Pin the mirror case from the same fixture: a feed favorite alone is one tag and
no item. Pin the baseline shape too — a claim on an item is the PAIR, and **two
entries sharing an item guid under different feed guids are two favorites**:
keying on the item guid alone folds them into one, and a claim on one then
removes the other. Pin one entry in both places, emitted once.

**26. Unfavoriting the feed keeps the item, and needs nothing to say so.** Read
a list with a feed entry and an item of that feed, hold the feed as not
favorited with your baseline claiming it, and publish: the feed entry goes, the
item stays, and it still carries its feed guid. An earlier revision could not
delete that entry — it was the only tag naming the item's feed — so the removal
had to be stated with a marker, and a writer that left the marker off said
"nobody knows" instead. Pin the other direction from the same fixture — drop
the item, keep the feed — and pin the conflict: a feed favorite your baseline
does not claim is another app's, and not holding it here does not beat it.
Deleting it has the two of you rewriting the event at each other forever.

**27. An entry is carried whole, and no writer invents a feed guid.** Rule 4
inside an `i` tag, and the stakes rose with this revision. A writer that
rebuilds entries as `["i", id]` type-checks, renders correctly, and strips
every item of half its address, so nobody can look those favorites up again.
Pin an item carrying an element at position 3 that this writer has no meaning
for: it comes back byte-identical. Then pin the MIGRATION in the same fixture:
a legacy `["i","podcast:item:guid:X"]` takes its feed from the entry above it,
a writer republishes it as `["i","podcast:guid:F","podcast:item:guid:X"]` — the
WHOLE tag, not just an appended element — and reading the result back changes
nothing. A migration that is not idempotent republishes on every load forever.

**28. An artist entry is a favorite that belongs to no feed.** Read a list with
a `podcast:publisher:guid` entry between an album entry and a track: the artist
carries no item guid, and the track still names the ALBUM. Republish and it
comes back in place, bare, and in the artist band ahead of the album it was
read after. **All of that is mandatory for every app**, whether or not it
offers artist favorites, because carrying one is not optional.

Origination is. An app with no way for a user to favorite an artist can never
hold one, so the rest of this vector tests a state it cannot reach: it declares
`capabilities.artistFavorites: false` and stops there. Everything above still
runs. For an app that DOES offer them, pin the bare entry from the app that
HOLDS the artist — that is where a writer reaches for a second element, because
it has state and somewhere to put it — and pin that originating one emits the
`k` tag, without which `#k` discovery misses every artist favorite it ever
publishes. The flag has to be honest: an adapter declaring `false` while
originating an artist anyway fails, rather than buying an exemption it is not
using.

**29. A removal survives a change of mode.** Unfavorite an entry your baseline
claims, and pin that it goes in all four places a mode change puts it. On a
list already private: hold one of two private entries, publish, and the other
is dropped — a merge carrying "it is only changing places" logic on this path
publishes NOTHING here, because the bytes it builds match the ones it read. On
the place being moved INTO: a licensed private → public move with the removed
entry in the tags, which must not come back on the way past. And on the place
being moved FROM: going private with the removed entry in the tags, which must
not ride the move across. And on the claim-back: no `visibility` tag with BOTH
places populated, so the writer may take back only what its own baseline names,
with the removed entry among what it claims — which must be dropped from both
rather than published in the open. Run the last two for TWO cycles. The
baseline written by the first cannot claim an entry the device does not hold,
so a removal that survives either survives every cycle after it as well — one
cycle shows a stale entry, two show that nothing can ever remove it.

**30. When nothing is private, `content` is the empty string.** Take back the
last entry of a `medium` run — a list with no `visibility` tag and both places
populated, one private entry your baseline claims and you still hold, moving to
the tags — and pin that `content` comes back as `''` rather than as the
encryption of the run that entry left behind. Then hand the result to a second
writer whose signer has NO NIP-44, holding both feeds, and have its user choose
private. It must reach private. A writer that cannot decrypt reads any
ciphertext as an encrypted list another app owns, and refuses to change the
mode on top of it; that refusal is right, and an empty `content` that encodes
to ciphertext makes it fire on nothing. The second half of this vector is the
one that matters — a byte-count assertion alone does not say what the leftover
costs.

**31. A carried claim retires with the entry it names.** Three parts, and the
third is what keeps the first two from becoming an over-correction. Take an
entry back out of the inactive place — unfavorite one your baseline claims
there — and pin that the claim goes with it; then have a second writer put that
entry back into that place and pin that your next cycle leaves it alone. Repeat
on a change of mode, where the place is emptied outright rather than edited
entry by entry: same rule, same second writer, same outcome. Then pin the
opposite: a second writer removes an entry from the inactive place that you
STILL HOLD, and the claim must survive, because that claim is what stops you
re-adding what somebody else deleted. A test that retires on absence alone
passes the first two and fails this one.

