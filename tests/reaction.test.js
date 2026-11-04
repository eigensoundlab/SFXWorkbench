// SPDX-License-Identifier: Apache-2.0
// Reaction engine (src/dsp/reaction.js), drive curves, and the curve-following morph amount.
import test from 'node:test';
import assert from 'node:assert/strict';
import { D, SR, finite, examples } from './helpers.js';
import { engineSpecs } from '../src/config/generator.js';
import { MIX } from '../src/config/tools.js';
import { defaults } from '../src/app/format.js';

const base = defaults(engineSpecs('reaction'));
const rms = (c, a, b) => { let s = 0; for (let i = a; i < b; i++) s += c[i] * c[i]; return Math.sqrt(s / Math.max(1, b - a)); };
/** Drive at 100 Hz: 0 for 0.5 s, 1 for 0.5 s, 0 for 1 s. */
const step = () => Float32Array.from({ length: 200 }, (_, i) => (i >= 50 && i < 100 ? 1 : 0));

test('normalizeCurve maps the 5th..95th percentile to 0..1 and silence to 0', () => {
  const v = D.normalizeCurve([null, 0.2, 0.2, 0.4, 0.6, 0.6, NaN, undefined]);
  assert.deepEqual(Array.from(v), [0, 0, 0, 0.5, 1, 1, 0, 0]);
  assert.deepEqual(Array.from(D.normalizeCurve([0.3, 0.3, null])), [1, 1, 0]);
  assert.equal(D.normalizeCurve([]).length, 0);
});

test('levelCurve follows the level: quiet start, loud middle', () => {
  const x = new Float32Array(SR);
  for (let i = SR / 2; i < SR; i++) x[i] = 0.5 * Math.sin(i / 7);
  const { values, rate } = D.levelCurve([x], SR, 100);
  assert.equal(rate, 100);
  assert.equal(values.length, 100);
  assert.ok(values[20] === 0 && values[80] > 0.95, `${values[20]} ${values[80]}`);
});

test('reactionControl waits for the delay, rises fast and settles with the inertia', () => {
  const p = { lag: 100, thresh: 0, inertia: 200 }, c = D.reactionControl(step(), 100, p, 1000, 2000);
  assert.ok(c[590] < 1e-6, 'nothing before drive + delay');
  assert.ok(c[650] > 0.95, 'up within 50 ms');
  assert.ok(Math.abs(c[1300] - Math.exp(-1)) < 0.02, `one time constant after the drive stops: ${c[1300]}`);
  const slow = D.reactionControl(step(), 100, { ...p, inertia: 800 }, 1000, 2000);
  assert.ok(slow[1300] > c[1300] + 0.3, 'more inertia settles later');
  const thr = D.reactionControl(Float32Array.from({ length: 100 }, () => 0.4), 100, { lag: 0, thresh: 50, inertia: 50 }, 1000, 1000);
  assert.ok(thr.every(v => v === 0), 'drive below the threshold is ignored');
});

test('the medium sounds while the action pushes it and falls quiet after', () => {
  for (const kind of ['particles', 'liquid', 'wind', 'sparks', 'energy']) {
    const out = D.reactionGen({ ...base, kind, lag: 0, inertia: 50, driveCurve: step(), driveRate: 100 }, SR);
    const c = out[0];
    assert.ok(finite(out) && Math.abs(D.peak(out) - D.dbToLin(-1)) < 1e-3, kind);
    const on = rms(c, Math.round(0.6 * SR), Math.round(0.95 * SR)), before = rms(c, 0, Math.round(0.45 * SR)), after = rms(c, Math.round(1.4 * SR), Math.round(1.9 * SR));
    assert.ok(on > 30 * Math.max(before, after, 1e-9), `${kind}: ${on} vs ${before} / ${after}`);
  }
});

test('reaction: same seed same sound, no drive no sound, the action can be mixed in, demo drive without one', () => {
  const p = { ...base, driveCurve: step(), driveRate: 100 };
  assert.deepEqual(D.reactionGen(p, SR), D.reactionGen(p, SR));
  assert.equal(D.peak(D.reactionGen({ ...p, driveCurve: new Float32Array(200) }, SR)), 0);
  const act = examples().whoosh, mixed = D.reactionGen({ ...p, actionCh: act, action: 100 }, SR), plain = D.reactionGen(p, SR);
  assert.ok(D.len(mixed) >= D.len(act) && mixed.length === Math.max(plain.length, act.length));
  assert.notDeepEqual(mixed, plain);
  const demo = D.reactionGen(base, SR);
  assert.ok(finite(demo) && D.peak(demo) > 0.5);
});

test('textures follow a supplied event-rate envelope', () => {
  const tp = { kind: 'particles', material: 'stone', density: 400, shape: 'steady', pitch: 2000, spread: 1, dur: 1, fadeIn: 0, fadeOut: 0, width: 0, seed: 3 };
  const n = SR, half = Float32Array.from({ length: n }, (_, i) => (i < n / 2 ? 0 : 1));
  const c = D.textureGen({ ...tp, rateEnv: half }, SR)[0];
  assert.ok(rms(c, 0, n / 2 - 2400) < 1e-6, 'no events where the envelope is 0');
  assert.ok(rms(c, n / 2, n) > 0.01);
  assert.deepEqual(D.textureGen(tp, SR), D.textureGen({ ...tp, rateEnv: new Float32Array(10) }, SR), 'a wrong-length envelope is ignored');
});

test('morph amount follows a curve of A; even without one', () => {
  assert.equal(D.morphAmount({}, 0.3, 1), 0.3);
  const p = { curve: Float32Array.from([0, 1, 0.5]), curveRate: 10 };
  assert.equal(D.morphAmount(p, 0, 0.05), 0.5);
  assert.equal(D.morphAmount(p, 0, 0.2), 0.5);
  assert.equal(D.morphAmount(p, 0, 0.5), 0, 'after the end of A');
  const ex = examples(), A = ex.servo, B = D.mapChannels(ex.gunshot, A.length);
  const sp = { ...defaults(MIX.spectral.params), fft: '1024' }, ones = new Float32Array(400).fill(1);
  assert.deepEqual(D.MORPH.spectral(A, B, SR, { ...sp, curve: ones, curveRate: 100 }), D.MORPH.spectral(A, B, SR, { ...sp, t0: 100, t1: 100 }), 'curve at 1 = end amount throughout');
  const gp = defaults(MIX.grain.params);
  assert.deepEqual(D.MORPH.grain(A, B, SR, { ...gp, curve: new Float32Array(400), curveRate: 100 }), D.MORPH.grain(A, B, SR, { ...gp, bEnd: gp.bStart }), 'curve at 0 = start amount throughout');
});
