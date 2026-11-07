// SPDX-License-Identifier: Apache-2.0
/**
 * Layer stack: mixing up to four sounds at offsets, and two ways to stop layers from cancelling each other.
 *
 * - layerMix(layers, sr, opts) places, re-pitches, reverses, stretches, pans and sums the layers. A layer's stretch
 *   (a length ratio) keeps every attack (stretchAttacks), so hits stay sharp; long ratios suit ambiences and beds.
 *   opts.lowAlign (Hz, 0 = off) lines up the phase of the layers below that frequency before summing: per bin, each
 *   layer is turned to the phase of the layer that is strongest there (from their cross-spectrum smoothed over 40 ms).
 *   It only repairs cancellation: the low band ends up no weaker than the plain sum and no stronger than the layers'
 *   power sum, so nothing is boosted that the layers did not have. Above the cutoff (with a crossover of a quarter
 *   octave) the mix is the plain sum.
 * - alignHits(layers, sr, opts) finds, for each layer, the shift (a few ms) and polarity that line its strongest hit up
 *   with the main layer's: onsets first, then the cross-correlation of the first 30 ms, in the low band when both carry
 *   low end there. Two sub layers a few ms apart cancel in the low end; lined up they add.
 * The same ideas fold stereo to mono in Playhead (per-bin phase, attacks in the time domain); here they act between
 * layers. Layers: [{ ch, sr, offset (ms), gain (dB), pitch (semitones), reverse, stretch (length ratio, default 1),
 * pan (-1..1), polarity (1 or -1) }].
 */
import { len, dbToLin } from './core.js';
import { resample, varispeed } from './resample.js';
import { layerOnsets, stretchAttacks } from './stretch.js';
import { fft, hann } from './fft.js';

/** The layers as they will sound: at the mix rate, reversed, re-pitched and stretched (keeping every attack), with
 *  their offset in samples. */
export function prepareLayers(layers, sr) {
  return layers.map(L => {
    let c = L.ch;
    if (L.sr !== sr) c = resample(c, L.sr, sr);
    if (L.reverse) c = c.map(x => x.slice().reverse());
    if (L.pitch) c = varispeed(c, () => Math.pow(2, L.pitch / 12));
    if (L.stretch && Math.abs(L.stretch - 1) > 1e-3) c = stretchAttacks(c, sr, L.stretch);
    return { c, off: Math.max(0, Math.round((L.offset || 0) * sr / 1000)), g: dbToLin(L.gain || 0) * (L.polarity === -1 ? -1 : 1), pan: L.pan || 0 };
  });
}
// one layer's contribution to each output channel (the same rules as before: equal-power pan for mono layers, balance
// for stereo ones, the channels' mean when the mix is mono)
function place(L, nch, total) {
  const n = len(L.c), out = Array.from({ length: nch }, () => new Float32Array(total));
  if (nch === 1) { for (const c of L.c) for (let i = 0; i < n; i++) out[0][L.off + i] += c[i] * L.g / L.c.length; }
  else if (L.c.length === 1) {
    const th = (L.pan + 1) * Math.PI / 4, gl = Math.cos(th) * Math.SQRT2 * L.g, gr = Math.sin(th) * Math.SQRT2 * L.g;
    for (let i = 0; i < n; i++) { out[0][L.off + i] += L.c[0][i] * gl; out[1][L.off + i] += L.c[0][i] * gr; }
  } else {
    const gl = (L.pan > 0 ? 1 - L.pan : 1) * L.g, gr = (L.pan < 0 ? 1 + L.pan : 1) * L.g;
    for (let i = 0; i < n; i++) { out[0][L.off + i] += L.c[0][i] * gl; out[1][L.off + i] += L.c[1][i] * gr; }
  }
  return out;
}
/** Mix the layers. opts.lowAlign: line up the low end below this frequency (Hz), 0 or absent for a plain sum. */
export function layerMix(layers, sr, opts = {}) {
  let nch = 1;
  for (const L of layers) if (L.ch.length > 1 || Math.abs(L.pan || 0) > 0.001) nch = 2;
  const P = prepareLayers(layers, sr);
  const total = Math.max(1, ...P.map(L => L.off + len(L.c)));
  const parts = P.map(L => place(L, nch, total));
  const out = Array.from({ length: nch }, (_, k) => { const o = new Float32Array(total); for (const p of parts) { const x = p[k]; for (let i = 0; i < total; i++) o[i] += x[i]; } return o; });
  if (opts.lowAlign > 0 && parts.length > 1) for (let k = 0; k < nch; k++) addLowAlign(out[k], parts.map(p => p[k]), sr, opts.lowAlign);
  return out;
}
// adds to `sum` the change that lines up the layers' phase below `cut` Hz (STFT, Hann, 75 % overlap; only the low bins
// are touched, so the rest of the mix stays the plain sum)
function addLowAlign(sum, xs, sr, cut) {
  const N = sr > 60000 ? 4096 : 2048, H = N >> 2, half = N >> 1, w = hann(N), n = sum.length, K = xs.length;
  const k1 = Math.min(half, Math.ceil(cut * 1.19 * N / sr)), k0 = Math.floor(cut / 1.19 * N / sr);
  const wt = k => (k <= k0 ? 1 : k >= k1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (k - k0) / (k1 - k0)));   // crossover
  const a = Math.exp(-H / (0.04 * sr));
  const re = Array.from({ length: K }, () => new Float64Array(N)), im = Array.from({ length: K }, () => new Float64Array(N));
  const pw = Array.from({ length: K }, () => new Float64Array(k1 + 1)), cr = Array.from({ length: K }, () => new Float64Array((k1 + 1) * K)), ci = Array.from({ length: K }, () => new Float64Array((k1 + 1) * K));
  const dr = new Float64Array(N), di = new Float64Array(N), corr = new Float64Array(n + N), norm = new Float64Array(n + N);
  const nF = Math.ceil((n + N) / H);
  for (let f = 0; f < nF; f++) {
    const s = f * H - half;
    let any = false;
    for (let l = 0; l < K; l++) {
      const x = xs[l], r = re[l], m = im[l];
      for (let i = 0; i < N; i++) { const j = s + i, v = j >= 0 && j < n ? x[j] * w[i] : 0; r[i] = v; m[i] = 0; if (v) any = true; }
    }
    dr.fill(0); di.fill(0);
    if (any) {
      for (let l = 0; l < K; l++) fft(re[l], im[l], false);
      for (let k = 1; k <= k1; k++) {
        // smoothed power of each layer and cross-spectrum against every other, for this bin
        for (let l = 0; l < K; l++) pw[l][k] = a * pw[l][k] + (1 - a) * (re[l][k] * re[l][k] + im[l][k] * im[l][k]);
        let ref = 0; for (let l = 1; l < K; l++) if (pw[l][k] > pw[ref][k]) ref = l;
        let yr = 0, yi = 0, pr = 0, pi = 0, ps = 0;
        for (let l = 0; l < K; l++) {
          const xr = re[l][k], xi = im[l][k], q = k * K + ref;
          // X_ref · conj(X_l), smoothed: its angle is how far the reference leads this layer
          cr[l][q] = a * cr[l][q] + (1 - a) * (re[ref][k] * xr + im[ref][k] * xi);
          ci[l][q] = a * ci[l][q] + (1 - a) * (im[ref][k] * xr - re[ref][k] * xi);
          let ur = 1, ui = 0;
          if (l !== ref) { const mg = Math.hypot(cr[l][q], ci[l][q]); if (mg > 1e-24) { const t = Math.atan2(ci[l][q], cr[l][q]) * wt(k); ur = Math.cos(t); ui = Math.sin(t); } }
          yr += xr * ur - xi * ui; yi += xr * ui + xi * ur;
          pr += xr; pi += xi; ps += xr * xr + xi * xi;
        }
        // no weaker than the plain sum, no stronger than the power sum
        const A = Math.hypot(yr, yi), Pm = Math.hypot(pr, pi), T = Math.sqrt(ps), g = A > 1e-20 ? Math.max(Pm, Math.min(A, T)) / A : 0;
        dr[k] = yr * g - pr; di[k] = yi * g - pi;
      }
    }
    // the change back to time: conjugate symmetry, inverse FFT, windowed overlap-add
    for (let k = 1; k < half; k++) { dr[N - k] = dr[k]; di[N - k] = -di[k]; }
    di[0] = 0; di[half] = 0;
    fft(dr, di, true);
    for (let i = 0; i < N; i++) { const j = s + i + half; corr[j] += dr[i] * w[i]; norm[j] += w[i] * w[i]; }
  }
  for (let i = 0; i < n; i++) { const nv = norm[i + half]; if (nv > 1e-6) sum[i] += corr[i + half] / nv; }
}

// mono, optionally low-passed (two one-pole sections at `fc` Hz), of a layer as placed
function monoOf(L, fc, sr) {
  const n = len(L.c), m = new Float32Array(n);
  for (const c of L.c) for (let i = 0; i < n; i++) m[i] += c[i] / L.c.length;
  if (!fc) return m;
  const b = 1 - Math.exp(-2 * Math.PI * fc / sr);
  let y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) { y1 += b * (m[i] - y1); y2 += b * (y1 - y2); m[i] = y2; }
  return m;
}
const energy = (x, a, b) => { let s = 0; for (let i = Math.max(0, a); i < Math.min(x.length, b); i++) s += x[i] * x[i]; return s; };

/**
 * Line each layer's strongest shared hit up with the main layer (the one with the highest peak, which stays).
 * opts: window (ms, how close two onsets must be to count as one hit, default 20), maxShift (ms, default 20), minGainDb
 * (a layer moves only when lining it up makes the hit at least this much stronger, default 1: smaller gains are not worth
 * changing a flam the designer may have chosen).
 * Returns [{ shift (ms), polarity (1 or -1), band ('low' or 'full'), gainDb (how much stronger the hit's first 30 ms are
 * lined up than as before), ref (index of the main layer) }], one per layer; the main layer and layers without a shared
 * hit or too little to gain get shift 0 and their polarity unchanged (gainDb still says what lining up would give).
 */
export function alignHits(layers, sr, opts = {}) {
  const P = prepareLayers(layers.map(L => ({ ...L, polarity: 1 })), sr), K = P.length;
  const win = Math.round((opts.window ?? 20) * sr / 1000), maxS = Math.round((opts.maxShift ?? 20) * sr / 1000);
  const res = layers.map(L => ({ shift: 0, polarity: L.polarity === -1 ? -1 : 1, band: 'full', gainDb: 0, ref: -1 }));
  if (K < 2) return res;
  const peakOf = L => { let m = 0; for (const c of L.c) for (let i = 0; i < c.length; i++) m = Math.max(m, Math.abs(c[i])); return m * Math.abs(L.g); };
  let ref = 0; for (let k = 1; k < K; k++) if (peakOf(P[k]) > peakOf(P[ref])) ref = k;
  const R = P[ref], rOn = layerOnsets(R.c, sr).map(i => i + R.off), lowFc = 250;
  const rFull = monoOf(R, 0, sr), rLow = monoOf(R, lowFc, sr), refPol = res[ref].polarity;
  const W = Math.round(0.03 * sr), pre = Math.round(0.002 * sr), fine = Math.round(0.005 * sr);
  for (let k = 0; k < K; k++) {
    res[k].ref = ref;
    if (k === ref) continue;
    const L = P[k], on = layerOnsets(L.c, sr);
    const full = monoOf(L, 0, sr), low = monoOf(L, lowFc, sr);
    // the shared hit: the pair of onsets within the window where both layers are strongest
    let best = null;
    for (const a of on) for (const b of rOn) {
      const d = b - (a + L.off); if (Math.abs(d) > win) continue;
      const e = Math.sqrt(energy(full, a, a + W) * energy(rFull, b - R.off, b - R.off + W));
      if (!best || e > best.e) best = { a, b, d, e };
    }
    if (!best || !(best.e > 0)) continue;
    // the band to compare: the low end when both carry at least a quarter of their energy there
    const lowShare = (x, xl, i) => energy(xl, i, i + W) / Math.max(1e-20, energy(x, i, i + W));
    const useLow = lowShare(full, low, best.a) >= 0.25 && lowShare(rFull, rLow, best.b - R.off) >= 0.25;
    const x = useLow ? low : full, y = useLow ? rLow : rFull, ya = best.b - R.off - pre;
    // cross-correlation around the onset difference: lag t places this layer's sample (a - pre + i) at the reference's (ya + i - t)
    let bc = 0, bt = 0, ex = 0, ey = 0;
    for (let i = 0; i < W; i++) { const yv = y[ya + i] || 0; ey += yv * yv; }
    for (let t = -fine; t <= fine; t++) {
      const sh = best.d + t; if (Math.abs(sh) > maxS) continue;
      let c = 0, e2 = 0;
      for (let i = 0; i < W; i++) { const xv = x[best.a - pre + i - t] || 0; c += xv * (y[ya + i] || 0); e2 += xv * xv; }
      if (Math.abs(c) > Math.abs(bc)) { bc = c; bt = t; ex = e2; }
    }
    if (!bc || !ex || !ey) continue;
    const shift = best.d + bt, pol = Math.sign(bc) * refPol;
    // how much the lined-up hit gains over the hit as it was (first 30 ms, both layers at their gains)
    const sumE = (s, p) => {
      let e = 0; const g = Math.abs(L.g) * p, gr = Math.abs(R.g) * refPol;
      for (let i = 0; i < W; i++) { const j = best.b - pre + i, yr = y[j - R.off] || 0, xv = x[j - L.off - s] || 0; const v = yr * gr + xv * g; e += v * v; }
      return e;
    };
    const before = sumE(0, layers[k].polarity === -1 ? -1 : 1), after = sumE(shift, pol);
    const gainDb = 10 * Math.log10(Math.max(1e-20, after) / Math.max(1e-20, before));
    res[k].band = useLow ? 'low' : 'full'; res[k].gainDb = gainDb;
    if (gainDb >= (opts.minGainDb ?? 1)) Object.assign(res[k], { shift: shift * 1000 / sr, polarity: pol });
  }
  return res;
}
