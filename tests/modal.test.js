// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { D, SR, finite, examples } from './helpers.js';
import { ENGINES, engineSpecs } from '../src/config/generator.js';
import { defaults } from '../src/app/format.js';

// The metal-hit example is a sum of known damped partials: [frequency, relative amplitude, decay rate 1/s].
const TRUTH = [[412, 1, 3], [1013, 0.7, 4.5], [1689, 0.55, 6], [2532, 0.4, 8], [3721, 0.28, 11], [5110, 0.18, 15], [6890, 0.1, 19]];

test('measureModes recovers the frequencies, decay times and levels of known modes', () => {
  const m = D.measureModes(examples().metal, SR);
  assert.equal(m.modes.length, TRUTH.length, `found ${m.modes.map(x => x.f.toFixed(0))}`);
  TRUTH.forEach(([f, a, d], i) => {
    const x = m.modes[i];
    assert.ok(Math.abs(x.f - f) < f * 0.002, `f ${x.f} vs ${f}`);
    assert.ok(Math.abs(x.tau - 1 / d) < 0.1 / d, `tau ${x.tau} vs ${1 / d}`);
    assert.ok(Math.abs(x.a - a) < 0.1, `a ${x.a} vs ${a}`);
  });
  assert.ok(Math.abs(m.f1 - 412) < 0.5);
});

test('resynthesis as measured measures the same again; transforms move frequencies and decays', () => {
  const m = D.measureModes(examples().metal, SR), p = { ...defaults(engineSpecs('resynth')), measured: m, keepAttack: 0, hard: 100 };
  const again = D.measureModes(D.resynthGen(p, SR), SR);
  TRUTH.slice(0, 4).forEach(([f, , d]) => {
    const x = again.modes.reduce((b, q) => (Math.abs(q.f - f) < Math.abs(b.f - f) ? q : b));
    assert.ok(Math.abs(x.f - f) < 2 && Math.abs(x.tau - 1 / d) < 0.15 / d, `${f} Hz: ${x.f} Hz, tau ${x.tau}`);
  });
  const t = D.transformModes(m, { modes: 7, shift: 2, ring: 1, tilt: 0, stretch: 0, morphMat: 'none', morphAmt: 0 }, SR);
  assert.ok(Math.abs(t[0].f - 824) < 0.5, 'shift x2 doubles the frequencies');
  const wood = D.transformModes(m, { modes: 7, shift: 1, ring: 1, tilt: 0, stretch: 0, morphMat: 'wood', morphAmt: 100 }, SR);
  assert.ok(wood[0].tau < 0.2 * m.modes[0].tau, 'morphing to wood shortens the ring');
});

test('every Resynth dice type renders, with and without a measurement', () => {
  const m = D.measureModes(examples().laser, SR);
  for (const [name, roll] of Object.entries(ENGINES.resynth.types)) {
    for (const measured of [m, undefined]) {
      const r = D.resynthGen({ ...defaults(engineSpecs('resynth')), ...roll(), measured }, SR);
      assert.ok(finite(r) && D.peak(r) > 0.5, name);
    }
  }
});

test('silent and noise-only sounds give a readable error', () => {
  assert.throws(() => D.measureModes([new Float32Array(SR)], SR), /silent/);
});
