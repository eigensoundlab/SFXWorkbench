// SPDX-License-Identifier: Apache-2.0
/**
 * Physical modelling of struck, scraped, rolled and breaking objects.
 *
 * An impact is described as cause -> object -> aftermath:
 *   cause      how energy enters the object (hit, scrape, roll, crack)
 *   object     a modal body: a set of damped resonant modes from a material and a shape
 *   aftermath  what follows: bounces, rolling out, debris, low rumble
 * Dispersion (a chain of all-pass filters) can be applied to the result; it turns clicks into the
 * descending "pew" heard from struck wires, springs and cracking ice.
 *
 * Mode decay follows a simple loss model: 1/tau = pi * f * eta + delta, where eta is the material loss
 * factor (internal friction) and delta a frequency-independent loss (radiation, mounting). Values are
 * tuned by ear, not measured. See docs/DSP.md for references.
 */
import { TAU, clamp, rng, matchPeak, dbToLin, trimTail } from './core.js';
import { biquad } from './filters.js';

/** Material constants. eta: loss factor, delta: constant loss (1/s), noiseHz: centre of the contact noise. */
export const MATERIALS = {
  steel: { name: 'Steel', eta: 0.0005, delta: 0.6, noiseHz: 7000, grit: 0.15 },
  brass: { name: 'Brass', eta: 0.0011, delta: 1.0, noiseHz: 6000, grit: 0.15 },
  aluminium: { name: 'Aluminium', eta: 0.0016, delta: 1.6, noiseHz: 6500, grit: 0.2 },
  glass: { name: 'Glass', eta: 0.0012, delta: 1.2, noiseHz: 8000, grit: 0.1 },
  ceramic: { name: 'Ceramic', eta: 0.004, delta: 3, noiseHz: 5000, grit: 0.2 },
  ice: { name: 'Ice', eta: 0.003, delta: 2, noiseHz: 6000, grit: 0.25 },
  wood: { name: 'Wood', eta: 0.018, delta: 6, noiseHz: 2500, grit: 0.45 },
  plastic: { name: 'Plastic', eta: 0.035, delta: 10, noiseHz: 3000, grit: 0.4 },
  stone: { name: 'Stone / concrete', eta: 0.03, delta: 14, noiseHz: 3500, grit: 0.8 },
  cardboard: { name: 'Cardboard', eta: 0.09, delta: 25, noiseHz: 1800, grit: 0.7 },
  rubber: { name: 'Rubber', eta: 0.14, delta: 30, noiseHz: 900, grit: 0.3 },
};

const BAR = [1, 2.756, 5.404, 8.933, 13.345, 18.638, 24.81, 31.87, 39.81, 48.62, 58.3, 68.9];
const PLATE = (() => {
  const a = [];
  for (let m = 1; m <= 8; m++) for (let n = 1; n <= 8; n++) a.push(m * m + (n / 1.37) ** 2);
  a.sort((x, y) => x - y);
  return a.map(v => v / a[0]);
})();
const MEMBRANE = [1, 1.593, 2.135, 2.295, 2.653, 2.917, 3.155, 3.5, 3.598, 3.647, 4.059, 4.131, 4.23, 4.601, 4.61, 4.903];
const RING = (() => { const r = []; for (let n = 2; n < 16; n++) r.push(n * (n * n - 1) / Math.sqrt(n * n + 1)); return r.map(v => v / r[0]); })();
const BELL = [0.5, 1, 1.183, 1.506, 2, 2.514, 2.662, 3.011, 4.166, 5.433, 6.796, 8.215];

/**
 * Mode-frequency ratios per shape. ratios(n, R) returns at least n ratios (R: seeded random 0..1).
 * bar: free-free beam. plate: rectangular plate (aspect 1.37). membrane: circular (Bessel zeros).
 * shell: ring modes n(n^2-1)/sqrt(n^2+1), each split into a close pair as in real, slightly uneven casings.
 * bell: classic church-bell partials. wire: stiff string with inharmonicity. box: dense irregular body.
 */
export const SHAPES = {
  bar: { name: 'Bar / pipe', ratios: n => BAR.slice(0, n) },
  plate: { name: 'Plate / panel', ratios: n => PLATE.slice(0, n) },
  membrane: { name: 'Membrane / drum head', ratios: n => MEMBRANE.slice(0, n) },
  shell: { name: 'Shell / casing', ratios: (n, R) => RING.flatMap(r => [r, r * (1.002 + 0.008 * R())]).slice(0, n) },
  bell: { name: 'Bell', ratios: n => BELL.slice(0, n) },
  wire: { name: 'Wire / string', ratios: n => Array.from({ length: n }, (_, k) => (k + 1) * Math.sqrt(1 + 0.0006 * (k + 1) ** 2) / Math.sqrt(1.0006)) },
  box: { name: 'Box / hollow body', ratios: (n, R) => { const a = [1]; while (a.length < n) a.push(a[a.length - 1] + 0.25 + 0.6 * R()); return a; } },
};

/**
 * Build the modes of a body.
 * @param {{material:string, shape:string, size:number, modes:number, ring:number, pos:number, irregular:number}} b
 *   size: lowest mode in Hz. ring: decay multiplier. pos: strike position 0..1. irregular: 0..1 random deviation.
 * @returns {{f:number, tau:number, g:number}[]}
 */
export function buildBody(b, sr, R) {
  const mat = MATERIALS[b.material] || MATERIALS.steel, shape = SHAPES[b.shape] || SHAPES.plate;
  const n = Math.max(1, Math.round(b.modes)), irr = clamp(b.irregular, 0, 1), pos = clamp(b.pos, 0.01, 0.99);
  const ratios = shape.ratios(n, R), modes = [];
  for (let k = 0; k < ratios.length; k++) {
    const f = b.size * ratios[k] * (1 + irr * 0.05 * (R() * 2 - 1));
    if (f >= sr * 0.45 || f < 15) continue;
    const tau = b.ring / (Math.PI * f * mat.eta + mat.delta);
    modes.push({ f, tau, k, g: modeGain(k, pos, irr, R) });
  }
  return modes;
}

/** Gain of mode k when struck at position pos (0..1): mode-shape factor times a gentle high-mode roll-off. */
function modeGain(k, pos, irr, R) {
  const shapeGain = 0.15 + 0.85 * Math.abs(Math.sin(Math.PI * (k + 1) * pos + irr * R()));
  return Math.max(0.02, shapeGain / Math.pow(1 + k, 0.3) * (1 + irr * 0.6 * (R() * 2 - 1)));
}

/** Same body struck somewhere else: frequencies and decays stay, mode gains change. */
export function restrike(modes, pos, irr, R) {
  pos = clamp(pos, 0.01, 0.99); irr = clamp(irr, 0, 1);
  // Measured bodies keep their measured gains (gm) and only get a mode-shape weighting for the new position.
  return modes.map(m => ({ ...m, g: m.gm != null ? m.gm * (0.35 + 0.65 * Math.abs(Math.sin(Math.PI * (m.k + 1) * pos + irr * R()))) : modeGain(m.k, pos, irr, R) }));
}

/** Longest decay time in a set of modes. */
export const maxTau = modes => modes.reduce((m, x) => Math.max(m, x.tau), 0);

/** Half-sine contact pulse with unit area; its length (contact time) sets how bright the strike is. */
function contactPulse(tcSamples) {
  const L = Math.max(1, Math.round(tcSamples)), e = new Float64Array(L);
  let s = 0;
  for (let i = 0; i < L; i++) { e[i] = Math.sin(Math.PI * (i + 0.5) / L); s += e[i]; }
  for (let i = 0; i < L; i++) e[i] /= s;
  return e;
}

/**
 * Add the response of `modes` to one strike into `out` (mono, mutated) at sample t0.
 * Each mode is a two-pole resonator whose impulse response is a unit-amplitude damped sine,
 * so a short strike gives each mode amplitude amp * g, and longer contact times roll off high modes.
 */
export function strike(out, t0, modes, amp, tcSamples, sr) {
  t0 = Math.round(t0);
  if (t0 < 0 || t0 >= out.length || amp <= 0) return;
  const e = contactPulse(tcSamples), L = e.length;
  for (const m of modes) {
    const w = TAU * m.f / sr, r = Math.exp(-1 / (m.tau * sr)), b1 = 2 * r * Math.cos(w), b2 = -r * r, gin = Math.sin(w) * m.g * amp;
    const N = Math.min(out.length - t0, L + Math.ceil(7 * m.tau * sr));
    let y1 = 0, y2 = 0;
    for (let i = 0; i < N; i++) {
      const y = b1 * y1 + b2 * y2 + (i < L ? e[i] * gin : 0);
      y2 = y1; y1 = y; out[t0 + i] += y;
    }
  }
}

/** Short band-passed noise burst at the contact point (grit, crunch, the "tick" of a hard hit). */
export function contactNoise(out, t0, amp, tcSamples, hz, sr, R) {
  t0 = Math.round(t0);
  if (t0 < 0 || t0 >= out.length || amp <= 0) return;
  const L = Math.min(out.length - t0, Math.round(tcSamples * 3 + 0.004 * sr)), k = biquad('bandpass', hz, 0.9, sr);
  let z1 = 0, z2 = 0;
  for (let i = 0; i < L; i++) {
    const x = (R() * 2 - 1) * amp * Math.exp(-5 * i / L), y = k[0] * x + z1;
    z1 = k[1] * x - k[3] * y + z2; z2 = k[2] * x - k[4] * y;
    out[t0 + i] += y * 2.5;
  }
}

/** Run a whole excitation signal through a modal body (sum of resonators). Output is extended by `tail` samples. */
export function resonateMono(x, modes, sr, tail = 0) {
  const n = x.length + tail, out = new Float32Array(n);
  for (const m of modes) {
    const w = TAU * m.f / sr, r = Math.exp(-1 / (m.tau * sr)), b1 = 2 * r * Math.cos(w), b2 = -r * r, gin = Math.sin(w) * m.g;
    let y1 = 0, y2 = 0;
    for (let i = 0; i < n; i++) {
      const y = b1 * y1 + b2 * y2 + (i < x.length ? x[i] * gin : 0);
      y2 = y1; y1 = y; out[i] += y;
    }
  }
  return out;
}

/**
 * Dispersion: a cascade of first-order all-pass filters, optionally inside a feedback loop (spring).
 * Low frequencies are delayed more than high ones, so a click becomes a descending chirp.
 * @param {Float32Array} x  mono input
 * @param {number} amount   0..1, sets the all-pass coefficient (a = -(0.5 + 0.47 * amount))
 * @param {number} stages   number of all-pass sections (more = longer chirp)
 * @param {number} fb       feedback 0..0.95 (repeats, like a spring reverb)
 * @param {number} delayMs  loop delay
 * @returns {Float32Array} longer than the input by the estimated tail
 */
export function disperseMono(x, sr, amount, stages, fb = 0, delayMs = 30) {
  const a = -(0.5 + 0.47 * clamp(amount, 0, 1)), N = Math.max(1, Math.round(stages));
  const groupDc = N * (1 - a) / (1 + a), D = Math.max(1, Math.round(delayMs * sr / 1000));
  const repeats = fb > 0.001 ? Math.ceil(Math.log(0.001) / Math.log(fb)) : 0;
  const tail = Math.min(10 * sr, Math.round(groupDc * 1.3 + (groupDc + D) * repeats));
  const n = x.length + tail, out = new Float32Array(n);
  const xp = new Float64Array(N), yp = new Float64Array(N), loop = new Float32Array(D);
  let li = 0, lp = 0;
  for (let i = 0; i < n; i++) {
    let v = (i < x.length ? x[i] : 0) + fb * loop[li];
    for (let s = 0; s < N; s++) { const y = a * v + xp[s] - a * yp[s]; xp[s] = v; yp[s] = y; v = y; }
    lp += 0.6 * (v - lp);
    loop[li] = lp; li = (li + 1) % D;
    out[i] = v;
  }
  return out;
}

/* ---------- excitation signals for continuous causes ---------- */

function scrapeExcitation(n, sr, p, R) {
  const x = new Float32Array(n), rough = p.rough / 100, fc = Math.min(0.45 * sr, 0.35 / Math.max(1e-5, p.tc));
  const k = biquad('lowpass', fc, 0.707, sr), att = Math.round(0.02 * sr), rel = Math.round(0.08 * sr);
  let z1 = 0, z2 = 0, slip = 0, press = 0.6;
  for (let i = 0; i < n; i++) {
    if (i % 256 === 0) press += 0.15 * (R() - 0.5) - 0.05 * (press - 0.7);
    if (R() < (40 + 260 * rough) / sr) slip = (0.3 + R()) * rough * 6;
    slip *= 0.92;
    const s = (R() * 2 - 1) * (1 - rough * 0.6) + slip * (R() * 2 - 1);
    const y = k[0] * s + z1; z1 = k[1] * s - k[3] * y + z2; z2 = k[2] * s - k[4] * y;
    x[i] = y * Math.max(0, press) * Math.min(1, i / att, (n - i) / rel) * 0.02;
  }
  return x;
}

function rollExcitation(n, sr, p, R, speedHz) {
  const x = new Float32Array(n), rel = Math.round(0.1 * sr);
  let next = 0, ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n, sp = speedHz * (1 - 0.65 * u), env = Math.min(1, i / (0.01 * sr), (n - i) / rel) * (1 - 0.5 * u);
    ph += sp / sr;
    if (i >= next) { x[i] += (0.3 + 0.7 * R()) * env * 0.5; next = i + Math.round(sr / Math.max(1, sp) * (0.8 + 0.4 * R())); }
    x[i] += (R() * 2 - 1) * 0.004 * env * (0.6 + 0.4 * Math.abs(Math.sin(TAU * ph)));
  }
  return x;
}

/**
 * Render an impact (cause -> object -> aftermath) as mono audio normalised to -1 dBFS.
 * Parameter keys and ranges: see the 'impact' engine in src/config/generator.js.
 */
export function impactGen(p, sr) {
  const R = rng((p.seed | 0) * 2654435761 + 17);
  const mat = MATERIALS[p.material] || MATERIALS.steel;
  const tc = 0.01 * Math.pow(0.002, clamp(p.hard / 100, 0, 1));
  const tcS = tc * sr;
  const body = { material: p.material, shape: p.shape, size: p.size, modes: p.modes, ring: p.ring, pos: p.pos / 100, irregular: p.irregular / 100 };
  // p._modes: a ready-made body (measured by modal resynthesis) replaces the material/shape body.
  const main = p._modes ? p._modes.map(m => ({ ...m })) : buildBody(body, sr, R), tauMax = maxTau(main);
  const contact = p.contact / 100 * (0.3 + mat.grit);
  const dur = p.dur / 1000, spread = p.spread / 1000, rumbleDecay = 0.2 + 0.9 * p.rumble / 100;
  const disp = p.disp / 100, stages = Math.round(40 + 360 * disp);

  // Timeline of the cause.
  const t0 = Math.round(0.004 * sr);
  let breakAt = t0, events = [];
  if (p.cause === 'crack') {
    const C = Math.max(2, Math.round(p.clicks)), q = 1 - 0.85 * p.accel / 100;
    const g0 = Math.abs(q - 1) < 1e-6 ? dur / C : dur * (1 - q) / (1 - Math.pow(q, C - 1));
    let t = 0;
    for (let k = 0; k < C; k++) {
      const last = k === C - 1, grow = (k + 1) / C;
      events.push({ t: t0 + t * sr, amp: last ? 1 : (0.08 + 0.45 * grow) * (0.4 + 0.6 * R()), tc: tcS * 0.4, pos: 0.05 + 0.9 * R() });
      t += g0 * Math.pow(q, k) * (0.75 + 0.5 * R());
    }
    breakAt = events[events.length - 1].t;
  } else if (p.cause === 'hit') {
    events.push({ t: t0, amp: 1, tc: tcS, pos: p.pos / 100 });
  }

  // Aftermath: bounces after the main hit (or after the final crack).
  let lastT = breakAt;
  if (p.bounces > 0 && p.cause !== 'scrape' && p.cause !== 'roll') {
    const e = p.restit / 100;
    let t = breakAt, gap = p.gap / 1000 * sr, amp = 1;
    for (let k = 0; k < p.bounces; k++) {
      t += gap * (0.9 + 0.2 * R());
      amp *= e * (0.85 + 0.3 * R());
      gap *= e;
      if (gap < 0.003 * sr || amp < 0.01) break;
      events.push({ t, amp: Math.min(1, amp), tc: tcS * (1 + 0.5 * (1 - amp)), pos: 0.08 + 0.84 * R() });
      lastT = t;
    }
  }

  const rollDur = p.roll / 100 * 1.2;
  const contDur = p.cause === 'scrape' || p.cause === 'roll' ? dur : 0;
  const total = Math.min(10 * sr, Math.round(lastT + contDur * sr + rollDur * sr + Math.max(7 * tauMax * sr, 0.05 * sr)
    + (p.debris > 0 ? spread * 1.6 * sr + 0.3 * sr : 0) + (p.rumble > 0 ? rumbleDecay * 5 * sr : 0) + 0.05 * sr));
  const out = new Float32Array(Math.max(16, total));

  for (const ev of events) {
    const modes = Math.abs(ev.pos - p.pos / 100) < 1e-9 ? main : restrike(main, ev.pos, body.irregular, R);
    strike(out, ev.t, modes, ev.amp, ev.tc, sr);
    contactNoise(out, ev.t, ev.amp * contact * 0.6, ev.tc, mat.noiseHz, sr, R);
  }

  // Continuous causes drive the body for their whole duration.
  if (p.cause === 'scrape' || p.cause === 'roll') {
    const n = Math.round(dur * sr);
    const exc = p.cause === 'scrape' ? scrapeExcitation(n, sr, { rough: p.rough, tc }, R) : rollExcitation(n, sr, p, R, p.speed);
    const res = resonateMono(exc, main, sr, Math.round(Math.min(5, 7 * tauMax) * sr));
    const noiseMix = contact * (p.cause === 'scrape' ? 6 : 2);
    for (let i = 0; i < res.length && t0 + i < out.length; i++) out[t0 + i] += res[i] + (i < n ? exc[i] * noiseMix : 0);
    lastT = t0 + n;
  }

  // Rolling out after the bounces (shells, coins, bottles).
  if (rollDur > 0.02) {
    const n = Math.round(rollDur * sr), exc = rollExcitation(n, sr, p, R, 14 + 20 * R());
    const res = resonateMono(exc, main.map(m => ({ ...m, g: m.g * 0.35 })), sr, Math.round(Math.min(2, 5 * tauMax) * sr));
    const at = Math.round(lastT + 0.01 * sr);
    for (let i = 0; i < res.length && at + i < out.length; i++) out[at + i] += res[i];
  }

  // Debris: many small fragments, mostly early, smaller ones higher and quieter.
  if (p.debris > 0) {
    const dm = p.debrisMat === 'same' ? p.material : p.debrisMat, dmat = MATERIALS[dm] || mat;
    const count = Math.round(4 + 300 * Math.pow(p.debris / 100, 2));
    const dshape = ['steel', 'brass', 'aluminium', 'glass', 'ceramic', 'ice'].includes(dm) ? 'plate' : 'box';
    for (let k = 0; k < count; k++) {
      const dt = Math.min(1.6 * spread, -spread / 3 * Math.log(1 - R() * 0.999)) + 0.004 + 0.02 * R();
      const f = p.size * p.debrisPitch * Math.pow(2, (R() + R() + R() - 1.5) * 1.4);
      const fr = buildBody({ material: dm, shape: dshape, size: Math.min(f, sr * 0.3), modes: 3 + Math.floor(R() * 3), ring: p.ring * 0.6, pos: R(), irregular: 0.7 }, sr, R);
      const a = 0.55 * Math.pow(p.size * p.debrisPitch / f, 0.6) * (0.15 + 0.85 * R() * R()) * Math.exp(-dt / Math.max(0.05, spread));
      const at = breakAt + dt * sr, tcd = (0.00003 + 0.0003 * R()) * sr;
      strike(out, at, fr, a, tcd, sr);
      contactNoise(out, at, a * dmat.grit * 0.9, tcd, dmat.noiseHz * (0.7 + 0.6 * R()), sr, R);
    }
  }

  let res = [out];
  if (disp > 0) {
    const wet = disperseMono(out, sr, disp, stages, 0, 30), mixW = Math.min(1, disp / 0.4), dry = 1 - 0.85 * mixW;
    const pk = Math.max(1e-9, out.reduce((m, v) => Math.max(m, Math.abs(v)), 0)), wpk = Math.max(1e-9, wet.reduce((m, v) => Math.max(m, Math.abs(v)), 0));
    const o = new Float32Array(wet.length);
    for (let i = 0; i < wet.length; i++) o[i] = (i < out.length ? out[i] * dry : 0) + wet[i] * (pk / wpk) * mixW;
    res = [o];
  }

  // Rumble: low, slowly decaying noise for weight (collapses, explosions, heavy falls).
  if (p.rumble > 0) {
    const o = res[0], start = Math.round(breakAt), n = o.length - start;
    const lp = biquad('lowpass', 110, 0.7, sr), lp2 = biquad('lowpass', 160, 0.6, sr);
    let b = 0, z1 = 0, z2 = 0, w1 = 0, w2 = 0, pk = 0;
    const r = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      b = 0.995 * b + (R() * 2 - 1) * 0.1;
      let y = lp[0] * b + z1; z1 = lp[1] * b - lp[3] * y + z2; z2 = lp[2] * b - lp[4] * y;
      const yy = lp2[0] * y + w1; w1 = lp2[1] * y - lp2[3] * yy + w2; w2 = lp2[2] * y - lp2[4] * yy;
      r[i] = yy * Math.min(1, i / (0.03 * sr)) * Math.exp(-i / (rumbleDecay * sr));
      pk = Math.max(pk, Math.abs(r[i]));
    }
    const opk = o.reduce((m, v) => Math.max(m, Math.abs(v)), 0), g = pk > 0 ? (p.rumble / 100) * 0.9 * opk / pk : 0;
    for (let i = 0; i < n; i++) o[start + i] += r[i] * g;
  }

  return trimTail(matchPeak(res, dbToLin(-1)), Math.round(0.02 * sr), 3e-4);
}
