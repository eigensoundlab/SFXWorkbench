// SPDX-License-Identifier: Apache-2.0
/**
 * Procedural textures: many small physical events (particles, sparks, bubbles, drops) and continuous
 * noise-based phenomena (fire, wind, electric arcs, energy fields, rumble).
 *
 * Event textures follow Perry Cook's PhISEM idea: a stochastic stream of events with a time-varying rate,
 * each event exciting a small resonant system. Bubbles follow van den Doel's liquid model (Minnaert frequency,
 * rising pitch). Fire follows Andy Farnell's decomposition into crackle, hiss and lapping. See docs/DSP.md.
 *
 * Parameter keys and ranges: see the 'texture' engine in src/config/generator.js.
 */
import { TAU, clamp, rng, matchPeak, dbToLin } from './core.js';
import { biquad } from './filters.js';
import { MATERIALS, buildBody, strike, contactNoise } from './physical.js';

/** Kinds of texture, in menu order. */
export const TEXTURE_KINDS = {
  particles: 'Particles: gravel, debris, crumble',
  sparks: 'Sparks',
  arc: 'Electric arc / buzz',
  fire: 'Fire',
  liquid: 'Liquid: bubbles, drips, boiling',
  rain: 'Rain',
  wind: 'Wind',
  energy: 'Energy field / hum',
  rumble: 'Rumble / deep ambience',
};

/** Smooth random control signal in 0..1 (cosine interpolation between random points at `rate` Hz). */
function smoothRandom(n, rate, sr, R) {
  const o = new Float32Array(n), step = Math.max(2, Math.round(sr / Math.max(0.01, rate)));
  let a = R(), b = R();
  for (let i = 0; i < n; i++) {
    const k = i % step;
    if (k === 0 && i > 0) { a = b; b = R(); }
    const u = k / step, w = 0.5 - 0.5 * Math.cos(Math.PI * u);
    o[i] = a + (b - a) * w;
  }
  return o;
}

/** Event-rate envelope over the sound: steady, burst (dense start), swell (rise and fall) or random. */
function rateEnvelope(shape, n, sr, R) {
  if (shape === 'random') return smoothRandom(n, 1.2, sr, R).map(v => 0.1 + 0.9 * v * v);
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    e[i] = shape === 'burst' ? Math.exp(-4 * u) : shape === 'swell' ? Math.pow(Math.sin(Math.PI * u), 1.5) : 1;
  }
  return e;
}

/** Poisson event times with rate density * env(t). Calls fn(sampleIndex, envValue). */
function events(n, sr, density, env, R, fn) {
  const peakRate = Math.max(0.01, density);
  let t = 0;
  for (;;) {
    t += -Math.log(1 - R() * 0.9999) / peakRate * sr;
    if (t >= n) break;
    const e = env[Math.floor(t)];
    if (R() < e) fn(Math.floor(t), e);
  }
}

/** Time-varying biquad over a whole signal; freq(i) and q are re-evaluated every 32 samples. */
function sweepFilter(x, type, freqAt, q, sr) {
  const o = new Float32Array(x.length);
  let z1 = 0, z2 = 0, k = null;
  for (let i = 0; i < x.length; i++) {
    if ((i & 31) === 0) k = biquad(type, freqAt(i), q, sr);
    const v = x[i], y = k[0] * v + z1;
    z1 = k[1] * v - k[3] * y + z2; z2 = k[2] * v - k[4] * y; o[i] = y;
  }
  return o;
}
const filterOnce = (x, type, f, q, sr) => sweepFilter(x, type, () => f, q, sr);

function white(n, R) { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = R() * 2 - 1; return o; }
function pink(n, R) {
  const o = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = R() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    o[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
  }
  return o;
}
function brown(n, R) { const o = new Float32Array(n); let b = 0; for (let i = 0; i < n; i++) { b = 0.997 * b + (R() * 2 - 1) * 0.06; o[i] = b; } return o; }
const peakOf = x => { let m = 0; for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > m) m = v; } return m; };
/** Add `src` into `dst` scaled so its peak equals `level`. */
function addAt(dst, src, level) { const pk = peakOf(src); if (!pk || !level) return; const g = level / pk; for (let i = 0; i < dst.length && i < src.length; i++) dst[i] += src[i] * g; }

/** One gas bubble (van den Doel): sine at the Minnaert frequency with rising pitch and fast damping. */
export function bubble(out, t0, radiusMm, amp, rise, sr) {
  const f0 = 3260 / radiusMm, d = 0.043 * f0 + 0.0014 * Math.pow(f0, 1.5), sigma = rise * d;
  const N = Math.min(out.length - t0, Math.round(6 / d * sr)), att = Math.max(1, Math.round(0.0002 * sr));
  let ph = 0;
  for (let i = 0; i < N; i++) {
    const t = i / sr;
    ph += TAU * f0 * (1 + sigma * t) / sr;
    out[t0 + i] += amp * Math.sin(ph) * Math.exp(-d * t) * Math.min(1, i / att);
  }
}

/* ---------- kinds: each returns a mono Float32Array of length n ---------- */

const KIND = {
  particles(p, n, sr, R) {
    const o = new Float32Array(n), env = rateEnvelope(p.shape, n, sr, R), mat = MATERIALS[p.material] || MATERIALS.stone;
    const shape = ['steel', 'brass', 'aluminium', 'glass', 'ceramic', 'ice'].includes(p.material) ? 'plate' : 'box';
    events(n, sr, p.density, env, R, (t, e) => {
      const f = p.pitch * Math.pow(2, (R() + R() - 1) * p.spread);
      const body = buildBody({ material: p.material, shape, size: Math.min(f, sr * 0.3), modes: 3, ring: 0.7, pos: R(), irregular: 0.8 }, sr, R);
      const a = Math.pow(p.pitch / f, 0.5) * (0.1 + 0.9 * R() * R()) * Math.pow(e, 0.3), tc = (0.00003 + 0.0003 * R()) * sr;
      strike(o, t, body, a, tc, sr);
      contactNoise(o, t, a * mat.grit, tc, mat.noiseHz * (0.6 + 0.8 * R()), sr, R);
    });
    return o;
  },
  sparks(p, n, sr, R) {
    const o = new Float32Array(n), env = rateEnvelope(p.shape, n, sr, R);
    events(n, sr, p.density, env, R, (t, e) => {
      const a = Math.min(1, 0.06 * Math.pow(1 - R() * 0.999, -0.8)) * (0.4 + 0.6 * e);
      o[t] += a; if (t + 1 < n) o[t + 1] -= a * 0.7;
      const f = p.pitch * Math.pow(2, (R() * 2 - 1) * p.spread * 0.5);
      if (f < sr * 0.45) strike(o, t, [{ f, tau: 0.001 + 0.006 * R(), g: 0.6 }, { f: f * (1.4 + R()), tau: 0.001 + 0.003 * R(), g: 0.4 }].filter(m => m.f < sr * 0.45), a * 0.6, 1, sr);
    });
    if (p.hiss > 0) {
      const flick = smoothRandom(n, 30, sr, R), hp = filterOnce(white(n, R), 'highpass', 3000, 0.7, sr);
      for (let i = 0; i < n; i++) hp[i] *= env[i] * (0.3 + 0.7 * flick[i]);
      addAt(o, hp, p.hiss / 100 * 0.5 * peakOf(o));
    }
    return o;
  },
  arc(p, n, sr, R) {
    const train = new Float32Array(n), inst = p.instab / 100;
    const gate = smoothRandom(n, 2 + 10 * inst, sr, R), flick = smoothRandom(n, 40, sr, R);
    let next = 0;
    for (let i = 0; i < n; i++) {
      if (i >= next) { train[i] = 0.5 + 0.5 * R(); next = i + Math.max(2, Math.round(sr / p.pitch * (1 + (R() - 0.5) * 0.04 * (1 + 4 * inst)))); }
    }
    const buzz = filterOnce(filterOnce(train, 'bandpass', 1800, 0.7, sr), 'lowpass', 9000, 0.7, sr);
    const hum = filterOnce(train, 'lowpass', p.pitch * 3, 0.9, sr);
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const g = inst > 0 ? clamp((gate[i] - inst * 0.45) / (1 - inst * 0.45), 0, 1) : 1;
      o[i] = (buzz[i] * 1.5 + hum[i]) * g * (0.75 + 0.25 * flick[i]);
    }
    if (p.crackle > 0) {
      const c = KIND.sparks({ ...p, density: 15 + 400 * p.crackle / 100, shape: 'random', pitch: 6000, spread: 2, hiss: 0 }, n, sr, R);
      addAt(o, c, p.crackle / 100 * 1.2 * peakOf(o));
    }
    if (p.hiss > 0) addAt(o, filterOnce(white(n, R), 'highpass', 4000, 0.7, sr).map((v, i) => v * gate[i]), p.hiss / 100 * 0.6 * peakOf(o));
    return o;
  },
  fire(p, n, sr, R) {
    const o = new Float32Array(n), lap = smoothRandom(n, 2.5, sr, R), lap2 = smoothRandom(n, 0.7, sr, R);
    const roar = filterOnce(brown(n, R), 'lowpass', 300, 0.8, sr);
    for (let i = 0; i < n; i++) roar[i] *= Math.pow(0.3 + 0.7 * lap[i] * lap2[i], 2);
    addAt(o, roar, p.roar / 100);
    const hiss = filterOnce(white(n, R), 'highpass', 2500, 0.7, sr), hm = smoothRandom(n, 6, sr, R);
    for (let i = 0; i < n; i++) hiss[i] *= 0.2 + 0.8 * hm[i] * hm[i];
    addAt(o, hiss, p.hiss / 100 * 0.35);
    const pops = new Float32Array(n), env = rateEnvelope('random', n, sr, R);
    events(n, sr, p.density, env, R, t => {
      const a = 0.2 + 0.8 * R() * R(), f = 700 + 2500 * R();
      strike(pops, t, [{ f, tau: 0.002 + 0.006 * R(), g: 1 }, { f: f * (1.6 + R()), tau: 0.002, g: 0.5 }], a, 1 + 3 * R(), sr);
      contactNoise(pops, t, a * 0.8, 2, 3000 + 3000 * R(), sr, R);
    });
    addAt(o, pops, p.crackle / 100);
    return o;
  },
  liquid(p, n, sr, R) {
    const o = new Float32Array(n), env = rateEnvelope(p.shape, n, sr, R), lo = Math.min(p.sizeMin, p.sizeMax), hi = Math.max(p.sizeMin, p.sizeMax);
    const rise = p.rise / 100 * 0.5;
    events(n, sr, p.density, env, R, (t, e) => {
      const r = lo + (hi - lo) * R() * R(), a = Math.pow(r / hi, 0.6) * (0.3 + 0.7 * R()) * (0.5 + 0.5 * e);
      bubble(o, t, r, a, rise * (0.5 + R()), sr);
      if (p.hiss > 0 && R() < 0.4) contactNoise(o, t, a * p.hiss / 100 * 0.5, 8, 2500 + 2500 * R(), sr, R);
    });
    return o;
  },
  rain(p, n, sr, R) {
    const o = new Float32Array(n), env = rateEnvelope('random', n, sr, R).map(v => 0.6 + 0.4 * v), hard = p.hard / 100;
    events(n, sr, p.density, env, R, t => {
      const a = 0.15 + 0.85 * R() * R();
      if (R() < hard) {
        const f = p.pitch * Math.pow(2, (R() * 2 - 1) * 1.2);
        strike(o, t, [{ f, tau: 0.002 + 0.004 * R(), g: 1 }, { f: f * 2.3, tau: 0.0015, g: 0.5 }].filter(m => m.f < sr * 0.45), a * 0.6, 1 + 2 * R(), sr);
        contactNoise(o, t, a * 0.3, 2, 5000, sr, R);
      } else if (R() < 0.35) bubble(o, t, 0.4 + 1.6 * R(), a * 0.7, 0.1 * (0.5 + R()), sr);
      else contactNoise(o, t, a * 0.35, 6, 2000 + 4000 * R(), sr, R);
    });
    if (p.hiss > 0) {
      const bg = filterOnce(pink(n, R), 'highpass', 500, 0.7, sr), m = smoothRandom(n, 0.3, sr, R);
      for (let i = 0; i < n; i++) bg[i] *= 0.7 + 0.3 * m[i];
      addAt(o, bg, p.hiss / 100 * 0.6 * (peakOf(o) || 1));
    }
    return o;
  },
  wind(p, n, sr, R) {
    const gust = p.gust / 100, slow = smoothRandom(n, 0.25, sr, R), fast = smoothRandom(n, 1.3, sr, R);
    const ctl = new Float32Array(n);
    for (let i = 0; i < n; i++) ctl[i] = clamp(0.65 * slow[i] + 0.35 * fast[i], 0, 1);
    const fc = i => p.pitch * Math.pow(2, (ctl[i] - 0.5) * 2.5 * gust);
    const src = pink(n, R);
    const band = sweepFilter(src, 'bandpass', fc, 1.1, sr), body = sweepFilter(src, 'lowpass', i => fc(i) * 1.5, 0.7, sr);
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) o[i] = (band[i] * 2 + body[i] * 0.6) * (1 - gust * 0.8 + gust * 0.8 * Math.pow(ctl[i], 1.5));
    if (p.whistle > 0) {
      const wh = sweepFilter(white(n, R), 'bandpass', i => fc(i) * 3.2, 30, sr);
      for (let i = 0; i < n; i++) wh[i] *= Math.pow(ctl[i], 2);
      addAt(o, wh, p.whistle / 100 * 0.7 * peakOf(o));
    }
    return o;
  },
  energy(p, n, sr, R) {
    const voices = Math.max(1, Math.round(p.voices)), o = new Float32Array(n), drift = smoothRandom(n, 0.4, sr, R);
    for (let v = 0; v < voices; v++) {
      const det = voices > 1 ? (v / (voices - 1) - 0.5) * 2 * p.detune : 0;
      let ph = R(), ph2 = R();
      for (let i = 0; i < n; i++) {
        const u = i / n, f = p.pitch * Math.pow(2, (det / 100 + p.sweep * u + (drift[i] - 0.5) * 0.08) / 12), dt = f / sr;
        ph += dt; ph -= Math.floor(ph); ph2 += dt * 0.5; ph2 -= Math.floor(ph2);
        let saw = 2 * ph - 1;
        if (ph < dt) { const t = ph / dt; saw -= t + t - t * t - 1; } else if (ph > 1 - dt) { const t = (ph - 1) / dt; saw -= t * t + t + t + 1; }
        o[i] += (0.55 * saw + 0.8 * Math.sin(TAU * ph) + 0.4 * Math.sin(TAU * ph2)) / voices;
      }
    }
    const lp = filterOnce(o, 'lowpass', Math.min(sr * 0.4, p.pitch * 8), 0.9, sr);
    if (p.hiss > 0) {
      const sh = new Float32Array(n), noise = white(n, R);
      for (const h of [2, 3, 5, 7]) {
        const b = sweepFilter(noise, 'bandpass', i => Math.min(sr * 0.45, p.pitch * h * Math.pow(2, p.sweep * i / n / 12)), 40, sr);
        for (let i = 0; i < n; i++) sh[i] += b[i];
      }
      addAt(lp, sh, p.hiss / 100 * 0.6 * peakOf(lp));
    }
    const depth = p.depth / 100;
    for (let i = 0; i < n; i++) lp[i] *= 1 - depth * (0.5 - 0.5 * Math.cos(TAU * p.rate * i / sr));
    if (p.crackle > 0) {
      const c = KIND.sparks({ ...p, density: 5 + 120 * p.crackle / 100, shape: 'random', pitch: 5000, spread: 2, hiss: 0 }, n, sr, R);
      addAt(lp, c, p.crackle / 100 * 0.8 * peakOf(lp));
    }
    return lp;
  },
  rumble(p, n, sr, R) {
    const gust = p.gust / 100, m = smoothRandom(n, 0.2, sr, R);
    const o = filterOnce(filterOnce(brown(n, R), 'lowpass', p.pitch, 0.7, sr), 'lowpass', p.pitch * 1.4, 0.6, sr);
    for (let i = 0; i < n; i++) o[i] *= 1 - gust * 0.85 + gust * 0.85 * m[i];
    if (p.thuds > 0) {
      const th = new Float32Array(n);
      events(n, sr, p.density, new Float32Array(n).fill(1), R, t => {
        const f0 = 35 + 40 * R(), dec = 0.25 + 0.8 * R(), a = 0.3 + 0.7 * R(), N = Math.min(n - t, Math.round(dec * 5 * sr));
        let ph = 0;
        for (let i = 0; i < N; i++) { const tt = i / sr; ph += TAU * f0 * (1 + 0.6 * Math.exp(-tt * 12)) / sr; th[t + i] += a * Math.sin(ph) * Math.exp(-tt / dec) * Math.min(1, i / (0.004 * sr)); }
      });
      addAt(o, filterOnce(th, 'lowpass', 180, 0.7, sr), p.thuds / 100 * 1.4 * peakOf(o));
    }
    return o;
  },
};

/**
 * Render a texture. Stereo output uses two independently seeded renders mixed by `width` (0 = mono).
 * Fades in and out, normalised to -1 dBFS.
 */
export function textureGen(p, sr) {
  const kind = KIND[p.kind] || KIND.particles, n = Math.max(16, Math.round(p.dur * sr));
  const seed = (p.seed | 0) * 7919;
  const a = kind(p, n, sr, rng(seed + 11));
  let ch;
  if (p.width > 0) {
    const b = kind(p, n, sr, rng(seed + 977)), w = p.width / 100, s = (1 - w) / 2, d = (1 + w) / 2;
    ch = [new Float32Array(n), new Float32Array(n)];
    for (let i = 0; i < n; i++) { ch[0][i] = a[i] * d + b[i] * s; ch[1][i] = b[i] * d + a[i] * s; }
  } else ch = [a];
  const fi = Math.min(n >> 1, Math.round(p.fadeIn / 1000 * sr)), fo = Math.min(n >> 1, Math.round(p.fadeOut / 1000 * sr));
  for (const c of ch) {
    for (let i = 0; i < fi; i++) c[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / fi);
    for (let i = 0; i < fo; i++) c[n - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / fo);
  }
  return matchPeak(ch, dbToLin(-1));
}
