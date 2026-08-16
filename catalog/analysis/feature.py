#!/usr/bin/env python3
"""Per USER-VISIBLE FEATURE, what does a third party actually have to copy?

Seeds are UI entry points (what someone saw on the site). The closure is the
complete file set their agent must take, plus the external packages they must
install. That set IS the recipe.
"""
import subprocess, re, os, sys
from collections import deque

GIT="/usr/bin/git"; VIBE=os.path.expanduser("~/Vibe")
REPO = sys.argv[1] if len(sys.argv)>1 else "ITDV-Lightning"
REF="origin/main"

FEATURES = {
  "Boost button / Lightning payment": ["components/BitcoinConnect.tsx"],
  "Lightning wallet panel":           ["components/LightningWallet.tsx"],
  "Payment splits display":           ["components/PaymentSplitsDisplay.tsx"],
  "Now playing bar":                  ["components/GlobalNowPlayingBar.tsx"],
  "Album card grid":                  ["components/AlbumCard.tsx"],
  "Feed validator page":              ["app/feed-validator/page.tsx"],
  "Image proxy (CDN)":                ["app/api/proxy-image/route.ts"],
  "Boost to Nostr":                   ["hooks/useBoostToNostr.ts"],
  "PWA install prompt":               ["components/PWAInstallPrompt.tsx"],
}

def ls():
    return set(subprocess.run([GIT,"-C",f"{VIBE}/{REPO}","ls-tree","-r","--name-only",REF],
                              capture_output=True,text=True).stdout.splitlines())
def show(p):
    r=subprocess.run([GIT,"-C",f"{VIBE}/{REPO}","show",f"{REF}:{p}"],capture_output=True,text=True)
    return r.stdout if r.returncode==0 else None

IMP=re.compile(r"""(?:from|import)\s+['"]([^'"]+)['"]""")
files=ls()

def resolve(spec,cur):
    if spec.startswith("@/"): base=spec[2:]
    elif spec.startswith("."): base=os.path.normpath(os.path.join(os.path.dirname(cur),spec))
    else: return None
    for c in (base,base+".ts",base+".tsx",base+"/index.ts",base+"/index.tsx"):
        if c in files: return c
    return None

print(f"repo: {REPO} @ {REF}\n")
print(f"{'feature':<34} {'files':>5} {'lines':>6}  external packages")
print("-"*100)
for name,seeds in FEATURES.items():
    seeds=[s for s in seeds if s in files]
    if not seeds:
        print(f"{name:<34}     -      -  (absent in this repo)"); continue
    seen=set(seeds); q=deque(seeds); ext=set(); lines=0
    while q:
        cur=q.popleft(); src=show(cur)
        if src is None: continue
        lines+=len(src.splitlines())
        for spec in IMP.findall(src):
            t=resolve(spec,cur)
            if t is None:
                if not spec.startswith((".","@/")):
                    ext.add("/".join(spec.split("/")[:2]) if spec.startswith("@") else spec.split("/")[0])
            elif t not in seen:
                seen.add(t); q.append(t)
    ext={e for e in ext if e not in ("react","react-dom","next")}
    print(f"{name:<34} {len(seen):>5} {lines:>6}  {', '.join(sorted(ext)) or '-'}")
