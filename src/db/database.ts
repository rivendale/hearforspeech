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

export class HearForSpeechDB extends Dexie {
  logs!: Table<SessionLog>;
  recordings!: Table<Recording>;

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
  }
}

export const db = new HearForSpeechDB();

export interface BackupPayload {
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
