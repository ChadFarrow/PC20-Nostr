#!/bin/bash
# Are the recipes safe to hand a stranger's coding agent?
#
# Every check here exists because something already went wrong once. Recipes
# are copied verbatim into codebases nobody here will ever see, so a mistake
# in one is not a bug in this repo — it is a bug installed in someone else's.
#
#   ./check-recipes.sh                structural checks only
#   ./check-recipes.sh --network      also verify every live_at still answers
#   ./check-recipes.sh --write-index  rewrite recipes/index.json, then check
#
# Exit: 0 = all good, 1 = at least one problem.

set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
NET=0
WRITE_INDEX=0
[ "${1:-}" = "--network" ] && NET=1
[ "${1:-}" = "--write-index" ] && WRITE_INDEX=1
fail=0
note() { echo "FAIL  $*"; fail=1; }

# Sites whose code may be shipped. Test sites and third-party forks are not
# here on purpose: their code has not been exercised by real users, and one of
# them is not ours to redistribute.
ALLOWED="ITDV-Lightning boostmebitch stablekraft-app MSP-2.0 candr.space"

echo "== 1. provenance names only production repos"
while IFS=$'\t' read -r dest repo _ref _sha _src _state; do
  [ "$dest" = "catalog_path" ] && continue
  [ -n "$dest" ] || continue
  case " $ALLOWED " in
    *" $repo "*) ;;
    *) note "$dest is sourced from '$repo', which is not a production site" ;;
  esac
done < "$HERE/PROVENANCE.tsv"

echo "== 2. every shipped file says where it came from"
# Three states, and a file must be in exactly one of them:
#
#   extracted  byte-identical to a live site. PROVENANCE.tsv carries the row.
#   patched    a live-site file plus a security fix the site does not have.
#              PROVENANCE.tsv carries the row, and feature.json must name the
#              issues fixed - a reader has to be able to tell what diverged
#              and why without diffing against a repo they do not have.
#   authored   new code that has never served traffic. No PROVENANCE row, and
#              feature.json must say so out loud.
#
# This check exists so authored code cannot arrive unlabelled later. Every
# other page in this catalog promises "this already works somewhere"; a file
# that cannot make that promise has to be the one that says so.
python3 - "$HERE" <<'STATE'
import json, os, sys, csv
here = sys.argv[1]
prov = {}
with open(os.path.join(here, "PROVENANCE.tsv")) as f:
    for row in csv.reader(f, delimiter="\t"):
        if not row or row[0] == "catalog_path":
            continue
        prov[row[0]] = row[5] if len(row) > 5 else "extracted"
bad = 0
rdir = os.path.join(here, "recipes")
for name in sorted(os.listdir(rdir)):
    d = os.path.join(rdir, name)
    mpath = os.path.join(d, "feature.json")
    if not os.path.isfile(mpath):
        continue
    try:
        m = json.load(open(mpath))
    except Exception:
        continue  # the manifest check below reports the parse failure
    for f in m.get("files", []):
        rel = os.path.join("recipes", name, f["from"])
        declared = f.get("state")
        actual = prov.get(rel)
        if actual is None:
            if declared != "authored":
                print("FAIL  %s has no PROVENANCE.tsv row, so feature.json must "
                      "declare \"state\": \"authored\" (found %r)" % (rel, declared))
                bad = 1
            continue
        if declared == "authored":
            print("FAIL  %s is declared authored but has a PROVENANCE.tsv row" % rel)
            bad = 1
            continue
        if declared is not None and declared != actual:
            print("FAIL  %s is %r in PROVENANCE.tsv but %r in feature.json"
                  % (rel, actual, declared))
            bad = 1
        if (declared or actual) == "patched" and not f.get("fixes"):
            print("FAIL  %s is patched but feature.json lists no 'fixes'; say "
                  "what diverged from the site and why" % rel)
            bad = 1
sys.exit(bad)
STATE
[ "$?" = "0" ] || fail=1

echo "== 3. every recipe has a manifest, and every listed file exists"
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
# files/ may hold folders: a recipe whose files import each other by relative
# path ('../types/feed') ships them in the layout those imports expect, since
# rewriting an import would break byte-identity.
shipped = {os.path.normpath(f["from"]) for f in m.get("files", [])}
on_disk = set()
for root, _dirs, fns in os.walk(os.path.join(d, "files")):
    for fn in fns:
        if fn != ".DS_Store":  # Finder litter; .gitignore keeps it out of git
            on_disk.add(os.path.relpath(os.path.join(root, fn), d))
for extra in sorted(on_disk - shipped):
    print(f"FAIL  {name}/{extra} is not listed in feature.json"); bad = 1
sys.exit(bad)
PY
done

echo "== 4. no unshipped app-internal import"
# An '@/...' import the recipe does not also ship is an import error in
# someone else's repo, which is the difference between "just add it" and
# "this is broken". A relative import ('./x', '../types/feed') must resolve
# to a file inside the same files/ tree, for the same reason.
for d in "$HERE"/recipes/*/; do
  [ -d "$d/files" ] || continue
  python3 - "$d" "$(basename "$d")" <<'PY' || fail=1
import os, re, sys
d, name = sys.argv[1], sys.argv[2]
fdir = os.path.realpath(os.path.join(d, "files"))
paths = [os.path.join(r, f) for r, _, fs in os.walk(fdir) for f in fs if f != ".DS_Store"]
stems = {os.path.basename(p).split(".")[0] for p in paths}
EXTS = ("", ".ts", ".tsx", ".js", ".mjs", ".d.ts", "/index.ts", "/index.tsx", "/index.js")
SPEC = re.compile(r"""(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]+)['"]""")
bad = 0
for p in paths:
    rel = os.path.relpath(p, os.path.realpath(d))
    for spec in sorted(set(SPEC.findall(open(p, errors="ignore").read()))):
        if spec.startswith("@/"):
            if os.path.basename(spec) not in stems:
                print(f"FAIL  {name}/{rel} imports '{spec}' but does not ship it"); bad = 1
        elif spec.startswith(("./", "../")):
            target = os.path.normpath(os.path.join(os.path.dirname(p), spec))
            if not target.startswith(fdir + os.sep):
                print(f"FAIL  {name}/{rel} imports '{spec}', which is outside files/"); bad = 1
            elif not any(os.path.isfile(target + e) for e in EXTS):
                print(f"FAIL  {name}/{rel} imports '{spec}' but does not ship it"); bad = 1
sys.exit(bad)
PY
done

echo "== 5. no recipe teaches a secret leak"
# Next.js inlines every NEXT_PUBLIC_* value into the browser bundle, so one
# holding a key is served to everyone. Deliberately broader than NSEC: a live
# site reads NEXT_PUBLIC_BOOSTBOX_API_KEY from a client component, and a
# narrower pattern would have missed it.
#
# What counts is a READ or an ASSIGNMENT, not a mention. A recipe naming the
# variable to tell a reader never to use it is doing its job, and flagging
# that pushes us to delete the warning rather than the problem - the same
# reasoning as the dead-URL check below. So this matches `env.NAME`,
# `env["NAME"]` and `NAME=`, and leaves prose alone.
#
# Verified both ways: `process.env.NEXT_PUBLIC_BOOSTBOX_API_KEY`, which is the
# real live-site leak this check was written for, is still caught.
SECRETISH='(NEXT_PUBLIC|VITE|REACT_APP)_[A-Z0-9_]*(NSEC|SECRET|PRIVATE|PRIVKEY|SEED|MNEMONIC|PASSWORD|TOKEN|API_?KEY)'
if grep -rnE "(env\.${SECRETISH}|env\[[\"']${SECRETISH}|^[^|]*\b${SECRETISH}=)" \
     "$HERE/recipes" 2>/dev/null; then
  note "a recipe reads or sets a secret in a client-exposed variable (these are bundled and served publicly)"
fi

echo "== 6. every app-specific constant is documented in 'rename'"
# Match only against the rename entries, never the whole manifest: live_at is
# itself a branded URL, so grepping the file passes on the URL and lets a real
# hardcoded app name through. That is exactly the leak this check exists for.
for d in "$HERE"/recipes/*/; do
  [ -f "$d/feature.json" ] || continue
  python3 - "$d" "$(basename "$d")" <<'PY' || fail=1
import json, os, re, sys
d, name = sys.argv[1], sys.argv[2]
TERMS = ("itdv","podtards","doerfelverse","boostmebitch","stablekraft","musicsideproject","6590183","6590182")
m = json.load(open(os.path.join(d, "feature.json")))
declared = " ".join(
    f"{r.get('current','')} {r.get('why','')}" for r in m.get("rename", [])
).lower()
bad = 0
fdir = os.path.join(d, "files")
for fn in sorted(os.path.relpath(os.path.join(r, f), fdir)
                 for r, _, fs in os.walk(fdir) for f in fs if f != ".DS_Store"):
    body = open(os.path.join(fdir, fn), errors="ignore").read().lower()
    for t in TERMS:
        if t in body and t not in declared:
            print(f"FAIL  {name}/files/{fn} contains '{t}' but no rename entry covers it")
            bad = 1
sys.exit(bad)
PY
done

echo "== 7. no recipe points a reader at a dead or legacy URL"
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

echo "== 8. no page names a repo that is not a live site"
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

echo "== 9. every live_at is a plain http(s) URL"
# Checked even without --network, because the value is about to be handed to
# curl. curl parses options at ANY argument position, so a live_at beginning
# with "-" is read as a flag rather than a URL. `-Kfile` makes curl read an
# attacker-supplied config whose `output =` directives write arbitrary files —
# a recipe added by a pull request could overwrite a maintainer's dotfiles the
# moment they ran this script. Reject the value here, and pass it safely below.
for d in "$HERE"/recipes/*/; do
  [ -f "$d/feature.json" ] || continue
  url=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('live_at',''))" "$d/feature.json")
  [ -n "$url" ] || continue
  case "$url" in
    http://*|https://*) ;;
    *) note "$(basename "$d") has a live_at that is not an http(s) URL: $url" ;;
  esac
done

echo "== 10. recipes/index.json lists every recipe, as its feature.json says"
# One file an agent can fetch to see every recipe without walking the tree.
# It is generated from the manifests, never edited by hand, so this check
# fails the moment a recipe is added or a manifest changes without it.
python3 - "$HERE" "$WRITE_INDEX" <<'INDEX' || fail=1
import json, os, sys, csv
here, write = sys.argv[1], sys.argv[2] == "1"
prov = {}
with open(os.path.join(here, "PROVENANCE.tsv")) as f:
    for row in csv.reader(f, delimiter="\t"):
        if row and row[0] != "catalog_path":
            prov[row[0]] = row[5] if len(row) > 5 else "extracted"
rdir = os.path.join(here, "recipes")
recipes = []
for name in sorted(os.listdir(rdir)):
    mpath = os.path.join(rdir, name, "feature.json")
    if not os.path.isfile(mpath):
        continue
    m = json.load(open(mpath))
    states = sorted({f.get("state") or prov.get(os.path.join("recipes", name, f["from"]), "authored")
                     for f in m.get("files", [])})
    base = f"catalog/recipes/{name}/"
    recipes.append({
        "name": m["name"],
        "tier": m["tier"],
        "summary": m["summary"],
        "states": states,
        "files": len(m.get("files", [])),
        "dependencies": m.get("dependencies", {}),
        "env": [e["name"] if isinstance(e, dict) else e for e in m.get("env", [])],
        "live_at": m.get("live_at") or None,
        "readme": base + "README.md",
        "manifest": base + "feature.json",
    })
index = {
    "about": "Working Podcasting 2.0 features from live sites, packaged for a coding agent to install. "
             "Read a recipe's manifest, then its README, before copying anything.",
    "generated_by": "catalog/check-recipes.sh --write-index",
    "repo": "https://github.com/ChadFarrow/PC20-Nostr",
    "raw_base": "https://raw.githubusercontent.com/ChadFarrow/PC20-Nostr/main/",
    "states": {
        "extracted": "byte-identical to a live site",
        "patched": "a live-site file plus a named security fix",
        "authored": "written for this catalog; no site runs it",
    },
    "recipes": recipes,
}
want = json.dumps(index, indent=2, ensure_ascii=False) + "\n"
ipath = os.path.join(rdir, "index.json")
if write:
    open(ipath, "w").write(want)
    print(f"wrote recipes/index.json ({len(recipes)} recipes)")
have = open(ipath).read() if os.path.isfile(ipath) else ""
if have != want:
    print("FAIL  recipes/index.json is out of date with the feature.json files; "
          "run ./check-recipes.sh --write-index")
    sys.exit(1)
INDEX

if [ "$NET" = "1" ]; then
  echo "== 11. every live_at still answers"
  for d in "$HERE"/recipes/*/; do
    [ -f "$d/feature.json" ] || continue
    url=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('live_at',''))" "$d/feature.json")
    [ -n "$url" ] || continue
    case "$url" in http://*|https://*) ;; *) continue ;; esac
    # --proto pins the schemes curl will follow (including across redirects);
    # -- ends option parsing so the URL can never be read as a flag.
    code=$(curl -s -o /dev/null -w '%{http_code}' -m 12 -L --proto '=http,https' -- "$url")
    [ "$code" = "200" ] || note "$(basename "$d") live_at $url returned $code"
  done
fi

[ "$fail" = "0" ] && echo "all recipe checks passed"
exit $fail
