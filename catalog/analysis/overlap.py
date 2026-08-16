#!/usr/bin/env python3
"""How much code do the production sites actually share?

Counts, across the five live sites only, how many source files are
byte-identical and how many sit at the same path but have diverged.

Restricted to the production sites on purpose. An earlier version of this
measurement included template clones that were never deployed, which made the
sites look far more alike than they are: near-copies of one starter inflate
every similarity number without describing anything real.
"""
import subprocess, os
from collections import defaultdict

GIT = "/usr/bin/git"; VIBE = os.path.expanduser("~/Vibe")
PROD = {"ITDV-Lightning": "origin/main", "boostmebitch": "origin/main",
        "stablekraft-app": "origin/main", "MSP-2.0": "origin/master",
        "candr.space": "origin/main"}

def files(repo, ref):
    out = subprocess.run([GIT, "-C", f"{VIBE}/{repo}", "ls-tree", "-r", "-l", "--full-name", ref],
                         capture_output=True, text=True).stdout
    d = {}
    for line in out.splitlines():
        parts = line.split(None, 4)
        if len(parts) < 5:
            continue
        _mode, typ, sha, size, path = parts
        if typ != "blob" or not path.endswith((".ts", ".tsx")):
            continue
        if any(s in path for s in ("node_modules/", ".next/", "dist/", ".claude/")):
            continue
        try:
            if int(size) < 2048:
                continue
        except ValueError:
            continue
        d[path] = sha
    return d

repos = {r: files(r, ref) for r, ref in PROD.items()}
for r, d in repos.items():
    print(f"  {r}: {len(d)} source files >=2KB")

byblob = defaultdict(set)
bypath = defaultdict(dict)
for r, d in repos.items():
    for p, sha in d.items():
        byblob[sha].add(r)
        bypath[p][r] = sha

ident2 = [s for s, rs in byblob.items() if len(rs) >= 2]
ident3 = [s for s, rs in byblob.items() if len(rs) >= 3]
multi = {p: d for p, d in bypath.items() if len(d) >= 2}
diverged = {p: d for p, d in multi.items() if len(set(d.values())) > 1}
identical_path = {p: d for p, d in multi.items() if len(set(d.values())) == 1}

print()
print(f"  byte-identical blobs shared by >=2 production repos: {len(ident2)}")
print(f"  byte-identical blobs shared by >=3 production repos: {len(ident3)}")
print(f"  same path in >=2 production repos: {len(multi)}")
print(f"     byte-identical: {len(identical_path)}")
print(f"     diverged:       {len(diverged)}")

print("\n  identical, same path:")
for p, d in sorted(identical_path.items()):
    print(f"    {p}  [{', '.join(sorted(d))}]")

print("\n  diverged, same path (top 20):")
for p, d in sorted(diverged.items(), key=lambda kv: -len(kv[1]))[:20]:
    print(f"    {p}  [{', '.join(sorted(d))}]")
