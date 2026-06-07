import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  Activity,
  BarChart3,
  ClipboardList,
  Ear,
  FileText,
  Mic,
  Plus,
  Sparkles,
  Target,
  UserRound
} from 'lucide-react';
import {
  db,
  type Assessment,
  type AssessmentItem,
  type ClientProfile,
  type GuidedSession
} from '../db/database';
import { useStore, type AppTab } from '../store/useStore';

const ASSESSMENT_INTENT_KEY = 'hfs_assessment_start_intent';
const FOCUS_CLASS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500';
type IconComponent = ComponentType<{ size?: number; className?: string }>;

const assessmentPacks = [
  { id: 'phone_triage', title: '10-min screen', detail: 'Consent, sample, focused probe, cueing, listener check.', icon: Sparkles },
  { id: 'teen_full', title: 'Full articulation / intelligibility', detail: 'Broad sound, clarity, participation, and stimulability flow.', icon: ClipboardList },
  { id: 'r_deep', title: '/r/ deep dive', detail: 'Prevocalic, vocalic, blends, sentences, and cueing.', icon: Target },
  { id: 'voice_resonance', title: 'Voice / resonance', detail: 'Pitch, loudness, quality, resonance, and follow-up flags.', icon: Mic },
  { id: 'connected_speech', title: 'Connected speech', detail: 'Conversation, narrative, explanation, and clarity in context.', icon: Activity },
  { id: 'school_voice', title: 'School participation', detail: 'Classroom speaking, peers, presentations, and self-advocacy.', icon: UserRound },
  { id: 'listener_check_only', title: 'Listener Check', detail: 'Simple clear/unclear scoring for unfamiliar listeners.', icon: Ear }
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

export function HomeTab() {
  const { setActiveTab } = useStore();
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [assessmentItems, setAssessmentItems] = useState<AssessmentItem[]>([]);
  const [sessions, setSessions] = useState<GuidedSession[]>([]);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      db.clients.toArray(),
      db.assessments.toArray(),
      db.assessmentItems.toArray(),
      db.guidedSessions.toArray()
    ]).then(([storedClients, storedAssessments, storedItems, storedSessions]) => {
      if (!isMounted) return;
      setClients(latestByDate(storedClients));
      setAssessments(latestByDate(storedAssessments));
      setAssessmentItems(storedItems);
      setSessions(latestByDate(storedSessions));
    }).catch(console.error);

    return () => {
      isMounted = false;
    };
  }, []);

  const latestAssessment = assessments[0];
  const latestClient = clients.find(client => client.id === latestAssessment?.clientId) || clients[0];
  const recentClientAssessments = useMemo(
    () => latestClient ? assessments.filter(assessment => assessment.clientId === latestClient.id).slice(0, 2) : [],
    [assessments, latestClient]
  );
  const recentClientSessions = useMemo(
    () => latestClient ? sessions.filter(session => session.clientId === latestClient.id).slice(0, 2) : [],
    [sessions, latestClient]
  );
  const analyzedLineCount = useMemo(
    () => assessmentItems.filter(item => item.advancedAnalysis?.status === 'complete').length,
    [assessmentItems]
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

  return (
    <div className="space-y-4 text-slate-950">
      <section className="relative overflow-hidden rounded-[2rem] border border-sky-100 bg-gradient-to-br from-white via-sky-50 to-amber-50 p-4 sm:p-5 shadow-xl shadow-sky-100/70 text-left">
        <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-sky-300/30 blur-2xl" />
        <div className="absolute -bottom-16 left-10 h-40 w-40 rounded-full bg-amber-200/45 blur-3xl" />
        <div className="relative space-y-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-700">No-doc start</p>
            <h2 className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-slate-950 leading-tight">Start care in a few taps</h2>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-700">
              Pick a patient, choose an assessment or therapy session, record speech, then finish with notes and a printable practice sheet.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 min-w-0">
            <button
              type="button"
              onClick={() => startAssessment({ phase: 'new_student' })}
              className={`min-w-0 min-h-[88px] rounded-3xl bg-sky-600 px-4 py-4 text-left text-white shadow-lg shadow-sky-200 transition active:scale-98 ${FOCUS_CLASS}`}
            >
              <Plus size={24} />
              <span className="mt-2 block text-lg font-black">New Patient</span>
              <span className="block text-xs text-sky-50">Name → diagnostic → record</span>
            </button>
            <button
              type="button"
              onClick={() => startAssessment({ phase: 'load_student' })}
              className={`min-w-0 min-h-[88px] rounded-3xl border-2 border-sky-300 bg-white px-4 py-4 text-left text-sky-950 shadow-sm transition active:scale-98 ${FOCUS_CLASS}`}
            >
              <UserRound size={24} />
              <span className="mt-2 block text-lg font-black">Load Patient</span>
              <span className="block text-xs text-slate-600">Review or continue</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric label="Patients" value={clients.length.toString()} />
            <Metric label="Assessments" value={assessments.length.toString()} />
            <Metric label="Analyzed" value={analyzedLineCount.toString()} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2 text-center min-w-0">
        {[
          ['1', 'Pick patient'],
          ['2', 'Record lines'],
          ['3', 'Print plan']
        ].map(([number, label]) => (
          <div key={label} className="min-w-0 rounded-2xl border border-sky-100 bg-white/90 p-3 shadow-sm">
            <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-sky-600 text-sm font-black text-white">{number}</span>
            <span className="mt-2 block text-[10px] font-black uppercase tracking-wide text-slate-600 leading-tight">{label}</span>
          </div>
        ))}
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-lg shadow-slate-100">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Pick a workflow</p>
            <h3 className="text-lg font-black text-slate-950">One tap to the right tool</h3>
          </div>
          <Sparkles className="text-amber-500" size={22} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2">
          <QuickAction title="Diagnostic Portal" detail="Choose a diagnostic pack, record line-by-line, then print notes and worksheet." icon={ClipboardList} onClick={() => startAssessment({ phase: 'patient_choice' })} />
          <QuickAction title="Start Therapy Session" detail="Trials, cueing, notes, home practice." icon={Activity} onClick={() => jumpTo('session')} />
          <QuickAction title="Review Results" detail="Progress, old sessions, exports, and data." icon={BarChart3} onClick={() => jumpTo('tracker')} />
        </div>
      </section>

      <section className="rounded-[2rem] border border-sky-100 bg-sky-50 p-4 text-left shadow-lg shadow-sky-100">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-700">Assessment packs</p>
            <h3 className="text-lg font-black text-slate-950">Choose the clinical path</h3>
          </div>
          <button
            type="button"
            onClick={() => startAssessment({ phase: 'diagnostic' })}
            className={`min-h-[40px] rounded-2xl bg-white px-3 text-xs font-black text-sky-800 shadow-sm ${FOCUS_CLASS}`}
          >
            Customize
          </button>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {assessmentPacks.map(pack => {
            const Icon = pack.icon;
            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => startAssessment({ phase: 'new_student', presetId: pack.id })}
                className={`min-h-[92px] rounded-3xl border border-sky-100 bg-white p-3 text-left shadow-sm transition hover:border-sky-300 active:scale-98 ${FOCUS_CLASS}`}
              >
                <div className="flex items-start gap-3">
                  <span className="rounded-2xl bg-sky-100 p-2 text-sky-700">
                    <Icon size={18} />
                  </span>
                  <span>
                    <span className="block text-sm font-black text-slate-950">{pack.title}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-slate-600">{pack.detail}</span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-lg shadow-slate-100">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Patient timeline</p>
            <h3 className="text-lg font-black text-slate-950">Latest work</h3>
          </div>
          <FileText className="text-slate-500" size={22} />
        </div>

        {latestClient ? (
          <div className="mt-3 space-y-2">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-base font-black text-slate-950">{latestClient.displayName}</p>
              <p className="mt-1 text-xs text-slate-600">{latestClient.ageGroup || 'Saved patient'} · {recentClientSessions.length} recent therapy sessions · {recentClientAssessments.length} recent diagnostics</p>
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
              title={queuedLineCount > 0 ? 'Analysis queue has recordings' : 'Ready for next step'}
              detail={queuedLineCount > 0 ? `${queuedLineCount} recording(s) need analysis or review.` : 'Consider a quick screen or therapy session.'}
              action={queuedLineCount > 0 ? 'Review' : 'Start'}
              onClick={() => startAssessment({ phase: queuedLineCount > 0 ? 'load_student' : 'patient_choice' })}
            />
            {recentClientAssessments.map(assessment => (
              <TimelineRow
                key={assessment.id}
                title={assessment.status === 'completed' ? 'Completed diagnostic' : 'Diagnostic draft'}
                detail={`${formatDate(assessment.updatedAt)} · ${assessment.primaryConcern || 'Speech clarity assessment'}`}
                action="Open"
                onClick={() => {
                  writeAssessmentIntent({ phase: 'load_student', clientId: assessment.clientId, assessmentId: assessment.id });
                  setActiveTab('assessment');
                }}
              />
            ))}
            {recentClientSessions.map(session => (
              <TimelineRow
                key={session.id}
                title="Therapy session"
                detail={`${formatDate(session.date || session.createdAt)} · ${session.totalTrials || 0} trials · ${session.independentAccuracy || 0}% independent`}
                action="Data"
                onClick={() => jumpTo('tracker')}
              />
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
            No patients yet. Tap <strong>New Patient</strong> and the app will walk line-by-line.
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-2">
        <SmallTool title="Biofeedback" icon={Mic} onClick={() => jumpTo('visualizer')} />
        <SmallTool title="Protocol" icon={ClipboardList} onClick={() => jumpTo('protocol')} />
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/85 p-3 shadow-sm">
      <span className="block text-xl font-black text-slate-950">{value}</span>
      <span className="block text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</span>
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

function SmallTool({
  title,
  icon: Icon,
  onClick
}: {
  title: string;
  icon: IconComponent;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[56px] rounded-3xl border border-slate-200 bg-white p-3 text-sm font-black text-slate-800 shadow-sm active:scale-98 ${FOCUS_CLASS}`}
    >
      <Icon className="mx-auto mb-1 text-sky-700" size={18} />
      {title}
    </button>
  );
}
