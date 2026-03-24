// ═══════════════════════════════════════════════════════════
// RaphaelVisualizer — Golden magic circle with rune bands
//
// Inspired by Raphael from "That Time I Got Reincarnated
// as a Slime". Uses dual-layer rendering:
//   - Offscreen canvas: accumulates glow trails with fade
//   - Main canvas: composites offscreen + crisp foreground
// This gives smooth motion trails without background bleed.
// ═══════════════════════════════════════════════════════════

import { useEffect, useRef } from 'react';
import type { VoiceState } from '../../services/voiceLive/types';
import { useVoiceLiveStore } from '../../stores/voiceLiveStore';

interface Props {
  state: VoiceState;
  size?: number;
  className?: string;
}

const RUNES = 'ᚨᛚᛚ ᚹᚺᛟ ᛊᛖᛖᚲ ᚹᛁᛊᛞᛟᛗ ᛊᚺᚨᛚᛚ ᚠᛁᚾᛞ ᛏᚺᛖ ᛈᚨᛏᚺ';
const RUNES_ALT = '◈⟡✦⊕⊗⌇⎈ΛΞΓΙΣΔΦΨΩΠ∆∇∞≡⊙⊛⊜⊝◇◆❖✧';

const PRESETS: Record<VoiceState, {
  speed: number; coreGlow: number; rayAlpha: number;
  bandAlpha: number; whiteAlpha: number;
}> = {
  idle:      { speed: 0.5, coreGlow: .35, rayAlpha: .12, bandAlpha: .3,  whiteAlpha: .35 },
  listening: { speed: 1.2, coreGlow: .7,  rayAlpha: .3,  bandAlpha: .65, whiteAlpha: .55 },
  thinking:  { speed: 0.8, coreGlow: .5,  rayAlpha: .2,  bandAlpha: .45, whiteAlpha: .45 },
  speaking:  { speed: 2.0, coreGlow: .9,  rayAlpha: .4,  bandAlpha: .85, whiteAlpha: .65 },
};

function lerp(a: number, b: number, f: number) { return a + (b - a) * f; }

export function RaphaelVisualizer({ state, size = 220, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number>(0);
  const tRef = useRef(0);
  const cmRef = useRef({ ...PRESETS.idle });
  const stateRef = useRef<VoiceState>(state);
  const audioLevelRef = useRef(0);
  const lastFrameRef = useRef(performance.now());

  stateRef.current = state;

  // Subscribe to audioLevel changes outside React render cycle
  useEffect(() => {
    const unsub = useVoiceLiveStore.subscribe(
      (s) => { audioLevelRef.current = s.audioLevel; }
    );
    return unsub;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const pxSize = size * dpr;
    canvas.width = pxSize;
    canvas.height = pxSize;
    const ctx = canvas.getContext('2d', { alpha: true })!;
    ctx.scale(dpr, dpr);

    // Offscreen canvas for glow/trail accumulation
    const offscreen = document.createElement('canvas');
    offscreen.width = pxSize;
    offscreen.height = pxSize;
    const offCtx = offscreen.getContext('2d', { alpha: true })!;
    offCtx.scale(dpr, dpr);
    offscreenRef.current = offscreen;

    const cx = size / 2, cy = size / 2, mD = size;

    // Pre-compute stable ray seeds
    const RAY_COUNT = 120;
    const raySeeds: number[] = [];
    for (let i = 0; i < RAY_COUNT; i++) {
      raySeeds.push(Math.sin(i * 127.1 + i * i * .013) * .5 + .5);
    }

    function drawRuneBand(
      x: CanvasRenderingContext2D,
      r: number, bw: number, alpha: number, rotation: number, glyphs: string
    ) {
      // Border rings
      x.beginPath(); x.arc(cx, cy, r + bw * .55, 0, Math.PI * 2);
      x.strokeStyle = `rgba(240,160,20,${alpha * .3})`; x.lineWidth = 1; x.stroke();
      x.beginPath(); x.arc(cx, cy, r - bw * .55, 0, Math.PI * 2);
      x.strokeStyle = `rgba(240,160,20,${alpha * .25})`; x.lineWidth = .7; x.stroke();

      const fontSize = Math.max(bw * .7, 5);
      x.font = `bold ${fontSize}px serif`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      const charW = fontSize * .6;
      const count = Math.max(Math.floor((2 * Math.PI * r) / charW), 1);
      const t = tRef.current;

      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + rotation;
        const gx = cx + Math.cos(angle) * r;
        const gy = cy + Math.sin(angle) * r;
        const shimmer = .5 + .5 * Math.sin(angle * 3 + t * .04 + i * .5);
        const charAlpha = alpha * (.4 + .6 * shimmer);

        x.save();
        x.translate(gx, gy);
        x.rotate(angle + Math.PI / 2);
        x.shadowColor = `rgba(255,160,20,${charAlpha * .5})`;
        x.shadowBlur = 5 + shimmer * 6;
        x.fillStyle = `rgba(255,180,30,${charAlpha})`;
        x.fillText(glyphs[i % glyphs.length], 0, 0);
        x.shadowBlur = 0;
        x.restore();
      }
    }

    function draw(now: number) {
      // Delta time for frame-rate independent animation
      const dt = Math.min((now - lastFrameRef.current) / 16.667, 3); // normalized to 60fps
      lastFrameRef.current = now;

      const cm = cmRef.current;
      const target = PRESETS[stateRef.current];
      const ls = .035 * dt;

      for (const k of Object.keys(target) as (keyof typeof target)[]) {
        (cm as any)[k] = lerp((cm as any)[k], target[k], ls);
      }

      tRef.current += cm.speed * dt;
      const t = tRef.current;

      const coreR = mD * .045;
      const whiteR = mD * .22;
      const bandR1 = mD * .29;
      const bandW1 = mD * .04;
      const bandR2 = bandR1 * 1.18;
      const bandW2 = bandW1 * .7;

      // ── Layer 1: Offscreen — glow elements with fade trail ──
      // Fade previous frame (creates motion trail)
      offCtx.globalCompositeOperation = 'destination-in';
      offCtx.fillStyle = 'rgba(0,0,0,0.88)';
      offCtx.fillRect(0, 0, size, size);
      offCtx.globalCompositeOperation = 'source-over';

      // Core glow (on offscreen for trail effect)
      const glowR = coreR * (3 + Math.sin(t * .08) * .5);
      const gGlow = offCtx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      gGlow.addColorStop(0, `rgba(255,230,100,${.08 * cm.coreGlow})`);
      gGlow.addColorStop(.5, `rgba(240,190,50,${.03 * cm.coreGlow})`);
      gGlow.addColorStop(1, 'rgba(200,150,30,0)');
      offCtx.beginPath(); offCtx.arc(cx, cy, glowR, 0, Math.PI * 2);
      offCtx.fillStyle = gGlow; offCtx.fill();

      // Star rays on offscreen (creates nice glow trails as they rotate)
      const starLen = mD * .2 * (1 + cm.coreGlow * .3);
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4 + t * .02;
        const x1 = cx + Math.cos(angle) * coreR * .3;
        const y1 = cy + Math.sin(angle) * coreR * .3;
        const x2 = cx + Math.cos(angle) * starLen;
        const y2 = cy + Math.sin(angle) * starLen;
        const g = offCtx.createLinearGradient(x1, y1, x2, y2);
        const a = .1 * cm.coreGlow;
        g.addColorStop(0, `rgba(255,255,240,${a})`);
        g.addColorStop(.4, `rgba(255,235,150,${a * .4})`);
        g.addColorStop(1, 'rgba(255,220,100,0)');
        offCtx.beginPath(); offCtx.moveTo(x1, y1); offCtx.lineTo(x2, y2);
        offCtx.strokeStyle = g; offCtx.lineWidth = .7; offCtx.stroke();
      }

      // ── Layer 2: Main canvas — crisp foreground ──
      ctx.clearRect(0, 0, size, size);

      // Composite offscreen glow layer
      ctx.drawImage(offscreen, 0, 0, size, size);

      // Whisper rays — extend with real audio level
      const aLvl = audioLevelRef.current;
      for (let i = 0; i < RAY_COUNT; i++) {
        const bA = (i / RAY_COUNT) * Math.PI * 2;
        const angle = bA + t * .005;
        const seed = raySeeds[i];
        const baseLen = .15 + seed * .3 + aLvl * .55;
        const waveLen = baseLen + .1 * Math.sin(bA * 4 + t * .06);
        const startR = coreR * .3;
        const endR = Math.min(startR + (whiteR - startR) * waveLen, whiteR * .92);
        const x1 = cx + Math.cos(angle) * startR;
        const y1 = cy + Math.sin(angle) * startR;
        const x2 = cx + Math.cos(angle) * endR;
        const y2 = cy + Math.sin(angle) * endR;
        const a = cm.rayAlpha * (.3 + seed * .4);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(255,248,220,${a})`; ctx.lineWidth = .3; ctx.stroke();
      }

      // Rune bands (slow constant rotation)
      drawRuneBand(ctx, bandR1, bandW1, cm.bandAlpha, t * .02, RUNES);
      drawRuneBand(ctx, bandR2, bandW2, cm.bandAlpha * .5, -t * .015, RUNES_ALT);

      // White waveform circle — distortion driven by real audio level
      ctx.beginPath();
      const steps = 200;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const w = Math.sin(a * 6 + t * .08) * (1 + aLvl * 4) + Math.sin(a * 11 - t * .05) * (.5 + aLvl * 3);
        const wr = whiteR + w;
        const px = cx + Math.cos(a) * wr;
        const py = cy + Math.sin(a) * wr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(255,252,240,${cm.whiteAlpha})`;
      ctx.lineWidth = 2; ctx.stroke();

      // White circle soft glow
      ctx.beginPath(); ctx.arc(cx, cy, whiteR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,250,230,${.06 * cm.coreGlow})`;
      ctx.lineWidth = 5; ctx.stroke();

      // Core sphere
      const pr = coreR * (1 + Math.sin(t * .1) * .03);
      const glow = cm.coreGlow;

      const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, pr);
      g1.addColorStop(0, `rgba(255,255,245,${.6 * glow})`);
      g1.addColorStop(.25, `rgba(255,245,200,${.35 * glow})`);
      g1.addColorStop(.6, `rgba(255,220,80,${.1 * glow})`);
      g1.addColorStop(1, 'rgba(230,180,30,0)');
      ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2);
      ctx.fillStyle = g1; ctx.fill();

      // White-hot center
      const g0 = ctx.createRadialGradient(cx, cy, 0, cx, cy, pr * .2);
      g0.addColorStop(0, `rgba(255,255,255,${glow * .6})`);
      g0.addColorStop(1, 'rgba(255,250,220,0)');
      ctx.beginPath(); ctx.arc(cx, cy, pr * .2, 0, Math.PI * 2);
      ctx.fillStyle = g0; ctx.fill();

      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      offscreenRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
