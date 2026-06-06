## Summary

Adds a session-centered SLP workflow that opens on a guided **Start Session** experience: client/student, goal, target, practice level, trials, cueing, notes, home practice, and progress.

## What changed

- Added local Dexie tables for client profiles, goals, guided sessions, trials, and listener checks with a backward-compatible v6 migration.
- Added a new `SessionTab` as the default landing tab with large trial buttons, cue-level capture, strategy chips, editable School/IEP and SOAP notes, editable home practice, and client progress.
- Added a simple Listener Check overlay that hides unrelated client data and stores results with guided session history.
- Updated export/import to include guided-session tables while preserving older log/recording backup support.
- Renamed confusing UI labels and softened privacy/compliance copy.
- Added recording consent and export-sensitive-data warnings.
- Rewrote README around the guided workflow, Listener Check, local-first privacy, safe exports, and clinical responsibility.

## Why this helps SLPs

SLPs can now open the app, choose a student and goal, run trials with minimal taps, document objective data, copy editable notes, send home practice, and review progress without leaving the local-first app.

## Data/privacy notes

- No cloud services, third-party analytics, server storage, or external AI calls were added.
- New clinical data stays in local IndexedDB/Dexie tables.
- Exported files and handoffs may contain protected or sensitive information, so in-app and README copy now remind clinicians to follow consent, retention, backup, HIPAA, and FERPA review requirements.
- The app supports clinician judgment and does not diagnose or determine treatment.

## Testing performed

- `npm run lint`
- `npm run build`

No test script is currently defined in `package.json`.

## Known limitations / follow-up ideas

- New guided-session tables are local IndexedDB records and are protected by the app lock screen, but field-level encryption currently remains limited to legacy logs and recordings.
- Listener Check uses simple clear/unclear item scoring; future work could add reusable item sets per target.
- QR handoff remains optimized for lightweight legacy logs; full guided-session backup is available through JSON export/import.
