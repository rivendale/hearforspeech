## Summary

Makes the guided assessment workflow use the production HearForSpeech analysis API by default and moves acoustic analysis from a manual, consent-checkbox panel into a clearer background workflow.

## What changed

- Defaults frontend analysis calls to `https://api.hearforspeech.com` and prevents production builds from accidentally using local-only API URLs.
- Adds top-right **Analysis Ready** status based on live `/v1/capabilities` checks.
- Adds an assessment-level **Auto analyze recordings** toggle.
- Automatically analyzes newly recorded assessment lines in the background when consent is confirmed and the API is ready.
- Persists per-line analysis snapshots on assessment items so generated drafts can include backend acoustic metrics.
- Simplifies each assessment line to show **Analysis ready**, **Analyzing**, **Analyze Now**, or **Re-run** without a separate per-line consent checkbox.
- Adds `API_AGENTS.txt` with the frontend/API contract and privacy boundaries.
- Updates README copy for the production API, background analysis, and clinical-safety wording.

## Why this helps SLPs

An SLP can start a guided diagnostic, record line-by-line prompts, and let acoustic metrics run in the background instead of opening a separate manual upload flow. Results appear where the SLP is already working and can be inserted into editable notes only when clinically useful.

## Data/privacy notes

- Recording consent is still required before assessment audio is recorded or uploaded.
- Analysis uses temporary backend processing and returns objective acoustic descriptors only.
- Backend metrics do not diagnose, determine eligibility, or replace SLP interpretation.
- Local checklist workflows, recordings, drafts, exports, and printing still work if the API is offline.
- Clinics remain responsible for device controls, consent, retention, backup handling, and HIPAA/FERPA compliance review.

## Testing performed

- `npm run lint`
- `npm run build`

## Known limitations / follow-up ideas

- MFA forced alignment and Allosaurus phone-candidate mode remain backend follow-ups.
- A Gemma/local-LLM worker may help with structured draft summarization later, but it should be optional, self-hostable, and clearly separated from diagnostic decisions.
- Background analysis currently runs when recordings finish; a future queue could retry failed uploads automatically.
