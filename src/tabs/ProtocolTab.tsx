import { useState, useEffect } from 'react';
import { Activity, BarChart3, Brain, Sparkles, ChevronDown, ChevronUp, Cpu } from 'lucide-react';
import { useStore } from '../store/useStore';

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

const ARIZONA_PHONEMES = ['/r/', '/s/', '/z/', '/l/', '/th/', '/sh/', '/ch/', '/zh/'];

export function ProtocolTab() {
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
2. Two draft measurable SMART IEP goals (one phonetic articulation targets, one intelligibility repair targets).
3. Clinical repair strategy recommendations.
    `.trim();

    const globalWindow = window as unknown as WindowWithAI;
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

    // Fallsback clinical rules-engine template
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
        <h3 className="font-extrabold text-base text-slate-100 tracking-tight flex items-center gap-2 border-b border-slate-700/50 pb-2 text-left">
          <Activity size={18} className="text-indigo-400" />
          <span>Adolescent Intake Alignment</span>
        </h3>
        
        <p className="text-[11px] text-slate-400 leading-relaxed text-left">
          Establish adolescent autonomy and a collaborative consultant relationship. Use professional, technical terminology.
        </p>

        <div className="space-y-2.5">
          <label className="flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-750 rounded-2xl cursor-pointer min-h-[48px] text-left">
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

          <label className="flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-750 rounded-2xl cursor-pointer min-h-[48px] text-left">
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

          <label className="flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-750 rounded-2xl cursor-pointer min-h-[48px] text-left">
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
        <div className="space-y-1.5 pt-1 text-left">
          <label className="block text-[10px] font-extrabold text-slate-500 tracking-wider uppercase">
            Collaborative Treatment Targets:
          </label>
          <textarea
            value={intakeGoals}
            onChange={(e) => setIntakeGoals(e.target.value)}
            placeholder="Outline student-selected targets and personal speech objectives..."
            rows={2}
            className="w-full bg-slate-900 border border-slate-700/80 focus:border-indigo-500 focus:outline-none p-3 rounded-2xl text-xs text-slate-200 placeholder-slate-600 transition-all text-left"
          />
        </div>
      </div>

      {/* 2. Diagnostic & Assessment Matrix */}
      <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
        <h3 className="font-extrabold text-base text-slate-100 tracking-tight flex items-center gap-2 border-b border-slate-700/50 pb-2 text-left">
          <BarChart3 size={18} className="text-purple-400" />
          <span>Diagnostic Assessment Matrix</span>
        </h3>

        {/* Arizona Late 8 Checklist */}
        <div className="space-y-2 text-left">
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
                      : 'bg-slate-900 border-slate-700 text-slate-450 hover:border-slate-600'
                  }`}
                >
                  {sound}
                </button>
              );
            })}
          </div>
        </div>

        {/* SIT Score Calculator */}
        <div className="space-y-2.5 pt-2 border-t border-slate-750 text-left">
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
        <div className="space-y-2 pt-2 border-t border-slate-750 text-left">
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

        <p className="text-[11px] text-slate-400 leading-relaxed font-normal text-left">
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
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-650 hover:from-purple-700 hover:to-indigo-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-600/10 transition disabled:opacity-50 min-h-[48px]"
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
        <div className="border-t border-slate-750/80 pt-3 text-left">
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
              <ol className="list-decimal list-inside space-y-1.5 font-normal">
                <li>Go to URL <code className="bg-slate-950 text-indigo-400 px-1 py-0.5 rounded font-mono select-all">chrome://flags/#optimization-guide-on-device-model</code> and select <strong className="text-slate-200">Enabled BypassPrefRequirement</strong>.</li>
                <li>Go to URL <code className="bg-slate-950 text-indigo-400 px-1 py-0.5 rounded font-mono select-all">chrome://flags/#prompt-api-for-gemini-nano</code> and select <strong className="text-slate-200">Enabled</strong>.</li>
                <li>Restart Chrome, open developer tools, and wait a moment for the background model to download.</li>
              </ol>
              <p className="text-[9px] text-slate-505 italic">
                Note: Native execution uses your device's built-in GPU/NPU locally.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
