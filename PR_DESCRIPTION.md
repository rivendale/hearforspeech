## Summary

Fixes a regression where the Assess, Session, and Data pages could no longer scroll on mobile or desktop.

## What changed

- Adds explicit `100dvh` app-shell sizing.
- Makes the main app area the dedicated scroll container.
- Adds `min-h-0` to the flex child that needs to scroll.
- Enables momentum/touch scrolling and vertical pan gestures for the main content.

## Why this helps SLPs

The core pages are usable again on phone, tablet, and desktop: clinicians can scroll through long assessment/session/data workflows with touch or mouse wheel.

## Data/privacy notes

- Layout-only change.
- No data model, storage, export, recording, or backend behavior changes.

## Testing performed

- `npm run lint`
- `npm run build`

## Known limitations / follow-up ideas

- Browser/device print sheets can still temporarily alter viewport behavior while printing; this fix restores normal app scrolling after normal navigation.
