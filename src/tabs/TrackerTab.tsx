import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Activity, BarChart3, Trash2 } from 'lucide-react';
import { db, type SessionLog } from '../db/database';
import { useStore } from '../store/useStore';
import { encryptSessionLog, decryptSessionLog } from '../utils/crypto';
import { ProgressChart } from '../components/ProgressChart';

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

export function TrackerTab() {
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
  const words = useMemo(() => sentence.split(' '), [sentence]);

  const toggleWordClarity = (index: number) => {
    setUnclearIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const clearCount = words.length - unclearIndices.length;
  const totalWords = words.length;
  const scorePercent = totalWords > 0 ? Math.round((clearCount / totalWords) * 100) : 100;

  const { masterKey } = useStore();

  const loadLogs = useCallback(async () => {
    try {
      let loadedLogs = await db.logs.toArray();
      if (masterKey) {
        loadedLogs = await Promise.all(
          loadedLogs.map(log => decryptSessionLog(log, masterKey))
        );
      }
      setLogs(loadedLogs);
    } catch (err) {
      console.error("Failed to load logs:", err);
    }
  }, [masterKey]);

  useEffect(() => {
    let active = true;
    db.logs.toArray().then(async (loadedLogs) => {
      let finalLogs = loadedLogs;
      if (masterKey) {
        finalLogs = await Promise.all(
          loadedLogs.map(log => decryptSessionLog(log, masterKey))
        );
      }
      if (active) {
        setLogs(finalLogs);
      }
    }).catch(console.error);
    return () => {
      active = false;
    };
  }, [masterKey]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const dateStr = new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    
    const newLog: SessionLog = {
      date: dateStr,
      rating,
      pcc,
      environment,
      repairStrategies,
      notes: notes.trim(),
      environmentalDifficulty: envDifficulty,
      environmentalNoiseLevel: envDifficulty
    };

    const finalLog = masterKey ? await encryptSessionLog(newLog, masterKey) : newLog;
    await db.logs.add(finalLog);

    // Reset Form States
    setRating(3);
    setPcc(80);
    setEnvironment("Quiet Clinical Space");
    setRepairStrategies([]);
    setNotes('');
    setEnvDifficulty(0);
    
    loadLogs();
  };

  const handleDeleteLog = async (id: number) => {
    if (confirm("Are you sure you want to delete this log entry?")) {
      await db.logs.delete(id);
      loadLogs();
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
                        : 'bg-rose-500/20 border-rose-500/35 text-rose-455 hover:bg-rose-500/30'
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

              const newLog: SessionLog = {
                date: dateStr,
                rating: calcRating,
                pcc: scorePercent,
                environment: "Naïve Listener Assessment",
                repairStrategies: [],
                notes: `[Naïve Listener Assessment] Sentence: "${sentence}". Understood ${clearCount}/${totalWords} words.`,
                environmentalDifficulty: envDifficulty,
                environmentalNoiseLevel: envDifficulty,
                naiveListenerScore: scorePercent
              };

              const finalLog = masterKey ? await encryptSessionLog(newLog, masterKey) : newLog;
              await db.logs.add(finalLog);

              alert(`Assessment committed successfully! Score: ${scorePercent}%`);
              setIsAssessmentMode(false);
              loadLogs();
            }}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-indigo-600/10 transition min-h-[48px] uppercase tracking-wider text-xs"
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
              className="bg-indigo-600 hover:bg-indigo-600 text-white font-bold px-4 py-2 rounded-xl text-[10px] uppercase tracking-wider transition active:scale-95 min-h-[36px]"
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

            {/* Rating Select */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-400 tracking-widest uppercase text-left">
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
                          ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white border-transparent scale-110 shadow-lg shadow-indigo-500/20'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
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

            {/* PCC Range Slider */}
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

            {/* Environment Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-400 tracking-widest uppercase text-left">
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
                      className={`py-2 px-3 rounded-xl border text-[11px] font-bold transition-all duration-200 min-h-[40px] ${
                        isSelected
                          ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-md'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {env}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Environmental Noise Slider */}
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
              <label className="block text-xs font-bold text-slate-400 tracking-widest uppercase text-left">
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
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
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
              <label className="block text-xs font-bold text-slate-400 tracking-widest uppercase text-left">
                Clinical Observations:
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Log phonetic distortions, voicing errors, or therapeutic strategies..."
                rows={3}
                className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 focus:outline-none p-3 rounded-2xl text-sm text-slate-200 placeholder-slate-600 transition-all text-left"
              />
            </div>

            <button 
              type="submit" 
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-indigo-600/10 transition-all duration-300 min-h-[48px] uppercase tracking-wider text-xs"
            >
              Commit Session Analytics
            </button>
            
            <p className="text-[9px] text-slate-500 text-center uppercase tracking-wider font-semibold">
              Zero-Cloud Protocol Active: Data is stored local-first on this device.
            </p>
          </form>
        </>
      )}

      {/* SVG Progress Chart */}
      <ProgressChart logs={logs} />

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
                  className="bg-slate-800/50 border border-slate-700/60 p-4 rounded-3xl space-y-3 shadow hover:border-slate-655 transition text-left"
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
                    <p className="text-xs text-slate-350 leading-relaxed bg-slate-900/50 p-3 rounded-2xl border border-slate-808/80 font-normal">
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
