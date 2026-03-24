// ═══════════════════════════════════════════════════════════
// NebulaCoreVisualizer — Canvas-based nebula particle effect
//
// 350 particles orbiting a warm golden core. Responds to
// voice state (idle/listening/thinking/speaking) with speed,
// brightness, and particle size changes.
// ═══════════════════════════════════════════════════════════

import { useEffect, useRef } from 'react';
import type { VoiceState } from '../../services/voiceLive/types';
import { useVoiceLiveStore } from '../../stores/voiceLiveStore';

interface Props {
  state: VoiceState;
  size?: number;
  className?: string;
}

interface Particle {
  angle: number;
  r: number;
  orbitSpeed: number;
  sz: number;
  phase: number;
  phaseSpeed: number;
  hue: number;
  sat: number;
  drift: number;
  layer: number;
  trail: { x: number; y: number; a: number }[];
  life: number;
  decay: number;
  x: number;
  y: number;
}

const PRESETS: Record<VoiceState, {
  partSpeed: number; coreGlow: number; partBright: number;
  partSize: number; trailLen: number; spawnR: number; colorShift: number;
}> = {
  idle:      { partSpeed: 1,   coreGlow: .3,  partBright: .25, partSize: 1,   trailLen: 3, spawnR: .42, colorShift: 0 },
  listening: { partSpeed: 3,   coreGlow: .7,  partBright: .6,  partSize: 1.8, trailLen: 6, spawnR: .46, colorShift: 10 },
  thinking:  { partSpeed: 2,   coreGlow: .5,  partBright: .4,  partSize: 1.3, trailLen: 5, spawnR: .44, colorShift: 5 },
  speaking:  { partSpeed: 5,   coreGlow: .95, partBright: .8,  partSize: 2.5, trailLen: 8, spawnR: .48, colorShift: 20 },
};

function lerp(a: number, b: number, f: number) { return a + (b - a) * f; }

export function NebulaCoreVisualizer({ state, size = 220, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const tRef = useRef(0);
  const cmRef = useRef({ ...PRESETS.idle });
  const stateRef = useRef<VoiceState>(state);
  const audioLevelRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const starsRef = useRef<{ x: number; y: number; s: number; b: number; sp: number }[]>([]);

  // Keep refs in sync without restarting the animation
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
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2, cy = size / 2, mD = size;

    // Init stars
    if (starsRef.current.length === 0) {
      for (let i = 0; i < 60; i++) {
        starsRef.current.push({
          x: Math.random(), y: Math.random(),
          s: .3 + Math.random() * 1, b: Math.random() * Math.PI * 2,
          sp: .002 + Math.random() * .006
        });
      }
    }

    // Init particles (sorted once by layer for depth ordering)
    if (particlesRef.current.length === 0) {
      for (let i = 0; i < 350; i++) {
        particlesRef.current.push(makeParticle(mD, true));
      }
      particlesRef.current.sort((a, b) => a.layer - b.layer);
    }

    function makeParticle(mD: number, init: boolean): Particle {
      return {
        angle: Math.random() * Math.PI * 2,
        r: mD * (.04 + Math.random() * .4),
        orbitSpeed: (.05 + Math.random() * .5) * (Math.random() > .5 ? 1 : -1),
        sz: 1 + Math.random() * 3.5,
        phase: Math.random() * Math.PI * 2,
        phaseSpeed: .01 + Math.random() * .03,
        hue: 20 + Math.random() * 35,
        sat: 55 + Math.random() * 25,
        drift: (Math.random() - .5) * .0008,
        layer: Math.random(),
        trail: [],
        life: init ? Math.random() : 1,
        decay: .0005 + Math.random() * .001,
        x: 0, y: 0,
      };
    }

    function draw() {
      const cm = cmRef.current;
      const target = PRESETS[stateRef.current];

      // Smooth lerp
      const ls = .035;
      for (const k of Object.keys(target) as (keyof typeof target)[]) {
        (cm as any)[k] = lerp((cm as any)[k], target[k], ls);
      }

      ctx.clearRect(0, 0, size, size);
      tRef.current += .006 * (1 + cm.coreGlow * .3);

      // Stars
      for (const s of starsRef.current) {
        s.b += s.sp;
        const a = (.1 + .9 * Math.abs(Math.sin(s.b))) * .2;
        ctx.beginPath(); ctx.arc(s.x * size, s.y * size, s.s, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180,190,210,${a})`; ctx.fill();
      }

      // Particles (already sorted by layer at init)
      const parts = particlesRef.current;

      const aLvl = audioLevelRef.current;

      for (const p of parts) {
        p.angle += p.orbitSpeed * .004 * cm.partSpeed * (1 + aLvl * 3);
        p.r += p.drift * mD;
        p.phase += p.phaseSpeed;
        p.life -= p.decay;

        if (p.r < mD * .015 || p.r > mD * cm.spawnR || p.life <= 0) {
          Object.assign(p, makeParticle(mD, false));
          continue;
        }

        const px = cx + Math.cos(p.angle) * p.r;
        const py = cy + Math.sin(p.angle) * p.r;
        p.x = px; p.y = py;

        const bright = (.05 + .95 * Math.pow(Math.abs(Math.sin(p.phase)), 2.5)) * cm.partBright * (1 + aLvl * 1.5);
        const sz = p.sz * cm.partSize * (1 + aLvl * .8);
        const h = p.hue + cm.colorShift * bright;

        // Glow halo
        ctx.beginPath(); ctx.arc(px, py, sz * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${h},${p.sat}%,50%,${bright * .04 * p.life})`; ctx.fill();

        // Main particle
        ctx.beginPath(); ctx.arc(px, py, sz, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${h},${p.sat}%,60%,${bright * .4 * p.life})`; ctx.fill();

        // Bright center
        ctx.beginPath(); ctx.arc(px, py, sz * .35, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${h},${p.sat - 10}%,80%,${bright * .55 * p.life})`; ctx.fill();
      }

      // Core
      const coreR = mD * .04;
      const glow = cm.coreGlow;

      // Ambient
      const g3 = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 6);
      g3.addColorStop(0, `rgba(255,220,80,${.02 * glow})`);
      g3.addColorStop(1, 'rgba(150,100,20,0)');
      ctx.beginPath(); ctx.arc(cx, cy, coreR * 6, 0, Math.PI * 2); ctx.fillStyle = g3; ctx.fill();

      // Halo
      const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3);
      g2.addColorStop(0, `rgba(255,235,130,${.1 * glow})`);
      g2.addColorStop(.5, `rgba(240,190,50,${.04 * glow})`);
      g2.addColorStop(1, 'rgba(200,150,30,0)');
      ctx.beginPath(); ctx.arc(cx, cy, coreR * 3, 0, Math.PI * 2); ctx.fillStyle = g2; ctx.fill();

      // Core body
      const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      g1.addColorStop(0, `rgba(255,255,245,${.6 * glow})`);
      g1.addColorStop(.3, `rgba(255,245,200,${.4 * glow})`);
      g1.addColorStop(.7, `rgba(255,220,80,${.15 * glow})`);
      g1.addColorStop(1, 'rgba(230,180,30,0)');
      ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2); ctx.fillStyle = g1; ctx.fill();

      // White center
      const g0 = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * .2);
      g0.addColorStop(0, `rgba(255,255,255,${glow * .5})`);
      g0.addColorStop(1, 'rgba(255,250,220,0)');
      ctx.beginPath(); ctx.arc(cx, cy, coreR * .2, 0, Math.PI * 2); ctx.fillStyle = g0; ctx.fill();

      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size, borderRadius: '50%' }}
    />
  );
}
