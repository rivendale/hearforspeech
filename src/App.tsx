import React, { useState, useEffect, useRef } from 'react';
import { create } from 'zustand';
import { 
  Mic, Square, BarChart3, Trash2, Download, Upload, Play, Pause, 
  Shield, Activity, Check, Edit3, X, AlertCircle 
} from 'lucide-react';
import Dexie, { type Table } from 'dexie';

// --- 1. Database Setup ---
interface SessionLog {
  id?: number;
  date: string;
  rating: number; // 1-5 clarity rating
  notes: string;
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
    this.version(2).stores({
      logs: '++id, date, rating, notes',
      recordings: '++id, date, name'
    });
  }
}

const db = new HearForSpeechDB();

// --- 2. Global State via Zustand ---
interface AppState {
  activeTab: 'visualizer' | 'tracker' | 'export';
  setActiveTab: (tab: 'visualizer' | 'tracker' | 'export') => void;
}

const useStore = create<AppState>((set) => ({
  activeTab: 'visualizer',
  setActiveTab: (tab) => set({ activeTab: tab }),
}));

// --- 3. Main Layout ---
export default function App() {
  const { activeTab, setActiveTab } = useStore();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased font-sans">
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
            <p className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">Acoustic Biofeedback</p>
          </div>
        </div>
        
        {/* Privacy Badge */}
        <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full text-emerald-400 text-xs font-semibold">
          <Shield size={13} />
          <span>Local-First</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-lg w-full mx-auto p-4 pb-28 flex flex-col justify-start overflow-y-auto">
        {activeTab === 'visualizer' && <VisualizerTab />}
        {activeTab === 'tracker' && <TrackerTab />}
        {activeTab === 'export' && <ExportTab />}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-slate-950/95 backdrop-blur-lg border-t border-slate-855 flex justify-around p-2.5 z-50 rounded-t-2xl shadow-2xl">
        <NavButton 
          tab="visualizer" 
          icon={<Mic size={20} />} 
          label="Record" 
          currentTab={activeTab} 
          onClick={setActiveTab} 
        />
        <NavButton 
          tab="tracker" 
          icon={<BarChart3 size={20} />} 
          label="Tracker" 
          currentTab={activeTab} 
          onClick={setActiveTab} 
        />
        <NavButton 
          tab="export" 
          icon={<Download size={20} />} 
          label="Data Exchange" 
          currentTab={activeTab} 
          onClick={setActiveTab} 
        />
      </nav>
    </div>
  );
}

// --- Navigation Button Component ---
interface NavButtonProps {
  tab: 'visualizer' | 'tracker' | 'export';
  icon: React.ReactNode;
  label: string;
  currentTab: 'visualizer' | 'tracker' | 'export';
  onClick: (tab: 'visualizer' | 'tracker' | 'export') => void;
}

function NavButton({ tab, icon, label, currentTab, onClick }: NavButtonProps) {
  const isActive = currentTab === tab;
  return (
    <button 
      onClick={() => onClick(tab)} 
      className={`relative flex-1 py-2.5 flex flex-col items-center justify-center rounded-xl transition-all duration-300 ${
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

// --- TAB 1: VisualizerTab (Mic, Canvas Biofeedback) ---
function VisualizerTab() {
  const [isRecording, setIsRecording] = useState(false);
  const [savedRecordings, setSavedRecordings] = useState<Recording[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<number | null>(null);
  
  // Inline editing state for recording name
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  // Refs for Web Audio API & MediaRecorder
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  const loadRecordings = async () => {
    const recs = await db.recordings.toArray();
    setSavedRecordings(recs);
  };

  // Drawing the Standby Sine Waves
  const drawStandby = () => {
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
      phase += 0.03;
      animationRef.current = window.requestAnimationFrame(draw);
    };
    draw();
  };

  // Drawing the Active Audio Waves
  const drawActive = (analyser: AnalyserNode) => {
    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      analyser.getByteTimeDomainData(dataArray);

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
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);

        x += sliceWidth;
      }

      ctx.lineTo(width, height / 2);
      ctx.stroke();

      animationRef.current = window.requestAnimationFrame(draw);
    };
    draw();
  };

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
    };
  }, []);

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
      analyser.fftSize = 512;
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
        await db.recordings.add({ 
          date: dateStr, 
          audio: blob, 
          name: `Speech Session - ${dateStr}` 
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

  return (
    <div className="space-y-6">
      {/* Visualizer Canvas Area */}
      <div className="relative bg-slate-800 rounded-3xl overflow-hidden border border-slate-700 shadow-xl shadow-slate-950/50">
        <canvas 
          ref={canvasRef} 
          width={400} 
          height={160} 
          className="w-full h-40 block"
        />
        
        {/* Status overlay */}
        <div className="absolute top-4 left-4 flex items-center gap-2">
          {isRecording ? (
            <>
              <span className="flex h-3.5 w-3.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
              </span>
              <span className="text-xs font-semibold text-red-400 tracking-wider uppercase">Recording</span>
            </>
          ) : (
            <>
              <span className="h-3 w-3 rounded-full bg-indigo-500/70"></span>
              <span className="text-xs font-semibold text-indigo-400 tracking-wider uppercase">Standby</span>
            </>
          )}
        </div>

        {/* Monospace Timer Overlay */}
        <div className="absolute bottom-4 right-4 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-xl border border-slate-805">
          <span className="font-mono text-sm font-bold text-indigo-300">
            {formatTime(seconds)}
          </span>
        </div>
      </div>

      {/* Primary Record Button Trigger */}
      <div className="flex justify-center">
        {!isRecording ? (
          <button 
            onClick={startRecording} 
            className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-600 hover:to-pink-600 text-white font-bold py-5 px-8 rounded-2xl shadow-xl shadow-indigo-500/10 active:scale-98 transition-all duration-300"
          >
            <Mic size={24} className="animate-pulse" />
            <span className="text-base tracking-wide">Start Biofeedback Session</span>
          </button>
        ) : (
          <button 
            onClick={stopRecording} 
            className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-rose-500 to-red-650 hover:from-rose-600 hover:to-red-700 text-white font-bold py-5 px-8 rounded-2xl shadow-xl shadow-red-500/15 active:scale-98 transition-all duration-300 animate-pulse"
          >
            <Square size={20} />
            <span className="text-base tracking-wide">Stop & Save Session</span>
          </button>
        )}
      </div>

      {/* Saved Audio List Section */}
      <div className="space-y-3">
        <h3 className="font-bold text-sm text-slate-400 tracking-widest uppercase flex items-center gap-2">
          <span>Audio History</span>
          <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full text-xs font-semibold">
            {savedRecordings.length}
          </span>
        </h3>
        
        {savedRecordings.length === 0 ? (
          <div className="bg-slate-850/40 border border-dashed border-slate-800 p-8 rounded-2xl text-center">
            <Mic className="mx-auto text-slate-600 mb-2" size={32} />
            <p className="text-sm text-slate-500">No session recordings saved yet.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {savedRecordings.map((rec) => (
              <div 
                key={rec.id} 
                className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-2xl flex items-center justify-between gap-3 hover:border-slate-600 transition-all duration-300 shadow-md"
              >
                {/* Audio Item Info */}
                <div className="flex-1 min-w-0">
                  {editingId === rec.id ? (
                    <div className="flex items-center gap-1.5">
                      <input 
                        type="text" 
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm font-semibold text-white focus:outline-none focus:border-indigo-500 w-full"
                        autoFocus
                      />
                      <button 
                        onClick={() => saveName(rec.id!)} 
                        className="p-1 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white"
                      >
                        <Check size={16} />
                      </button>
                      <button 
                        onClick={() => setEditingId(null)} 
                        className="p-1 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300"
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
                        className="text-slate-500 hover:text-indigo-400 p-0.5 rounded transition"
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
                    className={`h-9 w-9 rounded-full flex items-center justify-center transition-all ${
                      currentlyPlayingId === rec.id 
                        ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 animate-pulse' 
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                    }`}
                  >
                    {currentlyPlayingId === rec.id ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                  </button>
                  <button 
                    onClick={() => deleteRecording(rec.id!)} 
                    className="h-9 w-9 rounded-full bg-slate-900/60 hover:bg-rose-500/20 hover:text-rose-400 border border-transparent hover:border-rose-500/30 text-slate-500 flex items-center justify-center transition"
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

// --- TAB 2: TrackerTab (Session Log Form and Ratings) ---
function TrackerTab() {
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [rating, setRating] = useState<number>(3); // Default clear rating
  const [notes, setNotes] = useState('');

  useEffect(() => {
    db.logs.toArray().then(setLogs);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const dateStr = new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    
    await db.logs.add({
      date: dateStr,
      rating,
      notes: notes.trim()
    });

    // Reset Form
    setRating(3);
    setNotes('');
    
    // Refresh List
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
      { text: "Difficult", styles: "bg-rose-500/10 border-rose-500/20 text-rose-400" },
      { text: "Needs Work", styles: "bg-orange-500/10 border-orange-500/20 text-orange-400" },
      { text: "Moderate", styles: "bg-amber-500/10 border-amber-500/20 text-amber-400" },
      { text: "Good Clarity", styles: "bg-green-500/10 border-green-500/20 text-green-400" },
      { text: "Excellent", styles: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" }
    ];
    return badges[val - 1] || { text: "Unknown", styles: "bg-slate-500/10 border-slate-500/20 text-slate-400" };
  };

  return (
    <div className="space-y-6">
      {/* Log Form */}
      <form onSubmit={handleSave} className="bg-slate-800 border border-slate-700/80 p-6 rounded-3xl shadow-xl space-y-5">
        <h3 className="font-extrabold text-base text-slate-100 tracking-tight border-b border-slate-700/50 pb-3 flex items-center gap-2">
          <Activity size={18} className="text-indigo-400" />
          <span>New Session Assessment</span>
        </h3>

        {/* Rating Select (1-5 glowing options) */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-400 tracking-widest uppercase">
            Speech Clarity Rating:
          </label>
          <div className="flex justify-between gap-2 pt-1">
            {[1, 2, 3, 4, 5].map((num) => {
              const isSelected = rating === num;
              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => setRating(num)}
                  className={`h-11 w-11 rounded-xl flex items-center justify-center font-bold text-sm border transition-all duration-300 ${
                    isSelected
                      ? 'bg-gradient-to-br from-indigo-500 to-purple-655 text-white border-transparent scale-110 shadow-lg shadow-indigo-500/20'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {num}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 px-1 pt-1 font-semibold">
            <span>DIFFICULT (1)</span>
            <span>EXCELLENT (5)</span>
          </div>
        </div>

        {/* Notes Area */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-400 tracking-widest uppercase">
            Clinical Observations:
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add details on target phonemes, error patterns, or therapy prompts..."
            rows={3}
            className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 focus:outline-none p-3.5 rounded-2xl text-sm text-slate-200 placeholder-slate-650 transition-all"
          />
        </div>

        <button 
          type="submit" 
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-indigo-600/10 transition-all duration-300"
        >
          Save Assessment Log
        </button>
      </form>

      {/* Log Feed */}
      <div className="space-y-3">
        <h3 className="font-bold text-sm text-slate-400 tracking-widest uppercase flex items-center gap-2">
          <span>Assessment History</span>
          <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full text-xs font-semibold">
            {logs.length}
          </span>
        </h3>

        {logs.length === 0 ? (
          <div className="bg-slate-855/40 border border-dashed border-slate-800 p-8 rounded-2xl text-center">
            <BarChart3 className="mx-auto text-slate-600 mb-2" size={32} />
            <p className="text-sm text-slate-500">No session metrics recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
            {logs.map((log) => {
              const badge = getRatingBadge(log.rating);
              return (
                <div 
                  key={log.id} 
                  className="bg-slate-800/60 border border-slate-700/60 p-4 rounded-2xl space-y-2 shadow hover:border-slate-600 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 font-semibold">{log.date}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${badge.styles}`}>
                        {badge.text}
                      </span>
                      <button 
                        onClick={() => handleDeleteLog(log.id!)}
                        className="text-slate-600 hover:text-rose-400 p-0.5 transition"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  {log.notes && (
                    <p className="text-sm text-slate-300 leading-relaxed bg-slate-900/40 p-2.5 rounded-xl border border-slate-808/80 font-normal">
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

// --- TAB 3: ExportTab (JSON Backup/Exchange) ---
function ExportTab() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [stats, setStats] = useState({ logsCount: 0, recordingsCount: 0 });

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

  const base64ToBlob = (base64DataUrl: string): Blob => {
    const parts = base64DataUrl.split(',');
    const header = parts[0];
    const data = parts[1];
    const mime = header.match(/:(.*?);/)?.[1] || 'audio/webm';
    
    const byteString = atob(data);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mime });
  };

  useEffect(() => {
    let active = true;
    Promise.all([db.logs.count(), db.recordings.count()]).then(([logsCount, recordingsCount]) => {
      if (active) {
        setStats({ logsCount, recordingsCount });
      }
    }).catch(console.error);
    return () => {
      active = false;
    };
  }, []);

  const handleExport = async () => {
    try {
      const logs = await db.logs.toArray();
      const recordings = await db.recordings.toArray();

      // Convert each audio blob into base64 to include in JSON
      const serializedRecordings = await Promise.all(
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

      const payload = {
        appName: "HearForSpeech",
        exportedAt: new Date().toISOString(),
        data: {
          logs,
          recordings: serializedRecordings
        }
      };

      const jsonBlob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(jsonBlob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `hearforspeech_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Database export failed', err);
      alert('Data export failed. See browser console.');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const proceed = confirm(
      "WARNING: Importing this file will overwrite all current data. Are you sure you wish to continue?"
    );
    if (!proceed) return;

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          const parsed = JSON.parse(content);

          if (parsed.appName !== "HearForSpeech" || !parsed.data) {
            throw new Error("Incorrect application backup format.");
          }

          const { logs, recordings } = parsed.data;

          if (!Array.isArray(logs) || !Array.isArray(recordings)) {
            throw new Error("Corrupted logs or recordings structure.");
          }

          // Clear & Overwrite database
          await db.transaction('rw', [db.logs, db.recordings], async () => {
            await db.logs.clear();
            await db.recordings.clear();

            for (const log of logs) {
              await db.logs.add({
                date: log.date,
                rating: log.rating,
                notes: log.notes
              });
            }

            for (const rec of recordings) {
              const audioBlob = base64ToBlob(rec.audioBase64);
              await db.recordings.add({
                date: rec.date,
                audio: audioBlob,
                name: rec.name
              });
            }
          });

          alert("Data successfully restored!");
          loadStats();
          // Reload page to re-render all tabs with imported data
          window.location.reload();
        } catch (err: unknown) {
          console.error(err);
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

  return (
    <div className="space-y-6">
      {/* Clinician Data Exchange Explanation */}
      <div className="bg-slate-800 border border-slate-700/80 p-6 rounded-3xl shadow-xl space-y-4">
        <h3 className="font-extrabold text-base text-slate-100 tracking-tight flex items-center gap-2">
          <Shield size={18} className="text-emerald-400" />
          <span>Patient-Mediated Exchange</span>
        </h3>
        
        <p className="text-xs text-slate-400 leading-relaxed font-normal">
          Consistent with our strict privacy protocol, no database values or voice prints leave this device. 
          Patients can use this panel to secure, export, or transition their entire clinical progress log.
        </p>

        {/* Local DB Metrics */}
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

      {/* Control Buttons Panel */}
      <div className="space-y-3">
        {/* Export JSON Button */}
        <button
          onClick={handleExport}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-600/10 transition-all active:scale-99"
        >
          <Download size={18} />
          <span>Export Backup JSON</span>
        </button>

        {/* Import JSON Button */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImport}
          accept=".json"
          className="hidden"
        />
        
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-4 rounded-2xl border border-slate-700 transition-all active:scale-99"
        >
          <Upload size={18} />
          <span>Import Backup JSON</span>
        </button>

        {/* Danger Zone Wipe */}
        <div className="pt-4 border-t border-slate-800">
          <button
            onClick={handleClearDatabase}
            className="w-full flex items-center justify-center gap-2 bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/20 hover:border-rose-500/40 text-rose-400 font-semibold py-3.5 rounded-2xl text-xs transition"
          >
            <AlertCircle size={15} />
            <span>Reset Local Database</span>
          </button>
        </div>
      </div>
    </div>
  );
}
