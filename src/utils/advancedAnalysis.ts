export interface AdvancedAnalysisEngine {
  name: string;
  available: boolean;
  version?: string | null;
  note?: string | null;
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

export interface AdvancedAnalysisResult {
  job_id: string;
  status: 'complete' | 'failed';
  prompt_text: string;
  filename: string;
  content_type?: string | null;
  engine: AdvancedAnalysisEngine;
  metrics: AdvancedAnalysisMetrics | null;
  warnings: string[];
  clinician_summary: string;
  clinical_notice: string;
}

const trimTrailingSlash = (url: string) => url.replace(/\/+$/, '');

export const getDefaultAnalysisApiUrl = () => (
  (import.meta.env.VITE_HFS_ANALYSIS_API_URL as string | undefined)?.trim() ||
  localStorage.getItem('hfs_analysis_api_url') ||
  'https://api.hearforspeech.com'
);

export const getAnalysisApiKey = () => (
  (import.meta.env.VITE_HFS_ANALYSIS_API_KEY as string | undefined)?.trim() || ''
);

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
