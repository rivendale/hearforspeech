import React, { useState, useEffect, useRef } from 'react';
import { Shield, Activity, Download, Upload, Check, Share2, QrCode, AlertCircle, X } from 'lucide-react';
import QRCode from 'qrcode';
import { db, type SessionLog, type Recording, type BackupPayload } from '../db/database';
import { useStore } from '../store/useStore';
import { base64ToBlob, decryptSessionLog, decryptRecording, encryptSessionLog, encryptRecording } from '../utils/crypto';
import { compressData } from '../utils/compression';

interface ExportTabProps {
  registerLocalPasskey: () => Promise<void>;
  disableSecurity: () => void;
}

export function ExportTab({ registerLocalPasskey, disableSecurity }: ExportTabProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [stats, setStats] = useState({ logsCount: 0, recordingsCount: 0, clientsCount: 0, guidedSessionsCount: 0, assessmentsCount: 0, reviewLabelsCount: 0 });
  const [clipboardInput, setClipboardInput] = useState('');
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');
  const [isCopied, setIsCopied] = useState(false);

  // New states for mobile enhancements & QR handoff
  const [exportFormat, setExportFormat] = useState<'full' | 'logs-only'>('full');
  const [canShare] = useState(() => {
    if (typeof navigator !== 'undefined' && navigator.canShare) {
      try {
        const dummyFile = new File([''], 'd.json', { type: 'application/json' });
        return navigator.canShare({ files: [dummyFile] });
      } catch {
        return false;
      }
    }
    return false;
  });
  const [isDragging, setIsDragging] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrError, setQrError] = useState('');
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragCounter = useRef(0);

  const { masterKey, isSecurityEnabled } = useStore();

  const loadStats = async () => {
    const [logsCount, recordingsCount, clientsCount, guidedSessionsCount, assessmentsCount, reviewLabelsCount] = await Promise.all([
      db.logs.count(),
      db.recordings.count(),
      db.clients.count(),
      db.guidedSessions.count(),
      db.assessments.count(),
      db.speechSoundReviews.count()
    ]);
    setStats({ logsCount, recordingsCount, clientsCount, guidedSessionsCount, assessmentsCount, reviewLabelsCount });
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      db.logs.count(),
      db.recordings.count(),
      db.clients.count(),
      db.guidedSessions.count(),
      db.assessments.count(),
      db.speechSoundReviews.count()
    ]).then(([logsCount, recordingsCount, clientsCount, guidedSessionsCount, assessmentsCount, reviewLabelsCount]) => {
      if (active) {
        setStats({ logsCount, recordingsCount, clientsCount, guidedSessionsCount, assessmentsCount, reviewLabelsCount });
      }
    }).catch(console.error);
    return () => {
      active = false;
    };
  }, []);

  const getSerializedPayload = async (format: 'full' | 'logs-only' = 'full') => {
    const [storedLogs, clients, goals, guidedSessions, trials, listenerChecks, speechSoundReviews, assessments, assessmentItems] = await Promise.all([
      db.logs.toArray(),
      db.clients.toArray(),
      db.goals.toArray(),
      db.guidedSessions.toArray(),
      db.trials.toArray(),
      db.listenerChecks.toArray(),
      db.speechSoundReviews.toArray(),
      db.assessments.toArray(),
      db.assessmentItems.toArray()
    ]);
    let logs = storedLogs;
    let serializedRecordings: BackupPayload['data']['recordings'] = [];

    // Decrypt data before exporting so the backup JSON is standard and cross-device compatible
    if (masterKey) {
      logs = await Promise.all(
        logs.map(log => decryptSessionLog(log, masterKey))
      );
    }

    if (format === 'full') {
      let recordings = await db.recordings.toArray();
      if (masterKey) {
        recordings = await Promise.all(
          recordings.map(rec => decryptRecording(rec, masterKey))
        );
      }
      serializedRecordings = await Promise.all(
        recordings.map(async (rec) => {
          const base64 = await blobToBase64(rec.audio);
          return {
            id: rec.id,
            date: rec.date,
            name: rec.name,
            audioBase64: base64
          };
        })
      );
    }

    return {
      appName: "HearForSpeech",
      exportedAt: new Date().toISOString(),
      data: {
        logs,
        clients,
        goals,
        guidedSessions,
        trials,
        listenerChecks,
        speechSoundReviews,
        assessments,
        assessmentItems,
        recordings: serializedRecordings
      }
    };
  };

  const handleExportFile = async () => {
    try {
      const payload = await getSerializedPayload(exportFormat);
      const jsonBlob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(jsonBlob);
      
      const a = document.createElement('a');
      a.href = url;
      const suffix = exportFormat === 'logs-only' ? 'logs_only' : 'backup';
      a.download = `hearforspeech_${suffix}_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Database export failed', err);
      alert('Data export failed. See browser console.');
    }
  };

  const handleShareFile = async () => {
    try {
      const payload = await getSerializedPayload(exportFormat);
      const suffix = exportFormat === 'logs-only' ? 'logs_only' : 'backup';
      const filename = `hearforspeech_${suffix}_${new Date().toISOString().split('T')[0]}.json`;
      const file = new File(
        [JSON.stringify(payload, null, 2)],
        filename,
        { type: 'application/json' }
      );

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'HearForSpeech Data Export',
          text: `Speech session data ${exportFormat === 'logs-only' ? '(text only)' : '(full with recordings)'}`
        });
      } else {
        alert("Native file sharing is not supported by your browser/device.");
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Web Share failed:', err);
        alert('Failed to share backup file.');
      }
    }
  };

  const handleCopyClipboard = async () => {
    try {
      const payload = await getSerializedPayload(exportFormat);
      const jsonStr = JSON.stringify(payload);
      await navigator.clipboard.writeText(jsonStr);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Copy to clipboard failed:', err);
      alert('Failed to copy to clipboard.');
    }
  };

  const handleGenerateQr = async () => {
    try {
      setQrError('');
      // Package logs only (exclude large binary audio blobs for QR code scan limits)
      let logs = await db.logs.toArray();
      if (masterKey) {
        logs = await Promise.all(
          logs.map(log => decryptSessionLog(log, masterKey))
        );
      }

      const payload = {
        appName: "HearForSpeech",
        exportedAt: new Date().toISOString(),
        data: {
          logs,
          recordings: []
        }
      };
      
      const jsonStr = JSON.stringify(payload);
      // Use GZIP Deflate compression to fit far more logs in a QR Code
      const base64Data = await compressData(jsonStr);
      
      const handoffLink = window.location.origin + window.location.pathname + '#handoff=' + encodeURIComponent(base64Data);
      
      if (handoffLink.length > 2900) {
        setQrError("Data payload is too large for scanning a QR code (~" + Math.round(handoffLink.length / 1024) + " KB). Please select 'Save Backup File' for direct transfers instead!");
        setShowQrModal(true);
        return;
      }

      setShowQrModal(true);
      
      setTimeout(() => {
        if (qrCanvasRef.current) {
          QRCode.toCanvas(qrCanvasRef.current, handoffLink, {
            width: 260,
            margin: 2,
            color: {
              dark: '#0f172a', // Slate 900
              light: '#ffffff' // White
            }
          }, (error) => {
            if (error) {
              console.error("QR Code rendering failed:", error);
              setQrError("Failed to render QR Code.");
            }
          });
        }
      }, 100);
    } catch (err) {
      console.error("Failed to generate handoff link", err);
      setQrError("Failed to generate handoff link.");
      setShowQrModal(true);
    }
  };

  const processImportData = async (parsed: BackupPayload) => {
    if (parsed.appName !== "HearForSpeech" || !parsed.data) {
      throw new Error("Incorrect application backup format.");
    }

    const { logs, recordings, clients, goals, guidedSessions, trials, listenerChecks, speechSoundReviews, assessments, assessmentItems } = parsed.data;
    if (!Array.isArray(logs)) {
      throw new Error("Corrupted logs structure.");
    }

    // Strict clinical field type validation
    for (const log of logs) {
      if (typeof log.date !== 'string') throw new Error("Invalid log date field.");
      if (typeof log.rating !== 'number' || log.rating < 1 || log.rating > 5) throw new Error("Invalid log articulation clarity value.");
      if (typeof log.pcc !== 'number' || log.pcc < 0 || log.pcc > 100) throw new Error("Invalid log consonants correct score.");
    }

    if (importMode === 'overwrite') {
      const proceed = confirm(
        "DANGER: Overwrite option will wipe all local data first. Proceed?"
      );
      if (!proceed) return;

      await db.transaction('rw', [db.logs, db.recordings, db.clients, db.goals, db.guidedSessions, db.trials, db.listenerChecks, db.speechSoundReviews, db.assessments, db.assessmentItems], async () => {
        await db.logs.clear();
        await db.recordings.clear();
        await db.clients.clear();
        await db.goals.clear();
        await db.guidedSessions.clear();
        await db.trials.clear();
        await db.listenerChecks.clear();
        await db.speechSoundReviews.clear();
        await db.assessments.clear();
        await db.assessmentItems.clear();

        for (const log of logs) {
          const logRecord: SessionLog = {
            date: log.date,
            rating: log.rating,
            pcc: log.pcc !== undefined ? log.pcc : 80,
            environment: log.environment || 'Quiet Clinical Space',
            repairStrategies: Array.isArray(log.repairStrategies) ? log.repairStrategies : [],
            notes: log.notes || '',
            environmentalDifficulty: log.environmentalDifficulty,
            environmentalNoiseLevel: log.environmentalNoiseLevel !== undefined ? log.environmentalNoiseLevel : log.environmentalDifficulty,
            naiveListenerScore: log.naiveListenerScore
          };

          const finalLog = masterKey ? await encryptSessionLog(logRecord, masterKey) : logRecord;
          await db.logs.add(finalLog);
        }

        if (Array.isArray(recordings)) {
          for (const rec of recordings) {
            const audioBlob = base64ToBlob(rec.audioBase64);
            const recRecord: Recording = {
              date: rec.date,
              audio: audioBlob,
              name: rec.name
            };

            const finalRec = masterKey ? await encryptRecording(recRecord, masterKey) : recRecord;
            await db.recordings.add(finalRec);
          }
        }

        if (Array.isArray(clients)) await db.clients.bulkPut(clients);
        if (Array.isArray(goals)) await db.goals.bulkPut(goals);
        if (Array.isArray(guidedSessions)) await db.guidedSessions.bulkPut(guidedSessions.map(session => ({ ...session, sessionLogId: undefined })));
        if (Array.isArray(trials)) await db.trials.bulkPut(trials);
        if (Array.isArray(listenerChecks)) await db.listenerChecks.bulkPut(listenerChecks);
        if (Array.isArray(speechSoundReviews)) await db.speechSoundReviews.bulkPut(speechSoundReviews);
        if (Array.isArray(assessments)) await db.assessments.bulkPut(assessments);
        if (Array.isArray(assessmentItems)) await db.assessmentItems.bulkPut(assessmentItems);
      });
    } else {
      // Merge logs & recordings (avoid duplicates by checking date/name)
      await db.transaction('rw', [db.logs, db.recordings, db.clients, db.goals, db.guidedSessions, db.trials, db.listenerChecks, db.speechSoundReviews, db.assessments, db.assessmentItems], async () => {
        // Read decrypted/plaintext properties to check uniqueness
        let currentLogs = await db.logs.toArray();
        if (masterKey) {
          currentLogs = await Promise.all(
            currentLogs.map(l => decryptSessionLog(l, masterKey))
          );
        }

        for (const log of logs) {
          const exists = currentLogs.some(l => l.date === log.date && l.notes === log.notes);
          if (!exists) {
            const logRecord: SessionLog = {
              date: log.date,
              rating: log.rating,
              pcc: log.pcc !== undefined ? log.pcc : 80,
              environment: log.environment || 'Quiet Clinical Space',
              repairStrategies: Array.isArray(log.repairStrategies) ? log.repairStrategies : [],
              notes: log.notes || '',
              environmentalDifficulty: log.environmentalDifficulty,
              environmentalNoiseLevel: log.environmentalNoiseLevel !== undefined ? log.environmentalNoiseLevel : log.environmentalDifficulty,
              naiveListenerScore: log.naiveListenerScore
            };

            const finalLog = masterKey ? await encryptSessionLog(logRecord, masterKey) : logRecord;
            await db.logs.add(finalLog);
          }
        }

        if (Array.isArray(recordings)) {
          const currentRecordings = await db.recordings.toArray();
          for (const rec of recordings) {
            const exists = currentRecordings.some(r => r.date === rec.date && r.name === rec.name);
            if (!exists) {
              const audioBlob = base64ToBlob(rec.audioBase64);
              const recRecord: Recording = {
                date: rec.date,
                audio: audioBlob,
                name: rec.name
              };

              const finalRec = masterKey ? await encryptRecording(recRecord, masterKey) : recRecord;
              await db.recordings.add(finalRec);
            }
          }
        }

        if (Array.isArray(clients)) await db.clients.bulkPut(clients);
        if (Array.isArray(goals)) await db.goals.bulkPut(goals);
        if (Array.isArray(guidedSessions)) await db.guidedSessions.bulkPut(guidedSessions.map(session => ({ ...session, sessionLogId: undefined })));
        if (Array.isArray(trials)) await db.trials.bulkPut(trials);
        if (Array.isArray(listenerChecks)) await db.listenerChecks.bulkPut(listenerChecks);
        if (Array.isArray(speechSoundReviews)) await db.speechSoundReviews.bulkPut(speechSoundReviews);
        if (Array.isArray(assessments)) await db.assessments.bulkPut(assessments);
        if (Array.isArray(assessmentItems)) await db.assessmentItems.bulkPut(assessmentItems);
      });
    }

    alert(`Successfully ${importMode === 'merge' ? 'merged' : 'restored'} backup data!`);
    loadStats();
    setClipboardInput('');
    window.location.reload();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          const parsed = JSON.parse(content);
          await processImportData(parsed);
        } catch (err: unknown) {
          const error = err as Error;
          alert(`Failed to parse file: ${error.message || error}`);
        }
      };
      reader.readAsText(file);
    } catch (err) {
      console.error('File reading failed', err);
      alert('Failed to read selected file.');
    }
  };

  const handleImportClipboard = async () => {
    if (!clipboardInput.trim()) {
      alert("Please paste the backup JSON text first.");
      return;
    }

    try {
      const parsed = JSON.parse(clipboardInput.trim());
      await processImportData(parsed);
    } catch (err: unknown) {
      const error = err as Error;
      alert(`Invalid backup JSON text: ${error.message || error}`);
    }
  };

  const handleInstantClipboardImport = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        alert("Clipboard is empty.");
        return;
      }
      const parsed = JSON.parse(text.trim());
      await processImportData(parsed);
    } catch (err: unknown) {
      const error = err as Error;
      alert(`Clipboard content is not a valid HearForSpeech backup JSON: ${error.message || error}`);
    }
  };

  const handleClearDatabase = async () => {
    const confirm1 = confirm("DANGER: This will permanently delete ALL clients, goals, guided sessions, assessment guides, session metrics, listener checks, SLP analyzer labels, trials, and recordings stored on this device. Continue?");
    if (!confirm1) return;
    const confirm2 = confirm("Are you absolutely sure? This cannot be undone.");
    if (!confirm2) return;

    await db.logs.clear();
    await db.recordings.clear();
    await db.clients.clear();
    await db.goals.clear();
    await db.guidedSessions.clear();
    await db.trials.clear();
    await db.listenerChecks.clear();
    await db.speechSoundReviews.clear();
    await db.assessments.clear();
    await db.assessmentItems.clear();
    alert("Local database wiped.");
    loadStats();
  };

  // Drag & drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    dragCounter.current = 0;
    
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      alert("Only JSON database files are supported.");
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          const parsed = JSON.parse(content);
          await processImportData(parsed);
        } catch (err: unknown) {
          const error = err as Error;
          alert(`Failed to parse file: ${error.message || error}`);
        }
      };
      reader.readAsText(file);
    } catch (err) {
      console.error('File reading failed', err);
      alert('Failed to read dropped file.');
    }
  };

  const handleCopyLink = async () => {
    try {
      // Package logs only (exclude large binary audio blobs for length limits)
      let logs = await db.logs.toArray();
      if (masterKey) {
        logs = await Promise.all(
          logs.map(log => decryptSessionLog(log, masterKey))
        );
      }

      const payload = {
        appName: "HearForSpeech",
        exportedAt: new Date().toISOString(),
        data: {
          logs,
          recordings: []
        }
      };
      
      const jsonStr = JSON.stringify(payload);
      const base64Data = await compressData(jsonStr);
      const handoffLink = window.location.origin + window.location.pathname + '#handoff=' + encodeURIComponent(base64Data);
      
      await navigator.clipboard.writeText(handoffLink);
      alert("Compressed handoff link copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy link:", err);
      alert("Failed to copy handoff link.");
    }
  };

  return (
    <div 
      className="space-y-6 relative min-h-[300px]"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Visual overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 border-2 border-dashed border-indigo-500 rounded-3xl m-0.5 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="bg-indigo-600/20 border border-indigo-500/30 p-5 rounded-full text-indigo-400">
              <Upload size={32} className="animate-bounce" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-100">Drop Backup File Here</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-[220px] leading-relaxed">
                Release your `.json` file to parse and merge/restore your data instantly.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 1. Local Security Config Panel */}
      <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
        <h3 className="font-extrabold text-base text-slate-100 tracking-tight flex items-center gap-2 border-b border-slate-700/50 pb-2 text-left">
          <Shield size={18} className="text-indigo-400" />
          <span>Local Device Security Lock</span>
        </h3>
        
        <p className="text-[11px] text-slate-400 leading-relaxed font-normal text-left">
          Lock access to clinical logs using your device's native FaceID/TouchID passkey or a fallback PIN. 
          Perfect for protecting patient data when sharing device hardware with clients.
          <span className="block mt-1.5 text-[10px] text-indigo-350 italic">
            * Note: Passkeys are local to this specific device and browser. Register a separate passkey on each device to enable lock screens across all phones or computers.
          </span>
        </p>

        <div className="flex items-center justify-between p-3.5 bg-slate-900/60 border border-slate-750 rounded-2xl text-left">
          <div>
            <span className="text-xs font-bold text-slate-200 block">Biometric Lock Status</span>
            <span className={`text-[10px] font-bold block mt-0.5 ${isSecurityEnabled ? 'text-emerald-400' : 'text-slate-500 uppercase'}`}>
              {isSecurityEnabled ? '🔒 Active (Passkey / PIN Enabled)' : '🔓 Off / Unprotected'}
            </span>
          </div>
          {isSecurityEnabled ? (
            <button
              onClick={disableSecurity}
              className="bg-slate-700 hover:bg-slate-650 text-slate-200 font-bold px-4 py-2 rounded-xl text-[10px] uppercase tracking-wider transition active:scale-95 min-h-[36px]"
            >
              Disable Lock
            </button>
          ) : (
            <button
              onClick={registerLocalPasskey}
              className="bg-indigo-650 hover:bg-indigo-600 text-white font-bold px-4 py-2 rounded-xl text-[10px] uppercase tracking-wider transition active:scale-95 min-h-[36px]"
            >
              Enable Passkey Lock
            </button>
          )}
        </div>
      </div>

      {/* 2. Patient-Mediated Export Stats */}
      <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
        <h3 className="font-extrabold text-base text-slate-100 tracking-tight flex items-center gap-2 border-b border-slate-700/50 pb-2 text-left">
          <Activity size={18} className="text-emerald-400" />
          <span>Local Data Export Diagnostics</span>
        </h3>

        <p className="text-[11px] text-slate-400 leading-relaxed font-normal text-left">
          HearForSpeech is local-first and designed to minimize cloud exposure. Use this panel to export, merge, or transition clinical records only when you have permission to do so.
        </p>

        <div className="bg-amber-500/10 border border-amber-500/25 p-3 rounded-2xl text-left">
          <p className="text-[11px] text-amber-200 leading-relaxed">
            Export warning: backup files, QR handoffs, and clipboard text may contain protected or sensitive information. Store and share exports according to your organization’s consent, retention, backup, HIPAA, and FERPA policies.
          </p>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 bg-slate-900/50 p-4 rounded-2xl border border-slate-800/80">
          <div className="text-center">
            <span className="text-[9px] font-bold text-slate-500 tracking-wider uppercase block">Clients</span>
            <span className="text-xl font-bold text-slate-200 mt-1 block">{stats.clientsCount}</span>
          </div>
          <div className="text-center border-l border-slate-800">
            <span className="text-[9px] font-bold text-slate-500 tracking-wider uppercase block">Assess</span>
            <span className="text-xl font-bold text-slate-200 mt-1 block">{stats.assessmentsCount}</span>
          </div>
          <div className="text-center border-l border-slate-800">
            <span className="text-[9px] font-bold text-slate-500 tracking-wider uppercase block">Guided</span>
            <span className="text-xl font-bold text-slate-200 mt-1 block">{stats.guidedSessionsCount}</span>
          </div>
          <div className="text-center">
            <span className="text-[9px] font-bold text-slate-500 tracking-wider uppercase block">Logs</span>
            <span className="text-xl font-bold text-slate-200 mt-1 block">{stats.logsCount}</span>
          </div>
          <div className="text-center border-l border-slate-800">
            <span className="text-[9px] font-bold text-slate-500 tracking-wider uppercase block">Audio</span>
            <span className="text-xl font-bold text-slate-200 mt-1 block">{stats.recordingsCount}</span>
          </div>
          <div className="text-center border-l border-slate-800">
            <span className="text-[9px] font-bold text-slate-500 tracking-wider uppercase block">Labels</span>
            <span className="text-xl font-bold text-slate-200 mt-1 block">{stats.reviewLabelsCount}</span>
          </div>
        </div>
      </div>

      {/* 3. Export Dashboard */}
      <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
        <h4 className="text-xs font-bold text-slate-400 tracking-widest uppercase block border-b border-slate-700/50 pb-2 text-left">Export Data Dashboard</h4>
        
        {/* Export format selection */}
        <div className="space-y-1.5 text-left">
          <span className="block text-[10px] font-extrabold text-slate-500 tracking-wider uppercase">Export Format Options:</span>
          <div className="flex gap-2 bg-slate-950 p-1 rounded-2xl border border-slate-900">
            <button
              type="button"
              onClick={() => setExportFormat('full')}
              className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase transition active:scale-98 min-h-[36px] ${
                exportFormat === 'full'
                  ? 'bg-indigo-650 text-white shadow'
                  : 'text-slate-500 hover:text-slate-350'
              }`}
            >
              Full Backup (With Audio)
            </button>
            <button
              type="button"
              onClick={() => setExportFormat('logs-only')}
              className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase transition active:scale-98 min-h-[36px] ${
                exportFormat === 'logs-only'
                  ? 'bg-indigo-650 text-white shadow'
                  : 'text-slate-500 hover:text-slate-355'
              }`}
            >
              Logs Only (Text/No Audio)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={handleExportFile}
            className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-750 text-slate-205 border border-slate-700 font-bold py-3 px-3 rounded-2xl transition active:scale-98 min-h-[44px] uppercase tracking-wider text-[10px]"
          >
            <Download size={14} />
            <span>Save Backup File</span>
          </button>
          
          <button
            onClick={handleCopyClipboard}
            className={`flex items-center justify-center gap-2 border font-bold py-3 px-3 rounded-2xl transition active:scale-98 min-h-[44px] uppercase tracking-wider text-[10px] ${
              isCopied
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-slate-900 hover:bg-slate-750 border-slate-700 text-slate-202'
            }`}
          >
            <Check size={14} className={isCopied ? '' : 'hidden'} />
            <Upload size={14} className={isCopied ? 'hidden' : ''} />
            <span>{isCopied ? 'Copied!' : 'Copy to Clipboard'}</span>
          </button>
        </div>

        <div className="flex flex-col gap-2 pt-1 border-t border-slate-750/80 mt-2">
          {canShare && (
            <button
              onClick={handleShareFile}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-2xl transition active:scale-98 min-h-[44px] uppercase tracking-wider text-[10px]"
            >
              <Share2 size={14} />
              <span>Native Mobile Share</span>
            </button>
          )}

          <button
            onClick={handleGenerateQr}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-750 text-indigo-400 border border-slate-700 font-bold py-3 rounded-2xl transition active:scale-98 min-h-[44px] text-[10px] uppercase tracking-wider"
          >
            <QrCode size={14} />
            <span>QR Code Handoff (Logs Only)</span>
          </button>
        </div>
      </div>

      {/* 4. Import Dashboard */}
      <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
        <h4 className="text-xs font-bold text-slate-400 tracking-widest uppercase block border-b border-slate-700/50 pb-2 text-left">Import / Restore Backup</h4>

        {/* Merge Mode Toggle */}
        <div className="space-y-1.5 text-left">
          <span className="block text-[10px] font-extrabold text-slate-500 tracking-wider uppercase">Handoff Conflict Option:</span>
          <div className="flex gap-2 bg-slate-950 p-1 rounded-2xl border border-slate-900">
            <button
              type="button"
              onClick={() => setImportMode('merge')}
              className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase transition active:scale-98 min-h-[36px] ${
                importMode === 'merge'
                  ? 'bg-indigo-650 text-white shadow'
                  : 'text-slate-500 hover:text-slate-350'
              }`}
            >
              Merge Logs (Union)
            </button>
            <button
              type="button"
              onClick={() => setImportMode('overwrite')}
              className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase transition active:scale-98 min-h-[36px] ${
                importMode === 'overwrite'
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  : 'text-slate-500 hover:text-slate-350'
              }`}
            >
              Overwrite DB (Replace)
            </button>
          </div>
        </div>

        {/* Clipboard Sync Area */}
        <div className="space-y-1.5 text-left">
          <span className="block text-[10px] font-extrabold text-slate-500 tracking-wider uppercase">Paste Clipboard Text:</span>
          <textarea
            value={clipboardInput}
            onChange={(e) => setClipboardInput(e.target.value)}
            placeholder="Paste exported backup string here to restore instantly..."
            rows={3}
            className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 focus:outline-none p-3 rounded-2xl text-[11px] text-slate-200 placeholder-slate-600 transition-all font-mono select-text font-normal text-left"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleImportClipboard}
              className="flex items-center justify-center gap-2 bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-400 font-bold py-3.5 rounded-2xl border border-indigo-550/20 transition active:scale-98 min-h-[44px] uppercase tracking-wider text-[10px]"
            >
              <Upload size={14} />
              <span>Verify Paste</span>
            </button>
            <button
              onClick={handleInstantClipboardImport}
              className="flex items-center justify-center gap-2 bg-indigo-650 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-2xl transition active:scale-98 min-h-[44px] uppercase tracking-wider text-[10px]"
            >
              <Check size={14} />
              <span>Read Clipboard</span>
            </button>
          </div>
        </div>

        {/* File Drag-and-drop Import */}
        <div className="border-t border-slate-750/80 pt-3 space-y-2 text-left">
          <span className="block text-[10px] font-extrabold text-slate-500 tracking-wider uppercase">Or Drag & Drop or Select File:</span>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportFile}
            accept=".json"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-750 text-slate-300 font-bold py-3 rounded-2xl border border-dashed border-slate-700 transition active:scale-98 min-h-[44px] text-[10px] uppercase tracking-wider"
          >
            <Download size={14} className="rotate-180" />
            <span>Select JSON File</span>
          </button>
        </div>
      </div>

      {/* Danger Zone Wipe */}
      <div className="pt-2">
        <button
          onClick={handleClearDatabase}
          className="w-full flex items-center justify-center gap-2 bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/20 hover:border-rose-500/40 text-rose-400 font-semibold py-3.5 rounded-2xl text-xs transition min-h-[44px] uppercase tracking-wider"
        >
          <AlertCircle size={15} />
            <span>Reset Local Data</span>
        </button>
      </div>

      {/* Handoff QR Code Viewer Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="bg-slate-800 border border-slate-700 max-w-xs w-full p-6 rounded-3xl shadow-2xl space-y-5 text-center">
            <div className="flex justify-between items-center border-b border-slate-700 pb-2">
              <span className="font-extrabold text-sm text-slate-100 tracking-tight flex items-center gap-1.5">
                <QrCode size={16} className="text-indigo-400" />
                <span>QR Code Handoff</span>
              </span>
              <button 
                onClick={() => setShowQrModal(false)}
                className="text-slate-400 hover:text-slate-205 p-1 min-h-[30px]"
              >
                <X size={16} />
              </button>
            </div>

            {qrError ? (
              <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl text-[10px] font-bold text-red-400 leading-normal text-left">
                {qrError}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-[10px] text-slate-400 leading-normal font-normal max-w-[220px] mx-auto">
                  Scan this code using the native camera app on your phone/tablet to immediately import and sync session logs.
                </p>
                <div className="bg-white p-3 rounded-2xl inline-block shadow-xl">
                  <canvas ref={qrCanvasRef} className="mx-auto" />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCopyLink}
                    className="flex-1 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 font-bold py-2 rounded-xl text-[9px] uppercase tracking-wider transition min-h-[36px]"
                  >
                    Copy Link
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowQrModal(false)}
              className="w-full bg-slate-700 hover:bg-slate-650 text-slate-200 font-bold py-3 rounded-2xl text-[10px] uppercase tracking-wider transition active:scale-99 min-h-[40px]"
            >
              Close Handoff
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
