import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import {
  Activity,
  BarChart3,
  ClipboardList,
  Copy,
  FileText,
  Mic,
  Plus,
  Printer,
  Save,
  Sparkles
} from 'lucide-react';
import {
  db,
  type Assessment,
  type AssessmentItem,
  type ClientProfile,
  type GuidedSession,
  type Recording
} from '../db/database';
import { useStore, type AppTab } from '../store/useStore';
import { encryptRecording } from '../utils/crypto';
import { PrintableHandout, type HandoutSection } from '../components/PrintableHandout';

const ASSESSMENT_INTENT_KEY = 'hfs_assessment_start_intent';
const FOCUS_CLASS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500';
const BIG_BUTTON = `min-h-[56px] rounded-3xl font-black transition active:scale-98 ${FOCUS_CLASS}`;
type IconComponent = ComponentType<{ size?: number; className?: string }>;

const TEEN_READING_PASSAGE = 'The quiet library was full of students working on science projects. Jordan explained the results clearly, then answered questions from the group.';

const SPEECH_OBSERVATION_OPTIONS = [
  'Sound distortion',
  'Sound substitution',
  'Sound omission',
  'Final sounds missing',
  '/r/ concern',
  '/s/ or /z/ concern',
  'Reduced intelligibility',
  'Fast rate',
  'Low volume',
  'Voice/resonance concern',
  'Breaks down in sentences',
  'Better with model'
];

const teenDiagnosticSections: HandoutSection[] = [
  {
    title: 'Patient Reading Page',
    body: [
      'Read this in your regular speaking voice.',
      TEEN_READING_PASSAGE,
      'Then say: red, rain, ring, car, star, bird, teacher, around, green, practice.',
      'Then explain how to play or do something you know well.'
    ].join('\n')
  },
  {
    title: 'SLP Listening Checklist',
    body: [
      '□ Overall intelligibility: clear / partly clear / hard to understand',
      '□ Sound errors: distortion / substitution / omission / inconsistent',
      '□ Word positions: initial / medial / final / blends / vocalic',
      '□ Connected speech: clear in reading / breaks down in explanation / rate affects clarity',
      '□ Cueing response: independent / minimal / moderate / maximal',
      '□ Listener check needed: yes / no',
      '□ Consider formal articulation/intelligibility measure if concerns persist.'
    ].join('\n')
  },
  {
    title: 'Quick Notes',
    body: [
      'What sounds or words were hard?',
      '____________________________________________________________',
      'What helped?',
      '____________________________________________________________',
      'Next step:',
      '____________________________________________________________'
    ].join('\n')
  }
];

const writeAssessmentIntent = (intent: Record<string, string>) => {
  localStorage.setItem(ASSESSMENT_INTENT_KEY, JSON.stringify(intent));
};

const formatDate = (value?: string) => {
  if (!value) return 'No date';
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const latestByDate = <T extends { updatedAt?: string; createdAt?: string; date?: string }>(items: T[]) => (
  [...items].sort((a, b) => (
    new Date(b.updatedAt || b.createdAt || b.date || 0).getTime() -
    new Date(a.updatedAt || a.createdAt || a.date || 0).getTime()
  ))
);

const createId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `hfs-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const initialsFromName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'ST';
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase()).join('');
};

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${secs}`;
};

export function HomeTab() {
  const { setActiveTab, masterKey } = useStore();
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [assessmentItems, setAssessmentItems] = useState<AssessmentItem[]>([]);
  const [sessions, setSessions] = useState<GuidedSession[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [newPatientName, setNewPatientName] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [lastRecordingId, setLastRecordingId] = useState<number | null>(null);
  const [quickStatus, setQuickStatus] = useState('');
  const [speechObservationTags, setSpeechObservationTags] = useState<string[]>([]);
  const [quickNote, setQuickNote] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      db.clients.toArray(),
      db.assessments.toArray(),
      db.assessmentItems.toArray(),
      db.guidedSessions.toArray()
    ]).then(([storedClients, storedAssessments, storedItems, storedSessions]) => {
      if (!isMounted) return;
      const latestClients = latestByDate(storedClients);
      setClients(latestClients);
      setAssessments(latestByDate(storedAssessments));
      setAssessmentItems(storedItems);
      setSessions(latestByDate(storedSessions));
      setSelectedClientId(prev => prev || latestClients[0]?.id || '');
    }).catch(console.error);

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let interval: number | undefined;
    if (isRecording) {
      interval = window.setInterval(() => setRecordingSeconds(prev => prev + 1), 1000);
    }
    return () => {
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [isRecording]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  const selectedClient = useMemo(
    () => clients.find(client => client.id === selectedClientId),
    [clients, selectedClientId]
  );
  const latestAssessment = assessments.find(assessment => assessment.clientId === selectedClient?.id) || assessments[0];
  const latestClient = selectedClient || clients.find(client => client.id === latestAssessment?.clientId) || clients[0];
  const recentClientAssessments = useMemo(
    () => latestClient ? assessments.filter(assessment => assessment.clientId === latestClient.id).slice(0, 2) : [],
    [assessments, latestClient]
  );
  const recentClientSessions = useMemo(
    () => latestClient ? sessions.filter(session => session.clientId === latestClient.id).slice(0, 2) : [],
    [sessions, latestClient]
  );
  const queuedLineCount = useMemo(
    () => assessmentItems.filter(item => (item.recordingIds?.length || 0) > 0 && item.advancedAnalysis?.status !== 'complete').length,
    [assessmentItems]
  );

  const jumpTo = (tab: AppTab) => setActiveTab(tab);
  const startAssessment = (intent: Record<string, string>) => {
    writeAssessmentIntent(intent);
    setActiveTab('assessment');
  };

  const createPatient = async () => {
    const displayName = newPatientName.trim();
    if (!displayName) {
      setQuickStatus('Enter a patient name first.');
      return null;
    }

    const now = new Date().toISOString();
    const client: ClientProfile = {
      id: createId(),
      displayName,
      initials: initialsFromName(displayName),
      ageGroup: 'Teen/adolescent',
      createdAt: now,
      updatedAt: now
    };

    await db.clients.add(client);
    setClients(prev => latestByDate([client, ...prev]));
    setSelectedClientId(client.id);
    setNewPatientName('');
    setQuickStatus(`${displayName} selected.`);
    return client;
  };

  const getOrCreateSelectedClient = async () => {
    if (selectedClient) return selectedClient;
    return createPatient();
  };

  const startQuickRecording = async () => {
    const client = await getOrCreateSelectedClient();
    if (!client) return;

    const consent = window.confirm(
      `Record speech for ${client.displayName}? Confirm appropriate consent. Audio stays local unless exported or uploaded for analysis.`
    );
    if (!consent) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      streamRef.current = stream;
      chunksRef.current = [];

      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const now = new Date();
        const recording: Recording = {
          date: now.toISOString(),
          audio: blob,
          name: `${client.displayName} quick speech sample - ${now.toLocaleString()}`
        };
        const finalRecording = masterKey ? await encryptRecording(recording, masterKey) : recording;
        const recordingId = await db.recordings.add(finalRecording);
        setLastRecordingId(recordingId as number);
        setQuickStatus(`Saved recording for ${client.displayName}. Now mark what you hear.`);
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecording(false);
        setRecordingSeconds(0);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setLastRecordingId(null);
      setQuickStatus(`Recording ${client.displayName}...`);
      setIsRecording(true);
      setRecordingSeconds(0);
    } catch (error) {
      console.error(error);
      setQuickStatus('Microphone could not start. Check browser permission.');
    }
  };

  const stopQuickRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const toggleObservation = (tag: string) => {
    setSpeechObservationTags(prev => (
      prev.includes(tag) ? prev.filter(item => item !== tag) : [...prev, tag]
    ));
  };

  const buildQuickReviewNote = () => {
    const patientLabel = selectedClient?.displayName || newPatientName.trim() || 'Patient';
    return [
      `Quick speech check for ${patientLabel}.`,
      lastRecordingId ? `Recording saved locally: #${lastRecordingId}.` : 'No recording saved yet.',
      `SLP-marked observations: ${speechObservationTags.length ? speechObservationTags.join(', ') : 'none selected yet'}.`,
      quickNote.trim() ? `Notes: ${quickNote.trim()}` : 'Notes: none entered yet.',
      'Consider using the printable 14-year-old intelligibility diagnostic or a formal measure if concerns persist.'
    ].join('\n');
  };

  const saveQuickReview = async () => {
    const client = await getOrCreateSelectedClient();
    if (!client) return;

    const now = new Date().toISOString();
    const quickSession: GuidedSession = {
      id: createId(),
      clientId: client.id,
      date: now,
      setting: 'Quick speech check',
      practiceLevel: 'conversation',
      target: 'Speech intelligibility sample',
      independentAccuracy: 0,
      supportedAccuracy: 0,
      totalTrials: 0,
      cueSummary: 'Unscored quick speech sample.',
      strategies: speechObservationTags,
      note: buildQuickReviewNote(),
      homePractice: 'Review the recording and use the printable diagnostic starter if more detail is needed.',
      createdAt: now
    };
    await db.guidedSessions.add(quickSession);
    setSessions(prev => latestByDate([quickSession, ...prev]));
    setQuickStatus('Quick review note saved locally.');
  };

  const copyQuickReview = async () => {
    await navigator.clipboard.writeText(buildQuickReviewNote());
    setQuickStatus('Quick review copied.');
  };

  return (
    <div className="space-y-4 text-slate-950">
      <section className="relative overflow-hidden rounded-[2rem] border-2 border-sky-200 bg-gradient-to-br from-white via-sky-50 to-amber-50 p-4 sm:p-5 shadow-xl shadow-sky-100/70 text-left">
        <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-sky-300/30 blur-2xl" />
        <div className="absolute -bottom-16 left-10 h-40 w-40 rounded-full bg-amber-200/45 blur-3xl" />
        <div className="relative space-y-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-700">Start here</p>
            <h2 className="mt-1 text-3xl sm:text-4xl font-black tracking-tight text-slate-950 leading-tight">
              Pick patient. Record speech. Mark what you hear.
            </h2>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-700">
              No setup maze. Use this when the SLP just needs a speech sample, a quick observation note, and the next diagnostic step.
            </p>
          </div>

          <div className="rounded-[1.75rem] border border-sky-100 bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-600 text-sm font-black text-white">1</span>
              <h3 className="text-lg font-black text-slate-950">Select patient</h3>
            </div>
            {clients.length > 0 && (
              <select
                value={selectedClientId}
                onChange={event => setSelectedClientId(event.target.value)}
                className={`w-full min-h-[52px] rounded-2xl border border-sky-200 bg-sky-50 p-3 text-base font-black text-slate-950 ${FOCUS_CLASS}`}
                aria-label="Select existing patient"
              >
                {clients.map(client => (
                  <option key={client.id} value={client.id}>{client.displayName}</option>
                ))}
              </select>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
              <input
                value={newPatientName}
                onChange={event => setNewPatientName(event.target.value)}
                placeholder="Or type new patient name"
                className={`min-h-[52px] rounded-2xl border border-sky-200 bg-white p-3 text-base font-semibold text-slate-950 placeholder-slate-400 ${FOCUS_CLASS}`}
              />
              <button
                type="button"
                onClick={createPatient}
                className={`${BIG_BUTTON} bg-sky-600 px-4 text-white`}
              >
                <Plus className="inline-block mr-1" size={18} />
                Add
              </button>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-emerald-100 bg-emerald-50 p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-sm font-black text-white">2</span>
              <h3 className="text-lg font-black text-slate-950">Record speech sample</h3>
            </div>
            <div className="rounded-2xl bg-white border border-emerald-100 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Say this first</p>
              <p className="mt-1 text-base font-black leading-relaxed text-slate-950">{TEEN_READING_PASSAGE}</p>
              <p className="mt-2 text-xs font-semibold text-slate-600">
                Then ask: “Explain how to play or do something you know well.”
              </p>
            </div>
            {!isRecording ? (
              <button
                type="button"
                onClick={startQuickRecording}
                className={`${BIG_BUTTON} w-full min-h-[82px] bg-emerald-600 text-xl text-white shadow-lg shadow-emerald-100`}
              >
                <Mic className="inline-block mr-2" size={24} />
                Start Recording
              </button>
            ) : (
              <button
                type="button"
                onClick={stopQuickRecording}
                className={`${BIG_BUTTON} w-full min-h-[82px] bg-rose-600 text-xl text-white shadow-lg shadow-rose-100`}
              >
                Stop Recording {formatTime(recordingSeconds)}
              </button>
            )}
            <p className="text-xs font-semibold text-slate-700" role="status">{quickStatus || 'Recording saves locally on this device.'}</p>
          </div>

          <div className="rounded-[1.75rem] border border-amber-100 bg-amber-50 p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-sm font-black text-white">3</span>
              <h3 className="text-lg font-black text-slate-950">Mark what you hear</h3>
            </div>
            <p className="text-xs font-semibold leading-relaxed text-slate-700">
              This is intentionally SLP-confirmed. Automatic speech-sound error detection is not treated as a diagnosis.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SPEECH_OBSERVATION_OPTIONS.map(tag => {
                const isSelected = speechObservationTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleObservation(tag)}
                    className={`${BIG_BUTTON} min-h-[54px] px-3 text-left text-xs ${
                      isSelected
                        ? 'bg-amber-500 text-white'
                        : 'bg-white border border-amber-100 text-slate-800'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
            <textarea
              value={quickNote}
              onChange={event => setQuickNote(event.target.value)}
              rows={3}
              placeholder="Quick note: what sounds hard, when speech breaks down, what helped..."
              className={`w-full rounded-2xl border border-amber-200 bg-white p-3 text-sm font-semibold text-slate-950 placeholder-slate-400 ${FOCUS_CLASS}`}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={copyQuickReview}
                className={`${BIG_BUTTON} bg-white border border-slate-200 text-slate-800`}
              >
                <Copy className="inline-block mr-1" size={16} />
                Copy Note
              </button>
              <button
                type="button"
                onClick={saveQuickReview}
                className={`${BIG_BUTTON} bg-slate-950 text-white`}
              >
                <Save className="inline-block mr-1" size={16} />
                Save Note
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border-2 border-indigo-200 bg-white p-4 text-left shadow-lg shadow-indigo-100/70">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-700">Separate printable diagnostic</p>
            <h3 className="text-xl font-black text-slate-950">14-year-old intelligibility starter</h3>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-700">
              Print one page with exactly what to read plus an SLP checklist for sound errors, intelligibility, cueing, and next steps.
            </p>
          </div>
          <FileText className="text-indigo-600 shrink-0" size={24} />
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className={`${BIG_BUTTON} bg-indigo-600 text-white`}
          >
            <Printer className="inline-block mr-1" size={18} />
            Print Diagnostic
          </button>
          <button
            type="button"
            onClick={() => startAssessment({ phase: 'new_student', presetId: 'teen_full' })}
            className={`${BIG_BUTTON} bg-indigo-50 border border-indigo-100 text-indigo-900`}
          >
            Record Full Diagnostic
          </button>
        </div>
        <div className="mt-3 rounded-2xl bg-indigo-50 border border-indigo-100 p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-indigo-700">First reading line</p>
          <p className="mt-1 text-sm font-bold leading-relaxed text-slate-950">{TEEN_READING_PASSAGE}</p>
        </div>
        <PrintableHandout
          title="14-Year-Old Speech Intelligibility Starter"
          studentName={selectedClient?.displayName || newPatientName.trim() || 'Student'}
          subtitle="Read-aloud prompts and SLP checklist for a first speech clarity screen."
          sections={teenDiagnosticSections}
          footerNote="This printable supports SLP judgment. It does not diagnose or replace formal assessment when needed."
        />
      </section>

      <details className="rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-lg shadow-slate-100">
        <summary className="cursor-pointer text-base font-black text-slate-950">
          More tools if needed
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-2">
          <QuickAction title="Therapy Session" detail="Trials, cueing, session note, home practice." icon={Activity} onClick={() => jumpTo('session')} />
          <QuickAction title="Data / Review" detail="Progress, old sessions, exports, and data." icon={BarChart3} onClick={() => jumpTo('tracker')} />
          <QuickAction title="Advanced Diagnostic Portal" detail="Longer line-by-line assessment packs and listener checks." icon={ClipboardList} onClick={() => startAssessment({ phase: 'patient_choice' })} />
        </div>
      </details>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-lg shadow-slate-100">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Patient timeline</p>
            <h3 className="text-lg font-black text-slate-950">Latest work</h3>
          </div>
          <Sparkles className="text-slate-500" size={22} />
        </div>

        {latestClient ? (
          <div className="mt-3 space-y-2">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-base font-black text-slate-950">{latestClient.displayName}</p>
              <p className="mt-1 text-xs text-slate-600">{latestClient.ageGroup || 'Saved patient'} · {recentClientSessions.length} recent sessions · {recentClientAssessments.length} diagnostics</p>
            </div>
            {latestAssessment && (
              <TimelineRow
                title={latestAssessment.status === 'completed' ? 'Last assessment completed' : 'Assessment draft in progress'}
                detail={`${formatDate(latestAssessment.updatedAt)} · ${latestAssessment.primaryConcern || 'Speech clarity assessment'}`}
                action="Open"
                onClick={() => {
                  writeAssessmentIntent({ phase: 'load_student', clientId: latestAssessment.clientId, assessmentId: latestAssessment.id });
                  setActiveTab('assessment');
                }}
              />
            )}
            <TimelineRow
              title={queuedLineCount > 0 ? 'Analysis queue has recordings' : 'Ready for next recording'}
              detail={queuedLineCount > 0 ? `${queuedLineCount} recording(s) need review.` : 'Use the big Record button above.'}
              action={queuedLineCount > 0 ? 'Review' : 'Record'}
              onClick={() => document.querySelector('.hfs-app-main')?.scrollTo({ top: 0, behavior: 'smooth' })}
            />
          </div>
        ) : (
          <div className="mt-3 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
            No patients yet. Type a patient name above and tap <strong>Add</strong>.
          </div>
        )}
      </section>
    </div>
  );
}

function QuickAction({
  title,
  detail,
  icon: Icon,
  onClick
}: {
  title: string;
  detail: string;
  icon: IconComponent;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[72px] items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-white active:scale-98 ${FOCUS_CLASS}`}
    >
      <span className="rounded-2xl bg-white p-2 text-sky-700 shadow-sm">
        <Icon size={20} />
      </span>
      <span>
        <span className="block text-sm font-black text-slate-950">{title}</span>
        <span className="block text-xs leading-relaxed text-slate-600">{detail}</span>
      </span>
    </button>
  );
}

function TimelineRow({
  title,
  detail,
  action,
  onClick
}: {
  title: string;
  detail: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-3 text-left transition hover:border-sky-200 active:scale-98 ${FOCUS_CLASS}`}
    >
      <span>
        <span className="block text-sm font-black text-slate-950">{title}</span>
        <span className="mt-1 block text-xs text-slate-600">{detail}</span>
      </span>
      <span className="rounded-2xl bg-sky-100 px-3 py-2 text-xs font-black text-sky-800">{action}</span>
    </button>
  );
}
