# Hear for Speech: Clinical Speech Intelligibility Progressive Web App (PWA)

Hear for Speech is a privacy-first, offline-capable Progressive Web App (PWA) designed for older adolescents, parents, and Speech-Language Pathologists (SLPs). It provides visual-acoustic biofeedback, quantitative session tracking, ambient noise simulations, and secure local data locking using biometric passkeys.

This app is built on a **Zero-Cloud Architecture**—all records, configurations, voice recordings, and passkey biometric references remain strictly inside the user's local browser sandbox.

---

## 🚀 Key Features

### 1. Acoustic Biofeedback & Formant Targeting
* **Late 8 Phonemes**: Specific calibration targets for `/r/`, `/s/`, `/z/`, `/l/`, `/th/`, `/sh/`, `/ch/`, and `/zh/`.
* **F2/F3 Spectral Guideline Bands**: Real-time Fast Fourier Transform (FFT) analysis displays reference lines for F2 (~1600Hz) and F3 (~2200Hz).
* **Coarticulation Peak Detection**: Automatically alerts when formant peaks pinch close together (frequency delta $< 450\text{ Hz}$), indicating retroflex or bunched tongue movements for rhotic `/r/` target sounds.

### 2. Environmental Stress Simulator
* **Web Audio Noise Synthesizer**: Synthesizes low-frequency rumble and classroom chatter locally.
* **Volume Slider (0-100%)**: Evaluates speech intelligibility and articulation durability under realistic distractions.

### 3. Quantitative Session Tracker
* **Articulation Clarity Index**: 1-5 rating log.
* **PCC (Percentage of Consonants Correct) Calculator**: Linked to the Sentence Intelligibility Test (SIT) scoring sheet.
* **Automatic notes pre-filling**: Synced with active target phonemes and noise settings for fast charting.

### 4. Client-Side Biometric Lock (Passkeys & PIN)
* **WebAuthn Biometrics**: Lock and unlock session logs locally using FaceID, TouchID, Android Fingerprint, or Windows Hello.
* **Custom Keypad Modal**: In-app 4-digit backup PIN configuration to replace standard browser prompts.
* **Device-Local Execution**: Passkeys are bound to the specific physical device and browser. Users can register a passkey locally on their phone, tablet, and computer independently.

### 5. Seamless Patient-Mediated Data Handoff
* **Lightweight QR Code Handoff**: Synchronize session history from computer to phone (or vice-versa) instantly. Encodes session logs as a compressed, URL-safe Base64 hash appended to the app URL (`#handoff=...`). Simply scan the screen QR code with the phone camera to open and merge logs!
* **Native Web Share API**: Share backup `.json` files directly to other apps (AirDrop, Bluetooth, Email, Messages) on iOS and Android.
* **Clipboard Sync**: Quick export/import using a one-click clipboard reader.
* **Drag-and-Drop Dropzone**: Drag and drop `.json` backup files directly over the Exchange tab to trigger visual import confirmations.
* **Merge-Union Resolver**: Appends non-duplicate records automatically to prevent historical data loss.

---

## 📱 Mobile PWA Optimization Guide

Hear for Speech is optimized to feel like a premium native utility. To run the app on your mobile device:

### iOS (Safari)
1. Open **Safari** and navigate to `https://hearforspeech.com`.
2. Tap the **Share** button at the bottom of the screen.
3. Scroll down and select **Add to Home Screen**.
4. Launch the PWA from your Home Screen.
   * *Status Bar Melt*: The layout uses `black-translucent` meta tags, melting the app window directly into the hardware display bezels.

### Android (Chrome / Pixel)
1. Open **Chrome** and navigate to `https://hearforspeech.com`.
2. Tap the **Install App** button on the bottom banner, or select "Install app" / "Add to Home screen" from Chrome's menu.
3. Launch from the home screen for an immersive, standalone app wrapper.

---

## ⚙️ Enabling Native Local Gemini Nano AI

Hear for Speech uses Chrome's experimental **Prompt API** for local clinical goal analysis. Follow these developer setup steps on supported browsers (Desktop Chrome or Chrome on Google Pixel devices):

1. Open Chrome.
2. Configure flags:
   * Go to `chrome://flags/#optimization-guide-on-device-model` -> Select **Enabled BypassPrefRequirement**.
   * Go to `chrome://flags/#prompt-api-for-gemini-nano` -> Select **Enabled**.
3. Relaunch Chrome.
4. Open the Developer Tools console to trigger model downloads.
5. The app header badge will display **AI Active**. If native AI is unavailable, the app falls back to a zero-latency local clinical rules-engine.

---

## 🔒 Security & HIPAA Compliance

As an offline-first app, Hear for Speech guarantees absolute data privacy.
* **IndexedDB/Dexie.js Storage**: Session logs and audio files are stored in browser sandboxes. No cloud servers are contacted.
* **Local Biometrics**: Biometric signatures used for lock screens remain inside the device's secure enclave (T2/TPM). No biometric data is sent or stored.
* **HIPAA Alignment**: By locking logs behind passkeys and keeping database operations 100% device-local, clinicians can safely use the app on shared hardware without exposing Protected Health Information (PHI).

---

## 🛠️ Data Backup & Schema Specifications

Exported backups are formatted as JSON payloads. This schema is verified upon import to ensure data integrity:

```json
{
  "appName": "HearForSpeech",
  "exportedAt": "2026-06-06T17:00:00.000Z",
  "data": {
    "logs": [
      {
        "date": "2026-06-06",
        "rating": 4,
        "pcc": 85,
        "environment": "Quiet Space",
        "repairStrategies": ["Self-Correction", "Slower Rate"],
        "notes": "Focused on retroflex /r/ coarticulation under environmental noise.",
        "environmentalDifficulty": 25
      }
    ],
    "recordings": [
      {
        "id": 1,
        "date": "2026-06-06",
        "name": "Speech Calibration/r/ - 2026-06-06",
        "audioBase64": "data:audio/webm;base64,GkXfo59ChoEBQveBAUL..."
      }
    ]
  }
}
```

---

## 💻 Local Development

### Prerequisites
* **Node.js** (v18 or higher)
* **npm**

### Installation
```bash
# Clone the repository
git clone https://github.com/rivendale/hearforspeech.git
cd hearforspeech

# Install dependencies
npm install

# Run Vite development server
npm run dev

# Run ESLint validation
npm run lint

# Build production bundle
npm run build
```
