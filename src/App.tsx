import React, { useState, useEffect, useRef } from 'react';
import { create } from 'zustand';
import Dexie, { type Table } from 'dexie';

// --- 1. Database Setup (Dexie.js) ---
// This acts like a secure, high-capacity database inside the browser
interface SessionLog {
  id?: number;
  date: string;
  rating: number;
  notes: string;
}

class HearForSpeechDB extends Dexie {
  logs!: Table<SessionLog>;
  constructor() {
    super('HearForSpeechDB');
    this.version(1).stores({
      logs: '++id, date, rating, notes'
    });
  }
}
const db = new HearForSpeechDB();

// --- 2. Global State Management (Zustand) ---
// This handles our UI tabs without passing props everywhere
interface AppState {
  activeTab: 'visualizer' | 'tracker' | 'export';
  setActiveTab: (tab: 'visualizer' | 'tracker' | 'export') => void;
}

const useStore = create<AppState>((set) => ({
  activeTab: 'visualizer',
  setActiveTab: (tab) => set({ activeTab: tab }),
}));

// --- 3. Main React Component ---
export default function App() {
  const { activeTab, setActiveTab } = useStore();

  return (
    <div className="h-screen flex flex-col overflow-hidden text-slate-800 bg-slate-50">
      <header className="bg-[#1E3A8A] text-white p-4 shadow-md flex justify-between items-center z-10 shrink-0">
        <h1 className="text-xl font-bold tracking-tight">💬 Hear For Speech</h1>
        <span className="text-xs bg-blue-800 py-1 px-2 rounded font-mono">PWA CORE</span>
      </header>

      <main className="flex-1 overflow-y-auto relative pb-20">
        {activeTab === 'visualizer' && <VisualizerTab />}
        {activeTab === 'tracker' && <TrackerTab />}
        {activeTab === 'export' && <ExportTab />}
      </main>

      <nav className="bg-white border-t border-slate-200 absolute bottom-0 w-full flex justify-around pb-[env(safe-area-inset-bottom,20px)] shrink-0 z-20">
        <NavButton tab="visualizer" icon="📈" label="Visualizer" currentTab={activeTab} onClick={setActiveTab} />
        <NavButton tab="tracker" icon="📝" label="Tracker" currentTab={activeTab} onClick={setActiveTab} />
        <NavButton tab="export" icon="⚙️" label="Export" currentTab={activeTab} onClick={setActiveTab} />
      </nav>
    </div>
  );
}

// --- Navigation Button Component ---
function NavButton({ tab, icon, label, currentTab, onClick }: any) {
  const isActive = currentTab === tab;
  return (
    <button
      onClick={() => onClick(tab)}
      className={`flex-1 py-3 flex flex-col items-center transition ${isActive ? 'text-blue-500 border-t-2 border-blue-500' : 'text-slate-500'}`}
    >
      <span className="text-xl mb-1">{icon}</span>
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

// --- Visualizer Component (React-Optimized) ---
function VisualizerTab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  
  // Audio references needed for cleanup
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>();

  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      
      const analyser = audioCtx.createAnalyser();
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 2048;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const canvas = canvasRef.current;
      const canvasCtx = canvas?.getContext('2d');

      setIsRecording(true);

      const draw = () => {
        if (!canvas || !canvasCtx) return;
        animationRef.current = requestAnimationFrame(draw);
        analyser.getByteTimeDomainData(dataArray);

        // Responsive canvas sizing
        canvas.width = canvas.parentElement?.clientWidth || 300;
        canvas.height = canvas.parentElement?.clientHeight || 250;

        canvasCtx.fillStyle = 'rgb(15, 23, 42)'; // bg-slate-900
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        canvasCtx.lineWidth = 3;
        canvasCtx.strokeStyle = 'rgb(59, 130, 246)'; // bg-blue-500
        canvasCtx.beginPath();

        const sliceWidth = canvas.width * 1.0 / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = v * canvas.height / 2;
          if (i === 0) canvasCtx.moveTo(x, y);
          else canvasCtx.lineTo(x, y);
          x += sliceWidth;
        }

        canvasCtx.lineTo(canvas.width, canvas.height / 2);
        canvasCtx.stroke();
      };

      draw();
    } catch (err) {
      console.error(err);
      alert('Microphone access denied.');
    }
  };

  const stopMic = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (audioCtxRef.current) audioCtxRef.current.close();
    setIsRecording(false);
  };

  // Crucial: Clean up microphone when switching tabs so the "red dot" goes away
  useEffect(() => {
    return () => stopMic();
  }, []);

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="bg-white rounded-xl shadow-md p-4 flex-1 flex flex-col mb-4 border-t-4 border-[#3B82F6]">
        <h2 className="text-lg font-bold text-[#1E3A8A] mb-2">Live Waveform</h2>
        <p className="text-sm text-slate-500 mb-4">Make a sound to see your vocal shape.</p>
        
        <div className="flex-1 bg-slate-900 rounded-lg relative overflow-hidden flex items-center justify-center min-h-[250px]">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full"></canvas>
          
          {!isRecording && (
            <div className="text-center z-10 p-4">
              <div className="text-5xl mb-2">🎙️</div>
              <button onClick={startMic} className="bg-[#3B82F6] text-white font-bold py-2 px-6 rounded-full shadow-lg hover:bg-blue-600 transition">
                Tap to Start Mic
              </button>
            </div>
          )}
        </div>
      </div>
      
      <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
        <h3 className="font-bold text-[#1E3A8A] text-sm">Target: The "R" Sound</h3>
        <p className="text-xs text-slate-600 mt-1">Look for two distinct dips in the middle of the wave. Keep your tongue up and back!</p>
      </div>
    </div>
  );
}

// --- Tracker Component ---
function TrackerTab() {
  const [rating, setRating] = useState('5');
  const [notes, setNotes] = useState('');
  const [logs, setLogs] = useState<SessionLog[]>([]);

  const loadLogs = async () => {
    const allLogs = await db.logs.orderBy('id').reverse().toArray();
    setLogs(allLogs);
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const date = new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    await db.logs.add({
      date,
      rating: parseInt(rating),
      notes
    });
    
    setNotes('');
    loadLogs();
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold text-[#1E3A8A] mb-4">Session Tracker</h2>
      <div className="bg-white rounded-xl shadow-md p-4 mb-6 border-t-4 border-[#14B8A6]">
        <h3 className="font-bold text-slate-700 mb-3">Log New Session</h3>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Intelligibility Rating (1-5)</label>
            <select value={rating} onChange={(e) => setRating(e.target.value)} className="w-full border border-slate-300 rounded p-2 bg-slate-50" required>
              <option value="5">5 - Clear, no repeats needed</option>
              <option value="4">4 - Mostly clear, 1-2 repeats</option>
              <option value="3">3 - Required active listening</option>
              <option value="2">2 - Heavy use of context clues</option>
              <option value="1">1 - Highly difficult to understand</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Environment / Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border border-slate-300 rounded p-2 bg-slate-50" rows={2} placeholder="e.g., Dinner table, lots of background noise..." required />
          </div>
          <button type="submit" className="w-full bg-[#14B8A6] text-white font-bold py-2 px-4 rounded shadow hover:bg-teal-600 transition">
            Save securely to IndexedDB
          </button>
        </form>
      </div>

      <h3 className="font-bold text-slate-700 mb-2">Recent Logs ({logs.length})</h3>
      <div className="space-y-3 pb-8">
        {logs.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No logs yet.</p>
        ) : (
          logs.map(log => (
            <div key={log.id} className="bg-white p-3 rounded shadow-sm border-l-4 border-[#14B8A6] text-sm">
              <div className="flex justify-between text-slate-500 text-xs mb-1">
                <span>{log.date}</span>
                <span className="font-bold text-[#14B8A6]">Rating: {log.rating}/5</span>
              </div>
              <p className="text-slate-700">{log.notes}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// --- Export & Settings Component ---
function ExportTab() {
  const [patientId, setPatientId] = useState(localStorage.getItem('hfs_pid') || '');

  const savePatientId = (val: string) => {
    setPatientId(val);
    localStorage.setItem('hfs_pid', val);
  };

  const exportData = async () => {
    const logs = await db.logs.toArray();
    if (logs.length === 0) return alert("No logs to export.");

    let report = `HEAR FOR SPEECH - CLINICAL EXPORT\nPatient ID: ${patientId || 'Anonymous'}\nGenerated: ${new Date().toLocaleDateString()}\n-----------------------------------\n\n`;
    logs.forEach((log) => {
      report += `Date: ${log.date}\nRating: ${log.rating}/5\nNotes: ${log.notes}\n-----------------------------------\n`;
    });

    if (navigator.share) {
      navigator.share({ title: `Speech Export`, text: report }).catch(console.error);
    } else {
      const blob = new Blob([report], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Speech_Export_${patientId || 'Anon'}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const clearData = async () => {
    if (confirm("Permanently erase all local logs?")) {
      await db.logs.clear();
      alert("Database wiped.");
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold text-[#1E3A8A] mb-4">Export to SLP</h2>
      <div className="bg-white rounded-xl shadow-md p-4 mb-6 border-t-4 border-[#F97316]">
        <p className="text-sm text-slate-600 mb-4">
          Your data never leaves this device. Generate an anonymous report to share.
        </p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-600 mb-1">Your Anonymous Patient ID</label>
          <input type="text" value={patientId} onChange={(e) => savePatientId(e.target.value)} className="w-full border border-slate-300 rounded p-2 bg-slate-50" placeholder="e.g., 402-A" />
        </div>
        <button onClick={exportData} className="w-full bg-[#F97316] text-white font-bold py-3 px-4 rounded shadow-lg flex justify-center items-center gap-2 hover:bg-orange-600 transition">
          <span>📥</span> Generate & Share Report
        </button>
      </div>
      <div className="text-center mt-8">
        <button onClick={clearData} className="text-red-500 text-sm font-bold underline">Erase All Local Data</button>
      </div>
    </div>
  );
}