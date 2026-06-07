## Summary

Polishes the phone-first diagnostic workflow so an SLP can start from the Home screen, choose a diagnostic, print a patient read-ahead worksheet, record line-by-line, and keep moving without horizontal clipping or extra navigation.

## What changed

- Fixes mobile header/home layout overflow so small phones show the full Home workflow.
- Simplifies Home copy around the core path: pick patient, record lines, print plan.
- Adds a three-step Home runway for **Pick Patient → Record Lines → Print Plan**.
- Adds a patient read-ahead worksheet on the assessment Ready screen before recording begins.
- Adds **Print / Save PDF Worksheet** using the browser/device print sheet, keeping the app dependency-free.
- Adds a live diagnostic runway for **Say → Record → Tap Score → Next**.
- Adds **Next Line** to jump to the next unfinished assessment line.
- Updates README assessment instructions and handout/PDF wording.

## Why this helps SLPs

The app now supports the real in-room flow more directly: the clinician can prepare readable prompts for the patient, run the assessment from a phone, avoid hunting through sections, and finish with printable materials.

## Data/privacy notes

- Worksheet printing is generated locally in the browser.
- No new cloud services, analytics, server storage, or external AI calls are added.
- Printed worksheets remain clinician-controlled and should only be shared after SLP review.

## Testing performed

- `npm run lint`
- `npm run build`
- Mobile-emulated layout check at 390px width with no horizontal overflow.

## Known limitations / follow-up ideas

- Browser PDF creation still uses the native print/save-as-PDF flow instead of bundling a PDF library.
- A future pass could add a dedicated worksheet template editor for clinics.
- A future pass could add first-run coach marks, but the current flow avoids requiring a guide.
