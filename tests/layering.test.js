// SPDX-License-Identifier: Apache-2.0
// Layer stack DSP: the plain mix is unchanged, hits line up (shift and polarity), and the low end stops cancelling.
import test from 'node:test';
import assert from 'node:assert/strict';
import { D, SR, finite, examples } from './helpers.js';

const ex = examples();
// a sub hit: a 60 Hz sine with a fast attack and a 0.25 s decay, starting at `at` seconds
function sub(at, seconds = 0.8, f = 60, amp = 0.6) {
  const n = Math.round(seconds * SR), o = new Float32Array(n), a = Math.round(at * SR);
  for (let i = a; i < n; i++) { const t = (i - a) / SR; o[i] = amp * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.25) * Math.min(1, t / 0.002); }
  return [o];
}
const lay = (ch, extra) => ({ ch, sr: SR, offset: 0, gain: 0, pitch: 0, reverse: false, pan: 0, ...extra });
const rms = (c, a = 0, b = c.length) => { let s = 0; for (let i = a; i < b; i++) s += c[i] * c[i]; return Math.sqrt(s / Math.max(1, b - a)); };

test('the layer mix places, pans and keeps its result without low-end alignment', () => {
  const r = D.layerMix([lay(ex.whoosh, { gain: -10, reverse: true }), { ch: ex.metal, sr: 44100, offset: 900, gain: -8, pitch: -5, reverse: false, pan: -0.3 }], SR);
  assert.equal(r.length, 2);
  assert.ok(r[0].length > 0.9 * SR + ex.metal[0].length && finite(r));
  // polarity -1 inverts a layer exactly
  const a = D.layerMix([lay(ex.gunshot)], SR), b = D.layerMix([lay(ex.gunshot, { polarity: -1 })], SR);
  assert.ok(a[0].every((v, i) => v === -b[0][i]));
});

test('onsets are found where the level jumps', () => {
  const on = D.layerOnsets(sub(0.1), SR);
  assert.ok(on.length >= 1 && Math.abs(on[0] - 0.1 * SR) < 0.004 * SR, String(on));
  assert.equal(D.layerOnsets([new Float32Array(SR)], SR).length, 0);
});

test('align hits finds the shift and polarity that make two sub layers add', () => {
  // the second layer starts 2 ms late and inverted: in a plain sum the two largely cancel in the low end
  const L = [lay(sub(0.1)), lay(sub(0.102).map(c => c.map(v => -v)), { gain: -1 })];
  const r = D.alignHits(L, SR);
  assert.equal(r[0].shift, 0); assert.equal(r[0].ref, 0);
  assert.ok(Math.abs(r[1].shift + 2) < 0.3, 'shift ' + r[1].shift);
  assert.equal(r[1].polarity, -1); assert.equal(r[1].band, 'low');
  assert.ok(r[1].gainDb > 6, 'gain ' + r[1].gainDb);
  const plain = D.layerMix(L, SR), fixed = D.layerMix(L.map((l, k) => ({ ...l, offset: l.offset + r[k].shift, polarity: r[k].polarity })), SR);
  assert.ok(rms(fixed[0]) > 2 * rms(plain[0]), `${rms(fixed[0])} vs ${rms(plain[0])}`);
});

test('low-end alignment repairs cancellation without boosting or touching the highs', () => {
  // two subs a half period apart (8.3 ms at 60 Hz) cancel; each also carries a click well above the cutoff
  const click = at => { const o = new Float32Array(Math.round(0.8 * SR)); const a = Math.round(at * SR); for (let i = 0; i < 48; i++) o[a + i] = 0.3 * Math.sin(i * 2.1); return o; };
  const A = sub(0.1)[0].map((v, i) => v + click(0.1)[i]), B = sub(0.1 + 1 / 120)[0].map((v, i) => v + click(0.3)[i]);
  const L = [lay([A]), lay([B])];
  const plain = D.layerMix(L, SR)[0], al = D.layerMix(L, SR, { lowAlign: 200 })[0];
  const win = [Math.round(0.15 * SR), Math.round(0.5 * SR)];
  const pPlain = rms(plain, ...win), pAl = rms(al, ...win), pSum = Math.hypot(rms(A, ...win), rms(B, ...win));
  assert.ok(pAl > 2 * pPlain, `aligned ${pAl} vs plain ${pPlain}`);
  assert.ok(pAl <= pSum * 1.1, `aligned ${pAl} vs power sum ${pSum}`);
  // before the first hit nothing appears (no pre-echo louder than -40 dB re the hit)
  assert.ok(rms(al, 0, Math.round(0.08 * SR)) < 0.01 * pAl, 'pre-echo');
  // the clicks (high band) are as in the plain sum
  const hp = x => { const o = new Float32Array(x.length); for (let i = 1; i < x.length; i++) o[i] = x[i] - x[i - 1]; return o; };
  const c0 = Math.round(0.3 * SR), c1 = c0 + 200;
  assert.ok(Math.abs(rms(hp(al), c0, c1) / rms(hp(plain), c0, c1) - 1) < 0.05);
  // layers that do not cancel are left about as they are
  const one = D.layerMix([lay(sub(0.1)), lay(ex.gunshot)], SR), oneA = D.layerMix([lay(sub(0.1)), lay(ex.gunshot)], SR, { lowAlign: 200 });
  assert.ok(Math.abs(rms(oneA[0]) / rms(one[0]) - 1) < 0.1 && finite(oneA));
});
