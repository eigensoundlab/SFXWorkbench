// SPDX-License-Identifier: Apache-2.0
/**
 * Context-aware accents.
 *
 * 1. analyzeStructure() reads a sound's build: where it starts, where the attack peaks, where the body ends and the
 *    tail begins, where it ends, every transient inside it, and its pitch, brightness and noisiness.
 * 2. renderAccents() places accents at those structural points (start, attack, peak, each transient, tail, end, a
 *    position or a selection) and generates each accent from that context: tuned to the detected pitch, using a
 *    material that suits the sound's brightness, at a level that follows the local loudness, and for some kinds
 *    excited by the sound's own audio at that point (resonance, dispersion, slap, stutter, swell).
 *
 * Accent params (keys of an accent slot): see src/config/accents.js.
 */
import { TAU, clamp, rng, len, peak, dbToLin, linToDb, monoMix, mapChannels } from './core.js';
import { fft, hann } from './fft.js';
import { biquad, runBiquad } from './filters.js';
import { buildBody, resonateMono, disperseMono, impactGen, maxTau } from './physical.js';
import { textureGen } from './textures.js';
import { FX } from './effects.js';

/* ---------- analysis ---------- */

/** YIN pitch estimate (de Cheveigné and Kawahara, 2002) on x[start..], 40-2000 Hz. Returns { hz, clarity } or null. */
export function estimatePitch(x, start, sr) {
  const W = 2048, tmin = Math.max(2, Math.floor(sr / 2000)), tmax = Math.min(Math.floor(sr / 40), 1400);
  if (start + W + tmax >= x.length) start = Math.max(0, x.length - W - tmax - 1);
  if (start < 0 || x.length < W + tmax + 1) return null;
  const d = new Float64Array(tmax + 1);
  for (let tau = 1; tau <= tmax; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) { const v = x[start + i] - x[start + i + tau]; s += v * v; }
    d[tau] = s;
  }
  let run = 0, best = -1;
  const cm = new Float64Array(tmax + 1); cm[0] = 1;
  for (let tau = 1; tau <= tmax; tau++) { run += d[tau]; cm[tau] = run > 0 ? d[tau] * tau / run : 1; }
  for (let tau = tmin; tau < tmax; tau++) {
    if (cm[tau] < 0.15) { while (tau + 1 < tmax && cm[tau + 1] < cm[tau]) tau++; best = tau; break; }
  }
  if (best < 0) { let m = Infinity; for (let tau = tmin; tau < tmax; tau++) if (cm[tau] < m) { m = cm[tau]; best = tau; } }
  if (cm[best] > 0.35) return null;
  const a = cm[best - 1], b = cm[best], c = cm[best + 1] ?? b, den = a - 2 * b + c;
  const shift = den !== 0 ? clamp(0.5 * (a - c) / den, -1, 1) : 0;
  return { hz: sr / (best + shift), clarity: 1 - cm[best] };
}

/** Average magnitude spectrum over the audible part: spectral centroid (Hz) and flatness (0 tonal .. 1 noise-like). */
function spectralShape(x, a, b, sr) {
  const N = 2048, w = hann(N), re = new Float64Array(N), im = new Float64Array(N), B = N / 2, acc = new Float64Array(B);
  const span = Math.max(1, b - a), frames = Math.min(32, Math.max(1, Math.floor(span / (N / 2))));
  for (let f = 0; f < frames; f++) {
    const s = a + Math.floor(f * Math.max(0, span - N) / Math.max(1, frames - 1));
    for (let i = 0; i < N; i++) { const j = s + i; re[i] = j < x.length ? x[j] * w[i] : 0; im[i] = 0; }
    fft(re, im, false);
    for (let k = 0; k < B; k++) acc[k] += Math.hypot(re[k], im[k]);
  }
  let num = 0, den = 0, lg = 0, ar = 0, cnt = 0;
  const k0 = Math.max(1, Math.round(100 / sr * N)), k1 = Math.min(B - 1, Math.round(10000 / sr * N));
  for (let k = 1; k < B; k++) { num += acc[k] * k * sr / N; den += acc[k]; }
  for (let k = k0; k <= k1; k++) { lg += Math.log(acc[k] + 1e-12); ar += acc[k]; cnt++; }
  let pk = 0, pb = 0;
  const kLo = Math.max(1, Math.round(40 / sr * N)), kHi = Math.min(B - 2, Math.round(5000 / sr * N));
  for (let k = kLo; k <= kHi; k++) if (acc[k] > pk) { pk = acc[k]; pb = k; }
  const a0 = acc[pb - 1] || 0, a2 = acc[pb + 1] || 0, dd = a0 - 2 * pk + a2, sh = dd !== 0 ? clamp(0.5 * (a0 - a2) / dd, -0.5, 0.5) : 0;
  return { centroid: den > 0 ? num / den : 0, flatness: cnt && ar > 0 ? Math.exp(lg / cnt) / (ar / cnt) : 0, dominant: pb ? (pb + sh) * sr / N : 0 };
}

/**
 * Analyse the structure of a sound.
 * @returns {{ n:number, sr:number, hop:number, env:Float32Array, peak:number,
 *   onset:number, peakAt:number, bodyEnd:number, tailEnd:number,
 *   transients:{at:number, strength:number}[], pitch:number|null, clarity:number, centroid:number, flatness:number,
 *   dominant:number }}  pitch is set only for clearly periodic sounds; dominant is the strongest resonance (40 Hz-5 kHz).
 *   Times are sample positions. env is the RMS envelope in dB per hop (2.5 ms).
 */
export function analyzeStructure(chs, sr) {
  const x = monoMix(chs), n = x.length, hop = Math.max(1, Math.round(0.0025 * sr)), H = Math.ceil(n / hop);
  // RMS over a 10 ms window on 2.5 ms hops: long enough to ignore the waveform of low tones, short enough for attacks.
  const env = new Float32Array(H), W = 4 * hop, cs = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + x[i] * x[i];
  for (let h = 0; h < H; h++) {
    const a = Math.max(0, h * hop - (W >> 1)), b = Math.min(n, h * hop + (W >> 1));
    env[h] = 10 * Math.log10((cs[b] - cs[a]) / Math.max(1, b - a) + 1e-12);
  }
  let pk = -Infinity, ph = 0;
  for (let h = 0; h < H; h++) if (env[h] > pk) { pk = env[h]; ph = h; }
  let on = 0; while (on < ph && env[on] < pk - 40) on++;
  let be = ph; while (be < H - 1 && env[be] > pk - 12) be++;
  let te = H - 1; while (te > be && env[te] < pk - 50) te--;
  const transients = [];
  const minGap = Math.round(0.05 * sr / hop);
  for (let h = 1; h < H; h++) {
    let lo = Infinity; for (let k = Math.max(0, h - 8); k < h; k++) lo = Math.min(lo, env[k]);
    if (env[h] - lo > 9 && env[h] > pk - 40 && (!transients.length || h - transients[transients.length - 1].h > minGap)) {
      let s = h; while (s > 0 && env[s - 1] < env[s] - 1 && h - s < 8) s--;
      let top = env[h]; for (let k = h; k < Math.min(H, h + 6); k++) top = Math.max(top, env[k]);
      transients.push({ h: s, at: s * hop, strength: top - pk });
    }
  }
  if (!transients.length || transients[0].h > on + 4) transients.unshift({ h: on, at: on * hop, strength: 0 });
  const p = estimatePitch(x, Math.min(n - 1, ph * hop + Math.round(0.01 * sr)), sr);
  const sh = spectralShape(x, on * hop, Math.min(n, (te + 1) * hop), sr);
  return {
    n, sr, hop, env, peak: peak(chs), onset: on * hop, peakAt: ph * hop, bodyEnd: Math.min(n, be * hop), tailEnd: Math.min(n, (te + 1) * hop),
    transients: transients.map(t => ({ at: t.at, strength: t.strength })),
    pitch: trustPitch(p, sh.dominant), clarity: p ? p.clarity : 0, centroid: sh.centroid, flatness: sh.flatness, dominant: sh.dominant,
  };
}

/**
 * Keep a YIN pitch only if it is clearly periodic and the strongest resonance sits on one of its first six harmonics.
 * Inharmonic sounds (metal, bells) can fool YIN into a low "pitch" that no partial supports.
 */
function trustPitch(p, dominant) {
  if (!p || p.clarity < 0.8) return null;
  if (!dominant) return p.hz;
  const r = dominant / p.hz, k = Math.round(r);
  return k >= 1 && k <= 6 && Math.abs(r - k) < 0.06 * k ? p.hz : null;
}

/** Linear peak level of a sound around sample t (+-10 ms). */
function localLevel(x, t, sr) {
  const r = Math.round(0.01 * sr); let m = 0;
  for (let i = Math.max(0, t - r); i < Math.min(x.length, t + r); i++) m = Math.max(m, Math.abs(x[i]));
  return m;
}

/** A material that suits the sound: bright and tonal -> glass, bright and noisy -> steel, and so on down to stone. */
export function autoMaterial(a) {
  const noisy = a.flatness > 0.3;
  if (a.centroid > 3500) return noisy ? 'steel' : 'glass';
  if (a.centroid > 1800) return noisy ? 'aluminium' : 'brass';
  if (a.centroid > 900) return noisy ? 'wood' : 'ceramic';
  return noisy ? 'stone' : 'wood';
}

/** The sound's "key" for tuning: its pitch, else its strongest resonance, else (noise) a quarter of its centroid. */
export function soundKey(a) {
  if (a.pitch) return a.pitch;
  if (a.flatness < 0.3 && a.dominant > 0) return a.dominant;
  return clamp(a.centroid / 4, 60, 4000);
}

/** Body size (lowest mode, Hz) for an accent. tune: match | octave (below) | fifth (above) | free. */
export function tunedSize(a, p, lo = 40, hi = 8000, key = soundKey(a)) {
  if (p.tune === 'free') return p.size;
  const base = key;
  const f = p.tune === 'octave' ? base / 2 : p.tune === 'fifth' ? base * 1.5 : base;
  return clamp(f, lo, hi);
}

/* ---------- accent kinds ---------- */

const IMPACT_BASE = { cause: 'hit', hard: 80, contact: 30, dur: 600, rough: 40, speed: 12, clicks: 8, accel: 60, material: 'steel', shape: 'plate',
  size: 500, modes: 12, ring: 1, pos: 25, irregular: 30, disp: 0, bounces: 0, gap: 140, restit: 55, roll: 0, debris: 0, debrisPitch: 4,
  spread: 600, debrisMat: 'same', rumble: 0, seed: 1 };

/** Copy `ms` of x starting at t (zero-padded), with a short fade-in and a fade-out over the last quarter. */
function windowAt(x, t, ms, sr) {
  const L = Math.max(16, Math.round(ms * sr / 1000)), w = new Float32Array(L), fi = Math.min(L >> 3, Math.round(0.001 * sr)), fo = L >> 2;
  for (let i = 0; i < L; i++) {
    const j = t + i; if (j < 0 || j >= x.length) continue;
    w[i] = x[j] * Math.min(1, (i + 1) / Math.max(1, fi)) * (i > L - fo ? (L - i) / fo : 1);
  }
  return w;
}
function normalize(x) { let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); if (m > 0) for (let i = 0; i < x.length; i++) x[i] /= m; return x; }
function trimEnd(x, thr = 3e-4) { let e = x.length; while (e > 16 && Math.abs(x[e - 1]) < thr) e--; return x.subarray(0, Math.min(x.length, e + 64)); }
const material = (a, p) => (p.material === 'auto' ? autoMaterial(a) : p.material);

/**
 * Each kind returns { x: Float32Array (mono, peak 1), align: 'after' | 'before' }.
 * 'after' starts at the anchor, 'before' ends at it (lead-ins).
 * ctx: { src (mono source), t (anchor sample), a (analysis), key (tuning key in Hz), sr, R, seed,
 *        ref (mono reference or null), rt (reference event sample, for 'ref' anchors) }.
 */
export const ACCENT_KINDS = {
  hit(p, c) {
    const x = impactGen({ ...IMPACT_BASE, material: material(c.a, p), shape: p.shape, size: tunedSize(c.a, p, 40, 8000, c.key), ring: p.ring, hard: p.hard, contact: 35, seed: c.seed }, c.sr)[0];
    return { x, align: 'after' };
  },
  ring(p, c) {
    const modes = buildBody({ material: material(c.a, p), shape: p.shape, size: tunedSize(c.a, p, 40, 8000, c.key), modes: 16, ring: p.ring, pos: 0.2 + 0.3 * c.R(), irregular: 0.3 }, c.sr, c.R);
    const exc = windowAt(c.src, c.t, p.win, c.sr);
    return { x: normalize(trimEnd(normalize(resonateMono(exc, modes, c.sr, Math.round(Math.min(4, 6 * maxTau(modes)) * c.sr))))), align: 'after' };
  },
  zap(p, c) {
    const exc = windowAt(c.src, c.t, p.win, c.sr), amt = p.disp / 100;
    return { x: normalize(trimEnd(normalize(disperseMono(exc, c.sr, amt, 80 + 420 * amt, 0.2, 30)))), align: 'after' };
  },
  sub(p, c) {
    const f = p.tune === 'free' ? clamp(p.size, 25, 160) : (() => { let v = c.key; while (v > 70) v /= 2; while (v < 35) v *= 2; return v; })();
    const L = Math.round((p.dur / 1000) * c.sr), x = new Float32Array(L);
    let ph = 0;
    for (let i = 0; i < L; i++) {
      const t = i / c.sr; ph += TAU * f * (1 + Math.exp(-t / 0.025)) / c.sr;
      x[i] = Math.sin(ph) * Math.min(1, i / (0.002 * c.sr)) * Math.exp(-3.5 * i / L);
    }
    return { x: normalize(x), align: 'after' };
  },
  swell(p, c) {
    const w = windowAt(c.src, c.t, p.win, c.sr);
    const wet = FX.reverb([w], c.sr, { size: 88, damp: 45, predelay: 0, mix: 100, tail: 2.5, width: 100 })[0];
    const full = trimEnd(wet), keep = Math.min(full.length, Math.round(p.dur / 1000 * c.sr));
    const r = full.slice(0, keep).reverse(), fi = Math.round(r.length * 0.3);
    for (let i = 0; i < fi; i++) r[i] *= Math.pow(i / fi, 2);
    return { x: normalize(r), align: 'before' };
  },
  whoosh(p, c) {
    const L = Math.round((p.dur / 1000) * c.sr), x = new Float32Array(L), top = clamp(c.a.centroid * 1.2 || 3000, 800, 9000);
    let z1 = 0, z2 = 0, k = null;
    for (let i = 0; i < L; i++) {
      const u = i / L;
      if ((i & 31) === 0) k = biquad('bandpass', 250 * Math.pow(top / 250, u), 1.3, c.sr);
      const v = c.R() * 2 - 1, y = k[0] * v + z1; z1 = k[1] * v - k[3] * y + z2; z2 = k[2] * v - k[4] * y;
      x[i] = y * Math.pow(u, 2.2) * Math.min(1, (L - i) / (0.012 * c.sr));
    }
    return { x: normalize(x), align: 'before' };
  },
  slap(p, c) {
    const w = windowAt(c.src, c.t, p.win, c.sr), gap = Math.round(p.gap / 1000 * c.sr), reps = Math.max(1, Math.round(p.repeats));
    const x = new Float32Array(w.length + gap * (reps - 1));
    for (let r = 0; r < reps; r++) {
      const lp = runBiquad(runBiquad(w, biquad('lowpass', p.tone / (1 + r * 0.6), 0.6, c.sr)), biquad('highpass', 120, 0.7, c.sr)), g = Math.pow(0.5, r);
      for (let i = 0; i < lp.length; i++) x[r * gap + i] += lp[i] * g;
    }
    return { x: normalize(x), align: 'after' };
  },
  stutter(p, c) {
    const w = windowAt(c.src, c.t, p.win, c.sr), gap = Math.max(w.length, Math.round(p.gap / 1000 * c.sr)), reps = Math.max(1, Math.round(p.repeats));
    const x = new Float32Array(gap * (reps - 1) + w.length);
    for (let r = 0; r < reps; r++) { const g = 1 - r * 0.6 / reps; for (let i = 0; i < w.length; i++) x[r * gap + i] += w[i] * g; }
    return { x: normalize(x), align: 'after' };
  },
  debris(p, c) {
    const pitch = clamp((c.a.centroid || 2000) * 0.9, 600, 7000);
    const x = textureGen({ kind: 'particles', dur: p.dur / 1000, fadeIn: 0, fadeOut: p.dur * 0.4, width: 0, seed: c.seed, density: 90, shape: 'burst', material: material(c.a, p), pitch, spread: 1.6 }, c.sr)[0];
    return { x: normalize(trimEnd(x)), align: 'after' };
  },
  shell(p, c) {
    const R = c.R;
    const x = impactGen({ ...IMPACT_BASE, material: 'brass', shape: 'shell', size: 2800 + 2200 * R(), modes: 10, hard: 95, contact: 30, bounces: 3 + Math.floor(R() * 4), gap: 100 + 70 * R(), restit: 50 + 10 * R(), roll: 30, seed: c.seed }, c.sr)[0];
    return { x, align: 'after' };
  },
  click(p, c) {
    const size = p.tune === 'free' ? p.size : clamp(tunedSize(c.a, p, 40, 8000, c.key) * 4, 1500, 7000);
    const x = impactGen({ ...IMPACT_BASE, material: material(c.a, p), shape: 'bar', size, modes: 8, ring: 0.06, hard: 100, contact: 70, seed: c.seed }, c.sr)[0];
    return { x, align: 'after' };
  },
  graft(p, c) {
    // The reference's own audio at its event (transplant); without a reference, the sound's own audio at the anchor.
    const from = c.ref || c.src, at = c.ref && c.rt != null ? c.rt : c.t;
    return { x: normalize(windowAt(from, at, p.win, c.sr)), align: 'after' };
  },
  sparks(p, c) {
    const x = textureGen({ kind: 'sparks', dur: p.dur / 1000, fadeIn: 0, fadeOut: p.dur * 0.5, width: 0, seed: c.seed, density: 350, shape: 'burst', pitch: 7000, spread: 2, hiss: 35 }, c.sr)[0];
    return { x: normalize(trimEnd(x)), align: 'after' };
  },
};

/**
 * Anchor positions of a slot: [{ t, db, rt }] with t the sample position in the sound, db an extra level (dB) and
 * rt the matching sample in the reference ('ref' anchor only).
 * anchor: start | attack | peak | each | tail | end | at (p.at % of length) | time (p.time seconds) |
 *         ref (the reference's secondary events, placed relative to this sound's peak; p.fit scales the timing).
 */
export function anchorPoints(a, p, refA = null) {
  const one = t => [{ t, db: 0, rt: null }];
  switch (p.anchor) {
    case 'start': return one(a.onset);
    case 'attack': case 'peak': return one(a.peakAt);
    case 'each': return a.transients.slice(0, 32).map(t => ({ t: t.at, db: 0, rt: null }));
    case 'tail': return one(a.bodyEnd);
    case 'end': return one(a.tailEnd);
    case 'at': return one(Math.round(clamp(p.at / 100, 0, 1) * a.n));
    case 'time': return one(Math.round(clamp(p.time || 0, 0, a.n / a.sr) * a.sr));
    case 'ref': {
      if (!refA) return [];
      const mainGap = Math.round(0.02 * refA.sr);
      const span = Math.max(1, refA.tailEnd - refA.peakAt), scale = p.fit ? Math.max(1, a.tailEnd - a.peakAt) / span : 1;
      return refA.transients
        .filter(ev => Math.abs(ev.at - refA.peakAt) > mainGap && Math.abs(ev.at - refA.onset) > mainGap)
        .slice(0, 32)
        .map(ev => ({ t: Math.round(a.peakAt + (ev.at - refA.peakAt) * scale), db: ev.strength, rt: ev.at }));
    }
    default: return one(a.onset);
  }
}
/** Sample positions of an anchor (without reference events). */
export const anchorTimes = (a, p) => anchorPoints(a, p).map(x => x.t);

/**
 * Mix accents into a sound.
 * @param {Float32Array[]} chs source channels
 * @param {object[]} slots accent params (with on: boolean)
 * @param {{ analysis?: object, reference?: Float32Array[], seed?: number, jitter?: boolean, safe?: boolean }} opts
 *   reference: a second sound at the same sample rate, for the 'ref' anchor and 'graft' kind (accent transfer).
 *   jitter: small random changes per render (offset, level, size) for variations. safe: keep the peak at or below -1 dBFS.
 * Slot refinements: duck (dB, lowers the sound under the accent), pan (-100..100; makes a mono result stereo),
 * chance (% probability that each accent appears), tune 'local' (match the pitch at the anchor).
 * @returns {{ ch: Float32Array[], lead: number, marks: { slot:number, start:number, len:number, anchor:number }[], analysis: object }}
 *   lead: samples of silence added in front when a lead-in accent starts before 0; marks use output positions.
 */
export function renderAccents(chs, sr, slots, opts = {}) {
  const a = opts.analysis || analyzeStructure(chs, sr), src = monoMix(chs), R = rng((opts.seed | 0) * 7919 + 3);
  const ref = opts.reference && len(opts.reference) ? monoMix(opts.reference) : null;
  const refA = ref ? analyzeStructure(opts.reference, sr) : null;
  const placed = [];
  slots.forEach((p, si) => {
    if (!p || !p.on || !ACCENT_KINDS[p.kind]) return;
    anchorPoints(a, p, refA).forEach((pt, k) => {
      if ((p.chance ?? 100) < 100 && R() * 100 >= p.chance) return;
      const jit = opts.jitter ? { off: (R() * 2 - 1) * 8, lvl: (R() * 2 - 1) * 1.5, size: 1 + (R() * 2 - 1) * 0.04 } : { off: 0, lvl: 0, size: 1 };
      const t0 = pt.t, t = Math.round(t0 + (p.offset + jit.off) / 1000 * sr), tc = Math.max(0, Math.min(src.length - 1, t0));
      let key = soundKey(a);
      if (p.tune === 'local') { const lp = estimatePitch(src, Math.min(src.length - 1, tc + Math.round(0.01 * sr)), sr); if (lp && lp.clarity > 0.8) key = lp.hz; }
      const q = { ...p, size: p.size * jit.size };
      const ctx = { src, t: tc, a, key, sr, R, ref, rt: pt.rt, seed: (p.seed | 0) + k * 31 + (opts.seed | 0) * 101 };
      const g = ACCENT_KINDS[p.kind](q, ctx);
      const isRef = p.anchor === 'ref';
      const base = p.follow && !isRef ? Math.max(localLevel(src, tc, sr), a.peak * 0.05) : a.peak;
      const amp = base * dbToLin(p.level + jit.lvl + pt.db);
      const start = g.align === 'before' ? t - g.x.length : t;
      placed.push({ slot: si, start, x: g.x, amp, anchor: t0, pan: clamp((p.pan || 0) / 100, -1, 1), duck: Math.min(0, p.duck || 0) });
    });
  });
  const lead = Math.max(0, ...placed.map(pl => -pl.start));
  const n0 = len(chs), total = Math.min(Math.max(n0 + lead, ...placed.map(pl => pl.start + lead + pl.x.length)), 60 * sr);
  const panned = placed.some(pl => pl.pan !== 0), nch = panned ? Math.max(2, chs.length) : chs.length;
  const out = mapChannels(chs, nch).map(c => { const o = new Float32Array(total); o.set(c.subarray(0, Math.min(c.length, total - lead)), lead); return o; });

  // Ducking: lower the sound (not the accents) while an accent sounds, with 5 ms attack and 80 ms release.
  if (placed.some(pl => pl.duck < 0)) {
    const g = new Float32Array(total).fill(1), att = Math.round(0.005 * sr), rel = Math.round(0.08 * sr);
    for (const pl of placed) {
      if (!(pl.duck < 0)) continue;
      const d = dbToLin(pl.duck), s0 = pl.start + lead, s1 = s0 + Math.min(pl.x.length, Math.round(0.3 * sr));
      for (let i = Math.max(0, s0 - att); i < Math.min(total, s1 + rel); i++) {
        const u = i < s0 ? (s0 - i) / att : i > s1 ? (i - s1) / rel : 0, v = d + (1 - d) * Math.min(1, u);
        if (v < g[i]) g[i] = v;
      }
    }
    for (const o of out) for (let i = 0; i < total; i++) o[i] *= g[i];
  }

  for (const pl of placed) {
    const s = pl.start + lead, th = (pl.pan + 1) * Math.PI / 4;
    const gains = nch === 2 ? [Math.cos(th) * Math.SQRT2, Math.sin(th) * Math.SQRT2] : out.map(() => 1);
    out.forEach((o, ci) => { const gg = pl.amp * (gains[ci] ?? 1); for (let i = 0; i < pl.x.length; i++) { const j = s + i; if (j >= 0 && j < total) o[j] += pl.x[i] * gg; } });
  }
  if (opts.safe !== false) {
    const pk = peak(out), lim = dbToLin(-1);
    if (pk > lim && pk > 0) for (const o of out) for (let i = 0; i < o.length; i++) o[i] *= lim / pk;
  }
  return { ch: out, lead, analysis: a, refAnalysis: refA, marks: placed.map(pl => ({ slot: pl.slot, start: pl.start + lead, len: pl.x.length, anchor: pl.anchor + lead })) };
}

/** Readable summary of an analysis, for the UI. */
export function describeStructure(a) {
  const ms = s => Math.round(s / a.sr * 1000);
  return {
    attackMs: ms(a.peakAt - a.onset), peakS: a.peakAt / a.sr, bodyEndS: a.bodyEnd / a.sr, tailEndS: a.tailEnd / a.sr,
    transients: a.transients.length, pitch: a.pitch, key: soundKey(a), centroid: a.centroid, character: a.flatness > 0.3 ? 'noisy' : a.pitch ? 'tonal' : 'resonant',
    material: autoMaterial(a), peakDb: linToDb(a.peak),
  };
}
