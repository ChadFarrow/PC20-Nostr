#!/bin/bash
# Does every extracted file still match the source it was taken from?
#
# A stale example is worse than none: it will be trusted and it will be wrong.
# PROVENANCE.tsv records the exact commit each file was read at, so drift is
# mechanically checkable rather than a thing you remember to look at.
#
# This never touches a site repo's working tree. `git fetch` writes only to
# .git/refs, and every read goes through `git show <ref>:<path>`. Do not make
# this script pull — at least one repo under ~/Vibe carries thousands of
# uncommitted files, and a pull is how you lose someone's work.
#
# Usage:  ./check-drift.sh [path-to-repos]     (default: ~/Vibe)
# Exit:   0 = every file current, 1 = at least one drifted or missing

set -u
GIT=/usr/bin/git
ROOT="${1:-$HOME/Vibe}"
HERE="$(cd "$(dirname "$0")" && pwd)"
MAN="$HERE/PROVENANCE.tsv"

[ -f "$MAN" ] || { echo "no PROVENANCE.tsv beside $0"; exit 1; }

drift=0
while IFS=$'\t' read -r dest repo ref sha src; do
  [ "$dest" = "catalog_path" ] && continue
  [ -n "$dest" ] || continue
  d="$ROOT/$repo"

  if [ ! -d "$d/.git" ]; then
    echo "MISSING REPO  $repo            (for $dest)"
    drift=1; continue
  fi

  $GIT -C "$d" fetch origin --quiet 2>/dev/null

  if ! $GIT -C "$d" cat-file -e "$sha:$src" 2>/dev/null; then
    echo "BAD SHA       $repo@$sha:$src   (for $dest)"
    drift=1; continue
  fi

  now=$($GIT -C "$d" rev-parse --short "$ref" 2>/dev/null)

  # 1. has our copy been edited since extraction?
  if ! $GIT -C "$d" show "$sha:$src" | cmp -s - "$HERE/$dest"; then
    echo "LOCAL EDIT    $dest             (differs from $repo@$sha)"
    drift=1
  fi

  # 2. has the source moved since extraction?
  if [ "$sha" != "$now" ] && ! $GIT -C "$d" diff --quiet "$sha" "$ref" -- "$src" 2>/dev/null; then
    echo "SOURCE MOVED  $dest             ($repo $sha -> $now)"
    echo "              git -C $d diff $sha $ref -- $src"
    drift=1
  fi
done < "$MAN"

if [ "$drift" -eq 0 ]; then
  echo "all catalog files current"
fi
exit $drift
