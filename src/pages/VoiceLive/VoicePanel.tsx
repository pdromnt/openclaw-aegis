// ═══════════════════════════════════════════════════════════
// VoicePanel — Main voice chat UI
//
// Renders the Aura visualizer, status indicator, mic button,
// and control buttons. All text via i18n.
//
// Mic button has 3 visual states:
//   1. OFF      — not connected (gray, MicOff icon)
//   2. ACTIVE   — listening (teal glow, Mic icon, pulsing ring)
//   3. MUTED    — connected but muted during speaking/thinking
//                  (dimmed, MicOff icon, "press to interrupt" hint)
// ═══════════════════════════════════════════════════════════

import { useTranslation } from 'react-i18next';
import {
  Mic,
  MicOff,
  Plus,
  X,
  Settings,
  PhoneOff,
} from 'lucide-react';
import { AuraVisualizer } from '../../components/VoiceLive/AuraVisualizer';
import { NebulaCoreVisualizer } from '../../components/VoiceLive/NebulaCoreVisualizer';
import { RaphaelVisualizer } from '../../components/VoiceLive/RaphaelVisualizer';
import { useSettingsStore } from '../../stores/settingsStore';
import type { VoiceState } from '../../services/voiceLive/types';

interface VoicePanelProps {
  /** Current voice state */
  voiceState: VoiceState;
  /** Whether the mic is actively sending audio */
  isMicActive: boolean;
  /** Whether connected to Gemini */
  isConnected: boolean;
  /** Elapsed seconds since session started */
  elapsedSeconds: number;
  /** Display name of the response model */
  modelName: string;
  /** Error message (if any) */
  error: string | null;

  // ── Callbacks ──
  onToggleMic: () => void;
  onNewSession: () => void;
  onClose: () => void;
  onOpenSettings: () => void;
}

/** Format seconds as MM:SS */
function formatTimer(seconds: number): string {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/** Determine mic button visual state */
function getMicState(
  voiceState: VoiceState,
  isMicActive: boolean,
  isConnected: boolean
): 'off' | 'active' | 'muted' {
  if (!isConnected) return 'off';
  if (isMicActive) return 'active';
  return 'muted';
}

export function VoicePanel({
  voiceState,
  isMicActive,
  isConnected,
  elapsedSeconds,
  modelName,
  error,
  onToggleMic,
  onNewSession,
  onClose,
  onOpenSettings,
}: VoicePanelProps) {
  const { t } = useTranslation();
  const visualizerStyle = useSettingsStore((s) => s.voiceVisualizerStyle);

  const micState = getMicState(voiceState, isMicActive, isConnected);

  // Status text based on voice state — no hardcoded fallbacks
  const statusText = (() => {
    if (!isConnected) return t('voiceLive.tapToStart');
    if (voiceState === 'listening') return t('voiceLive.listening');
    if (voiceState === 'thinking') return t('voiceLive.thinking');
    if (voiceState === 'speaking') return t('voiceLive.speaking');
    return t('voiceLive.idle');
  })();

  // Hint text under mic button — no hardcoded fallbacks
  const hintText = (() => {
    if (!isConnected) return t('voiceLive.hintStart');
    if (voiceState === 'speaking') return t('voiceLive.hintInterrupt');
    if (voiceState === 'thinking') return t('voiceLive.hintWait');
    if (isMicActive) return t('voiceLive.hintListening');
    return t('voiceLive.hintUnmute');
  })();

  return (
    <div className="voice-overlay">
      {/* ── Header ── */}
      <div className="voice-header">
        <div className="voice-title">
          <Mic size={16} />
          <span>{t('voiceLive.title')}</span>
          {modelName && (
            <span className="voice-model-badge">{modelName}</span>
          )}
        </div>
        <div className="voice-header-actions">
          <button
            className="voice-btn-ghost"
            onClick={onOpenSettings}
            title={t('voiceLive.settings')}
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* ── Visualizer (larger) ── */}
      <div className="voice-aura-container">
        {visualizerStyle === 'nebula' ? (
          <NebulaCoreVisualizer state={voiceState} size={380} />
        ) : visualizerStyle === 'raphael' ? (
          <RaphaelVisualizer state={voiceState} size={380} />
        ) : (
          <AuraVisualizer state={voiceState} size={380} />
        )}
      </div>

      {/* ── Status ── */}
      <div className={`voice-status voice-status-${voiceState}`}>
        <span className="voice-status-dot" />
        <span>{statusText}</span>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="voice-error">{error}</div>
      )}

      {/* ── Controls Row: New + Mic + Close — all inline ── */}
      <div className="voice-controls-row">
        <button className="voice-btn-new" onClick={onNewSession}>
          <Plus size={14} />
          <span>{t('voiceLive.newChat')}</span>
        </button>

        <div className="voice-mic-section">
          <button
            className={`voice-btn-mic voice-btn-mic-${micState}`}
            onClick={onToggleMic}
            title={
              micState === 'off'
                ? t('voiceLive.startMic')
                : micState === 'active'
                  ? t('voiceLive.stopMic')
                  : t('voiceLive.interrupt')
            }
          >
            {micState === 'active' ? (
              <Mic size={22} />
            ) : (
              <MicOff size={22} />
            )}
            {micState === 'active' && <span className="voice-mic-ring" />}
          </button>
        </div>

        <button className="voice-btn-end" onClick={onClose}>
          <PhoneOff size={14} />
          <span>{t('voiceLive.close')}</span>
        </button>
      </div>

      {/* ── Hint text ── */}
      <span className="voice-mic-hint">{hintText}</span>

      {/* ── Footer ── */}
      {isConnected && (
        <div className="voice-footer">
          <div className="voice-timer">{formatTimer(elapsedSeconds)}</div>
        </div>
      )}
    </div>
  );
}
