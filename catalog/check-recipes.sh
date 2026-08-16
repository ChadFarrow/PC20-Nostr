#!/bin/bash
# Are the recipes safe to hand a stranger's coding agent?
#
# Every check here exists because something already went wrong once. Recipes
# are copied verbatim into codebases nobody here will ever see, so a mistake
# in one is not a bug in this repo — it is a bug installed in someone else's.
#
#   ./check-recipes.sh            structural checks only
#   ./check-recipes.sh --network  also verify every live_at still answers
#
# Exit: 0 = all good, 1 = at least one problem.

set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
NET=0
[ "${1:-}" = "--network" ] && NET=1
fail=0
note() { echo "FAIL  $*"; fail=1; }

# Sites whose code may be shipped. Test sites and third-party forks are not
# here on purpose: their code has not been exercised by real users, and one of
# them is not ours to redistribute.
ALLOWED="ITDV-Lightning boostmebitch stablekraft-app MSP-2.0 candr.space"

echo "== 1. provenance names only production repos"
while IFS=$'\t' read -r dest repo _ref _sha _src; do
  [ "$dest" = "catalog_path" ] && continue
  [ -n "$dest" ] || continue
  case " $ALLOWED " in
    *" $repo "*) ;;
    *) note "$dest is sourced from '$repo', which is not a production site" ;;
  esac
done < "$HERE/PROVENANCE.tsv"

echo "== 2. every recipe has a manifest, and every listed file exists"
for d in "$HERE"/recipes/*/; do
  [ -d "$d" ] || continue
  name=$(basename "$d")
  [ -f "$d/README.md" ]    || note "$name has no README.md"
  [ -f "$d/feature.json" ] || { note "$name has no feature.json"; continue; }
  python3 - "$d" "$name" <<'PY' || fail=1
import json, sys, os
d, name = sys.argv[1], sys.argv[2]
try:
    m = json.load(open(os.path.join(d, "feature.json")))
except Exception as e:
    print(f"FAIL  {name}/feature.json is not valid JSON: {e}"); sys.exit(1)
bad = 0
for k in ("name","tier","summary","source","files","dependencies","peer","caveats"):
    if k not in m:
        print(f"FAIL  {name}/feature.json missing key '{k}'"); bad = 1
if m.get("tier") not in ("drop-in","wired","not-portable"):
    print(f"FAIL  {name} has unknown tier {m.get('tier')!r}"); bad = 1
for f in m.get("files", []):
    if not os.path.exists(os.path.join(d, f["from"])):
        print(f"FAIL  {name} lists {f['from']}, which does not exist"); bad = 1
shipped = {os.path.basename(f["from"]) for f in m.get("files", [])}
on_disk = set(os.listdir(os.path.join(d, "files"))) if os.path.isdir(os.path.join(d, "files")) else set()
for extra in on_disk - shipped:
    print(f"FAIL  {name}/files/{extra} is not listed in feature.json"); bad = 1
sys.exit(bad)
PY
done

echo "== 3. no unshipped app-internal import"
# An '@/...' import the recipe does not also ship is an import error in
# someone else's repo, which is the difference between "just add it" and
# "this is broken".
for d in "$HERE"/recipes/*/; do
  [ -d "$d/files" ] || continue
  name=$(basename "$d")
  for f in "$d"/files/*; do
    while read -r spec; do
      base=$(basename "$spec")
      ls "$d"/files/"$base".* >/dev/null 2>&1 || \
        note "$name/$(basename "$f") imports '$spec' but does not ship it"
    done < <(grep -ohE "from '@/[^']+'" "$f" 2>/dev/null | sed "s|from '@/||; s|'||")
  done
done

echo "== 4. no recipe teaches a secret leak"
if grep -rniE "NEXT_PUBLIC_[A-Z_]*(NSEC|SECRET|PRIVATE|_KEY)" "$HERE/recipes" 2>/dev/null; then
  note "a recipe references a secret in a NEXT_PUBLIC_ variable (these are bundled and served publicly)"
fi

echo "== 5. every app-specific constant is documented in 'rename'"
# Match only against the rename entries, never the whole manifest: live_at is
# itself a branded URL, so grepping the file passes on the URL and lets a real
# hardcoded app name through. That is exactly the leak this check exists for.
for d in "$HERE"/recipes/*/; do
  [ -f "$d/feature.json" ] || continue
  python3 - "$d" "$(basename "$d")" <<'PY' || fail=1
import json, os, re, sys
d, name = sys.argv[1], sys.argv[2]
TERMS = ("itdv","podtards","doerfelverse","boostmebitch","stablekraft","6590183","6590182")
m = json.load(open(os.path.join(d, "feature.json")))
declared = " ".join(
    f"{r.get('current','')} {r.get('why','')}" for r in m.get("rename", [])
).lower()
bad = 0
fdir = os.path.join(d, "files")
for fn in sorted(os.listdir(fdir)) if os.path.isdir(fdir) else []:
    body = open(os.path.join(fdir, fn), errors="ignore").read().lower()
    for t in TERMS:
        if t in body and t not in declared:
            print(f"FAIL  {name}/files/{fn} contains '{t}' but no rename entry covers it")
            bad = 1
sys.exit(bad)
PY
done

echo "== 6. no recipe points a reader at a dead or legacy URL"
# re.podtards.com does not resolve; msp.podtards.com is MSP's pre-
# musicsideproject.com address. Either one makes a "see it working" link lie.
#
# Only linkable occurrences count. A recipe naming re.podtards.com as a
# hardcoded string the reader must replace is doing its job, and flagging that
# would push us to delete the warning rather than the problem.
if grep -rnE "https?://(re|msp)\.podtards\.com" "$HERE"/recipes/*/README.md "$HERE"/recipes/*/feature.json 2>/dev/null; then
  note "a recipe links to a dead (re.podtards.com) or legacy (msp.podtards.com) URL"
fi
for d in "$HERE"/recipes/*/; do
  [ -f "$d/feature.json" ] || continue
  la=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('live_at',''))" "$d/feature.json")
  case "$la" in
    *re.podtards.com*|*msp.podtards.com*)
      note "$(basename "$d") has live_at $la, which is dead or legacy" ;;
  esac
done

echo "== 7. no page names a repo that is not a live site"
# Documentation drifts back toward whatever is easiest to cite, and naming a
# repo here implies a reader could go look at it running somewhere. These are
# the ones that have already had to be removed once: unreleased template
# clones, stale forks, third-party projects, and repos that are tools rather
# than sites. Add to this list rather than silently reintroducing one.
DENIED="TRM-Lightning NMNU lnaddress-music libre-listener-wallet-monorepo
        StableKraft-Nostr-Fix MSP-2.0-Desktop-App RSS-music-site-template
        HPM-Lightning ITDV-Site HGH-checker Auto-musicL-Maker
        musicL-playlist-updater Helipad-to-Nostr-BoostBot podroll-atlas
        music-atlas v4v-toolkit v4v-core-rs"
for name in $DENIED; do
  hits=$(grep -rlE "\b${name//./\\.}\b" --include='*.md' --include='*.tsv' \
          --include='*.json' "$HERE" 2>/dev/null)
  [ -n "$hits" ] && note "docs mention '$name', which is not a live site:
$(echo "$hits" | sed 's|^|        |')"
done

if [ "$NET" = "1" ]; then
  echo "== 8. every live_at still answers"
  for d in "$HERE"/recipes/*/; do
    [ -f "$d/feature.json" ] || continue
    url=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('live_at',''))" "$d/feature.json")
    [ -n "$url" ] || continue
    code=$(curl -s -o /dev/null -w '%{http_code}' -m 12 -L "$url")
    [ "$code" = "200" ] || note "$(basename "$d") live_at $url returned $code"
  done
fi

[ "$fail" = "0" ] && echo "all recipe checks passed"
exit $fail
