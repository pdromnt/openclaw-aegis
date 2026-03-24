// ═══════════════════════════════════════════════════════════
// useAuraAnimation — Maps VoiceState to shader uniforms
//
// Smoothly interpolates (lerps) between state presets so
// the Aura visualizer transitions gracefully between states.
// ═══════════════════════════════════════════════════════════

import { useRef } from 'react';
import type { VoiceState } from '../../services/voiceLive/types';
import type { ShaderUniform } from './ReactShaderToy';
import { useSettingsStore } from '../../stores/settingsStore';
import { useVoiceLiveStore } from '../../stores/voiceLiveStore';

/** Shader uniform preset for a given voice state */
interface AuraPreset {
  uSpeed: number;
  uScale: number;
  uFrequency: number;
  uAmplitude: number;
  uMix: number;
  uColor: number[];
}

/** Dark theme presets */
const DARK_PRESETS: Record<VoiceState, AuraPreset> = {
  idle: {
    uSpeed: 8,
    uScale: 0.2,
    uFrequency: 0.4,
    uAmplitude: 1.2,
    uMix: 0.7,
    uColor: [0.31, 0.79, 0.69], // teal
  },
  listening: {
    uSpeed: 20,
    uScale: 0.3,
    uFrequency: 0.7,
    uAmplitude: 1.0,
    uMix: 1.5,
    uColor: [0.31, 0.79, 0.69], // teal
  },
  thinking: {
    uSpeed: 30,
    uScale: 0.3,
    uFrequency: 1.0,
    uAmplitude: 0.5,
    uMix: 1.2,
    uColor: [0.42, 0.62, 1.0], // blue/accent
  },
  speaking: {
    uSpeed: 70,
    uScale: 0.3,
    uFrequency: 1.25,
    uAmplitude: 0.75,
    uMix: 1.8,
    uColor: [0.31, 0.79, 0.69], // teal
  },
};

/** Light theme presets (slightly desaturated) */
const LIGHT_PRESETS: Record<VoiceState, AuraPreset> = {
  idle: {
    uSpeed: 8,
    uScale: 0.2,
    uFrequency: 0.4,
    uAmplitude: 1.2,
    uMix: 0.5,
    uColor: [0.13, 0.51, 0.45],
  },
  listening: {
    uSpeed: 20,
    uScale: 0.3,
    uFrequency: 0.7,
    uAmplitude: 1.0,
    uMix: 1.2,
    uColor: [0.13, 0.51, 0.45],
  },
  thinking: {
    uSpeed: 30,
    uScale: 0.3,
    uFrequency: 1.0,
    uAmplitude: 0.5,
    uMix: 1.0,
    uColor: [0.2, 0.37, 0.75],
  },
  speaking: {
    uSpeed: 70,
    uScale: 0.3,
    uFrequency: 1.25,
    uAmplitude: 0.75,
    uMix: 1.5,
    uColor: [0.13, 0.51, 0.45],
  },
};

/** Static uniforms that don't change with state */
const STATIC_UNIFORMS: Record<string, ShaderUniform> = {
  uBlur: { type: '1f', value: 0.2 },
  uBloom: { type: '1f', value: 0.0 },
  uSpacing: { type: '1f', value: 0.5 },
  uColorShift: { type: '1f', value: 1.0 },
  uVariance: { type: '1f', value: 0.1 },
  uSmoothing: { type: '1f', value: 1.0 },
};

/** Lerp a single number */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Lerp an array of numbers */
function lerpArray(a: number[], b: number[], t: number): number[] {
  return a.map((v, i) => lerp(v, b[i], t));
}

/**
 * Hook that returns shader uniforms driven by voice state.
 * Uniforms smoothly transition over ~300ms when state changes.
 */
export function useAuraAnimation(state: VoiceState): Record<string, ShaderUniform> {
  const { theme } = useSettingsStore();
  const isDark = theme === 'aegis-dark';
  const audioLevel = useVoiceLiveStore((s) => s.audioLevel);

  // Track current interpolated values
  const currentRef = useRef<AuraPreset | null>(null);
  const lastStateRef = useRef<VoiceState>(state);
  const transitionStartRef = useRef<number>(0);

  const TRANSITION_MS = 300;

  // Get target preset for current state
  const presets = isDark ? DARK_PRESETS : LIGHT_PRESETS;
  const target = presets[state];

  // Initialize current if first render
  if (!currentRef.current) {
    currentRef.current = { ...target };
  }

  // Detect state change — start new transition
  if (state !== lastStateRef.current) {
    lastStateRef.current = state;
    transitionStartRef.current = Date.now();
  }

  // Calculate interpolation progress
  const elapsed = Date.now() - transitionStartRef.current;
  const t = transitionStartRef.current === 0 ? 1 : Math.min(elapsed / TRANSITION_MS, 1);

  // Ease out cubic
  const eased = 1 - Math.pow(1 - t, 3);

  // Interpolate
  const current = currentRef.current;
  const interpolated: AuraPreset = {
    uSpeed: lerp(current.uSpeed, target.uSpeed, eased),
    uScale: lerp(current.uScale, target.uScale, eased),
    uFrequency: lerp(current.uFrequency, target.uFrequency, eased),
    uAmplitude: lerp(current.uAmplitude, target.uAmplitude, eased),
    uMix: state === 'thinking'
      ? target.uMix + Math.sin(Date.now() / 350) * 1.0 // Pulsing for thinking
      : lerp(current.uMix, target.uMix, eased),
    uColor: lerpArray(current.uColor, target.uColor, eased),
  };

  // Update current ref for next frame
  if (t >= 1) {
    currentRef.current = { ...target };
  } else {
    currentRef.current = { ...interpolated };
  }

  // Apply real-time audio level to amplitude and mix for organic reactivity
  const audioBoost = audioLevel * 1.5;

  return {
    ...STATIC_UNIFORMS,
    uSpeed: { type: '1f' as const, value: interpolated.uSpeed * (1 + audioLevel * 2) },
    uScale: { type: '1f' as const, value: interpolated.uScale * (1 + audioLevel * .3) },
    uFrequency: { type: '1f' as const, value: interpolated.uFrequency * (1 + audioLevel * .5) },
    uAmplitude: { type: '1f' as const, value: interpolated.uAmplitude + audioBoost },
    uMix: { type: '1f' as const, value: interpolated.uMix + audioLevel * .8 },
    uColor: { type: '3fv' as const, value: interpolated.uColor },
  };
}
