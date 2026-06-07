## Summary

Makes the app front door a simple **Record → Stop → Analyze** workflow and adds a full 14-year-old sound inventory path.

## What changed

- Updates Home to lead with **Record. Stop. Analyze.**
- Adds a big Analyze button after recording.
- Wires Analyze to `POST /v1/analysis/speech-sound-patterns`.
- Shows possible speech-sound error candidates for SLP review, including possible distortion, omission, substitution, cluster reduction, and intelligibility/recording-quality flags.
- Keeps SLP confirmation chips before documentation.
- Adds a printable 14-year-old full sound inventory with consonants by word position, vowels, clusters, multisyllabic words, connected speech, checklist, and report starter.
- Adds a guided full sound inventory assessment preset.
- Updates frontend analysis types and README.

## Why this helps SLPs

The clinician no longer has to understand the whole app before using it. The main screen supports the desired flow: select patient, record, stop, analyze, review likely speech-sound patterns, confirm what was actually heard, and save/copy the note.

## Data/privacy notes

- Recordings still save locally unless the SLP taps Analyze.
- Analyze sends the recording to the configured HearForSpeech API for temporary processing.
- Candidate errors are SLP-review prompts, not diagnoses or eligibility decisions.
- Quick checks save as unscored local guided-session notes.

## Testing performed

- `npm run lint`
- `npm run build`

## Known limitations / follow-up ideas

- Accuracy improves most with scripted prompts and full sound inventory recordings.
- Backend MFA timestamps and Allosaurus phone candidates depend on server-side model/dependency availability.
- Future UI can add confirm/ignore buttons per candidate with replay timestamps.
