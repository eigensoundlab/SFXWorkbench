// SPDX-License-Identifier: Apache-2.0
/** Procedural one-shot synthesizer (sfxr-style): oscillator, pitch slide/jump/vibrato/repeat, envelope with punch, filters. Parameters: see src/config/generator.js. */
import { TAU, clamp, rng, matchPeak, dbToLin } from './core.js';
import { biquad } from './filters.js';

/* ---------- procedural generator ---------- */
export function blep(t, dt) { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; }
export function synthGen(p, sr) {
  const A = p.att / 1000, Hd = p.hold / 1000, Rl = p.rel / 1000, T = Math.max(0.005, A + Hd + Rl);
  const n = Math.round(T * sr), o = new Float32Array(n), R = rng(p.seed | 0);
  const rep = p.repeat > 0 ? Math.max(8, Math.round(p.repeat * sr / 1000)) : 0;
  const cf = p.curve === 'fast' ? u => 1 - Math.pow(1 - u, 3) : p.curve === 'late' ? u => u * u * u : u => u;
  const duty = clamp(p.duty / 100, 0.02, 0.5), nm = p.noise / 100;
  const useLp = Math.min(p.lp0, p.lp1) < 19000, hp = p.hp > 21 ? biquad('highpass', p.hp, 0.707, sr) : null;
  let ph = 0, mph = 0, sh = 0, shPh = 1, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, z1 = 0, z2 = 0, h1 = 0, h2 = 0, co = null;
  for (let i = 0; i < n; i++) {
    const t = i / sr, u = rep ? (i % rep) / rep : i / n;
    let f = p.f0 * Math.pow(p.f1 / p.f0, cf(u));
    if (p.stepAt > 0 && u >= p.stepAt / 100) f *= Math.pow(2, p.stepSt / 12);
    if (p.vibDepth > 0) f *= Math.pow(2, p.vibDepth / 12 * Math.sin(TAU * p.vibRate * t));
    f = clamp(f, 1, sr * 0.45);
    const dt = f / sr;
    ph += dt; ph -= Math.floor(ph);
    let s;
    switch (p.wave) {
      case 'sine': s = Math.sin(TAU * ph); break;
      case 'triangle': s = 4 * Math.abs(ph - 0.5) - 1; break;
      case 'square': s = (ph < duty ? 1 : -1) + blep(ph, dt) - blep((ph + 1 - duty) % 1, dt); break;
      case 'saw': s = 2 * ph - 1 - blep(ph, dt); break;
      case 'fm': mph += f * p.fmRatio / sr; mph -= Math.floor(mph); s = Math.sin(TAU * ph + p.fmIndex * Math.sin(TAU * mph)); break;
      case 'sh': shPh += Math.min(1, dt * 32); if (shPh >= 1) { shPh -= 1; sh = R() * 2 - 1; } s = sh; break;
      case 'pink': {
        const wn = R() * 2 - 1;
        b0 = 0.99886 * b0 + wn * 0.0555179; b1 = 0.99332 * b1 + wn * 0.0750759; b2 = 0.969 * b2 + wn * 0.153852;
        b3 = 0.8665 * b3 + wn * 0.3104856; b4 = 0.55 * b4 + wn * 0.5329522; b5 = -0.7616 * b5 - wn * 0.016898;
        s = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + wn * 0.5362) * 0.11; b6 = wn * 0.115926; break;
      }
      default: s = R() * 2 - 1;
    }
    if (nm > 0) s = s * (1 - nm) + (R() * 2 - 1) * nm;
    let e;
    if (t < A) e = t / A;
    else if (t < A + Hd) e = 1 + (p.punch / 100) * (1 - (t - A) / Math.max(Hd, 1e-4));
    else e = Math.pow(Math.max(0, 1 - (t - A - Hd) / Math.max(Rl, 1e-4)), p.shape);
    let y = s * e;
    if (useLp) {
      if ((i & 15) === 0) co = biquad('lowpass', p.lp0 * Math.pow(p.lp1 / p.lp0, i / n), p.res, sr);
      const x = y; y = co[0] * x + z1; z1 = co[1] * x - co[3] * y + z2; z2 = co[2] * x - co[4] * y;
    }
    if (hp) { const x = y, yy = hp[0] * x + h1; h1 = hp[1] * x - hp[3] * yy + h2; h2 = hp[2] * x - hp[4] * yy; y = yy; }
    o[i] = y;
  }
  const fo = Math.min(n, Math.round(0.002 * sr)); for (let i = 0; i < fo; i++) o[n - 1 - i] *= i / fo;
  return matchPeak([o], dbToLin(-1));
}
