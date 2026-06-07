import { useState, useEffect, useCallback } from 'react';
import { Shield, Activity, Cpu, X, Sparkles, BarChart3, ClipboardList, Download, Brain, Home } from 'lucide-react';
import { useStore } from './store/useStore';
import type { AppTab } from './store/useStore';
import { db, type BackupPayload, type SessionLog } from './db/database';
import { 
  hashPIN, 
  deriveKeyFromPin, 
  base64ToBuffer, 
  bufferToBase64, 
  encryptSessionLog, 
  decryptSessionLog,
  toggleDatabaseEncryption 
} from './utils/crypto';
import { decompressData } from './utils/compression';
import { ClinicalAICopilot } from './components/ClinicalAICopilot';
import { HomeTab } from './tabs/HomeTab';
import { SessionTab } from './tabs/SessionTab';
import { AssessmentTab } from './tabs/AssessmentTab';
import { VisualizerTab } from './tabs/VisualizerTab';
import { TrackerTab } from './tabs/TrackerTab';
import { ProtocolTab } from './tabs/ProtocolTab';
import { ExportTab } from './tabs/ExportTab';
import { detectBuiltInAI, getPlatformInfo, type BuiltInAIStatus } from './utils/builtInAI';
import {
  fetchAnalysisCapabilities,
  getDefaultAnalysisApiUrl,
  type AnalysisCapabilities
} from './utils/advancedAnalysis';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

// --- Helper Component: AI Calibration Item ---
interface CalibrationItemProps {
  label: string;
  status: boolean;
  desc: string;
}

function CalibrationItem({ label, status, desc }: CalibrationItemProps) {
  return (
    <div className="flex items-start gap-3 p-3 bg-slate-900/50 border border-slate-800 rounded-2xl text-left">
      <div className={`mt-0.5 h-4.5 w-4.5 rounded-full flex items-center justify-center font-bold text-[10px] ${
        status 
          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25" 
          : "bg-amber-500/10 text-amber-400 border border-amber-500/25"
      }`}>
        {status ? "✓" : "!"}
      </div>
      <div>
        <span className="text-xs font-bold text-slate-200 block">{label}</span>
        <span className="text-[10px] text-slate-450 block leading-snug mt-0.5">{desc}</span>
      </div>
    </div>
  );
}

function WorkflowGuide({
  activeTab,
  onJump
}: {
  activeTab: string;
  onJump: (tab: AppTab) => void;
}) {
  const isAssessment = activeTab === 'assessment';

  return (
    <section className="hfs-workflow-card rounded-3xl p-4 mb-4 text-left">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-blue-700">
            Simple workflow
          </p>
          <h2 className="text-lg font-black text-slate-950 mt-1">
            {isAssessment ? 'Assess → record → print practice' : 'Session → trials → note → handout'}
          </h2>
          <p className="text-xs text-slate-700 mt-1 leading-relaxed">
            Start with the big button path. The app keeps notes local, drafts editable text, and lets you print or save a PDF for the student/family.
          </p>
        </div>
        <Sparkles className="text-blue-600 shrink-0" size={22} />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4">
        {[
          { step: '1', title: isAssessment ? 'Pick path' : 'Pick goal', body: isAssessment ? '10-min, teen, /r/, school' : 'Client, goal, target' },
          { step: '2', title: isAssessment ? 'Record lines' : 'Tap trials', body: isAssessment ? 'Say, listen, note' : 'Correct, approx, not yet' },
          { step: '3', title: 'Print PDF', body: 'Home practice sheet' }
        ].map(item => (
          <div key={item.step} className="rounded-2xl border border-blue-100 bg-white/80 p-3">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">
              {item.step}
            </span>
            <p className="text-xs font-black text-slate-950 mt-2">{item.title}</p>
            <p className="text-[10px] text-slate-600 leading-snug mt-1">{item.body}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <button
          type="button"
          onClick={() => onJump('session')}
          className={`min-h-[44px] rounded-2xl text-xs font-black transition ${activeTab === 'session' ? 'bg-blue-600 text-white' : 'bg-white border border-blue-100 text-blue-700'}`}
        >
          Start Session
        </button>
        <button
          type="button"
          onClick={() => onJump('assessment')}
          className={`min-h-[44px] rounded-2xl text-xs font-black transition ${activeTab === 'assessment' ? 'bg-blue-600 text-white' : 'bg-white border border-blue-100 text-blue-700'}`}
        >
          Start Assessment
        </button>
      </div>
    </section>
  );
}

export default function App() {
  const { 
    activeTab, 
    setActiveTab, 
    hasLocalAI, 
    setHasLocalAI, 
    setAiStatus,
    masterKey,
    setMasterKey,
    setIsSecurityEnabled
  } = useStore();

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const userAgent = navigator.userAgent || navigator.vendor || (window as Window & { opera?: string }).opera || '';
    const mobileCheck = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);
    const iosCheck = /iPhone|iPad|iPod/i.test(userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    return mobileCheck && iosCheck && !isStandalone;
  });
  const [showCalibrationModal, setShowCalibrationModal] = useState(false);
  const [aiCapability, setAiCapability] = useState<BuiltInAIStatus | null>(null);
  const [analysisApiUrl] = useState(getDefaultAnalysisApiUrl);
  const [analysisCapabilities, setAnalysisCapabilities] = useState<AnalysisCapabilities | null>(null);
  const [analysisApiError, setAnalysisApiError] = useState('');
  const [analysisApiChecking, setAnalysisApiChecking] = useState(true);
  const [isIOS] = useState(() => {
    if (typeof navigator === 'undefined') return false;
    const userAgent = navigator.userAgent || navigator.vendor || (window as Window & { opera?: string }).opera || '';
    return /iPhone|iPad|iPod/i.test(userAgent);
  });

  // Local device security locking states
  const [isLocked, setIsLocked] = useState(() => localStorage.getItem('hfs_security_enabled') === 'true');
  const [pinInput, setPinInput] = useState('');
  const [securityError, setSecurityError] = useState('');

  // PIN setup modal states
  const [pinSetupModal, setPinSetupModal] = useState<{
    isOpen: boolean;
    temporaryCredId: string | null;
    isFallback: boolean;
  }>({ isOpen: false, temporaryCredId: null, isFallback: false });
  const [pinSetupStep, setPinSetupStep] = useState<'first' | 'confirm'>('first');
  const [firstPin, setFirstPin] = useState('');
  const [enteredSetupPin, setEnteredSetupPin] = useState('');
  const [setupPinError, setSetupPinError] = useState('');

  // Cryptographic Setup of PIN + Master Key
  const setupSecurityKeys = useCallback(async (pin: string, temporaryCredId: string | null) => {
    try {
      // 1. Generate salt and Master Key
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const masterKeyInstance = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      );

      // 2. Derive encryption key from user PIN
      const pinKey = await deriveKeyFromPin(pin, salt);

      // 3. Encrypt the raw Master Key using the PIN key
      const rawMasterKey = await crypto.subtle.exportKey("raw", masterKeyInstance);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encryptedMasterKey = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        pinKey,
        rawMasterKey
      );

      // 4. Hash the PIN for simple lock screen verification
      const hashedPin = await hashPIN(pin);

      // 5. Save all keys locally
      localStorage.setItem('hfs_security_pin', hashedPin);
      localStorage.setItem('hfs_security_salt', bufferToBase64(salt));
      localStorage.setItem('hfs_encrypted_master_key', bufferToBase64(encryptedMasterKey));
      localStorage.setItem('hfs_master_key_iv', bufferToBase64(iv));
      localStorage.setItem('hfs_security_enabled', 'true');

      if (temporaryCredId) {
        localStorage.setItem('hfs_passkey_id', temporaryCredId);
      }

      // 6. Set keys in Zustand memory
      setMasterKey(masterKeyInstance);
      setIsSecurityEnabled(true);
      setIsLocked(false);

      // 7. Encrypt existing database logs in-place
      await toggleDatabaseEncryption(true, masterKeyInstance);

      // Reset modal state
      setPinSetupModal({ isOpen: false, temporaryCredId: null, isFallback: false });
      setPinSetupStep('first');
      setEnteredSetupPin('');
      alert(temporaryCredId 
        ? "Local biometric passkey and backup PIN enabled successfully!" 
        : "Local PIN security enabled successfully!"
      );
    } catch (err) {
      console.error("Failed to setup security keys:", err);
      setSetupPinError("Failed to initialize security lock.");
      setPinSetupStep('first');
      setEnteredSetupPin('');
    }
  }, [setMasterKey, setIsSecurityEnabled]);

  const handleSetupPinKey = useCallback((num: string) => {
    setSetupPinError('');
    setEnteredSetupPin((prev) => {
      if (prev.length < 4) {
        const newPin = prev + num;
        if (newPin.length === 4) {
          // Trigger setup step transitions asynchronously to let the UI render the final dot
          setTimeout(async () => {
            if (pinSetupStep === 'first') {
              setFirstPin(newPin);
              setEnteredSetupPin('');
              setPinSetupStep('confirm');
            } else {
              // Confirm step
              if (newPin === firstPin) {
                await setupSecurityKeys(newPin, pinSetupModal.temporaryCredId);
              } else {
                setSetupPinError("PINs do not match. Please start over.");
                setPinSetupStep('first');
                setEnteredSetupPin('');
              }
            }
          }, 100);
        }
        return newPin;
      }
      return prev;
    });
  }, [pinSetupStep, pinSetupModal.temporaryCredId, firstPin, setupSecurityKeys]);

  const cancelPinSetup = useCallback(() => {
    setPinSetupModal({ isOpen: false, temporaryCredId: null, isFallback: false });
    setPinSetupStep('first');
    setFirstPin('');
    setEnteredSetupPin('');
    setSetupPinError('');
  }, []);

  // Unlock with biometric FaceID/TouchID passkey
  const verifyLocalPasskey = useCallback(async () => {
    try {
      const savedCredIdBase64 = localStorage.getItem('hfs_passkey_id');
      if (!savedCredIdBase64) {
        setSecurityError("No biometric passkey registered.");
        return;
      }

      const credIdBuffer = base64ToBuffer(savedCredIdBase64);
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{
            type: "public-key",
            id: credIdBuffer
          }],
          userVerification: "required",
          timeout: 60000
        }
      });
      
      if (assertion) {
        if (masterKey) {
          setIsLocked(false);
          setSecurityError('');
          setPinInput('');
        } else {
          setSecurityError("First login after reload requires backup PIN to decrypt data keys.");
        }
      }
    } catch (err) {
      console.error("Local biometric scan failed:", err);
      setSecurityError("Biometric authentication failed or cancelled.");
    }
  }, [masterKey]);

  // Unlock with backup PIN and Decrypt Master Key
  const verifyPin = useCallback(async (pinCode: string) => {
    try {
      const savedHashedPin = localStorage.getItem('hfs_security_pin') || '';
      const enteredHash = await hashPIN(pinCode);

      if (enteredHash !== savedHashedPin) {
        setPinInput('');
        setSecurityError("Invalid backup PIN code.");
        return;
      }

      // PIN matches, decrypt master key
      const saltBase64 = localStorage.getItem('hfs_security_salt') || '';
      const encryptedMasterKeyBase64 = localStorage.getItem('hfs_encrypted_master_key') || '';
      const ivBase64 = localStorage.getItem('hfs_master_key_iv') || '';

      if (!saltBase64 || !encryptedMasterKeyBase64 || !ivBase64) {
        setPinInput('');
        setSecurityError("Security credentials are missing or corrupted.");
        return;
      }

      const salt = new Uint8Array(base64ToBuffer(saltBase64));
      const encryptedMasterKey = base64ToBuffer(encryptedMasterKeyBase64);
      const iv = new Uint8Array(base64ToBuffer(ivBase64));

      const pinKey = await deriveKeyFromPin(pinCode, salt);
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        pinKey,
        encryptedMasterKey
      );

      const masterKeyInstance = await crypto.subtle.importKey(
        "raw",
        decryptedBuffer,
        "AES-GCM",
        true,
        ["encrypt", "decrypt"]
      );

      setMasterKey(masterKeyInstance);
      setIsLocked(false);
      setSecurityError('');
      setPinInput('');
    } catch (err) {
      console.error("Failed to decrypt master key on login:", err);
      setPinInput('');
      setSecurityError("Master key decryption failed. Credentials corrupted.");
    }
  }, [setMasterKey]);

  // Enable security lock
  const registerLocalPasskey = async () => {
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userId = crypto.getRandomValues(new Uint8Array(16));
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { id: window.location.hostname || "localhost", name: "Hear for Speech" },
          user: {
            id: userId,
            name: "clinician@hearforspeech.com",
            displayName: "Hear for Speech Clinician"
          },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          authenticatorSelection: {
            userVerification: "required",
            residentKey: "preferred"
          },
          timeout: 60000
        }
      });
      if (credential) {
        const cred = credential as PublicKeyCredential;
        const base64Id = bufferToBase64(cred.rawId);
        setPinSetupStep('first');
        setFirstPin('');
        setEnteredSetupPin('');
        setSetupPinError('');
        setPinSetupModal({
          isOpen: true,
          temporaryCredId: base64Id,
          isFallback: false
        });
      }
    } catch (err) {
      console.error("Biometric registration failed:", err);
      // Fallback to PIN only
      setPinSetupStep('first');
      setFirstPin('');
      setEnteredSetupPin('');
      setSetupPinError('');
      setPinSetupModal({
        isOpen: true,
        temporaryCredId: null,
        isFallback: true
      });
    }
  };

  // Disable security lock (decrypt database in-place)
  const disableSecurity = async () => {
    if (confirm("Are you sure you want to disable local screen security? Articulation logs and audio recordings will be stored in plaintext on this device.")) {
      try {
        if (masterKey) {
          // Decrypt database in-place
          await toggleDatabaseEncryption(false, masterKey);
        }

        localStorage.removeItem('hfs_security_enabled');
        localStorage.removeItem('hfs_passkey_id');
        localStorage.removeItem('hfs_security_pin');
        localStorage.removeItem('hfs_security_salt');
        localStorage.removeItem('hfs_encrypted_master_key');
        localStorage.removeItem('hfs_master_key_iv');

        setMasterKey(null);
        setIsSecurityEnabled(false);
        setIsLocked(false);
        setSecurityError('');
        alert("Local security disabled.");
      } catch (err) {
        console.error("Failed to disable security:", err);
        alert("Failed to decrypt database. Security was not disabled.");
      }
    }
  };

  // Hash handoff sync state
  const [incomingHandoffData, setIncomingHandoffData] = useState<BackupPayload | null>(null);
  const [handoffMode, setHandoffMode] = useState<'merge' | 'overwrite'>('merge');

  // Process imported handoff data
  const processHandoffImport = async () => {
    if (!incomingHandoffData || !incomingHandoffData.data) return;
    
    const { logs } = incomingHandoffData.data;
    
    try {
      if (handoffMode === 'overwrite') {
        const proceed = confirm(
          "DANGER: Overwrite option will wipe all local data first. Proceed?"
        );
        if (!proceed) return;

        await db.transaction('rw', [db.logs, db.recordings], async () => {
          await db.logs.clear();
          await db.recordings.clear();

          for (const log of logs) {
            const logRecord: SessionLog = {
              date: log.date,
              rating: log.rating,
              pcc: log.pcc !== undefined ? log.pcc : 80,
              environment: log.environment || 'Quiet Clinical Space',
              repairStrategies: Array.isArray(log.repairStrategies) ? log.repairStrategies : [],
              notes: log.notes,
              environmentalDifficulty: log.environmentalDifficulty,
              environmentalNoiseLevel: log.environmentalNoiseLevel !== undefined ? log.environmentalNoiseLevel : log.environmentalDifficulty,
              naiveListenerScore: log.naiveListenerScore
            };

            const finalLog = masterKey ? await encryptSessionLog(logRecord, masterKey) : logRecord;
            await db.logs.add(finalLog);
          }
        });
      } else {
        // Merge logs
        await db.transaction('rw', [db.logs, db.recordings], async () => {
          let currentLogs = await db.logs.toArray();
          // Decrypt existing logs first to accurately check for duplicates
          if (masterKey) {
            currentLogs = await Promise.all(
              currentLogs.map(l => decryptSessionLog(l, masterKey))
            );
          }

          for (const log of logs) {
            const exists = currentLogs.some(l => l.date === log.date && l.notes === log.notes);
            if (!exists) {
              const logRecord: SessionLog = {
                date: log.date,
                rating: log.rating,
                pcc: log.pcc !== undefined ? log.pcc : 80,
                environment: log.environment || 'Quiet Clinical Space',
                repairStrategies: Array.isArray(log.repairStrategies) ? log.repairStrategies : [],
                notes: log.notes,
                environmentalDifficulty: log.environmentalDifficulty,
                environmentalNoiseLevel: log.environmentalNoiseLevel !== undefined ? log.environmentalNoiseLevel : log.environmentalDifficulty,
                naiveListenerScore: log.naiveListenerScore
              };

              const finalLog = masterKey ? await encryptSessionLog(logRecord, masterKey) : logRecord;
              await db.logs.add(finalLog);
            }
          }
        });
      }
      alert(`Successfully ${handoffMode === 'merge' ? 'merged' : 'restored'} handoff data!`);
      setIncomingHandoffData(null);
      window.location.reload();
    } catch (err) {
      console.error("Handoff import failed:", err);
      alert("Handoff import failed. See console.");
    }
  };

  // Check URL hash for handoff data on load
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkHash = async () => {
      const hash = window.location.hash;
      if (hash.startsWith('#handoff=')) {
        try {
          const base64Data = hash.replace('#handoff=', '');
          // Decompress the QR handoff string before parsing
          const decodedText = await decompressData(decodeURIComponent(base64Data));
          const parsed = JSON.parse(decodedText);
          if (parsed.appName === "HearForSpeech" && parsed.data) {
            setIncomingHandoffData(parsed);
          }
        } catch (err) {
          console.error("Failed to decode handoff URL hash:", err);
        }
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    };
    checkHash();
  }, []);

  // Trigger passkey scan immediately on load if locked
  useEffect(() => {
    if (isLocked && localStorage.getItem('hfs_passkey_id')) {
      const t = setTimeout(() => {
        verifyLocalPasskey();
      }, 600);
      return () => clearTimeout(t);
    }
  }, [isLocked, verifyLocalPasskey]);

  // Global browser API capability detection & install event binding
  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    const userAgent = navigator.userAgent || navigator.vendor || (window as Window & { opera?: string }).opera || '';
    const mobileCheck = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    // Listen for PWA installation trigger
    const handleInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);
      if (mobileCheck && !isStandalone) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);

    // Check for optional browser built-in AI. The app remains fully usable without it.
    const detectAI = async () => {
      const status = await detectBuiltInAI();
      setAiCapability(status);
      setHasLocalAI(status.available);
      setAiStatus(status.message);
    };
    detectAI();

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
    };
  }, [setHasLocalAI, setAiStatus]);

  useEffect(() => {
    let isMounted = true;

    const checkAnalysisApi = async () => {
      setAnalysisApiChecking(true);
      try {
        const capabilities = await fetchAnalysisCapabilities(analysisApiUrl);
        if (!isMounted) return;
        setAnalysisCapabilities(capabilities);
        setAnalysisApiError('');
      } catch (error) {
        if (!isMounted) return;
        setAnalysisCapabilities(null);
        setAnalysisApiError(error instanceof Error ? error.message : 'Analysis API is unavailable.');
      } finally {
        if (isMounted) setAnalysisApiChecking(false);
      }
    };

    checkAnalysisApi();
    const intervalId = window.setInterval(checkAnalysisApi, 5 * 60 * 1000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [analysisApiUrl]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
    }
    setDeferredPrompt(null);
  };

  const parselmouthEngine = analysisCapabilities?.engines.find(engine => engine.name === 'parselmouth');
  const isAnalysisApiReady = Boolean(analysisCapabilities && parselmouthEngine?.available);
  const analysisBadgeLabel = isAnalysisApiReady ? 'Analysis Ready' : analysisApiChecking ? 'Checking API' : 'Guided Tools';

  if (isLocked) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100 font-sans select-none">
        <div className="max-w-xs w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="bg-indigo-650/10 border border-indigo-500/25 p-4.5 rounded-full text-indigo-400 shadow-xl shadow-indigo-500/5">
              <Shield size={36} className="animate-pulse" />
            </div>
          </div>

          <div>
            <h2 className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Hear for Speech
            </h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Local Security Active</p>
          </div>

          {securityError && (
            <div className="bg-red-500/10 border border-red-500/20 px-3.5 py-2.5 rounded-2xl text-[10px] font-bold text-red-400 text-center leading-normal">
              {securityError}
            </div>
          )}

          {/* PIN keypad entry */}
          <div className="space-y-4">
            <div className="flex justify-center gap-3">
              {[0, 1, 2, 3].map((idx) => {
                const filled = pinInput.length > idx;
                return (
                  <div 
                    key={idx} 
                    className={`h-4.5 w-4.5 rounded-full border transition-all duration-300 ${
                      filled 
                        ? 'bg-indigo-500 border-indigo-400 scale-110 shadow-md shadow-indigo-500/35' 
                        : 'bg-slate-900 border-slate-700'
                    }`}
                  />
                );
              })}
            </div>

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto pt-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => {
                    if (pinInput.length < 4) {
                      const newPin = pinInput + num;
                      setPinInput(newPin);
                      if (newPin.length === 4) {
                        verifyPin(newPin);
                      }
                    }
                  }}
                  className="h-14 w-14 rounded-full bg-slate-900 border border-slate-805 hover:border-slate-700 text-white font-bold text-lg flex items-center justify-center transition active:scale-95 min-h-[48px]"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPinInput(pinInput.slice(0, -1))}
                className="h-14 w-14 rounded-full bg-slate-950 text-slate-400 text-xs font-bold flex items-center justify-center transition active:scale-95 min-h-[48px]"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pinInput.length < 4) {
                    const newPin = pinInput + '0';
                    setPinInput(newPin);
                    if (newPin.length === 4) {
                      verifyPin(newPin);
                    }
                  }
                }}
                className="h-14 w-14 rounded-full bg-slate-900 border border-slate-805 hover:border-slate-700 text-white font-bold text-lg flex items-center justify-center transition active:scale-95 min-h-[48px]"
              >
                0
              </button>
              {localStorage.getItem('hfs_passkey_id') && (
                <button
                  type="button"
                  onClick={verifyLocalPasskey}
                  className="h-14 w-14 rounded-full bg-indigo-650 hover:bg-indigo-600 text-white flex items-center justify-center transition active:scale-95 min-h-[48px]"
                  title="Unlock with Passkey"
                >
                  <Cpu size={20} />
                </button>
              )}
            </div>
          </div>

          {localStorage.getItem('hfs_passkey_id') && (
            <button
              onClick={verifyLocalPasskey}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-650 hover:to-purple-700 text-white font-bold py-3.5 rounded-2xl text-xs uppercase tracking-wider transition active:scale-98 min-h-[44px]"
            >
              Scan Device Passkey
            </button>
          )}

          <p className="text-[10px] text-slate-500 font-semibold uppercase leading-normal">
            Secure client session sandbox active.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="hfs-app-shell hfs-daylight min-h-screen overflow-x-hidden bg-slate-950 text-slate-100 flex flex-col antialiased font-sans select-none">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-900 px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="shrink-0 bg-indigo-650 p-2 rounded-xl text-white shadow-lg shadow-indigo-500/20">
            <Activity size={22} className="animate-pulse" />
          </div>
          <div className="text-left min-w-0">
            <h1 className="hfs-brand-title font-black text-lg tracking-tight bg-clip-text text-transparent truncate">
              Hear for Speech
            </h1>
            <p className="text-[9px] sm:text-[10px] text-slate-400 font-medium tracking-wide uppercase truncate">Bright guided SLP toolkit</p>
          </div>
        </div>
        
        {/* Calibration Badge trigger */}
        <button
          onClick={() => setShowCalibrationModal(true)}
          aria-label={analysisBadgeLabel}
          className={`shrink-0 max-w-[112px] sm:max-w-none flex items-center gap-1.5 border px-2 sm:px-3 py-1.5 rounded-full text-[9px] sm:text-[10px] font-bold tracking-wider uppercase transition-all duration-300 min-h-[32px] ${
            isAnalysisApiReady
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
              : analysisApiChecking
                ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
          }`}
        >
          <Cpu size={12} className={isAnalysisApiReady ? "" : "animate-pulse"} />
          <span className="truncate">{analysisBadgeLabel}</span>
        </button>
      </header>

      {/* Main Content Area */}
      <main className="hfs-app-main flex-1 min-h-0 max-w-full sm:max-w-2xl w-full mx-auto p-3 sm:p-4 pb-28 flex flex-col justify-start overflow-x-hidden overflow-y-auto">
        {activeTab === 'assessment' && (
          <WorkflowGuide activeTab={activeTab} onJump={setActiveTab} />
        )}
        {activeTab === 'home' && <HomeTab />}
        {activeTab === 'session' && <SessionTab />}
        {activeTab === 'assessment' && <AssessmentTab />}
        {activeTab === 'visualizer' && <VisualizerTab />}
        {activeTab === 'tracker' && <TrackerTab />}
        {activeTab === 'protocol' && <ProtocolTab />}
        {activeTab === 'export' && (
          <ExportTab 
            registerLocalPasskey={registerLocalPasskey}
            disableSecurity={disableSecurity}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-full sm:max-w-lg mx-auto bg-slate-950/95 backdrop-blur-lg border-t border-slate-900 flex justify-around p-2.5 z-50 rounded-t-2xl shadow-2xl">
        <button
          onClick={() => setActiveTab('home')}
          className={`relative flex-1 py-2.5 flex flex-col items-center justify-center rounded-xl transition-all duration-300 min-h-[48px] ${
            activeTab === 'home' ? 'text-sky-400 font-semibold' : 'text-slate-550 hover:text-slate-350'
          }`}
        >
          {activeTab === 'home' && <span className="absolute inset-x-4 top-0 h-0.5 bg-gradient-to-r from-sky-400 to-amber-400 rounded-full" />}
          <Home size={20} className={`transition-transform duration-300 ${activeTab === 'home' ? 'scale-110' : 'scale-100'}`} />
          <span className="text-[10px] mt-1 tracking-wider uppercase">Home</span>
        </button>

        <button 
          onClick={() => setActiveTab('session')} 
          className={`relative flex-1 py-2.5 flex flex-col items-center justify-center rounded-xl transition-all duration-300 min-h-[48px] ${
            activeTab === 'session' ? 'text-indigo-400 font-semibold' : 'text-slate-550 hover:text-slate-350'
          }`}
        >
          {activeTab === 'session' && <span className="absolute inset-x-4 top-0 h-0.5 bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full" />}
          <Activity size={20} className={`transition-transform duration-300 ${activeTab === 'session' ? 'scale-110' : 'scale-100'}`} />
          <span className="text-[10px] mt-1 tracking-wider uppercase">Session</span>
        </button>

        <button 
          onClick={() => setActiveTab('assessment')} 
          className={`relative flex-1 py-2.5 flex flex-col items-center justify-center rounded-xl transition-all duration-300 min-h-[48px] ${
            activeTab === 'assessment' ? 'text-cyan-400 font-semibold' : 'text-slate-550 hover:text-slate-350'
          }`}
        >
          {activeTab === 'assessment' && <span className="absolute inset-x-4 top-0 h-0.5 bg-gradient-to-r from-cyan-400 to-indigo-500 rounded-full" />}
          <ClipboardList size={20} className={`transition-transform duration-300 ${activeTab === 'assessment' ? 'scale-110' : 'scale-100'}`} />
          <span className="text-[10px] mt-1 tracking-wider uppercase">Assess</span>
        </button>

        <button 
          onClick={() => setActiveTab('tracker')} 
          className={`relative flex-1 py-2.5 flex flex-col items-center justify-center rounded-xl transition-all duration-300 min-h-[48px] ${
            activeTab === 'tracker' ? 'text-indigo-400 font-semibold' : 'text-slate-555 hover:text-slate-350'
          }`}
        >
          {activeTab === 'tracker' && <span className="absolute inset-x-4 top-0 h-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" />}
          <BarChart3 size={20} className={`transition-transform duration-300 ${activeTab === 'tracker' ? 'scale-110' : 'scale-100'}`} />
          <span className="text-[10px] mt-1 tracking-wider uppercase">Data</span>
        </button>

        <button 
          onClick={() => setActiveTab('export')} 
          className={`relative flex-1 py-2.5 flex flex-col items-center justify-center rounded-xl transition-all duration-300 min-h-[48px] ${
            activeTab === 'export' ? 'text-indigo-400 font-semibold' : 'text-slate-555 hover:text-slate-355'
          }`}
        >
          {activeTab === 'export' && <span className="absolute inset-x-4 top-0 h-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" />}
          <Download size={20} className={`transition-transform duration-300 ${activeTab === 'export' ? 'scale-110' : 'scale-100'}`} />
          <span className="text-[10px] mt-1 tracking-wider uppercase">Export</span>
        </button>
      </nav>

      {/* Floating PWA Onboarding Installation Banner */}
      {showInstallBanner && (
        <div className="fixed bottom-24 left-4 right-4 z-50 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 p-5 rounded-3xl shadow-2xl flex flex-col gap-3 max-w-sm mx-auto animate-slideUp">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              <Sparkles className="text-pink-400 animate-pulse" size={18} />
              <span className="font-bold text-xs uppercase tracking-wider text-slate-350">Optimize Clinic Environment</span>
            </div>
            <button 
              onClick={() => setShowInstallBanner(false)}
              className="text-slate-500 hover:text-slate-350 p-1 min-h-[30px]"
            >
              <X size={15} />
            </button>
          </div>

          <p className="text-xs text-slate-200 leading-relaxed font-semibold">
            Install <strong className="text-indigo-400">Hear for Speech</strong> to enable full-screen biofeedback and offline-first clinical use.
          </p>

          {isIOS ? (
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-[10px] text-slate-450 space-y-1.5 leading-relaxed font-normal text-left">
              <span className="font-bold text-slate-300 block uppercase">iOS Safari installation:</span>
              <ol className="list-decimal list-inside space-y-1">
                <li>Tap the <strong className="text-slate-200">Share</strong> button at the bottom of Safari.</li>
                <li>Scroll down and select <strong className="text-indigo-400">Add to Home Screen</strong>.</li>
              </ol>
            </div>
          ) : (
            <button
              onClick={handleInstallClick}
              disabled={!deferredPrompt}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-650 hover:to-purple-700 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition active:scale-98 min-h-[44px]"
            >
              Install Application
            </button>
          )}
        </div>
      )}

      {/* AI Calibration Diagnostic Checklist Modal */}
      {showCalibrationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 max-w-sm w-full p-6 rounded-3xl shadow-2xl space-y-5">
            <div className="flex justify-between items-start border-b border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <Brain className="text-indigo-400" size={20} />
                <h3 className="font-extrabold text-base text-slate-100 tracking-tight">Analysis Readiness</h3>
              </div>
              <button 
                onClick={() => setShowCalibrationModal(false)}
                className="text-slate-400 hover:text-slate-205 p-1 min-h-[36px]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Diagnostic items */}
            <div className="space-y-3">
              <CalibrationItem
                label="HearForSpeech API"
                status={isAnalysisApiReady}
                desc={isAnalysisApiReady
                  ? `${analysisCapabilities?.service || 'Analysis API'} ${analysisCapabilities?.version || ''} is reachable at ${analysisApiUrl}.`
                  : analysisApiChecking
                    ? `Checking ${analysisApiUrl}...`
                    : analysisApiError || `Could not reach ${analysisApiUrl}. Guided checklists still work.`
                }
              />
              <CalibrationItem
                label="Acoustic Metrics"
                status={Boolean(parselmouthEngine?.available)}
                desc={parselmouthEngine?.available
                  ? `Parselmouth is available${parselmouthEngine.version ? ` (${parselmouthEngine.version})` : ''} for recorded speech metrics.`
                  : 'Parselmouth metrics are unavailable; the app will keep recording/checklist data local.'
                }
              />
              <CalibrationItem label="Browser Engine Check" status={getPlatformInfo().isChromium} desc={getPlatformInfo().isChromium ? "Chromium-based browser detected." : "Non-Chromium browser detected; guided workflows still work."} />
              <CalibrationItem label="Built-in AI API Status" status={hasLocalAI} desc={aiCapability?.message || "Optional browser built-in AI detection is separate from the HearForSpeech API."} />
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl text-[11px] text-emerald-50 space-y-2 leading-relaxed font-normal text-left">
              <span className="font-bold block uppercase tracking-wider">Automatic assessment analysis</span>
              <p>
                The guided assessment can send newly recorded assessment lines to <span className="font-mono text-[10px]">{analysisApiUrl}</span> in the background when recording consent is confirmed and auto-analysis is enabled.
              </p>
              <p className="text-emerald-100/80">
                Results are objective acoustic descriptors for clinician review. They do not diagnose, determine eligibility, or replace SLP judgment.
              </p>
            </div>

            {/* Explainer */}
            {!hasLocalAI && (
              <div className="bg-slate-900 border border-slate-750 p-4 rounded-2xl text-[11px] text-slate-450 space-y-2 leading-relaxed font-normal text-left">
                <span className="font-bold text-slate-350 block uppercase">{aiCapability?.setupTitle || 'Optional Browser AI'}</span>
                <p>{aiCapability?.message || 'The app is checking whether browser built-in AI is available.'}</p>
                <ol className="list-decimal list-inside space-y-1.5 pt-1">
                  {(aiCapability?.setupSteps || []).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {aiCapability?.canTryDesktopFlags && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between gap-2 bg-slate-950 p-2 rounded-xl">
                      <span className="font-mono text-[9px] text-slate-350 select-all truncate">chrome://flags/#optimization-guide-on-device-model</span>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText("chrome://flags/#optimization-guide-on-device-model");
                          alert("Flag URL copied!");
                        }}
                        className="text-[9px] font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-lg"
                      >
                        Copy
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2 bg-slate-950 p-2 rounded-xl">
                      <span className="font-mono text-[9px] text-slate-350 select-all truncate">chrome://flags/#prompt-api-for-gemini-nano</span>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText("chrome://flags/#prompt-api-for-gemini-nano");
                          alert("Flag URL copied!");
                        }}
                        className="text-[9px] font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-lg"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}
                <p className="text-[10px] text-slate-500 italic">
                  Browser AI is optional. The production acoustic-analysis path uses the HearForSpeech API only after recording consent is confirmed.
                </p>
              </div>
            )}

            <button
              onClick={() => setShowCalibrationModal(false)}
              className="w-full bg-slate-700 hover:bg-slate-650 text-slate-205 font-bold py-3.5 rounded-2xl text-xs uppercase tracking-wider transition active:scale-99 min-h-[44px]"
            >
              Close Diagnostics
            </button>
          </div>
        </div>
      )}

      {/* Floating Clinical AI Chatbot Copilot */}
      <ClinicalAICopilot />

      {/* URL Handoff Import Modal */}
      {incomingHandoffData && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="bg-slate-800 border border-slate-700 max-w-sm w-full p-6 rounded-3xl shadow-2xl space-y-4 text-left">
            <div className="flex items-center gap-2 border-b border-slate-700 pb-2">
              <Activity className="text-indigo-400" size={20} />
              <h3 className="font-extrabold text-base text-slate-100 tracking-tight">
                Incoming Device Handoff
              </h3>
            </div>
            
            <p className="text-xs text-slate-350 leading-relaxed font-normal">
              Detected a live session logs transfer from another device. 
              We found <strong className="text-indigo-400 font-bold">{incomingHandoffData.data?.logs?.length || 0} session logs</strong> to import.
            </p>

            <div className="bg-slate-900/60 p-3.5 border border-slate-750 rounded-2xl text-[10px] space-y-1 text-slate-400">
              <div className="flex justify-between">
                <span>Source Export Date:</span>
                <span className="font-bold text-slate-200">
                  {incomingHandoffData.exportedAt ? new Date(incomingHandoffData.exportedAt).toLocaleString() : 'Unknown'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Recordings:</span>
                <span className="font-bold text-slate-200">
                  {incomingHandoffData.data?.recordings?.length || 0} (Excluded from QR Handoff)
                </span>
              </div>
            </div>

            <div className="space-y-1.5 font-normal">
              <span className="block text-[10px] font-extrabold text-slate-500 tracking-wider uppercase">Select Import Mode:</span>
              <div className="flex gap-2 bg-slate-950 p-1 rounded-2xl border border-slate-900">
                <button
                  type="button"
                  onClick={() => setHandoffMode('merge')}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase transition active:scale-98 min-h-[36px] ${
                    handoffMode === 'merge'
                      ? 'bg-indigo-650 text-white shadow'
                      : 'text-slate-550 hover:text-slate-350'
                  }`}
                >
                  Merge (Union)
                </button>
                <button
                  type="button"
                  onClick={() => setHandoffMode('overwrite')}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase transition active:scale-98 min-h-[36px] ${
                    handoffMode === 'overwrite'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : 'text-slate-550 hover:text-slate-350'
                  }`}
                >
                  Overwrite (Replace)
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIncomingHandoffData(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-650 text-slate-200 font-bold py-3.5 rounded-2xl text-[10px] uppercase tracking-wider transition active:scale-98 min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={processHandoffImport}
                className="flex-1 bg-indigo-650 hover:bg-indigo-600 text-white font-bold py-3.5 rounded-2xl text-[10px] uppercase tracking-wider transition active:scale-98 min-h-[44px]"
              >
                Confirm Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PIN Setup / Keypad Modal */}
      {pinSetupModal.isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="bg-slate-800 border border-slate-700 max-w-xs w-full p-6 rounded-3xl shadow-2xl space-y-5 text-center">
            <div>
              <h3 className="font-extrabold text-base text-slate-100 tracking-tight">
                {pinSetupModal.isFallback ? "Create Security PIN" : "Create Backup PIN"}
              </h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                {pinSetupStep === 'first' ? "Step 1: Enter 4-digit PIN" : "Step 2: Re-enter PIN to confirm"}
              </p>
            </div>

            {setupPinError && (
              <div className="bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-xl text-[9px] font-bold text-red-400">
                {setupPinError}
              </div>
            )}

            <div className="flex justify-center gap-3">
              {[0, 1, 2, 3].map((idx) => {
                const filled = enteredSetupPin.length > idx;
                return (
                  <div
                    key={idx}
                    className={`h-4.5 w-4.5 rounded-full border transition-all duration-300 ${
                      filled
                        ? 'bg-indigo-500 border-indigo-400 scale-110 shadow-md shadow-indigo-500/35'
                        : 'bg-slate-900 border-slate-700'
                    }`}
                  />
                );
              })}
            </div>

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-3 max-w-[200px] mx-auto pt-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleSetupPinKey(num.toString())}
                  className="h-12 w-12 rounded-full bg-slate-900 border border-slate-800 hover:border-slate-700 text-white font-bold text-base flex items-center justify-center transition active:scale-95 min-h-[44px]"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setEnteredSetupPin((prev) => prev.slice(0, -1))}
                className="h-12 w-12 rounded-full bg-slate-950 text-slate-400 text-[10px] font-bold flex items-center justify-center transition active:scale-95 min-h-[44px]"
              >
                Del
              </button>
              <button
                type="button"
                onClick={() => handleSetupPinKey('0')}
                className="h-12 w-12 rounded-full bg-slate-900 border border-slate-800 hover:border-slate-700 text-white font-bold text-base flex items-center justify-center transition active:scale-95 min-h-[44px]"
              >
                0
              </button>
              <button
                type="button"
                onClick={cancelPinSetup}
                className="h-12 w-12 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] font-bold flex items-center justify-center transition active:scale-95 min-h-[44px]"
              >
                Cancel
              </button>
            </div>
            
            <p className="text-[9.5px] text-slate-500 leading-normal font-medium max-w-[200px] mx-auto">
              {pinSetupModal.isFallback 
                ? "This PIN will lock local observation logs on this device's browser sandbox."
                : "This backup PIN allows unlocking logs if biometric scans fail."
              }
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
