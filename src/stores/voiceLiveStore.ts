import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { VoiceState, VoiceLiveSettings } from '../services/voiceLive/types';

// ═══════════════════════════════════════════════════════════
// Voice Live Store — State management for Voice Chat feature
//
// State flow:
//   idle → listening → thinking → speaking → listening → ...
//
// Mic behavior:
//   listening  → mic OPEN  (user speaks)
//   thinking   → mic MUTED (Gateway processing)
//   speaking   → mic MUTED (Gemini speaks, user can interrupt manually)
//   idle       → mic OFF   (not connected)
// ═══════════════════════════════════════════════════════════

interface VoiceLiveState {
  // ── Connection State ──
  isConnected: boolean;
  voiceState: VoiceState;
  isMicActive: boolean;
  elapsedSeconds: number;

  // ── Session ──
  sessionKey: string;
  sessionCounter: number;

  // ── Settings (persisted) ──
  geminiApiKey: string;
  geminiModel: string;
  geminiVoice: string;
  responseModel: string;

  // ── Audio Analysis (0-1, updated per frame) ──
  audioLevel: number;

  // ── UI State ──
  settingsOpen: boolean;
  error: string | null;

  // ── Actions ──
  setVoiceState: (state: VoiceState) => void;
  setConnected: (connected: boolean) => void;
  setMicActive: (active: boolean) => void;
  setElapsedSeconds: (seconds: number) => void;
  incrementElapsed: () => void;

  setSessionKey: (key: string) => void;
  newSession: () => void;

  setAudioLevel: (level: number) => void;
  setSettingsOpen: (open: boolean) => void;
  setError: (error: string | null) => void;

  updateSettings: (settings: Partial<VoiceLiveSettings>) => void;

  // ── Reset ──
  reset: () => void;
}

const DEFAULT_SESSION_KEY = 'agent:main:voice';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-native-audio-latest';
const DEFAULT_GEMINI_VOICE = 'Orus';

export const useVoiceLiveStore = create<VoiceLiveState>()(
  persist(
    (set, get) => ({
      // ── Initial state ──
      isConnected: false,
      voiceState: 'idle' as VoiceState,
      isMicActive: false,
      elapsedSeconds: 0,

      sessionKey: DEFAULT_SESSION_KEY,
      sessionCounter: 0,

      geminiApiKey: '',
      geminiModel: DEFAULT_GEMINI_MODEL,
      geminiVoice: DEFAULT_GEMINI_VOICE,
      responseModel: '',

      audioLevel: 0,

      settingsOpen: false,
      error: null,

      // ── Actions ──
      setVoiceState: (voiceState) => set({ voiceState }),
      setConnected: (isConnected) => set({ isConnected }),
      setMicActive: (isMicActive) => set({ isMicActive }),
      setElapsedSeconds: (elapsedSeconds) => set({ elapsedSeconds }),
      incrementElapsed: () => set((s) => ({ elapsedSeconds: s.elapsedSeconds + 1 })),

      setAudioLevel: (audioLevel) => set({ audioLevel }),
      setSessionKey: (sessionKey) => set({ sessionKey }),
      newSession: () => {
        const counter = get().sessionCounter + 1;
        const shortId = Date.now().toString(36).slice(-4);
        set({
          sessionKey: `agent:main:voice-${shortId}`,
          sessionCounter: counter,
          elapsedSeconds: 0,
          voiceState: 'idle',
          isMicActive: false,
          isConnected: false,
          error: null,
        });
      },

      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setError: (error) => set({ error }),

      updateSettings: (settings) => set(settings),

      reset: () =>
        set({
          isConnected: false,
          voiceState: 'idle',
          isMicActive: false,
          elapsedSeconds: 0,
          error: null,
        }),
    }),
    {
      name: 'aegis-voice-live',
      // Only persist settings, not transient state
      partialize: (state) => ({
        geminiApiKey: state.geminiApiKey,
        geminiModel: state.geminiModel,
        geminiVoice: state.geminiVoice,
        responseModel: state.responseModel,
        sessionCounter: state.sessionCounter,
      }),
    }
  )
);
