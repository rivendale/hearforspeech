## Summary

Adds selectable printable Diagnostic Portal packets so an SLP can print/save a read-ahead worksheet, SLP scoring worksheet, full assessment packet, or home-practice sheet directly from the guided workflow.

## What changed

- Adds a print-packet selector to the Diagnostic Portal summary screen.
- Adds packet builders for Full Packet, Patient Read-Ahead, SLP Worksheet, and Home Practice.
- Adds a line-by-line clinician worksheet with result, cueing, recording, and notes fields.
- Improves print rendering with checklist lines and page breaks.
- Keeps patient-facing packet language plain and SLP-facing worksheet language clinical.
- Updates README instructions for printable Diagnostic Portal packets.

## Why this helps SLPs

The therapist can walk in with only a phone, choose an assessment, print/save patient read-ahead prompts before recording, then leave with a clinician worksheet and caregiver-friendly home practice without hunting through docs.

## Data/privacy notes

- Packets are generated locally from the current selected patient/assessment.
- Patient-facing packets do not expose other clients or private clinician-only notes beyond the chosen packet content.
- No cloud storage, analytics, server-side records, or external AI calls are added.

## Testing performed

- `npm run lint`
- `npm run build`

## Known limitations / follow-up ideas

- Printing uses the browser/device print sheet; mobile PDF save behavior depends on the device/browser.
- Future work could add branded district/clinic packet templates and QR-based caregiver practice sharing.
