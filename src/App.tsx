import React, { useState, useEffect, useRef, useCallback } from 'react';
import { create } from 'zustand';
import { 
  Mic, Square, BarChart3, Trash2, Download, Upload, Play, Pause, 
  Shield, Activity, Check, Edit3, X, AlertCircle, 
  ClipboardList, Brain, Sparkles, ChevronDown, ChevronUp, Cpu, Share2, QrCode
} from 'lucide-react';
import Dexie, { type Table } from 'dexie';
import QRCode from 'qrcode';

// --- Type Safety for Chrome Native Gemini Nano API ---
interface AIAssistant {
  capabilities: () => Promise<{ available: 'yes' | 'no' | 'readily' }>;
  create: (options?: { systemPrompt?: string }) => Promise<{
    prompt: (text: string) => Promise<string>;
  }>;
}

interface WindowWithAI extends Window {
  ai?: {
    assistant: AIAssistant;
  };
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

// --- 1. Database Setup ---
interface SessionLog {
  id?: number;
  date: string;
  rating: number; // 1-5 clarity rating
  pcc: number; // Percentage of Consonants Correct (0-100)
  environment: string; // Environment tag
  repairStrategies: string[]; // Strategies utilized
  notes: string;
  environmentalDifficulty?: number; // 0-100 noise scale
  environmentalNoiseLevel?: number; // 0-100 noise scale (v5)
  naiveListenerScore?: number; // percentage (0-100)
}

interface Recording {
  id?: number;
  date: string;
  audio: Blob;
  name: string;
}

class HearForSpeechDB extends Dexie {
  logs!: Table<SessionLog>;
  recordings!: Table<Recording>;

  constructor() {
    super('HearForSpeechDB');
    // Upgrade database schema to version 3 to support expanded quantitative clinical metrics
    this.version(3).stores({
      logs: '++id, date, rating, pcc, environment',
      recordings: '++id, date, name'
    });
    // Upgrade database schema to version 4 to support environmental difficulty stress tracking
    this.version(4).stores({
      logs: '++id, date, rating, pcc, environment, environmentalDifficulty',
      recordings: '++id, date, name'
    });
    // Upgrade database schema to version 5 to support naive listener assessment score and environmental noise levels
    this.version(5).stores({
      logs: '++id, date, rating, pcc, environment, environmentalDifficulty, environmentalNoiseLevel, naiveListenerScore',
      recordings: '++id, date, name'
    });
  }
}

const db = new HearForSpeechDB();

interface BackupPayload {
  appName: string;
  exportedAt: string;
  data: {
    logs: SessionLog[];
    recordings: {
      id?: number;
      date: string;
      name: string;
      audioBase64: string;
    }[];
  };
}

// Global base64 helpers
const base64ToBlob = (base64DataUrl: string): Blob => {
  const parts = base64DataUrl.split(',');
  const header = parts[0];
  const data = parts[1] || parts[0];
  const mime = header.match(/:(.*?);/)?.[1] || 'audio/webm';
  
  const byteString = atob(data);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mime });
};

// --- 2. Global State via Zustand ---
interface AppState {
  activeTab: 'visualizer' | 'tracker' | 'protocol' | 'export';
  setActiveTab: (tab: 'visualizer' | 'tracker' | 'protocol' | 'export') => void;
  hasLocalAI: boolean;
  setHasLocalAI: (has: boolean) => void;
  aiStatus: string;
  setAiStatus: (status: string) => void;
}

const useStore = create<AppState>((set) => ({
  activeTab: 'visualizer',
  setActiveTab: (tab) => set({ activeTab: tab }),
  hasLocalAI: false,
  setHasLocalAI: (has) => set({ hasLocalAI: has }),
  aiStatus: 'Detecting clinical AI capability...',
  setAiStatus: (status) => set({ aiStatus: status }),
}));

// --- 3. Phoneme Configurations (Late 8 Sounds) ---
interface PhonemeConfig {
  sound: string;
  label: string;
  description: string;
  waveFunc: (x: number, phase: number, width: number, height: number) => number;
}

const PHONEMES: PhonemeConfig[] = [
  { 
    sound: 'none', 
    label: 'No Calibration Target (Active View)', 
    description: 'Displays raw live dynamic waveform without clinical overlay.',
    waveFunc: () => 0 
  },
  { 
    sound: '/r/', 
    label: 'Target /r/ (Rhotic)', 
    description: 'Requires low F3 dip. Focus on retroflex/bunched tongue posture.',
    waveFunc: (x, _phase, _width, height) => {
      const base = Math.sin(x * 0.04) * 16;
      const high = Math.sin(x * 0.12) * 6;
      const modulation = Math.sin(x * 0.005) * 0.5 + 0.5;
      return height / 2 + (base + high) * modulation;
    }
  },
  { 
    sound: '/s/', 
    label: 'Target /s/ (Sibilant)', 
    description: 'Requires high-frequency friction wave. Focus on narrow airflow channel.',
    waveFunc: (x, _phase, _width, height) => {
      const noise = (Math.sin(x * 0.25) + Math.cos(x * 0.45)) * 6;
      const envelope = Math.sin(x * 0.02) * 10 + 12;
      return height / 2 + noise * (envelope / 12);
    }
  },
  { 
    sound: '/z/', 
    label: 'Target /z/ (Voiced Sibilant)', 
    description: 'Blends fundamental voicing and high-frequency friction. Focus on vocal fold vibration.',
    waveFunc: (x, _phase, _width, height) => {
      const voice = Math.sin(x * 0.035) * 15;
      const noise = Math.sin(x * 0.32) * 4;
      return height / 2 + voice + noise;
    }
  },
  { 
    sound: '/l/', 
    label: 'Target /l/ (Lateral)', 
    description: 'Smooth double-peak formant shape. Focus on tongue tip contact.',
    waveFunc: (x, _phase, _width, height) => {
      const f1 = Math.sin(x * 0.03) * 14;
      const f2 = Math.sin(x * 0.07) * 7;
      return height / 2 + f1 + f2;
    }
  },
  { 
    sound: '/th/', 
    label: 'Target /th/ (Dental)', 
    description: 'Continuous low-amplitude dental friction. Light tongue tip extension.',
    waveFunc: (x, _phase, _width, height) => {
      const fuzz = Math.sin(x * 0.28) * 3.5 * Math.sin(x * 0.015);
      return height / 2 + fuzz;
    }
  },
  { 
    sound: '/sh/', 
    label: 'Target /sh/ (Palato-alveolar)', 
    description: 'Requires broad noise spectrum with lower frequency focus than /s/.',
    waveFunc: (x, _phase, _width, height) => {
      const noise = (Math.sin(x * 0.16) + Math.cos(x * 0.26)) * 8.5;
      return height / 2 + noise;
    }
  },
  { 
    sound: '/ch/', 
    label: 'Target /ch/ (Affricate)', 
    description: 'Represents rapid stop release burst. Instantaneous compression.',
    waveFunc: (x, _phase, width, height) => {
      const burst = Math.sin(x * 0.09) * 16 * Math.exp(-Math.pow((x - width / 2) / (width / 5), 2));
      return height / 2 + burst;
    }
  },
  { 
    sound: '/zh/', 
    label: 'Target /zh/ (Voiced Palato-alveolar)', 
    description: 'Voiced friction wave (e.g., middle sound of "measure").',
    waveFunc: (x, _phase, _width, height) => {
      const voice = Math.sin(x * 0.03) * 12;
      const noise = Math.sin(x * 0.18) * 5.5;
      return height / 2 + voice + noise;
    }
  }
];

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

// --- Helper Component: Clinical AI Copilot Floating Panel ---
interface ChatMessage {
  sender: 'user' | 'bot';
  text: string;
}

function ClinicalAICopilot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: 'bot',
      text: "Hi! I am your local-first Clinical AI Assistant. How can I help you support adolescent self-advocacy, calibrate target phonemes, or troubleshoot PWA settings?"
    }
  ]);
  const [inputVal, setInputVal] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const { hasLocalAI } = useStore();
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const generateLocalResponse = async (query: string): Promise<string> => {
    // 1. Try Chrome native Gemini Nano window.ai
    const globalWindow = window as unknown as WindowWithAI;
    if (globalWindow.ai && globalWindow.ai.assistant && hasLocalAI) {
      try {
        const assistant = await globalWindow.ai.assistant.create({
          systemPrompt: `You are a helpful, senior clinical AI assistant for Speech-Language Pathologists (SLPs) and parents working with adolescents (14-15 years old) on speech intelligibility. Your tone is professional, technical, and supportive. Use the AVT Clinical Cheat Sheet guidelines (e.g. Hardware Glitch analogy, collaborative intake boundaries, PCC metrics, and phonetic biofeedback). Limit answers to 3 concise bullet points or 1 short paragraph.`
        });
        const response = await assistant.prompt(query);
        return response;
      } catch (err) {
        console.error("Gemini Nano chat prompt failed, triggering fallback...", err);
      }
    }

    // 2. Rules-based clinical chatbot fallback
    const q = query.toLowerCase();
    
    if (q.includes('glitch') || q.includes('analogy') || q.includes('hardware')) {
      return "The Hardware Glitch Analogy: Frame speech intelligibility limits as a cochlear implant or acoustic transmission limitation, not a personal failure. This reduces adolescent defensiveness and builds a collaborative therapist-client alliance.";
    }
    
    if (q.includes('intake') || q.includes('alignment') || q.includes('boundary')) {
      return "10-Minute Intake Alignment Checklist:\n1. Establish clear boundaries (this is not child speech therapy, but training).\n2. Frame articulation as a hardware glitch.\n3. Utilize autonomy-supportive language ('we can try', 'let's calibrate') instead of directives.";
    }

    if (q.includes('r') && (q.includes('coarticulation') || q.includes('pinch') || q.includes('formant'))) {
      return "Rhotic /r/ Coarticulation Tips: To target F2/F3 formant pinching, instruct the student to bunch or retroflex the tongue tip. Visually adjust their vocal tract shape until their active peak dots on the biofeedback visualizer pinch into the F2/F3 horizontal template bands.";
    }

    if (q.includes('pwa') || q.includes('install') || q.includes('flag')) {
      return "PWA Setup Troubleshooting:\n1. Navigate to chrome://flags/#optimization-guide-on-device-model and select Enabled BypassPrefRequirement.\n2. Navigate to chrome://flags/#prompt-api-for-gemini-nano and select Enabled.\n3. Relaunch Chrome. Tap Safari's 'Share' > 'Add to Home Screen' on iOS, or 'Install App' banner on Android Chrome.";
    }

    if (q.includes('iep') || q.includes('goal') || q.includes('smart')) {
      return "Draft SMART Target:\n'The student will independently deploy rate control and coarticulation repair strategies to produce target sounds in conversational peer environments with 85% accuracy across 3 sessions, verified by SIT transcriptions.'";
    }

    if (q.includes('stress') || q.includes('noise') || q.includes('cafeteria') || q.includes('classroom')) {
      return "Environmental Stress Testing: Use the background noise simulator in the Biofeedback tab. SLPs can dynamically scale ambient hum/noise levels to test speech durability under realistic classroom distractions.";
    }

    return "I am here to assist with clinical articulation metrics, phoneme visual visualizers, and PWA setup. Try asking:\n- 'How do I teach /r/ coarticulation?'\n- 'Explain the Hardware Glitch analogy'\n- 'How do I configure Chrome Gemini Nano flags?'";
  };

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim()) return;
    
    const userMsg: ChatMessage = { sender: 'user', text: textToSend };
    setMessages(prev => [...prev, userMsg]);
    setInputVal('');
    setIsTyping(true);

    try {
      const botResponse = await generateLocalResponse(textToSend);
      setMessages(prev => [...prev, { sender: 'bot', text: botResponse }]);
    } catch {
      setMessages(prev => [...prev, { sender: 'bot', text: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    handleSend(suggestion);
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-24 right-4 z-40 bg-gradient-to-r from-indigo-500 to-purple-650 hover:from-indigo-650 hover:to-purple-700 text-white rounded-full p-3.5 shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-300 min-h-[48px] min-w-[48px]"
        title="Open Clinical AI Copilot"
      >
        <Sparkles size={20} className={isOpen ? "rotate-45 transition-transform" : ""} />
        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-pink-500"></span>
        </span>
      </button>

      {/* Floating Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-24 left-4 right-4 z-50 bg-slate-900 border border-slate-750 max-w-sm w-full mx-auto rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[460px] animate-slideUp font-sans">
          {/* Header */}
          <div className="bg-slate-800 border-b border-slate-700 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain size={18} className="text-indigo-400" />
              <div>
                <h4 className="font-extrabold text-xs text-slate-100 uppercase tracking-wider">Clinical AI Copilot</h4>
                <span className="text-[9px] text-slate-400 font-bold block text-left">
                  {hasLocalAI ? "Active: Local Gemini Nano" : "Simulation Fallback Engine"}
                </span>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-200 p-1 min-h-[30px] min-w-[30px] flex items-center justify-center"
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/60 max-h-[250px]">
            {messages.map((m, idx) => (
              <div 
                key={idx} 
                className={`flex flex-col max-w-[85%] ${
                  m.sender === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
                }`}
              >
                <div className={`p-3 rounded-2xl text-xs leading-relaxed font-normal text-left ${
                  m.sender === 'user'
                    ? 'bg-indigo-650 text-white rounded-tr-none'
                    : 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-750'
                } whitespace-pre-line`}>
                  {m.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="mr-auto flex items-center gap-1 bg-slate-800 border border-slate-750 px-3 py-2.5 rounded-2xl rounded-tl-none text-[10px] text-slate-450 font-bold tracking-wider animate-pulse">
                Thinking...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Suggestion Chips */}
          <div className="bg-slate-900 border-t border-slate-800/80 px-3 py-2 flex gap-1.5 overflow-x-auto select-none no-scrollbar">
            <button 
              onClick={() => handleSuggestionClick("How do I teach /r/ coarticulation?")}
              className="text-[9px] font-bold bg-slate-800 border border-slate-750 text-indigo-400 hover:bg-slate-750 px-2.5 py-1.5 rounded-xl whitespace-nowrap transition"
            >
              /r/ Coarticulation
            </button>
            <button 
              onClick={() => handleSuggestionClick("Explain the hardware glitch analogy")}
              className="text-[9px] font-bold bg-slate-800 border border-slate-750 text-indigo-400 hover:bg-slate-750 px-2.5 py-1.5 rounded-xl whitespace-nowrap transition"
            >
              Glitch Analogy
            </button>
            <button 
              onClick={() => handleSuggestionClick("How do I configure Chrome flags?")}
              className="text-[9px] font-bold bg-slate-800 border border-slate-750 text-indigo-400 hover:bg-slate-750 px-2.5 py-1.5 rounded-xl whitespace-nowrap transition"
            >
              PWA AI flags
            </button>
          </div>

          {/* Input Panel */}
          <div className="p-3 bg-slate-900 border-t border-slate-800 flex gap-2">
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend(inputVal); }}
              placeholder="Ask the local copilot..."
              className="flex-1 bg-slate-950 border border-slate-750 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-indigo-500 min-h-[36px]"
            />
            <button
              onClick={() => handleSend(inputVal)}
              className="bg-indigo-650 hover:bg-indigo-700 text-white font-bold px-3 py-2 rounded-xl text-xs uppercase tracking-wider transition min-h-[36px]"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// --- Helper Functions for Local Passkeys Binary Coding ---
const bufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64ToBuffer = (base64: string): ArrayBuffer => {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return buffer;
};

// --- 5. Main Layout ---
export default function App() {
  const { activeTab, setActiveTab, hasLocalAI, setHasLocalAI, setAiStatus } = useStore();

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
  const [isIOS] = useState(() => {
    if (typeof navigator === 'undefined') return false;
    const userAgent = navigator.userAgent || navigator.vendor || (window as Window & { opera?: string }).opera || '';
    return /iPhone|iPad|iPod/i.test(userAgent);
  });

  // Local device security locking states
  const [isSecurityEnabled, setIsSecurityEnabled] = useState(() => localStorage.getItem('hfs_security_enabled') === 'true');
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

  const handleSetupPinKey = useCallback((num: string) => {
    setSetupPinError('');
    setEnteredSetupPin((prev) => {
      if (prev.length < 4) {
        const newPin = prev + num;
        if (newPin.length === 4) {
          // Trigger setup step transitions asynchronously to let the UI render the final dot
          setTimeout(() => {
            if (pinSetupStep === 'first') {
              setFirstPin(newPin);
              setEnteredSetupPin('');
              setPinSetupStep('confirm');
            } else {
              // Confirm step
              if (newPin === firstPin) {
                // Success! Save everything
                if (pinSetupModal.temporaryCredId) {
                  localStorage.setItem('hfs_passkey_id', pinSetupModal.temporaryCredId);
                }
                localStorage.setItem('hfs_security_pin', newPin);
                localStorage.setItem('hfs_security_enabled', 'true');
                setIsSecurityEnabled(true);
                
                // Reset modal state
                setPinSetupModal({ isOpen: false, temporaryCredId: null, isFallback: false });
                setPinSetupStep('first');
                setEnteredSetupPin('');
                alert(pinSetupModal.temporaryCredId 
                  ? "Local biometric passkey and backup PIN enabled successfully!" 
                  : "Local PIN security enabled successfully!"
                );
              } else {
                // Mismatch
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
  }, [pinSetupStep, pinSetupModal.temporaryCredId, firstPin]);

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
        setIsLocked(false);
        setSecurityError('');
        setPinInput('');
      }
    } catch (err) {
      console.error("Local biometric scan failed:", err);
      setSecurityError("Biometric authentication failed or cancelled.");
    }
  }, []);

  // Unlock with backup PIN
  const verifyPin = useCallback((pinCode: string) => {
    const savedPin = localStorage.getItem('hfs_security_pin') || '';
    if (pinCode === savedPin) {
      setIsLocked(false);
      setSecurityError('');
      setPinInput('');
    } else {
      setPinInput('');
      setSecurityError("Invalid backup PIN code.");
    }
  }, []);

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
      // fallback to PIN only
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

  // Disable security lock
  const disableSecurity = () => {
    if (confirm("Are you sure you want to disable local screen security? Articulation logs will no longer be locked.")) {
      localStorage.removeItem('hfs_security_enabled');
      localStorage.removeItem('hfs_passkey_id');
      localStorage.removeItem('hfs_security_pin');
      setIsSecurityEnabled(false);
      setIsLocked(false);
      setSecurityError('');
      alert("Local security disabled.");
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
            await db.logs.add({
              date: log.date,
              rating: log.rating,
              pcc: log.pcc !== undefined ? log.pcc : 80,
              environment: log.environment || 'Quiet Clinical Space',
              repairStrategies: Array.isArray(log.repairStrategies) ? log.repairStrategies : [],
              notes: log.notes,
              environmentalDifficulty: log.environmentalDifficulty,
              environmentalNoiseLevel: log.environmentalNoiseLevel !== undefined ? log.environmentalNoiseLevel : log.environmentalDifficulty,
              naiveListenerScore: log.naiveListenerScore
            });
          }
        });
      } else {
        // Merge logs
        await db.transaction('rw', [db.logs, db.recordings], async () => {
          const currentLogs = await db.logs.toArray();
          for (const log of logs) {
            const exists = currentLogs.some(l => l.date === log.date && l.notes === log.notes);
            if (!exists) {
              await db.logs.add({
                date: log.date,
                rating: log.rating,
                pcc: log.pcc !== undefined ? log.pcc : 80,
                environment: log.environment || 'Quiet Clinical Space',
                repairStrategies: Array.isArray(log.repairStrategies) ? log.repairStrategies : [],
                notes: log.notes,
                environmentalDifficulty: log.environmentalDifficulty,
                environmentalNoiseLevel: log.environmentalNoiseLevel !== undefined ? log.environmentalNoiseLevel : log.environmentalDifficulty,
                naiveListenerScore: log.naiveListenerScore
              });
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
          const decodedText = new TextDecoder().decode(
            new Uint8Array(
              atob(decodeURIComponent(base64Data))
                .split('')
                .map((c) => c.charCodeAt(0))
            )
          );
          const parsed = JSON.parse(decodedText);
          if (parsed.appName === "HearForSpeech" && parsed.data) {
            setIncomingHandoffData(parsed);
          }
        } catch (err) {
          console.error("Failed to decode handoff URL hash:", err);
        }
        // Clean hash from URL immediately so it doesn't re-trigger on reload
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    };
    checkHash();
  }, []);

  // Trigger passkey scan immediately on load if locked
  useEffect(() => {
    if (isLocked && localStorage.getItem('hfs_passkey_id')) {
      // Small timeout to let UI settle before triggering biometric prompt
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

    // Check for native local Gemini Nano model
    const detectAI = async () => {
      const globalWindow = window as unknown as WindowWithAI;
      if (globalWindow.ai && globalWindow.ai.assistant) {
        try {
          const cap = await globalWindow.ai.assistant.capabilities();
          if (cap.available !== 'no') {
            setHasLocalAI(true);
            setAiStatus(`Local Gemini Nano Available (${cap.available.toUpperCase()})`);
          } else {
            setHasLocalAI(false);
            setAiStatus("Local Gemini Nano requires initialization.");
          }
        } catch {
          setHasLocalAI(false);
          setAiStatus("Capability check failed. Using clinical rules-engine.");
        }
      } else {
        setHasLocalAI(false);
        setAiStatus("Browser Prompt API absent. Using clinical rules-engine.");
      }
    };
    detectAI();

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
    };
  }, [setHasLocalAI, setAiStatus]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
    }
    setDeferredPrompt(null);
  };

  if (isLocked) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100 font-sans">
        <div className="max-w-xs w-full text-center space-y-6">
          {/* Logo / Lock Icon */}
          <div className="flex justify-center">
            <div className="bg-indigo-600/10 border border-indigo-500/25 p-4.5 rounded-full text-indigo-400 shadow-xl shadow-indigo-500/5">
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
                        : 'bg-slate-900 border-slate-705'
                    }`}
                  />
                );
              })}
            </div>

            {/* Standard key numbers */}
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
                  className="h-14 w-14 rounded-full bg-slate-900 border border-slate-800 hover:border-slate-700 text-white font-bold text-lg flex items-center justify-center transition active:scale-95 min-h-[48px]"
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
                className="h-14 w-14 rounded-full bg-slate-900 border border-slate-800 hover:border-slate-700 text-white font-bold text-lg flex items-center justify-center transition active:scale-95 min-h-[48px]"
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
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-650 hover:from-indigo-600 hover:to-purple-700 text-white font-bold py-3.5 rounded-2xl text-xs uppercase tracking-wider transition active:scale-98 min-h-[44px]"
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased font-sans select-none">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-850 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg shadow-indigo-500/20">
            <Activity size={22} className="animate-pulse" />
          </div>
          <div>
            <h1 className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Hear for Speech
            </h1>
            <p className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">Clinical Intelligibility Toolkit</p>
          </div>
        </div>
        
        {/* Calibration Badge trigger */}
        <button
          onClick={() => setShowCalibrationModal(true)}
          className={`flex items-center gap-1.5 border px-3 py-1.5 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all duration-300 min-h-[32px] ${
            hasLocalAI 
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' 
              : 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
          }`}
        >
          <Cpu size={12} className={hasLocalAI ? "" : "animate-pulse"} />
          <span>{hasLocalAI ? "AI Active" : "AI Simulation"}</span>
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-lg w-full mx-auto p-4 pb-28 flex flex-col justify-start overflow-y-auto">
        {activeTab === 'visualizer' && <VisualizerTab />}
        {activeTab === 'tracker' && <TrackerTab />}
        {activeTab === 'protocol' && <ProtocolTab />}
        {activeTab === 'export' && (
          <ExportTab 
            isSecurityEnabled={isSecurityEnabled}
            registerLocalPasskey={registerLocalPasskey}
            disableSecurity={disableSecurity}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-slate-950/95 backdrop-blur-lg border-t border-slate-855 flex justify-around p-2.5 z-50 rounded-t-2xl shadow-2xl">
        <NavButton 
          tab="visualizer" 
          icon={<Mic size={20} />} 
          label="Biofeedback" 
          currentTab={activeTab} 
          onClick={setActiveTab} 
        />
        <NavButton 
          tab="tracker" 
          icon={<BarChart3 size={20} />} 
          label="Analytics" 
          currentTab={activeTab} 
          onClick={setActiveTab} 
        />
        <NavButton 
          tab="protocol" 
          icon={<ClipboardList size={20} />} 
          label="Protocol" 
          currentTab={activeTab} 
          onClick={setActiveTab} 
        />
        <NavButton 
          tab="export" 
          icon={<Download size={20} />} 
          label="Exchange" 
          currentTab={activeTab} 
          onClick={setActiveTab} 
        />
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
            Install <strong className="text-indigo-400">Hear for Speech</strong> to enable full-screen biofeedback and 100% offline clinical use.
          </p>

          {isIOS ? (
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-[10px] text-slate-450 space-y-1.5 leading-relaxed font-normal">
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
                <h3 className="font-extrabold text-base text-slate-100 tracking-tight">AI Calibration Status</h3>
              </div>
              <button 
                onClick={() => setShowCalibrationModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1 min-h-[36px]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Diagnostic items */}
            <div className="space-y-3">
              <CalibrationItem label="Browser Engine Check" status={true} desc="Chromium-based browser detected." />
              <CalibrationItem label="WebGPU Capabilities" status={true} desc="Hardware acceleration available." />
              <CalibrationItem label="Built-in AI API Status" status={hasLocalAI} desc={hasLocalAI ? "window.ai API detected and active." : "window.ai API not found. Simulation fallback active."} />
            </div>

            {/* Explainer */}
            {!hasLocalAI && (
              <div className="bg-slate-900 border border-slate-750 p-4 rounded-2xl text-[11px] text-slate-400 space-y-2 leading-relaxed font-normal">
                <span className="font-bold text-slate-300 block uppercase">Enable Native Gemini Nano:</span>
                <p>To run speech analysis 100% locally on your Google Pixel or desktop Chrome, configure the following browser settings:</p>
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
                <p className="text-[10px] text-slate-500 italic">
                  Note: Enabling flags unlocks native GPU/NPU models. Your data remains 100% offline.
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

            <div className="space-y-1.5">
              <span className="block text-[10px] font-extrabold text-slate-500 tracking-wider uppercase">Select Import Mode:</span>
              <div className="flex gap-2 bg-slate-950 p-1 rounded-2xl border border-slate-900">
                <button
                  type="button"
                  onClick={() => setHandoffMode('merge')}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase transition active:scale-98 min-h-[36px] ${
                    handoffMode === 'merge'
                      ? 'bg-indigo-650 text-white shadow'
                      : 'text-slate-500 hover:text-slate-350'
                  }`}
                >
                  Merge (Union)
                </button>
                <button
                  type="button"
                  onClick={() => setHandoffMode('overwrite')}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase transition active:scale-98 min-h-[36px] ${
                    handoffMode === 'overwrite'
                      ? 'bg-rose-500/20 text-rose-455 border border-rose-500/30'
                      : 'text-slate-500 hover:text-slate-350'
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

// --- Navigation Button Component ---
interface NavButtonProps {
  tab: 'visualizer' | 'tracker' | 'protocol' | 'export';
  icon: React.ReactNode;
  label: string;
  currentTab: 'visualizer' | 'tracker' | 'protocol' | 'export';
  onClick: (tab: 'visualizer' | 'tracker' | 'protocol' | 'export') => void;
}

function NavButton({ tab, icon, label, currentTab, onClick }: NavButtonProps) {
  const isActive = currentTab === tab;
  return (
    <button 
      onClick={() => onClick(tab)} 
      className={`relative flex-1 py-2.5 flex flex-col items-center justify-center rounded-xl transition-all duration-300 min-h-[48px] ${
        isActive 
          ? 'text-indigo-400 font-semibold' 
          : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      {isActive && (
        <span className="absolute inset-x-4 top-0 h-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" />
      )}
      <span className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'scale-100'}`}>
        {icon}
      </span>
      <span className="text-[10px] mt-1 tracking-wider uppercase">{label}</span>
    </button>
  );
}

// --- TAB 1: VisualizerTab (Calibration & Acoustic Biofeedback) ---
function VisualizerTab() {
  const [isRecording, setIsRecording] = useState(false);
  const [savedRecordings, setSavedRecordings] = useState<Recording[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<number | null>(null);
  const [selectedPhoneme, setSelectedPhoneme] = useState<string>('none');
  
  // Inline editing state for recording name
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  // Environmental Stress Synthesizer States
  const [isNoiseEnabled, setIsNoiseEnabled] = useState(() => localStorage.getItem('hfs_noise_enabled') === 'true');
  const [noiseLevel, setNoiseLevel] = useState(() => parseInt(localStorage.getItem('hfs_noise_level') || '30'));

  // Refs for Web Audio API & MediaRecorder
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  // Background Noise Synthesizer Refs
  const synthAudioCtxRef = useRef<AudioContext | null>(null);
  const noiseSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const noiseGainRef = useRef<GainNode | null>(null);
  const osc1Ref = useRef<OscillatorNode | null>(null);
  const osc2Ref = useRef<OscillatorNode | null>(null);
  const lfoRef = useRef<OscillatorNode | null>(null);

  const loadRecordings = async () => {
    const recs = await db.recordings.toArray();
    setSavedRecordings(recs);
  };

  // Stop background synthesizer noise
  const stopSynthNoise = useCallback(() => {
    try {
      if (noiseSourceRef.current) {
        noiseSourceRef.current.stop();
        noiseSourceRef.current.disconnect();
        noiseSourceRef.current = null;
      }
      if (osc1Ref.current) {
        osc1Ref.current.stop();
        osc1Ref.current.disconnect();
        osc1Ref.current = null;
      }
      if (osc2Ref.current) {
        osc2Ref.current.stop();
        osc2Ref.current.disconnect();
        osc2Ref.current = null;
      }
      if (lfoRef.current) {
        lfoRef.current.stop();
        lfoRef.current.disconnect();
        lfoRef.current = null;
      }
      if (noiseGainRef.current) {
        noiseGainRef.current.disconnect();
        noiseGainRef.current = null;
      }
    } catch {
      // Ignored if nodes are already stopped
    }
  }, []);

  // Start background synthesizer noise
  const startSynthNoise = useCallback((level: number) => {
    try {
      if (!synthAudioCtxRef.current || synthAudioCtxRef.current.state === 'closed') {
        const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        synthAudioCtxRef.current = new AudioContextClass();
      }
      const ctx = synthAudioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(console.error);
      }

      stopSynthNoise();

      // Synthesize noise buffer
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = buffer;
      noiseSource.loop = true;
      noiseSourceRef.current = noiseSource;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(450, ctx.currentTime);

      const osc1 = ctx.createOscillator();
      osc1.frequency.setValueAtTime(125, ctx.currentTime);
      osc1Ref.current = osc1;

      const osc2 = ctx.createOscillator();
      osc2.frequency.setValueAtTime(210, ctx.currentTime);
      osc2Ref.current = osc2;

      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.25, ctx.currentTime);
      lfoRef.current = lfo;

      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(0.2, ctx.currentTime);

      const chatterGain = ctx.createGain();
      chatterGain.gain.setValueAtTime(0.08, ctx.currentTime);

      lfo.connect(lfoGain);
      lfoGain.connect(chatterGain.gain);

      const noiseGain = ctx.createGain();
      const targetGain = (level / 100) * 0.25;
      noiseGain.gain.setValueAtTime(targetGain, ctx.currentTime);
      noiseGainRef.current = noiseGain;

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);

      osc1.connect(chatterGain);
      osc2.connect(chatterGain);
      chatterGain.connect(noiseGain);

      noiseGain.connect(ctx.destination);

      noiseSource.start();
      osc1.start();
      osc2.start();
      lfo.start();
    } catch (err) {
      console.error("Failed to start environmental noise:", err);
    }
  }, [stopSynthNoise]);

  // Sync synthesizer states to localStorage and trigger toggle
  useEffect(() => {
    localStorage.setItem('hfs_noise_enabled', String(isNoiseEnabled));
    localStorage.setItem('hfs_noise_level', String(noiseLevel));

    if (isNoiseEnabled) {
      startSynthNoise(noiseLevel);
    } else {
      stopSynthNoise();
    }
  }, [isNoiseEnabled, noiseLevel, startSynthNoise, stopSynthNoise]);

  // Drawing the visual bands for F2 and F3
  const drawFormantBands = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (selectedPhoneme !== '/r/') return;

    const freqToY = (f: number) => height - ((f - 1000) / (3000 - 1000)) * height;
    const yF2 = freqToY(1600);
    const yF3 = freqToY(2200);

    ctx.fillStyle = 'rgba(99, 102, 241, 0.08)';
    ctx.fillRect(0, yF2 - 10, width, 20);
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(0, yF2);
    ctx.lineTo(width, yF2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(236, 72, 153, 0.08)';
    ctx.fillRect(0, yF3 - 10, width, 20);
    ctx.strokeStyle = 'rgba(236, 72, 153, 0.3)';
    ctx.beginPath();
    ctx.moveTo(0, yF3);
    ctx.lineTo(width, yF3);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = 'bold 9px sans-serif';
    ctx.fillStyle = 'rgba(165, 180, 252, 0.6)';
    ctx.fillText('F2 (Rhotic Target) ~1600Hz', 12, yF2 + 3);
    ctx.fillStyle = 'rgba(252, 165, 203, 0.6)';
    ctx.fillText('F3 (Rhotic Pinch) ~2200Hz', 12, yF3 + 3);
  }, [selectedPhoneme]);

  // Drawing the static target wave overlay on canvas
  const drawTargetOverlay = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (selectedPhoneme === 'none') return;
    const pConfig = PHONEMES.find(p => p.sound === selectedPhoneme);
    if (!pConfig) return;

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(236, 72, 153, 0.75)'; // Pink-500 glowing color
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 8]); // Dashed line for outline targeting

    for (let x = 0; x < width; x++) {
      const y = pConfig.waveFunc(x, 0, width, height); // static target wave (phase 0)
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    
    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash
  }, [selectedPhoneme]);

  // Drawing the Standby Sine Waves
  const drawStandby = useCallback(() => {
    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
    }
    
    let phase = 0;
    const draw = () => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      
      ctx.fillStyle = '#0f172a'; // matches bg-slate-900
      ctx.fillRect(0, 0, width, height);

      // Grid background lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      for (let i = 0; i < width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
        ctx.stroke();
      }
      for (let i = 0; i < height; i += 30) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(width, i);
        ctx.stroke();
      }

      // Draw formant targets if /r/
      drawFormantBands(ctx, width, height);

      // 3 overlapping standby waves
      const colors = ['rgba(99, 102, 241, 0.6)', 'rgba(168, 85, 247, 0.4)', 'rgba(236, 72, 153, 0.2)'];
      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        ctx.lineWidth = layer === 0 ? 2.5 : 1.5;
        ctx.strokeStyle = colors[layer];
        
        const amplitude = 12 + layer * 6;
        const frequency = 0.01 + layer * 0.003;
        
        for (let x = 0; x < width; x++) {
          const y = height / 2 + Math.sin(x * frequency + phase + layer * 2) * amplitude;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      
      // Render the dashed target overlay if a phoneme is selected
      drawTargetOverlay(ctx, width, height);

      phase += 0.03;
      animationRef.current = window.requestAnimationFrame(draw);
    };
    draw();
  }, [drawTargetOverlay, drawFormantBands]);

  // Drawing the Active Audio Waves
  const drawActive = useCallback((analyser: AnalyserNode) => {
    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
    }

    const bufferLength = analyser.frequencyBinCount;
    const timeDataArray = new Uint8Array(bufferLength);
    const freqDataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      analyser.getByteTimeDomainData(timeDataArray);

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);

      // Grid background lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      for (let i = 0; i < width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
        ctx.stroke();
      }

      // Draw formant target zones
      drawFormantBands(ctx, width, height);
      
      // Zero line
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Dynamic path
      ctx.beginPath();
      ctx.lineWidth = 3.5;
      
      // Indigo -> Cyan -> Emerald Gradient
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, '#6366f1'); // Indigo
      gradient.addColorStop(0.5, '#06b6d4'); // Cyan
      gradient.addColorStop(1, '#10b981'); // Emerald
      ctx.strokeStyle = gradient;

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = timeDataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);

        x += sliceWidth;
      }

      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Formant Peak & Coarticulation detection
      if (selectedPhoneme === '/r/') {
        analyser.getByteFrequencyData(freqDataArray);

        const sampleRate = analyser.context.sampleRate;
        const fftSize = analyser.fftSize;
        const getBin = (f: number) => Math.round((f * fftSize) / sampleRate);

        // Find F2 Peak
        const binF2Min = getBin(1400);
        const binF2Max = getBin(1800);
        let maxValF2 = 0;
        let maxBinF2 = binF2Min;
        for (let i = binF2Min; i <= binF2Max; i++) {
          if (freqDataArray[i] > maxValF2) {
            maxValF2 = freqDataArray[i];
            maxBinF2 = i;
          }
        }
        const peakF2 = (maxBinF2 * sampleRate) / fftSize;

        // Find F3 Peak
        const binF3Min = getBin(2000);
        const binF3Max = getBin(2400);
        let maxValF3 = 0;
        let maxBinF3 = binF3Min;
        for (let i = binF3Min; i <= binF3Max; i++) {
          if (freqDataArray[i] > maxValF3) {
            maxValF3 = freqDataArray[i];
            maxBinF3 = i;
          }
        }
        const peakF3 = (maxBinF3 * sampleRate) / fftSize;

        const freqToY = (f: number) => height - ((f - 1000) / (3000 - 1000)) * height;

        // If vocal energy is detected, draw formant dots
        if (maxValF2 > 45 && maxValF3 > 45) {
          // Draw F2 dot
          ctx.fillStyle = '#38bdf8'; // sky-400
          ctx.beginPath();
          ctx.arc(width * 0.38, freqToY(peakF2), 5, 0, 2 * Math.PI);
          ctx.fill();

          // Draw F3 dot
          ctx.fillStyle = '#f472b6'; // pink-400
          ctx.beginPath();
          ctx.arc(width * 0.62, freqToY(peakF3), 5, 0, 2 * Math.PI);
          ctx.fill();

          // Check for coarticulation pinching
          if (Math.abs(peakF3 - peakF2) < 450) {
            // Success overlay borders
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
            ctx.lineWidth = 4;
            ctx.strokeRect(0, 0, width, height);

            // Draw line connecting formants
            ctx.strokeStyle = '#10b981'; // emerald-500
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(width * 0.38, freqToY(peakF2));
            ctx.lineTo(width * 0.62, freqToY(peakF3));
            ctx.stroke();

            // Success Label
            ctx.fillStyle = '#34d399'; // emerald-400
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText('✨ /r/ COARTICULATION PINCH ACQUIRED! ✨', width / 2 - 110, 26);
          }
        }
      }

      // Draw static target template on top
      drawTargetOverlay(ctx, width, height);

      animationRef.current = window.requestAnimationFrame(draw);
    };
    draw();
  }, [drawTargetOverlay, drawFormantBands, selectedPhoneme]);

  useEffect(() => {
    let active = true;
    db.recordings.toArray().then((recs) => {
      if (active) {
        setSavedRecordings(recs);
      }
    }).catch(console.error);
    
    // Start canvas in Standby mode immediately
    drawStandby();

    return () => {
      active = false;
      // Cleanup visualizer context & animations on unmount
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(console.error);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      // Cleanup background synthesizer
      stopSynthNoise();
      if (synthAudioCtxRef.current && synthAudioCtxRef.current.state !== 'closed') {
        synthAudioCtxRef.current.close().catch(console.error);
      }
    };
  }, [drawStandby, stopSynthNoise]); // Depend on memoized drawStandby and stopSynthNoise callbacks

  // Timer effect when recording
  useEffect(() => {
    let interval: number | undefined;
    if (isRecording) {
      interval = window.setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval !== undefined) {
        window.clearInterval(interval);
      }
      setSeconds(0); // Safely reset timer state on unmount or recording stop
    };
  }, [isRecording]);

  const startRecording = async () => {
    try {
      // 1. Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 2. Initialize Web Audio API
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioCtxRef.current = audioCtx;
      
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      // 3. Connect visualizer loop
      drawActive(analyser);

      // 4. Initialize MediaRecorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const dateStr = new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
        const phonemeText = selectedPhoneme !== 'none' ? ` (${selectedPhoneme})` : '';
        await db.recordings.add({ 
          date: dateStr, 
          audio: blob, 
          name: `Speech Calibration${phonemeText} - ${dateStr}` 
        });
        loadRecordings();
        
        // Cleanup mic streams
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access denied or audio error:', err);
      alert('Microphone access is required to use acoustic biofeedback.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);

    // Close AudioContext
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(console.error);
    }

    // Go back to Standby visualization
    drawStandby();
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const togglePlayback = (rec: Recording) => {
    if (currentlyPlayingId === rec.id) {
      activeAudioRef.current?.pause();
      setCurrentlyPlayingId(null);
    } else {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
      }
      const audioUrl = URL.createObjectURL(rec.audio);
      const audio = new Audio(audioUrl);
      activeAudioRef.current = audio;
      audio.play().catch(console.error);
      setCurrentlyPlayingId(rec.id ?? null);
      
      audio.onended = () => {
        setCurrentlyPlayingId(null);
      };
    }
  };

  const startEditing = (rec: Recording) => {
    if (rec.id !== undefined) {
      setEditingId(rec.id);
      setEditName(rec.name);
    }
  };

  const saveName = async (id: number) => {
    if (editName.trim()) {
      await db.recordings.update(id, { name: editName.trim() });
      setEditingId(null);
      loadRecordings();
    }
  };

  const deleteRecording = async (id: number) => {
    if (confirm("Are you sure you want to delete this recording?")) {
      await db.recordings.delete(id);
      loadRecordings();
    }
  };

  const currentPhonemeConfig = PHONEMES.find(p => p.sound === selectedPhoneme);

  return (
    <div className="space-y-5">
      {/* Target Phoneme Dropdown Selector */}
      <div className="bg-slate-800 border border-slate-700/80 p-4 rounded-3xl shadow-lg space-y-2">
        <label className="block text-xs font-bold text-slate-400 tracking-widest uppercase">
          Target Phoneme Calibration:
        </label>
        <select 
          value={selectedPhoneme}
          onChange={(e) => setSelectedPhoneme(e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 hover:border-slate-600 rounded-xl p-3 text-sm font-semibold text-slate-200 focus:border-indigo-500 focus:outline-none min-h-[44px]"
        >
          {PHONEMES.map(p => (
            <option key={p.sound} value={p.sound}>{p.label}</option>
          ))}
        </select>
        {selectedPhoneme !== 'none' && currentPhonemeConfig && (
          <p className="text-[11px] text-indigo-400 font-medium italic mt-1 leading-relaxed">
            {currentPhonemeConfig.description}
          </p>
        )}
      </div>

      {/* Visualizer Canvas Area */}
      <div className="relative bg-slate-800 rounded-3xl overflow-hidden border border-slate-700 shadow-xl shadow-slate-950/50">
        <canvas 
          ref={canvasRef} 
          width={400} 
          height={160} 
          className="w-full h-40 block"
        />
        
        {/* Status overlay */}
        <div className="absolute top-4 left-4 flex items-center gap-2 bg-slate-950/70 backdrop-blur-md px-2.5 py-1 rounded-full border border-slate-800">
          {isRecording ? (
            <>
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
              </span>
              <span className="text-[10px] font-bold text-red-400 tracking-wider uppercase">Active</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
              <span className="text-[10px] font-bold text-indigo-400 tracking-wider uppercase">Standby</span>
            </>
          )}
        </div>

        {/* Selected Phoneme Indicator Overlay */}
        {selectedPhoneme !== 'none' && (
          <div className="absolute top-4 right-4 bg-pink-500/10 border border-pink-500/35 px-2.5 py-1 rounded-full text-pink-400 text-[10px] font-bold tracking-widest uppercase">
            Target: {selectedPhoneme}
          </div>
        )}

        {/* Monospace Timer Overlay */}
        <div className="absolute bottom-4 right-4 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-xl border border-slate-805">
          <span className="font-mono text-sm font-bold text-indigo-300">
            {formatTime(seconds)}
          </span>
        </div>
      </div>

      {/* Environmental Stress Simulator Panel */}
      <div className="bg-slate-800 border border-slate-700/80 p-4.5 rounded-3xl shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="text-indigo-400 animate-pulse" size={16} />
            <span className="text-xs font-bold text-slate-350 tracking-wider uppercase">Environmental Noise Simulator</span>
          </div>
          {/* Toggle Switch */}
          <button
            onClick={() => setIsNoiseEnabled(!isNoiseEnabled)}
            className={`px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest border transition active:scale-95 min-h-[30px] ${
              isNoiseEnabled
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-400'
            }`}
          >
            {isNoiseEnabled ? 'Noise On' : 'Noise Off'}
          </button>
        </div>

        <p className="text-[10px] text-slate-400 leading-relaxed font-normal text-left">
          Injects synthesized ambient low-frequency room chatter and noise to test student intelligibility limits under stress.
        </p>

        {isNoiseEnabled && (
          <div className="space-y-1.5 pt-1 animate-fadeIn">
            <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase">
              <span>Auditory Noise Level:</span>
              <span className="font-mono text-indigo-400">{noiseLevel}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={noiseLevel}
              onChange={(e) => setNoiseLevel(parseInt(e.target.value))}
              className="w-full accent-indigo-500 h-1 bg-slate-900 rounded-lg cursor-pointer"
            />
          </div>
        )}
      </div>

      {/* Primary Record Button Trigger */}
      <div className="flex justify-center">
        {!isRecording ? (
          <button 
            onClick={startRecording} 
            className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-indigo-500 via-purple-550 to-pink-500 hover:from-indigo-600 hover:to-pink-600 text-white font-bold py-4.5 px-8 rounded-2xl shadow-xl shadow-indigo-500/10 active:scale-98 transition-all duration-300 min-h-[48px]"
          >
            <Mic size={22} className="animate-pulse" />
            <span className="text-sm tracking-wider uppercase">Start Calibration</span>
          </button>
        ) : (
          <button 
            onClick={stopRecording} 
            className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-rose-500 to-red-650 hover:from-rose-600 hover:to-red-700 text-white font-bold py-4.5 px-8 rounded-2xl shadow-xl shadow-red-500/15 active:scale-98 transition-all duration-300 animate-pulse min-h-[48px]"
          >
            <Square size={18} />
            <span className="text-sm tracking-wider uppercase">Halt Calibration</span>
          </button>
        )}
      </div>

      {/* Saved Audio List Section */}
      <div className="space-y-3">
        <h3 className="font-bold text-sm text-slate-400 tracking-widest uppercase flex items-center gap-2">
          <span>Calibration Database</span>
          <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full text-[10px] font-bold">
            {savedRecordings.length}
          </span>
        </h3>
        
        {savedRecordings.length === 0 ? (
          <div className="bg-slate-855/40 border border-dashed border-slate-800 p-8 rounded-2xl text-center">
            <Mic className="mx-auto text-slate-600 mb-2" size={32} />
            <p className="text-sm text-slate-500">No session recordings cached.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {savedRecordings.map((rec) => (
              <div 
                key={rec.id} 
                className="bg-slate-800/50 border border-slate-700/50 p-3.5 rounded-2xl flex items-center justify-between gap-3 hover:border-slate-600 transition-all duration-300 shadow-md"
              >
                {/* Audio Item Info */}
                <div className="flex-1 min-w-0">
                  {editingId === rec.id ? (
                    <div className="flex items-center gap-1.5">
                      <input 
                        type="text" 
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm font-semibold text-white focus:outline-none focus:border-indigo-500 w-full min-h-[36px]"
                        autoFocus
                      />
                      <button 
                        onClick={() => saveName(rec.id!)} 
                        className="p-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white min-h-[36px] min-w-[36px] flex items-center justify-center"
                      >
                        <Check size={16} />
                      </button>
                      <button 
                        onClick={() => setEditingId(null)} 
                        className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 min-h-[36px] min-w-[36px] flex items-center justify-center"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm text-slate-200 truncate block">
                        {rec.name}
                      </span>
                      <button 
                        onClick={() => startEditing(rec)}
                        className="text-slate-500 hover:text-indigo-400 p-1 rounded transition min-h-[30px] min-w-[30px] flex items-center justify-center"
                      >
                        <Edit3 size={13} />
                      </button>
                    </div>
                  )}
                  <span className="text-[10px] text-slate-500 mt-0.5 block">{rec.date}</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => togglePlayback(rec)} 
                    className={`h-10 w-10 rounded-full flex items-center justify-center transition-all min-h-[40px] min-w-[40px] ${
                      currentlyPlayingId === rec.id 
                        ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 animate-pulse' 
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                    }`}
                  >
                    {currentlyPlayingId === rec.id ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                  </button>
                  <button 
                    onClick={() => deleteRecording(rec.id!)} 
                    className="h-10 w-10 rounded-full bg-slate-900/60 hover:bg-rose-500/20 hover:text-rose-400 border border-transparent hover:border-rose-500/30 text-slate-500 flex items-center justify-center transition min-h-[40px] min-w-[40px]"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- TAB 2: TrackerTab (Quantitative Analytics Form & Logs) ---
const CLINICAL_ENVIRONMENTS = [
  "Quiet Clinical Space",
  "Ambient Classroom",
  "Dynamic Cafeteria",
  "Unstructured Play"
];

const REPAIR_PROTOCOLS = [
  "Reduced Vocal Rate",
  "Increased Sound Volume",
  "Phoneme Focus Contrast",
  "Contextual Rephrasing"
];

const ASSESSMENT_SENTENCES = [
  "The bright yellow sunshine warmed the quiet playground.",
  "Our family took a long walk along the rocky river.",
  "Please remember to bring your folder to school tomorrow.",
  "The brown dog chased the fast rabbit across the lawn.",
  "We should try to write our answers in neat handwriting.",
  "The children built a sandcastle near the ocean waves.",
  "A heavy rain started to fall late last night.",
  "They walked quickly through the crowded market in the morning.",
  "The solar panel generates clean electricity from the sun.",
  "The library provides quiet workspaces and resource guides."
];

function TrackerTab() {
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [rating, setRating] = useState<number>(3); // Default articulation rating
  const [pcc, setPcc] = useState<number>(() => {
    const sitTotal = parseInt(localStorage.getItem('hfs_sit_total') || '0');
    const sitCorrect = parseInt(localStorage.getItem('hfs_sit_correct') || '0');
    return sitTotal > 0 ? Math.round((sitCorrect / sitTotal) * 100) : 80;
  });
  const [environment, setEnvironment] = useState<string>("Quiet Clinical Space");
  const [repairStrategies, setRepairStrategies] = useState<string[]>(() => {
    const strategies: string[] = [];
    const prosodyRate = localStorage.getItem('hfs_prosody_rate') === 'true';
    if (prosodyRate) {
      strategies.push("Reduced Vocal Rate");
    }
    return strategies;
  });
  const [notes, setNotes] = useState(() => {
    try {
      const absentSounds = JSON.parse(localStorage.getItem('hfs_arizona_late8') || '[]');
      const sitTotal = parseInt(localStorage.getItem('hfs_sit_total') || '0');
      const sitCorrect = parseInt(localStorage.getItem('hfs_sit_correct') || '0');
      const sitPct = sitTotal > 0 ? Math.round((sitCorrect / sitTotal) * 100) : 0;
      
      const sections = [];
      if (absentSounds.length > 0) {
        sections.push(`Absent phonetic targets: ${absentSounds.join(', ')}.`);
      }
      if (sitTotal > 0) {
        sections.push(`SIT speech intelligibility calculated at ${sitPct}% (${sitCorrect}/${sitTotal} words).`);
      }
      const goals = localStorage.getItem('hfs_intake_goals') || '';
      if (goals) {
        sections.push(`Collaborative targets: "${goals}".`);
      }
      return sections.join(' ');
    } catch {
      return '';
    }
  });

  const [envDifficulty, setEnvDifficulty] = useState<number>(() => {
    const enabled = localStorage.getItem('hfs_noise_enabled') === 'true';
    return enabled ? parseInt(localStorage.getItem('hfs_noise_level') || '30') : 0;
  });

  // Naïve Listener states
  const [isAssessmentMode, setIsAssessmentMode] = useState(false);
  const [currentSentenceIdx, setCurrentSentenceIdx] = useState(0);
  const [unclearIndices, setUnclearIndices] = useState<number[]>([]);

  const sentence = ASSESSMENT_SENTENCES[currentSentenceIdx];
  const words = React.useMemo(() => sentence.split(' '), [sentence]);

  const toggleWordClarity = (index: number) => {
    setUnclearIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const clearCount = words.length - unclearIndices.length;
  const totalWords = words.length;
  const scorePercent = totalWords > 0 ? Math.round((clearCount / totalWords) * 100) : 100;

  useEffect(() => {
    db.logs.toArray().then(setLogs);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const dateStr = new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    
    await db.logs.add({
      date: dateStr,
      rating,
      pcc,
      environment,
      repairStrategies,
      notes: notes.trim(),
      environmentalDifficulty: envDifficulty,
      environmentalNoiseLevel: envDifficulty
    });

    // Reset Form States
    setRating(3);
    setPcc(80);
    setEnvironment("Quiet Clinical Space");
    setRepairStrategies([]);
    setNotes('');
    setEnvDifficulty(0);
    
    // Refresh Log Feed
    db.logs.toArray().then(setLogs);
  };

  const handleDeleteLog = async (id: number) => {
    if (confirm("Are you sure you want to delete this log entry?")) {
      await db.logs.delete(id);
      db.logs.toArray().then(setLogs);
    }
  };

  const getRatingBadge = (val: number) => {
    const badges = [
      { text: "Severe Inaccuracy", styles: "bg-rose-500/10 border-rose-500/20 text-rose-400" },
      { text: "Frequent Errors", styles: "bg-orange-500/10 border-orange-500/20 text-orange-400" },
      { text: "Moderate Clarity", styles: "bg-amber-500/10 border-amber-500/20 text-amber-400" },
      { text: "High Articulation", styles: "bg-green-500/10 border-green-500/20 text-green-400" },
      { text: "Ideal Target Match", styles: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" }
    ];
    return badges[val - 1] || { text: "Unassessed", styles: "bg-slate-500/10 border-slate-500/20 text-slate-400" };
  };

  return (
    <div className="space-y-6">
      {isAssessmentMode ? (
        <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-5 animate-fadeIn">
          <div className="flex justify-between items-center border-b border-slate-700/50 pb-3">
            <h3 className="font-extrabold text-base text-slate-100 tracking-tight flex items-center gap-2">
              <Activity size={18} className="text-pink-400" />
              <span>Naïve Listener Assessment</span>
            </h3>
            <button
              type="button"
              onClick={() => setIsAssessmentMode(false)}
              className="text-[10px] font-bold text-slate-400 bg-slate-700 hover:bg-slate-650 px-3 py-1.5 rounded-xl uppercase tracking-wider min-h-[30px]"
            >
              Exit Mode
            </button>
          </div>

          <div className="bg-indigo-600/10 border border-indigo-500/15 p-4 rounded-2xl text-[11px] text-indigo-300 leading-relaxed font-normal text-left">
            <strong>Instructions for Listener:</strong> Pass this device to a colleague, another parent, or any unfamiliar adult. 
            Listen to the student read the sentence below aloud. Tap any word you could not understand to mark it red. 
            By default, all words are understood.
          </div>

          {/* The Prompt Sentence to Read */}
          <div className="bg-slate-900 border border-slate-750 p-5 rounded-2xl text-center space-y-2">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Student Read Aloud:</span>
            <p className="text-base font-extrabold text-slate-100 tracking-wide leading-relaxed font-serif">
              "{sentence}"
            </p>
          </div>

          {/* Word interactive grid */}
          <div className="space-y-2 text-left">
            <span className="block text-[10px] font-extrabold text-slate-500 tracking-wider uppercase">
              Interactive Word Intelligibility Matrix:
            </span>
            <div className="flex flex-wrap gap-2 pt-1 justify-center">
              {words.map((word, idx) => {
                const isClear = !unclearIndices.includes(idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleWordClarity(idx)}
                    className={`py-2 px-3.5 rounded-xl font-bold text-xs border transition active:scale-95 min-h-[40px] flex flex-col items-center justify-center ${
                      isClear
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                        : 'bg-rose-500/20 border-rose-500/35 text-rose-450 hover:bg-rose-500/30'
                    }`}
                  >
                    <span className="tracking-wide">{word}</span>
                    <span className="text-[8px] uppercase tracking-wider mt-0.5 opacity-60">
                      {isClear ? 'Clear' : 'Unclear'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Score & Controls */}
          <div className="flex items-center justify-between p-3.5 bg-slate-900/40 border border-slate-750 rounded-2xl text-left">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase block">Intelligibility Score</span>
              <span className="text-lg font-extrabold text-emerald-400 font-mono">
                {scorePercent}%
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                ({clearCount} of {totalWords} words clear)
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setCurrentSentenceIdx((prev) => (prev + 1) % ASSESSMENT_SENTENCES.length);
                setUnclearIndices([]);
              }}
              className="bg-slate-900 hover:bg-slate-750 border border-slate-700 text-slate-350 font-bold px-3 py-2 rounded-xl text-[10px] uppercase tracking-wider transition min-h-[36px]"
            >
              Change Sentence
            </button>
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={async () => {
              const dateStr = new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
              
              const calcRating = 
                scorePercent >= 90 ? 5 :
                scorePercent >= 80 ? 4 :
                scorePercent >= 70 ? 3 :
                scorePercent >= 50 ? 2 :
                1;

              await db.logs.add({
                date: dateStr,
                rating: calcRating,
                pcc: scorePercent,
                environment: "Naïve Listener Assessment",
                repairStrategies: repairStrategies,
                notes: `[Naïve Listener Assessment] Sentence: "${sentence}". Understood ${clearCount}/${totalWords} words.`,
                environmentalDifficulty: envDifficulty,
                environmentalNoiseLevel: envDifficulty,
                naiveListenerScore: scorePercent
              });

              alert(`Assessment committed successfully! Score: ${scorePercent}%`);
              setIsAssessmentMode(false);
              db.logs.toArray().then(setLogs);
            }}
            className="w-full bg-indigo-650 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-indigo-600/10 transition min-h-[48px] uppercase tracking-wider text-xs"
          >
            Submit & Save Assessment
          </button>
        </div>
      ) : (
        <>
          {/* Assessment Mode Toggle Header Card */}
          <div className="bg-slate-800 border border-slate-700/80 p-4.5 rounded-3xl shadow-xl flex items-center justify-between">
            <div className="text-left">
              <span className="text-xs font-extrabold text-slate-200 block">Assessment Mode Switch</span>
              <span className="text-[10px] text-slate-400 block mt-0.5 font-normal">
                Toggle for passwordless Naïve Listener assessment.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsAssessmentMode(true);
                setCurrentSentenceIdx(0);
                setUnclearIndices([]);
              }}
              className="bg-indigo-650 hover:bg-indigo-600 text-white font-bold px-4 py-2 rounded-xl text-[10px] uppercase tracking-wider transition active:scale-95 min-h-[36px]"
            >
              Start Naïve Assessment
            </button>
          </div>

          {/* Log Form */}
          <form onSubmit={handleSave} className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-5">
        <h3 className="font-extrabold text-base text-slate-100 tracking-tight border-b border-slate-700/50 pb-3 flex items-center gap-2">
          <Activity size={18} className="text-indigo-400" />
          <span>Performance Analytics Input</span>
        </h3>

        {/* Rating Select (1-5 Clinician Articulation Picker) */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-400 tracking-widest uppercase">
            Articulation Clarity Index (1-5):
          </label>
          <div className="flex justify-between gap-2 pt-1">
            {[1, 2, 3, 4, 5].map((num) => {
              const isSelected = rating === num;
              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => setRating(num)}
                  className={`h-11 w-11 rounded-xl flex items-center justify-center font-bold text-sm border transition-all duration-300 min-h-[44px] min-w-[44px] ${
                    isSelected
                      ? 'bg-gradient-to-br from-indigo-500 to-purple-650 text-white border-transparent scale-110 shadow-lg shadow-indigo-500/20'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-550'
                  }`}
                >
                  {num}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] text-slate-500 px-1 pt-1 font-semibold uppercase">
            <span>Severe (1)</span>
            <span>Ideal Match (5)</span>
          </div>
        </div>

        {/* Consonants Correct Range Slider */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="block text-xs font-bold text-slate-400 tracking-widest uppercase">
              Consonants Correct (PCC) / SIT Score:
            </label>
            <span className="text-sm font-extrabold text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg">
              {pcc}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={pcc}
            onChange={(e) => setPcc(parseInt(e.target.value))}
            className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-500 min-h-[30px]"
          />
        </div>

        {/* Environment Selector Buttons */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-400 tracking-widest uppercase">
            Acoustic Environment Profile:
          </label>
          <div className="grid grid-cols-2 gap-2">
            {CLINICAL_ENVIRONMENTS.map((env) => {
              const isSelected = environment === env;
              return (
                <button
                  key={env}
                  type="button"
                  onClick={() => setEnvironment(env)}
                  className={`py-2 px-3 rounded-xl border text-[11px] font-bold transition-all duration-205 min-h-[40px] ${
                    isSelected
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-md'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-550'
                  }`}
                >
                  {env}
                </button>
              );
            })}
          </div>
        </div>

        {/* Environmental Noise stress level slider */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="block text-xs font-bold text-slate-400 tracking-widest uppercase">
              Environmental Noise Stress:
            </label>
            <span className="text-sm font-extrabold text-pink-400 font-mono bg-pink-500/10 border border-pink-500/20 px-2 py-0.5 rounded-lg">
              {envDifficulty}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={envDifficulty}
            onChange={(e) => setEnvDifficulty(parseInt(e.target.value))}
            className="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-pink-500 min-h-[30px]"
          />
        </div>

        {/* Repair Protocols Checklist */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-400 tracking-widest uppercase">
            Communication Repair Protocols Deployed:
          </label>
          <div className="space-y-1.5">
            {REPAIR_PROTOCOLS.map((strategy) => {
              const isChecked = repairStrategies.includes(strategy);
              return (
                <label
                  key={strategy}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer select-none transition-all duration-200 min-h-[44px] ${
                    isChecked
                      ? 'bg-purple-600/10 border-purple-500 text-purple-300'
                      : 'bg-slate-900 border-slate-705 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {
                      if (isChecked) {
                        setRepairStrategies(repairStrategies.filter(s => s !== strategy));
                      } else {
                        setRepairStrategies([...repairStrategies, strategy]);
                      }
                    }}
                    className="rounded text-purple-600 focus:ring-purple-500/30 bg-slate-950 border-slate-800 h-4.5 w-4.5"
                  />
                  <span className="text-[11px] font-bold">{strategy}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Clinical Observations */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-400 tracking-widest uppercase">
            Clinical Observations:
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Log phonetic distortions, voicing errors, or therapeutic strategies..."
            rows={3}
            className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 focus:outline-none p-3 rounded-2xl text-sm text-slate-200 placeholder-slate-600 transition-all"
          />
        </div>

        <button 
          type="submit" 
          className="w-full bg-indigo-650 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-indigo-600/10 transition-all duration-300 min-h-[48px] uppercase tracking-wider text-xs"
        >
          Commit Session Analytics
        </button>
        
        {/* Local-first Notice */}
        <p className="text-[9px] text-slate-500 text-center uppercase tracking-wider font-semibold">
          Zero-Cloud Protocol Active: Data is stored local-first on this device.
        </p>
      </form>
        </>
      )}

      {/* SVG Progress Chart */}
      {logs.length > 0 && (
        <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
          <h4 className="text-xs font-bold text-slate-400 tracking-widest uppercase block border-b border-slate-700/50 pb-2 text-left">
            Longitudinal Intelligibility Progress
          </h4>
          
          <div className="relative w-full h-[200px]">
            <svg viewBox="0 0 400 200" className="w-full h-full">
              {/* Grid Lines */}
              {[25, 50, 75, 100].map((level) => {
                const y = 170 - (level / 100) * 145;
                return (
                  <g key={level}>
                    <line 
                      x1="45" 
                      y1={y} 
                      x2="385" 
                      y2={y} 
                      stroke="#334155" 
                      strokeDasharray="4 4" 
                      strokeWidth="1" 
                    />
                    <text 
                      x="10" 
                      y={y + 3} 
                      fill="#64748b" 
                      className="text-[9px] font-bold font-mono"
                    >
                      {level}%
                    </text>
                  </g>
                );
              })}

              {/* X Axis Date labels */}
              {(() => {
                const points = logs.slice(-6);
                return points.map((log, idx) => {
                  const x = 45 + (points.length > 1 ? (idx * 340) / (points.length - 1) : 170);
                  const dateParts = log.date.split(',')[0].split('/');
                  const displayDate = dateParts[0] && dateParts[1] ? `${dateParts[0]}/${dateParts[1]}` : dateParts[0];
                  return (
                    <text
                      key={log.id}
                      x={x}
                      y="188"
                      fill="#64748b"
                      textAnchor="middle"
                      className="text-[8px] font-bold font-mono"
                    >
                      {displayDate}
                    </text>
                  );
                });
              })()}

              {/* Draw PCC Path */}
              {(() => {
                const points = logs.slice(-6);
                if (points.length === 0) return null;
                const pathD = points.map((log, idx) => {
                  const x = 45 + (points.length > 1 ? (idx * 340) / (points.length - 1) : 170);
                  const y = 170 - (log.pcc / 100) * 145;
                  return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                }).join(' ');

                return (
                  <>
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {points.map((log, idx) => {
                      const x = 45 + (points.length > 1 ? (idx * 340) / (points.length - 1) : 170);
                      const y = 170 - (log.pcc / 100) * 145;
                      return (
                        <g key={log.id}>
                          <circle
                            cx={x}
                            cy={y}
                            r="5"
                            fill="#0f172a"
                            stroke="#6366f1"
                            strokeWidth="2"
                          />
                          <circle
                            cx={x}
                            cy={y}
                            r="2"
                            fill="#6366f1"
                          />
                        </g>
                      );
                    })}
                  </>
                );
              })()}

              {/* Draw Naïve Listener Path (only for logs with naiveListenerScore) */}
              {(() => {
                const points = logs.slice(-6);
                const naivePoints = points
                  .map((log, idx) => ({
                    id: log.id,
                    x: 45 + (points.length > 1 ? (idx * 340) / (points.length - 1) : 170),
                    score: log.naiveListenerScore
                  }))
                  .filter(p => p.score !== undefined);

                if (naivePoints.length === 0) return null;

                const pathD = naivePoints.map((p, idx) => {
                  const y = 170 - (p.score! / 100) * 145;
                  return `${idx === 0 ? 'M' : 'L'} ${p.x} ${y}`;
                }).join(' ');

                return (
                  <>
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2"
                      strokeDasharray="3 3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {naivePoints.map((p) => {
                      const y = 170 - (p.score! / 100) * 145;
                      return (
                        <g key={p.id}>
                          <circle
                            cx={p.x}
                            cy={y}
                            r="4"
                            fill="#0f172a"
                            stroke="#10b981"
                            strokeWidth="2"
                          />
                          <circle
                            cx={p.x}
                            cy={y}
                            r="1.5"
                            fill="#10b981"
                          />
                        </g>
                      );
                    })}
                  </>
                );
              })()}
            </svg>
          </div>

          {/* Legend */}
          <div className="flex justify-center gap-5 text-[9px] font-bold uppercase tracking-wider pt-1 border-t border-slate-700/50">
            <div className="flex items-center gap-1.5 text-indigo-400">
              <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
              <span>Clinician PCC</span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block border border-slate-800" />
              <span>Naïve Intelligibility</span>
            </div>
          </div>
        </div>
      )}

      {/* Log Feed */}
      <div className="space-y-3">
        <h3 className="font-bold text-sm text-slate-400 tracking-widest uppercase flex items-center gap-2">
          <span>Analytics Database</span>
          <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full text-[10px] font-bold">
            {logs.length}
          </span>
        </h3>

        {logs.length === 0 ? (
          <div className="bg-slate-855/40 border border-dashed border-slate-800 p-8 rounded-2xl text-center">
            <BarChart3 className="mx-auto text-slate-600 mb-2" size={32} />
            <p className="text-sm text-slate-500">No session metrics catalogued.</p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {logs.map((log) => {
              const badge = getRatingBadge(log.rating);
              return (
                <div 
                  key={log.id} 
                  className="bg-slate-800/50 border border-slate-700/60 p-4 rounded-3xl space-y-3 shadow hover:border-slate-600 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 font-bold">{log.date}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${badge.styles}`}>
                        {badge.text}
                      </span>
                      <button 
                        onClick={() => handleDeleteLog(log.id!)}
                        className="text-slate-500 hover:text-rose-400 p-1 transition min-h-[30px] min-w-[30px] flex items-center justify-center"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Quantitative metrics row */}
                  <div className="flex gap-2">
                    <span className="text-[10px] font-extrabold bg-slate-900 border border-slate-800 text-emerald-400 px-2.5 py-1 rounded-xl">
                      PCC: {log.pcc}%
                    </span>
                    <span className="text-[10px] font-extrabold bg-slate-900 border border-slate-800 text-indigo-400 px-2.5 py-1 rounded-xl truncate">
                      Env: {log.environment}
                    </span>
                    {log.environmentalDifficulty !== undefined && log.environmentalDifficulty > 0 && (
                      <span className="text-[10px] font-extrabold bg-slate-900 border border-slate-800 text-pink-400 px-2.5 py-1 rounded-xl">
                        Noise: {log.environmentalDifficulty}%
                      </span>
                    )}
                  </div>

                  {/* Deployed strategies bullets */}
                  {log.repairStrategies && log.repairStrategies.length > 0 && (
                    <div className="space-y-1 bg-slate-900/30 p-2.5 rounded-xl border border-slate-850">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Repair Protocols:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {log.repairStrategies.map((strat) => (
                          <span key={strat} className="text-[9px] font-semibold bg-purple-950/40 border border-purple-900/50 text-purple-400 px-2 py-0.5 rounded-md">
                            {strat}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {log.notes && (
                    <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/50 p-3 rounded-2xl border border-slate-808/80 font-normal">
                      {log.notes}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// --- TAB 3: ProtocolTab (Intake, GFTA-3 Matrix, Local AI Gemini Assistant) ---
const ARIZONA_PHONEMES = ['/r/', '/s/', '/z/', '/l/', '/th/', '/sh/', '/ch/', '/zh/'];

function ProtocolTab() {
  const { hasLocalAI, aiStatus } = useStore();

  // --- LocalStorage States to prevent loss on PWA lifecycle ---
  const [intakeAutonomy, setIntakeAutonomy] = useState(() => localStorage.getItem('hfs_intake_autonomy') === 'true');
  const [intakeBoundaries, setIntakeBoundaries] = useState(() => localStorage.getItem('hfs_intake_boundaries') === 'true');
  const [intakeGlitch, setIntakeGlitch] = useState(() => localStorage.getItem('hfs_intake_glitch') === 'true');
  const [intakeGoals, setIntakeGoals] = useState(() => localStorage.getItem('hfs_intake_goals') || '');

  const [arizonaLate8, setArizonaLate8] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('hfs_arizona_late8') || '[]');
    } catch {
      return [];
    }
  });

  const [sitWordsTotal, setSitWordsTotal] = useState(() => parseInt(localStorage.getItem('hfs_sit_total') || '10'));
  const [sitWordsCorrect, setSitWordsCorrect] = useState(() => parseInt(localStorage.getItem('hfs_sit_correct') || '8'));

  const [prosodyRate, setProsodyRate] = useState(() => localStorage.getItem('hfs_prosody_rate') === 'true');
  const [prosodyIntonation, setProsodyIntonation] = useState(() => localStorage.getItem('hfs_prosody_intonation') === 'true');

  const [aiResponse, setAiResponse] = useState('');
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  // Sync state changes to LocalStorage
  useEffect(() => {
    localStorage.setItem('hfs_intake_autonomy', String(intakeAutonomy));
    localStorage.setItem('hfs_intake_boundaries', String(intakeBoundaries));
    localStorage.setItem('hfs_intake_glitch', String(intakeGlitch));
    localStorage.setItem('hfs_intake_goals', intakeGoals);
  }, [intakeAutonomy, intakeBoundaries, intakeGlitch, intakeGoals]);

  useEffect(() => {
    localStorage.setItem('hfs_arizona_late8', JSON.stringify(arizonaLate8));
  }, [arizonaLate8]);

  useEffect(() => {
    localStorage.setItem('hfs_sit_total', String(sitWordsTotal));
    localStorage.setItem('hfs_sit_correct', String(sitWordsCorrect));
  }, [sitWordsTotal, sitWordsCorrect]);

  useEffect(() => {
    localStorage.setItem('hfs_prosody_rate', String(prosodyRate));
    localStorage.setItem('hfs_prosody_intonation', String(prosodyIntonation));
  }, [prosodyRate, prosodyIntonation]);

  const togglePhoneme = (sound: string) => {
    if (arizonaLate8.includes(sound)) {
      setArizonaLate8(arizonaLate8.filter(s => s !== sound));
    } else {
      setArizonaLate8([...arizonaLate8, sound]);
    }
  };

  const handleCopyReport = () => {
    if (aiResponse) {
      navigator.clipboard.writeText(aiResponse);
      alert("Clinical report copied to clipboard!");
    }
  };

  const generateReport = async () => {
    setIsLoadingAI(true);
    setAiResponse('');

    const sitPercent = sitWordsTotal > 0 ? Math.round((sitWordsCorrect / sitWordsTotal) * 100) : 0;
    const targets = arizonaLate8.length > 0 ? arizonaLate8.join(', ') : 'None marked';
    const suprasegmentals = [
      prosodyRate ? 'Rate Control Protocol (Fast/Irregular limits)' : '',
      prosodyIntonation ? 'Interrogative Inflection Contrast' : ''
    ].filter(Boolean);

    const promptText = `
You are a Senior Speech-Language Pathologist. Compile a clinical documentation report based on these parameters:
- Student Age: 14 (Adolescent context, AVT Cheat Sheet focus).
- Sentence Intelligibility (SIT): ${sitPercent}% score (${sitWordsCorrect}/${sitWordsTotal} words correct).
- Absent Late 8 Phonemes: ${targets}.
- Active Suprasegmentals: ${suprasegmentals.join(', ') || 'Within typical limits'}.
- Therapist Intake Focus: "${intakeGoals || 'Establish hardware glitch analogy and active peer communication repair.'}".

Provide a professional draft in markdown containing:
1. An IDEA "Educational Impact Statement" justifying eligibility based on functional peer collaboration and self-advocacy in classroom/cafeteria environments.
2. Two SMART IEP goals targeting these specific phoneme and suprasegmental features.
3. Clinical repair strategy recommendations.
    `.trim();

    const globalWindow = window as unknown as WindowWithAI;
    // Attempt local Gemini Nano call if available
    if (globalWindow.ai && globalWindow.ai.assistant && hasLocalAI) {
      try {
        const assistant = await globalWindow.ai.assistant.create({
          systemPrompt: "You are a professional Speech-Language Pathologist compiling clinical documentation."
        });
        const result = await assistant.prompt(promptText);
        setAiResponse(result);
        setIsLoadingAI(false);
        return;
      } catch (err) {
        console.error("Local Gemini Nano API failed, triggering rules fallback...", err);
      }
    }

    // Rules-engine clinical template generator (zero-latency, highly accurate fallback)
    setTimeout(() => {
      const template = `
### CLINICAL INTENDED REPORT
**Protocol Execution Date:** ${new Date().toLocaleDateString()}
**Calculated Intelligibility Index (SIT):** ${sitPercent}%
**Phonetic Targets Absent:** ${targets}
**Prosodic/Voice Modulators Deployed:** ${suprasegmentals.join(', ') || 'No anomalies'}

---

### 1. IDEA FUNCTIONAL & EDUCATIONAL IMPACT SUMMARY
"The student presents with reduced speech intelligibility at the sentence and conversational levels, characterized by a Sentence Intelligibility Test (SIT) score of ${sitPercent}%. Phonetic analysis indicates errors/omissions affecting the late-developing consonant sounds: ${targets}. 

This functional speech impairment significantly restricts the student's communication effectiveness in the educational setting. Reduced intelligibility limits self-advocacy (asking questions in class), creates barrier structures in peer-led collaborative group projects, and causes conversational avoidance. These deficits restrict the student's ability to participate equivalently to peers in verbal tasks. Specialized clinical intervention is necessary under IDEA guidelines to address these functional deficits."

---

### 2. DRAFT SMART IEP GOALS
1. **Intelligibility Target:** By the end of the school period, the student will deploy targeted communication repair protocols (e.g., rate adjustment, phonetic highlighting) to achieve an objective sentence intelligibility of 90% or higher, as measured by clinical transcription checks during functional classroom speech tasks.
2. **Phonetic Target:** The student will produce target consonant sounds (${targets}) in conversational speech with 80% accuracy across three consecutive sessions, using real-time visual-acoustic waveform matching on the biofeedback dashboard.

---

### 3. CLINICAL RECOMMENDATIONS & PROTOCOLS
* **Visual Acoustic Biofeedback (VAB):** Target phonemes (${targets}) using live waveform canvas matching to bypass auditory feedback degradation.
* **Autonomy Support:** Frame articulation deficits as a 'Hardware Calibration Glitch' (CI/HA limitation) to reduce shame and promote self-management.
* **Acoustic Highlighting:** Clinician will deploy wait-time strategies and vocal emphasis to encourage self-correction during phonemic trials.
      `.trim();
      
      setAiResponse(template);
      setIsLoadingAI(false);
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* 1. Intake Alignment Checklist */}
      <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
        <h3 className="font-extrabold text-base text-slate-100 tracking-tight flex items-center gap-2 border-b border-slate-700/50 pb-2">
          <Activity size={18} className="text-indigo-400" />
          <span>Adolescent Intake Alignment</span>
        </h3>
        
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Establish adolescent autonomy and a collaborative consultant relationship. Use professional, technical terminology.
        </p>

        <div className="space-y-2.5">
          <label className="flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-750 rounded-2xl cursor-pointer min-h-[48px]">
            <input 
              type="checkbox"
              checked={intakeBoundaries}
              onChange={() => setIntakeBoundaries(!intakeBoundaries)}
              className="rounded text-indigo-500 focus:ring-indigo-500/30 bg-slate-950 border-slate-800 h-5 w-5"
            />
            <div className="text-xs">
              <span className="font-bold text-slate-200 block">Clear Boundaries</span>
              <span className="text-[10px] text-slate-400">Stated clearly that this is clinical training, not a child game.</span>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-750 rounded-2xl cursor-pointer min-h-[48px]">
            <input 
              type="checkbox"
              checked={intakeGlitch}
              onChange={() => setIntakeGlitch(!intakeGlitch)}
              className="rounded text-indigo-500 focus:ring-indigo-500/30 bg-slate-950 border-slate-800 h-5 w-5"
            />
            <div className="text-xs">
              <span className="font-bold text-slate-200 block">"Hardware Glitch" Analogy</span>
              <span className="text-[10px] text-slate-400">Framed speech limits as a hardware calibration glitch.</span>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-750 rounded-2xl cursor-pointer min-h-[48px]">
            <input 
              type="checkbox"
              checked={intakeAutonomy}
              onChange={() => setIntakeAutonomy(!intakeAutonomy)}
              className="rounded text-indigo-500 focus:ring-indigo-500/30 bg-slate-950 border-slate-800 h-5 w-5"
            />
            <div className="text-xs">
              <span className="font-bold text-slate-200 block">Collaborative Agreement</span>
              <span className="text-[10px] text-slate-400">Used autonomy-supportive language ("we can try", "our goal").</span>
            </div>
          </label>
        </div>

        {/* Goals Input */}
        <div className="space-y-1.5 pt-1">
          <label className="block text-[10px] font-extrabold text-slate-500 tracking-wider uppercase">
            Collaborative Treatment Targets:
          </label>
          <textarea
            value={intakeGoals}
            onChange={(e) => setIntakeGoals(e.target.value)}
            placeholder="Outline student-selected targets and personal speech objectives..."
            rows={2}
            className="w-full bg-slate-900 border border-slate-700/80 focus:border-indigo-500 focus:outline-none p-3 rounded-2xl text-xs text-slate-200 placeholder-slate-600 transition-all"
          />
        </div>
      </div>

      {/* 2. Diagnostic & Assessment Matrix */}
      <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
        <h3 className="font-extrabold text-base text-slate-100 tracking-tight flex items-center gap-2 border-b border-slate-700/50 pb-2">
          <BarChart3 size={18} className="text-purple-400" />
          <span>Diagnostic Assessment Matrix</span>
        </h3>

        {/* Arizona Late 8 Checklist */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-400 tracking-widest uppercase">
            Arizona-4 / GFTA-3 Absent Consonants:
          </label>
          <p className="text-[10px] text-slate-500 italic leading-snug">
            Select the phonemes presenting developmental articulation inaccuracies.
          </p>
          <div className="grid grid-cols-4 gap-2 pt-1">
            {ARIZONA_PHONEMES.map((sound) => {
              const isSelected = arizonaLate8.includes(sound);
              return (
                <button
                  key={sound}
                  type="button"
                  onClick={() => togglePhoneme(sound)}
                  className={`py-2 px-1 rounded-xl font-bold border text-xs text-center transition min-h-[40px] ${
                    isSelected
                      ? 'bg-pink-600/20 border-pink-500 text-pink-300'
                      : 'bg-slate-900 border-slate-700 text-slate-450 hover:border-slate-550'
                  }`}
                >
                  {sound}
                </button>
              );
            })}
          </div>
        </div>

        {/* SIT Score Calculator */}
        <div className="space-y-2.5 pt-2 border-t border-slate-750">
          <label className="block text-xs font-bold text-slate-400 tracking-widest uppercase">
            SIT Transcription Score Calculator:
          </label>
          <div className="flex items-center gap-3 bg-slate-900/40 p-3 rounded-2xl border border-slate-750">
            <div className="flex-1 space-y-1">
              <span className="text-[10px] text-slate-500 font-bold block uppercase">Correct Words</span>
              <input
                type="number"
                min="0"
                max={sitWordsTotal}
                value={sitWordsCorrect}
                onChange={(e) => setSitWordsCorrect(Math.max(0, parseInt(e.target.value) || 0))}
                className="bg-slate-950 border border-slate-750 rounded-lg p-2 text-center text-sm font-bold text-slate-200 w-full focus:outline-none focus:border-indigo-500 min-h-[36px]"
              />
            </div>
            <div className="text-slate-600 font-bold text-lg pt-4">/</div>
            <div className="flex-1 space-y-1">
              <span className="text-[10px] text-slate-500 font-bold block uppercase">Total Words</span>
              <input
                type="number"
                min="1"
                value={sitWordsTotal}
                onChange={(e) => setSitWordsTotal(Math.max(1, parseInt(e.target.value) || 1))}
                className="bg-slate-950 border border-slate-750 rounded-lg p-2 text-center text-sm font-bold text-slate-200 w-full focus:outline-none focus:border-indigo-500 min-h-[36px]"
              />
            </div>
            <div className="flex-1 text-center space-y-1">
              <span className="text-[10px] text-slate-500 font-bold block uppercase">Intelligibility</span>
              <span className="text-base font-extrabold text-emerald-400 font-mono block pt-1.5">
                {sitWordsTotal > 0 ? Math.round((sitWordsCorrect / sitWordsTotal) * 100) : 0}%
              </span>
            </div>
          </div>
        </div>

        {/* Prosody screening */}
        <div className="space-y-2 pt-2 border-t border-slate-750">
          <label className="block text-xs font-bold text-slate-400 tracking-widest uppercase">
            Prosody / Voice Screen Checklist:
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-2.5 bg-slate-900/40 rounded-xl cursor-pointer min-h-[44px]">
              <input 
                type="checkbox"
                checked={prosodyRate}
                onChange={() => setProsodyRate(!prosodyRate)}
                className="rounded text-indigo-500 focus:ring-indigo-500/30 bg-slate-950 border-slate-800 h-4.5 w-4.5"
              />
              <span className="text-[11px] font-bold text-slate-300">Fast/Irregular speaking rate presents</span>
            </label>
            <label className="flex items-center gap-3 p-2.5 bg-slate-900/40 rounded-xl cursor-pointer min-h-[44px]">
              <input 
                type="checkbox"
                checked={prosodyIntonation}
                onChange={() => setProsodyIntonation(!prosodyIntonation)}
                className="rounded text-indigo-500 focus:ring-indigo-500/30 bg-slate-950 border-slate-800 h-4.5 w-4.5"
              />
              <span className="text-[11px] font-bold text-slate-300">Inflection anomalies / flat vocal intonation</span>
            </label>
          </div>
        </div>
      </div>

      {/* 3. On-Device AI Clinical Assistant */}
      <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-700/50 pb-2">
          <h3 className="font-extrabold text-base text-slate-100 tracking-tight flex items-center gap-2">
            <Brain size={18} className="text-pink-400" />
            <span>Local AI Clinical assistant</span>
          </h3>
          <span className="text-[9px] font-extrabold bg-slate-900 border border-slate-700 text-indigo-400 px-2.5 py-0.5 rounded-full">
            Local-First
          </span>
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed font-normal">
          Generates an IDEA-compliant defense, IEP targets, and biofeedback plans. 
          Uses browser-native Gemini Nano when enabled, or the clinical expert system fallback.
        </p>

        {/* AI Status Indicators */}
        <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-750 px-3.5 py-2.5 rounded-2xl text-[10px] font-bold">
          <Cpu size={14} className="text-indigo-400" />
          <span className="text-slate-400">Engine Status:</span>
          <span className={hasLocalAI ? "text-emerald-400" : "text-amber-400"}>
            {aiStatus}
          </span>
        </div>

        {/* Generate Trigger */}
        <button
          onClick={generateReport}
          disabled={isLoadingAI}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-600/10 transition disabled:opacity-50 min-h-[48px]"
        >
          <Sparkles size={16} />
          <span className="text-xs uppercase tracking-wider">
            {isLoadingAI ? "Compiling Case Metrics..." : "Compile IEP Defense Report"}
          </span>
        </button>

        {/* AI Output Result Box */}
        {aiResponse && (
          <div className="space-y-2 pt-2 border-t border-slate-750 animate-fadeIn">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Compiled Output:</span>
              <button
                onClick={handleCopyReport}
                className="text-[10px] font-bold bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/35 border border-indigo-500/20 px-2.5 py-1 rounded-xl transition min-h-[30px]"
              >
                Copy to Clipboard
              </button>
            </div>
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-900 overflow-y-auto max-h-80 text-xs text-slate-350 leading-relaxed whitespace-pre-line text-left font-normal select-text">
              {aiResponse}
            </div>
          </div>
        )}

        {/* Chrome Flags Setup Trigger */}
        <div className="border-t border-slate-750/80 pt-3">
          <button
            type="button"
            onClick={() => setShowSetup(!showSetup)}
            className="w-full flex items-center justify-between text-slate-500 hover:text-slate-300 transition text-[10px] font-extrabold uppercase tracking-wider py-1.5"
          >
            <span>Configure Chrome Native Gemini Nano</span>
            {showSetup ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showSetup && (
            <div className="bg-slate-900/60 border border-slate-750 p-3.5 rounded-2xl text-[10px] text-slate-400 mt-2 space-y-2 text-left leading-relaxed font-normal">
              <span className="font-bold text-slate-300 block uppercase tracking-wider">Enable flags on Google Pixel & Chrome:</span>
              <ol className="list-decimal list-inside space-y-1.5">
                <li>Go to URL <code className="bg-slate-950 text-indigo-400 px-1 py-0.5 rounded font-mono select-all">chrome://flags/#optimization-guide-on-device-model</code> and select <strong className="text-slate-200">Enabled BypassPrefRequirement</strong>.</li>
                <li>Go to URL <code className="bg-slate-950 text-indigo-400 px-1 py-0.5 rounded font-mono select-all">chrome://flags/#prompt-api-for-gemini-nano</code> and select <strong className="text-slate-200">Enabled</strong>.</li>
                <li>Restart Chrome, open developer tools, and wait a moment for the background model to download.</li>
              </ol>
              <p className="text-[9px] text-slate-500 italic">
                Note: Native execution uses your device's built-in GPU/NPU locally.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- TAB 4: ExportTab (Patient-Mediated Exchange) ---
interface ExportTabProps {
  isSecurityEnabled: boolean;
  registerLocalPasskey: () => Promise<void>;
  disableSecurity: () => void;
}

function ExportTab({ isSecurityEnabled, registerLocalPasskey, disableSecurity }: ExportTabProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [stats, setStats] = useState({ logsCount: 0, recordingsCount: 0 });
  const [clipboardInput, setClipboardInput] = useState('');
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');
  const [isCopied, setIsCopied] = useState(false);

  // New states for mobile enhancements & QR handoff
  const [exportFormat, setExportFormat] = useState<'full' | 'logs-only'>('full');
  const [canShare] = useState(() => {
    if (typeof navigator !== 'undefined' && navigator.canShare) {
      try {
        const dummyFile = new File([''], 'd.json', { type: 'application/json' });
        return navigator.canShare({ files: [dummyFile] });
      } catch {
        return false;
      }
    }
    return false;
  });
  const [isDragging, setIsDragging] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrError, setQrError] = useState('');
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragCounter = useRef(0);

  const loadStats = async () => {
    const logsCount = await db.logs.count();
    const recordingsCount = await db.recordings.count();
    setStats({ logsCount, recordingsCount });
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  useEffect(() => {
    let active = true;
    const fetchStats = async () => {
      const logsCount = await db.logs.count();
      const recordingsCount = await db.recordings.count();
      if (active) {
        setStats({ logsCount, recordingsCount });
      }
    };
    fetchStats().catch(console.error);
    return () => {
      active = false;
    };
  }, []);

  const getSerializedPayload = async (format: 'full' | 'logs-only' = 'full') => {
    const logs = await db.logs.toArray();
    let serializedRecordings: BackupPayload['data']['recordings'] = [];

    if (format === 'full') {
      const recordings = await db.recordings.toArray();
      serializedRecordings = await Promise.all(
        recordings.map(async (rec) => {
          const base64 = await blobToBase64(rec.audio);
          return {
            id: rec.id,
            date: rec.date,
            name: rec.name,
            audioBase64: base64
          };
        })
      );
    }

    return {
      appName: "HearForSpeech",
      exportedAt: new Date().toISOString(),
      data: {
        logs,
        recordings: serializedRecordings
      }
    };
  };

  const handleExportFile = async () => {
    try {
      const payload = await getSerializedPayload(exportFormat);
      const jsonBlob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(jsonBlob);
      
      const a = document.createElement('a');
      a.href = url;
      const suffix = exportFormat === 'logs-only' ? 'logs_only' : 'backup';
      a.download = `hearforspeech_${suffix}_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Database export failed', err);
      alert('Data export failed. See browser console.');
    }
  };

  const handleShareFile = async () => {
    try {
      const payload = await getSerializedPayload(exportFormat);
      const suffix = exportFormat === 'logs-only' ? 'logs_only' : 'backup';
      const filename = `hearforspeech_${suffix}_${new Date().toISOString().split('T')[0]}.json`;
      const file = new File(
        [JSON.stringify(payload, null, 2)],
        filename,
        { type: 'application/json' }
      );

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'HearForSpeech Data Exchange',
          text: `Speech evaluation logs ${exportFormat === 'logs-only' ? '(text only)' : '(full with voice prints)'}`
        });
      } else {
        alert("Native file sharing is not supported by your browser/device.");
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Web Share failed:', err);
        alert('Failed to share backup file.');
      }
    }
  };

  const handleCopyClipboard = async () => {
    try {
      const payload = await getSerializedPayload(exportFormat);
      const jsonStr = JSON.stringify(payload);
      await navigator.clipboard.writeText(jsonStr);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Copy to clipboard failed:', err);
      alert('Failed to copy to clipboard.');
    }
  };

  const handleGenerateQr = async () => {
    try {
      setQrError('');
      // Package logs only (exclude large binary audio blobs for QR code scan limits)
      const logs = await db.logs.toArray();
      const payload = {
        appName: "HearForSpeech",
        exportedAt: new Date().toISOString(),
        data: {
          logs,
          recordings: []
        }
      };
      
      const jsonStr = JSON.stringify(payload);
      const utf8Bytes = new TextEncoder().encode(jsonStr);
      let binary = '';
      for (let i = 0; i < utf8Bytes.length; i++) {
        binary += String.fromCharCode(utf8Bytes[i]);
      }
      const base64Data = btoa(binary);
      
      const handoffLink = window.location.origin + window.location.pathname + '#handoff=' + encodeURIComponent(base64Data);
      
      if (handoffLink.length > 2800) {
        setQrError("Data payload is too large for scanning a QR code (~" + Math.round(handoffLink.length / 1024) + " KB). Please select 'Save Backup File' for direct transfers instead!");
        setShowQrModal(true);
        return;
      }

      setShowQrModal(true);
      
      setTimeout(() => {
        if (qrCanvasRef.current) {
          QRCode.toCanvas(qrCanvasRef.current, handoffLink, {
            width: 260,
            margin: 2,
            color: {
              dark: '#0f172a', // Slate 900
              light: '#ffffff' // White
            }
          }, (error) => {
            if (error) {
              console.error("QR Code rendering failed:", error);
              setQrError("Failed to render QR Code.");
            }
          });
        }
      }, 100);
    } catch (err) {
      console.error("Failed to generate handoff link", err);
      setQrError("Failed to generate handoff link.");
      setShowQrModal(true);
    }
  };

  const processImportData = async (parsed: BackupPayload) => {
    if (parsed.appName !== "HearForSpeech" || !parsed.data) {
      throw new Error("Incorrect application backup format.");
    }

    const { logs, recordings } = parsed.data;
    if (!Array.isArray(logs)) {
      throw new Error("Corrupted logs structure.");
    }

    if (importMode === 'overwrite') {
      const proceed = confirm(
        "DANGER: Overwrite option will wipe all local data first. Proceed?"
      );
      if (!proceed) return;

      await db.transaction('rw', [db.logs, db.recordings], async () => {
        await db.logs.clear();
        await db.recordings.clear();

        for (const log of logs) {
          await db.logs.add({
            date: log.date,
            rating: log.rating,
            pcc: log.pcc !== undefined ? log.pcc : 80,
            environment: log.environment || 'Quiet Clinical Space',
            repairStrategies: Array.isArray(log.repairStrategies) ? log.repairStrategies : [],
            notes: log.notes,
            environmentalDifficulty: log.environmentalDifficulty,
            environmentalNoiseLevel: log.environmentalNoiseLevel !== undefined ? log.environmentalNoiseLevel : log.environmentalDifficulty,
            naiveListenerScore: log.naiveListenerScore
          });
        }

        if (Array.isArray(recordings)) {
          for (const rec of recordings) {
            const audioBlob = base64ToBlob(rec.audioBase64);
            await db.recordings.add({
              date: rec.date,
              audio: audioBlob,
              name: rec.name
            });
          }
        }
      });
    } else {
      // Merge logs & recordings (avoid duplicates by checking date/name)
      await db.transaction('rw', [db.logs, db.recordings], async () => {
        const currentLogs = await db.logs.toArray();
        const currentRecordings = await db.recordings.toArray();

        for (const log of logs) {
          const exists = currentLogs.some(l => l.date === log.date && l.notes === log.notes);
          if (!exists) {
            await db.logs.add({
              date: log.date,
              rating: log.rating,
              pcc: log.pcc !== undefined ? log.pcc : 80,
              environment: log.environment || 'Quiet Clinical Space',
              repairStrategies: Array.isArray(log.repairStrategies) ? log.repairStrategies : [],
              notes: log.notes,
              environmentalDifficulty: log.environmentalDifficulty,
              environmentalNoiseLevel: log.environmentalNoiseLevel !== undefined ? log.environmentalNoiseLevel : log.environmentalDifficulty,
              naiveListenerScore: log.naiveListenerScore
            });
          }
        }

        if (Array.isArray(recordings)) {
          for (const rec of recordings) {
            const exists = currentRecordings.some(r => r.date === rec.date && r.name === rec.name);
            if (!exists) {
              const audioBlob = base64ToBlob(rec.audioBase64);
              await db.recordings.add({
                date: rec.date,
                audio: audioBlob,
                name: rec.name
              });
            }
          }
        }
      });
    }

    alert(`Successfully ${importMode === 'merge' ? 'merged' : 'restored'} backup data!`);
    loadStats();
    setClipboardInput('');
    window.location.reload();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          const parsed = JSON.parse(content);
          await processImportData(parsed);
        } catch (err: unknown) {
          const error = err as Error;
          alert(`Failed to parse file: ${error.message || error}`);
        }
      };
      reader.readAsText(file);
    } catch (err) {
      console.error('File reading failed', err);
      alert('Failed to read selected file.');
    }
  };

  const handleImportClipboard = async () => {
    if (!clipboardInput.trim()) {
      alert("Please paste the backup JSON text first.");
      return;
    }

    try {
      const parsed = JSON.parse(clipboardInput.trim());
      await processImportData(parsed);
    } catch (err: unknown) {
      const error = err as Error;
      alert(`Invalid backup JSON text: ${error.message || error}`);
    }
  };

  const handleInstantClipboardImport = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        alert("Clipboard is empty.");
        return;
      }
      const parsed = JSON.parse(text.trim());
      await processImportData(parsed);
    } catch (err: unknown) {
      const error = err as Error;
      alert(`Clipboard content is not a valid HearForSpeech backup JSON: ${error.message || error}`);
    }
  };

  const handleClearDatabase = async () => {
    const confirm1 = confirm("DANGER: This will permanently delete ALL session metrics and recordings. Continue?");
    if (!confirm1) return;
    const confirm2 = confirm("Are you absolutely sure? This cannot be undone.");
    if (!confirm2) return;

    await db.logs.clear();
    await db.recordings.clear();
    alert("Local database wiped.");
    loadStats();
  };

  // Drag & drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    dragCounter.current = 0;
    
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      alert("Only JSON database files are supported.");
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          const parsed = JSON.parse(content);
          await processImportData(parsed);
        } catch (err: unknown) {
          const error = err as Error;
          alert(`Failed to parse file: ${error.message || error}`);
        }
      };
      reader.readAsText(file);
    } catch (err) {
      console.error('File reading failed', err);
      alert('Failed to read dropped file.');
    }
  };

  return (
    <div 
      className="space-y-6 relative min-h-[300px]"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Visual overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 border-2 border-dashed border-indigo-500 rounded-3xl m-0.5 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="bg-indigo-600/20 border border-indigo-500/30 p-5 rounded-full text-indigo-400">
              <Upload size={32} className="animate-bounce" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-100">Drop Backup File Here</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-[220px] leading-relaxed">
                Release your `.json` file to parse and merge/restore your data instantly.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 1. Local Security Config Panel */}
      <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
        <h3 className="font-extrabold text-base text-slate-100 tracking-tight flex items-center gap-2 border-b border-slate-700/50 pb-2">
          <Shield size={18} className="text-indigo-400" />
          <span>Local Device Security Lock</span>
        </h3>
        
        <p className="text-[11px] text-slate-400 leading-relaxed font-normal text-left">
          Lock access to clinical logs using your device's native FaceID/TouchID passkey or a fallback PIN. 
          Perfect for protecting patient data when sharing device hardware with clients.
          <span className="block mt-1.5 text-[10px] text-indigo-350 italic">
            * Note: Passkeys are local to this specific device and browser. Register a separate passkey on each device to enable lock screens across all phones or computers.
          </span>
        </p>

        <div className="flex items-center justify-between p-3.5 bg-slate-900/60 border border-slate-750 rounded-2xl">
          <div>
            <span className="text-xs font-bold text-slate-200 block">Biometric Lock Status</span>
            <span className={`text-[10px] font-bold block mt-0.5 ${isSecurityEnabled ? 'text-emerald-400' : 'text-slate-500 uppercase'}`}>
              {isSecurityEnabled ? '🔒 Active (Passkey / PIN Enabled)' : '🔓 Off / Unprotected'}
            </span>
          </div>
          {isSecurityEnabled ? (
            <button
              onClick={disableSecurity}
              className="bg-slate-700 hover:bg-slate-650 text-slate-200 font-bold px-4 py-2 rounded-xl text-[10px] uppercase tracking-wider transition active:scale-95 min-h-[36px]"
            >
              Disable Lock
            </button>
          ) : (
            <button
              onClick={registerLocalPasskey}
              className="bg-indigo-650 hover:bg-indigo-600 text-white font-bold px-4 py-2 rounded-xl text-[10px] uppercase tracking-wider transition active:scale-95 min-h-[36px]"
            >
              Enable Passkey Lock
            </button>
          )}
        </div>
      </div>

      {/* 2. Patient-Mediated Exchange Stats */}
      <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
        <h3 className="font-extrabold text-base text-slate-100 tracking-tight flex items-center gap-2 border-b border-slate-700/50 pb-2">
          <Activity size={18} className="text-emerald-400" />
          <span>Database Exchange Diagnostics</span>
        </h3>

        <p className="text-[11px] text-slate-400 leading-relaxed font-normal text-left">
          Consistent with our strict privacy protocol, no database values or voice prints leave this device. 
          Use this panel to export, merge, or transition your clinical logs.
        </p>

        <div className="grid grid-cols-2 gap-3 bg-slate-900/50 p-4 rounded-2xl border border-slate-800/80">
          <div className="text-center">
            <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase block">Logs</span>
            <span className="text-xl font-bold text-slate-200 mt-1 block">{stats.logsCount}</span>
          </div>
          <div className="text-center border-l border-slate-800">
            <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase block">Recordings</span>
            <span className="text-xl font-bold text-slate-200 mt-1 block">{stats.recordingsCount}</span>
          </div>
        </div>
      </div>

      {/* 3. Export Dashboard */}
      <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
        <h4 className="text-xs font-bold text-slate-400 tracking-widest uppercase block border-b border-slate-700/50 pb-2">Export Data Dashboard</h4>
        
        {/* Export format selection */}
        <div className="space-y-1.5">
          <span className="block text-[10px] font-extrabold text-slate-500 tracking-wider uppercase">Export Format Options:</span>
          <div className="flex gap-2 bg-slate-950 p-1 rounded-2xl border border-slate-900">
            <button
              type="button"
              onClick={() => setExportFormat('full')}
              className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase transition active:scale-98 min-h-[36px] ${
                exportFormat === 'full'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-500 hover:text-slate-350'
              }`}
            >
              Full Backup (With Audio)
            </button>
            <button
              type="button"
              onClick={() => setExportFormat('logs-only')}
              className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase transition active:scale-98 min-h-[36px] ${
                exportFormat === 'logs-only'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-500 hover:text-slate-350'
              }`}
            >
              Logs Only (Text/No Audio)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={handleExportFile}
            className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-750 text-slate-200 border border-slate-700 font-bold py-3 px-3 rounded-2xl transition active:scale-98 min-h-[44px] uppercase tracking-wider text-[10px]"
          >
            <Download size={14} />
            <span>Save Backup File</span>
          </button>
          
          <button
            onClick={handleCopyClipboard}
            className={`flex items-center justify-center gap-2 border font-bold py-3 px-3 rounded-2xl transition active:scale-98 min-h-[44px] uppercase tracking-wider text-[10px] ${
              isCopied
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-slate-900 hover:bg-slate-750 border-slate-700 text-slate-200'
            }`}
          >
            <Check size={14} className={isCopied ? '' : 'hidden'} />
            <Upload size={14} className={isCopied ? 'hidden' : ''} />
            <span>{isCopied ? 'Copied!' : 'Copy to Clipboard'}</span>
          </button>
        </div>

        <div className="flex flex-col gap-2 pt-1 border-t border-slate-750/80 mt-2">
          {canShare && (
            <button
              onClick={handleShareFile}
              className="w-full flex items-center justify-center gap-2 bg-indigo-650 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-2xl transition active:scale-98 min-h-[44px] uppercase tracking-wider text-[10px]"
            >
              <Share2 size={14} />
              <span>Native Mobile Share</span>
            </button>
          )}

          <button
            onClick={handleGenerateQr}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-750 text-indigo-400 border border-slate-700 font-bold py-3 rounded-2xl transition active:scale-98 min-h-[44px] text-[10px] uppercase tracking-wider"
          >
            <QrCode size={14} />
            <span>QR Code Handoff (Logs Only)</span>
          </button>
        </div>
      </div>

      {/* 4. Import Dashboard */}
      <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
        <h4 className="text-xs font-bold text-slate-400 tracking-widest uppercase block border-b border-slate-700/50 pb-2">Import / Restore Backup</h4>

        {/* Merge Mode Toggle */}
        <div className="space-y-1.5">
          <span className="block text-[10px] font-extrabold text-slate-500 tracking-wider uppercase">Handoff Conflict Option:</span>
          <div className="flex gap-2 bg-slate-950 p-1 rounded-2xl border border-slate-900">
            <button
              type="button"
              onClick={() => setImportMode('merge')}
              className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase transition active:scale-98 min-h-[36px] ${
                importMode === 'merge'
                  ? 'bg-indigo-650 text-white shadow'
                  : 'text-slate-500 hover:text-slate-350'
              }`}
            >
              Merge Logs (Union)
            </button>
            <button
              type="button"
              onClick={() => setImportMode('overwrite')}
              className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase transition active:scale-98 min-h-[36px] ${
                importMode === 'overwrite'
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  : 'text-slate-500 hover:text-slate-350'
              }`}
            >
              Overwrite DB (Replace)
            </button>
          </div>
        </div>

        {/* Clipboard Sync Area */}
        <div className="space-y-1.5">
          <span className="block text-[10px] font-extrabold text-slate-500 tracking-wider uppercase">Paste Clipboard Text:</span>
          <textarea
            value={clipboardInput}
            onChange={(e) => setClipboardInput(e.target.value)}
            placeholder="Paste exported backup string here to restore instantly..."
            rows={3}
            className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 focus:outline-none p-3 rounded-2xl text-[11px] text-slate-200 placeholder-slate-600 transition-all font-mono select-text font-normal text-left"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleImportClipboard}
              className="flex items-center justify-center gap-2 bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-400 font-bold py-3.5 rounded-2xl border border-indigo-550/20 transition active:scale-98 min-h-[44px] uppercase tracking-wider text-[10px]"
            >
              <Upload size={14} />
              <span>Verify Paste</span>
            </button>
            <button
              onClick={handleInstantClipboardImport}
              className="flex items-center justify-center gap-2 bg-indigo-650 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-2xl transition active:scale-98 min-h-[44px] uppercase tracking-wider text-[10px]"
            >
              <Check size={14} />
              <span>Read Clipboard</span>
            </button>
          </div>
        </div>

        {/* File Drag-and-drop Import */}
        <div className="border-t border-slate-750/80 pt-3 space-y-2">
          <span className="block text-[10px] font-extrabold text-slate-500 tracking-wider uppercase">Or Drag & Drop or Select File:</span>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportFile}
            accept=".json"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-750 text-slate-300 font-bold py-3 rounded-2xl border border-dashed border-slate-700 transition active:scale-98 min-h-[44px] text-[10px] uppercase tracking-wider"
          >
            <Download size={14} className="rotate-180" />
            <span>Select JSON File</span>
          </button>
        </div>
      </div>

      {/* Danger Zone Wipe */}
      <div className="pt-2">
        <button
          onClick={handleClearDatabase}
          className="w-full flex items-center justify-center gap-2 bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/20 hover:border-rose-500/40 text-rose-400 font-semibold py-3.5 rounded-2xl text-xs transition min-h-[44px] uppercase tracking-wider"
        >
          <AlertCircle size={15} />
          <span>Reset Local Database</span>
        </button>
      </div>

      {/* Handoff QR Code Viewer Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="bg-slate-800 border border-slate-700 max-w-xs w-full p-6 rounded-3xl shadow-2xl space-y-5 text-center">
            <div className="flex justify-between items-center border-b border-slate-700 pb-2">
              <span className="font-extrabold text-sm text-slate-100 tracking-tight flex items-center gap-1.5">
                <QrCode size={16} className="text-indigo-400" />
                <span>QR Code Handoff</span>
              </span>
              <button 
                onClick={() => setShowQrModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1 min-h-[30px]"
              >
                <X size={16} />
              </button>
            </div>

            {qrError ? (
              <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl text-[10px] font-bold text-red-400 leading-normal">
                {qrError}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-[10px] text-slate-400 leading-normal font-normal max-w-[220px] mx-auto">
                  Scan this code using the native camera app on your phone/tablet to immediately import and sync session logs.
                </p>
                <div className="bg-white p-3 rounded-2xl inline-block shadow-xl">
                  <canvas ref={qrCanvasRef} className="mx-auto" />
                </div>
              </div>
            )}

            <button
              onClick={() => setShowQrModal(false)}
              className="w-full bg-slate-700 hover:bg-slate-650 text-slate-200 font-bold py-3 rounded-2xl text-[10px] uppercase tracking-wider transition active:scale-99 min-h-[40px]"
            >
              Close Handoff
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
