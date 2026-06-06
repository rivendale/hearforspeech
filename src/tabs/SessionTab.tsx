import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  BarChart3,
  ClipboardList,
  Copy,
  Ear,
  Home,
  Plus,
  Printer,
  Save,
  Sparkles,
  Target,
  Trash2,
  UserPlus,
  X
} from 'lucide-react';
import {
  db,
  type ClientProfile,
  type CueLevel,
  type Goal,
  type GuidedSession,
  type ListenerCheck,
  type ListenerConfidence,
  type PracticeLevel,
  type SessionLog,
  type Trial,
  type TrialResult
} from '../db/database';
import { useStore } from '../store/useStore';
import { encryptSessionLog } from '../utils/crypto';
import { PrintableHandout } from '../components/PrintableHandout';

type WorkflowMode = 'setup' | 'running' | 'compose';
type LanguageMode = 'clinician' | 'student' | 'caregiver';
type NoteFormat = 'school' | 'soap';

interface DraftTrial {
  target: string;
  practiceLevel: PracticeLevel;
  result: TrialResult;
  cueLevel: CueLevel;
  strategyTags: string[];
  notes?: string;
  createdAt: string;
}

interface ListenerResponse {
  item: string;
  clear: boolean | null;
}

interface TrialStats {
  total: number;
  correct: number;
  approx: number;
  notYet: number;
  independentAccuracy: number;
  supportedAccuracy: number;
  mostCommonCue: CueLevel | 'none';
  cueSummary: string;
  strategiesUsed: string[];
}

const PRACTICE_LEVELS: { value: PracticeLevel; label: string }[] = [
  { value: 'sound', label: 'Sound' },
  { value: 'syllable', label: 'Syllable' },
  { value: 'word', label: 'Word' },
  { value: 'phrase', label: 'Phrase' },
  { value: 'sentence', label: 'Sentence' },
  { value: 'conversation', label: 'Conversation' }
];

const CUE_LEVELS: { value: CueLevel; label: string; short: string }[] = [
  { value: 'independent', label: 'Independent', short: 'Ind' },
  { value: 'minimal', label: 'Minimal', short: 'Min' },
  { value: 'moderate', label: 'Moderate', short: 'Mod' },
  { value: 'maximal', label: 'Maximal', short: 'Max' }
];

const STRATEGIES = [
  'Visual cue',
  'Verbal cue',
  'Model',
  'Slowed rate',
  'Repetition',
  'Contrast',
  'Biofeedback',
  'Self-monitoring'
];

const TARGET_AREAS = [
  'Articulation',
  'Phonology',
  'Speech intelligibility',
  'Fluency',
  'Voice',
  'Language',
  'Pragmatics'
];

const TARGET_SUGGESTIONS = ['/r/', '/s/', '/z/', '/l/', '/th/', '/sh/', '/ch/', 'final consonants', 'clear speech', 'conversation repair'];

const FOCUS_CLASS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300';
const PRIMARY_BUTTON = `min-h-[48px] rounded-2xl font-extrabold transition active:scale-98 ${FOCUS_CLASS}`;

const createId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `hfs-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const prettyLevel = (level: PracticeLevel) => PRACTICE_LEVELS.find(item => item.value === level)?.label ?? level;
const prettyCue = (cue: CueLevel | 'none') => cue === 'none' ? 'None yet' : CUE_LEVELS.find(item => item.value === cue)?.label ?? cue;
const formatPercent = (value: number) => `${Math.round(value)}%`;

const initialsFromName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CL';
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase()).join('');
};

const accuracyToRating = (accuracy: number) => {
  if (accuracy >= 90) return 5;
  if (accuracy >= 80) return 4;
  if (accuracy >= 65) return 3;
  if (accuracy >= 45) return 2;
  return 1;
};

const nextLevel = (level: PracticeLevel) => {
  const index = PRACTICE_LEVELS.findIndex(item => item.value === level);
  return PRACTICE_LEVELS[Math.min(index + 1, PRACTICE_LEVELS.length - 1)]?.label ?? 'the next level';
};

const generatePracticeTargets = (target: string) => {
  const normalized = target.toLowerCase();
  if (normalized.includes('r')) return ['red', 'rain', 'ring', 'rabbit', 'car', 'star', 'paper', 'teacher', 'green', 'around'];
  if (normalized.includes('s')) return ['sun', 'soap', 'sip', 'seven', 'bus', 'grass', 'messy', 'pencil', 'outside', 'soccer'];
  if (normalized.includes('z')) return ['zoo', 'zip', 'zero', 'zebra', 'buzz', 'fizz', 'music', 'roses', 'lazy', 'amazing'];
  if (normalized.includes('l')) return ['leaf', 'lamp', 'light', 'lion', 'ball', 'school', 'yellow', 'pillow', 'family', 'little'];
  if (normalized.includes('th')) return ['thin', 'think', 'thumb', 'thunder', 'bath', 'teeth', 'with', 'mother', 'feather', 'together'];
  if (normalized.includes('sh')) return ['shoe', 'ship', 'shell', 'shine', 'fish', 'brush', 'washing', 'sunshine', 'ocean', 'push'];
  if (normalized.includes('ch')) return ['chair', 'cheese', 'chop', 'chicken', 'lunch', 'beach', 'teacher', 'kitchen', 'watch', 'catch'];
  return ['ready', 'slowly', 'again', 'clear', 'listen', 'practice', 'try', 'strong', 'steady', 'success'];
};

const calculateTrialStats = (trials: DraftTrial[]): TrialStats => {
  const total = trials.length;
  const correct = trials.filter(trial => trial.result === 'correct').length;
  const approx = trials.filter(trial => trial.result === 'approx').length;
  const notYet = trials.filter(trial => trial.result === 'not_yet').length;
  const independentCorrect = trials.filter(trial => trial.result === 'correct' && trial.cueLevel === 'independent').length;
  const supportedResponses = trials.filter(trial => trial.cueLevel !== 'independent' && (trial.result === 'correct' || trial.result === 'approx')).length;
  const cueCounts = CUE_LEVELS.map(cue => ({
    cue: cue.value,
    count: trials.filter(trial => trial.cueLevel === cue.value).length
  }));
  const mostCommonCue = cueCounts.reduce<{ cue: CueLevel | 'none'; count: number }>(
    (best, item) => item.count > best.count ? item : best,
    { cue: 'none', count: 0 }
  ).cue;
  const cueSummary = total === 0
    ? 'No trials recorded yet.'
    : CUE_LEVELS
      .map(cue => `${cue.label}: ${trials.filter(trial => trial.cueLevel === cue.value).length}`)
      .join(' · ');
  const strategiesUsed = Array.from(new Set(trials.flatMap(trial => trial.strategyTags))).filter(Boolean);

  return {
    total,
    correct,
    approx,
    notYet,
    independentAccuracy: total > 0 ? Math.round((independentCorrect / total) * 100) : 0,
    supportedAccuracy: total > 0 ? Math.round((supportedResponses / total) * 100) : 0,
    mostCommonCue,
    cueSummary,
    strategiesUsed
  };
};

const buildConservativeSuggestion = (recentSessions: GuidedSession[]) => {
  if (recentSessions.length === 0) {
    return 'Consider running a guided session to establish a baseline before changing the goal.';
  }

  const latest = recentSessions[0];
  const lastTwo = recentSessions.slice(0, 2);
  const stableHighAccuracy = lastTwo.length === 2 && lastTwo.every(session => session.independentAccuracy >= 80 && session.totalTrials >= 10);
  const cueGap = latest.supportedAccuracy - latest.independentAccuracy;

  if (latest.totalTrials < 10) {
    return 'Consider collecting at least 10 trials before increasing difficulty.';
  }
  if (stableHighAccuracy) {
    return `Consider brief ${nextLevel(latest.practiceLevel).toLowerCase()} probes while keeping the current level available.`;
  }
  if (cueGap >= 20) {
    return 'Consider keeping the current level and fading cues gradually as independent accuracy improves.';
  }
  if (latest.independentAccuracy < 60) {
    return 'Consider more models, slower rate, or an easier practice level before increasing complexity.';
  }
  return 'Consider repeating this level and watching whether independent accuracy stays consistent next session.';
};

export function SessionTab() {
  const { masterKey } = useStore();
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [sessions, setSessions] = useState<GuidedSession[]>([]);
  const [listenerChecks, setListenerChecks] = useState<ListenerCheck[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedGoalId, setSelectedGoalId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientAgeGroup, setClientAgeGroup] = useState('');
  const [clientNotes, setClientNotes] = useState('');
  const [goalTargetArea, setGoalTargetArea] = useState('Articulation');
  const [goalTargetPhoneme, setGoalTargetPhoneme] = useState('/r/');
  const [goalContext, setGoalContext] = useState('Functional speech practice');
  const [target, setTarget] = useState('/r/');
  const [practiceLevel, setPracticeLevel] = useState<PracticeLevel>('word');
  const [setting, setSetting] = useState('Therapy room');
  const [mode, setMode] = useState<WorkflowMode>('setup');
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [draftTrials, setDraftTrials] = useState<DraftTrial[]>([]);
  const [cueLevel, setCueLevel] = useState<CueLevel>('independent');
  const [strategyTags, setStrategyTags] = useState<string[]>([]);
  const [trialNotes, setTrialNotes] = useState('');
  const [sessionObservation, setSessionObservation] = useState('');
  const [noteFormat, setNoteFormat] = useState<NoteFormat>('school');
  const [languageMode, setLanguageMode] = useState<LanguageMode>('clinician');
  const [schoolNote, setSchoolNote] = useState('');
  const [soapNote, setSoapNote] = useState('');
  const [homePractice, setHomePractice] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [listenerResponses, setListenerResponses] = useState<ListenerResponse[]>([]);
  const [listenerConfidence, setListenerConfidence] = useState<ListenerConfidence>('medium');
  const [listenerDraft, setListenerDraft] = useState<Omit<ListenerCheck, 'id' | 'clientId' | 'createdAt'> | null>(null);
  const [isListenerMode, setIsListenerMode] = useState(false);

  const currentClientId = selectedClientId || clients[0]?.id || '';

  const selectedClient = useMemo(
    () => clients.find(client => client.id === currentClientId),
    [clients, currentClientId]
  );
  
  const selectedClientGoals = useMemo(
    () => goals.filter(goal => goal.clientId === currentClientId && goal.status === 'active'),
    [goals, currentClientId]
  );

  const currentGoalId = selectedGoalId || selectedClientGoals[0]?.id || '';

  const selectedGoal = useMemo(
    () => goals.find(goal => goal.id === currentGoalId),
    [goals, currentGoalId]
  );

  const selectedClientSessions = useMemo(
    () => sessions
      .filter(session => session.clientId === currentClientId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [sessions, currentClientId]
  );

  const selectedListenerChecks = useMemo(
    () => listenerChecks
      .filter(check => check.clientId === currentClientId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [listenerChecks, currentClientId]
  );

  const trialStats = useMemo(() => calculateTrialStats(draftTrials), [draftTrials]);
  const progressSuggestion = useMemo(() => buildConservativeSuggestion(selectedClientSessions), [selectedClientSessions]);
  const practiceTargets = useMemo(() => generatePracticeTargets(target), [target]);

  const loadLocalData = useCallback(async () => {
    const [storedClients, storedGoals, storedSessions, storedListenerChecks] = await Promise.all([
      db.clients.toArray(),
      db.goals.toArray(),
      db.guidedSessions.toArray(),
      db.listenerChecks.toArray()
    ]);

    setClients(storedClients.sort((a, b) => a.displayName.localeCompare(b.displayName)));
    setGoals(storedGoals);
    setSessions(storedSessions);
    setListenerChecks(storedListenerChecks);

  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      db.clients.toArray(),
      db.goals.toArray(),
      db.guidedSessions.toArray(),
      db.listenerChecks.toArray()
    ]).then(([storedClients, storedGoals, storedSessions, storedListenerChecks]) => {
      if (!active) return;
      setClients(storedClients.sort((a, b) => a.displayName.localeCompare(b.displayName)));
      setGoals(storedGoals);
      setSessions(storedSessions);
      setListenerChecks(storedListenerChecks);
    }).catch(console.error);

    return () => {
      active = false;
    };
  }, []);

  const createClient = async (event?: FormEvent) => {
    event?.preventDefault();
    const trimmedName = clientName.trim();
    if (!trimmedName) {
      alert('Add a client or student name first.');
      return '';
    }

    const now = new Date().toISOString();
    const client: ClientProfile = {
      id: createId(),
      displayName: trimmedName,
      initials: initialsFromName(trimmedName),
      ageGroup: clientAgeGroup.trim() || undefined,
      notes: clientNotes.trim() || undefined,
      createdAt: now,
      updatedAt: now
    };

    await db.clients.add(client);
    setSelectedClientId(client.id);
    setClientName('');
    setClientAgeGroup('');
    setClientNotes('');
    await loadLocalData();
    return client.id;
  };

  const createDemoClient = async () => {
    const existingDemo = clients.find(client => client.displayName === 'Taylor Demo');
    if (existingDemo) {
      setSelectedClientId(existingDemo.id);
      return;
    }

    const now = new Date().toISOString();
    const clientId = createId();
    const goalId = createId();
    const demoClient: ClientProfile = {
      id: clientId,
      displayName: 'Taylor Demo',
      initials: 'TD',
      ageGroup: 'School-age',
      notes: 'Sample fake client for training and demos.',
      createdAt: now,
      updatedAt: now
    };
    const demoGoal: Goal = {
      id: goalId,
      clientId,
      targetArea: 'Articulation',
      targetPhoneme: '/r/',
      level: 'word',
      accuracyCriterion: '80%+ independent accuracy across two sessions',
      cueingCriterion: 'Minimal cues or less',
      context: 'Demo goal only; not a real student.',
      status: 'active',
      createdAt: now,
      updatedAt: now
    };

    await db.transaction('rw', [db.clients, db.goals], async () => {
      await db.clients.add(demoClient);
      await db.goals.add(demoGoal);
    });
    setSelectedClientId(clientId);
    setSelectedGoalId(goalId);
    setTarget('/r/');
    setPracticeLevel('word');
    await loadLocalData();
  };

  const createGoal = async () => {
    const clientId = currentClientId || await createClient();
    if (!clientId) return '';

    const now = new Date().toISOString();
    const goal: Goal = {
      id: createId(),
      clientId,
      targetArea: goalTargetArea.trim() || 'Articulation',
      targetPhoneme: goalTargetPhoneme.trim() || undefined,
      level: practiceLevel,
      accuracyCriterion: '80%+ accuracy across two sessions',
      cueingCriterion: 'Minimal cues or less',
      context: goalContext.trim() || undefined,
      status: 'active',
      createdAt: now,
      updatedAt: now
    };

    await db.goals.add(goal);
    setSelectedGoalId(goal.id);
    setTarget(goal.targetPhoneme || goal.targetArea);
    await loadLocalData();
    return goal.id;
  };

  const selectGoal = (goal: Goal) => {
    setSelectedGoalId(goal.id);
    setTarget(goal.targetPhoneme || goal.targetArea);
    setPracticeLevel(goal.level);
    setGoalTargetArea(goal.targetArea);
    setGoalTargetPhoneme(goal.targetPhoneme || '');
    setGoalContext(goal.context || '');
  };

  const handleStartSession = async () => {
    let clientId = currentClientId;
    if (!clientId && clientName.trim()) {
      clientId = await createClient();
    }
    if (!clientId) {
      alert('Select or create a client/student before starting.');
      return;
    }

    let goalId = currentGoalId;
    if (!goalId) {
      goalId = await createGoal();
    }
    if (!goalId) {
      alert('Select or create an active goal before starting.');
      return;
    }

    setSelectedGoalId(goalId);
    setDraftTrials([]);
    setCueLevel('independent');
    setStrategyTags([]);
    setTrialNotes('');
    setSessionObservation('');
    setListenerDraft(null);
    setSaveStatus('');
    setSessionStartedAt(Date.now());
    setMode('running');
  };

  const toggleStrategy = (strategy: string) => {
    setStrategyTags(prev => prev.includes(strategy)
      ? prev.filter(item => item !== strategy)
      : [...prev, strategy]
    );
  };

  const addTrial = (result: TrialResult) => {
    const trial: DraftTrial = {
      target: target.trim() || selectedGoal?.targetPhoneme || selectedGoal?.targetArea || 'Target',
      practiceLevel,
      result,
      cueLevel,
      strategyTags: [...strategyTags],
      notes: trialNotes.trim() || undefined,
      createdAt: new Date().toISOString()
    };
    setDraftTrials(prev => [...prev, trial]);
    setTrialNotes('');
  };

  const undoLastTrial = () => {
    setDraftTrials(prev => prev.slice(0, -1));
  };

  const buildOutputs = useCallback(() => {
    const stats = calculateTrialStats(draftTrials);
    const clientLabel = languageMode === 'student' ? 'You' : 'Student';
    const goalText = selectedGoal
      ? `${selectedGoal.targetArea}${selectedGoal.targetPhoneme ? ` (${selectedGoal.targetPhoneme})` : ''} at the ${prettyLevel(selectedGoal.level).toLowerCase()} level`
      : `${target || 'the target'} at the ${prettyLevel(practiceLevel).toLowerCase()} level`;
    const strategiesText = stats.strategiesUsed.length > 0 ? stats.strategiesUsed.join(', ') : 'clinician-selected supports';
    const cueText = prettyCue(stats.mostCommonCue).toLowerCase();
    const observation = sessionObservation.trim()
      || (languageMode === 'clinician'
        ? `${clientLabel} benefited from structured practice, immediate feedback, and opportunities to self-monitor productions.`
        : `${clientLabel} sounded clearer when practice was slow, steady, and supported.`);
    const plan = buildConservativeSuggestion([
      {
        id: 'draft',
        clientId: currentClientId || 'draft',
        goalId: currentGoalId || undefined,
        date: new Date().toLocaleDateString(),
        practiceLevel,
        target,
        independentAccuracy: stats.independentAccuracy,
        supportedAccuracy: stats.supportedAccuracy,
        totalTrials: stats.total,
        cueSummary: stats.cueSummary,
        strategies: stats.strategiesUsed,
        note: '',
        homePractice: '',
        createdAt: new Date().toISOString()
      },
      ...selectedClientSessions
    ]);
    const listenerLine = listenerDraft
      ? ` Listener Check score was ${listenerDraft.score}% with ${listenerDraft.confidence} listener confidence.`
      : '';

    const school = [
      `Service/session summary: ${clientLabel} practiced ${target || goalText} at the ${prettyLevel(practiceLevel).toLowerCase()} level across ${stats.total} trials in ${setting || 'the therapy setting'}.`,
      `Goal addressed: ${goalText}.`,
      `Objective data: Correct ${stats.correct}, approximate ${stats.approx}, not yet ${stats.notYet}. Independent accuracy was ${formatPercent(stats.independentAccuracy)}. Supported accuracy was ${formatPercent(stats.supportedAccuracy)} using correct/approximate responses after cueing.${listenerLine}`,
      `Cueing level: Most common cue level was ${cueText}. ${stats.cueSummary}`,
      `Strategies used: ${strategiesText}.`,
      `Clinical observation: ${observation}`,
      `Plan/next step: ${plan}`
    ].join('\n\n');

    const soap = [
      `S: ${languageMode === 'caregiver' ? 'Caregiver/student participation and effort were noted during practice.' : 'Student participated in structured speech practice targeting the active goal.'}`,
      `O: Practiced ${target || goalText} at the ${prettyLevel(practiceLevel).toLowerCase()} level across ${stats.total} trials. Independent accuracy: ${formatPercent(stats.independentAccuracy)}. Supported accuracy: ${formatPercent(stats.supportedAccuracy)}. Cueing summary: ${stats.cueSummary}.${listenerLine}`,
      `A: ${observation} Strategies that supported clearer productions included ${strategiesText}.`,
      `P: ${plan}`
    ].join('\n\n');

    const practiceWords = generatePracticeTargets(target).slice(0, 10).join(', ');
    const simpleCue = languageMode === 'clinician'
      ? `Use ${strategiesText} as needed, then fade support when productions are clear.`
      : languageMode === 'student'
        ? 'Say each word slowly. Listen for your clearest sound, then try again if it feels bumpy.'
        : 'Model the word once, keep practice calm, and praise effort before correcting.';
    const caregiverIntro = languageMode === 'student'
      ? `Today you practiced ${target || 'your speech sound'} in ${prettyLevel(practiceLevel).toLowerCase()}s.`
      : `Today we practiced ${target || 'the speech target'} in ${prettyLevel(practiceLevel).toLowerCase()}s.`;

    const home = [
      `What we practiced today: ${caregiverIntro}`,
      `Practice targets: ${practiceWords}.`,
      `Simple cue: ${simpleCue}`,
      'Practice schedule: Practice for 5 minutes, 3 times this week.',
      languageMode === 'student'
        ? 'Encouragement: Notice your clear tries. You are building a skill one small practice round at a time.'
        : 'Caregiver note: Keep practice short and positive. If the word is unclear, model it once and try again.',
      'Encouragement: Praise effort first. Clear speech grows with calm, consistent practice.'
    ].join('\n\n');

    setSchoolNote(school);
    setSoapNote(soap);
    setHomePractice(home);
  }, [
    draftTrials,
    languageMode,
    listenerDraft,
    practiceLevel,
    currentClientId,
    selectedClientSessions,
    selectedGoal,
    currentGoalId,
    sessionObservation,
    setting,
    target
  ]);

  const handleEndSession = () => {
    if (draftTrials.length === 0) {
      alert('Record at least one trial before ending the session.');
      return;
    }
    buildOutputs();
    setNoteFormat('school');
    setMode('compose');
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setSaveStatus('Copied to clipboard.');
    setTimeout(() => setSaveStatus(''), 1800);
  };

  const saveGuidedSession = async () => {
    if (!currentClientId) {
      alert('Select a client before saving.');
      return;
    }
    if (draftTrials.length === 0) {
      alert('No trials to save yet.');
      return;
    }

    const stats = calculateTrialStats(draftTrials);
    const now = new Date().toISOString();
    const sessionId = createId();
    const durationMinutes = sessionStartedAt ? Math.max(1, Math.round((Date.now() - sessionStartedAt) / 60000)) : undefined;
    const strategies = stats.strategiesUsed.length > 0 ? stats.strategiesUsed : strategyTags;
    const dateLabel = new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    const listenerScore = listenerDraft?.score;
    const listenerConfidenceValue = listenerDraft?.confidence;

    const legacyLog: SessionLog = {
      date: dateLabel,
      rating: accuracyToRating(stats.independentAccuracy),
      pcc: stats.independentAccuracy,
      environment: setting || 'Guided session',
      repairStrategies: strategies,
      notes: schoolNote.trim(),
      naiveListenerScore: listenerScore
    };

    let sessionLogId: number | undefined;

    await db.transaction('rw', [db.logs, db.guidedSessions, db.trials, db.listenerChecks], async () => {
      const finalLog = masterKey ? await encryptSessionLog(legacyLog, masterKey) : legacyLog;
      sessionLogId = await db.logs.add(finalLog);

      const guidedSession: GuidedSession = {
        id: sessionId,
        clientId: currentClientId,
        goalId: currentGoalId || undefined,
        date: dateLabel,
        durationMinutes,
        setting: setting || undefined,
        practiceLevel,
        target: target.trim() || selectedGoal?.targetPhoneme || selectedGoal?.targetArea || 'Target',
        independentAccuracy: stats.independentAccuracy,
        supportedAccuracy: stats.supportedAccuracy,
        totalTrials: stats.total,
        cueSummary: stats.cueSummary,
        strategies,
        note: schoolNote.trim(),
        soapNote: soapNote.trim(),
        homePractice: homePractice.trim(),
        listenerCheckScore: listenerScore,
        listenerConfidence: listenerConfidenceValue,
        sessionLogId,
        createdAt: now
      };

      const trialRows: Trial[] = draftTrials.map(trial => ({
        id: createId(),
        sessionId,
        target: trial.target,
        practiceLevel: trial.practiceLevel,
        result: trial.result,
        cueLevel: trial.cueLevel,
        strategyTags: trial.strategyTags,
        notes: trial.notes,
        createdAt: trial.createdAt
      }));

      await db.guidedSessions.add(guidedSession);
      await db.trials.bulkAdd(trialRows);

      if (listenerDraft) {
        await db.listenerChecks.add({
          id: createId(),
          clientId: currentClientId,
          sessionId,
          itemText: listenerDraft.itemText,
          clearItems: listenerDraft.clearItems,
          totalItems: listenerDraft.totalItems,
          score: listenerDraft.score,
          confidence: listenerDraft.confidence,
          notes: listenerDraft.notes,
          createdAt: now
        });
      }
    });

    setSaveStatus('Session saved locally.');
    await loadLocalData();
  };

  const resetForNextSession = () => {
    setMode('setup');
    setDraftTrials([]);
    setListenerDraft(null);
    setSchoolNote('');
    setSoapNote('');
    setHomePractice('');
    setSessionObservation('');
    setSaveStatus('');
    setSessionStartedAt(null);
  };

  const deleteSelectedClientData = async () => {
    if (!selectedClient) return;
    const confirmed = confirm(`Delete ${selectedClient.displayName} and all guided goals, sessions, trials, and listener checks stored for this client on this device?`);
    if (!confirmed) return;

    const relatedSessions = await db.guidedSessions.where('clientId').equals(selectedClient.id).toArray();
    const sessionIds = relatedSessions.map(session => session.id);
    const legacyLogIds = relatedSessions
      .map(session => session.sessionLogId)
      .filter((id): id is number => typeof id === 'number');

    await db.transaction('rw', [db.clients, db.goals, db.guidedSessions, db.trials, db.listenerChecks, db.logs], async () => {
      if (sessionIds.length > 0) {
        await db.trials.where('sessionId').anyOf(sessionIds).delete();
      }
      if (legacyLogIds.length > 0) {
        await db.logs.bulkDelete(legacyLogIds);
      }
      await db.listenerChecks.where('clientId').equals(selectedClient.id).delete();
      await db.guidedSessions.where('clientId').equals(selectedClient.id).delete();
      await db.goals.where('clientId').equals(selectedClient.id).delete();
      await db.clients.delete(selectedClient.id);
    });

    setSelectedClientId('');
    setSelectedGoalId('');
    await loadLocalData();
  };

  const startListenerCheck = () => {
    setListenerResponses(practiceTargets.slice(0, 8).map(item => ({ item, clear: null })));
    setListenerConfidence('medium');
    setIsListenerMode(true);
  };

  const setListenerItem = (index: number, clear: boolean) => {
    setListenerResponses(prev => prev.map((item, itemIndex) => itemIndex === index ? { ...item, clear } : item));
  };

  const finishListenerCheck = () => {
    const scored = listenerResponses.filter(item => item.clear !== null);
    if (scored.length === 0) {
      alert('Score at least one item before returning to the SLP.');
      return;
    }

    const clearItems = scored.filter(item => item.clear).length;
    const totalItems = scored.length;
    const score = Math.round((clearItems / totalItems) * 100);
    setListenerDraft({
      itemText: scored.map(item => item.item).join(', '),
      clearItems,
      totalItems,
      score,
      confidence: listenerConfidence,
      notes: `Listener Check: ${clearItems}/${totalItems} items clear.`
    });
    setIsListenerMode(false);
  };

  const activeNote = noteFormat === 'school' ? schoolNote : soapNote;
  const recentTrend = selectedClientSessions.slice(0, 6).reverse();

  return (
    <div className="space-y-5">
      {isListenerMode && (
        <div className="fixed inset-0 z-[10002] bg-slate-950 text-slate-100 p-4 overflow-y-auto">
          <div className="max-w-lg mx-auto min-h-full flex flex-col justify-center space-y-5">
            <div className="bg-slate-800 border border-slate-700 p-5 rounded-3xl shadow-2xl space-y-4">
              <div className="flex items-center justify-between gap-3 border-b border-slate-700/70 pb-3">
                <div className="flex items-center gap-2 text-left">
                  <Ear className="text-emerald-400" size={22} />
                  <div>
                    <h2 className="text-lg font-extrabold tracking-tight">Listener Check</h2>
                    <p className="text-[11px] text-slate-400">Only the scoring task is shown. No private notes or other clients are visible.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsListenerMode(false)}
                  className={`h-11 w-11 rounded-2xl bg-slate-900 text-slate-300 flex items-center justify-center ${FOCUS_CLASS}`}
                  aria-label="Exit Listener Check"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-2xl text-left">
                <p className="text-sm font-bold text-indigo-200">Listen to each word or phrase. Mark what sounded clear to you.</p>
                <p className="text-xs text-indigo-300/80 mt-1">It is okay to guess “unclear” if you are not sure.</p>
              </div>

              <div className="space-y-3">
                {listenerResponses.map((response, index) => (
                  <div key={response.item} className="bg-slate-900/80 border border-slate-750 rounded-2xl p-3 space-y-2">
                    <p className="text-base font-extrabold text-center text-slate-100">{response.item}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setListenerItem(index, true)}
                        className={`${PRIMARY_BUTTON} ${response.clear === true ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 border border-slate-700 text-emerald-300'}`}
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={() => setListenerItem(index, false)}
                        className={`${PRIMARY_BUTTON} ${response.clear === false ? 'bg-rose-500 text-white' : 'bg-slate-800 border border-slate-700 text-rose-300'}`}
                      >
                        Unclear
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2 text-left">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">How confident are you?</span>
                <div className="grid grid-cols-3 gap-2">
                  {(['low', 'medium', 'high'] as ListenerConfidence[]).map(confidence => (
                    <button
                      key={confidence}
                      type="button"
                      onClick={() => setListenerConfidence(confidence)}
                      className={`${PRIMARY_BUTTON} text-xs uppercase ${listenerConfidence === confidence ? 'bg-indigo-600 text-white' : 'bg-slate-900 border border-slate-700 text-slate-300'}`}
                    >
                      {confidence}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={finishListenerCheck}
                className={`${PRIMARY_BUTTON} w-full bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/15`}
              >
                Return Results to SLP
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="bg-gradient-to-br from-indigo-500/20 via-slate-800 to-emerald-500/10 border border-indigo-400/20 p-5 rounded-3xl shadow-xl text-left space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-indigo-200">Start Session</p>
            <h2 className="text-2xl font-black tracking-tight text-white mt-1">Client → Goal → Trials → Note</h2>
          </div>
          <Sparkles className="text-emerald-300 shrink-0" size={24} />
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">
          A fast, local-first workflow for real therapy sessions: pick a student, choose a goal, tap trials, generate editable documentation, and send home practice.
        </p>
      </section>

      {mode === 'setup' && (
        <div className="space-y-5">
          <section className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
            <div className="flex items-center justify-between gap-3 border-b border-slate-700/60 pb-3">
              <h3 className="font-extrabold text-base text-slate-100 flex items-center gap-2">
                <UserPlus className="text-indigo-400" size={18} />
                Client or Student
              </h3>
              <button
                type="button"
                onClick={createDemoClient}
                className={`bg-slate-900 border border-slate-700 text-slate-300 px-3 py-2 rounded-xl text-[10px] font-bold uppercase ${FOCUS_CLASS}`}
              >
                Demo Mode
              </button>
            </div>

            {clients.length > 0 && (
              <div className="space-y-2 text-left">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500" htmlFor="client-select">
                  Select client/student
                </label>
                <select
                  id="client-select"
                  value={currentClientId}
                  onChange={(event) => {
                    setSelectedClientId(event.target.value);
                    setSelectedGoalId('');
                  }}
                  className={`w-full min-h-[48px] bg-slate-900 border border-slate-700 rounded-2xl p-3 text-sm font-bold text-slate-100 ${FOCUS_CLASS}`}
                >
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>{client.displayName}</option>
                  ))}
                </select>
              </div>
            )}

            <form onSubmit={createClient} className="grid gap-2 text-left">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500" htmlFor="client-name">
                Create new client/student
              </label>
              <input
                id="client-name"
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
                placeholder="Display name or initials"
                className={`w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 min-h-[48px] text-sm text-slate-100 placeholder-slate-600 ${FOCUS_CLASS}`}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  value={clientAgeGroup}
                  onChange={(event) => setClientAgeGroup(event.target.value)}
                  placeholder="Age group (optional)"
                  className={`w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 min-h-[48px] text-sm text-slate-100 placeholder-slate-600 ${FOCUS_CLASS}`}
                />
                <input
                  value={clientNotes}
                  onChange={(event) => setClientNotes(event.target.value)}
                  placeholder="Private note (optional)"
                  className={`w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 min-h-[48px] text-sm text-slate-100 placeholder-slate-600 ${FOCUS_CLASS}`}
                />
              </div>
              <button
                type="submit"
                className={`${PRIMARY_BUTTON} bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2`}
              >
                <Plus size={17} />
                Add Client Locally
              </button>
            </form>
          </section>

          <section className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
            <h3 className="font-extrabold text-base text-slate-100 flex items-center gap-2 border-b border-slate-700/60 pb-3">
              <Target className="text-emerald-400" size={18} />
              Active Goal
            </h3>

            {selectedClientGoals.length > 0 && (
              <div className="space-y-2">
                {selectedClientGoals.map(goal => (
                  <button
                    key={goal.id}
                    type="button"
                    onClick={() => selectGoal(goal)}
                    className={`w-full text-left p-4 rounded-2xl border transition min-h-[64px] ${FOCUS_CLASS} ${
                      currentGoalId === goal.id
                        ? 'bg-emerald-500/10 border-emerald-400/40 text-emerald-100'
                        : 'bg-slate-900 border-slate-700 text-slate-300'
                    }`}
                  >
                    <span className="font-extrabold text-sm block">{goal.targetArea}{goal.targetPhoneme ? ` · ${goal.targetPhoneme}` : ''}</span>
                    <span className="text-[11px] text-slate-400">{prettyLevel(goal.level)} · {goal.context || 'Active practice goal'}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-3 text-left">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Create or update goal details</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={goalTargetArea}
                  onChange={(event) => setGoalTargetArea(event.target.value)}
                  className={`w-full min-h-[48px] bg-slate-900 border border-slate-700 rounded-2xl p-3 text-sm font-bold text-slate-100 ${FOCUS_CLASS}`}
                >
                  {TARGET_AREAS.map(area => <option key={area} value={area}>{area}</option>)}
                </select>
                <input
                  value={goalTargetPhoneme}
                  onChange={(event) => {
                    setGoalTargetPhoneme(event.target.value);
                    setTarget(event.target.value);
                  }}
                  placeholder="/r/ or target area"
                  className={`w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 min-h-[48px] text-sm text-slate-100 placeholder-slate-600 ${FOCUS_CLASS}`}
                />
              </div>
              <input
                value={goalContext}
                onChange={(event) => setGoalContext(event.target.value)}
                placeholder="Goal context, criterion, or classroom need"
                className={`w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 min-h-[48px] text-sm text-slate-100 placeholder-slate-600 ${FOCUS_CLASS}`}
              />
              <button
                type="button"
                onClick={createGoal}
                className={`${PRIMARY_BUTTON} w-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2`}
              >
                <Plus size={17} />
                Save Active Goal
              </button>
            </div>
          </section>

          <section className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
            <h3 className="font-extrabold text-base text-slate-100 flex items-center gap-2 border-b border-slate-700/60 pb-3">
              <Activity className="text-pink-400" size={18} />
              Session Setup
            </h3>
            <div className="space-y-2 text-left">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500" htmlFor="target-input">Target sound or area</label>
              <input
                id="target-input"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                className={`w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 min-h-[48px] text-sm text-slate-100 ${FOCUS_CLASS}`}
              />
              <div className="flex flex-wrap gap-2 pt-1">
                {TARGET_SUGGESTIONS.map(suggestion => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      setTarget(suggestion);
                      setGoalTargetPhoneme(suggestion);
                    }}
                    className={`min-h-[40px] px-3 rounded-xl border text-[11px] font-bold ${target === suggestion ? 'bg-pink-500/15 border-pink-400/40 text-pink-200' : 'bg-slate-900 border-slate-700 text-slate-400'} ${FOCUS_CLASS}`}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 text-left">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Practice level</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PRACTICE_LEVELS.map(level => (
                  <button
                    key={level.value}
                    type="button"
                    onClick={() => setPracticeLevel(level.value)}
                    className={`${PRIMARY_BUTTON} text-xs uppercase ${practiceLevel === level.value ? 'bg-indigo-600 text-white' : 'bg-slate-900 border border-slate-700 text-slate-300'}`}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-500" htmlFor="setting-input">
              Setting
            </label>
            <input
              id="setting-input"
              value={setting}
              onChange={(event) => setSetting(event.target.value)}
              placeholder="Therapy room, classroom, telepractice..."
              className={`w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 min-h-[48px] text-sm text-slate-100 placeholder-slate-600 ${FOCUS_CLASS}`}
            />

            <button
              type="button"
              onClick={handleStartSession}
              className={`${PRIMARY_BUTTON} w-full bg-gradient-to-r from-indigo-500 to-emerald-500 text-white shadow-lg shadow-indigo-500/15`}
            >
              Start Session
            </button>
          </section>

          <ProgressPanel
            client={selectedClient}
            goals={selectedClientGoals}
            sessions={selectedClientSessions}
            listenerChecks={selectedListenerChecks}
            suggestion={progressSuggestion}
            recentTrend={recentTrend}
            onDeleteClient={deleteSelectedClientData}
          />
        </div>
      )}

      {mode === 'running' && (
        <div className="space-y-5">
          <section className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="text-left">
                <p className="text-[10px] uppercase tracking-widest font-extrabold text-slate-500">{selectedClient?.displayName || 'Current client'} · {prettyLevel(practiceLevel)}</p>
                <h3 className="text-xl font-black text-white">{target || 'Session target'}</h3>
              </div>
              <button
                type="button"
                onClick={handleEndSession}
                className={`${PRIMARY_BUTTON} bg-emerald-600 hover:bg-emerald-700 text-white px-4 text-xs uppercase`}
              >
                End Session
              </button>
            </div>

            <StatsCard stats={trialStats} />

            <div className="space-y-2 text-left">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Cue level for next trial</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CUE_LEVELS.map(cue => (
                  <button
                    key={cue.value}
                    type="button"
                    onClick={() => setCueLevel(cue.value)}
                    className={`${PRIMARY_BUTTON} text-xs ${cueLevel === cue.value ? 'bg-indigo-600 text-white' : 'bg-slate-900 border border-slate-700 text-slate-300'}`}
                  >
                    {cue.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => addTrial('correct')}
                className={`${PRIMARY_BUTTON} min-h-[72px] bg-emerald-500 text-slate-950 text-2xl shadow-lg shadow-emerald-500/10`}
              >
                Correct
              </button>
              <button
                type="button"
                onClick={() => addTrial('approx')}
                className={`${PRIMARY_BUTTON} min-h-[72px] bg-amber-400 text-slate-950 text-2xl shadow-lg shadow-amber-500/10`}
              >
                Approx
              </button>
              <button
                type="button"
                onClick={() => addTrial('not_yet')}
                className={`${PRIMARY_BUTTON} min-h-[72px] bg-rose-500 text-white text-2xl shadow-lg shadow-rose-500/10`}
              >
                Not yet
              </button>
            </div>

            <div className="space-y-2 text-left">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Quick strategies</span>
              <div className="flex flex-wrap gap-2">
                {STRATEGIES.map(strategy => (
                  <button
                    key={strategy}
                    type="button"
                    onClick={() => toggleStrategy(strategy)}
                    className={`min-h-[42px] px-3 rounded-xl border text-[11px] font-bold transition ${FOCUS_CLASS} ${
                      strategyTags.includes(strategy)
                        ? 'bg-purple-500/20 border-purple-400/40 text-purple-200'
                        : 'bg-slate-900 border-slate-700 text-slate-400'
                    }`}
                  >
                    {strategy}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2 text-left">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500" htmlFor="trial-notes">
                Optional trial note
              </label>
              <input
                id="trial-notes"
                value={trialNotes}
                onChange={(event) => setTrialNotes(event.target.value)}
                placeholder="Add note before tapping next trial..."
                className={`w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 min-h-[48px] text-sm text-slate-100 placeholder-slate-600 ${FOCUS_CLASS}`}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={undoLastTrial}
                disabled={draftTrials.length === 0}
                className={`${PRIMARY_BUTTON} bg-slate-900 border border-slate-700 text-slate-300 disabled:opacity-40`}
              >
                Undo Last
              </button>
              <button
                type="button"
                onClick={startListenerCheck}
                className={`${PRIMARY_BUTTON} bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center justify-center gap-2`}
              >
                <Ear size={17} />
                Listener Check
              </button>
            </div>

            {listenerDraft && (
              <div className="bg-emerald-500/10 border border-emerald-500/25 p-4 rounded-2xl text-left">
                <p className="text-sm font-extrabold text-emerald-200">Listener Check: {listenerDraft.score}% clear</p>
                <p className="text-xs text-emerald-300/80 mt-1">{listenerDraft.clearItems}/{listenerDraft.totalItems} items clear · {listenerDraft.confidence} confidence</p>
              </div>
            )}
          </section>
        </div>
      )}

      {mode === 'compose' && (
        <div className="space-y-5">
          <section className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
            <h3 className="font-extrabold text-base text-slate-100 flex items-center gap-2 border-b border-slate-700/60 pb-3">
              <ClipboardList className="text-indigo-400" size={18} />
              Session Note Composer
            </h3>

            <StatsCard stats={trialStats} />

            <div className="space-y-2 text-left">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500" htmlFor="session-observation">
                Optional clinical observation
              </label>
              <textarea
                id="session-observation"
                value={sessionObservation}
                onChange={(event) => setSessionObservation(event.target.value)}
                placeholder="What did the student benefit from? What should happen next?"
                rows={3}
                className={`w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 text-sm text-slate-100 placeholder-slate-600 select-text ${FOCUS_CLASS}`}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(['clinician', 'student', 'caregiver'] as LanguageMode[]).map(modeOption => (
                <button
                  key={modeOption}
                  type="button"
                  onClick={() => setLanguageMode(modeOption)}
                  className={`${PRIMARY_BUTTON} text-[10px] uppercase ${languageMode === modeOption ? 'bg-indigo-600 text-white' : 'bg-slate-900 border border-slate-700 text-slate-300'}`}
                >
                  {modeOption}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={buildOutputs}
              className={`${PRIMARY_BUTTON} w-full bg-slate-900 border border-slate-700 text-slate-200 flex items-center justify-center gap-2`}
            >
              <Sparkles size={16} />
              Regenerate Editable Text
            </button>

            <div className="flex gap-2 bg-slate-950 p-1 rounded-2xl border border-slate-900">
              <button
                type="button"
                onClick={() => setNoteFormat('school')}
                className={`${PRIMARY_BUTTON} flex-1 text-xs ${noteFormat === 'school' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
              >
                School/IEP
              </button>
              <button
                type="button"
                onClick={() => setNoteFormat('soap')}
                className={`${PRIMARY_BUTTON} flex-1 text-xs ${noteFormat === 'soap' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
              >
                SOAP
              </button>
            </div>

            <textarea
              value={activeNote}
              onChange={(event) => noteFormat === 'school' ? setSchoolNote(event.target.value) : setSoapNote(event.target.value)}
              rows={11}
              aria-label={noteFormat === 'school' ? 'Editable school or IEP style note' : 'Editable SOAP note'}
              className={`w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 text-sm text-slate-100 leading-relaxed select-text ${FOCUS_CLASS}`}
            />

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => copyText(activeNote)}
                className={`${PRIMARY_BUTTON} bg-slate-900 border border-slate-700 text-slate-200 flex items-center justify-center gap-2`}
              >
                <Copy size={16} />
                Copy Note
              </button>
              <button
                type="button"
                onClick={saveGuidedSession}
                className={`${PRIMARY_BUTTON} bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2`}
              >
                <Save size={16} />
                Save Locally
              </button>
            </div>
          </section>

          <section className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
            <h3 className="font-extrabold text-base text-slate-100 flex items-center gap-2 border-b border-slate-700/60 pb-3">
              <Home className="text-emerald-400" size={18} />
              Home Practice
            </h3>
            <textarea
              value={homePractice}
              onChange={(event) => setHomePractice(event.target.value)}
              rows={9}
              aria-label="Editable home practice text"
              className={`w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 text-sm text-slate-100 leading-relaxed select-text ${FOCUS_CLASS}`}
            />
            <div className="bg-white border border-blue-100 rounded-3xl p-4 text-left shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">Patient handout preview</p>
              <h4 className="text-base font-black text-slate-950 mt-1">{selectedClient?.displayName || 'Student'} practice sheet</h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                This prints as a clean one-page handout. On phones, choose <strong>Print</strong>, then <strong>Save as PDF</strong> if available.
              </p>
              <div className="mt-3 rounded-2xl bg-blue-50 border border-blue-100 p-3 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed select-text">
                {homePractice}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => copyText(homePractice)}
                className={`${PRIMARY_BUTTON} w-full bg-slate-900 border border-slate-700 text-slate-200 flex items-center justify-center gap-2`}
              >
                <Copy size={16} />
                Copy Home Practice
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className={`${PRIMARY_BUTTON} w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2`}
              >
                <Printer size={16} />
                Print / Save PDF
              </button>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed text-left">
              Generated text is a draft for clinician editing. The SLP remains responsible for clinical decisions, documentation, and family instructions.
            </p>
          </section>

          <PrintableHandout
            title="Speech Practice Sheet"
            studentName={selectedClient?.displayName}
            subtitle="Short, positive practice for home or independent review."
            sections={[
              { title: 'What We Practiced', body: homePractice.split('\n\n')[0] || `Today we practiced ${target || 'a speech target'}.` },
              { title: 'Practice Targets and Cue', body: homePractice.split('\n\n').slice(1, 3).join('\n') || homePractice },
              { title: 'Practice Schedule', body: homePractice.split('\n\n').slice(3).join('\n') || 'Practice for 5 minutes, 3 times this week.' }
            ]}
            footerNote="Practice should feel short and encouraging. The SLP reviews and edits this handout before sharing."
          />

          {saveStatus && (
            <div className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 rounded-2xl p-3 text-sm font-bold">
              {saveStatus}
            </div>
          )}

          <button
            type="button"
            onClick={resetForNextSession}
            className={`${PRIMARY_BUTTON} w-full bg-indigo-600 hover:bg-indigo-700 text-white`}
          >
            Start Another Session
          </button>

          <ProgressPanel
            client={selectedClient}
            goals={selectedClientGoals}
            sessions={selectedClientSessions}
            listenerChecks={selectedListenerChecks}
            suggestion={progressSuggestion}
            recentTrend={recentTrend}
            onDeleteClient={deleteSelectedClientData}
          />
        </div>
      )}
    </div>
  );
}

function StatsCard({ stats }: { stats: TrialStats }) {
  return (
    <div className="bg-slate-900/70 border border-slate-750 rounded-3xl p-4 space-y-3">
      <div className="grid grid-cols-4 gap-2 text-center">
        <Metric label="Total" value={stats.total.toString()} tone="text-slate-100" />
        <Metric label="Correct" value={stats.correct.toString()} tone="text-emerald-300" />
        <Metric label="Approx" value={stats.approx.toString()} tone="text-amber-300" />
        <Metric label="Not yet" value={stats.notYet.toString()} tone="text-rose-300" />
      </div>
      <div className="grid grid-cols-3 gap-2 text-center border-t border-slate-800 pt-3">
        <Metric label="Independent" value={formatPercent(stats.independentAccuracy)} tone="text-indigo-300" />
        <Metric label="Supported" value={formatPercent(stats.supportedAccuracy)} tone="text-emerald-300" />
        <Metric label="Common cue" value={prettyCue(stats.mostCommonCue)} tone="text-slate-200" small />
      </div>
    </div>
  );
}

function Metric({ label, value, tone, small = false }: { label: string; value: string; tone: string; small?: boolean }) {
  return (
    <div className="bg-slate-950/70 border border-slate-850 rounded-2xl p-2 min-h-[64px] flex flex-col justify-center">
      <span className="text-[9px] uppercase tracking-wider text-slate-500 font-extrabold">{label}</span>
      <span className={`${tone} font-black ${small ? 'text-xs leading-tight mt-1' : 'text-xl mt-0.5'}`}>{value}</span>
    </div>
  );
}

function ProgressPanel({
  client,
  goals,
  sessions,
  listenerChecks,
  suggestion,
  recentTrend,
  onDeleteClient
}: {
  client?: ClientProfile;
  goals: Goal[];
  sessions: GuidedSession[];
  listenerChecks: ListenerCheck[];
  suggestion: string;
  recentTrend: GuidedSession[];
  onDeleteClient: () => void;
}) {
  if (!client) {
    return (
      <section className="bg-slate-800 border border-dashed border-slate-700 p-6 rounded-3xl text-center">
        <BarChart3 className="mx-auto text-slate-600 mb-2" size={30} />
        <p className="text-sm text-slate-500">Create or select a client to see progress.</p>
      </section>
    );
  }

  const lastSession = sessions[0];

  return (
    <section className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-slate-700/60 pb-3">
        <h3 className="font-extrabold text-base text-slate-100 flex items-center gap-2">
          <BarChart3 className="text-indigo-400" size={18} />
          Progress
        </h3>
        <button
          type="button"
          onClick={onDeleteClient}
          className={`min-h-[40px] px-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[10px] font-bold uppercase flex items-center gap-1.5 ${FOCUS_CLASS}`}
        >
          <Trash2 size={13} />
          Delete Client Data
        </button>
      </div>

      <div className="text-left bg-slate-900/70 border border-slate-750 rounded-2xl p-4">
        <p className="text-sm font-black text-white">{client.displayName}</p>
        <p className="text-xs text-slate-400 mt-1">{client.ageGroup || 'No age group set'} · {sessions.length} guided sessions</p>
      </div>

      <div className="space-y-2 text-left">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Active goals</span>
        {goals.length === 0 ? (
          <p className="text-xs text-slate-500 bg-slate-900/60 border border-slate-800 rounded-2xl p-3">No active goals yet.</p>
        ) : goals.map(goal => (
          <div key={goal.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3">
            <p className="text-sm font-extrabold text-slate-100">{goal.targetArea}{goal.targetPhoneme ? ` · ${goal.targetPhoneme}` : ''}</p>
            <p className="text-[11px] text-slate-500">{prettyLevel(goal.level)} · {goal.accuracyCriterion || 'Clinician-defined criterion'}</p>
          </div>
        ))}
      </div>

      {lastSession ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Last independent" value={formatPercent(lastSession.independentAccuracy)} tone="text-indigo-300" />
            <Metric label="Last supported" value={formatPercent(lastSession.supportedAccuracy)} tone="text-emerald-300" />
          </div>

          <div className="space-y-2 text-left">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Accuracy over time</span>
            {recentTrend.map(session => (
              <div key={session.id} className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                  <span>{session.date}</span>
                  <span>{session.independentAccuracy}% / {session.supportedAccuracy}%</span>
                </div>
                <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-850">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(session.independentAccuracy, 100)}%` }} />
                </div>
                <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-850">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(session.supportedAccuracy, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 text-left">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Cueing trend</span>
            <div className="space-y-2">
              {sessions.slice(0, 4).map(session => (
                <p key={session.id} className="text-[11px] text-slate-400 bg-slate-900/60 border border-slate-800 rounded-xl p-2">
                  <span className="font-bold text-slate-200">{session.date}:</span> {session.cueSummary}
                </p>
              ))}
            </div>
          </div>

          <div className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-2xl text-left">
            <p className="text-xs font-extrabold uppercase tracking-wider text-indigo-200">Last session summary</p>
            <p className="text-sm text-indigo-100 mt-1">
              {lastSession.target} at {prettyLevel(lastSession.practiceLevel).toLowerCase()} level · {lastSession.totalTrials} trials · {lastSession.strategies.join(', ') || 'No strategies tagged'}.
            </p>
          </div>
        </>
      ) : (
        <p className="text-xs text-slate-500 bg-slate-900/60 border border-slate-800 rounded-2xl p-3">No guided sessions saved yet.</p>
      )}

      {listenerChecks.length > 0 && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl text-left">
          <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-200">Latest Listener Check</p>
          <p className="text-sm text-emerald-100 mt-1">
            {listenerChecks[0].score}% clear · {listenerChecks[0].confidence} confidence · {listenerChecks[0].clearItems}/{listenerChecks[0].totalItems} items.
          </p>
        </div>
      )}

      <div className="bg-slate-900/70 border border-slate-750 rounded-2xl p-4 text-left">
        <p className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Suggested next step</p>
        <p className="text-sm text-slate-200 mt-1">{suggestion}</p>
      </div>
    </section>
  );
}
