export interface AdvancedAnalysisEngine {
  name: string;
  available: boolean;
  version?: string | null;
  note?: string | null;
}

export interface AnalysisCapabilities {
  service: string;
  version: string;
  default_retention: string;
  engines: AdvancedAnalysisEngine[];
  endpoints: string[];
  limits?: {
    max_upload_mb: number;
    max_batch_files: number;
    default_retention: string;
    accepted_audio_types: string[];
  } | null;
  workflow_notes?: string[];
  clinical_notice: string;
}

export interface AdvancedAnalysisMetrics {
  duration_seconds: number;
  sample_rate_hz?: number | null;
  channels?: number | null;
  rms_amplitude?: number | null;
  peak_amplitude?: number | null;
  zero_crossing_rate?: number | null;
  mean_intensity_db?: number | null;
  pitch_mean_hz?: number | null;
  pitch_min_hz?: number | null;
  pitch_max_hz?: number | null;
  voiced_fraction?: number | null;
  harmonics_to_noise_ratio_db?: number | null;
  jitter_local?: number | null;
  shimmer_local?: number | null;
}

export interface AnalysisReviewFact {
  label: string;
  value: string;
  unit?: string | null;
  source: string;
  caution?: string | null;
}

export interface AdvancedAnalysisResult {
  job_id: string;
  request_id?: string | null;
  status: 'complete' | 'failed';
  prompt_text: string;
  filename: string;
  content_type?: string | null;
  engine: AdvancedAnalysisEngine;
  metrics: AdvancedAnalysisMetrics | null;
  review_facts?: AnalysisReviewFact[];
  warnings: string[];
  clinician_summary: string;
  clinical_notice: string;
}

export interface SpeechSoundCandidate {
  target: string;
  target_word?: string | null;
  word_position?: string | null;
  category?: string | null;
  expected?: string | null;
  observed?: string | null;
  error_type:
    | 'possible_substitution'
    | 'possible_omission'
    | 'possible_distortion'
    | 'possible_cluster_reduction'
    | 'possible_rate_or_intelligibility'
    | 'needs_review';
  confidence: 'low' | 'medium' | 'high';
  score: number;
  evidence: string[];
  start_seconds?: number | null;
  end_seconds?: number | null;
  review_prompt: string;
}

export interface SpeechSoundAnalysisResult {
  job_id: string;
  request_id?: string | null;
  status: 'complete' | 'failed';
  prompt_text: string;
  filename: string;
  content_type?: string | null;
  engines: AdvancedAnalysisEngine[];
  metrics: AdvancedAnalysisMetrics | null;
  possible_errors: SpeechSoundCandidate[];
  review_facts: AnalysisReviewFact[];
  warnings: string[];
  clinician_summary: string;
  clinical_notice: string;
}

export interface AssessmentSessionAnalysisItemInput {
  id: string;
  prompt: string;
  section_title?: string;
  kind?: string;
  result?: string;
  notes?: string;
  cue_level?: string;
  recording_filename?: string;
}

export interface AssessmentSessionAnalysisItemResult {
  item_id: string;
  prompt: string;
  status: 'complete' | 'no_recording' | 'failed';
  analysis: AdvancedAnalysisResult | null;
  warnings: string[];
  summary_facts: string[];
  review_facts?: AnalysisReviewFact[];
}

export interface AssessmentSessionAnalysisResult {
  job_id: string;
  request_id?: string | null;
  status: 'complete' | 'partial' | 'failed';
  assessment_id?: string | null;
  client_label?: string | null;
  total_items: number;
  analyzed_items: number;
  item_results: AssessmentSessionAnalysisItemResult[];
  summary_ready_facts: string[];
  warnings: string[];
  clinical_notice: string;
}

export const PUBLIC_ANALYSIS_API_URL = 'https://api.hearforspeech.com';

const trimTrailingSlash = (url: string) => url.replace(/\/+$/, '');

const isLocalUrl = (url: string) => {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname);
  } catch {
    return false;
  }
};

export const getDefaultAnalysisApiUrl = () => (
  (() => {
    const envUrl = (import.meta.env.VITE_HFS_ANALYSIS_API_URL as string | undefined)?.trim();
    const storedUrl = localStorage.getItem('hfs_analysis_api_url')?.trim();
    const candidate = envUrl || storedUrl || PUBLIC_ANALYSIS_API_URL;

    if (!import.meta.env.DEV && isLocalUrl(candidate)) {
      localStorage.removeItem('hfs_analysis_api_url');
      return PUBLIC_ANALYSIS_API_URL;
    }

    return candidate;
  })()
);

export const getAnalysisApiKey = () => (
  (import.meta.env.VITE_HFS_ANALYSIS_API_KEY as string | undefined)?.trim() || ''
);

export async function fetchAnalysisCapabilities(apiUrl = getDefaultAnalysisApiUrl()): Promise<AnalysisCapabilities> {
  const response = await fetch(`${trimTrailingSlash(apiUrl)}/v1/capabilities`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Analysis API status check failed (${response.status}).`);
  }

  return response.json() as Promise<AnalysisCapabilities>;
}

export async function fetchAnalysisHealth(apiUrl = getDefaultAnalysisApiUrl()): Promise<{ status: string; service: string; version: string }> {
  const response = await fetch(`${trimTrailingSlash(apiUrl)}/health`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Analysis API health check failed (${response.status}).`);
  }

  return response.json() as Promise<{ status: string; service: string; version: string }>;
}

export async function submitAdvancedAnalysis({
  apiUrl,
  apiKey,
  audio,
  filename,
  promptText
}: {
  apiUrl: string;
  apiKey?: string;
  audio: Blob;
  filename: string;
  promptText: string;
}): Promise<AdvancedAnalysisResult> {
  const endpoint = `${trimTrailingSlash(apiUrl)}/v1/analysis/parselmouth`;
  const formData = new FormData();
  formData.append('file', audio, filename);
  formData.append('prompt_text', promptText);
  formData.append('consent_confirmed', 'true');
  formData.append('retention_policy', 'temporary');

  const headers: HeadersInit = {};
  if (apiKey) headers['X-HFS-API-Key'] = apiKey;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: formData
  });

  if (!response.ok) {
    let message = `Advanced analysis failed (${response.status}).`;
    try {
      const error = await response.json();
      if (error?.detail) message = error.detail;
    } catch {
      // Keep default message.
    }
    throw new Error(message);
  }

  return response.json() as Promise<AdvancedAnalysisResult>;
}

export async function submitSpeechSoundPatternAnalysis({
  apiUrl,
  apiKey,
  audio,
  filename,
  promptText
}: {
  apiUrl: string;
  apiKey?: string;
  audio: Blob;
  filename: string;
  promptText: string;
}): Promise<SpeechSoundAnalysisResult> {
  const endpoint = `${trimTrailingSlash(apiUrl)}/v1/analysis/speech-sound-patterns`;
  const formData = new FormData();
  formData.append('file', audio, filename);
  formData.append('prompt_text', promptText);
  formData.append('consent_confirmed', 'true');
  formData.append('retention_policy', 'temporary');

  const headers: HeadersInit = {};
  if (apiKey) headers['X-HFS-API-Key'] = apiKey;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: formData
  });

  if (!response.ok) {
    let message = `Speech-sound analysis failed (${response.status}).`;
    try {
      const error = await response.json();
      if (error?.detail) message = error.detail;
    } catch {
      // Keep default message.
    }
    throw new Error(message);
  }

  return response.json() as Promise<SpeechSoundAnalysisResult>;
}

export async function submitAssessmentSessionAnalysis({
  apiUrl,
  apiKey,
  assessment,
  recordings
}: {
  apiUrl: string;
  apiKey?: string;
  assessment: {
    assessment_id?: string;
    client_label?: string;
    items: AssessmentSessionAnalysisItemInput[];
  };
  recordings: Array<{
    itemId: string;
    audio: Blob;
    filename?: string;
  }>;
}): Promise<AssessmentSessionAnalysisResult> {
  const endpoint = `${trimTrailingSlash(apiUrl)}/v1/analysis/assessment-session`;
  const formData = new FormData();
  formData.append('assessment_json', JSON.stringify(assessment));
  formData.append('consent_confirmed', 'true');
  formData.append('retention_policy', 'temporary');

  recordings.forEach(recording => {
    formData.append('files', recording.audio, recording.filename || `${recording.itemId}.webm`);
  });

  const headers: HeadersInit = {};
  if (apiKey) headers['X-HFS-API-Key'] = apiKey;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: formData
  });

  if (!response.ok) {
    let message = `Assessment session analysis failed (${response.status}).`;
    try {
      const error = await response.json();
      if (error?.detail) message = error.detail;
    } catch {
      // Keep default message.
    }
    throw new Error(message);
  }

  return response.json() as Promise<AssessmentSessionAnalysisResult>;
}

const formatNumber = (value: number | null | undefined, digits = 2) => (
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'not available'
);

export const formatAdvancedAnalysisForNotes = (result: AdvancedAnalysisResult) => {
  const metrics = result.metrics;
  if (!metrics) {
    return `Advanced analysis: ${result.clinician_summary}\n${result.clinical_notice}`;
  }

  const lines = [
    `Advanced analysis (${result.engine.name}): ${result.clinician_summary}`,
    `Duration: ${formatNumber(metrics.duration_seconds)} sec`,
    `Mean pitch: ${formatNumber(metrics.pitch_mean_hz, 1)} Hz`,
    `Mean intensity: ${formatNumber(metrics.mean_intensity_db, 1)} dB`,
    `Voiced fraction: ${formatNumber(metrics.voiced_fraction)}`,
    `HNR: ${formatNumber(metrics.harmonics_to_noise_ratio_db, 1)} dB`,
    `Jitter local: ${formatNumber(metrics.jitter_local, 4)}`,
    `Shimmer local: ${formatNumber(metrics.shimmer_local, 4)}`,
    result.warnings.length ? `Warnings: ${result.warnings.join('; ')}` : '',
    result.clinical_notice
  ];

  return lines.filter(Boolean).join('\n');
};

export const formatSpeechSoundAnalysisForNotes = (result: SpeechSoundAnalysisResult) => {
  const metrics = result.metrics;
  const candidates = result.possible_errors.length
    ? result.possible_errors.map(candidate => (
      `${candidate.target_word ? `${candidate.target_word} ` : ''}${candidate.target}: ${candidate.error_type.replaceAll('_', ' ')} (${candidate.confidence}, score ${candidate.score.toFixed(2)}); ${candidate.review_prompt}`
    ))
    : ['No possible speech-sound error candidates were returned.'];

  const lines = [
    `Speech-sound analysis: ${result.clinician_summary}`,
    metrics ? `Duration: ${formatNumber(metrics.duration_seconds)} sec` : '',
    metrics?.pitch_mean_hz ? `Mean pitch: ${formatNumber(metrics.pitch_mean_hz, 1)} Hz` : '',
    metrics?.mean_intensity_db ? `Mean intensity: ${formatNumber(metrics.mean_intensity_db, 1)} dB` : '',
    `Possible error candidates for SLP review:\n${candidates.join('\n')}`,
    result.warnings.length ? `Warnings: ${result.warnings.join('; ')}` : '',
    result.clinical_notice
  ];

  return lines.filter(Boolean).join('\n');
};
