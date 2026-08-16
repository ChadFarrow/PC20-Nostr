# PWA install prompt

A banner that offers to install your site as an app. It handles the two
platforms separately, because they work nothing alike:

- **Android / Chromium** — intercepts `beforeinstallprompt`, suppresses the
  browser's own banner, and shows yours after a 3-second delay so it doesn't
  interrupt the first paint.
- **iOS Safari** — has no `beforeinstallprompt` event at all, so it detects
  iOS by user agent and shows written instructions for Share → Add to Home
  Screen instead.

It stays hidden when the app is already running standalone, and a dismissal
is remembered for the rest of the browser session.

**Running at** <https://itdv.podtards.com> (DoerfelVerse — Music & Podcast
Hub), on a phone that hasn't installed it.

## Difficulty: drop-in

Two files, no packages. One string to rename, in two places.

## What you get

| File | Put it at |
|---|---|
| `files/PWAInstallPrompt.tsx` | `components/PWAInstallPrompt.tsx` |
| `files/safe-storage.ts` | `lib/safe-storage.ts` |

177 + 32 lines. Render `<PWAInstallPrompt />` once, in your root layout.

## What you need

Next.js App Router and React 18+. No packages, no environment variables.

**A web app manifest and a service worker are what actually make the button
work.** This component only offers the install; the browser decides whether
it is installable. If your site has no `manifest.json` with icons, or no
registered service worker, `beforeinstallprompt` never fires on Android and
the banner silently never appears. That is the single most likely reason this
looks broken after you add it.

## What to rename

`files/PWAInstallPrompt.tsx` lines **106** and **145** both read:

```tsx
<h3 className="text-sm font-medium">Install DoerfelVerse</h3>
```

Change both to your own app name. There are two because the iOS and Android
branches render separate markup — change one and the other still says
DoerfelVerse on the platform you didn't test.

## Why `safe-storage.ts` comes along

The component records dismissal in `sessionStorage`, and privacy browsers —
DuckDuckGo on Android is the one that prompted this — can make Web Storage
throw on access rather than return null. An uncaught throw there takes the
whole component down, so the banner crashes the page for exactly the users
most likely to be annoyed by it.

`safe-storage.ts` is a try/catch wrapper around `localStorage` and
`sessionStorage`. It is 32 lines, imports nothing, and is worth having
anywhere you touch Web Storage.

## What will bite you

**The dismissal is session-scoped, deliberately.** Close the tab and the
banner returns. If you want it to stay dismissed, move the key to
`safeLocalStorage` — which the same file already exports — and decide for
yourself how long "no" should last.

**Tailwind classes are baked into the markup.** The component assumes Tailwind
is present. Without it the banner still functions and looks unstyled.

## Provenance

Both files taken byte-identical from `ITDV-Lightning` at `origin/main`
`4bc69b2` — `components/PWAInstallPrompt.tsx` and `lib/safe-storage.ts`. Run
`../../check-drift.sh` to confirm.
