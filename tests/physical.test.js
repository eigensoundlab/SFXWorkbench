// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { D, SR, finite } from './helpers.js';

const base = { cause: 'hit', hard: 70, contact: 30, dur: 600, rough: 40, speed: 12, clicks: 8, accel: 60, material: 'steel', shape: 'plate',
  size: 500, modes: 12, ring: 1, pos: 25, irregular: 25, disp: 0, bounces: 0, gap: 140, restit: 55, roll: 0, debris: 0, debrisPitch: 4,
  spread: 600, debrisMat: 'same', rumble: 0, seed: 1 };

/** Dominant frequency by brute-force DFT over a band (coarse, for tests). */
function dominant(x, lo, hi, step = 5) {
  let best = 0, bf = 0; const n = Math.min(x.length, 16384);
  for (let f = lo; f <= hi; f += step) {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) { const w = 2 * Math.PI * f * i / SR; re += x[i] * Math.cos(w); im += x[i] * Math.sin(w); }
    const m = re * re + im * im; if (m > best) { best = m; bf = f; }
  }
  return bf;
}

test('a struck mode rings at its frequency and decays with its time constant', () => {
  const out = new Float32Array(SR);
  D.strike(out, 0, [{ f: 1000, tau: 0.1, g: 1, k: 0 }], 1, 1, SR);
  assert.ok(Math.abs(dominant(out, 900, 1100) - 1000) <= 5);
  const rms = (a, b) => Math.sqrt(out.subarray(a, b).reduce((s, v) => s + v * v, 0) / (b - a));
  const ratio = rms(4800, 9600) / rms(0, 4800);
  assert.ok(Math.abs(ratio - Math.exp(-1)) < 0.05, `decay ratio ${ratio}`);
});

test('the lowest mode of a body is its size, and harder material loss means shorter decay', () => {
  const R = D.rng(1);
  const steel = D.buildBody({ material: 'steel', shape: 'bar', size: 440, modes: 6, ring: 1, pos: 0.25, irregular: 0 }, SR, R);
  const wood = D.buildBody({ material: 'wood', shape: 'bar', size: 440, modes: 6, ring: 1, pos: 0.25, irregular: 0 }, SR, R);
  assert.equal(steel[0].f, 440);
  assert.ok(Math.abs(steel[1].f / steel[0].f - 2.756) < 1e-9);
  assert.ok(steel[0].tau > 5 * wood[0].tau);
});

test('every material and shape renders a finite impact', () => {
  for (const material of Object.keys(D.MATERIALS)) for (const shape of Object.keys(D.SHAPES)) {
    const r = D.impactGen({ ...base, material, shape, ring: 0.3 }, SR);
    assert.ok(finite(r) && D.peak(r) > 0.5, `${material}/${shape}`);
  }
});

test('bounces arrive with shrinking gaps', () => {
  const r = D.impactGen({ ...base, material: 'wood', shape: 'box', ring: 0.2, bounces: 5, gap: 200, restit: 60, contact: 0 }, SR)[0];
  const env = []; const hop = 240;
  for (let i = 0; i + hop < r.length; i += hop) env.push(r.subarray(i, i + hop).reduce((m, v) => Math.max(m, Math.abs(v)), 0));
  const onsets = [];
  for (let k = 1; k < env.length; k++) if (env[k] > 2.5 * env[k - 1] && env[k] > 0.02) { if (!onsets.length || k - onsets[onsets.length - 1] > 3) onsets.push(k); }
  assert.ok(onsets.length >= 4, `found ${onsets.length} onsets`);
  const gaps = onsets.slice(1).map((v, i) => v - onsets[i]);
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] <= gaps[i - 1] + 1, `gaps ${gaps}`);
});

test('dispersion delays low frequencies more than high ones', () => {
  const x = new Float32Array(2000); x[0] = 1;
  const y = D.disperseMono(x, SR, 0.9, 200, 0);
  // Energy centre of the first 40 ms vs the 40-80 ms window: the later part must be lower in pitch.
  const zc = (a, b) => { let z = 0; for (let i = a + 1; i < b; i++) if ((y[i - 1] < 0) !== (y[i] < 0)) z++; return z / (b - a); };
  assert.ok(zc(0, 960) > 2 * zc(1920, 3840), `zero-crossing rates ${zc(0, 960)} vs ${zc(1920, 3840)}`);
  assert.ok(finite([y]));
});

test('resonator and dispersion effects keep the input length at least and stay finite', () => {
  const src = [new Float32Array(4800).map((_, i) => (i % 1200 === 0 ? 1 : 0))];
  for (const [k, p] of [['resonate', { material: 'glass', shape: 'shell', size: 1500, modes: 10, ring: 0.5, pos: 25, mix: 80 }], ['disperse', { amount: 80, stages: 150, fb: 40, delay: 30, mix: 60 }]]) {
    const r = D.FX[k](src, SR, p);
    assert.ok(finite(r) && r[0].length >= 4800, k);
  }
});

test('a bubble starts at the Minnaert frequency and rises in pitch', () => {
  const out = new Float32Array(SR / 10);
  D.bubble(out, 0, 3, 1, 0.2, SR); // 3 mm radius -> 3260 / 3 = 1087 Hz
  const zcRate = (a, b) => { let z = 0; for (let i = a + 1; i < b; i++) if (out[i - 1] < 0 && out[i] >= 0) z++; return z / ((b - a) / SR); };
  const early = zcRate(0, 480), late = zcRate(960, 1920);
  assert.ok(Math.abs(early - 1087) < 120, `early ${early} Hz`);
  assert.ok(late > early * 1.02, `late ${late} Hz should be above early ${early} Hz`);
});

test('textures are stereo when width > 0 and mono at 0', () => {
  const p = { kind: 'wind', dur: 0.5, fadeIn: 10, fadeOut: 10, width: 50, seed: 2, pitch: 400, gust: 50, whistle: 20 };
  assert.equal(D.textureGen(p, SR).length, 2);
  assert.equal(D.textureGen({ ...p, width: 0 }, SR).length, 1);
});
