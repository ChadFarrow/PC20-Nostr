#!/usr/bin/env python3
"""How much of the divergence between forked copies is REAL?

For every file in the candidate library closure, compare the copies twice:
  raw   - byte identity
  norm  - after stripping comments, console.* lines, blank lines and whitespace

If files differ raw but agree norm, the divergence is cosmetic and the copies
can share one implementation today.
"""
import subprocess, re, os, hashlib
from collections import defaultdict

GIT = "/usr/bin/git"
VIBE = os.path.expanduser("~/Vibe")
REPOS = ["ITDV-Lightning", "NMNU", "TRM-Lightning", "lnaddress-music"]
REF = "origin/main"

FILES = [
    "lib/webln-service.ts", "lib/nwc-service.ts", "lib/lnurl-service.ts",
    "lib/zap-receipt-service.ts", "lib/boost-to-nostr-service.ts",
    "lib/logger.ts", "lib/error-utils.ts", "lib/rss-cache.ts",
    "lib/feed-manager.ts", "lib/rss-parser.ts", "lib/feed-parser.ts",
    "lib/url-utils.ts", "utils/payment-utils.ts",
    "contexts/LightningContext.tsx", "contexts/BitcoinConnectContext.tsx",
    "hooks/useNWC.ts", "hooks/useBoostToNostr.ts",
]

def show(repo, path):
    r = subprocess.run([GIT, "-C", f"{VIBE}/{repo}", "show", f"{REF}:{path}"],
                       capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None

BLOCK = re.compile(r"/\*.*?\*/", re.S)
LINE = re.compile(r"^\s*//.*$", re.M)
CONSOLE = re.compile(r"^\s*console\.\w+\(.*?\);?\s*$", re.M)

def norm(src):
    s = BLOCK.sub("", src)
    s = LINE.sub("", s)
    s = CONSOLE.sub("", s)
    s = re.sub(r"[ \t]+", " ", s)
    return "\n".join(l.strip() for l in s.splitlines() if l.strip())

def h(x): return hashlib.md5(x.encode()).hexdigest()[:8]

print(f"{'file':<42} {'repos':>5} {'raw':>4} {'norm':>5}  verdict")
print("-" * 88)
summary = defaultdict(int)
for f in FILES:
    raw, nrm, have = {}, {}, []
    for r in REPOS:
        s = show(r, f)
        if s is None: continue
        have.append(r); raw[r] = h(s); nrm[r] = h(norm(s))
    if len(have) < 2:
        if have: print(f"{f:<42} {len(have):>5}    -     -  only {have[0]}")
        continue
    nr, nn = len(set(raw.values())), len(set(nrm.values()))
    if nr == 1: v = "IDENTICAL"
    elif nn == 1: v = "COSMETIC ONLY -> shareable now"
    else: v = f"REAL divergence ({nn} behaviours)"
    summary[v.split(" ")[0]] += 1
    print(f"{f:<42} {len(have):>5} {nr:>4} {nn:>5}  {v}")
    if nn > 1:
        groups = defaultdict(list)
        for r in have: groups[nrm[r]].append(r)
        for g in groups.values(): print(f"{'':<42} {'':>5} {'':>4} {'':>5}    · {' = '.join(g)}")
print("\n", dict(summary))
