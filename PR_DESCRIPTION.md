## Summary

Makes the **Assess** tab dramatically simpler for phone-based diagnostic starts: **New Patient** or **Load Patient**, confirm profile details, choose one diagnostic path, record line-by-line prompts, and generate editable SLP-controlled analysis.

## What changed

- Reworked the Assess landing screen into a bright, mobile-first launcher with clear phases: patient choice, new patient, load patient, profile, diagnostic, and ready.
- Added local-only assessment profile fields for age, gender/voice context, language/dialect context, hearing/listening access, diagnostic checklist lenses, and quick questionnaire/check selections.
- Added research-informed local checklist lines for language/dialect context, hearing/listening access, voice/resonance, noise/distance, student impact, caregiver/teacher input, Listener Check, and literacy follow-up flags.
- Added two plain-language diagnostic paths: **Voice / resonance check** and **Noise / listening check**.
- Updated generated diagnostic summaries to include profile context, selected diagnostic lenses, selected quick checks, and conservative “Consider...” follow-up flags.
- Updated README instructions and backup schema documentation for the simplified diagnostic workflow and new local fields.

## Why this helps SLPs

An SLP can sit down with only a phone, create or load a student in a few taps, pick a diagnostic, follow scripted lines, record speech, score checklist items, and leave with editable analysis and practice planning text. The app stays guided without hiding clinical judgment.

## Data/privacy notes

- No cloud services, analytics, server storage, or external AI calls were added.
- New fields are optional, local-only Dexie/IndexedDB data and do not require a breaking migration.
- Voice/resonance, hearing/listening, language/dialect, and literacy prompts are documentation and follow-up aids, not automated diagnoses.
- The workflow continues to require recording/assessment consent before saving audio.

## Testing performed

- `npm run lint`
- `npm run build`

## Known limitations / follow-up ideas

- Open-source acoustic tools such as forced aligners, phoneme recognizers, and acoustic-analysis libraries remain future research paths because most require native Python/server/WASM integration.
- Listener Check remains simple clear/unclear scoring; future work could add reusable item sets and richer listener summaries.
- Assessment profile fields are stored with assessments; a future client-profile editor could make longitudinal demographics/history easier to manage.
