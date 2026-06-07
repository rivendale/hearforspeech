## Summary

Adds SLP-confirmed analyzer labels to the **Record → Stop → Analyze** workflow so clinician feedback can tune future candidate ranking.

## What changed

- Adds a local `speechSoundReviews` Dexie table for SLP candidate labels.
- Adds **Confirm**, **Rule out**, and **Unsure** buttons to analyzer candidate cards.
- Sends confirmed/ruled-out labels as `calibration_json` with future patient analysis requests.
- Displays calibration summaries returned by the backend.
- Includes saved label counts in quick notes and full backups/imports.
- Deletes review labels with one-tap patient data deletion and full local data wipes.

## Why this helps SLPs

The clinician can quickly teach the app which analyzer candidates were useful or not useful, without creating a separate labeling tool. Over time, repeated SLP review makes the candidate list easier to scan while preserving SLP-controlled interpretation.

## Data/privacy notes

- Recordings still save locally unless the SLP taps Analyze.
- Analyze sends the recording to the configured HearForSpeech API for temporary processing.
- SLP labels save locally and are sent only as request-time calibration payloads or user-controlled exports.
- Candidate errors are SLP-review prompts, not diagnoses or eligibility decisions.
- Quick checks save as unscored local guided-session notes.

## Testing performed

- `npm run lint`
- `npm run build`

## Known limitations / follow-up ideas

- Calibration needs repeated SLP labels before it meaningfully changes ranking.
- Backend MFA timestamps and Allosaurus phone candidates depend on server-side model/dependency availability.
- Future UI can add replay timestamps, bulk label export, and target-specific label review dashboards.
