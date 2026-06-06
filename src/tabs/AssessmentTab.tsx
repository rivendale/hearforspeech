import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  Ear,
  FileText,
  Mic,
  PauseCircle,
  Save,
  Sparkles,
  Square,
  Target,
  UserPlus
} from 'lucide-react';
import {
  db,
  type Assessment,
  type AssessmentItem,
  type AssessmentItemKind,
  type ClientProfile,
  type CueLevel,
  type Recording
} from '../db/database';
import { useStore } from '../store/useStore';
import { encryptRecording } from '../utils/crypto';

type TemplateItem = Omit<AssessmentItem, 'id' | 'assessmentId' | 'status' | 'createdAt' | 'updatedAt' | 'recordingIds'>;

const FOCUS_CLASS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300';
const BUTTON_CLASS = `min-h-[48px] rounded-2xl font-extrabold transition active:scale-98 ${FOCUS_CLASS}`;

const CUE_LEVELS: { value: CueLevel; label: string }[] = [
  { value: 'independent', label: 'Independent' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'maximal', label: 'Maximal' }
];

const SECTION_ORDER = [
  'consent',
  'history',
  'screening',
  'speech_sample',
  'sound_probes',
  'reading',
  'stimulability',
  'listener',
  'summary'
];

const ASSESSMENT_TEMPLATE: TemplateItem[] = [
  {
    sectionKey: 'consent',
    sectionTitle: 'Consent & Orientation',
    prompt: 'Confirm recording consent and explain that this is a speech clarity assessment, not a pass/fail test.',
    helperText: 'Say: “I’m going to ask you to talk, read, and try a few sounds. This helps me understand what is easy and what needs support.”',
    kind: 'checklist',
    sortOrder: 10
  },
  {
    sectionKey: 'consent',
    sectionTitle: 'Consent & Orientation',
    prompt: 'Ask the student what name/pronouns they want used in notes and practice materials.',
    helperText: 'Keep this teen-respectful and quick. Add details only if clinically useful.',
    kind: 'question',
    sortOrder: 20
  },
  {
    sectionKey: 'history',
    sectionTitle: 'Quick Case History',
    prompt: 'Primary concern: When is the student hardest to understand?',
    helperText: 'Class discussion, friends, phone/video, presentations, noisy spaces, unfamiliar listeners.',
    kind: 'question',
    sortOrder: 30
  },
  {
    sectionKey: 'history',
    sectionTitle: 'Quick Case History',
    prompt: 'Student self-rating: “How easy is it for people to understand you at school?”',
    helperText: 'Use 1–5 or a short note. Ask what situations feel easiest and hardest.',
    kind: 'question',
    sortOrder: 40
  },
  {
    sectionKey: 'screening',
    sectionTitle: 'Screening Checklist',
    prompt: 'Hearing access check: note recent hearing concerns, screenings, or referral needs.',
    helperText: 'Do not diagnose hearing status in this app; document whether follow-up is needed.',
    kind: 'checklist',
    sortOrder: 50
  },
  {
    sectionKey: 'screening',
    sectionTitle: 'Screening Checklist',
    prompt: 'Oral-mechanism observation: face, lips, jaw, tongue movement, dentition, resonance, and voice quality.',
    helperText: 'Use as a quick clinical checklist and note only observable findings.',
    kind: 'checklist',
    sortOrder: 60
  },
  {
    sectionKey: 'speech_sample',
    sectionTitle: 'Connected Speech Sample',
    prompt: 'Record: “Tell me about something you are into lately — a game, sport, show, music, or app.”',
    helperText: 'Aim for 45–90 seconds of natural speech. Mark intelligibility, rate, and self-monitoring.',
    kind: 'speech_sample',
    sortOrder: 70
  },
  {
    sectionKey: 'speech_sample',
    sectionTitle: 'Connected Speech Sample',
    prompt: 'Record: “Explain how to play or do something you know well.”',
    helperText: 'This gives sequencing, narrative/expository language, and speech clarity in a real context.',
    kind: 'speech_sample',
    sortOrder: 80
  },
  {
    sectionKey: 'sound_probes',
    sectionTitle: 'Sound Probe',
    prompt: '/r/ probe: red, rain, ring, rabbit, car, star, teacher, around.',
    helperText: 'Score overall pattern and note word positions affected.',
    kind: 'sound_probe',
    sortOrder: 90
  },
  {
    sectionKey: 'sound_probes',
    sectionTitle: 'Sound Probe',
    prompt: '/s, z/ probe: sun, seven, bus, grass, zoo, buzz, music, roses.',
    helperText: 'Listen for frontal/lateral distortions, omissions, and voicing contrasts.',
    kind: 'sound_probe',
    sortOrder: 100
  },
  {
    sectionKey: 'sound_probes',
    sectionTitle: 'Sound Probe',
    prompt: 'Late-8 probe: leaf, thumb, teeth, shoe, fish, chair, watch, measure.',
    helperText: 'Use this as a broad screen, then add notes for sounds needing deeper testing.',
    kind: 'sound_probe',
    sortOrder: 110
  },
  {
    sectionKey: 'reading',
    sectionTitle: 'Reading & Sentence Sample',
    prompt: 'Record reading: “The quiet library was full of students working on science projects. Jordan explained the results clearly, then answered questions from the group.”',
    helperText: 'If reading is not appropriate, use repetition or clinician-read sentence imitation.',
    kind: 'speech_sample',
    sortOrder: 120
  },
  {
    sectionKey: 'reading',
    sectionTitle: 'Reading & Sentence Sample',
    prompt: 'Sentence repetition: “The bright yellow sunshine warmed the quiet playground.”',
    helperText: 'Use as a controlled intelligibility sample with familiar wording.',
    kind: 'speech_sample',
    sortOrder: 130
  },
  {
    sectionKey: 'stimulability',
    sectionTitle: 'Stimulability & Cueing',
    prompt: 'Try the target sound with a model only.',
    helperText: 'Record whether production improves after a single model.',
    kind: 'stimulability',
    sortOrder: 140
  },
  {
    sectionKey: 'stimulability',
    sectionTitle: 'Stimulability & Cueing',
    prompt: 'Try visual/verbal cues, slowed rate, and self-monitoring.',
    helperText: 'Mark the least support that improved clarity.',
    kind: 'stimulability',
    sortOrder: 150
  },
  {
    sectionKey: 'listener',
    sectionTitle: 'Listener Check',
    prompt: 'Optional: ask an unfamiliar listener to rate whether 5–10 words/sentences are clear or unclear.',
    helperText: 'Hide client notes. Record only clear/unclear score, confidence, and item list.',
    kind: 'listener_check',
    sortOrder: 160
  },
  {
    sectionKey: 'summary',
    sectionTitle: 'Analysis Summary',
    prompt: 'Generate and edit the assessment summary.',
    helperText: 'The app summarizes recorded observations. The SLP interprets findings and decides next steps.',
    kind: 'summary',
    sortOrder: 170
  }
];

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

const resultOptionsForKind = (kind: AssessmentItemKind) => {
  switch (kind) {
    case 'sound_probe':
      return ['Clear', 'Distorted', 'Substituted', 'Omitted', 'Not probed'];
    case 'speech_sample':
      return ['Recorded/observed', 'Mostly clear', 'Reduced clarity', 'Functional concern'];
    case 'stimulability':
      return ['Improved with cue', 'Emerging', 'No change observed', 'Not tested'];
    case 'listener_check':
      return ['Clear to listener', 'Partly clear', 'Unclear', 'Not completed'];
    case 'summary':
      return ['Summary drafted', 'Needs review'];
    case 'question':
      return ['Answered', 'Needs follow-up', 'Caregiver input needed'];
    default:
      return ['Complete / WNL', 'Monitor', 'Concern', 'Not observed'];
  }
};

const statusTone = (item: AssessmentItem) => {
  if (item.status === 'complete') return 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300';
  if (item.result || item.notes || item.recordingIds?.length) return 'bg-amber-500/10 border-amber-500/25 text-amber-300';
  return 'bg-slate-900 border-slate-700 text-slate-400';
};

const buildAssessmentDraft = (assessment: Assessment, client: ClientProfile | undefined, items: AssessmentItem[]) => {
  const completedItems = items.filter(item => item.status === 'complete');
  const concernItems = items.filter(item => /concern|distorted|substituted|omitted|unclear|reduced/i.test(`${item.result || ''} ${item.notes || ''}`));
  const probeItems = items.filter(item => item.kind === 'sound_probe');
  const sampleItems = items.filter(item => item.kind === 'speech_sample');
  const cueItems = items.filter(item => item.kind === 'stimulability' && (item.result || item.cueLevel));
  const recordingCount = items.reduce((count, item) => count + (item.recordingIds?.length || 0), 0);
  const probeSummary = probeItems
    .filter(item => item.result)
    .map(item => `${item.prompt.split(':')[0]}: ${item.result}`)
    .join('; ') || 'Sound probes require SLP review.';
  const cueSummary = cueItems
    .map(item => `${item.result || 'Observed'}${item.cueLevel ? ` with ${item.cueLevel} cueing` : ''}`)
    .join('; ') || 'Stimulability/cueing response not yet summarized.';
  const concernSummary = concernItems.length > 0
    ? concernItems.map(item => `${item.sectionTitle}: ${item.prompt}`).slice(0, 5).join(' | ')
    : 'No major concern items were flagged in the checklist; review recordings and clinical notes before finalizing.';

  const summary = [
    `Diagnostic assessment draft for ${client?.displayName || 'student'}${assessment.studentAge ? `, age ${assessment.studentAge}` : ''}.`,
    `Reason/concern: ${assessment.primaryConcern || 'Speech clarity/intelligibility concern noted by clinician or caregiver.'}`,
    `Assessment activities completed: ${completedItems.length}/${items.length} checklist/probe items, ${sampleItems.filter(item => item.recordingIds?.length).length} connected speech samples with audio, and ${recordingCount} total linked recordings.`,
    `Sound probe observations: ${probeSummary}.`,
    `Cueing/stimulability observations: ${cueSummary}.`,
    `Functional/clinical observation flags: ${concernSummary}.`,
    'Clinical interpretation: This draft summarizes local checklist data and recordings. The SLP should review audio, compare findings with standardized or district-required measures when appropriate, and apply clinical judgment before diagnosing or making eligibility/treatment decisions.'
  ].join('\n\n');

  const recommendations = [
    'Consider reviewing connected speech recordings for intelligibility, rate, consistency, and self-monitoring.',
    'Consider completing deeper probes for sounds or contexts flagged as distorted, substituted, omitted, unclear, or functionally concerning.',
    'Consider documenting the least cue level that improved production and whether the student could self-correct.',
    'Consider using Listener Check results only as supporting functional data, not as a standalone diagnostic decision.',
    'Consider sharing plain-language home practice only after the SLP confirms targets and next steps.'
  ].join('\n');

  return { summary, recommendations };
};

export function AssessmentTab() {
  const { masterKey } = useStore();
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [items, setItems] = useState<AssessmentItem[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [activeAssessmentId, setActiveAssessmentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentAge, setStudentAge] = useState('14');
  const [primaryConcern, setPrimaryConcern] = useState('Speech clarity is harder in class, conversation, or with unfamiliar listeners.');
  const [setting, setSetting] = useState('Speech-language evaluation');
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [summaryDraft, setSummaryDraft] = useState('');
  const [recommendationsDraft, setRecommendationsDraft] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [recordingItemId, setRecordingItemId] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const currentClientId = selectedClientId || clients[0]?.id || '';
  const selectedClient = useMemo(
    () => clients.find(client => client.id === currentClientId),
    [clients, currentClientId]
  );
  const clientAssessments = useMemo(
    () => assessments
      .filter(assessment => assessment.clientId === currentClientId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [assessments, currentClientId]
  );
  const activeAssessment = useMemo(
    () => assessments.find(assessment => assessment.id === activeAssessmentId),
    [assessments, activeAssessmentId]
  );
  const activeItems = useMemo(
    () => items
      .filter(item => item.assessmentId === activeAssessmentId)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    [items, activeAssessmentId]
  );
  const currentSectionKey = SECTION_ORDER[sectionIndex];
  const currentSectionItems = useMemo(
    () => activeItems.filter(item => item.sectionKey === currentSectionKey),
    [activeItems, currentSectionKey]
  );
  const completedCount = activeItems.filter(item => item.status === 'complete').length;
  const progressPct = activeItems.length > 0 ? Math.round((completedCount / activeItems.length) * 100) : 0;

  useEffect(() => {
    let active = true;
    Promise.all([
      db.clients.toArray(),
      db.assessments.toArray(),
      db.assessmentItems.toArray()
    ]).then(([storedClients, storedAssessments, storedItems]) => {
      if (!active) return;
      setClients(storedClients.sort((a, b) => a.displayName.localeCompare(b.displayName)));
      setAssessments(storedAssessments);
      setItems(storedItems);
    }).catch(console.error);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let interval: number | undefined;
    if (recordingItemId) {
      interval = window.setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [recordingItemId]);

  const createClientIfNeeded = async () => {
    if (currentClientId) return currentClientId;
    const trimmedName = studentName.trim();
    if (!trimmedName) {
      alert('Add or select a student first.');
      return '';
    }

    const now = new Date().toISOString();
    const client: ClientProfile = {
      id: createId(),
      displayName: trimmedName,
      initials: initialsFromName(trimmedName),
      ageGroup: studentAge ? `${studentAge} years` : 'Adolescent',
      notes: primaryConcern.trim() || undefined,
      createdAt: now,
      updatedAt: now
    };
    await db.clients.add(client);
    setClients(prev => [...prev, client].sort((a, b) => a.displayName.localeCompare(b.displayName)));
    setSelectedClientId(client.id);
    return client.id;
  };

  const startAssessment = async () => {
    if (!consentConfirmed) {
      alert('Confirm assessment and recording consent before starting.');
      return;
    }

    const clientId = await createClientIfNeeded();
    if (!clientId) return;

    const now = new Date().toISOString();
    const assessmentId = createId();
    const assessment: Assessment = {
      id: assessmentId,
      clientId,
      template: 'adolescent_speech_intelligibility',
      studentAge: studentAge ? Number(studentAge) : undefined,
      primaryConcern: primaryConcern.trim() || undefined,
      setting: setting.trim() || undefined,
      consentConfirmed,
      status: 'draft',
      startedAt: now,
      createdAt: now,
      updatedAt: now
    };

    const assessmentItems: AssessmentItem[] = ASSESSMENT_TEMPLATE.map(item => ({
      ...item,
      id: createId(),
      assessmentId,
      status: 'not_started',
      recordingIds: [],
      createdAt: now,
      updatedAt: now
    }));

    await db.transaction('rw', [db.assessments, db.assessmentItems], async () => {
      await db.assessments.add(assessment);
      await db.assessmentItems.bulkAdd(assessmentItems);
    });

    setAssessments(prev => [...prev, assessment]);
    setItems(prev => [...prev, ...assessmentItems]);
    setActiveAssessmentId(assessmentId);
    setSectionIndex(0);
    setSummaryDraft('');
    setRecommendationsDraft('');
  };

  const resumeAssessment = (assessment: Assessment) => {
    setActiveAssessmentId(assessment.id);
    setStudentAge(assessment.studentAge?.toString() || '14');
    setPrimaryConcern(assessment.primaryConcern || '');
    setSetting(assessment.setting || 'Speech-language evaluation');
    setConsentConfirmed(assessment.consentConfirmed);
    const firstIncomplete = items
      .filter(item => item.assessmentId === assessment.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .find(item => item.status !== 'complete');
    const targetSection = firstIncomplete?.sectionKey || 'summary';
    setSectionIndex(Math.max(0, SECTION_ORDER.indexOf(targetSection)));
    setSummaryDraft(assessment.summary || '');
    setRecommendationsDraft(assessment.recommendations || '');
  };

  const updateItem = async (itemId: string, patch: Partial<AssessmentItem>) => {
    const updatedAt = new Date().toISOString();
    await db.assessmentItems.update(itemId, { ...patch, updatedAt });
    setItems(prev => prev.map(item => item.id === itemId ? { ...item, ...patch, updatedAt } : item));
    if (activeAssessmentId) {
      await db.assessments.update(activeAssessmentId, { updatedAt });
      setAssessments(prev => prev.map(assessment => assessment.id === activeAssessmentId ? { ...assessment, updatedAt } : assessment));
    }
  };

  const startRecording = async (item: AssessmentItem) => {
    if (!activeAssessment?.consentConfirmed) {
      alert('Recording consent must be confirmed before saving assessment audio.');
      return;
    }
    if (recordingItemId) {
      alert('Stop the current recording before starting another.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const dateStr = new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
        const recording: Recording = {
          date: dateStr,
          audio: blob,
          name: `Assessment - ${item.sectionTitle} - ${dateStr}`
        };
        const finalRecording = masterKey ? await encryptRecording(recording, masterKey) : recording;
        const recordingId = await db.recordings.add(finalRecording);
        const recordingIds = [...(item.recordingIds || []), recordingId];
        await updateItem(item.id, {
          recordingIds,
          status: item.status === 'not_started' ? 'in_progress' : item.status
        });
        stream.getTracks().forEach(track => track.stop());
        setRecordingItemId(null);
        setRecordingSeconds(0);
      };

      recorder.start();
      setRecordingItemId(item.id);
      setRecordingSeconds(0);
      await updateItem(item.id, { status: 'in_progress' });
    } catch (error) {
      console.error('Assessment recording failed:', error);
      alert('Microphone access is required to record assessment audio.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const generateSummary = () => {
    if (!activeAssessment) return;
    const draft = buildAssessmentDraft(activeAssessment, selectedClient, activeItems);
    setSummaryDraft(draft.summary);
    setRecommendationsDraft(draft.recommendations);
  };

  const saveAssessmentSummary = async (complete: boolean) => {
    if (!activeAssessment) return;
    const now = new Date().toISOString();
    const patch: Partial<Assessment> = {
      summary: summaryDraft,
      recommendations: recommendationsDraft,
      status: complete ? 'completed' : activeAssessment.status,
      completedAt: complete ? now : activeAssessment.completedAt,
      updatedAt: now
    };
    await db.assessments.update(activeAssessment.id, patch);
    setAssessments(prev => prev.map(assessment => assessment.id === activeAssessment.id ? { ...assessment, ...patch } : assessment));
    setSaveStatus(complete ? 'Assessment completed locally.' : 'Assessment draft saved locally.');
    setTimeout(() => setSaveStatus(''), 1800);
  };

  const copySummary = async () => {
    await navigator.clipboard.writeText(`${summaryDraft}\n\nRecommendations / follow-up considerations:\n${recommendationsDraft}`);
    setSaveStatus('Assessment summary copied.');
    setTimeout(() => setSaveStatus(''), 1800);
  };

  const finishAssessment = () => {
    generateSummary();
    setSectionIndex(SECTION_ORDER.length - 1);
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${secs}`;
  };

  if (!activeAssessment) {
    return (
      <div className="space-y-5">
        <section className="bg-gradient-to-br from-cyan-500/20 via-slate-800 to-indigo-500/10 border border-cyan-400/20 p-5 rounded-3xl shadow-xl text-left space-y-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-cyan-200">Start Assessment</p>
          <h2 className="text-2xl font-black tracking-tight text-white">Teen diagnostic guide</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            A line-by-line assessment companion for adolescents: consent, case history, screening, speech samples, sound probes, stimulability, listener check, and editable analysis.
          </p>
        </section>

        <section className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
          <h3 className="font-extrabold text-base text-slate-100 flex items-center gap-2 border-b border-slate-700/60 pb-3">
            <UserPlus className="text-cyan-300" size={18} />
            Student
          </h3>

          {clients.length > 0 && (
            <div className="space-y-2 text-left">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500" htmlFor="assessment-client">
                Select existing student
              </label>
              <select
                id="assessment-client"
                value={currentClientId}
                onChange={event => setSelectedClientId(event.target.value)}
                className={`w-full min-h-[48px] bg-slate-900 border border-slate-700 rounded-2xl p-3 text-sm font-bold text-slate-100 ${FOCUS_CLASS}`}
              >
                {clients.map(client => (
                  <option key={client.id} value={client.id}>{client.displayName}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-2 text-left">
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500" htmlFor="assessment-student-name">
              Or create student
            </label>
            <input
              id="assessment-student-name"
              value={studentName}
              onChange={event => setStudentName(event.target.value)}
              placeholder="Student display name"
              className={`w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 min-h-[48px] text-sm text-slate-100 placeholder-slate-600 ${FOCUS_CLASS}`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-500" htmlFor="assessment-age">
              Age
              <input
                id="assessment-age"
                value={studentAge}
                onChange={event => setStudentAge(event.target.value)}
                inputMode="numeric"
                className={`mt-2 w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 min-h-[48px] text-sm text-slate-100 ${FOCUS_CLASS}`}
              />
            </label>
            <label className="text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-500" htmlFor="assessment-setting">
              Setting
              <input
                id="assessment-setting"
                value={setting}
                onChange={event => setSetting(event.target.value)}
                className={`mt-2 w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 min-h-[48px] text-sm text-slate-100 ${FOCUS_CLASS}`}
              />
            </label>
          </div>

          <label className="block text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-500" htmlFor="assessment-concern">
            Primary concern
          </label>
          <textarea
            id="assessment-concern"
            value={primaryConcern}
            onChange={event => setPrimaryConcern(event.target.value)}
            rows={3}
            className={`w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 text-sm text-slate-100 select-text ${FOCUS_CLASS}`}
          />

          <label className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer text-left ${consentConfirmed ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' : 'bg-slate-900 border-slate-700 text-slate-300'} ${FOCUS_CLASS}`}>
            <input
              type="checkbox"
              checked={consentConfirmed}
              onChange={event => setConsentConfirmed(event.target.checked)}
              className="mt-1 h-4 w-4 accent-emerald-500"
            />
            <span className="text-sm leading-relaxed">
              I have appropriate consent/permission for assessment notes and any voice recordings saved on this device.
            </span>
          </label>

          <button
            type="button"
            onClick={startAssessment}
            className={`${BUTTON_CLASS} w-full bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow-lg shadow-cyan-500/10`}
          >
            Start Guided Assessment
          </button>
        </section>

        {clientAssessments.length > 0 && (
          <section className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-3">
            <h3 className="font-extrabold text-base text-slate-100 flex items-center gap-2 border-b border-slate-700/60 pb-3">
              <ClipboardList className="text-indigo-300" size={18} />
              Recent Assessments
            </h3>
            {clientAssessments.slice(0, 4).map(assessment => (
              <button
                key={assessment.id}
                type="button"
                onClick={() => resumeAssessment(assessment)}
                className={`w-full text-left bg-slate-900 border border-slate-700 p-4 rounded-2xl min-h-[68px] ${FOCUS_CLASS}`}
              >
                <span className="font-extrabold text-sm text-slate-100 block">{assessment.status === 'completed' ? 'Completed' : 'Draft'} diagnostic guide</span>
                <span className="text-[11px] text-slate-500">{new Date(assessment.updatedAt).toLocaleString()} · {assessment.primaryConcern || 'Speech clarity assessment'}</span>
              </button>
            ))}
          </section>
        )}

        <section className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-3xl text-left">
          <p className="text-xs text-indigo-100 leading-relaxed">
            This guide helps the SLP move efficiently through a diagnostic workflow. It does not replace standardized assessment requirements, eligibility rules, differential diagnosis, or clinical judgment.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="bg-gradient-to-br from-cyan-500/15 via-slate-800 to-indigo-500/10 border border-cyan-400/20 p-5 rounded-3xl shadow-xl space-y-4">
        <div className="flex items-start justify-between gap-3 text-left">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-cyan-200">Assessment Guide</p>
            <h2 className="text-xl font-black tracking-tight text-white">{selectedClient?.displayName || 'Student'} · age {activeAssessment.studentAge || '—'}</h2>
            <p className="text-xs text-slate-400 mt-1">{activeAssessment.primaryConcern || 'Speech clarity/intelligibility assessment'}</p>
          </div>
          <button
            type="button"
            onClick={() => setActiveAssessmentId('')}
            className={`${BUTTON_CLASS} bg-slate-900 border border-slate-700 text-slate-300 px-3 text-[10px] uppercase`}
          >
            Close
          </button>
        </div>

        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3">
          <div className="flex justify-between text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">
            <span>{completedCount}/{activeItems.length} lines complete</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-400 to-indigo-500 rounded-full" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {SECTION_ORDER.map((sectionKey, index) => {
            const sectionItems = activeItems.filter(item => item.sectionKey === sectionKey);
            const isDone = sectionItems.length > 0 && sectionItems.every(item => item.status === 'complete');
            return (
              <button
                key={sectionKey}
                type="button"
                onClick={() => setSectionIndex(index)}
                className={`shrink-0 min-h-[42px] px-3 rounded-xl border text-[10px] font-extrabold uppercase ${FOCUS_CLASS} ${
                  sectionIndex === index
                    ? 'bg-cyan-500 text-slate-950 border-cyan-300'
                    : isDone
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                }`}
              >
                {index + 1}. {sectionItems[0]?.sectionTitle || sectionKey}
              </button>
            );
          })}
        </div>
      </section>

      {currentSectionKey === 'summary' ? (
        <section className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
          <h3 className="font-extrabold text-base text-slate-100 flex items-center gap-2 border-b border-slate-700/60 pb-3">
            <FileText className="text-cyan-300" size={18} />
            Analysis Summary
          </h3>
          <button
            type="button"
            onClick={generateSummary}
            className={`${BUTTON_CLASS} w-full bg-slate-900 border border-slate-700 text-slate-200 flex items-center justify-center gap-2`}
          >
            <Sparkles size={16} />
            Generate Editable Assessment Draft
          </button>
          <label className="block text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-500" htmlFor="assessment-summary">
            Diagnostic summary draft
          </label>
          <textarea
            id="assessment-summary"
            value={summaryDraft}
            onChange={event => setSummaryDraft(event.target.value)}
            rows={11}
            className={`w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 text-sm text-slate-100 leading-relaxed select-text ${FOCUS_CLASS}`}
          />
          <label className="block text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-500" htmlFor="assessment-recommendations">
            Recommendations / follow-up considerations
          </label>
          <textarea
            id="assessment-recommendations"
            value={recommendationsDraft}
            onChange={event => setRecommendationsDraft(event.target.value)}
            rows={6}
            className={`w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 text-sm text-slate-100 leading-relaxed select-text ${FOCUS_CLASS}`}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={copySummary}
              className={`${BUTTON_CLASS} bg-slate-900 border border-slate-700 text-slate-200 flex items-center justify-center gap-2`}
            >
              <Copy size={16} />
              Copy
            </button>
            <button
              type="button"
              onClick={() => saveAssessmentSummary(true)}
              className={`${BUTTON_CLASS} bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2`}
            >
              <Save size={16} />
              Complete
            </button>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/25 p-4 rounded-2xl text-left">
            <p className="text-xs text-amber-100 leading-relaxed">
              This is an editable draft based on local checklist entries and recordings. The SLP remains responsible for reviewing audio, selecting formal measures, interpreting results, and writing final diagnostic conclusions.
            </p>
          </div>
        </section>
      ) : (
        <section className="space-y-3">
          {currentSectionItems.map(item => (
            <AssessmentItemCard
              key={item.id}
              item={item}
              isRecording={recordingItemId === item.id}
              recordingLabel={recordingItemId === item.id ? formatTime(recordingSeconds) : ''}
              onResult={(result) => updateItem(item.id, { result, status: 'complete' })}
              onNotes={(notes) => updateItem(item.id, { notes, status: item.status === 'not_started' ? 'in_progress' : item.status })}
              onCue={(cueLevel) => updateItem(item.id, { cueLevel, status: 'in_progress' })}
              onComplete={() => updateItem(item.id, { status: 'complete' })}
              onRecord={() => startRecording(item)}
              onStop={stopRecording}
            />
          ))}
        </section>
      )}

      <section className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setSectionIndex(index => Math.max(0, index - 1))}
          className={`${BUTTON_CLASS} bg-slate-900 border border-slate-700 text-slate-300 flex items-center justify-center gap-2`}
        >
          <ChevronLeft size={16} />
          Back
        </button>
        {sectionIndex < SECTION_ORDER.length - 1 ? (
          <button
            type="button"
            onClick={() => setSectionIndex(index => Math.min(SECTION_ORDER.length - 1, index + 1))}
            className={`${BUTTON_CLASS} bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2`}
          >
            Next
            <ChevronRight size={16} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => saveAssessmentSummary(true)}
            className={`${BUTTON_CLASS} bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2`}
          >
            <CheckCircle2 size={16} />
            Save Complete
          </button>
        )}
      </section>

      {currentSectionKey !== 'summary' && (
        <button
          type="button"
          onClick={finishAssessment}
          className={`${BUTTON_CLASS} w-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 flex items-center justify-center gap-2`}
        >
          <FileText size={16} />
          Jump to Analysis Summary
        </button>
      )}

      {saveStatus && (
        <div className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 rounded-2xl p-3 text-sm font-bold">
          {saveStatus}
        </div>
      )}
    </div>
  );
}

function AssessmentItemCard({
  item,
  isRecording,
  recordingLabel,
  onResult,
  onNotes,
  onCue,
  onComplete,
  onRecord,
  onStop
}: {
  item: AssessmentItem;
  isRecording: boolean;
  recordingLabel: string;
  onResult: (result: string) => void;
  onNotes: (notes: string) => void;
  onCue: (cueLevel: CueLevel) => void;
  onComplete: () => void;
  onRecord: () => void;
  onStop: () => void;
}) {
  const options = resultOptionsForKind(item.kind);

  return (
    <div className={`bg-slate-800 border p-5 rounded-3xl shadow-xl space-y-4 text-left ${statusTone(item)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{item.sectionTitle}</span>
          <h3 className="text-base font-black text-slate-100 mt-1 leading-snug">{item.prompt}</h3>
        </div>
        <KindIcon kind={item.kind} />
      </div>

      {item.helperText && (
        <p className="text-xs text-slate-400 leading-relaxed bg-slate-950/60 border border-slate-800 rounded-2xl p-3">
          {item.helperText}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {options.map(option => (
          <button
            key={option}
            type="button"
            onClick={() => onResult(option)}
            className={`${BUTTON_CLASS} text-[11px] px-2 ${
              item.result === option
                ? 'bg-cyan-500 text-slate-950'
                : 'bg-slate-900 border border-slate-700 text-slate-300'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {item.kind === 'stimulability' && (
        <div className="space-y-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Least cue level that helped</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CUE_LEVELS.map(cue => (
              <button
                key={cue.value}
                type="button"
                onClick={() => onCue(cue.value)}
                className={`${BUTTON_CLASS} text-[10px] ${item.cueLevel === cue.value ? 'bg-indigo-600 text-white' : 'bg-slate-900 border border-slate-700 text-slate-300'}`}
              >
                {cue.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-2">
        <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500" htmlFor={`assessment-notes-${item.id}`}>
          SLP notes
        </label>
        <textarea
          id={`assessment-notes-${item.id}`}
          value={item.notes || ''}
          onChange={event => onNotes(event.target.value)}
          placeholder="Add observations, errors, word positions, cueing response, or functional impact..."
          rows={3}
          className={`w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 text-sm text-slate-100 placeholder-slate-600 select-text ${FOCUS_CLASS}`}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {isRecording ? (
          <button
            type="button"
            onClick={onStop}
            className={`${BUTTON_CLASS} bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center gap-2`}
          >
            <Square size={16} />
            Stop {recordingLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={onRecord}
            className={`${BUTTON_CLASS} bg-slate-900 border border-slate-700 text-cyan-200 flex items-center justify-center gap-2`}
          >
            <Mic size={16} />
            Record
          </button>
        )}
        <button
          type="button"
          onClick={onComplete}
          className={`${BUTTON_CLASS} bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2`}
        >
          <CheckCircle2 size={16} />
          Mark Done
        </button>
      </div>

      {(item.recordingIds?.length || 0) > 0 && (
        <p className="text-[11px] text-cyan-200 bg-cyan-500/10 border border-cyan-500/25 rounded-2xl p-3">
          {item.recordingIds?.length} voice recording{item.recordingIds?.length === 1 ? '' : 's'} linked to this assessment line.
        </p>
      )}
    </div>
  );
}

function KindIcon({ kind }: { kind: AssessmentItemKind }) {
  if (kind === 'speech_sample') return <Mic className="text-cyan-300 shrink-0" size={20} />;
  if (kind === 'sound_probe') return <Target className="text-pink-300 shrink-0" size={20} />;
  if (kind === 'listener_check') return <Ear className="text-emerald-300 shrink-0" size={20} />;
  if (kind === 'summary') return <FileText className="text-indigo-300 shrink-0" size={20} />;
  if (kind === 'stimulability') return <PauseCircle className="text-amber-300 shrink-0" size={20} />;
  if (kind === 'checklist') return <CheckCircle2 className="text-emerald-300 shrink-0" size={20} />;
  return <AlertTriangle className="text-slate-400 shrink-0" size={20} />;
}
