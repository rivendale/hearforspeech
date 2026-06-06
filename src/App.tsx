import React, { useState, useEffect, useRef } from 'react';
import { create } from 'zustand';
import { Mic, BarChart3, Trash2, Download } from 'lucide-react';

/**
 * NOTE: For this code to run successfully, please ensure you have installed 
 * dexie in your environment: npm install dexie
 */
import Dexie, { type Table } from 'dexie';

// --- 1. Database Setup ---
interface SessionLog { id?: number; date: string; rating: number; notes: string; }
interface Recording { id?: number; date: string; audio: Blob; name: string; }

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

// --- 2. Global State ---
interface AppState {
  activeTab: 'visualizer' | 'tracker' | 'export';
  setActiveTab: (tab: 'visualizer' | 'tracker' | 'export') => void;
}

const useStore = create<AppState>((set) => ({
  activeTab: 'visualizer',
  setActiveTab: (tab) => set({ activeTab: tab }),
}));

// --- 3. Main Component ---
export default function App() {
  const { activeTab, setActiveTab } = useStore();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white shadow-sm p-4 text-center font-bold text-xl text-slate-800">
        💬 Hear For Speech
      </header>

      <main className="flex-1 p-4 overflow-y-auto">
        {activeTab === 'visualizer' && <VisualizerTab />}
        {activeTab === 'tracker' && <TrackerTab />}
        {activeTab === 'export' && <ExportTab />}
      </main>

      <nav className="bg-white border-t flex">
        <NavButton tab="visualizer" icon={<Mic size={20} />} label="Record" currentTab={activeTab} onClick={setActiveTab} />
        <NavButton tab="tracker" icon={<BarChart3 size={20} />} label="Tracker" currentTab={activeTab} onClick={setActiveTab} />
        <NavButton tab="export" icon={<Download size={20} />} label="Export" currentTab={activeTab} onClick={setActiveTab} />
      </nav>
    </div>
  );
}

function NavButton({ tab, icon, label, currentTab, onClick }: any) {
  const isActive = currentTab === tab;
  return (
    <button 
      onClick={() => onClick(tab)} 
      className={`flex-1 py-3 flex flex-col items-center transition ${isActive ? 'text-blue-600 border-t-2 border-blue-600' : 'text-slate-500'}`}
    >
      {icon}
      <span className="text-xs mt-1">{label}</span>
    </button>
  );
}

// --- Tabs ---
function VisualizerTab() {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [savedRecordings, setSavedRecordings] = useState<Recording[]>([]);

  useEffect(() => { loadRecordings(); }, []);

  const loadRecordings = async () => {
    const recs = await db.recordings.toArray();
    setSavedRecordings(recs);
  };

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      await db.recordings.add({ date: new Date().toLocaleTimeString(), audio: blob, name: "Speech Session" });
      loadRecordings();
      stream.getTracks().forEach(t => t.stop());
    };

    mediaRecorder.start();
    setIsRecording(true);
  };

  return (
    <div className="space-y-4">
      {!isRecording ? (
        <button onClick={startRecording} className="w-full bg-blue-600 text-white font-bold py-6 rounded-2xl shadow-lg">
          Start Recording
        </button>
      ) : (
        <button onClick={() => { mediaRecorderRef.current?.stop(); setIsRecording(false); }} className="w-full bg-red-500 text-white font-bold py-6 rounded-2xl shadow-lg">
          Stop & Save
        </button>
      )}

      <h3 className="font-bold text-slate-700">My Recordings</h3>
      {savedRecordings.map(rec => (
        <div key={rec.id} className="bg-white p-4 rounded-xl shadow flex justify-between items-center">
          <span className="text-sm font-medium">{rec.date}</span>
          <audio controls src={URL.createObjectURL(rec.audio)} className="h-8" />
          <button onClick={async () => { await db.recordings.delete(rec.id!); loadRecordings(); }} className="text-red-400">
            <Trash2 size={18} />
          </button>
        </div>
      ))}
    </div>
  );
}

function TrackerTab() {
  const [logs, setLogs] = useState<SessionLog[]>([]);
  useEffect(() => { db.logs.toArray().then(setLogs); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    await db.logs.add({ date: new Date().toLocaleString(), rating: parseInt(form.rating.value), notes: form.notes.value });
    form.reset();
    db.logs.toArray().then(setLogs);
  };

  return (
    <form onSubmit={handleSave} className="bg-white p-6 rounded-xl shadow space-y-4">
      <label className="block">
        Clarity (1-5):
        <input name="rating" type="number" min="1" max="5" className="w-full border p-2 rounded" required />
      </label>
      <label className="block">
        Notes:
        <textarea name="notes" className="w-full border p-2 rounded" />
      </label>
      <button type="submit" className="w-full bg-slate-800 text-white py-2 rounded">Save Log</button>
      <div className="mt-4 space-y-2">
        {logs.map(log => <div key={log.id} className="text-sm border-b pb-1">Rating: {log.rating} - {log.notes}</div>)}
      </div>
    </form>
  );
}

function ExportTab() {
  const exportData = async () => {
    const data = await db.logs.toArray();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'hfs_export.json'; a.click();
  };
  return <button onClick={exportData} className="w-full bg-green-600 text-white py-4 rounded-xl shadow">Export JSON Data</button>;
}
