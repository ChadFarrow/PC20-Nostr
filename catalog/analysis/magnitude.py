#!/usr/bin/env python3
"""How BIG is the real divergence? Distinct-version counts say 'they differ';
they don't say whether that is 3 lines or 300. Reconciling 3 is an afternoon.

Measures, on comment/logging-stripped source, the normalized edit distance
between each copy and the largest copy (the likely merge target).
"""
import subprocess, re, os, difflib
from collections import defaultdict

GIT = "/usr/bin/git"; VIBE = os.path.expanduser("~/Vibe")
REPOS = ["ITDV-Lightning", "NMNU", "TRM-Lightning", "lnaddress-music"]
REF = "origin/main"
FILES = ["lib/nwc-service.ts", "lib/lnurl-service.ts", "lib/boost-to-nostr-service.ts",
         "lib/rss-cache.ts", "lib/feed-manager.ts", "lib/feed-parser.ts",
         "lib/url-utils.ts", "utils/payment-utils.ts", "lib/rss-parser.ts",
         "contexts/LightningContext.tsx", "contexts/BitcoinConnectContext.tsx",
         "hooks/useNWC.ts", "hooks/useBoostToNostr.ts"]

BLOCK = re.compile(r"/\*.*?\*/", re.S); LINE = re.compile(r"^\s*//.*$", re.M)
CONSOLE = re.compile(r"^\s*console\.\w+\(.*?\);?\s*$", re.M)

def norm_lines(src):
    s = CONSOLE.sub("", LINE.sub("", BLOCK.sub("", src)))
    return [re.sub(r"\s+", " ", l).strip() for l in s.splitlines() if l.strip()]

def show(r, p):
    x = subprocess.run([GIT,"-C",f"{VIBE}/{r}","show",f"{REF}:{p}"],capture_output=True,text=True)
    return x.stdout if x.returncode==0 else None

print(f"{'file':<38} {'base(largest)':<16} {'base':>5}  divergence vs base")
print("-"*100)
tot_shared = tot_diff = 0
for f in FILES:
    v = {r: norm_lines(s) for r in REPOS if (s := show(r, f)) is not None}
    if len(v) < 2: continue
    base = max(v, key=lambda r: len(v[r]))
    out = []
    for r in REPOS:
        if r not in v or r == base: continue
        sm = difflib.SequenceMatcher(None, v[base], v[r], autojunk=False)
        same = sum(b.size for b in sm.get_matching_blocks())
        changed = (len(v[base]) - same) + (len(v[r]) - same)
        pct = 100 * same / max(len(v[base]), len(v[r]))
        out.append(f"{r.split('-')[0][:9]}:{changed}L({pct:.0f}% same)")
        tot_shared += same; tot_diff += changed
    print(f"{f:<38} {base[:15]:<16} {len(v[base]):>5}  " + "  ".join(out))

print("-"*100)
print(f"across all pairs: {tot_shared} identical normalized lines, {tot_diff} differing")
print(f"=> {100*tot_shared/(tot_shared+tot_diff):.1f}% of the diverged surface is ALREADY common")
