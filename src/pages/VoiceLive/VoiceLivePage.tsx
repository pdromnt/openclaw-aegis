// ═══════════════════════════════════════════════════════════
// VoiceLivePage — Orchestrator for Voice Chat
//
// Wires together:
//   - GeminiLiveService (WebSocket to Gemini Live)
//   - AudioCapture (mic → PCM16 @ 16kHz)
//   - AudioPlayback (PCM @ 24kHz → speaker)
//   - VoiceGate (Silero VAD — filters non-speech)
//   - GatewayBridge (send message to OpenClaw Gateway)
//   - VoicePanel (UI)
//   - VoiceSettings (config panel)
//
// Mic behavior (walkie-talkie style):
//   listening  → mic OPEN  (user speaks freely)
//   thinking   → mic MUTED (Gateway processing — automatic)
//   speaking   → mic MUTED (Gemini speaks — user can press mic to interrupt)
//   idle       → mic OFF   (not connected)
//
// Audio generation counter:
//   Every interruption bumps audioGeneration. onAudioChunk
//   compares the generation — if it changed, the chunk is
//   from a stale response and gets dropped silently.
//
// Flow:
//   1. User clicks mic → connect to Gemini Live + start mic
//   2. User speaks → audio chunks sent via VoiceGate → Gemini
//   3. Gemini detects speech end → toolCall(ask_aegis, message)
//   4. Mic auto-mutes → Gateway processes → returns text
//   5. sendToolResponse(text) → audioGeneration set → Gemini generates audio
//   6. Audio plays through speaker — user can press mic to interrupt
//   7. turnComplete → mic auto-unmutes → back to listening
// ═══════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useVoiceLiveStore } from '../../stores/voiceLiveStore';
import { gateway } from '../../services/gateway/index';
import { GeminiLiveService } from '../../services/voiceLive/GeminiLiveService';
import { AudioCapture } from '../../services/voiceLive/AudioCapture';
import { AudioPlayback } from '../../services/voiceLive/AudioPlayback';
import { VoiceGate } from '../../services/voiceLive/VoiceGate';
import { VoicePanel } from './VoicePanel';
import { VoiceSettings } from './VoiceSettings';

export function VoiceLivePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // ── Selectors — only re-render when these specific values change ──
  const voiceState = useVoiceLiveStore((s) => s.voiceState);
  const isMicActive = useVoiceLiveStore((s) => s.isMicActive);
  const isConnected = useVoiceLiveStore((s) => s.isConnected);
  const elapsedSeconds = useVoiceLiveStore((s) => s.elapsedSeconds);
  const sessionKey = useVoiceLiveStore((s) => s.sessionKey);
  const responseModel = useVoiceLiveStore((s) => s.responseModel);
  const error = useVoiceLiveStore((s) => s.error);
  const settingsOpen = useVoiceLiveStore((s) => s.settingsOpen);

  // ── Service refs (persist across renders) ──
  const geminiRef = useRef(new GeminiLiveService());
  const captureRef = useRef(new AudioCapture());
  const playbackRef = useRef(new AudioPlayback());
  const gateRef = useRef(new VoiceGate());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Audio generation counter ──
  // Bumped on every interruption/new response. onAudioChunk
  // drops chunks whose generation doesn't match.
  const audioGenerationRef = useRef(0);
  const activeGenerationRef = useRef(0);

  // ── Audio level metering loop ──
  const meterFrameRef = useRef<number>(0);
  const meterDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  useEffect(() => {
    function meterLoop() {
      const capture = captureRef.current;
      const playback = playbackRef.current;
      const state = useVoiceLiveStore.getState();

      // Pick the active analyser based on voice state
      const analyser =
        state.voiceState === 'speaking'
          ? playback.analyser
          : capture.analyser;

      if (analyser) {
        if (!meterDataRef.current || meterDataRef.current.length !== analyser.frequencyBinCount) {
          meterDataRef.current = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(meterDataRef.current);

        // RMS of frequency bins → 0-1
        let sum = 0;
        for (let i = 0; i < meterDataRef.current.length; i++) {
          const v = meterDataRef.current[i] / 255;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / meterDataRef.current.length);
        const level = Math.min(rms * 2.5, 1); // Scale up for visual impact

        // Only update store if changed significantly (avoid unnecessary renders)
        if (Math.abs(state.audioLevel - level) > 0.01) {
          state.setAudioLevel(level);
        }
      } else if (state.audioLevel > 0.01) {
        state.setAudioLevel(0);
      }

      meterFrameRef.current = requestAnimationFrame(meterLoop);
    }

    meterFrameRef.current = requestAnimationFrame(meterLoop);
    return () => cancelAnimationFrame(meterFrameRef.current);
  }, []);

  // ── Timer ──
  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    useVoiceLiveStore.getState().setElapsedSeconds(0);
    timerRef.current = setInterval(() => {
      useVoiceLiveStore.getState().incrementElapsed();
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ── Helper: mute mic + update store ──
  const muteMic = useCallback(() => {
    captureRef.current.mute();
    useVoiceLiveStore.getState().setMicActive(false);
  }, []);

  // ── Helper: unmute mic + update store ──
  const unmuteMic = useCallback(() => {
    captureRef.current.unmute();
    useVoiceLiveStore.getState().setMicActive(true);
  }, []);

  // ── Connect to Gemini Live and start mic ──
  const startVoice = useCallback(async () => {
    const {
      geminiApiKey,
      geminiModel,
      geminiVoice,
      responseModel: respModel,
      sessionKey: sk,
    } = useVoiceLiveStore.getState();

    if (!geminiApiKey) {
      useVoiceLiveStore.getState().setError(t('voiceLive.noApiKey'));
      return;
    }

    useVoiceLiveStore.getState().setError(null);
    useVoiceLiveStore.getState().setVoiceState('idle');

    try {
      // Set model override on the voice session before sending messages
      if (respModel) {
        await gateway.call('sessions.patch', {
          key: sk,
          model: respModel,
        }).catch(() => {}); // Non-fatal if session doesn't exist yet
      }

      // Connect to Gemini Live WebSocket
      await geminiRef.current.connect({
        apiKey: geminiApiKey,
        model: geminiModel,
        voice: geminiVoice || undefined,
        systemPrompt: 'You are a voice relay. Call ask_aegis immediately for every user message. Do not think. Do not answer directly. After getting the result, read it exactly as-is. Automatically detect the language the user speaks and respond in the same language.',

        onToolCall: async (message: string) => {
          // ──────────────────────────────────────────────────
          // Gemini detected speech end → now processing
          // Mute mic and KEEP IT MUTED until turnComplete
          // ──────────────────────────────────────────────────
          muteMic();
          useVoiceLiveStore.getState().setVoiceState('thinking');

          try {
            const { sessionKey: currentSk } = useVoiceLiveStore.getState();

            // Send to Gateway and wait for response
            const responseText = await sendToGateway(message, currentSk);

            // Send the response back to Gemini to read aloud
            const sent = geminiRef.current.sendToolResponse(responseText);
            if (!sent) {
              // Tool call was cancelled — go back to listening
              unmuteMic();
              useVoiceLiveStore.getState().setVoiceState('listening');
              return;
            }

            // ─── Mark this as the active generation ───
            // Only audio chunks matching this generation will play.
            activeGenerationRef.current = audioGenerationRef.current;

            // Mic stays muted while Gemini speaks.
            // It will auto-unmute on turnComplete,
            // or the user can manually press the mic button to interrupt.
            useVoiceLiveStore.getState().setVoiceState('speaking');

          } catch (err) {
            console.error('[VoiceLive] Gateway error:', err);
            geminiRef.current.sendToolResponse(
              'عذراً، حدث خطأ في المعالجة. حاول مرة أخرى.'
            );
            // On error: unmute so user can try again
            unmuteMic();
            useVoiceLiveStore.getState().setVoiceState('listening');
          }
        },

        onAudioChunk: (pcm24k: ArrayBuffer) => {
          // ──────────────────────────────────────────────────
          // Drop stale audio chunks from a previous response.
          // After an interruption, audioGeneration is bumped
          // but activeGeneration stays at the old value until
          // the next sendToolResponse sets it.
          // ──────────────────────────────────────────────────
          if (audioGenerationRef.current !== activeGenerationRef.current) {
            // Stale chunk from old response — drop silently
            return;
          }

          useVoiceLiveStore.getState().setVoiceState('speaking');
          playbackRef.current.enqueue(pcm24k);
        },

        onStateChange: (state) => {
          useVoiceLiveStore.getState().setVoiceState(state);

          // ──────────────────────────────────────────────────
          // turnComplete → Gemini finished speaking
          // NOW we auto-unmute the mic for the next turn
          // ──────────────────────────────────────────────────
          if (state === 'listening') {
            unmuteMic();
          }
        },

        onError: (error: Error) => {
          console.error('[VoiceLive] Gemini error:', error);
          useVoiceLiveStore.getState().setError(error.message);
        },

        onClose: () => {
          useVoiceLiveStore.getState().setConnected(false);
          useVoiceLiveStore.getState().setVoiceState('idle');
          useVoiceLiveStore.getState().setMicActive(false);
          stopTimer();
        },
      });

      useVoiceLiveStore.getState().setConnected(true);

      // Initialize VAD (non-blocking — falls back to passthrough if it fails)
      gateRef.current.reset();
      await gateRef.current.init().catch((err) => {
        console.warn('[VoiceLive] VAD init failed — running without VAD:', err);
      });

      // Wire pipeline: AudioCapture → VoiceGate → Gemini
      gateRef.current.onSpeechChunk = (pcm: ArrayBuffer) => {
        geminiRef.current.sendAudio(pcm);
      };
      captureRef.current.onChunk = (pcm16k: ArrayBuffer) => {
        gateRef.current.feed(pcm16k);
      };

      // Start mic capture
      try {
        await captureRef.current.start();
      } catch (micErr) {
        // Mic failed — tear down Gemini too
        geminiRef.current.disconnect();
        useVoiceLiveStore.getState().setConnected(false);
        useVoiceLiveStore.getState().setError(
          micErr instanceof Error ? micErr.message : 'Microphone access denied'
        );
        return;
      }

      useVoiceLiveStore.getState().setMicActive(true);
      useVoiceLiveStore.getState().setVoiceState('listening');
      startTimer();

    } catch (err) {
      console.error('[VoiceLive] Start failed:', err);
      useVoiceLiveStore.getState().setError(
        err instanceof Error ? err.message : t('voiceLive.connectionError')
      );
      useVoiceLiveStore.getState().setMicActive(false);
      useVoiceLiveStore.getState().setConnected(false);
    }
  }, [t, startTimer, stopTimer, muteMic, unmuteMic]);

  // ── Stop everything ──
  const stopVoice = useCallback(() => {
    // Bump generation so any in-flight chunks get dropped
    audioGenerationRef.current++;

    captureRef.current.stop();
    playbackRef.current.stop();
    geminiRef.current.disconnect();
    gateRef.current.reset();
    stopTimer();
    useVoiceLiveStore.getState().setMicActive(false);
    useVoiceLiveStore.getState().setConnected(false);
    useVoiceLiveStore.getState().setVoiceState('idle');
  }, [stopTimer]);

  // ── Toggle mic (main button) ──
  const handleToggleMic = useCallback(() => {
    const { isMicActive: micActive, isConnected: connected, voiceState: state } =
      useVoiceLiveStore.getState();

    if (!connected) {
      // Not connected → first press → connect and start
      startVoice();
      return;
    }

    // ──────────────────────────────────────────────────
    // Manual interrupt: user presses mic while Gemini speaks
    // 1. Bump generation → stale chunks get dropped
    // 2. Stop playback → kill all scheduled audio sources
    // 3. Unmute mic → user can speak
    // ──────────────────────────────────────────────────
    if (state === 'speaking' && !micActive) {
      audioGenerationRef.current++;
      playbackRef.current.stop();
      unmuteMic();
      useVoiceLiveStore.getState().setVoiceState('listening');
      return;
    }

    // Normal toggle: mute/unmute
    if (micActive) {
      muteMic();
      useVoiceLiveStore.getState().setVoiceState('idle');
    } else {
      unmuteMic();
      useVoiceLiveStore.getState().setVoiceState('listening');
    }
  }, [startVoice, muteMic, unmuteMic]);

  // ── New session ──
  const handleNewSession = useCallback(() => {
    stopVoice();
    useVoiceLiveStore.getState().newSession();
  }, [stopVoice]);

  // ── Close ──
  const handleClose = useCallback(() => {
    stopVoice();
    useVoiceLiveStore.getState().reset();
  }, [stopVoice]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      audioGenerationRef.current++;
      captureRef.current.stop();
      playbackRef.current.destroy();
      geminiRef.current.disconnect();
      gateRef.current.destroy();
      stopTimer();
    };
  }, [stopTimer]);

  // ── Get model display name ──
  const modelName = responseModel
    ? responseModel.split('/').pop() || responseModel
    : '';

  return (
    <div className="voice-live-page">
      {/* Back to chat button */}
      <button
        className="voice-back-btn"
        onClick={() => navigate('/chat')}
        title={t('voiceLive.backToChat', 'Back to Chat')}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Window controls — visible since VoiceLive covers the TitleBar */}
      <div className="voice-window-controls">
        <button onClick={() => window.aegis?.window.minimize()} title="Minimize">─</button>
        <button onClick={() => window.aegis?.window.maximize()} title="Maximize">□</button>
        <button onClick={() => window.aegis?.window.close()} className="voice-window-close" title="Close">✕</button>
      </div>

      <VoicePanel
        voiceState={voiceState}
        isMicActive={isMicActive}
        isConnected={isConnected}
        elapsedSeconds={elapsedSeconds}
        modelName={modelName}
        error={error}
        onToggleMic={handleToggleMic}
        onNewSession={handleNewSession}
        onClose={handleClose}
        onOpenSettings={() => useVoiceLiveStore.getState().setSettingsOpen(true)}
      />

      {settingsOpen && (
        <VoiceSettings onClose={() => useVoiceLiveStore.getState().setSettingsOpen(false)} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Gateway Bridge — send message and collect response
// ═══════════════════════════════════════════════════════════

async function sendToGateway(message: string, sessionKey: string): Promise<string> {
  return gateway.sendMessageAndWait(message, sessionKey, 60000);
}
