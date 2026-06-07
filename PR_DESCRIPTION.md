## Summary

Makes HearForSpeech feel like a zero-doc, phone-first clinical workflow: open the app, choose patient, choose assessment/session, record, analyze, and finish with editable documentation and printable practice.

## What changed

- Adds a new default **Home** tab with **New Patient**, **Load Patient**, **Start Assessment**, **Start Therapy Session**, and **Review Results** actions.
- Adds assessment-pack shortcuts for 10-minute screen, full articulation/intelligibility, /r/ deep dive, voice/resonance, connected speech, school participation, and Listener Check.
- Adds Home patient timeline cards for recent patients, assessments, and analysis queue status.
- Adds a large active-line recording bar with **Record**, **Stop**, **Re-record**, and **Skip**.
- Surfaces analysis queue states as **Queued**, **Analyzing**, **Ready**, or **Needs review**.
- Adds a one-tap **Analyze all recordings** action wired to the batch assessment-session API.
- Expands the assessment end screen with editable diagnostic summary, school-style note, SOAP note, recommendations, home practice, copy, save, and print/PDF actions.
- Documents the no-doc workflow and batch endpoint expectations.

## Backend companion

The companion backend PR adds:

- `POST /v1/analysis/assessment-session`
- `assessment_json` plus multiple uploaded recordings
- Per-line analysis statuses and summary-ready facts

## Why this helps SLPs

The app no longer asks the SLP to understand tabs before doing clinical work. It starts with what the SLP is trying to do, then keeps the workflow moving with large controls, clear assessment packs, automatic analysis status, and one end screen for documentation and family/student practice.

## Data/privacy notes

- Recording consent is still required before saving or uploading audio.
- Backend output remains objective acoustic descriptors for SLP review only.
- Generated notes are editable drafts and do not diagnose, determine eligibility, or replace clinical judgment.
- The local workflow still works if backend analysis is unavailable.

## Testing performed

- `npm run lint`
- `npm run build`

## Known limitations / follow-up ideas

- The batch endpoint must be deployed on `api.hearforspeech.com` before **Analyze all recordings** succeeds in production.
- Future work can add retry persistence for queued analysis jobs.
- MFA forced alignment should come before Allosaurus/Gemma.
- Optional Gemma support should stay as a separate draft-assist worker, not a diagnostic authority.
