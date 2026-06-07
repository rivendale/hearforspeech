# Hear for Speech

Hear for Speech is a local-first, offline-capable Progressive Web App (PWA) for Speech-Language Pathologists (SLPs), students, and caregivers. The app supports quick therapy-session data collection, editable documentation, home practice, listener checks, acoustic biofeedback, and local export/import.

The primary workflow is now session-centered:

**Client or student → Goal → Session → Trials → Cueing → Session note → Home practice → Progress**

The interface is brighter and mobile-first so an SLP can use it on a phone in a real session. The Session and Assess tabs include a small three-step guide: pick the path, capture speech/data, then print or save a patient-friendly practice sheet.

Hear for Speech supports SLP judgment. It does not diagnose, prescribe treatment, replace clinical decision-making, or determine eligibility.

---

## Guided SLP Workflow

The app opens to a no-doc **Home** screen:

1. Tap **New Patient** or **Load Patient**.
2. Choose **Diagnostic Portal**, **Start Therapy Session**, or **Review Results**.
3. Pick an assessment pack such as **10-min screen**, **Full articulation / intelligibility**, **/r/ deep dive**, **Voice / resonance**, **Connected speech**, **School participation**, or **Listener Check**.
4. Follow the line-by-line prompts with the large record bar.
5. Let the analysis queue move recordings from **Queued** to **Analyzing** to **Ready**.
6. Finish with editable diagnostic summary, school note, SOAP note, home practice, and printable PDF.

### Start Session
1. Open the app to the **Session** tab.
2. Choose **New Patient** or **Load Patient**.
3. For a new patient, enter the name/initials and any optional saved settings.
4. For a loaded patient, review old sessions or tap **Create New Session**.
5. Select an active goal or create one for the patient.
6. Pick a target sound/area and practice level:
   - Sound
   - Syllable
   - Word
   - Phrase
   - Sentence
   - Conversation
7. Run trials using large tablet-friendly buttons:
   - Correct
   - Approx
   - Not yet
8. Select cue level for upcoming trials:
   - Independent
   - Minimal
   - Moderate
   - Maximal
9. Add strategy chips as needed:
   - Visual cue
   - Verbal cue
   - Model
   - Slowed rate
   - Repetition
   - Contrast
   - Biofeedback
   - Self-monitoring
10. End the session, edit the generated documentation and home practice, then save locally.
11. Review the **Patient handout preview**, then tap **Print / Save PDF** to print or save a practice sheet for the student/family.

### Session Data
The guided workflow calculates:

- Total trials
- Correct, approximate, and not-yet responses
- Independent accuracy
- Supported accuracy
- Most common cue level
- Strategies used

Accuracy definitions:

- **Independent accuracy** = correct trials with independent cueing / total trials
- **Supported accuracy** = correct or approximate trials after cueing / total trials

Both values appear in generated session notes so the clinician can describe performance and support needs clearly.

---

## Guided Assessment Workflow

Use the **Assess** tab when the SLP needs a diagnostic-style walkthrough for an adolescent student, not just a single test score.

The built-in Assessment Coach offers several teen-focused paths:

### Initial Diagnostic in a Few Taps

Use **Assess** when the SLP has only a phone/tablet and needs to start quickly:

1. Tap **New Patient** or **Load Patient**.
2. Enter or confirm the patient name and speech focus for the assessment.
3. Choose one diagnostic path:
   - **10-min screen**
   - **Full articulation / intelligibility**
   - **/r/ deep dive**
   - **Voice / resonance**
   - **Connected speech**
   - **School participation**
   - **Listener Check**
4. Review the **Patient read-ahead worksheet** and tap **Print Patient Read-Ahead PDF** if the student needs lines to read before recording.
5. Confirm recording/assessment consent.
6. Follow each line in the **Diagnostic Portal**: show **Patient Read** when the student needs a clean prompt screen, record when useful, then use the SLP scoring drawer.
7. Use **Next Line** to jump to the next unfinished item, or add custom lines whenever the clinician hears something unexpected.
8. Generate editable diagnostic summary, school note, SOAP note, recommendations, and therapy/home-practice starter text.

The assessment workflow is checklist-driven and local-first. It supports clinical organization, documentation, and therapy planning, but the SLP remains responsible for interpretation, diagnosis, eligibility decisions, and any standardized assessment requirements.

The new diagnostic launcher adds local-only checklist lenses inspired by common SLP assessment workflows:

- Language/dialect context
- Hearing and listening access
- Voice, pitch, loudness, vocal effort, and resonance screening prompts
- Functional listening in noise or at a distance
- Student, caregiver, teacher, and Listener Check impact ratings
- Conservative “Consider...” follow-up flags for formal measures, referrals, or deeper probes

These are prompts and documentation aids, not automated diagnoses. Open-source tools such as forced aligners, phoneme recognizers, or acoustic-analysis libraries may be useful future research paths, but many require native Python/server/WASM work and are not added to the browser app unless they can remain local-first, practical, and clinician-controlled.

### Printable Diagnostic Packets

Assessment setup includes a **Patient read-ahead worksheet** before recording starts. The Diagnostic Portal summary also includes selectable printable packets:

- **Full Packet**: read-ahead prompts, SLP worksheet, scoring checklist, and practice sheet.
- **Patient Read-Ahead**: simple prompts the patient can read before or during recording.
- **SLP Worksheet**: line-by-line scoring, cueing, recording, and notes worksheet.
- **Home Practice**: caregiver/student-friendly practice page after the assessment.

1. Before the diagnostic, review the read-ahead worksheet and tap **Print Patient Read-Ahead PDF** if the student needs printed lines.
2. After the session or assessment, review and edit the generated home-practice or practice-starter text.
3. Choose the packet type, then tap **Print Selected Packet**.
4. On mobile, use the browser/device print sheet, then choose **Save as PDF** or print to a connected printer.
5. Share only after the SLP confirms the target, cue, practice schedule, and caregiver wording.

Printed packets are generated locally for one student/family. Patient-facing packets use plain language; SLP worksheets may include checklist and scoring terms. They do not include other client records.

- **Teen Speech Clarity Screen** for a broad adolescent speech/intelligibility walkthrough
- **/r/ Diagnostic Deep Dive** for prevocalic, vocalic, blend, sentence, and stimulability probes
- **Connected Speech + Intelligibility** for natural samples, listener burden, repair strategies, and participation impact
- **School Participation Interview** for student voice, caregiver/teacher input, classroom tasks, and self-advocacy supports

The guides walk line-by-line through:

1. Consent and student orientation
2. Quick case history
3. Hearing access and oral-mechanism screening checklist
4. Connected speech sample recording
5. Sound probes for common adolescent speech targets
6. Reading and sentence sample recording
7. Stimulability and cueing trials
8. Listener Check support
9. Editable assessment summary and follow-up considerations

Each assessment line includes:

- The exact SLP prompt
- Teen-friendly “Say this” script wording
- A patient-facing **Patient Read** mode that hides private notes and shows a large readable prompt
- Result buttons such as clear, distorted, substituted, omitted, concern, monitor, or improved with cue
- A fast SLP scoring drawer for result, cueing, and one-tap note ideas
- Optional cue-level tagging
- Quick analysis tags for word position, speech context, participation, cue response, and self-monitoring
- SLP notes
- A one-tap recording control linked to that assessment item
- Backend **review facts** shown as objective metric cards for SLP review only

Assessment audio is saved locally through the same recording storage used elsewhere in the app. If local security is enabled, recordings are encrypted using the existing local master key flow.

### Analysis Ready Backend

HearForSpeech connects to the separate backend repo, [`rivendale/hearforspeech-server`](https://github.com/rivendale/hearforspeech-server), for acoustic metrics beyond local recording and checklist scoring. The hosted default is:

```bash
https://api.hearforspeech.com
```

The top-right **Analysis Ready** badge checks `/v1/capabilities` and confirms whether the backend and Parselmouth acoustic engine are reachable. For local development or clinic self-hosting, create `.env`:

```bash
VITE_HFS_ANALYSIS_API_URL=https://api.hearforspeech.com
# Optional, only if the backend requires it:
VITE_HFS_ANALYSIS_API_KEY=
```

When an assessment has recording consent confirmed and **Auto analyze recordings** is on, newly recorded assessment lines upload in the background for temporary processing. The line card changes to **Analysis ready** when metrics return, and the SLP can choose whether to insert those metrics into editable notes. The assessment header also includes **Analyze all recordings**, which uses the batch assessment endpoint when the backend has been deployed with `POST /v1/analysis/assessment-session`.

The backend uses temporary processing and returns supporting acoustic descriptors. It does not diagnose, determine eligibility, or replace SLP interpretation. If the backend is offline, the guided assessment, recordings, checklist scoring, drafts, printing, and exports still work from local browser storage.

The generated assessment summary is editable and conservative. It summarizes checklist entries, recordings, sound probes by sound/word position, cueing/stimulability, functional participation contexts, and “Consider...” follow-up flags. The SLP remains responsible for reviewing recordings, selecting formal measures when required, interpreting findings, and writing final diagnostic conclusions.

### Session Notes
After ending a session, Hear for Speech generates editable drafts in two formats:

- **School/IEP style note** with session summary, goal addressed, objective data, cueing, strategies, clinical observation, and next step
- **SOAP note** with S, O, A, and P sections

Generated text is a draft. Review and edit before copying into clinical, school, or billing documentation.

### Home Practice
The app generates editable caregiver/student-friendly practice text with:

- What was practiced today
- 5–10 practice targets
- A simple cue
- Practice schedule
- Caregiver note
- Encouragement language

Language mode can be toggled between **Clinician**, **Student**, and **Caregiver** so outputs can be more clinical or more plain-language.

---

## Listener Check

Use **Listener Check** when you want a simple clarity rating from an unfamiliar listener.

1. Start or run a guided session.
2. Tap **Listener Check**.
3. Hand the device to the listener.
4. The listener sees only a simple scoring screen, not private notes or other client records.
5. The listener marks each item as **Clear** or **Unclear** and selects confidence.
6. Results return to the SLP summary and can be saved with the session/client history.

The older Data tab also includes a Listener Check entry point for legacy session logs.

---

## Progress Dashboard

The Session tab includes a local client progress section showing:

- Recent guided sessions
- Active goals
- Accuracy over time
- Cueing trend over time
- Latest Listener Check result
- Last session summary
- Conservative “Consider...” next-step text based only on recorded data

Next-step text is intentionally clinician-controlled and conservative. It is not an automated treatment decision.

---

## Biofeedback and Practice Tools

### Acoustic Biofeedback
- Late-8 target sounds for `/r/`, `/s/`, `/z/`, `/l/`, `/th/`, `/sh/`, `/ch/`, and `/zh/`
- Live waveform display
- Optional reference overlays for target sounds
- Local saved recordings with a recording-consent reminder before audio capture

### Background Noise Practice
- Local Web Audio noise generation
- Adjustable background noise level
- Optional practice in more realistic listening conditions

---

## Local-First Privacy and Consent

Hear for Speech is local-first and designed to minimize cloud exposure.

- Client profiles, goals, guided sessions, trials, legacy logs, and recordings are stored in the browser’s local IndexedDB/Dexie database.
- The guided workflow does not add cloud services, third-party analytics, server storage, or external AI calls.
- Optional browser/device security can lock the app with local passkey/PIN support.
- Recording workflows remind users to confirm consent before saving audio.
- Exported files, clipboard text, and QR handoffs may contain protected or sensitive information.
- The Session tab includes demo mode with a fake sample client.
- The Session tab includes one-tap deletion for a selected client’s local guided-session data.

Organizations and clinicians remain responsible for device controls, consent, retention, backup handling, secure export storage, and HIPAA/FERPA compliance review.

---

## Export Data Safely

Use the **Export** tab to back up or move local data.

- **Full backup** includes session data and audio recordings.
- **Logs only** excludes audio recordings but may still contain sensitive notes and client/session details.
- **QR handoff** is best for lightweight log transfer between devices.
- **Import/restore** supports merge or overwrite modes.

Before sharing an export, confirm that the recipient, storage location, and transfer method are approved for your setting.

---

## Optional Browser Built-In AI

The optional browser-native assistant uses supported local browser APIs when available and falls back to local rule-based text. The guided session and assessment workflows do not depend on built-in AI and do not add external AI services.

On Google Pixel / Android Chrome and iOS browsers, Chrome’s built-in Gemini Nano / Prompt API is not currently exposed to web apps. If Chrome says the related flags are “not available on your platform,” there is no app-side switch that can force them on. Hear for Speech still works local-first with guided assessment, recording, checklists, Listener Check, summaries, and exports.

On supported desktop Chrome/Chromebook builds, the app can detect newer `LanguageModel` support or legacy `window.ai` support when the browser exposes it.

---

## Data Backup Schema

Exported backups are JSON payloads. Older backups with only `logs` and `recordings` remain supported. Newer backups may also include guided-session tables:

```json
{
  "appName": "HearForSpeech",
  "exportedAt": "2026-06-06T17:00:00.000Z",
  "data": {
    "clients": [
      {
        "id": "client-id",
        "displayName": "Taylor Demo",
        "initials": "TD",
        "ageGroup": "School-age",
        "createdAt": "2026-06-06T17:00:00.000Z",
        "updatedAt": "2026-06-06T17:00:00.000Z"
      }
    ],
    "goals": [],
    "guidedSessions": [],
    "trials": [],
    "listenerChecks": [],
    "assessments": [
      {
        "id": "assessment-id",
        "clientId": "client-id",
        "template": "adolescent_speech_intelligibility",
        "studentAge": 14,
        "languageBackground": "English; Spanish at home",
        "hearingStatus": "passed recent screen; noise concern",
        "diagnosticFlags": ["bilingual_dialect", "hearing_access", "noise_distance"],
        "diagnosticQuestionnaires": ["student_impact", "listener_check"],
        "consentConfirmed": true,
        "status": "draft",
        "startedAt": "2026-06-06T17:00:00.000Z",
        "createdAt": "2026-06-06T17:00:00.000Z",
        "updatedAt": "2026-06-06T17:00:00.000Z"
      }
    ],
    "assessmentItems": [],
    "logs": [
      {
        "date": "6/6/26, 1:00 PM",
        "rating": 4,
        "pcc": 82,
        "environment": "Therapy room",
        "repairStrategies": ["Visual cue", "Slowed rate"],
        "notes": "Editable session note text",
        "naiveListenerScore": 90
      }
    ],
    "recordings": [
      {
        "id": 1,
        "date": "6/6/26, 1:00 PM",
        "name": "Speech Recording /r/",
        "audioBase64": "data:audio/webm;base64,..."
      }
    ]
  }
}
```

---

## Local Development

### Prerequisites
- Node.js 18 or higher
- npm

### Commands
```bash
npm install
npm run dev
npm run lint
npm run build
```
