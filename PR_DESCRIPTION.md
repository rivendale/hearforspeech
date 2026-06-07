## Summary

Adds extra bottom scroll breathing room so fixed navigation does not cover final page content, plus in-app refresh/cache controls to make latest-version reloads easier.

## What changed

- Adds a larger safe-area-aware bottom reserve for the app scroll container.
- Adds an end-of-scroll spacer so final cards can scroll above the bottom nav.
- Adds safe-area padding to the fixed bottom navigation.
- Adds **Refresh Latest App** and **Clear App Cache** controls in the Analysis Readiness panel.
- Updates PWA generation with `skipWaiting`, `clientsClaim`, and outdated-cache cleanup.
- Documents latest-version refresh steps in README.

## Why this helps SLPs

Therapists can scroll all the way to the final text/buttons on Assess, Session, and Data without the bottom nav hiding content. If a phone or installed PWA keeps showing an older version, the update controls are now visible in-app.

## Data/privacy notes

- Cache clearing only targets app shell caches, not IndexedDB patient/session records.
- No recording, export, analysis, backend, or clinical data model behavior changes.

## Testing performed

- `npm run lint`
- `npm run build`

## Known limitations / follow-up ideas

- Browser/device PWA caching can still require closing and reopening the installed app on some phones after major updates.
