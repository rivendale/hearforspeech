## Summary

Simplifies the app’s front door around what the SLP actually asked for: pick a patient, record speech, mark what is heard, save/copy a quick note, and print a starter diagnostic when needed.

## What changed

- Replaces the complex Home workflow with a large, phone-first **Pick patient → Record speech → Mark what you hear** flow.
- Adds one-tap patient creation/selection directly on Home.
- Adds a big Start/Stop recording control with the starter reading passage visible above it.
- Adds SLP-controlled speech observation chips for common concerns such as distortions, omissions, reduced intelligibility, fast rate, low volume, and “better with model.”
- Adds quick note copy/save actions as unscored local guided-session notes.
- Adds a printable **14-year-old intelligibility starter** with a patient reading page and SLP listening checklist.
- Keeps advanced therapy session, data/review, and diagnostic portal tools available behind “More tools if needed.”
- Updates README to explain the simpler no-doc workflow first.

## Why this helps SLPs

The first screen no longer asks the clinician to understand the whole app. It supports the real “I only have my phone and need to start now” use case: select patient, record, mark speech observations, and decide whether to continue with a diagnostic.

## Data/privacy notes

- Recordings continue to save locally in the browser’s existing recording store.
- If the app has a local master key, quick recordings use the existing local encryption helper.
- The quick observation flow is SLP-confirmed and does not claim automatic diagnosis or eligibility decisions.
- Quick checks do not create fake PCC/rating progress points.
- Printed starter materials are generated locally and should be reviewed by the SLP before sharing.

## Testing performed

- `npm run lint`
- `npm run build`

## Known limitations / follow-up ideas

- Automatic speech-error detection remains a future backend-assisted feature and should stay clinician-reviewed.
- The printable starter is intentionally lightweight; future packets can add age-specific articulation, intelligibility, voice/resonance, and connected-speech variants.
