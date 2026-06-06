type LegacyAvailability = 'yes' | 'no' | 'readily';
type LanguageModelAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

interface LegacyAssistantFactory {
  capabilities: () => Promise<{ available: LegacyAvailability }>;
  create: (options?: { systemPrompt?: string }) => Promise<BuiltInAISession>;
}

interface LegacyAIWindow extends Window {
  ai?: {
    assistant?: LegacyAssistantFactory;
  };
}

interface LanguageModelFactory {
  availability: () => Promise<LanguageModelAvailability>;
  create: (options?: { systemPrompt?: string }) => Promise<BuiltInAISession>;
}

interface LanguageModelWindow extends Window {
  LanguageModel?: LanguageModelFactory;
}

export interface BuiltInAISession {
  prompt: (text: string) => Promise<string>;
  destroy?: () => void;
}

export interface BuiltInAIStatus {
  available: boolean;
  canTryDesktopFlags: boolean;
  isAndroid: boolean;
  isIOS: boolean;
  isChromium: boolean;
  source: 'LanguageModel' | 'window.ai' | 'none';
  state: 'available' | 'downloadable' | 'downloading' | 'unsupported' | 'unavailable' | 'unknown';
  message: string;
  setupTitle: string;
  setupSteps: string[];
}

const getUserAgent = () => {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || navigator.vendor || '';
};

export const getPlatformInfo = () => {
  const userAgent = getUserAgent();
  const isAndroid = /Android/i.test(userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  const isChromium = /Chrome|Chromium|CriOS|Edg/i.test(userAgent);
  return { userAgent, isAndroid, isIOS, isChromium };
};

export const getDesktopFlagSteps = () => [
  'Use desktop Chrome, Edge, or ChromeOS where the built-in AI APIs are currently exposed.',
  'Open chrome://flags/#optimization-guide-on-device-model and enable the on-device model flag if your browser offers it.',
  'Open chrome://flags/#prompt-api-for-gemini-nano and enable the Prompt API flag if your browser offers it.',
  'Relaunch the browser and reopen Hear for Speech. The app will still work with local rule-based tools if the model is unavailable.'
];

export const getUnsupportedMobileSteps = (platformLabel: string) => [
  `${platformLabel} currently does not expose Chrome built-in Gemini Nano / Prompt API to web apps.`,
  'There is no app-side switch that can force-enable flags when Chrome says “not available on your platform.”',
  'Use Hear for Speech normally: guided sessions, assessment checklists, recordings, Listener Check, summaries, and exports still run local-first.',
  'If you want to experiment with browser built-in AI, try the same account/site on supported desktop Chrome or Chromebook Plus instead.'
];

export const detectBuiltInAI = async (): Promise<BuiltInAIStatus> => {
  const { isAndroid, isIOS, isChromium } = getPlatformInfo();
  const canTryDesktopFlags = isChromium && !isAndroid && !isIOS;
  const mobilePlatform = isAndroid ? 'Android Chrome / Google Pixel' : 'iOS Chrome/Safari';

  const languageWindow = window as LanguageModelWindow;
  if (languageWindow.LanguageModel) {
    try {
      const availability = await languageWindow.LanguageModel.availability();
      if (availability === 'available') {
        return {
          available: true,
          canTryDesktopFlags,
          isAndroid,
          isIOS,
          isChromium,
          source: 'LanguageModel',
          state: 'available',
          message: 'Chrome built-in LanguageModel API is available on this device.',
          setupTitle: 'Built-in AI is ready',
          setupSteps: ['No setup needed. The app can try the browser built-in model for optional drafting helpers.']
        };
      }

      return {
        available: false,
        canTryDesktopFlags,
        isAndroid,
        isIOS,
        isChromium,
        source: 'LanguageModel',
        state: availability,
        message: availability === 'downloadable'
          ? 'Chrome reports the built-in model may be downloadable, but it is not ready yet.'
          : availability === 'downloading'
            ? 'Chrome is downloading the built-in model. Keep the browser open and try again later.'
            : 'Chrome built-in LanguageModel API is present but unavailable on this device.',
        setupTitle: canTryDesktopFlags ? 'Desktop experimental setup' : `${mobilePlatform} support`,
        setupSteps: canTryDesktopFlags ? getDesktopFlagSteps() : getUnsupportedMobileSteps(mobilePlatform)
      };
    } catch {
      return {
        available: false,
        canTryDesktopFlags,
        isAndroid,
        isIOS,
        isChromium,
        source: 'LanguageModel',
        state: 'unknown',
        message: 'Chrome exposed LanguageModel, but capability detection failed. The app will use local rule-based guidance.',
        setupTitle: canTryDesktopFlags ? 'Desktop experimental setup' : `${mobilePlatform} support`,
        setupSteps: canTryDesktopFlags ? getDesktopFlagSteps() : getUnsupportedMobileSteps(mobilePlatform)
      };
    }
  }

  const legacyWindow = window as LegacyAIWindow;
  if (legacyWindow.ai?.assistant) {
    try {
      const capabilities = await legacyWindow.ai.assistant.capabilities();
      const available = capabilities.available !== 'no';
      return {
        available,
        canTryDesktopFlags,
        isAndroid,
        isIOS,
        isChromium,
        source: 'window.ai',
        state: available ? 'available' : 'unavailable',
        message: available
          ? `Legacy window.ai assistant is available (${capabilities.available}).`
          : 'Legacy window.ai assistant exists but reports unavailable.',
        setupTitle: available ? 'Built-in AI is ready' : canTryDesktopFlags ? 'Desktop experimental setup' : `${mobilePlatform} support`,
        setupSteps: available
          ? ['No setup needed. The app can try the browser built-in assistant for optional drafting helpers.']
          : canTryDesktopFlags ? getDesktopFlagSteps() : getUnsupportedMobileSteps(mobilePlatform)
      };
    } catch {
      return {
        available: false,
        canTryDesktopFlags,
        isAndroid,
        isIOS,
        isChromium,
        source: 'window.ai',
        state: 'unknown',
        message: 'Legacy window.ai assistant detection failed. The app will use local rule-based guidance.',
        setupTitle: canTryDesktopFlags ? 'Desktop experimental setup' : `${mobilePlatform} support`,
        setupSteps: canTryDesktopFlags ? getDesktopFlagSteps() : getUnsupportedMobileSteps(mobilePlatform)
      };
    }
  }

  return {
    available: false,
    canTryDesktopFlags,
    isAndroid,
    isIOS,
    isChromium,
    source: 'none',
    state: isAndroid || isIOS ? 'unsupported' : 'unavailable',
    message: isAndroid || isIOS
      ? 'Chrome built-in Gemini Nano / Prompt API is not currently exposed to Android/iOS web apps. Hear for Speech still works offline with local guided tools.'
      : 'No Chrome built-in AI API was found. Hear for Speech will use local rule-based guidance.',
    setupTitle: isAndroid || isIOS ? `${mobilePlatform} support` : 'Desktop experimental setup',
    setupSteps: isAndroid || isIOS ? getUnsupportedMobileSteps(mobilePlatform) : getDesktopFlagSteps()
  };
};

export const createBuiltInAISession = async (systemPrompt: string): Promise<BuiltInAISession | null> => {
  const languageWindow = window as LanguageModelWindow;
  if (languageWindow.LanguageModel) {
    const availability = await languageWindow.LanguageModel.availability();
    if (availability === 'available') {
      return languageWindow.LanguageModel.create({ systemPrompt });
    }
  }

  const legacyWindow = window as LegacyAIWindow;
  if (legacyWindow.ai?.assistant) {
    const capabilities = await legacyWindow.ai.assistant.capabilities();
    if (capabilities.available !== 'no') {
      return legacyWindow.ai.assistant.create({ systemPrompt });
    }
  }

  return null;
};

export const getBuiltInAIPlainLanguageGuidance = () => {
  const { isAndroid, isIOS } = getPlatformInfo();
  if (isAndroid) {
    return "On Google Pixel / Android Chrome, Chrome's built-in Gemini Nano Prompt API is not currently exposed to web apps. If Chrome says the flags are not available on your platform, there is no app-side way to force them on. Hear for Speech still runs local-first with guided assessment, recording, checklists, and rule-based summaries.";
  }
  if (isIOS) {
    return "On iPhone/iPad browsers, Chrome built-in Gemini Nano Prompt API is not currently exposed to web apps. Hear for Speech still runs local-first with guided assessment, recording, checklists, and rule-based summaries.";
  }
  return "If your desktop Chrome build offers the built-in AI flags, you can experiment with them. If not, no problem: Hear for Speech still runs local-first with guided assessment, recording, checklists, and rule-based summaries.";
};
