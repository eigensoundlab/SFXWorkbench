// SPDX-License-Identifier: Apache-2.0
/**
 * Action and reaction: a medium (gravel, leaves, water, air, sparks, a force field) that responds to an action,
 * such as an object moving through it. The action arrives as a drive curve: values in 0..1 at `driveRate` Hz, for
 * example the action sound's level envelope (levelCurve) or one of the curves of an analysis such as Playhead's
 * (normalizeCurve). After a delay the medium's event rate, level and brightness follow the drive, rising quickly
 * and settling with its own inertia. Without a drive curve a demo pass (rise and fall) is used.
 *
 * Parameter keys and ranges: see the 'reaction' engine in src/config/generator.js. The medium itself is rendered by
 * textureGen() with the event-rate envelope passed as `rateEnv`.
 */
import { TAU, clamp, len, peak, matchPeak, dbToLin, mapChannels, monoMix } from './core.js';
import { textureGen } from './textures.js';

/** Media the Reaction engine offers (a subset of the texture kinds), in menu order. */
export const MEDIUM_KINDS = {
  particles: 'Gravel, debris, leaves',
  liquid: 'Water',
  wind: 'Air',
  sparks: 'Sparks',
  energy: 'Force field',
};

/** Texture settings that the Reaction engine does not expose. Exposed params override these. */
const MEDIUM = {
  shape: 'steady', density: 150, material: 'stone', pitch: 2000, spread: 1.5, sizeMin: 1, sizeMax: 6, rise: 20, hiss: 30,
  hard: 40, roar: 60, crackle: 30, instab: 30, gust: 30, whistle: 10, thuds: 0, voices: 4, detune: 12, sweep: 0, rate: 3, depth: 30, width: 60,
};
const MAX_S = 20;

/** A pass: something approaches, is closest at 40%, and leaves (1.5 s at 100 Hz). */
const DEMO_DRIVE = Float32Array.from({ length: 150 }, (_, i) => { const u = i / 149; return Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 2); });

/**
 * Map a curve to 0..1 by its 5th..95th percentile (values outside are clipped). null, undefined and NaN (silence in
 * an analysis curve) become 0. A flat curve maps to 1 where it is above zero.
 * @param {ArrayLike<number|null>} values
 * @returns {Float32Array}
 */
export function normalizeCurve(values, lo = 0.05, hi = 0.95) {
  const n = values.length, out = new Float32Array(n), ok = [];
  for (let i = 0; i < n; i++) if (values[i] != null && Number.isFinite(values[i])) ok.push(values[i]);
  if (!ok.length) return out;
  ok.sort((a, b) => a - b);
  const qa = ok[Math.floor(lo * (ok.length - 1))], qb = ok[Math.floor(hi * (ok.length - 1))], span = qb - qa;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) continue;
    out[i] = span > 1e-9 ? clamp((v - qa) / span, 0, 1) : (v > 0 ? 1 : 0);
  }
  return out;
}

/**
 * Level envelope of a sound as a drive curve: RMS over 10 ms windows at `rate` Hz, in dB re the loudest window,
 * mapped from -50..0 dB to 0..1.
 * @param {Float32Array[]} chs
 * @returns {{ values: Float32Array, rate: number }}
 */
export function levelCurve(chs, sr, rate = 100) {
  const x = monoMix(chs), n = x.length, hop = sr / rate, m = Math.max(1, Math.ceil(n / hop)), W = Math.round(0.005 * sr);
  const cs = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + x[i] * x[i];
  const db = new Float32Array(m);
  let top = -Infinity;
  for (let k = 0; k < m; k++) {
    const c = Math.round(k * hop), a = Math.max(0, c - W), b = Math.min(n, c + W);
    db[k] = 10 * Math.log10((cs[b] - cs[a]) / Math.max(1, b - a) + 1e-12);
    if (db[k] > top) top = db[k];
  }
  return { values: db.map(v => clamp((v - top + 50) / 50, 0, 1)), rate };
}

/**
 * The control signal (one value per sample, 0..1) that the medium follows: the drive curve read `lag` ms late,
 * with values below `thresh` % ignored, rising within 10 ms and falling with the `inertia` time constant.
 * @param {ArrayLike<number>} curve drive values in 0..1
 * @param {number} rate drive values per second
 * @param {{ lag:number, thresh:number, inertia:number }} p
 */
export function reactionControl(curve, rate, p, sr, n) {
  const out = new Float32Array(n), m = curve.length, lag = Math.max(0, p.lag || 0) / 1000, thr = clamp((p.thresh || 0) / 100, 0, 0.95);
  const att = Math.exp(-1 / (0.01 * sr)), rel = Math.exp(-1 / (Math.max(5, p.inertia || 0) / 1000 * sr));
  let y = 0;
  for (let i = 0; i < n; i++) {
    const x = (i / sr - lag) * rate;
    let v = 0;
    if (x >= 0 && x < m) { const k = Math.floor(x), f = x - k; v = curve[k] + ((k + 1 < m ? curve[k + 1] : curve[k]) - curve[k]) * f; }
    v = Math.max(0, (v - thr) / (1 - thr));
    y = v > y ? v + (y - v) * att : v + (y - v) * rel;
    out[i] = y;
  }
  return out;
}

/**
 * Render a medium's reaction to an action. Extra inputs besides the spec params:
 *   driveCurve, driveRate  the action as 0..1 values at driveRate Hz (missing: a demo pass)
 *   actionCh               the action sound at `sr`, mixed in at `action` % of the medium's peak (0 leaves it out)
 * Normalised to -1 dBFS.
 * @returns {Float32Array[]}
 */
export function reactionGen(p, sr) {
  const own = p.driveCurve && p.driveCurve.length > 1, curve = own ? p.driveCurve : DEMO_DRIVE, rate = own && p.driveRate > 0 ? p.driveRate : 100;
  const act = p.actionCh && len(p.actionCh) && p.action > 0 ? p.actionCh : null;
  const tail = (Math.max(0, p.lag) + 3 * Math.max(5, p.inertia)) / 1000 + 0.05;
  const n = Math.max(16, Math.round(Math.min(MAX_S, Math.max(curve.length / rate + tail, act ? len(act) / sr : 0)) * sr));
  const ctl = reactionControl(curve, rate, p, sr, n), follow = clamp((p.follow ?? 100) / 100, 0, 1);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) env[i] = 1 - follow + follow * ctl[i];
  const tex = textureGen({ ...MEDIUM, ...p, kind: MEDIUM_KINDS[p.kind] ? p.kind : 'particles', shape: 'steady', dur: n / sr, fadeIn: 0, fadeOut: 20, rateEnv: env }, sr);
  // Level follows the drive too, and a low-pass opens as the medium is pushed harder.
  const b = clamp((p.bright || 0) / 100, 0, 1);
  let out = tex.map(c => {
    const o = new Float32Array(n);
    let y = 0, a = 1;
    for (let i = 0; i < n; i++) {
      if ((i & 31) === 0) { const fc = Math.min(sr * 0.45, 18000 * Math.pow(2, -6 * b * (1 - ctl[i]))); a = 1 - Math.exp(-TAU * fc / sr); }
      y += a * (c[i] - y);
      o[i] = y * env[i];
    }
    return o;
  });
  if (act) {
    const nch = Math.max(out.length, act.length), ac = mapChannels(act, nch), g = (peak(out) || dbToLin(-1)) * p.action / 100 / (peak(act) || 1);
    out = mapChannels(out, nch);
    for (let c = 0; c < nch; c++) for (let i = 0, m = Math.min(n, ac[c].length); i < m; i++) out[c][i] += ac[c][i] * g;
  }
  return matchPeak(out, dbToLin(-1));
}
