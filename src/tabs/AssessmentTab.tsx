import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Ear,
  FileText,
  Mic,
  PauseCircle,
  Printer,
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
import { PrintableHandout } from '../components/PrintableHandout';

type TemplateItem = Omit<AssessmentItem, 'id' | 'assessmentId' | 'status' | 'createdAt' | 'updatedAt' | 'recordingIds'>;
type TemplateDefinition = {
  id: Assessment['template'];
  title: string;
  subtitle: string;
  defaultConcern: string;
  items: TemplateItem[];
};
type FocusOption = {
  id: string;
  label: string;
  helper: string;
};
type DiagnosticLaunchPhase = 'patient_choice' | 'new_student' | 'load_student' | 'profile' | 'diagnostic' | 'ready';
type DiagnosticFlagOption = {
  id: string;
  label: string;
  helper: string;
};
type QuickStartPreset = {
  id: string;
  title: string;
  subtitle: string;
  template: Assessment['template'];
  concern: string;
  minutes: number;
  focusTargets: string[];
  setting: string;
  diagnosticFlags?: string[];
  questionnaires?: string[];
};

const FOCUS_CLASS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300';
const BUTTON_CLASS = `min-h-[48px] rounded-2xl font-extrabold transition active:scale-98 ${FOCUS_CLASS}`;

const CUE_LEVELS: { value: CueLevel; label: string }[] = [
  { value: 'independent', label: 'Independent' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'maximal', label: 'Maximal' }
];

const FOCUS_OPTIONS: FocusOption[] = [
  { id: 'articulation', label: 'Artic sounds', helper: 'word positions, substitutions, distortions' },
  { id: 'rhotic_r', label: '/r/ deep dive', helper: 'prevocalic, vocalic, blends, sentences' },
  { id: 'intelligibility', label: 'Intelligibility', helper: 'how clear speech is to listeners' },
  { id: 'connected_speech', label: 'Connected speech', helper: 'conversation, narrative, explanation' },
  { id: 'school_participation', label: 'School impact', helper: 'classroom, peers, presentations' },
  { id: 'stimulability', label: 'Cueing response', helper: 'what support helps fastest' },
  { id: 'listener_check', label: 'Listener Check', helper: 'clear/unclear from an unfamiliar listener' },
  { id: 'caregiver_teacher', label: 'Adult input', helper: 'caregiver or teacher concern' },
  { id: 'practice_plan', label: 'Practice plan', helper: 'therapy ideas and home practice' }
];

const DIAGNOSTIC_FLAG_OPTIONS: DiagnosticFlagOption[] = [
  { id: 'bilingual_dialect', label: 'Language / dialect', helper: 'Add questions about languages, dialect, and difference vs. disorder context.' },
  { id: 'hearing_access', label: 'Hearing / access', helper: 'Add hearing, listening access, and amplification/classroom acoustics checks.' },
  { id: 'voice_resonance', label: 'Voice / resonance', helper: 'Add simple voice quality, pitch, loudness, and resonance screening prompts.' },
  { id: 'noise_distance', label: 'Noise / distance', helper: 'Add functional listening in quiet/noise and near/far speaking checks.' },
  { id: 'school_impact', label: 'School impact', helper: 'Add participation, self-advocacy, peer/classroom, and presentation prompts.' },
  { id: 'phonological_awareness', label: 'Literacy link', helper: 'Add conservative follow-up prompts for phonological awareness or literacy concerns.' }
];

const QUESTIONNAIRE_OPTIONS: DiagnosticFlagOption[] = [
  { id: 'student_impact', label: 'Student impact rating', helper: 'Quick 1–5 rating for school, peers, phone/video, and presentations.' },
  { id: 'caregiver_teacher', label: 'Caregiver/teacher input', helper: 'Plain-language questions for home and school communication impact.' },
  { id: 'listener_check', label: 'Listener Check', helper: 'Clear/unclear scoring without exposing private client notes.' }
];

const TEMPLATE_FOCUS: Record<Assessment['template'], string[]> = {
  adolescent_speech_intelligibility: ['articulation', 'intelligibility', 'connected_speech', 'stimulability', 'listener_check', 'practice_plan'],
  rhotic_r_diagnostic: ['rhotic_r', 'articulation', 'stimulability', 'listener_check', 'practice_plan'],
  connected_speech_participation: ['intelligibility', 'connected_speech', 'school_participation', 'listener_check', 'practice_plan'],
  school_participation_interview: ['school_participation', 'connected_speech', 'caregiver_teacher', 'practice_plan']
};

const QUICK_START_PRESETS: QuickStartPreset[] = [
  {
    id: 'phone_triage',
    title: 'I have 10 minutes',
    subtitle: 'Consent, concern, one speech sample, focused probe, cueing, listener check, draft.',
    template: 'adolescent_speech_intelligibility',
    concern: 'Quick phone-based screen for speech clarity, cueing response, and next-step planning.',
    minutes: 10,
    focusTargets: ['articulation', 'intelligibility', 'connected_speech', 'stimulability', 'listener_check', 'practice_plan'],
    setting: 'Quick speech-language check',
    questionnaires: ['student_impact', 'listener_check']
  },
  {
    id: 'teen_full',
    title: '14-year-old diagnostic',
    subtitle: 'Teen-friendly broad articulation, intelligibility, participation, and stimulability guide.',
    template: 'adolescent_speech_intelligibility',
    concern: 'Adolescent speech clarity and intelligibility across school, conversation, and unfamiliar listeners.',
    minutes: 30,
    focusTargets: ['articulation', 'intelligibility', 'connected_speech', 'school_participation', 'caregiver_teacher', 'stimulability', 'listener_check', 'practice_plan'],
    setting: 'Speech-language diagnostic assessment',
    diagnosticFlags: ['bilingual_dialect', 'hearing_access', 'noise_distance', 'school_impact'],
    questionnaires: ['student_impact', 'caregiver_teacher', 'listener_check']
  },
  {
    id: 'r_deep',
    title: '/r/ deep dive',
    subtitle: 'Fast rhotic probe with word positions, loaded sentences, cueing response, and practice plan.',
    template: 'rhotic_r_diagnostic',
    concern: 'Primary concern is /r/ clarity across words, sentences, and connected speech.',
    minutes: 20,
    focusTargets: ['rhotic_r', 'articulation', 'stimulability', 'listener_check', 'practice_plan'],
    setting: '/r/ diagnostic probe',
    diagnosticFlags: ['school_impact'],
    questionnaires: ['listener_check']
  },
  {
    id: 'school_voice',
    title: 'School participation',
    subtitle: 'Student voice, classroom speaking tasks, functional impact, and advocacy supports.',
    template: 'school_participation_interview',
    concern: 'Speech clarity may affect classroom participation, peer interaction, presentations, or confidence.',
    minutes: 20,
    focusTargets: ['school_participation', 'connected_speech', 'caregiver_teacher', 'practice_plan'],
    setting: 'School participation speech check',
    diagnosticFlags: ['school_impact', 'noise_distance'],
    questionnaires: ['student_impact', 'caregiver_teacher']
  },
  {
    id: 'voice_resonance',
    title: 'Voice / resonance check',
    subtitle: 'Simple local prompts for pitch, loudness, voice quality, resonance, and follow-up flags.',
    template: 'connected_speech_participation',
    concern: 'Speech participation may be affected by voice quality, pitch/loudness, resonance, or vocal effort.',
    minutes: 20,
    focusTargets: ['intelligibility', 'connected_speech', 'school_participation', 'practice_plan'],
    setting: 'Voice and resonance screening check',
    diagnosticFlags: ['voice_resonance', 'school_impact'],
    questionnaires: ['student_impact', 'caregiver_teacher']
  },
  {
    id: 'functional_listening',
    title: 'Noise / listening check',
    subtitle: 'Near/far, quiet/noise, listener confidence, and school access prompts.',
    template: 'connected_speech_participation',
    concern: 'Speech clarity or listening access may change with background noise, distance, or unfamiliar listeners.',
    minutes: 20,
    focusTargets: ['intelligibility', 'connected_speech', 'listener_check', 'school_participation', 'practice_plan'],
    setting: 'Functional listening and intelligibility check',
    diagnosticFlags: ['hearing_access', 'noise_distance', 'school_impact'],
    questionnaires: ['student_impact', 'listener_check']
  }
];

const BROAD_SCREEN_ITEMS: TemplateItem[] = [
  {
    sectionKey: 'consent',
    sectionTitle: 'Consent & Orientation',
    prompt: 'Confirm recording consent and explain that this is a speech clarity assessment, not a pass/fail test.',
    helperText: 'Say: “I’m going to ask you to talk, read, and try a few sounds. This helps me understand what is easy and what needs support.”',
    scriptText: 'I’m going to ask you to talk, read, and try a few sounds. This is not a pass/fail test — it helps me understand what is easy and what needs support.',
    kind: 'checklist',
    sortOrder: 10
  },
  {
    sectionKey: 'consent',
    sectionTitle: 'Consent & Orientation',
    prompt: 'Ask the student what name/pronouns they want used in notes and practice materials.',
    helperText: 'Keep this teen-respectful and quick. Add details only if clinically useful.',
    scriptText: 'What name would you like me to use in my notes today? Anything you want me to know before we start?',
    kind: 'question',
    sortOrder: 20
  },
  {
    sectionKey: 'history',
    sectionTitle: 'Quick Case History',
    prompt: 'Primary concern: When is the student hardest to understand?',
    helperText: 'Class discussion, friends, phone/video, presentations, noisy spaces, unfamiliar listeners.',
    scriptText: 'When do people have the hardest time understanding you — class, friends, phone/video, presentations, or noisy places?',
    kind: 'question',
    analysisTags: ['functional impact'],
    sortOrder: 30
  },
  {
    sectionKey: 'history',
    sectionTitle: 'Quick Case History',
    prompt: 'Student self-rating: “How easy is it for people to understand you at school?”',
    helperText: 'Use 1–5 or a short note. Ask what situations feel easiest and hardest.',
    scriptText: 'On a 1 to 5 scale, how easy is it for people to understand you at school? What makes it easier or harder?',
    kind: 'student_rating',
    analysisTags: ['student self-rating'],
    sortOrder: 40
  },
  {
    sectionKey: 'caregiver',
    sectionTitle: 'Caregiver / Teacher Input',
    prompt: 'Caregiver/teacher concern: where does communication break down most?',
    helperText: 'Capture functional contexts and whether unfamiliar listeners report difficulty.',
    scriptText: 'Where do you notice speech clarity breaking down most — home, school, friends, phone, presentations, or noisy places?',
    kind: 'caregiver_interview',
    analysisTags: ['caregiver input', 'functional impact'],
    functionalContext: 'home/school',
    sortOrder: 45
  },
  {
    sectionKey: 'screening',
    sectionTitle: 'Screening Checklist',
    prompt: 'Hearing access check: note recent hearing concerns, screenings, or referral needs.',
    helperText: 'Do not diagnose hearing status in this app; document whether follow-up is needed.',
    kind: 'checklist',
    analysisTags: ['consider hearing follow-up'],
    sortOrder: 50
  },
  {
    sectionKey: 'screening',
    sectionTitle: 'Screening Checklist',
    prompt: 'Oral-mechanism observation: face, lips, jaw, tongue movement, dentition, resonance, and voice quality.',
    helperText: 'Use as a quick clinical checklist and note only observable findings.',
    kind: 'checklist',
    analysisTags: ['oral-mech observation'],
    sortOrder: 60
  },
  {
    sectionKey: 'speech_sample',
    sectionTitle: 'Connected Speech Sample',
    prompt: 'Record: “Tell me about something you are into lately — a game, sport, show, music, or app.”',
    helperText: 'Aim for 45–90 seconds of natural speech. Mark intelligibility, rate, and self-monitoring.',
    scriptText: 'Tell me about something you are into lately — a game, sport, show, music, app, or anything you like.',
    kind: 'speech_sample',
    analysisTags: ['connected speech', 'self-monitoring'],
    functionalContext: 'conversation',
    sortOrder: 70
  },
  {
    sectionKey: 'speech_sample',
    sectionTitle: 'Connected Speech Sample',
    prompt: 'Record: “Explain how to play or do something you know well.”',
    helperText: 'This gives sequencing, narrative/expository language, and speech clarity in a real context.',
    scriptText: 'Explain how to play or do something you know well. Pretend I’m brand new to it.',
    kind: 'speech_sample',
    analysisTags: ['expository sample'],
    functionalContext: 'explanation',
    sortOrder: 80
  },
  {
    sectionKey: 'sound_probes',
    sectionTitle: 'Sound Probe',
    prompt: '/r/ probe: red, rain, ring, rabbit, car, star, teacher, around.',
    helperText: 'Score overall pattern and note word positions affected.',
    scriptText: 'Say these words after me: red, rain, ring, rabbit, car, star, teacher, around.',
    kind: 'sound_probe',
    soundTargets: ['/r/'],
    wordPositions: ['initial', 'vocalic/final', 'mixed'],
    sortOrder: 90
  },
  {
    sectionKey: 'sound_probes',
    sectionTitle: 'Sound Probe',
    prompt: '/s, z/ probe: sun, seven, bus, grass, zoo, buzz, music, roses.',
    helperText: 'Listen for frontal/lateral distortions, omissions, and voicing contrasts.',
    scriptText: 'Say these words after me: sun, seven, bus, grass, zoo, buzz, music, roses.',
    kind: 'sound_probe',
    soundTargets: ['/s/', '/z/'],
    wordPositions: ['initial', 'final', 'medial'],
    sortOrder: 100
  },
  {
    sectionKey: 'sound_probes',
    sectionTitle: 'Sound Probe',
    prompt: 'Late-8 probe: leaf, thumb, teeth, shoe, fish, chair, watch, measure.',
    helperText: 'Use this as a broad screen, then add notes for sounds needing deeper testing.',
    scriptText: 'Say these words after me: leaf, thumb, teeth, shoe, fish, chair, watch, measure.',
    kind: 'sound_probe',
    soundTargets: ['/l/', '/th/', '/sh/', '/ch/', '/zh/'],
    wordPositions: ['mixed'],
    sortOrder: 110
  },
  {
    sectionKey: 'reading',
    sectionTitle: 'Reading & Sentence Sample',
    prompt: 'Record reading: “The quiet library was full of students working on science projects. Jordan explained the results clearly, then answered questions from the group.”',
    helperText: 'If reading is not appropriate, use repetition or clinician-read sentence imitation.',
    scriptText: 'Please read this aloud: The quiet library was full of students working on science projects. Jordan explained the results clearly, then answered questions from the group.',
    kind: 'speech_sample',
    analysisTags: ['reading sample'],
    functionalContext: 'reading',
    sortOrder: 120
  },
  {
    sectionKey: 'reading',
    sectionTitle: 'Reading & Sentence Sample',
    prompt: 'Sentence repetition: “The bright yellow sunshine warmed the quiet playground.”',
    helperText: 'Use as a controlled intelligibility sample with familiar wording.',
    scriptText: 'Repeat this sentence after me: The bright yellow sunshine warmed the quiet playground.',
    kind: 'speech_sample',
    analysisTags: ['sentence repetition'],
    sortOrder: 130
  },
  {
    sectionKey: 'stimulability',
    sectionTitle: 'Stimulability & Cueing',
    prompt: 'Try the target sound with a model only.',
    helperText: 'Record whether production improves after a single model.',
    scriptText: 'Now I’ll say it first, and you try it after me. Just copy my best version.',
    kind: 'stimulability',
    analysisTags: ['model cue'],
    sortOrder: 140
  },
  {
    sectionKey: 'stimulability',
    sectionTitle: 'Stimulability & Cueing',
    prompt: 'Try visual/verbal cues, slowed rate, and self-monitoring.',
    helperText: 'Mark the least support that improved clarity.',
    scriptText: 'Try it slowly. Listen to your own sound and tell me if it sounded clear or needs another try.',
    kind: 'stimulability',
    analysisTags: ['self-monitoring', 'cue response'],
    sortOrder: 150
  },
  {
    sectionKey: 'listener',
    sectionTitle: 'Listener Check',
    prompt: 'Optional: ask an unfamiliar listener to rate whether 5–10 words/sentences are clear or unclear.',
    helperText: 'Hide client notes. Record only clear/unclear score, confidence, and item list.',
    scriptText: 'Listener: mark each item as clear or unclear based only on what you hear.',
    kind: 'listener_check',
    analysisTags: ['listener check'],
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

const R_DEEP_DIVE_ITEMS: TemplateItem[] = [
  ...BROAD_SCREEN_ITEMS.filter(item => ['consent', 'history', 'speech_sample'].includes(item.sectionKey)),
  {
    sectionKey: 'sound_probes',
    sectionTitle: '/r/ Deep Probe',
    prompt: 'Prevocalic /r/: red, run, rain, ring, right, radio, rabbit, race.',
    helperText: 'Listen for consistent initial /r/ production and note tongue-shape response.',
    scriptText: 'Say these /r/ words after me: red, run, rain, ring, right, radio, rabbit, race.',
    kind: 'sound_probe',
    soundTargets: ['/r/'],
    wordPositions: ['initial'],
    analysisTags: ['prevocalic /r/'],
    sortOrder: 90
  },
  {
    sectionKey: 'sound_probes',
    sectionTitle: '/r/ Deep Probe',
    prompt: 'Vocalic /r/: car, star, bird, shirt, teacher, mother, player, around.',
    helperText: 'Compare ar/er/or/air contexts and note which contexts are easiest.',
    scriptText: 'Now try these /r/ words: car, star, bird, shirt, teacher, mother, player, around.',
    kind: 'sound_probe',
    soundTargets: ['/r/'],
    wordPositions: ['vocalic', 'final', 'medial'],
    analysisTags: ['vocalic /r/'],
    sortOrder: 100
  },
  {
    sectionKey: 'sound_probes',
    sectionTitle: '/r/ Deep Probe',
    prompt: 'Blend /r/: green, try, bring, dry, crowd, three, strong, practice.',
    helperText: 'Look for cluster reduction, distortion, or improved clarity with slowed rate.',
    scriptText: 'Try these blend words slowly: green, try, bring, dry, crowd, three, strong, practice.',
    kind: 'sound_probe',
    soundTargets: ['/r/ blends'],
    wordPositions: ['blend'],
    analysisTags: ['/r/ clusters', 'slowed rate'],
    sortOrder: 110
  },
  {
    sectionKey: 'reading',
    sectionTitle: '/r/ Loaded Sentences',
    prompt: 'Record sentence: “Riley rode around the corner after practice and carried the green backpack.”',
    helperText: 'Use this as a sentence-level /r/ probe.',
    scriptText: 'Repeat this sentence: Riley rode around the corner after practice and carried the green backpack.',
    kind: 'speech_sample',
    soundTargets: ['/r/'],
    wordPositions: ['sentence'],
    analysisTags: ['sentence /r/'],
    sortOrder: 120
  },
  ...BROAD_SCREEN_ITEMS.filter(item => ['stimulability', 'listener', 'summary'].includes(item.sectionKey)).map(item => ({
    ...item,
    sortOrder: item.sortOrder + 20
  }))
];

const CONNECTED_SPEECH_ITEMS: TemplateItem[] = [
  ...BROAD_SCREEN_ITEMS.filter(item => ['consent', 'history', 'caregiver', 'screening'].includes(item.sectionKey)),
  {
    sectionKey: 'speech_sample',
    sectionTitle: 'Conversation Samples',
    prompt: 'Record personal narrative: “Tell me about a time something funny or frustrating happened at school.”',
    helperText: 'Listen for intelligibility, rate, volume, repair attempts, and listener burden.',
    scriptText: 'Tell me about a time something funny or frustrating happened at school.',
    kind: 'speech_sample',
    analysisTags: ['narrative', 'conversation intelligibility'],
    functionalContext: 'peer conversation',
    sortOrder: 70
  },
  {
    sectionKey: 'speech_sample',
    sectionTitle: 'Conversation Samples',
    prompt: 'Record explanation: “Teach me the rules of a game, sport, app, or hobby.”',
    helperText: 'Use a real teen topic to sample longer connected speech.',
    scriptText: 'Teach me the rules of a game, sport, app, or hobby. I’ll ask follow-up questions if I get lost.',
    kind: 'speech_sample',
    analysisTags: ['expository language', 'repair strategies'],
    functionalContext: 'class explanation',
    sortOrder: 80
  },
  {
    sectionKey: 'participation',
    sectionTitle: 'Participation Impact',
    prompt: 'Functional impact check: presentations, group work, ordering food, phone/video, noisy hallway/cafeteria.',
    helperText: 'Mark the contexts where speech clarity affects participation.',
    scriptText: 'Which situations make you want to talk less or repeat yourself more: presentations, group work, ordering food, phone/video, or noisy places?',
    kind: 'participation',
    analysisTags: ['participation impact'],
    functionalContext: 'school/community',
    sortOrder: 90
  },
  ...BROAD_SCREEN_ITEMS.filter(item => ['listener', 'summary'].includes(item.sectionKey)).map(item => ({
    ...item,
    sortOrder: item.sortOrder - 40
  }))
];

const SCHOOL_PARTICIPATION_ITEMS: TemplateItem[] = [
  ...BROAD_SCREEN_ITEMS.filter(item => ['consent', 'history', 'caregiver'].includes(item.sectionKey)),
  {
    sectionKey: 'student_voice',
    sectionTitle: 'Student Voice',
    prompt: 'Student self-advocacy: ask what helps when someone does not understand.',
    helperText: 'Look for repair strategies, confidence, avoidance, and preferred supports.',
    scriptText: 'When someone does not understand you, what helps most — repeating, slowing down, showing them, texting, or something else?',
    kind: 'student_rating',
    analysisTags: ['self-advocacy', 'repair strategy'],
    functionalContext: 'student voice',
    sortOrder: 60
  },
  {
    sectionKey: 'participation',
    sectionTitle: 'School Participation',
    prompt: 'Classroom participation probe: answering questions, reading aloud, presentations, partner/group work.',
    helperText: 'Rate impact and collect examples.',
    scriptText: 'Tell me what it is like to answer questions, read aloud, present, or work in groups. Which is easiest? Which is hardest?',
    kind: 'participation',
    analysisTags: ['classroom impact'],
    functionalContext: 'classroom',
    sortOrder: 70
  },
  {
    sectionKey: 'speech_sample',
    sectionTitle: 'Functional Speech Sample',
    prompt: 'Record mock classroom answer: “Explain your opinion about phone use at school and give two reasons.”',
    helperText: 'A teen-relevant prompt for classroom-style speech.',
    scriptText: 'Give your opinion about phone use at school and tell me two reasons why.',
    kind: 'speech_sample',
    analysisTags: ['classroom speech sample'],
    functionalContext: 'classroom answer',
    sortOrder: 80
  },
  ...BROAD_SCREEN_ITEMS.filter(item => ['stimulability', 'listener', 'summary'].includes(item.sectionKey)).map(item => ({
    ...item,
    sortOrder: item.sortOrder - 40
  }))
];

const ASSESSMENT_TEMPLATES: TemplateDefinition[] = [
  {
    id: 'adolescent_speech_intelligibility',
    title: 'Teen Speech Clarity Screen',
    subtitle: 'Broad articulation, intelligibility, cueing, listener, and participation walkthrough.',
    defaultConcern: 'Speech clarity is harder in class, conversation, or with unfamiliar listeners.',
    items: BROAD_SCREEN_ITEMS
  },
  {
    id: 'rhotic_r_diagnostic',
    title: '/r/ Diagnostic Deep Dive',
    subtitle: 'Prevocalic, vocalic, blend, sentence, and stimulability probes for adolescents.',
    defaultConcern: 'Primary concern is /r/ clarity across words, sentences, and conversation.',
    items: R_DEEP_DIVE_ITEMS
  },
  {
    id: 'connected_speech_participation',
    title: 'Connected Speech + Intelligibility',
    subtitle: 'Natural speech samples, listener burden, repair strategies, and participation impact.',
    defaultConcern: 'Student is understood in short words but breaks down in longer conversation or noisy settings.',
    items: CONNECTED_SPEECH_ITEMS
  },
  {
    id: 'school_participation_interview',
    title: 'School Participation Interview',
    subtitle: 'Student voice, caregiver/teacher input, classroom tasks, and self-advocacy supports.',
    defaultConcern: 'Speech clarity may affect classroom participation, peer interaction, or self-advocacy.',
    items: SCHOOL_PARTICIPATION_ITEMS
  }
];

const getTemplateDefinition = (template: Assessment['template']) => (
  ASSESSMENT_TEMPLATES.find(item => item.id === template) || ASSESSMENT_TEMPLATES[0]
);

const mergeUnique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const isSpeechRecordable = (kind: AssessmentItemKind) => ['speech_sample', 'sound_probe', 'stimulability', 'listener_check'].includes(kind);

const buildCustomTargetItem = (customTarget: string): TemplateItem | null => {
  const trimmedTarget = customTarget.trim();
  if (!trimmedTarget) return null;

  return {
    sectionKey: 'custom_probe',
    sectionTitle: 'Custom Target',
    prompt: `Custom probe: ${trimmedTarget}`,
    helperText: 'Use this line for the sound, word list, phrase list, or functional target the SLP needs today.',
    scriptText: `Try these targets slowly: ${trimmedTarget}.`,
    listenFor: ['Which targets are clear now?', 'Which contexts break down?', 'What cue helps with the least support?'],
    kind: 'sound_probe',
    soundTargets: [trimmedTarget],
    wordPositions: ['custom'],
    analysisTags: ['custom target'],
    sortOrder: 115
  };
};

const buildDiagnosticProfileItems = (
  diagnosticFlags: string[],
  questionnaireFlags: string[]
): TemplateItem[] => {
  const flags = new Set(diagnosticFlags);
  const questionnaires = new Set(questionnaireFlags);
  const profileItems: TemplateItem[] = [];

  if (flags.has('bilingual_dialect')) {
    profileItems.push({
      sectionKey: 'diagnostic_profile',
      sectionTitle: 'Language / Dialect Context',
      prompt: 'Ask about languages, dialects, accents, and where each is used.',
      helperText: 'Use this to document context and avoid over-interpreting dialect or second-language differences as disorder.',
      scriptText: 'What languages or dialects do you use at home, school, online, or with friends? Do people understand you differently in different languages or settings?',
      listenFor: ['Language/dialect background', 'Difference vs. disorder considerations', 'Whether interpreter or bilingual assessment support is needed'],
      kind: 'question',
      analysisTags: ['language/dialect context'],
      sortOrder: 24
    });
  }

  if (flags.has('hearing_access')) {
    profileItems.push({
      sectionKey: 'diagnostic_profile',
      sectionTitle: 'Hearing / Listening Access',
      prompt: 'Screen for hearing, listening access, ear history, devices, and classroom acoustics.',
      helperText: 'This does not replace hearing screening. Flag follow-up according to local procedures when access is uncertain.',
      scriptText: 'Do you ever have trouble hearing speech in class, noisy places, or from across the room? Any recent ear infections, hearing tests, hearing aids, or classroom listening supports?',
      listenFor: ['Reported hearing/listening concerns', 'Noise or distance impact', 'Need for hearing screening or educational audiology follow-up'],
      kind: 'question',
      analysisTags: ['hearing/listening access'],
      sortOrder: 26
    });
  }

  if (flags.has('voice_resonance')) {
    profileItems.push(
      {
        sectionKey: 'voice_resonance',
        sectionTitle: 'Voice / Resonance Screen',
        prompt: 'Record a short voice sample: sustained vowel, counting, and one sentence.',
        helperText: 'Plain local screen only. Note voice quality, pitch, loudness, effort, fatigue, and whether referral is warranted.',
        scriptText: 'Take a comfortable breath and hold “ah” for a few seconds. Now count from 1 to 10. Now say: “My voice helps me participate at school.”',
        listenFor: ['Hoarse, breathy, strained, or weak quality', 'Pitch/loudness concerns', 'Effort, fatigue, or pain report'],
        kind: 'speech_sample',
        analysisTags: ['voice screen'],
        functionalContext: 'Voice quality, pitch, loudness, and vocal effort',
        sortOrder: 72
      },
      {
        sectionKey: 'voice_resonance',
        sectionTitle: 'Voice / Resonance Screen',
        prompt: 'Check resonance and nasal airflow with pressure words/sentences.',
        helperText: 'Use simple observations only; refer or use formal measures when clinically indicated.',
        scriptText: 'Say: puppy, baby, cookie, sister, sixty-six, buy Bobby a puppy.',
        listenFor: ['Hypernasality or hyponasality signs', 'Nasal air emission on pressure sounds', 'Whether follow-up is needed'],
        kind: 'sound_probe',
        soundTargets: ['pressure consonants', 'resonance'],
        wordPositions: ['mixed'],
        analysisTags: ['resonance screen'],
        sortOrder: 74
      }
    );
  }

  if (flags.has('noise_distance')) {
    profileItems.push({
      sectionKey: 'functional_listening',
      sectionTitle: 'Noise / Distance Check',
      prompt: 'Compare clear speech near/far and quiet/noisy conditions.',
      helperText: 'Use phone recording or Listener Check. Do not treat this as calibrated acoustic testing.',
      scriptText: 'Say the same sentence close to the listener, then from farther away, then with normal room noise if appropriate: “I need to explain my idea clearly.”',
      listenFor: ['Quiet vs. noise difference', 'Near vs. far difference', 'Repair strategies or self-advocacy needed'],
      kind: 'listener_check',
      analysisTags: ['noise/distance'],
      functionalContext: 'Functional listening and intelligibility across distance/noise',
      sortOrder: 96
    });
  }

  if (flags.has('phonological_awareness')) {
    profileItems.push({
      sectionKey: 'literacy_link',
      sectionTitle: 'Literacy Link Check',
      prompt: 'If concerns exist, ask about reading/spelling and note whether phonological awareness follow-up is needed.',
      helperText: 'Keep this conservative: the app can flag follow-up; it does not diagnose literacy disorders.',
      scriptText: 'Do speech sounds ever make reading, spelling, or sounding out words harder? Are any school assignments affected?',
      listenFor: ['Reading/spelling concern', 'Sound awareness concern', 'Need for formal literacy or phonological processing measures'],
      kind: 'question',
      analysisTags: ['literacy follow-up'],
      sortOrder: 118
    });
  }

  if (questionnaires.has('student_impact')) {
    profileItems.push({
      sectionKey: 'impact_rating',
      sectionTitle: 'Student Impact Rating',
      prompt: 'Have the student rate speech clarity impact in real situations.',
      helperText: 'Quick 1–5 ratings: class discussion, friends, phone/video, presentations, noisy spaces.',
      scriptText: 'On a 1 to 5 scale, how easy is it for people to understand you in class, with friends, on phone/video, during presentations, and in noisy places?',
      listenFor: ['Student-prioritized situations', 'Confidence or avoidance', 'Self-advocacy ideas'],
      kind: 'student_rating',
      analysisTags: ['student impact rating'],
      sortOrder: 42
    });
  }

  if (questionnaires.has('caregiver_teacher')) {
    profileItems.push({
      sectionKey: 'adult_input',
      sectionTitle: 'Caregiver / Teacher Input',
      prompt: 'Capture one quick adult-impact note if a caregiver or teacher is available.',
      helperText: 'Ask where speech is easiest/hardest, whether repetition is needed, and what support already works.',
      scriptText: 'Where is speech easiest to understand? Where is it hardest? What helps most right now?',
      listenFor: ['Unfamiliar listener impact', 'School/home difference', 'Supports already working'],
      kind: 'caregiver_interview',
      analysisTags: ['adult impact input'],
      sortOrder: 44
    });
  }

  if (questionnaires.has('listener_check')) {
    profileItems.push({
      sectionKey: 'listener',
      sectionTitle: 'Listener Check',
      prompt: 'Run a private Listener Check with clear/unclear scoring only.',
      helperText: 'Hand the phone to the listener only on this line; do not show other client history or private notes.',
      scriptText: 'Listener: mark each item clear or unclear, and choose how confident you feel. You do not need to interpret why.',
      listenFor: ['Clear/unclear percentage', 'Listener confidence', 'Which words or sentences break down'],
      kind: 'listener_check',
      analysisTags: ['listener check'],
      sortOrder: 98
    });
  }

  return profileItems.sort((a, b) => a.sortOrder - b.sortOrder);
};

const shouldKeepForFastPlan = (item: TemplateItem, focusTargets: string[]) => {
  if (['summary', 'consent'].includes(item.sectionKey)) return true;
  if (item.sectionKey === 'caregiver') return focusTargets.includes('caregiver_teacher');
  if (item.sectionKey === 'screening') return focusTargets.includes('caregiver_teacher') || focusTargets.includes('articulation');
  if (item.sectionKey === 'reading') return focusTargets.includes('articulation') || focusTargets.includes('rhotic_r');
  if (item.sectionKey === 'listener') return focusTargets.includes('listener_check');
  if (item.sectionKey === 'stimulability') return focusTargets.includes('stimulability') || focusTargets.includes('rhotic_r');
  if (item.sectionKey === 'participation' || item.sectionKey === 'student_voice') return focusTargets.includes('school_participation');
  if (item.kind === 'speech_sample') return focusTargets.includes('connected_speech') || focusTargets.includes('intelligibility') || focusTargets.includes('school_participation');
  if (item.kind === 'sound_probe') {
    if (focusTargets.includes('rhotic_r')) return item.soundTargets?.some(target => target.toLowerCase().includes('/r')) || false;
    return focusTargets.includes('articulation');
  }
  return true;
};

const buildCustomizedItems = (
  templateDefinition: TemplateDefinition,
  focusTargets: string[],
  timeBudgetMinutes: number,
  customTarget: string
) => {
  const customItem = buildCustomTargetItem(customTarget);
  const baseItems = customItem
    ? [...templateDefinition.items, customItem]
    : [...templateDefinition.items];

  if (timeBudgetMinutes > 15) {
    return baseItems.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const seenBySection = new Map<string, number>();
  return baseItems
    .filter(item => {
      if (!shouldKeepForFastPlan(item, focusTargets)) return false;
      if (item.sectionKey === 'summary' || item.sectionKey === 'custom_probe') return true;
      const seenCount = seenBySection.get(item.sectionKey) || 0;
      const maxForSection = item.sectionKey === 'sound_probes' ? 2 : 1;
      if (seenCount >= maxForSection) return false;
      seenBySection.set(item.sectionKey, seenCount + 1);
      return true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
};

const listenForItem = (item: AssessmentItem) => {
  if (item.listenFor?.length) return item.listenFor;
  if (item.kind === 'sound_probe') return ['Sound clarity by word position', 'Consistent vs. inconsistent errors', 'Effect of slowed rate or model'];
  if (item.kind === 'speech_sample') return ['Overall intelligibility', 'Rate, volume, and repair attempts', 'Breakdowns in longer connected speech'];
  if (item.kind === 'stimulability') return ['Least cue that helps', 'Whether the student can imitate', 'Whether self-monitoring improves the target'];
  if (item.kind === 'listener_check') return ['Clear vs. unclear items', 'Listener confidence', 'Patterns across words or sentences'];
  if (item.kind === 'participation') return ['Avoidance or confidence changes', 'Contexts with communication breakdown', 'Supports the student already uses'];
  if (item.kind === 'caregiver_interview') return ['Functional contexts', 'Unfamiliar listener difficulty', 'Settings where support is needed'];
  return ['What the SLP observes', 'Whether follow-up is needed', 'Any clinical or contextual notes'];
};

const quickNoteOptionsForItem = (item: AssessmentItem) => {
  if (item.kind === 'sound_probe') return ['initial harder', 'final harder', 'inconsistent', 'better with model', 'slowed rate helped'];
  if (item.kind === 'speech_sample') return ['clear in short answers', 'breaks down in conversation', 'rate affects clarity', 'repair needed', 'recording saved'];
  if (item.kind === 'stimulability') return ['minimal cue helped', 'visual cue helped', 'self-monitoring emerging', 'needs more support'];
  if (item.kind === 'listener_check') return ['listener unsure', 'clear in quiet', 'unclear with longer items'];
  if (item.kind === 'participation') return ['classroom impact', 'presentation concern', 'peer impact', 'avoidance reported'];
  if (item.kind === 'student_rating') return ['student reports concern', 'student reports confidence', 'wants help'];
  if (item.kind === 'caregiver_interview') return ['caregiver concern', 'teacher input needed', 'home practice feasible'];
  return ['WNL today', 'monitor', 'needs follow-up', 'not enough data'];
};

const buildPracticePlanDraft = (assessment: Assessment, items: AssessmentItem[]) => {
  const targets = mergeUnique([
    ...(assessment.focusTargets || []),
    ...items.flatMap(item => item.soundTargets || []),
    ...items.flatMap(item => item.analysisTags || [])
  ]).slice(0, 8);
  const strongestCue = items.find(item => item.cueLevel)?.cueLevel;
  const targetLabel = targets.length > 0 ? targets.join(', ') : assessment.primaryConcern || 'speech clarity';

  return [
    `Therapy/practice starter: Focus on ${targetLabel}.`,
    `Begin with the easiest successful level observed today, then increase length only when productions stay clear.`,
    strongestCue
      ? `Use ${strongestCue} cueing first, then fade support as the student can self-monitor.`
      : 'Start with a model, slowed rate, and one clear self-monitoring cue; document the least support that helps.',
    'Phone-friendly drill: record 5–10 targets, play back one clear example and one “try again” example, then let the student choose the best attempt.',
    'Home practice: 5 minutes, 3 times this week, using plain language and praise for effort before correction.',
    'Clinician controls all interpretation, goal selection, and whether formal standardized measures are needed.'
  ].join('\n');
};

const friendlyFocusLabel = (focus: string) => FOCUS_OPTIONS.find(option => option.id === focus)?.label || focus.replace(/_/g, ' ');
const friendlyDiagnosticFlagLabel = (flag: string) => (
  DIAGNOSTIC_FLAG_OPTIONS.find(option => option.id === flag)?.label || flag.replace(/_/g, ' ')
);
const friendlyQuestionnaireLabel = (flag: string) => (
  QUESTIONNAIRE_OPTIONS.find(option => option.id === flag)?.label || flag.replace(/_/g, ' ')
);

const buildPatientHandoutSections = (
  assessment: Assessment,
  items: AssessmentItem[],
  supportPlanDraft: string
) => {
  const targets = mergeUnique([
    ...items.flatMap(item => item.soundTargets || []),
    ...(assessment.focusTargets || []).map(friendlyFocusLabel)
  ]).slice(0, 6);
  const targetText = targets.length > 0 ? targets.join(', ') : assessment.primaryConcern || 'clear speech';
  const cueItem = items.find(item => item.kind === 'stimulability' && (item.cueLevel || item.analysisTags?.length));
  const cueText = cueItem?.cueLevel
    ? `Use a ${cueItem.cueLevel} cue first. Then try to fade help when the sound is clear.`
    : 'Slow down, listen for your clearest sound, and try again if it is not clear yet.';
  const suggestedTargets = targets.some(target => target.toLowerCase().includes('/r'))
    ? 'red, rain, ring, car, star, bird, teacher, around, green, practice'
    : 'Pick 5–10 words from today’s session. Say each one slowly, then use it in a short sentence.';
  const patientPlan = supportPlanDraft
    .split('\n')
    .filter(line => !/clinician controls|formal standardized|therapy\/practice starter/i.test(line))
    .join('\n')
    .trim();

  return [
    {
      title: 'What We Worked On',
      body: `Today we listened to and practiced ${targetText}. This was a practice and planning activity, not a pass/fail test.`
    },
    {
      title: 'Try These Practice Targets',
      body: suggestedTargets
    },
    {
      title: 'Helpful Cue',
      body: cueText
    },
    {
      title: 'Practice Plan',
      body: patientPlan || 'Practice for 5 minutes, 3 times this week. Keep it short, calm, and encouraging.'
    },
    {
      title: 'Encouragement',
      body: 'Praise effort first. Clear speech grows with short, steady practice and support from the SLP.'
    }
  ];
};

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
    case 'student_rating':
      return ['1 - hard', '2', '3', '4', '5 - easy'];
    case 'caregiver_interview':
      return ['No concern', 'Mild concern', 'Moderate concern', 'High concern'];
    case 'participation':
      return ['No impact', 'Monitor', 'Participation impact', 'Avoidance reported'];
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

const tagOptionsForKind = (kind: AssessmentItemKind) => {
  if (kind === 'sound_probe') {
    return ['initial', 'medial', 'final', 'blend', 'vocalic', 'inconsistent', 'self-corrected', 'needs deeper probe'];
  }
  if (kind === 'speech_sample') {
    return ['fast rate', 'quiet volume', 'reduced intelligibility', 'good repair', 'breakdown in noise', 'self-monitoring'];
  }
  if (kind === 'stimulability') {
    return ['model helped', 'visual cue helped', 'verbal cue helped', 'slowed rate helped', 'biofeedback helped', 'limited change'];
  }
  if (kind === 'student_rating' || kind === 'caregiver_interview' || kind === 'participation') {
    return ['classroom', 'peers', 'phone/video', 'presentations', 'noisy settings', 'avoidance', 'self-advocacy'];
  }
  return [];
};

const summarizeBySound = (items: AssessmentItem[]) => {
  const soundRows = items
    .filter(item => item.kind === 'sound_probe' && (item.result || item.notes || item.analysisTags?.length))
    .flatMap(item => (item.soundTargets?.length ? item.soundTargets : ['speech sound']).map(sound => ({
      sound,
      positions: item.wordPositions?.join('/') || 'mixed',
      result: item.result || 'observed',
      tags: item.analysisTags?.join(', ') || 'no tags',
      notes: item.notes
    })));

  if (soundRows.length === 0) return 'No sound probe patterns were entered yet.';

  return soundRows
    .map(row => `${row.sound} (${row.positions}): ${row.result}${row.tags !== 'no tags' ? `; tags: ${row.tags}` : ''}${row.notes ? `; notes: ${row.notes}` : ''}`)
    .join('\n');
};

const summarizeFunctionalContexts = (items: AssessmentItem[]) => {
  const contextItems = items.filter(item => item.functionalContext || item.kind === 'participation' || item.kind === 'student_rating' || item.kind === 'caregiver_interview');
  if (contextItems.length === 0) return 'No functional context notes entered yet.';

  return contextItems
    .filter(item => item.result || item.notes || item.analysisTags?.length)
    .map(item => `${item.functionalContext || item.sectionTitle}: ${item.result || 'observed'}${item.analysisTags?.length ? ` (${item.analysisTags.join(', ')})` : ''}${item.notes ? ` — ${item.notes}` : ''}`)
    .join('\n') || 'Functional contexts were included but not yet scored.';
};

const buildFollowUpFlags = (items: AssessmentItem[]) => {
  const flags = new Set<string>();
  const hasDistortion = items.some(item => /distorted|substituted|omitted|unclear|reduced|impact|avoidance|concern/i.test(`${item.result || ''} ${item.notes || ''} ${item.analysisTags?.join(' ') || ''}`));
  const hasHearingFlag = items.some(item => /hearing/i.test(item.prompt) && /concern|follow|monitor|not observed/i.test(`${item.result || ''} ${item.notes || ''}`));
  const hasCueBenefit = items.some(item => item.kind === 'stimulability' && /improved|helped|emerging/i.test(`${item.result || ''} ${item.analysisTags?.join(' ') || ''}`));
  const missingRecordings = items.some(item => ['speech_sample', 'sound_probe'].includes(item.kind) && !item.recordingIds?.length);

  if (hasDistortion) flags.add('Consider deeper sound-specific probes for flagged targets and word positions.');
  if (hasHearingFlag) flags.add('Consider hearing screening follow-up or referral according to local procedures.');
  if (hasCueBenefit) flags.add('Document the least cue level that improved clarity and whether the student could self-monitor.');
  if (missingRecordings) flags.add('Consider adding recordings for speech samples/probes before finalizing the diagnostic summary.');
  flags.add('Consider formal or district-required measures when eligibility, diagnosis, or service decisions require standardized evidence.');

  return Array.from(flags);
};

const buildDiagnosticProfileFollowUps = (assessment: Assessment) => {
  const flags = new Set<string>();
  const diagnosticFlags = assessment.diagnosticFlags || [];

  if (diagnosticFlags.includes('bilingual_dialect')) {
    flags.add('Consider bilingual/dialect-informed interpretation and interpreter or bilingual assessment support when needed.');
  }
  if (diagnosticFlags.includes('hearing_access') || assessment.hearingStatus?.trim()) {
    flags.add('Consider hearing/listening access follow-up if history, classroom listening, or device use affects speech data.');
  }
  if (diagnosticFlags.includes('voice_resonance')) {
    flags.add('Consider voice/resonance referral or formal measures if vocal quality, pitch/loudness, resonance, fatigue, or pain concerns are observed.');
  }
  if (diagnosticFlags.includes('noise_distance')) {
    flags.add('Consider functional listening supports when intelligibility changes with noise, distance, or unfamiliar listeners.');
  }
  if (diagnosticFlags.includes('school_impact')) {
    flags.add('Consider classroom participation supports and student-led self-advocacy strategies based on recorded impact data.');
  }
  if (diagnosticFlags.includes('phonological_awareness')) {
    flags.add('Consider phonological awareness or literacy follow-up if reading/spelling concerns are reported.');
  }

  return Array.from(flags);
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
  const soundPatternSummary = summarizeBySound(items);
  const functionalSummary = summarizeFunctionalContexts(items);
  const followUpFlags = mergeUnique([
    ...buildFollowUpFlags(items),
    ...buildDiagnosticProfileFollowUps(assessment)
  ]);
  const focusSummary = assessment.focusTargets?.length ? assessment.focusTargets.join(', ') : 'SLP-selected assessment focus';
  const diagnosticLensSummary = assessment.diagnosticFlags?.length
    ? assessment.diagnosticFlags.map(friendlyDiagnosticFlagLabel).join(', ')
    : 'none selected';
  const questionnaireSummary = assessment.diagnosticQuestionnaires?.length
    ? assessment.diagnosticQuestionnaires.map(friendlyQuestionnaireLabel).join(', ')
    : 'none selected';
  const profileSummary = [
    assessment.studentAge ? `age ${assessment.studentAge}` : '',
    assessment.studentGender ? `gender/voice context: ${assessment.studentGender}` : '',
    assessment.languageBackground ? `language/dialect: ${assessment.languageBackground}` : '',
    assessment.hearingStatus ? `hearing/listening: ${assessment.hearingStatus}` : ''
  ].filter(Boolean).join('; ') || 'profile fields not entered';
  const setupSummary = `${assessment.timeBudgetMinutes || 'Untimed'} minute guide${assessment.setting ? ` in ${assessment.setting}` : ''}; focus: ${focusSummary}.`;
  const clinicianScratchpad = assessment.clinicianNotes?.trim()
    ? `SLP scratchpad / ideas entered during assessment:\n${assessment.clinicianNotes.trim()}`
    : 'SLP scratchpad / ideas entered during assessment: none entered yet.';
  const supportPlan = buildPracticePlanDraft(assessment, items);

  const summary = [
    `Diagnostic assessment draft for ${client?.displayName || 'student'}${assessment.studentAge ? `, age ${assessment.studentAge}` : ''}.`,
    `Student profile: ${profileSummary}.`,
    `Assessment setup: ${setupSummary}`,
    `Diagnostic lenses selected: ${diagnosticLensSummary}. Quick questionnaires/checks selected: ${questionnaireSummary}.`,
    `Reason/concern: ${assessment.primaryConcern || 'Speech clarity/intelligibility concern noted by clinician or caregiver.'}`,
    `Assessment activities completed: ${completedItems.length}/${items.length} checklist/probe items, ${sampleItems.filter(item => item.recordingIds?.length).length} connected speech samples with audio, and ${recordingCount} total linked recordings.`,
    `Sound probe observations: ${probeSummary}.`,
    `Pattern summary by sound/position:\n${soundPatternSummary}`,
    `Functional participation summary:\n${functionalSummary}`,
    `Cueing/stimulability observations: ${cueSummary}.`,
    `Functional/clinical observation flags: ${concernSummary}.`,
    clinicianScratchpad,
    `Consider / follow-up flags:\n${followUpFlags.map(flag => `- ${flag}`).join('\n')}`,
    'Clinical interpretation: This draft summarizes local checklist data and recordings. The SLP should review audio, compare findings with standardized or district-required measures when appropriate, and apply clinical judgment before diagnosing or making eligibility/treatment decisions.'
  ].join('\n\n');

  const recommendations = followUpFlags
    .concat([
      'Consider reviewing connected speech recordings for intelligibility, rate, consistency, and self-monitoring.',
      'Consider using Listener Check results only as supporting functional data, not as a standalone diagnostic decision.',
      'Consider using the practice starter as a clinician-editable bridge from assessment to first therapy activities.',
      'Consider sharing plain-language home practice only after the SLP confirms targets and next steps.'
    ])
    .map(item => `- ${item}`)
    .join('\n');

  return { summary, recommendations, supportPlan };
};

export function AssessmentTab() {
  const { masterKey } = useStore();
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [items, setItems] = useState<AssessmentItem[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [activeAssessmentId, setActiveAssessmentId] = useState('');
  const [launchPhase, setLaunchPhase] = useState<DiagnosticLaunchPhase>('patient_choice');
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<Assessment['template']>('adolescent_speech_intelligibility');
  const [studentName, setStudentName] = useState('');
  const [studentAge, setStudentAge] = useState('14');
  const [studentGender, setStudentGender] = useState('');
  const [languageBackground, setLanguageBackground] = useState('');
  const [hearingStatus, setHearingStatus] = useState('');
  const [primaryConcern, setPrimaryConcern] = useState('Speech clarity is harder in class, conversation, or with unfamiliar listeners.');
  const [setting, setSetting] = useState('Speech-language evaluation');
  const [timeBudgetMinutes, setTimeBudgetMinutes] = useState(20);
  const [focusTargets, setFocusTargets] = useState<string[]>(TEMPLATE_FOCUS.adolescent_speech_intelligibility);
  const [diagnosticFlags, setDiagnosticFlags] = useState<string[]>([]);
  const [questionnaireFlags, setQuestionnaireFlags] = useState<string[]>(['student_impact', 'listener_check']);
  const [customTarget, setCustomTarget] = useState('');
  const [clinicianNotes, setClinicianNotes] = useState('');
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [summaryDraft, setSummaryDraft] = useState('');
  const [recommendationsDraft, setRecommendationsDraft] = useState('');
  const [supportPlanDraft, setSupportPlanDraft] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [recordingItemId, setRecordingItemId] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [customLinePrompt, setCustomLinePrompt] = useState('');
  const [customLineScript, setCustomLineScript] = useState('');
  const [customLineKind, setCustomLineKind] = useState<AssessmentItemKind>('speech_sample');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const currentClientId = selectedClientId;
  const selectedClient = useMemo(
    () => clients.find(client => client.id === currentClientId),
    [clients, currentClientId]
  );
  const filteredClients = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return clients;
    return clients.filter(client => (
      client.displayName.toLowerCase().includes(query) ||
      client.initials.toLowerCase().includes(query) ||
      client.ageGroup?.toLowerCase().includes(query)
    ));
  }, [clients, studentSearch]);
  const clientAssessments = useMemo(
    () => assessments
      .filter(assessment => assessment.clientId === currentClientId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [assessments, currentClientId]
  );
  const selectedPreset = useMemo(
    () => QUICK_START_PRESETS.find(preset => (
      selectedTemplate === preset.template &&
      timeBudgetMinutes === preset.minutes &&
      primaryConcern === preset.concern
    )),
    [selectedTemplate, timeBudgetMinutes, primaryConcern]
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
  const activeSectionKeys = useMemo(
    () => Array.from(new Set(activeItems.map(item => item.sectionKey))),
    [activeItems]
  );
  const currentSectionKey = activeSectionKeys[Math.min(sectionIndex, Math.max(activeSectionKeys.length - 1, 0))] || 'consent';
  const currentSectionItems = useMemo(
    () => activeItems.filter(item => item.sectionKey === currentSectionKey),
    [activeItems, currentSectionKey]
  );
  const completedCount = activeItems.filter(item => item.status === 'complete').length;
  const progressPct = activeItems.length > 0 ? Math.round((completedCount / activeItems.length) * 100) : 0;
  const currentCoachItem = currentSectionItems.find(item => item.status !== 'complete') || currentSectionItems[0];
  const focusLabelSummary = focusTargets
    .map(target => FOCUS_OPTIONS.find(option => option.id === target)?.label || target)
    .join(', ');

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

  const resetForNewStudent = () => {
    setSelectedClientId('');
    setStudentName('');
    setStudentAge('14');
    setStudentGender('');
    setLanguageBackground('');
    setHearingStatus('');
    setPrimaryConcern('Speech clarity is harder in class, conversation, or with unfamiliar listeners.');
    setSetting('Speech-language evaluation');
    setClinicianNotes('');
    setConsentConfirmed(false);
    setLaunchPhase('new_student');
  };

  const selectExistingClient = (client: ClientProfile) => {
    const latestAssessment = assessments
      .filter(assessment => assessment.clientId === client.id)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
    setSelectedClientId(client.id);
    setStudentName(client.displayName);
    const ageMatch = client.ageGroup?.match(/\d+/);
    setStudentAge(latestAssessment?.studentAge?.toString() || ageMatch?.[0] || studentAge || '14');
    setStudentGender(latestAssessment?.studentGender || '');
    setLanguageBackground(latestAssessment?.languageBackground || '');
    setHearingStatus(latestAssessment?.hearingStatus || '');
    setSetting(latestAssessment?.setting || 'Speech-language evaluation');
    setPrimaryConcern(latestAssessment?.primaryConcern || client.notes?.split('\n')[0] || primaryConcern);
    setLaunchPhase('profile');
  };

  const toggleDiagnosticFlag = (flagId: string) => {
    setDiagnosticFlags(prev => (
      prev.includes(flagId)
        ? prev.filter(flag => flag !== flagId)
        : [...prev, flagId]
    ));
  };

  const toggleQuestionnaireFlag = (flagId: string) => {
    setQuestionnaireFlags(prev => (
      prev.includes(flagId)
        ? prev.filter(flag => flag !== flagId)
        : [...prev, flagId]
    ));
  };

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
      notes: [
        primaryConcern.trim(),
        studentGender.trim() ? `Gender/voice context: ${studentGender.trim()}` : '',
        languageBackground.trim() ? `Language/dialect: ${languageBackground.trim()}` : '',
        hearingStatus.trim() ? `Hearing/listening: ${hearingStatus.trim()}` : ''
      ].filter(Boolean).join('\n') || undefined,
      createdAt: now,
      updatedAt: now
    };
    await db.clients.add(client);
    setClients(prev => [...prev, client].sort((a, b) => a.displayName.localeCompare(b.displayName)));
    setSelectedClientId(client.id);
    return client.id;
  };

  const applyPreset = (preset: QuickStartPreset) => {
    setSelectedTemplate(preset.template);
    setPrimaryConcern(preset.concern);
    setSetting(preset.setting);
    setTimeBudgetMinutes(preset.minutes);
    setFocusTargets(preset.focusTargets);
    setDiagnosticFlags(preset.diagnosticFlags || []);
    setQuestionnaireFlags(preset.questionnaires || []);
    setLaunchPhase('ready');
  };

  const toggleFocusTarget = (targetId: string) => {
    setFocusTargets(prev => (
      prev.includes(targetId)
        ? prev.filter(target => target !== targetId)
        : [...prev, targetId]
    ));
  };

  const updateActiveAssessment = async (patch: Partial<Assessment>) => {
    if (!activeAssessment) return;
    const updatedAt = new Date().toISOString();
    const nextPatch = { ...patch, updatedAt };
    await db.assessments.update(activeAssessment.id, nextPatch);
    setAssessments(prev => prev.map(assessment => assessment.id === activeAssessment.id ? { ...assessment, ...nextPatch } : assessment));
  };

  const saveClinicianNotes = async () => {
    await updateActiveAssessment({
      clinicianNotes: clinicianNotes.trim() || undefined,
      timeBudgetMinutes,
      focusTargets,
      studentGender: studentGender.trim() || undefined,
      languageBackground: languageBackground.trim() || undefined,
      hearingStatus: hearingStatus.trim() || undefined,
      diagnosticFlags,
      diagnosticQuestionnaires: questionnaireFlags
    });
    setSaveStatus('Assessment notes saved locally.');
    setTimeout(() => setSaveStatus(''), 1400);
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
    const templateDefinition = getTemplateDefinition(selectedTemplate);
    const selectedFocusTargets = mergeUnique([
      ...focusTargets,
      ...(customTarget.trim() ? ['custom_target'] : [])
    ]);
    const selectedDiagnosticFlags = mergeUnique(diagnosticFlags);
    const selectedQuestionnaireFlags = mergeUnique(questionnaireFlags);
    const ageNumber = Number.parseInt(studentAge, 10);
    const assessment: Assessment = {
      id: assessmentId,
      clientId,
      template: templateDefinition.id,
      studentAge: Number.isFinite(ageNumber) ? ageNumber : undefined,
      studentGender: studentGender.trim() || undefined,
      languageBackground: languageBackground.trim() || undefined,
      hearingStatus: hearingStatus.trim() || undefined,
      diagnosticFlags: selectedDiagnosticFlags,
      diagnosticQuestionnaires: selectedQuestionnaireFlags,
      primaryConcern: primaryConcern.trim() || undefined,
      setting: setting.trim() || undefined,
      timeBudgetMinutes,
      focusTargets: selectedFocusTargets,
      clinicianNotes: clinicianNotes.trim() || undefined,
      consentConfirmed,
      status: 'draft',
      startedAt: now,
      createdAt: now,
      updatedAt: now
    };

    const templateItems = [
      ...buildCustomizedItems(
        templateDefinition,
        selectedFocusTargets,
        timeBudgetMinutes,
        customTarget
      ),
      ...buildDiagnosticProfileItems(selectedDiagnosticFlags, selectedQuestionnaireFlags)
    ].sort((a, b) => a.sortOrder - b.sortOrder);

    const assessmentItems: AssessmentItem[] = templateItems.map(item => ({
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
    setSelectedTemplate(templateDefinition.id);
    setFocusTargets(selectedFocusTargets);
    setDiagnosticFlags(selectedDiagnosticFlags);
    setQuestionnaireFlags(selectedQuestionnaireFlags);
    setSectionIndex(0);
    setSummaryDraft('');
    setRecommendationsDraft('');
    setSupportPlanDraft('');
  };

  const resumeAssessment = (assessment: Assessment) => {
    setActiveAssessmentId(assessment.id);
    setSelectedClientId(assessment.clientId);
    setSelectedTemplate(assessment.template);
    setStudentAge(assessment.studentAge?.toString() || '14');
    setStudentGender(assessment.studentGender || '');
    setLanguageBackground(assessment.languageBackground || '');
    setHearingStatus(assessment.hearingStatus || '');
    setPrimaryConcern(assessment.primaryConcern || '');
    setSetting(assessment.setting || 'Speech-language evaluation');
    setTimeBudgetMinutes(assessment.timeBudgetMinutes || 20);
    setFocusTargets(assessment.focusTargets?.length ? assessment.focusTargets : TEMPLATE_FOCUS[assessment.template]);
    setDiagnosticFlags(assessment.diagnosticFlags || []);
    setQuestionnaireFlags(assessment.diagnosticQuestionnaires || []);
    setClinicianNotes(assessment.clinicianNotes || '');
    setConsentConfirmed(assessment.consentConfirmed);
    const firstIncomplete = items
      .filter(item => item.assessmentId === assessment.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .find(item => item.status !== 'complete');
    const targetSection = firstIncomplete?.sectionKey || 'summary';
    const sectionKeys = Array.from(new Set(items.filter(item => item.assessmentId === assessment.id).sort((a, b) => a.sortOrder - b.sortOrder).map(item => item.sectionKey)));
    setSectionIndex(Math.max(0, sectionKeys.indexOf(targetSection)));
    setSummaryDraft(assessment.summary || '');
    setRecommendationsDraft(assessment.recommendations || '');
    setSupportPlanDraft(assessment.therapyIdeas || assessment.homePractice || '');
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
    const draft = buildAssessmentDraft({
      ...activeAssessment,
      clinicianNotes,
      timeBudgetMinutes,
      focusTargets,
      studentGender: studentGender.trim() || undefined,
      languageBackground: languageBackground.trim() || undefined,
      hearingStatus: hearingStatus.trim() || undefined,
      diagnosticFlags,
      diagnosticQuestionnaires: questionnaireFlags
    }, selectedClient, activeItems);
    setSummaryDraft(draft.summary);
    setRecommendationsDraft(draft.recommendations);
    setSupportPlanDraft(draft.supportPlan);
  };

  const saveAssessmentSummary = async (complete: boolean) => {
    if (!activeAssessment) return;
    const now = new Date().toISOString();
    const patch: Partial<Assessment> = {
      summary: summaryDraft,
      recommendations: recommendationsDraft,
      clinicianNotes: clinicianNotes.trim() || undefined,
      therapyIdeas: supportPlanDraft,
      homePractice: supportPlanDraft,
      timeBudgetMinutes,
      focusTargets,
      studentGender: studentGender.trim() || undefined,
      languageBackground: languageBackground.trim() || undefined,
      hearingStatus: hearingStatus.trim() || undefined,
      diagnosticFlags,
      diagnosticQuestionnaires: questionnaireFlags,
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
    await navigator.clipboard.writeText(`${summaryDraft}\n\nRecommendations / follow-up considerations:\n${recommendationsDraft}\n\nTherapy / practice starter:\n${supportPlanDraft}`);
    setSaveStatus('Assessment summary copied.');
    setTimeout(() => setSaveStatus(''), 1800);
  };

  const finishAssessment = () => {
    generateSummary();
    setSectionIndex(Math.max(activeSectionKeys.length - 1, 0));
  };

  const toggleItemTag = (item: AssessmentItem, tag: string) => {
    const currentTags = item.analysisTags || [];
    const analysisTags = currentTags.includes(tag)
      ? currentTags.filter(currentTag => currentTag !== tag)
      : [...currentTags, tag];
    updateItem(item.id, {
      analysisTags,
      status: item.status === 'not_started' ? 'in_progress' : item.status
    });
  };

  const appendQuickNote = (item: AssessmentItem, note: string) => {
    const existingNotes = item.notes?.trim();
    const notes = existingNotes ? `${existingNotes}; ${note}` : note;
    updateItem(item.id, {
      notes,
      status: item.status === 'not_started' ? 'in_progress' : item.status
    });
  };

  const addCustomAssessmentLine = async () => {
    if (!activeAssessment) return;
    const prompt = customLinePrompt.trim();
    if (!prompt) {
      alert('Add a prompt for the custom assessment line.');
      return;
    }

    const now = new Date().toISOString();
    const sectionItems = currentSectionItems.length ? currentSectionItems : activeItems;
    const maxSortOrder = sectionItems.reduce((max, item) => Math.max(max, item.sortOrder), sectionIndex * 100);
    const firstSectionItem = currentSectionItems[0];
    const customItem: AssessmentItem = {
      id: createId(),
      assessmentId: activeAssessment.id,
      sectionKey: currentSectionKey,
      sectionTitle: firstSectionItem?.sectionTitle || 'Custom Assessment Line',
      prompt,
      helperText: 'SLP-added line for this assessment. Use it for extra probes, student comments, or therapy-planning observations.',
      scriptText: customLineScript.trim() || undefined,
      listenFor: ['What changed?', 'What support helped?', 'Does this affect therapy planning?'],
      kind: customLineKind,
      status: 'not_started',
      recordingIds: [],
      analysisTags: ['custom line'],
      sortOrder: maxSortOrder + 1,
      createdAt: now,
      updatedAt: now
    };

    await db.assessmentItems.add(customItem);
    await updateActiveAssessment({});
    setItems(prev => [...prev, customItem]);
    setCustomLinePrompt('');
    setCustomLineScript('');
    setCustomLineKind('speech_sample');
    setSaveStatus('Custom line added.');
    setTimeout(() => setSaveStatus(''), 1400);
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${secs}`;
  };

  const brightInputClass = `w-full bg-white border border-sky-200 rounded-2xl p-3 min-h-[50px] text-sm font-semibold text-slate-950 placeholder-slate-400 shadow-sm ${FOCUS_CLASS}`;
  const brightCardClass = 'bg-white border border-sky-100 p-5 rounded-3xl shadow-lg shadow-sky-100/70 text-left';
  const selectedStudentLabel = selectedClient?.displayName || studentName.trim() || 'New student';
  const selectedDiagnosticName = selectedPreset?.title || getTemplateDefinition(selectedTemplate).title;
  const selectedDiagnosticSubtitle = selectedPreset?.subtitle || getTemplateDefinition(selectedTemplate).subtitle;

  if (!activeAssessment) {
    return (
      <div className="space-y-4 text-slate-950">
        <section className="bg-gradient-to-br from-white via-sky-50 to-amber-50 border border-sky-100 p-5 rounded-3xl shadow-xl shadow-sky-100/70 text-left space-y-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-700">Start Diagnostic</p>
            <h2 className="text-3xl font-black tracking-tight text-slate-950 mt-1">New Patient or Load Patient</h2>
            <p className="text-sm text-slate-700 leading-relaxed mt-2">
              Pick a student, choose one diagnostic, follow each line, record speech, then generate SLP-editable analysis and practice handouts.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={resetForNewStudent}
              className={`${BUTTON_CLASS} bg-sky-600 text-white px-4 text-base shadow-lg shadow-sky-200`}
            >
              New Patient
            </button>
            <button
              type="button"
              onClick={() => setLaunchPhase('load_student')}
              className={`${BUTTON_CLASS} bg-white border-2 border-sky-300 text-sky-900 px-4 text-base shadow-sm`}
            >
              Load Patient
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              ['1', 'Patient'],
              ['2', 'Profile'],
              ['3', 'Diagnostic'],
              ['4', 'Record']
            ].map(([number, label]) => (
              <div key={label} className="rounded-2xl bg-white/80 border border-sky-100 p-2">
                <span className="block text-sm font-black text-sky-700">{number}</span>
                <span className="block text-[10px] font-extrabold uppercase tracking-wide text-slate-600">{label}</span>
              </div>
            ))}
          </div>
        </section>

        {launchPhase === 'patient_choice' && (
          <section className={brightCardClass}>
            <h3 className="font-black text-lg text-slate-950 flex items-center gap-2">
              <UserPlus className="text-sky-600" size={20} />
              Start in two taps
            </h3>
            <p className="text-sm text-slate-700 mt-2">
              The app keeps the deeper clinical choices out of the way until after a patient is selected.
            </p>
            {clients.length > 0 && (
              <div className="mt-4 grid gap-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Recent patients</p>
                {clients.slice(0, 3).map(client => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => selectExistingClient(client)}
                    className={`w-full text-left bg-sky-50 border border-sky-100 p-4 rounded-2xl min-h-[64px] ${FOCUS_CLASS}`}
                  >
                    <span className="font-black text-slate-950">{client.displayName}</span>
                    <span className="block text-xs text-slate-600">{client.ageGroup || 'Saved patient'} · tap to review or start diagnostic</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {launchPhase === 'new_student' && (
          <section className={`${brightCardClass} space-y-4`}>
            <h3 className="font-black text-lg text-slate-950">New patient setup</h3>
            <div className="grid gap-3">
              <label className="text-left text-[10px] font-black uppercase tracking-wider text-slate-600" htmlFor="assessment-student-name">
                Name
                <input
                  id="assessment-student-name"
                  value={studentName}
                  onChange={event => setStudentName(event.target.value)}
                  placeholder="Student display name"
                  className={`mt-2 ${brightInputClass}`}
                />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-left text-[10px] font-black uppercase tracking-wider text-slate-600" htmlFor="assessment-age">
                  Age
                  <input
                    id="assessment-age"
                    value={studentAge}
                    onChange={event => setStudentAge(event.target.value)}
                    inputMode="numeric"
                    className={`mt-2 ${brightInputClass}`}
                  />
                </label>
                <label className="text-left text-[10px] font-black uppercase tracking-wider text-slate-600" htmlFor="assessment-gender">
                  Gender / voice context
                  <input
                    id="assessment-gender"
                    value={studentGender}
                    onChange={event => setStudentGender(event.target.value)}
                    placeholder="Optional"
                    className={`mt-2 ${brightInputClass}`}
                  />
                </label>
              </div>
              <label className="text-left text-[10px] font-black uppercase tracking-wider text-slate-600" htmlFor="assessment-language">
                Language / dialect
                <input
                  id="assessment-language"
                  value={languageBackground}
                  onChange={event => setLanguageBackground(event.target.value)}
                  placeholder="Example: English, Spanish at home, regional dialect"
                  className={`mt-2 ${brightInputClass}`}
                />
              </label>
              <label className="text-left text-[10px] font-black uppercase tracking-wider text-slate-600" htmlFor="assessment-hearing">
                Hearing / listening access
                <input
                  id="assessment-hearing"
                  value={hearingStatus}
                  onChange={event => setHearingStatus(event.target.value)}
                  placeholder="Example: passed screen, DHH, classroom noise concern"
                  className={`mt-2 ${brightInputClass}`}
                />
              </label>
              <label className="text-left text-[10px] font-black uppercase tracking-wider text-slate-600" htmlFor="assessment-concern">
                Main concern
                <textarea
                  id="assessment-concern"
                  value={primaryConcern}
                  onChange={event => setPrimaryConcern(event.target.value)}
                  rows={3}
                  className={`mt-2 ${brightInputClass} select-text`}
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!studentName.trim()) {
                  alert('Add a patient name first.');
                  return;
                }
                setLaunchPhase('diagnostic');
              }}
              className={`${BUTTON_CLASS} w-full bg-sky-600 text-white text-base shadow-lg shadow-sky-200`}
            >
              Choose Diagnostic
            </button>
          </section>
        )}

        {launchPhase === 'load_student' && (
          <section className={`${brightCardClass} space-y-4`}>
            <h3 className="font-black text-lg text-slate-950">Load patient</h3>
            <input
              value={studentSearch}
              onChange={event => setStudentSearch(event.target.value)}
              placeholder="Search by name, initials, or age"
              className={brightInputClass}
              aria-label="Search saved patients"
            />
            <div className="grid gap-2">
              {filteredClients.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
                  No saved patients found. Create a new patient to start.
                </div>
              )}
              {filteredClients.map(client => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => selectExistingClient(client)}
                  className={`w-full text-left bg-sky-50 border border-sky-100 p-4 rounded-2xl min-h-[68px] ${FOCUS_CLASS}`}
                >
                  <span className="font-black text-slate-950">{client.displayName}</span>
                  <span className="block text-xs text-slate-600">{client.ageGroup || 'Saved patient'} · {assessments.filter(assessment => assessment.clientId === client.id).length} saved diagnostics</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={resetForNewStudent}
              className={`${BUTTON_CLASS} w-full bg-white border border-sky-200 text-sky-900`}
            >
              Create New Patient Instead
            </button>
          </section>
        )}

        {launchPhase === 'profile' && (
          <section className={`${brightCardClass} space-y-4`}>
            <h3 className="font-black text-lg text-slate-950">{selectedStudentLabel}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-left text-[10px] font-black uppercase tracking-wider text-slate-600" htmlFor="assessment-profile-age">
                Age
                <input
                  id="assessment-profile-age"
                  value={studentAge}
                  onChange={event => setStudentAge(event.target.value)}
                  inputMode="numeric"
                  className={`mt-2 ${brightInputClass}`}
                />
              </label>
              <label className="text-left text-[10px] font-black uppercase tracking-wider text-slate-600" htmlFor="assessment-profile-gender">
                Gender / voice context
                <input
                  id="assessment-profile-gender"
                  value={studentGender}
                  onChange={event => setStudentGender(event.target.value)}
                  placeholder="Optional"
                  className={`mt-2 ${brightInputClass}`}
                />
              </label>
            </div>
            <label className="text-left text-[10px] font-black uppercase tracking-wider text-slate-600 block" htmlFor="assessment-profile-language">
              Language / dialect
              <input
                id="assessment-profile-language"
                value={languageBackground}
                onChange={event => setLanguageBackground(event.target.value)}
                placeholder="Optional"
                className={`mt-2 ${brightInputClass}`}
              />
            </label>
            <label className="text-left text-[10px] font-black uppercase tracking-wider text-slate-600 block" htmlFor="assessment-profile-hearing">
              Hearing / listening access
              <input
                id="assessment-profile-hearing"
                value={hearingStatus}
                onChange={event => setHearingStatus(event.target.value)}
                placeholder="Optional"
                className={`mt-2 ${brightInputClass}`}
              />
            </label>
            {clientAssessments.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Old assessments</p>
                {clientAssessments.slice(0, 3).map(assessment => (
                  <button
                    key={assessment.id}
                    type="button"
                    onClick={() => resumeAssessment(assessment)}
                    className={`w-full text-left bg-white border border-slate-200 p-4 rounded-2xl min-h-[64px] ${FOCUS_CLASS}`}
                  >
                    <span className="font-black text-slate-950">{assessment.status === 'completed' ? 'Completed' : 'Draft'} diagnostic</span>
                    <span className="block text-xs text-slate-600">{new Date(assessment.updatedAt).toLocaleString()} · {assessment.primaryConcern || 'Speech clarity assessment'}</span>
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setLaunchPhase('diagnostic')}
              className={`${BUTTON_CLASS} w-full bg-sky-600 text-white text-base shadow-lg shadow-sky-200`}
            >
              Create New Diagnostic
            </button>
          </section>
        )}

        {launchPhase === 'diagnostic' && (
          <section className={`${brightCardClass} space-y-4`}>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Choose one path</p>
              <h3 className="font-black text-lg text-slate-950">What do you need today?</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {QUICK_START_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={`text-left p-4 rounded-3xl border min-h-[116px] transition ${FOCUS_CLASS} ${
                    selectedPreset?.id === preset.id
                      ? 'bg-sky-600 border-sky-700 text-white shadow-lg shadow-sky-200'
                      : 'bg-sky-50 border-sky-100 text-slate-900'
                  }`}
                >
                  <span className="text-base font-black block">{preset.title}</span>
                  <span className={`text-xs block mt-2 leading-relaxed ${selectedPreset?.id === preset.id ? 'text-sky-50' : 'text-slate-600'}`}>{preset.subtitle}</span>
                  <span className={`text-[10px] font-black uppercase tracking-wider block mt-3 ${selectedPreset?.id === preset.id ? 'text-white' : 'text-sky-700'}`}>{preset.minutes} min</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {launchPhase === 'ready' && (
          <section className={`${brightCardClass} space-y-4`}>
            <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Ready</p>
              <h3 className="font-black text-xl text-slate-950">{selectedStudentLabel}</h3>
              <p className="text-sm text-slate-700 mt-1">{selectedDiagnosticName}: {selectedDiagnosticSubtitle}</p>
            </div>

            <details className="bg-slate-50 border border-slate-200 rounded-3xl p-4">
              <summary className="cursor-pointer text-sm font-black text-slate-900">Customize diagnostic details</summary>
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[10, 20, 30, 45].map(minutes => (
                    <button
                      key={minutes}
                      type="button"
                      onClick={() => setTimeBudgetMinutes(minutes)}
                      className={`${BUTTON_CLASS} text-xs ${
                        timeBudgetMinutes === minutes
                          ? 'bg-sky-600 text-white'
                          : 'bg-white border border-sky-200 text-sky-900'
                      }`}
                    >
                      {minutes} min
                    </button>
                  ))}
                </div>

                <label className="block text-left text-[10px] font-black uppercase tracking-wider text-slate-600" htmlFor="assessment-setting">
                  Setting
                  <input
                    id="assessment-setting"
                    value={setting}
                    onChange={event => setSetting(event.target.value)}
                    className={`mt-2 ${brightInputClass}`}
                  />
                </label>

                <label className="block text-left text-[10px] font-black uppercase tracking-wider text-slate-600" htmlFor="assessment-custom-target">
                  Optional custom target
                  <input
                    id="assessment-custom-target"
                    value={customTarget}
                    onChange={event => setCustomTarget(event.target.value)}
                    placeholder="Example: vocalic /r/, /th/, presentation clarity"
                    className={`mt-2 ${brightInputClass}`}
                  />
                </label>

                <label className="block text-left text-[10px] font-black uppercase tracking-wider text-slate-600" htmlFor="assessment-ready-concern">
                  Main concern
                  <textarea
                    id="assessment-ready-concern"
                    value={primaryConcern}
                    onChange={event => setPrimaryConcern(event.target.value)}
                    rows={3}
                    className={`mt-2 ${brightInputClass} select-text`}
                  />
                </label>

                <div className="space-y-2 text-left">
                  <span className="block text-[10px] font-black uppercase tracking-wider text-slate-600">Clinical lenses</span>
                  <div className="flex flex-wrap gap-2">
                    {DIAGNOSTIC_FLAG_OPTIONS.map(option => {
                      const isSelected = diagnosticFlags.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleDiagnosticFlag(option.id)}
                          title={option.helper}
                          className={`min-h-[42px] px-3 rounded-xl border text-[10px] font-black transition ${FOCUS_CLASS} ${
                            isSelected
                              ? 'bg-sky-600 border-sky-700 text-white'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2 text-left">
                  <span className="block text-[10px] font-black uppercase tracking-wider text-slate-600">Quick checks</span>
                  <div className="flex flex-wrap gap-2">
                    {QUESTIONNAIRE_OPTIONS.map(option => {
                      const isSelected = questionnaireFlags.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleQuestionnaireFlag(option.id)}
                          title={option.helper}
                          className={`min-h-[42px] px-3 rounded-xl border text-[10px] font-black transition ${FOCUS_CLASS} ${
                            isSelected
                              ? 'bg-emerald-600 border-emerald-700 text-white'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2 text-left">
                  <span className="block text-[10px] font-black uppercase tracking-wider text-slate-600">Focus areas</span>
                  <div className="flex flex-wrap gap-2">
                    {FOCUS_OPTIONS.map(option => {
                      const isSelected = focusTargets.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleFocusTarget(option.id)}
                          title={option.helper}
                          className={`min-h-[42px] px-3 rounded-xl border text-[10px] font-black transition ${FOCUS_CLASS} ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-700 text-white'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </details>

            <label className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer text-left ${consentConfirmed ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-amber-50 border-amber-200 text-amber-950'} ${FOCUS_CLASS}`}>
              <input
                type="checkbox"
                checked={consentConfirmed}
                onChange={event => setConsentConfirmed(event.target.checked)}
                className="mt-1 h-5 w-5 accent-emerald-600"
              />
              <span className="text-sm leading-relaxed">
                I have appropriate consent/permission for assessment notes and any voice recordings saved on this device.
              </span>
            </label>

            <button
              type="button"
              onClick={startAssessment}
              className={`${BUTTON_CLASS} w-full bg-emerald-600 text-white text-base shadow-lg shadow-emerald-200`}
            >
              Start Guided Diagnostic
            </button>
          </section>
        )}

        <section className="bg-white border border-slate-200 p-4 rounded-3xl text-left shadow-sm">
          <p className="text-xs text-slate-700 leading-relaxed">
            Local-first note: this workflow uses phone recordings, SLP-entered checklist data, Listener Check, and editable drafts only. It can support clinical thinking, but it does not replace standardized measures, eligibility rules, referrals, diagnosis, or SLP judgment.
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

        <div className="grid grid-cols-1 md:grid-cols-[0.9fr_1.1fr] gap-3">
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3 text-left">
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Today’s plan</span>
            <p className="text-sm font-bold text-slate-100 mt-1">{timeBudgetMinutes || activeAssessment.timeBudgetMinutes || 'Open'} minute guide</p>
            <p className="text-[11px] text-slate-400 leading-relaxed mt-1">{focusLabelSummary || 'SLP-selected focus'}</p>
          </div>
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3 text-left space-y-2">
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500" htmlFor="assessment-scratchpad">
              SLP scratchpad / ideas
            </label>
            <textarea
              id="assessment-scratchpad"
              value={clinicianNotes}
              onChange={event => setClinicianNotes(event.target.value)}
              onBlur={saveClinicianNotes}
              placeholder="Fast notes: history, observations, therapy ideas, parent questions, next probes..."
              rows={3}
              className={`w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 text-sm text-slate-100 placeholder-slate-600 select-text ${FOCUS_CLASS}`}
            />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {activeSectionKeys.map((sectionKey, index) => {
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

      {currentCoachItem && currentSectionKey !== 'summary' && (
        <section className="bg-slate-800 border border-cyan-500/25 p-5 rounded-3xl shadow-xl text-left space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-cyan-200">Do this now</p>
              <h3 className="text-lg font-black text-white mt-1">{currentCoachItem.sectionTitle}</h3>
              <p className="text-xs text-slate-400 mt-1">{currentCoachItem.prompt}</p>
            </div>
            <span className="shrink-0 rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-[10px] font-extrabold uppercase text-slate-300">
              Step {sectionIndex + 1}/{activeSectionKeys.length}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3">
              <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">1. Say / ask</span>
              <p className="text-sm text-slate-200 leading-relaxed mt-1">{currentCoachItem.scriptText || currentCoachItem.prompt}</p>
            </div>
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3">
              <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">2. Listen for</span>
              <ul className="mt-1 space-y-1 text-xs text-slate-300">
                {listenForItem(currentCoachItem).map(point => (
                  <li key={point}>• {point}</li>
                ))}
              </ul>
            </div>
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3">
              <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">3. Capture</span>
              <p className="text-xs text-slate-300 leading-relaxed mt-1">Record if useful, tap the closest result, add one quick note, then move on.</p>
              {isSpeechRecordable(currentCoachItem.kind) && (
                <button
                  type="button"
                  onClick={recordingItemId === currentCoachItem.id ? stopRecording : () => startRecording(currentCoachItem)}
                  disabled={!!recordingItemId && recordingItemId !== currentCoachItem.id}
                  className={`${BUTTON_CLASS} mt-3 w-full text-xs flex items-center justify-center gap-2 ${
                    recordingItemId === currentCoachItem.id
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 disabled:opacity-50'
                  }`}
                >
                  {recordingItemId === currentCoachItem.id ? <Square size={16} /> : <Mic size={16} />}
                  {recordingItemId === currentCoachItem.id ? `Stop ${formatTime(recordingSeconds)}` : 'Record current line'}
                </button>
              )}
            </div>
          </div>
        </section>
      )}

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
          <label className="block text-left text-[10px] font-extrabold uppercase tracking-wider text-slate-500" htmlFor="assessment-support-plan">
            Therapy / home-practice starter
          </label>
          <textarea
            id="assessment-support-plan"
            value={supportPlanDraft}
            onChange={event => setSupportPlanDraft(event.target.value)}
            rows={7}
            placeholder="Generate a draft, then edit into therapy ideas or caregiver-friendly practice."
            className={`w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 text-sm text-slate-100 leading-relaxed placeholder-slate-600 select-text ${FOCUS_CLASS}`}
          />
          <div className="bg-white border border-blue-100 rounded-3xl p-4 text-left shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">Patient handout preview</p>
            <h4 className="text-base font-black text-slate-950 mt-1">{selectedClient?.displayName || 'Student'} practice sheet</h4>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              This creates a plain-language sheet from the assessment. On phones, choose <strong>Print</strong>, then <strong>Save as PDF</strong> if available.
            </p>
            <div className="mt-3 grid gap-2">
              {buildPatientHandoutSections(activeAssessment, activeItems, supportPlanDraft).slice(0, 3).map(section => (
                <div key={section.title} className="rounded-2xl bg-blue-50 border border-blue-100 p-3">
                  <p className="text-xs font-black text-slate-950">{section.title}</p>
                  <p className="text-xs text-slate-700 mt-1 leading-relaxed whitespace-pre-wrap">{section.body}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
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
              onClick={() => saveAssessmentSummary(false)}
              className={`${BUTTON_CLASS} bg-slate-900 border border-slate-700 text-slate-200 flex items-center justify-center gap-2`}
            >
              <Save size={16} />
              Save Draft
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className={`${BUTTON_CLASS} bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2`}
            >
              <Printer size={16} />
              Print PDF
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
          <PrintableHandout
            title="Speech Practice Sheet"
            studentName={selectedClient?.displayName}
            subtitle="Plain-language practice after today’s speech assessment."
            sections={buildPatientHandoutSections(activeAssessment, activeItems, supportPlanDraft)}
            footerNote="This handout is clinician-reviewed practice guidance. It does not diagnose or replace the SLP’s clinical judgment."
          />
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
              onToggleTag={(tag) => toggleItemTag(item, tag)}
              onAppendNote={(note) => appendQuickNote(item, note)}
              onRecord={() => startRecording(item)}
              onStop={stopRecording}
            />
          ))}
          <section className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-3 text-left">
            <h3 className="font-extrabold text-base text-slate-100 flex items-center gap-2 border-b border-slate-700/60 pb-3">
              <UserPlus className="text-cyan-300" size={18} />
              Add what you need
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              If the SLP hears something unexpected, add a custom probe, checklist item, student quote, or therapy-planning line without leaving the assessment.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-[0.8fr_1.2fr] gap-2">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500" htmlFor="custom-line-kind">
                Type
                <select
                  id="custom-line-kind"
                  value={customLineKind}
                  onChange={event => setCustomLineKind(event.target.value as AssessmentItemKind)}
                  className={`mt-2 w-full min-h-[48px] bg-slate-900 border border-slate-700 rounded-2xl p-3 text-sm text-slate-100 ${FOCUS_CLASS}`}
                >
                  <option value="speech_sample">Speech sample</option>
                  <option value="sound_probe">Sound probe</option>
                  <option value="stimulability">Cueing response</option>
                  <option value="question">Question</option>
                  <option value="checklist">Checklist</option>
                  <option value="participation">Participation</option>
                </select>
              </label>
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500" htmlFor="custom-line-prompt">
                Prompt / observation
                <input
                  id="custom-line-prompt"
                  value={customLinePrompt}
                  onChange={event => setCustomLinePrompt(event.target.value)}
                  placeholder="Example: Probe /r/ in student’s own basketball vocabulary"
                  className={`mt-2 w-full min-h-[48px] bg-slate-900 border border-slate-700 rounded-2xl p-3 text-sm text-slate-100 placeholder-slate-600 ${FOCUS_CLASS}`}
                />
              </label>
            </div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500" htmlFor="custom-line-script">
              Optional “say this” script
            </label>
            <input
              id="custom-line-script"
              value={customLineScript}
              onChange={event => setCustomLineScript(event.target.value)}
              placeholder="Add the exact clinician/student prompt if helpful"
              className={`w-full min-h-[48px] bg-slate-900 border border-slate-700 rounded-2xl p-3 text-sm text-slate-100 placeholder-slate-600 ${FOCUS_CLASS}`}
            />
            <button
              type="button"
              onClick={addCustomAssessmentLine}
              className={`${BUTTON_CLASS} w-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-200`}
            >
              Add Custom Line
            </button>
          </section>
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
        {sectionIndex < activeSectionKeys.length - 1 ? (
          <button
            type="button"
            onClick={() => setSectionIndex(index => Math.min(activeSectionKeys.length - 1, index + 1))}
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
  onToggleTag,
  onAppendNote,
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
  onToggleTag: (tag: string) => void;
  onAppendNote: (note: string) => void;
  onRecord: () => void;
  onStop: () => void;
}) {
  const options = resultOptionsForKind(item.kind);
  const tagOptions = tagOptionsForKind(item.kind);
  const listenFor = listenForItem(item);
  const quickNotes = quickNoteOptionsForItem(item);

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

      {item.scriptText && (
        <div className="bg-cyan-500/10 border border-cyan-500/25 rounded-2xl p-3">
          <span className="block text-[9px] font-extrabold uppercase tracking-wider text-cyan-300 mb-1">Say this</span>
          <p className="text-sm text-cyan-50 leading-relaxed">{item.scriptText}</p>
        </div>
      )}

      <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3">
        <span className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">Listen for</span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {listenFor.map(point => (
            <span key={point} className="rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-[11px] text-slate-300 leading-snug">
              {point}
            </span>
          ))}
        </div>
      </div>

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

      {tagOptions.length > 0 && (
        <div className="space-y-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Quick analysis tags</span>
          <div className="flex flex-wrap gap-2">
            {tagOptions.map(tag => {
              const isSelected = item.analysisTags?.includes(tag) || false;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onToggleTag(tag)}
                  className={`min-h-[40px] px-3 rounded-xl border text-[10px] font-bold transition ${FOCUS_CLASS} ${
                    isSelected
                      ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">One-tap note ideas</span>
        <div className="flex flex-wrap gap-2">
          {quickNotes.map(note => (
            <button
              key={note}
              type="button"
              onClick={() => onAppendNote(note)}
              className={`min-h-[40px] px-3 rounded-xl border text-[10px] font-bold bg-slate-900 border-slate-700 text-slate-400 transition ${FOCUS_CLASS}`}
            >
              + {note}
            </button>
          ))}
        </div>
      </div>

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
