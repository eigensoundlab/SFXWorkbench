// SPDX-License-Identifier: Apache-2.0
/**
 * Modal analysis and resynthesis: turn a recorded hit into an editable physical object.
 *
 * measureModes() finds the resonant modes of a struck sound: spectral peaks right after the attack (frequency,
 * amplitude) and how fast each one decays (a straight-line fit of its level in dB over time). resynthGen() rebuilds
 * the object from those modes with the Impact engine, so it can be struck, scraped, rolled, bounced or broken, and
 * reshaped: resized, made to ring longer or shorter, stretched, tilted and morphed towards another material's damping.
 * The original attack (the first milliseconds) can be mixed back in, since contact noise is hard to model.
 *
 * Approach after the modal synthesis literature: K. van den Doel and D. K. Pai, "Modal synthesis for vibrating
 * objects," in Audio Anecdotes, 2003; and peak-picking/decay fitting as in sinusoidal modelling (X. Serra and J. Smith,
 * "Spectral modeling synthesis," Computer Music Journal 14(4), 1990).
 */
import { clamp, len, monoMix, dbToLin, matchPeak } from './core.js';
import { fft, hann } from './fft.js';
import { MATERIALS, impactGen } from './physical.js';
import { varispeed } from './resample.js';
import { synth } from './examples.js';

const pow2below = v => 1 << Math.floor(Math.log2(Math.max(2, v)));

/**
 * Measure the modes of a struck sound.
 * @param {Float32Array[]} chs
 * @param {{ maxModes?: number, rangeDb?: number }} opts
 * @returns {{ modes: {f:number, tau:number, a:number}[], f1:number, sr:number, attack: Float32Array, name?: string }}
 *   modes sorted by frequency, a normalised to the strongest mode (1). attack: the first 40 ms from the onset,
 *   for mixing the original contact sound back in.
 */
export function measureModes(chs, sr, opts = {}) {
  const x = monoMix(chs), n = x.length, maxModes = opts.maxModes || 48, rangeDb = opts.rangeDb || 60;
  let pk = 0, pi = 0;
  for (let i = 0; i < n; i++) { const v = Math.abs(x[i]); if (v > pk) { pk = v; pi = i; } }
  if (!pk) throw new Error('The sound is silent, so there is nothing to measure.');
  let on = pi; while (on > 0 && Math.abs(x[on - 1]) > pk * 0.01 && pi - on < 0.05 * sr) on--;
  const start = Math.min(n - 1, pi + Math.round(0.005 * sr)), L = Math.min(n - start, Math.round(4 * sr));
  if (L < 0.02 * sr) throw new Error('The sound is too short after its attack to measure. Use a hit that rings for at least 20 ms.');

  // Window length: as long as possible (frequency resolution) while leaving several frames for the decay fit.
  const N = clamp(pow2below(L / 3), 256, 8192), hop = Math.max(32, N >> 3), F = 2 * N, B = F / 2;
  const w = hann(N), wsum = N / 2;
  const frames = Math.max(1, Math.min(200, Math.floor((L - N) / hop) + 1));
  const re = new Float64Array(F), im = new Float64Array(F), mags = [];
  for (let j = 0; j < frames; j++) {
    re.fill(0); im.fill(0);
    for (let i = 0; i < N; i++) { const k = start + j * hop + i; re[i] = k < n ? x[k] * w[i] : 0; }
    fft(re, im, false);
    const m = new Float32Array(B);
    for (let k = 0; k < B; k++) m[k] = Math.hypot(re[k], im[k]) / wsum;
    mags.push(m);
  }

  // Peak picking on the first frame (dB), with a floor relative to the strongest peak and to the spectrum median.
  const db = Array.from(mags[0], v => 20 * Math.log10(v + 1e-12));
  const kLo = Math.max(2, Math.round(30 / sr * F)), kHi = Math.min(B - 3, Math.round(0.45 * F));
  let top = -Infinity; for (let k = kLo; k <= kHi; k++) top = Math.max(top, db[k]);
  const sorted = db.slice(kLo, kHi).sort((a, b) => a - b), median = sorted[sorted.length >> 1];
  const floor = Math.max(top - rangeDb, median + 15);
  const cands = [];
  for (let k = kLo; k <= kHi; k++) {
    if (db[k] < floor) continue;
    if (db[k] >= db[k - 1] && db[k] > db[k + 1] && db[k] >= db[k - 2] && db[k] > db[k + 2]) cands.push(k);
  }
  cands.sort((a, b) => db[b] - db[a]);
  const picked = [];
  for (const k of cands) { if (picked.every(q => Math.abs(q - k) > 3)) picked.push(k); if (picked.length >= maxModes) break; }

  const tFrame = j => (j * hop + N / 2) / sr; // frame centre, relative to `start`
  const modes = picked.map(k => {
    const a0 = db[k - 1], b0 = db[k], c0 = db[k + 1], den = a0 - 2 * b0 + c0, d = den !== 0 ? clamp(0.5 * (a0 - c0) / den, -0.5, 0.5) : 0;
    const f = (k + d) * sr / F;
    // Decay: fit level (dB) over the frames where this peak stays clearly above the floor of its own track.
    const track = mags.map(m => 20 * Math.log10(Math.max(m[k - 1], m[k], m[k + 1]) + 1e-12));
    const end = track.findIndex(v => v < track[0] - 50 || v < median - 6);
    const use = Math.max(2, end < 0 ? track.length : end);
    let tau;
    if (use < 2 || track.length < 2) tau = 0.05;
    else {
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (let j = 0; j < use; j++) { const t = tFrame(j); sx += t; sy += track[j]; sxx += t * t; sxy += t * track[j]; }
      const slope = (use * sxy - sx * sy) / Math.max(1e-12, use * sxx - sx * sx);
      tau = slope < -1e-3 ? 8.6859 / -slope : L / sr * 2;
    }
    tau = clamp(tau, 0.002, 12);
    // Amplitude at the strike: level at the first frame centre, extrapolated back with the fitted decay.
    const amp = dbToLin(b0 - 0.25 * (a0 - c0) * d) * Math.exp(tFrame(0) / tau);
    return { f, tau, a: amp };
  }).filter(m => m.f > 20);

  if (!modes.length) throw new Error('No clear resonances found. Modal resynthesis works best on hits, knocks and clangs, not on noise.');
  const amax = Math.max(...modes.map(m => m.a));
  for (const m of modes) m.a /= amax;
  modes.sort((p, q) => p.f - q.f);
  const strong = modes.filter(m => m.a > 0.1);
  const attackN = Math.min(n - on, Math.round(0.04 * sr)), attack = x.slice(on, on + attackN);
  return { modes, f1: (strong[0] || modes[0]).f, sr, attack };
}

let fallback = null;
/** Measurement used when nothing has been measured yet: the synthesized metal-hit example. */
export function defaultMeasurement(sr) {
  if (!fallback || fallback.sr !== sr) fallback = { ...measureModes(synth.metal(sr), sr), name: 'metal_hit (example)' };
  return fallback;
}

/**
 * Transform measured modes into a body for the Impact engine.
 * p.modes: how many of the strongest modes to keep. p.shift: size as a pitch ratio (2 = smaller, an octave up).
 * p.ring: decay multiplier. p.tilt (-100..100): positive makes high modes ring longer, negative shorter.
 * p.stretch (-20..20 %): spreads (+) or squeezes (-) mode spacing, like a stiffer or softer object.
 * p.morphMat / p.morphAmt: move decay times towards that material's loss model.
 */
export function transformModes(meas, p, sr) {
  const keep = [...meas.modes].sort((a, b) => b.a - a.a).slice(0, Math.max(1, Math.round(p.modes))).sort((a, b) => a.f - b.f);
  const f1 = meas.f1 || keep[0].f, shift = p.shift, ex = 1 + (p.stretch || 0) / 100, tilt = (p.tilt || 0) / 100;
  const mat = MATERIALS[p.morphMat], amt = mat ? clamp(p.morphAmt / 100, 0, 1) : 0;
  const out = [];
  keep.forEach((m, k) => {
    const f = f1 * shift * Math.pow(m.f / f1, ex);
    if (f >= sr * 0.45 || f < 15) return;
    let tau = m.tau * p.ring / Math.sqrt(shift) * Math.pow(m.f / f1, tilt);
    if (amt > 0) tau = Math.exp((1 - amt) * Math.log(tau) + amt * Math.log(p.ring / (Math.PI * f * mat.eta + mat.delta)));
    out.push({ f, tau: clamp(tau, 0.002, 20), g: m.a, gm: m.a, k });
  });
  return out;
}

/**
 * Render a measured object (Generate tab, Resynth engine). Takes the Impact engine's cause and aftermath
 * parameters plus the transform parameters above; p.measured holds the measurement (else the example is used).
 * p.keepAttack (%) mixes the original attack back in (pitch-shifted with the size).
 */
export function resynthGen(p, sr) {
  const meas = p.measured && p.measured.modes ? p.measured : defaultMeasurement(sr);
  const modes = transformModes(meas, p, sr);
  const base = impactGen({ ...p, _modes: modes, shape: 'plate', size: modes[0] ? modes[0].f : 400, modes: modes.length, pos: p.pos ?? 25, irregular: p.irregular ?? 25 }, sr);
  const keep = clamp((p.keepAttack || 0) / 100, 0, 1);
  if (!keep || !meas.attack || !meas.attack.length || p.cause !== 'hit') return base;
  let atk = Float32Array.from(meas.attack);
  if (meas.sr !== sr || Math.abs(p.shift - 1) > 1e-3) atk = varispeed([atk], () => p.shift * meas.sr / sr)[0];
  const fo = Math.round(atk.length * 0.6);
  for (let i = 0; i < fo; i++) atk[atk.length - 1 - i] *= i / fo;
  const o = base[0], t0 = Math.round(0.004 * sr);
  let apk = 0, opk = 0;
  for (let i = 0; i < atk.length; i++) apk = Math.max(apk, Math.abs(atk[i]));
  for (let i = 0; i < Math.min(o.length, t0 + atk.length); i++) opk = Math.max(opk, Math.abs(o[i]));
  const g = apk > 0 ? keep * opk / apk : 0;
  for (let i = 0; i < atk.length && t0 + i < o.length; i++) o[t0 + i] = o[t0 + i] * (1 - 0.6 * keep) + atk[i] * g;
  return matchPeak([o], dbToLin(-1));
}

/** Summary for the UI. */
export function describeMeasurement(m) {
  const strong = m.modes.filter(x => x.a > 0.1);
  return { count: m.modes.length, strong: strong.length, f1: m.f1, longest: Math.max(...m.modes.map(x => x.tau)), length: len([m.attack]) };
}
