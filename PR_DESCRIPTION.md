## Summary

Adds session-centered SLP workflows that open on guided **Start Session** and **Assess** experiences: client/student, goal, target, practice level, trials, cueing, assessment prompts, recordings, notes, home practice, and progress.

## What changed

- Added local Dexie tables for client profiles, goals, guided sessions, trials, and listener checks with a backward-compatible v6 migration.
- Added a new `SessionTab` as the default landing tab with large trial buttons, cue-level capture, strategy chips, editable School/IEP and SOAP notes, editable home practice, and client progress.
- Added a simple Listener Check overlay that hides unrelated client data and stores results with guided session history.
- Added an adolescent diagnostic-style Assessment Coach with multiple templates: broad teen speech clarity, /r/ deep dive, connected speech/intelligibility, and school participation interview.
- Added line-by-line “Say this” scripts, quick analysis tags, sound/word-position pattern summaries, student/caregiver participation prompts, stimulability/cueing flags, listener support, and editable analysis.
- Added platform-aware browser built-in AI detection for newer `LanguageModel` and legacy `window.ai`, with clear Pixel/Android guidance when Chrome flags are unavailable.
- Added Dexie v7 assessment and assessment-item tables, with assessment recordings linked through the existing local recordings table.
- Updated export/import to include guided-session tables while preserving older log/recording backup support.
- Renamed confusing UI labels and softened privacy/compliance copy.
- Added recording consent and export-sensitive-data warnings.
- Rewrote README around the guided workflow, Listener Check, local-first privacy, safe exports, and clinical responsibility.

## Why this helps SLPs

SLPs can now open the app, choose a student and goal, run trials with minimal taps, or walk line-by-line through adolescent diagnostic templates with recording, “Say this” prompts, quick scoring, sound-pattern analysis, and structured follow-up flags. The app drafts documentation while keeping the clinician in control.

## Data/privacy notes

- No cloud services, third-party analytics, server storage, or external AI calls were added.
- New clinical and assessment data stays in local IndexedDB/Dexie tables.
- Google Pixel / Android Chrome users now see clear copy that Chrome built-in Gemini Nano / Prompt API is not currently exposed to Android web apps when flags are unavailable; the app continues with local guided tools.
- Exported files and handoffs may contain protected or sensitive information, so in-app and README copy now remind clinicians to follow consent, retention, backup, HIPAA, and FERPA review requirements.
- The app supports clinician judgment and does not diagnose or determine treatment.

## Testing performed

- `npm run lint`
- `npm run build`

No test script is currently defined in `package.json`.

## Known limitations / follow-up ideas

- New guided-session and assessment checklist tables are local IndexedDB records and are protected by the app lock screen, but field-level encryption currently remains limited to legacy logs and recordings.
- Listener Check uses simple clear/unclear item scoring; future work could add reusable item sets per target.
- QR handoff remains optimized for lightweight legacy logs; full guided-session backup is available through JSON export/import.
