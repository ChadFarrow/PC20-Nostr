#!/usr/bin/env python3
"""For each candidate library file, compute the transitive closure of
app-internal imports. That closure IS the real library boundary: you cannot
move a file without everything it drags along."""
import subprocess, re, sys, os, json
from collections import defaultdict, deque

GIT = "/usr/bin/git"
VIBE = os.path.expanduser("~/Vibe")

REPOS = {
    "ITDV-Lightning": "origin/main",
    "NMNU": "origin/main",
    "TRM-Lightning": "origin/main",
    "lnaddress-music": "origin/main",
    "stablekraft-app": "origin/main",
}

# seeds: the payment/nostr/feed surface a shared library would plausibly cover
SEEDS = [
    "lib/webln-service.ts", "lib/nwc-service.ts", "lib/lnurl-service.ts",
    "lib/zap-receipt-service.ts", "lib/boost-to-nostr-service.ts",
    "utils/payment-utils.ts", "lib/rss-parser.ts", "lib/feed-parser.ts",
    "lib/podcast-index.ts", "contexts/BitcoinConnectContext.tsx",
    "hooks/useNWC.ts", "hooks/useBoostToNostr.ts",
]

def ls(repo, ref):
    out = subprocess.run([GIT, "-C", f"{VIBE}/{repo}", "ls-tree", "-r", "--name-only", ref],
                         capture_output=True, text=True).stdout
    return set(out.splitlines())

def show(repo, ref, path):
    r = subprocess.run([GIT, "-C", f"{VIBE}/{repo}", "show", f"{ref}:{path}"],
                       capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None

IMP = re.compile(r"""(?:from|import)\s+['"]([^'"]+)['"]""")

def resolve(spec, cur, files):
    """Resolve an import specifier to a repo path, or None if external."""
    if spec.startswith("@/"):
        base = spec[2:]
    elif spec.startswith("."):
        base = os.path.normpath(os.path.join(os.path.dirname(cur), spec))
    else:
        return None  # external package
    for cand in (base, base + ".ts", base + ".tsx", base + "/index.ts", base + "/index.tsx"):
        if cand in files:
            return cand
    return f"?{base}"  # internal but unresolved

results = {}
for repo, ref in REPOS.items():
    files = ls(repo, ref)
    present = [s for s in SEEDS if s in files]
    closure, ext, unresolved = set(), set(), set()
    q = deque(present)
    seen = set(present)
    while q:
        cur = q.popleft()
        src = show(repo, ref, cur)
        if src is None:
            continue
        for spec in IMP.findall(src):
            tgt = resolve(spec, cur, files)
            if tgt is None:
                ext.add(spec.split("/")[0] if not spec.startswith("@") else "/".join(spec.split("/")[:2]))
            elif tgt.startswith("?"):
                unresolved.add(tgt[1:])
            else:
                closure.add(tgt)
                if tgt not in seen:
                    seen.add(tgt); q.append(tgt)
    results[repo] = dict(seeds=present, closure=sorted(closure), ext=sorted(ext),
                         unresolved=sorted(unresolved))
    print(f"=== {repo}")
    print(f"    seeds present      : {len(present)}/{len(SEEDS)}")
    print(f"    app files dragged  : {len(closure)}")
    print(f"    external packages  : {len(ext)}")
    if unresolved:
        print(f"    unresolved internal: {len(unresolved)}")

json.dump(results, open(os.path.join(os.path.dirname(__file__), "closure.json"), "w"), indent=1)
print("\nwrote closure.json")
