#!/usr/bin/env python3
"""How far apart are the two production sites that share code?

Counting shared paths says two sites overlap; it does not say whether the
overlap is still recognisable. This measures, on comment- and
logging-stripped source, how much of each shared-but-diverged file is
genuinely common.

DoerfelVerse and Project StableKraft are the only pair of live sites with a
meaningful shared surface, so they are the whole comparison."""
import subprocess, os, re, difflib
from collections import defaultdict

GIT = "/usr/bin/git"; VIBE = os.path.expanduser("~/Vibe")
A, B = ("ITDV-Lightning", "origin/main"), ("stablekraft-app", "origin/main")

def tree(repo, ref):
    out = subprocess.run([GIT, "-C", f"{VIBE}/{repo}", "ls-tree", "-r", "-l", "--full-name", ref],
                         capture_output=True, text=True).stdout
    d = {}
    for line in out.splitlines():
        p = line.split(None, 4)
        if len(p) < 5 or p[1] != "blob": continue
        _m, _t, sha, size, path = p
        if not path.endswith((".ts", ".tsx")): continue
        if any(s in path for s in ("node_modules/", ".next/", "dist/", ".claude/")): continue
        try:
            if int(size) < 2048: continue
        except ValueError: continue
        d[path] = sha
    return d

def show(repo, ref, path):
    r = subprocess.run([GIT, "-C", f"{VIBE}/{repo}", "show", f"{ref}:{path}"],
                       capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None

BLOCK = re.compile(r"/\*.*?\*/", re.S); LINE = re.compile(r"^\s*//.*$", re.M)
CONSOLE = re.compile(r"^\s*console\.\w+\(.*?\);?\s*$", re.M)
def norm(src):
    s = CONSOLE.sub("", LINE.sub("", BLOCK.sub("", src)))
    return [re.sub(r"\s+", " ", l).strip() for l in s.splitlines() if l.strip()]

ta, tb = tree(*A), tree(*B)
shared = sorted(set(ta) & set(tb))
identical = [p for p in shared if ta[p] == tb[p]]
diverged = [p for p in shared if ta[p] != tb[p]]

print(f"shared paths: {len(shared)}   identical: {len(identical)}   diverged: {len(diverged)}\n")
tot_same = tot_diff = 0
rows = []
for p in diverged:
    la, lb = norm(show(*A, p) or ""), norm(show(*B, p) or "")
    if not la or not lb: continue
    sm = difflib.SequenceMatcher(None, la, lb, autojunk=False)
    same = sum(b.size for b in sm.get_matching_blocks())
    changed = (len(la) - same) + (len(lb) - same)
    pct = 100 * same / max(len(la), len(lb))
    tot_same += same; tot_diff += changed
    rows.append((pct, p, len(la), len(lb), changed))

rows.sort()
print("most-diverged shared files (normalized):")
for pct, p, na, nb, ch in rows[:12]:
    print(f"  {pct:5.1f}% same  {p}  ({na} vs {nb} lines, {ch} differ)")
print("\nleast-diverged:")
for pct, p, na, nb, ch in rows[-8:]:
    print(f"  {pct:5.1f}% same  {p}  ({na} vs {nb} lines, {ch} differ)")

if tot_same + tot_diff:
    print(f"\nacross all diverged shared files: {tot_same} identical normalized lines, "
          f"{tot_diff} differing")
    print(f"=> {100*tot_same/(tot_same+tot_diff):.1f}% of the diverged surface already common")
