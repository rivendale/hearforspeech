import Dexie, { type Table } from 'dexie';

export interface SessionLog {
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

  // Encryption properties for database-at-rest security
  isEncrypted?: boolean;
  notesIv?: string;
  environmentIv?: string;
  repairStrategiesIv?: string;
  pccIv?: string;
  naiveListenerScoreIv?: string;
}

export interface Recording {
  id?: number;
  date: string;
  audio: Blob;
  name: string;

  // Encryption properties for database-at-rest security
  isEncrypted?: boolean;
  audioIv?: string;
  nameIv?: string;
}

export type PracticeLevel = 'sound' | 'syllable' | 'word' | 'phrase' | 'sentence' | 'conversation';
export type TrialResult = 'correct' | 'approx' | 'not_yet';
export type CueLevel = 'independent' | 'minimal' | 'moderate' | 'maximal';
export type GoalStatus = 'active' | 'paused' | 'met' | 'archived';
export type ListenerConfidence = 'low' | 'medium' | 'high';
export type AssessmentStatus = 'draft' | 'completed';
export type AssessmentTemplate = 'adolescent_speech_intelligibility' | 'rhotic_r_diagnostic' | 'connected_speech_participation' | 'school_participation_interview';
export type AssessmentItemKind = 'checklist' | 'question' | 'student_rating' | 'caregiver_interview' | 'participation' | 'speech_sample' | 'sound_probe' | 'stimulability' | 'listener_check' | 'summary';

export interface ClientProfile {
  id: string;
  displayName: string;
  initials: string;
  ageGroup?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Goal {
  id: string;
  clientId: string;
  targetArea: string;
  targetPhoneme?: string;
  level: PracticeLevel;
  accuracyCriterion?: string;
  cueingCriterion?: string;
  context?: string;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface GuidedSession {
  id: string;
  clientId: string;
  goalId?: string;
  date: string;
  durationMinutes?: number;
  setting?: string;
  practiceLevel: PracticeLevel;
  target: string;
  independentAccuracy: number;
  supportedAccuracy: number;
  totalTrials: number;
  cueSummary: string;
  strategies: string[];
  note: string;
  soapNote?: string;
  homePractice: string;
  listenerCheckScore?: number;
  listenerConfidence?: ListenerConfidence;
  sessionLogId?: number;
  createdAt: string;
}

export interface Trial {
  id: string;
  sessionId: string;
  target: string;
  practiceLevel: PracticeLevel;
  result: TrialResult;
  cueLevel: CueLevel;
  strategyTags: string[];
  notes?: string;
  createdAt: string;
}

export interface ListenerCheck {
  id: string;
  sessionId?: string;
  clientId: string;
  itemText: string;
  clearItems: number;
  totalItems: number;
  score: number;
  confidence: ListenerConfidence;
  notes?: string;
  createdAt: string;
}

export interface Assessment {
  id: string;
  clientId: string;
  template: AssessmentTemplate;
  studentAge?: number;
  primaryConcern?: string;
  setting?: string;
  timeBudgetMinutes?: number;
  focusTargets?: string[];
  clinicianNotes?: string;
  therapyIdeas?: string;
  homePractice?: string;
  consentConfirmed: boolean;
  status: AssessmentStatus;
  startedAt: string;
  completedAt?: string;
  summary?: string;
  recommendations?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentItem {
  id: string;
  assessmentId: string;
  sectionKey: string;
  sectionTitle: string;
  prompt: string;
  helperText?: string;
  scriptText?: string;
  listenFor?: string[];
  kind: AssessmentItemKind;
  status: 'not_started' | 'in_progress' | 'complete';
  result?: string;
  notes?: string;
  cueLevel?: CueLevel;
  recordingIds?: number[];
  soundTargets?: string[];
  wordPositions?: string[];
  analysisTags?: string[];
  functionalContext?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export class HearForSpeechDB extends Dexie {
  logs!: Table<SessionLog>;
  recordings!: Table<Recording>;
  clients!: Table<ClientProfile>;
  goals!: Table<Goal>;
  guidedSessions!: Table<GuidedSession>;
  trials!: Table<Trial>;
  listenerChecks!: Table<ListenerCheck>;
  assessments!: Table<Assessment>;
  assessmentItems!: Table<AssessmentItem>;

  constructor() {
    super('HearForSpeechDB');
    this.version(3).stores({
      logs: '++id, date, rating, pcc, environment',
      recordings: '++id, date, name'
    });
    this.version(4).stores({
      logs: '++id, date, rating, pcc, environment, environmentalDifficulty',
      recordings: '++id, date, name'
    });
    this.version(5).stores({
      logs: '++id, date, rating, pcc, environment, environmentalDifficulty, environmentalNoiseLevel, naiveListenerScore',
      recordings: '++id, date, name'
    });
    this.version(6).stores({
      logs: '++id, date, rating, pcc, environment, environmentalDifficulty, environmentalNoiseLevel, naiveListenerScore',
      recordings: '++id, date, name',
      clients: 'id, displayName, initials, updatedAt',
      goals: 'id, clientId, status, targetArea, targetPhoneme, level, updatedAt',
      guidedSessions: 'id, clientId, goalId, date, createdAt, target, practiceLevel',
      trials: 'id, sessionId, createdAt, result, cueLevel',
      listenerChecks: 'id, clientId, sessionId, createdAt, score'
    });
    this.version(7).stores({
      logs: '++id, date, rating, pcc, environment, environmentalDifficulty, environmentalNoiseLevel, naiveListenerScore',
      recordings: '++id, date, name',
      clients: 'id, displayName, initials, updatedAt',
      goals: 'id, clientId, status, targetArea, targetPhoneme, level, updatedAt',
      guidedSessions: 'id, clientId, goalId, date, createdAt, target, practiceLevel',
      trials: 'id, sessionId, createdAt, result, cueLevel',
      listenerChecks: 'id, clientId, sessionId, createdAt, score',
      assessments: 'id, clientId, template, status, startedAt, updatedAt',
      assessmentItems: 'id, assessmentId, sectionKey, kind, status, sortOrder, updatedAt'
    });
  }
}

export const db = new HearForSpeechDB();

export interface BackupPayload {
  appName: string;
  exportedAt: string;
  data: {
    logs: SessionLog[];
    clients?: ClientProfile[];
    goals?: Goal[];
    guidedSessions?: GuidedSession[];
    trials?: Trial[];
    listenerChecks?: ListenerCheck[];
    assessments?: Assessment[];
    assessmentItems?: AssessmentItem[];
    recordings: {
      id?: number;
      date: string;
      name: string;
      audioBase64: string;
    }[];
  };
}
