import { create } from 'zustand';

interface AppState {
  activeTab: 'session' | 'assessment' | 'visualizer' | 'tracker' | 'protocol' | 'export';
  setActiveTab: (tab: 'session' | 'assessment' | 'visualizer' | 'tracker' | 'protocol' | 'export') => void;
  hasLocalAI: boolean;
  setHasLocalAI: (has: boolean) => void;
  aiStatus: string;
  setAiStatus: (status: string) => void;
  
  // In-memory database encryption master key
  masterKey: CryptoKey | null;
  setMasterKey: (key: CryptoKey | null) => void;
  
  // Cache of security lock state
  isSecurityEnabled: boolean;
  setIsSecurityEnabled: (enabled: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  activeTab: 'session',
  setActiveTab: (tab) => set({ activeTab: tab }),
  hasLocalAI: false,
  setHasLocalAI: (has) => set({ hasLocalAI: has }),
  aiStatus: 'Detecting clinical AI capability...',
  setAiStatus: (status) => set({ aiStatus: status }),
  
  masterKey: null,
  setMasterKey: (key) => set({ masterKey: key }),
  
  isSecurityEnabled: localStorage.getItem('hfs_security_enabled') === 'true',
  setIsSecurityEnabled: (enabled) => set({ isSecurityEnabled: enabled }),
}));
