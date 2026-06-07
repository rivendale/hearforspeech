## Summary

Adds the next Diagnostic Portal pass: patient-facing read mode, fast SLP scoring controls, backend review-fact cards, and a richer Home patient timeline.

## What changed

- Renames the primary assessment entry point to **Diagnostic Portal**.
- Adds **Patient Read Mode**, a clean full-screen prompt view that hides private notes.
- Adds a current-line **SLP scoring drawer** for result taps, cueing, and one-tap note ideas.
- Adds objective backend **review fact cards** for acoustic metrics returned by the API.
- Surfaces backend upload and batch limits when `/v1/capabilities` provides them.
- Expands the Home patient timeline with recent diagnostics, therapy sessions, and analysis status.
- Updates README guidance for Patient Read Mode, the scoring drawer, and review facts.

## Why this helps SLPs

An SLP can now hand the phone to a student or place it in front of them without exposing private notes, then immediately return to clinician scoring. The flow is still quick, local-first, and clinician-controlled.

## Data/privacy notes

- Patient Read Mode only shows the current prompt, not clinician notes or other client data.
- Review fact cards are objective descriptors for SLP review only.
- No new cloud services, analytics, server storage, or external AI calls are added.

## Testing performed

- `npm run lint`
- `npm run build`

## Known limitations / follow-up ideas

- Patient Read Mode currently records the active line only; a future pass could add a continuous teleprompter queue.
- Review facts depend on the backend deployment exposing `review_facts`; the frontend falls back to local metric formatting if needed.
