# Hear for Speech

Hear for Speech is a local-first, offline-capable Progressive Web App (PWA) for Speech-Language Pathologists (SLPs), students, and caregivers. The app supports quick therapy-session data collection, editable documentation, home practice, listener checks, acoustic biofeedback, and local export/import.

The primary workflow is now session-centered:

**Client or student → Goal → Session → Trials → Cueing → Session note → Home practice → Progress**

Hear for Speech supports SLP judgment. It does not diagnose, prescribe treatment, replace clinical decision-making, or determine eligibility.

---

## Guided SLP Workflow

### Start Session
1. Open the app to the **Session** tab.
2. Select an existing client/student or create a local profile.
3. Select an active goal or create one for the client.
4. Pick a target sound/area and practice level:
   - Sound
   - Syllable
   - Word
   - Phrase
   - Sentence
   - Conversation
5. Run trials using large tablet-friendly buttons:
   - Correct
   - Approx
   - Not yet
6. Select cue level for upcoming trials:
   - Independent
   - Minimal
   - Moderate
   - Maximal
7. Add strategy chips as needed:
   - Visual cue
   - Verbal cue
   - Model
   - Slowed rate
   - Repetition
   - Contrast
   - Biofeedback
   - Self-monitoring
8. End the session, edit the generated documentation and home practice, then save locally.

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

The built-in adolescent speech clarity/intelligibility guide walks line-by-line through:

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
- Teen-friendly helper wording
- Result buttons such as clear, distorted, substituted, omitted, concern, monitor, or improved with cue
- Optional cue-level tagging
- SLP notes
- A one-tap recording control linked to that assessment item

Assessment audio is saved locally through the same recording storage used elsewhere in the app. If local security is enabled, recordings are encrypted using the existing local master key flow.

The generated assessment summary is editable and conservative. It summarizes checklist entries, recordings, sound probes, cueing/stimulability, and functional observation flags. The SLP remains responsible for reviewing recordings, selecting formal measures when required, interpreting findings, and writing final diagnostic conclusions.

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

## Optional Local Browser Assistant

The existing optional browser-native assistant uses supported local browser APIs when available and falls back to local rule-based text. The guided session workflow does not depend on it and does not add external AI services.

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
    "assessments": [],
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
