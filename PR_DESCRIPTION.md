## Summary

Improves the **Record → Stop → Analyze** review experience so backend speech-sound candidates are easier for an SLP to interpret and confirm.

## What changed

- Extends frontend analysis types for `target_word`, `word_position`, `category`, and `score`.
- Shows candidate cards with the target word/sound, confidence label, review score, word position/category, and evidence.
- Includes enriched candidate context in copied/generated analysis notes.
- Documents that candidate scores rank review priority and are not diagnoses or accuracy percentages.

## Why this helps SLPs

The clinician can move faster from recording to review: likely speech-sound patterns now identify the specific word/position and evidence to check while replaying the sample.

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
