// SPDX-License-Identifier: Apache-2.0
/**
 * Effect processors used by the effect chain. Each entry is (channels, sampleRate, params) -> channels.
 * The UI definition (labels, ranges, defaults) of each effect lives in src/config/effects.js under the same key.
 */
import { TAU, rng, len, peak, scale, copy, matchPeak, trimTail, monoAbs, follower, dcBlock, dbToLin, linToDb } from './core.js';
import { varispeed } from './resample.js';
import { biquad, biquadG, runBiquad } from './filters.js';
import { stft, istft } from './fft.js';
import { timeStretch, pitchShift } from './stretch.js';
import { loudnessNormalize } from './loudness.js';
import { extract } from './edit.js';
import { buildBody, resonateMono, disperseMono, maxTau } from './physical.js';


/* ---------- effects: (chs, sr, params) -> chs ---------- */
export const FX = {
  gain: (ch, sr, p) => scale(ch, dbToLin(p.db)),
  normalize: (ch, sr, p) => matchPeak(ch, dbToLin(p.target)),
  reverse: ch => ch.map(c => c.slice().reverse()),
  pitch(ch, sr, p) {
    const s0 = p.st, s1 = p.sweep ? p.end : p.st;
    if (s0 === 0 && s1 === 0) return copy(ch);
    const cf = p.curve === 'exp' ? u => 1 - Math.pow(1 - u, 3) : p.curve === 'late' ? u => u * u * u : u => u;
    return varispeed(ch, u => Math.pow(2, (s0 + (s1 - s0) * cf(u)) / 12));
  },
  filter(ch, sr, p) {
    const n = len(ch), f0 = p.freq, f1 = p.sweep ? p.freqEnd : p.freq, fixed = f0 === f1;
    const q = p.q || 0.707;
    return ch.map(c => {
      const o = new Float32Array(n);
      let z1 = 0, z2 = 0, co = biquad(p.mode, f0, q, sr);
      for (let i = 0; i < n; i++) {
        if (!fixed && (i & 15) === 0) co = biquad(p.mode, f0 * Math.pow(f1 / f0, n > 1 ? i / (n - 1) : 0), q, sr);
        const x = c[i], y = co[0] * x + z1;
        z1 = co[1] * x - co[3] * y + z2; z2 = co[2] * x - co[4] * y; o[i] = y;
      }
      return o;
    });
  },
  distort(ch, sr, p) {
    const g = dbToLin(p.drive), mix = p.mix / 100;
    const sh = { soft: Math.tanh, hard: x => (x > 1 ? 1 : x < -1 ? -1 : x), fold: x => Math.sin(x * Math.PI / 2), asym: x => Math.tanh(x + 0.35) - 0.336376 }[p.type] || Math.tanh;
    let wet = ch.map(c => { const o = new Float32Array(c.length); for (let i = 0; i < c.length; i++) o[i] = sh(c[i] * g); return p.type === 'asym' ? dcBlock(o, sr) : o; });
    wet = matchPeak(wet, peak(ch));
    return ch.map((c, k) => { const o = new Float32Array(c.length), w = wet[k]; for (let i = 0; i < c.length; i++) o[i] = c[i] * (1 - mix) + w[i] * mix; return o; });
  },
  crush(ch, sr, p) {
    const q = Math.pow(2, p.bits - 1), ds = Math.max(1, Math.round(p.ds)), mix = p.mix / 100;
    return ch.map(c => {
      const o = new Float32Array(c.length); let held = 0;
      for (let i = 0; i < c.length; i++) { if (i % ds === 0) held = Math.round(c[i] * q) / q; o[i] = c[i] * (1 - mix) + held * mix; }
      return o;
    });
  },
  ring(ch, sr, p) {
    const n = len(ch), mix = p.mix / 100, f0 = p.freq, f1 = p.sweep ? p.freqEnd : p.freq;
    const m = new Float32Array(n); let ph = 0;
    for (let i = 0; i < n; i++) { ph += TAU * f0 * Math.pow(f1 / f0, n > 1 ? i / (n - 1) : 0) / sr; m[i] = Math.sin(ph); }
    return ch.map(c => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = c[i] * ((1 - mix) + m[i] * mix); return o; });
  },
  trem(ch, sr, p) {
    const n = len(ch), d = p.depth / 100, g = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const ph = TAU * p.rate * i / sr;
      g[i] = p.shape === 'square' ? ((ph % TAU) < Math.PI ? 1 : 1 - d) : 1 - d * (0.5 - 0.5 * Math.cos(ph));
    }
    return ch.map(c => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = c[i] * g[i]; return o; });
  },
  moddelay(ch, sr, p) {
    const n = len(ch), mix = p.mix / 100, fb = p.fb / 100;
    return ch.map((c, k) => {
      const line = new Float32Array(n), o = new Float32Array(n), off = k * Math.PI / 2;
      for (let i = 0; i < n; i++) {
        const d = Math.max(1, (p.delay + p.depth * 0.5 * (1 + Math.sin(TAU * p.rate * i / sr + off))) * sr / 1000);
        const pos = i - d; let y = 0;
        if (pos >= 0) { const i0 = Math.floor(pos), f = pos - i0; y = line[i0] + (line[i0 + 1] - line[i0]) * f; }
        line[i] = c[i] + y * fb;
        o[i] = c[i] * (1 - mix) + y * mix;
      }
      return o;
    });
  },
  echo(ch, sr, p) {
    const n = len(ch), D = Math.max(1, Math.round(p.time * sr / 1000)), fb = p.fb / 100, mix = p.mix / 100;
    const repeats = fb > 0.001 ? Math.ceil(Math.log(0.001) / Math.log(fb)) : 1;
    const tail = Math.min(10 * sr, D * (repeats + 1)), N = n + tail;
    const a = 1 - Math.exp(-TAU * p.damp / sr);
    const out = ch.map(c => {
      const line = new Float32Array(N), o = new Float32Array(N); let lp = 0;
      for (let i = 0; i < N; i++) {
        const x = i < n ? c[i] : 0, d = i >= D ? line[i - D] : 0;
        lp += a * (d - lp);
        line[i] = x + lp * fb;
        o[i] = x + lp * mix;
      }
      return o;
    });
    return trimTail(out, n);
  },
  reverb(ch, sr, p) {
    const n = len(ch), pre = Math.round(p.predelay * sr / 1000), N = n + pre + Math.round(p.tail * sr);
    const st = sr / 44100, combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], apT = [556, 441, 341, 225];
    const room = (p.size / 100) * 0.28 + 0.7, damp = (p.damp / 100) * 0.4, mix = p.mix / 100;
    const input = new Float32Array(N);
    for (const c of ch) for (let i = 0; i < n; i++) input[i + pre] += c[i] * 0.015 / ch.length;
    function side(spread) {
      const acc = new Float32Array(N);
      for (const t of combT) {
        const L = Math.max(1, Math.round((t + spread) * st)), buf = new Float32Array(L); let idx = 0, store = 0;
        for (let i = 0; i < N; i++) {
          const y = buf[idx]; store = y * (1 - damp) + store * damp;
          buf[idx] = input[i] + store * room; if (++idx >= L) idx = 0; acc[i] += y;
        }
      }
      for (const t of apT) {
        const L = Math.max(1, Math.round((t + spread) * st)), buf = new Float32Array(L); let idx = 0;
        for (let i = 0; i < N; i++) {
          const b = buf[idx], x = acc[i]; buf[idx] = x + b * 0.5; if (++idx >= L) idx = 0; acc[i] = b - x;
        }
      }
      return acc;
    }
    const wet = Math.sin(mix * Math.PI / 2) * 3, dry = Math.cos(mix * Math.PI / 2);
    const Lw = side(0), Rw = ch.length > 1 ? side(23) : null;
    const width = (p.width ?? 100) / 100, w1 = (width / 2 + 0.5), w2 = (1 - width) / 2;
    const out = ch.map((c, k) => {
      const o = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const x = i < n ? c[i] : 0;
        let r;
        if (!Rw) r = Lw[i];
        else r = k % 2 === 0 ? Lw[i] * w1 + Rw[i] * w2 : Rw[i] * w1 + Lw[i] * w2;
        o[i] = x * dry + r * wet;
      }
      return o;
    });
    return trimTail(out, n);
  },
  transient(ch, sr, p) {
    const det = monoAbs(ch), n = det.length;
    const fast = follower(det, 0.3, 40, sr), slow = follower(det, 15, 40, sr);
    const s1 = follower(det, 1, 30, sr), s2 = follower(det, 1, 350, sr);
    const g = new Float32Array(n); let sm = 0; const a = Math.exp(-1 / (0.001 * sr));
    for (let i = 0; i < n; i++) {
      const at = Math.max(0, fast[i] - slow[i]) / (fast[i] + 1e-6);
      const su = Math.max(0, s2[i] - s1[i]) / (s2[i] + 1e-6);
      const gdb = (p.attack / 100) * 18 * at + (p.sustain / 100) * 18 * su;
      sm = a * sm + (1 - a) * gdb; g[i] = dbToLin(sm);
    }
    return ch.map(c => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = c[i] * g[i]; return o; });
  },
  comp(ch, sr, p) {
    const det = monoAbs(ch), n = det.length;
    const at = Math.exp(-1 / Math.max(1, p.att * sr / 1000)), rl = Math.exp(-1 / Math.max(1, p.rel * sr / 1000));
    const g = new Float32Array(n); let gr = 0;
    for (let i = 0; i < n; i++) {
      const over = linToDb(det[i]) - p.thr, target = over > 0 ? over * (1 - 1 / p.ratio) : 0;
      gr = target > gr ? at * gr + (1 - at) * target : rl * gr + (1 - rl) * target;
      g[i] = dbToLin(p.makeup - gr);
    }
    return ch.map(c => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = c[i] * g[i]; return o; });
  },
  fade(ch, sr, p) {
    const n = len(ch), fi = Math.min(n, Math.round(p.in * sr / 1000)), fo = Math.min(n, Math.round(p.out * sr / 1000));
    const sh = p.curve === 'smooth' ? u => 0.5 - 0.5 * Math.cos(Math.PI * u) : p.curve === 'exp' ? u => u * u : u => u;
    return ch.map(c => {
      const o = c.slice();
      for (let i = 0; i < fi; i++) o[i] *= sh(i / fi);
      for (let i = 0; i < fo; i++) o[n - 1 - i] *= sh(i / fo);
      return o;
    });
  },
};
export function processChain(snd, chain) {
  let ch = snd.ch;
  for (const fx of chain) {
    if (!fx.on || !FX[fx.type]) continue;
    ch = FX[fx.type](ch, snd.sr, fx.p);
    if (!len(ch)) break;
  }
  return { sr: snd.sr, ch: ch === snd.ch ? copy(ch) : ch };
}


/* ---------- more effects ---------- */
Object.assign(FX, {
  stretch(ch, sr, p) {
    const n = len(ch), keep = Math.min(n - 1, Math.round((p.keep || 0) * sr / 1000));
    const head = keep > 0 ? ch.map(c => c.slice(0, keep)) : null, rest = keep > 0 ? ch.map(c => c.slice(keep)) : ch;
    const rn = len(rest); if (!rn) return copy(ch);
    let factor = p.factor;
    if (p.fit) {
      const target = Math.round(p.length * sr / 1000);
      if (target <= keep) return extract(ch, 0, Math.max(1, target), 5, sr);
      factor = (target - keep) / rn;
    }
    const st = timeStretch(rest, sr, factor, p.method, p.win);
    if (!head) return st;
    return st.map((c, k) => { const o = new Float32Array(keep + c.length); o.set(head[k]); o.set(c, keep); return o; });
  },
  pshift: (ch, sr, p) => pitchShift(ch, sr, p.st, p.method, p.win),
  eq(ch, sr, p) {
    let out = ch;
    if (p.lowGain) out = out.map(c => runBiquad(c, biquadG('lowshelf', p.lowFreq, 0.707, p.lowGain, sr)));
    if (p.midGain) out = out.map(c => runBiquad(c, biquadG('peaking', p.midFreq, p.midQ, p.midGain, sr)));
    if (p.highGain) out = out.map(c => runBiquad(c, biquadG('highshelf', p.highFreq, 0.707, p.highGain, sr)));
    return out === ch ? copy(ch) : out;
  },
  denoise(ch, sr, p) {
    const N = 2048, floor = dbToLin(-p.reduce), sens = p.sens;
    return ch.map(c => {
      const F = stft(c, N), B = N / 2 + 1, nF = F.length, noise = new Float64Array(B), col = new Float64Array(nF);
      for (let k = 0; k < B; k++) { for (let f = 0; f < nF; f++) col[f] = Math.hypot(F[f].re[k], F[f].im[k]); const s = Array.from(col).sort((a, b) => a - b); noise[k] = s[nF >= 8 ? Math.floor(nF * 0.1) : 0]; }
      const g = new Float64Array(B).fill(1);
      const frames = F.map(X => {
        const re = new Float64Array(B), im = new Float64Array(B);
        for (let k = 0; k < B; k++) {
          const m = Math.hypot(X.re[k], X.im[k]) + 1e-12, r = sens * noise[k] / m;
          const G = Math.max(floor, Math.sqrt(Math.max(0, 1 - r * r)));
          g[k] = G > g[k] ? G : 0.7 * g[k] + 0.3 * G;
          re[k] = X.re[k] * g[k]; im[k] = X.im[k] * g[k];
        }
        return { re, im };
      });
      return istft(frames, N, c.length);
    });
  },
  loud: (ch, sr, p) => loudnessNormalize(ch, sr, p.target, p.ceil),
  dc: (ch, sr) => ch.map(c => dcBlock(c, sr)),
  /** All-pass dispersion, optionally in a feedback loop: clicks become chirps, the loop adds spring-reverb repeats. */
  disperse(ch, sr, p) {
    const mix = p.mix / 100, pk = peak(ch);
    const wet = ch.map(c => disperseMono(c, sr, p.amount / 100, p.stages, p.fb / 100, p.delay));
    const wpk = peak(wet), g = wpk > 0 ? pk / wpk : 0, L = len(wet);
    return trimTail(wet.map((w, k) => { const o = new Float32Array(L), c = ch[k]; for (let i = 0; i < L; i++) o[i] = w[i] * g * mix + (i < c.length ? c[i] : 0) * (1 - mix); return o; }), len(ch));
  },
  /** Excite a modal body (material, shape, size) with the sound, as if it were struck through that object. */
  resonate(ch, sr, p) {
    const R = rng(1234), modes = buildBody({ material: p.material, shape: p.shape, size: p.size, modes: p.modes, ring: p.ring, pos: p.pos / 100, irregular: 0.2 }, sr, R);
    const tail = Math.round(Math.min(6, 6 * maxTau(modes)) * sr), mix = p.mix / 100, pk = peak(ch);
    const wet = ch.map(c => resonateMono(c, modes, sr, tail)), wpk = peak(wet), g = wpk > 0 ? pk / wpk : 0, L = len(wet);
    return trimTail(wet.map((w, k) => { const o = new Float32Array(L), c = ch[k]; for (let i = 0; i < L; i++) o[i] = w[i] * g * mix + (i < c.length ? c[i] : 0) * (1 - mix); return o; }), len(ch));
  },
});
