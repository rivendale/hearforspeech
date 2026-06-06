import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Square, Play, Pause, Trash2, Edit3, Check, X, Activity } from 'lucide-react';
import { db, type Recording } from '../db/database';
import { useStore } from '../store/useStore';
import { getSharedAudioContext } from '../utils/audio';
import { encryptRecording, decryptRecording } from '../utils/crypto';

// --- Phoneme Configurations (Late 8 Sounds) ---
interface PhonemeConfig {
  sound: string;
  label: string;
  description: string;
  waveFunc: (x: number, phase: number, width: number, height: number) => number;
}

const PHONEMES: PhonemeConfig[] = [
  { 
    sound: 'none', 
    label: 'No Calibration Target (Active View)', 
    description: 'Displays raw live dynamic waveform without clinical overlay.',
    waveFunc: () => 0 
  },
  { 
    sound: '/r/', 
    label: 'Target /r/ (Rhotic)', 
    description: 'Requires low F3 dip. Focus on retroflex/bunched tongue posture.',
    waveFunc: (x, _phase, _width, height) => {
      const base = Math.sin(x * 0.04) * 16;
      const high = Math.sin(x * 0.12) * 6;
      const modulation = Math.sin(x * 0.005) * 0.5 + 0.5;
      return height / 2 + (base + high) * modulation;
    }
  },
  { 
    sound: '/s/', 
    label: 'Target /s/ (Sibilant)', 
    description: 'Requires high-frequency friction wave. Focus on narrow airflow channel.',
    waveFunc: (x, _phase, _width, height) => {
      const noise = (Math.sin(x * 0.25) + Math.cos(x * 0.45)) * 6;
      const envelope = Math.sin(x * 0.02) * 10 + 12;
      return height / 2 + noise * (envelope / 12);
    }
  },
  { 
    sound: '/z/', 
    label: 'Target /z/ (Voiced Sibilant)', 
    description: 'Blends fundamental voicing and high-frequency friction. Focus on vocal fold vibration.',
    waveFunc: (x, _phase, _width, height) => {
      const voice = Math.sin(x * 0.035) * 15;
      const noise = Math.sin(x * 0.32) * 4;
      return height / 2 + voice + noise;
    }
  },
  { 
    sound: '/l/', 
    label: 'Target /l/ (Lateral)', 
    description: 'Smooth double-peak formant shape. Focus on tongue tip contact.',
    waveFunc: (x, _phase, _width, height) => {
      const f1 = Math.sin(x * 0.03) * 14;
      const f2 = Math.sin(x * 0.07) * 7;
      return height / 2 + f1 + f2;
    }
  },
  { 
    sound: '/th/', 
    label: 'Target /th/ (Dental)', 
    description: 'Continuous low-amplitude dental friction. Light tongue tip extension.',
    waveFunc: (x, _phase, _width, height) => {
      const fuzz = Math.sin(x * 0.28) * 3.5 * Math.sin(x * 0.015);
      return height / 2 + fuzz;
    }
  },
  { 
    sound: '/sh/', 
    label: 'Target /sh/ (Palato-alveolar)', 
    description: 'Requires broad noise spectrum with lower frequency focus than /s/.',
    waveFunc: (x, _phase, _width, height) => {
      const noise = (Math.sin(x * 0.16) + Math.cos(x * 0.26)) * 8.5;
      return height / 2 + noise;
    }
  },
  { 
    sound: '/ch/', 
    label: 'Target /ch/ (Affricate)', 
    description: 'Represents rapid stop release burst. Instantaneous compression.',
    waveFunc: (x, _phase, width, height) => {
      const burst = Math.sin(x * 0.09) * 16 * Math.exp(-Math.pow((x - width / 2) / (width / 5), 2));
      return height / 2 + burst;
    }
  },
  { 
    sound: '/zh/', 
    label: 'Target /zh/ (Voiced Palato-alveolar)', 
    description: 'Voiced friction wave (e.g., middle sound of "measure").',
    waveFunc: (x, _phase, _width, height) => {
      const voice = Math.sin(x * 0.03) * 12;
      const noise = Math.sin(x * 0.18) * 5.5;
      return height / 2 + voice + noise;
    }
  }
];

export function VisualizerTab() {
  const [isRecording, setIsRecording] = useState(false);
  const [savedRecordings, setSavedRecordings] = useState<Recording[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<number | null>(null);
  const [selectedPhoneme, setSelectedPhoneme] = useState<string>('none');
  
  // Inline editing state for recording name
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  // Background Noise Practice states
  const [isNoiseEnabled, setIsNoiseEnabled] = useState(() => localStorage.getItem('hfs_noise_enabled') === 'true');
  const [noiseLevel, setNoiseLevel] = useState(() => parseInt(localStorage.getItem('hfs_noise_level') || '30'));

  // Refs for Web Audio API & MediaRecorder
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  // Background Noise Synthesizer Refs
  const noiseSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const noiseGainRef = useRef<GainNode | null>(null);
  const osc1Ref = useRef<OscillatorNode | null>(null);
  const osc2Ref = useRef<OscillatorNode | null>(null);
  const lfoRef = useRef<OscillatorNode | null>(null);

  const { masterKey } = useStore();

  const loadRecordings = useCallback(async () => {
    try {
      let recs = await db.recordings.toArray();
      if (masterKey) {
        recs = await Promise.all(
          recs.map(rec => decryptRecording(rec, masterKey))
        );
      }
      setSavedRecordings(recs);
    } catch (err) {
      console.error("Failed to load recordings:", err);
    }
  }, [masterKey]);

  // Stop background synthesizer noise
  const stopSynthNoise = useCallback(() => {
    try {
      if (noiseSourceRef.current) {
        noiseSourceRef.current.stop();
        noiseSourceRef.current.disconnect();
        noiseSourceRef.current = null;
      }
      if (osc1Ref.current) {
        osc1Ref.current.stop();
        osc1Ref.current.disconnect();
        osc1Ref.current = null;
      }
      if (osc2Ref.current) {
        osc2Ref.current.stop();
        osc2Ref.current.disconnect();
        osc2Ref.current = null;
      }
      if (lfoRef.current) {
        lfoRef.current.stop();
        lfoRef.current.disconnect();
        lfoRef.current = null;
      }
      if (noiseGainRef.current) {
        noiseGainRef.current.disconnect();
        noiseGainRef.current = null;
      }
    } catch {
      // Ignored if nodes are already stopped
    }
  }, []);

  // Start background synthesizer noise
  const startSynthNoise = useCallback((level: number) => {
    try {
      const ctx = getSharedAudioContext();
      stopSynthNoise();

      // Synthesize noise buffer
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = buffer;
      noiseSource.loop = true;
      noiseSourceRef.current = noiseSource;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(450, ctx.currentTime);

      const osc1 = ctx.createOscillator();
      osc1.frequency.setValueAtTime(125, ctx.currentTime);
      osc1Ref.current = osc1;

      const osc2 = ctx.createOscillator();
      osc2.frequency.setValueAtTime(210, ctx.currentTime);
      osc2Ref.current = osc2;

      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.25, ctx.currentTime);
      lfoRef.current = lfo;

      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(0.2, ctx.currentTime);

      const chatterGain = ctx.createGain();
      chatterGain.gain.setValueAtTime(0.08, ctx.currentTime);

      lfo.connect(lfoGain);
      lfoGain.connect(chatterGain.gain);

      const noiseGain = ctx.createGain();
      const targetGain = (level / 100) * 0.25;
      noiseGain.gain.setValueAtTime(targetGain, ctx.currentTime);
      noiseGainRef.current = noiseGain;

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);

      osc1.connect(chatterGain);
      osc2.connect(chatterGain);
      chatterGain.connect(noiseGain);

      noiseGain.connect(ctx.destination);

      noiseSource.start();
      osc1.start();
      osc2.start();
      lfo.start();
    } catch (err) {
      console.error("Failed to start environmental noise:", err);
    }
  }, [stopSynthNoise]);

  // Sync synthesizer states to localStorage and trigger toggle
  useEffect(() => {
    localStorage.setItem('hfs_noise_enabled', String(isNoiseEnabled));
    localStorage.setItem('hfs_noise_level', String(noiseLevel));

    if (isNoiseEnabled) {
      startSynthNoise(noiseLevel);
    } else {
      stopSynthNoise();
    }
  }, [isNoiseEnabled, noiseLevel, startSynthNoise, stopSynthNoise]);

  // Drawing the visual bands for F2 and F3
  const drawFormantBands = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (selectedPhoneme !== '/r/') return;

    const freqToY = (f: number) => height - ((f - 1000) / (3000 - 1000)) * height;
    const yF2 = freqToY(1600);
    const yF3 = freqToY(2200);

    ctx.fillStyle = 'rgba(99, 102, 241, 0.08)';
    ctx.fillRect(0, yF2 - 10, width, 20);
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(0, yF2);
    ctx.lineTo(width, yF2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(236, 72, 153, 0.08)';
    ctx.fillRect(0, yF3 - 10, width, 20);
    ctx.strokeStyle = 'rgba(236, 72, 153, 0.3)';
    ctx.beginPath();
    ctx.moveTo(0, yF3);
    ctx.lineTo(width, yF3);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = 'bold 9px sans-serif';
    ctx.fillStyle = 'rgba(165, 180, 252, 0.6)';
    ctx.fillText('F2 (Rhotic Target) ~1600Hz', 12, yF2 + 3);
    ctx.fillStyle = 'rgba(252, 165, 203, 0.6)';
    ctx.fillText('F3 (Rhotic Pinch) ~2200Hz', 12, yF3 + 3);
  }, [selectedPhoneme]);

  // Drawing the static target wave overlay on canvas
  const drawTargetOverlay = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (selectedPhoneme === 'none') return;
    const pConfig = PHONEMES.find(p => p.sound === selectedPhoneme);
    if (!pConfig) return;

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(236, 72, 153, 0.75)'; // Pink-500 glowing color
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 8]); // Dashed line for outline targeting

    for (let x = 0; x < width; x++) {
      const y = pConfig.waveFunc(x, 0, width, height); // static target wave (phase 0)
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    
    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash
  }, [selectedPhoneme]);

  // Drawing the Standby Sine Waves
  const drawStandby = useCallback(() => {
    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
    }
    
    let phase = 0;
    const draw = () => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      
      ctx.fillStyle = '#0f172a'; // matches bg-slate-900
      ctx.fillRect(0, 0, width, height);

      // Grid background lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      for (let i = 0; i < width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
        ctx.stroke();
      }
      for (let i = 0; i < height; i += 30) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(width, i);
        ctx.stroke();
      }

      // Draw formant targets if /r/
      drawFormantBands(ctx, width, height);

      // 3 overlapping standby waves
      const colors = ['rgba(99, 102, 241, 0.6)', 'rgba(168, 85, 247, 0.4)', 'rgba(236, 72, 153, 0.2)'];
      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        ctx.lineWidth = layer === 0 ? 2.5 : 1.5;
        ctx.strokeStyle = colors[layer];
        
        const amplitude = 12 + layer * 6;
        const frequency = 0.01 + layer * 0.003;
        
        for (let x = 0; x < width; x++) {
          const y = height / 2 + Math.sin(x * frequency + phase + layer * 2) * amplitude;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Render the dashed target overlay if a phoneme is selected
      drawTargetOverlay(ctx, width, height);

      phase += 0.03;
      animationRef.current = window.requestAnimationFrame(draw);
    };
    draw();
  }, [drawTargetOverlay, drawFormantBands]);

  // Drawing the Active Audio Waves
  const drawActive = useCallback((analyser: AnalyserNode) => {
    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
    }

    const bufferLength = analyser.frequencyBinCount;
    const timeDataArray = new Uint8Array(bufferLength);
    const freqDataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      analyser.getByteTimeDomainData(timeDataArray);

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);

      // Grid background lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      for (let i = 0; i < width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
        ctx.stroke();
      }

      // Draw formant target zones
      drawFormantBands(ctx, width, height);
      
      // Zero line
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Dynamic path
      ctx.beginPath();
      ctx.lineWidth = 3.5;
      
      // Indigo -> Cyan -> Emerald Gradient
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, '#6366f1'); // Indigo
      gradient.addColorStop(0.5, '#06b6d4'); // Cyan
      gradient.addColorStop(1, '#10b981'); // Emerald
      ctx.strokeStyle = gradient;

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = timeDataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);

        x += sliceWidth;
      }

      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Formant Peak & Coarticulation detection
      if (selectedPhoneme === '/r/') {
        analyser.getByteFrequencyData(freqDataArray);

        const sampleRate = analyser.context.sampleRate;
        const fftSize = analyser.fftSize;
        const getBin = (f: number) => Math.round((f * fftSize) / sampleRate);

        // Find F2 Peak
        const binF2Min = getBin(1400);
        const binF2Max = getBin(1800);
        let maxValF2 = 0;
        let maxBinF2 = binF2Min;
        for (let i = binF2Min; i <= binF2Max; i++) {
          if (freqDataArray[i] > maxValF2) {
            maxValF2 = freqDataArray[i];
            maxBinF2 = i;
          }
        }
        const peakF2 = (maxBinF2 * sampleRate) / fftSize;

        // Find F3 Peak
        const binF3Min = getBin(2000);
        const binF3Max = getBin(2400);
        let maxValF3 = 0;
        let maxBinF3 = binF3Min;
        for (let i = binF3Min; i <= binF3Max; i++) {
          if (freqDataArray[i] > maxValF3) {
            maxValF3 = freqDataArray[i];
            maxBinF3 = i;
          }
        }
        const peakF3 = (maxBinF3 * sampleRate) / fftSize;

        const freqToY = (f: number) => height - ((f - 1000) / (3000 - 1000)) * height;

        // If vocal energy is detected, draw formant dots
        if (maxValF2 > 45 && maxValF3 > 45) {
          // Draw F2 dot
          ctx.fillStyle = '#38bdf8'; // sky-400
          ctx.beginPath();
          ctx.arc(width * 0.38, freqToY(peakF2), 5, 0, 2 * Math.PI);
          ctx.fill();

          // Draw F3 dot
          ctx.fillStyle = '#f472b6'; // pink-400
          ctx.beginPath();
          ctx.arc(width * 0.62, freqToY(peakF3), 5, 0, 2 * Math.PI);
          ctx.fill();

          // Check for coarticulation pinching
          if (Math.abs(peakF3 - peakF2) < 450) {
            // Success overlay borders
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
            ctx.lineWidth = 4;
            ctx.strokeRect(0, 0, width, height);

            // Draw line connecting formants
            ctx.strokeStyle = '#10b981'; // emerald-500
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(width * 0.38, freqToY(peakF2));
            ctx.lineTo(width * 0.62, freqToY(peakF3));
            ctx.stroke();

            // Success Label
            ctx.fillStyle = '#34d399'; // emerald-400
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText('✨ /r/ COARTICULATION PINCH ACQUIRED! ✨', width / 2 - 110, 26);
          }
        }
      }

      // Draw static target template on top
      drawTargetOverlay(ctx, width, height);

      animationRef.current = window.requestAnimationFrame(draw);
    };
    draw();
  }, [drawTargetOverlay, drawFormantBands, selectedPhoneme]);

  useEffect(() => {
    let active = true;
    db.recordings.toArray().then(async (recs) => {
      let finalRecs = recs;
      if (masterKey) {
        finalRecs = await Promise.all(
          recs.map(rec => decryptRecording(rec, masterKey))
        );
      }
      if (active) {
        setSavedRecordings(finalRecs);
      }
    }).catch(console.error);
    
    // Start canvas in Standby mode immediately
    drawStandby();

    return () => {
      active = false;
      // Cleanup visualizer context & animations on unmount
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      // Cleanup background synthesizer
      stopSynthNoise();
    };
  }, [drawStandby, stopSynthNoise, masterKey]);

  // Timer effect when recording
  useEffect(() => {
    let interval: number | undefined;
    if (isRecording) {
      interval = window.setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval !== undefined) {
        window.clearInterval(interval);
      }
      setSeconds(0); // Safely reset timer state
    };
  }, [isRecording]);

  const startRecording = async () => {
    try {
      const consentConfirmed = confirm(
        "Recording consent reminder: make sure you have appropriate student/client or caregiver consent before recording audio. Saved recordings stay local to this device unless exported. Continue?"
      );
      if (!consentConfirmed) return;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = getSharedAudioContext();
      
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      drawActive(analyser);

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const dateStr = new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
        const phonemeText = selectedPhoneme !== 'none' ? ` (${selectedPhoneme})` : '';
        const newRec: Recording = { 
          date: dateStr, 
          audio: blob, 
          name: `Speech Recording${phonemeText} - ${dateStr}` 
        };

        const finalRec = masterKey ? await encryptRecording(newRec, masterKey) : newRec;
        await db.recordings.add(finalRec);
        loadRecordings();
        
        // Cleanup mic streams
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access denied or audio error:', err);
      alert('Microphone access is required to use acoustic biofeedback.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    drawStandby();
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const togglePlayback = (rec: Recording) => {
    if (currentlyPlayingId === rec.id) {
      activeAudioRef.current?.pause();
      setCurrentlyPlayingId(null);
    } else {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
      }
      const audioUrl = URL.createObjectURL(rec.audio);
      const audio = new Audio(audioUrl);
      activeAudioRef.current = audio;
      audio.play().catch(console.error);
      setCurrentlyPlayingId(rec.id ?? null);
      
      audio.onended = () => {
        setCurrentlyPlayingId(null);
      };
    }
  };

  const startEditing = (rec: Recording) => {
    if (rec.id !== undefined) {
      setEditingId(rec.id);
      setEditName(rec.name);
    }
  };

  const saveName = async (id: number) => {
    if (editName.trim()) {
      await db.recordings.update(id, { name: editName.trim() });
      setEditingId(null);
      loadRecordings();
    }
  };

  const deleteRecording = async (id: number) => {
    if (confirm("Are you sure you want to delete this recording?")) {
      await db.recordings.delete(id);
      loadRecordings();
    }
  };

  const currentPhonemeConfig = PHONEMES.find(p => p.sound === selectedPhoneme);

  return (
    <div className="space-y-5">
      {/* Target Phoneme Dropdown Selector */}
      <div className="bg-slate-800 border border-slate-700/80 p-4 rounded-3xl shadow-lg space-y-2">
        <label className="block text-xs font-bold text-slate-400 tracking-widest uppercase">
          Target Sound:
        </label>
        <select 
          value={selectedPhoneme}
          onChange={(e) => setSelectedPhoneme(e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 hover:border-slate-600 rounded-xl p-3 text-sm font-semibold text-slate-200 focus:border-indigo-500 focus:outline-none min-h-[44px]"
        >
          {PHONEMES.map(p => (
            <option key={p.sound} value={p.sound}>{p.label}</option>
          ))}
        </select>
        {selectedPhoneme !== 'none' && currentPhonemeConfig && (
          <p className="text-[11px] text-indigo-400 font-medium italic mt-1 leading-relaxed text-left">
            {currentPhonemeConfig.description}
          </p>
        )}
      </div>

      {/* Visualizer Canvas Area */}
      <div className="relative bg-slate-800 rounded-3xl overflow-hidden border border-slate-700 shadow-xl shadow-slate-950/50">
        <canvas 
          ref={canvasRef} 
          width={400} 
          height={160} 
          className="w-full h-40 block"
        />
        
        {/* Status overlay */}
        <div className="absolute top-4 left-4 flex items-center gap-2 bg-slate-950/70 backdrop-blur-md px-2.5 py-1 rounded-full border border-slate-800">
          {isRecording ? (
            <>
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
              </span>
              <span className="text-[10px] font-bold text-red-400 tracking-wider uppercase">Active</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
              <span className="text-[10px] font-bold text-indigo-400 tracking-wider uppercase">Standby</span>
            </>
          )}
        </div>

        {/* Selected Phoneme Indicator Overlay */}
        {selectedPhoneme !== 'none' && (
          <div className="absolute top-4 right-4 bg-pink-500/10 border border-pink-500/35 px-2.5 py-1 rounded-full text-pink-400 text-[10px] font-bold tracking-widest uppercase">
            Target: {selectedPhoneme}
          </div>
        )}

        {/* Monospace Timer Overlay */}
        <div className="absolute bottom-4 right-4 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-xl border border-slate-805">
          <span className="font-mono text-sm font-bold text-indigo-300">
            {formatTime(seconds)}
          </span>
        </div>
      </div>

      {/* Background Noise Practice Panel */}
      <div className="bg-slate-800 border border-slate-700/80 p-4.5 rounded-3xl shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="text-indigo-400 animate-pulse" size={16} />
            <span className="text-xs font-bold text-slate-350 tracking-wider uppercase">Background Noise Practice</span>
          </div>
          {/* Toggle Switch */}
          <button
            onClick={() => setIsNoiseEnabled(!isNoiseEnabled)}
            className={`px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest border transition active:scale-95 min-h-[30px] ${
              isNoiseEnabled
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-400'
            }`}
          >
            {isNoiseEnabled ? 'Noise On' : 'Noise Off'}
          </button>
        </div>

        <p className="text-[10px] text-slate-400 leading-relaxed font-normal text-left">
          Adds synthesized room noise for optional practice in a more realistic listening environment.
        </p>

        {isNoiseEnabled && (
          <div className="space-y-1.5 pt-1 animate-fadeIn">
            <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase">
              <span>Background Noise Level:</span>
              <span className="font-mono text-indigo-400">{noiseLevel}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={noiseLevel}
              onChange={(e) => setNoiseLevel(parseInt(e.target.value))}
              className="w-full accent-indigo-500 h-1 bg-slate-900 rounded-lg cursor-pointer"
            />
          </div>
        )}
      </div>

      {/* Primary Record Button Trigger */}
      <div className="flex justify-center">
        {!isRecording ? (
          <button 
            onClick={startRecording} 
            className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-indigo-500 via-purple-550 to-pink-500 hover:from-indigo-600 hover:to-pink-600 text-white font-bold py-4.5 px-8 rounded-2xl shadow-xl shadow-indigo-500/10 active:scale-98 transition-all duration-300 min-h-[48px]"
          >
            <Mic size={22} className="animate-pulse" />
            <span className="text-sm tracking-wider uppercase">Start Biofeedback Recording</span>
          </button>
        ) : (
          <button 
            onClick={stopRecording} 
            className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-rose-500 to-red-650 hover:from-rose-600 hover:to-red-700 text-white font-bold py-4.5 px-8 rounded-2xl shadow-xl shadow-red-500/15 active:scale-98 transition-all duration-300 animate-pulse min-h-[48px]"
          >
            <Square size={18} />
            <span className="text-sm tracking-wider uppercase">Stop & Save Recording</span>
          </button>
        )}
      </div>

      {/* Saved Audio List Section */}
      <div className="space-y-3">
        <h3 className="font-bold text-sm text-slate-400 tracking-widest uppercase flex items-center gap-2">
          <span>Saved Recordings</span>
          <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full text-[10px] font-bold">
            {savedRecordings.length}
          </span>
        </h3>
        
        {savedRecordings.length === 0 ? (
          <div className="bg-slate-855/40 border border-dashed border-slate-800 p-8 rounded-2xl text-center">
            <Mic className="mx-auto text-slate-600 mb-2" size={32} />
            <p className="text-sm text-slate-500">No session recordings cached.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {savedRecordings.map((rec) => (
              <div 
                key={rec.id} 
                className="bg-slate-800/50 border border-slate-700/50 p-3.5 rounded-2xl flex items-center justify-between gap-3 hover:border-slate-600 transition-all duration-300 shadow-md"
              >
                {/* Audio Item Info */}
                <div className="flex-1 min-w-0 text-left">
                  {editingId === rec.id ? (
                    <div className="flex items-center gap-1.5">
                      <input 
                        type="text" 
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm font-semibold text-white focus:outline-none focus:border-indigo-500 w-full min-h-[36px]"
                        autoFocus
                      />
                      <button 
                        onClick={() => saveName(rec.id!)} 
                        className="p-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white min-h-[36px] min-w-[36px] flex items-center justify-center"
                      >
                        <Check size={16} />
                      </button>
                      <button 
                        onClick={() => setEditingId(null)} 
                        className="p-2 bg-slate-700 hover:bg-slate-650 rounded-lg text-slate-300 min-h-[36px] min-w-[36px] flex items-center justify-center"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm text-slate-200 truncate block">
                        {rec.name}
                      </span>
                      <button 
                        onClick={() => startEditing(rec)}
                        className="text-slate-500 hover:text-indigo-400 p-1 rounded transition min-h-[30px] min-w-[30px] flex items-center justify-center"
                      >
                        <Edit3 size={13} />
                      </button>
                    </div>
                  )}
                  <span className="text-[10px] text-slate-500 mt-0.5 block">{rec.date}</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => togglePlayback(rec)} 
                    className={`h-10 w-10 rounded-full flex items-center justify-center transition-all min-h-[40px] min-w-[40px] ${
                      currentlyPlayingId === rec.id 
                        ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 animate-pulse' 
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                    }`}
                  >
                    {currentlyPlayingId === rec.id ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                  </button>
                  <button 
                    onClick={() => deleteRecording(rec.id!)} 
                    className="h-10 w-10 rounded-full bg-slate-900/60 hover:bg-rose-500/20 hover:text-rose-400 border border-transparent hover:border-rose-500/30 text-slate-500 flex items-center justify-center transition min-h-[40px] min-w-[40px]"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
