// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { D, SR, finite, examples } from './helpers.js';
import { ACCENT_SPECS, ACCENT_RECIPES, ACCENT_NAMES, SLOTS } from '../src/config/accents.js';
import { defaults } from '../src/app/format.js';

/** Three decaying 220 Hz tone hits at 0.1, 0.5 and 0.9 s in 1.6 s of audio. */
function threeHits() {
  const x = new Float32Array(SR * 1.6);
  for (const t0 of [0.1, 0.5, 0.9]) for (let i = 0; i < SR * 0.35; i++) {
    const t = i / SR; x[Math.round(t0 * SR) + i] += 0.6 * Math.sin(2 * Math.PI * 220 * t) * Math.exp(-t * 9) * Math.min(1, t / 0.003);
  }
  return [x];
}
const slot = o => ({ on: true, ...defaults(ACCENT_SPECS), ...o });

test('structure analysis finds onset, transients and pitch of a known signal', () => {
  const a = D.analyzeStructure(threeHits(), SR);
  assert.ok(Math.abs(a.onset / SR - 0.1) < 0.006, `onset ${a.onset / SR}`);
  assert.deepEqual(a.transients.map(t => Math.round(t.at / SR * 10) / 10), [0.1, 0.5, 0.9]);
  assert.ok(Math.abs(a.pitch - 220) < 1, `pitch ${a.pitch}`);
  assert.ok(a.peakAt > a.onset && a.bodyEnd > a.peakAt && a.tailEnd > a.bodyEnd);
  assert.ok(a.flatness < 0.1);
});

test('inharmonic and noisy sounds get no pitch, but still a usable key', () => {
  const ex = examples();
  const metal = D.analyzeStructure(ex.metal, SR), gun = D.analyzeStructure(ex.gunshot, SR);
  assert.equal(metal.pitch, null);
  assert.ok(Math.abs(D.soundKey(metal) - 412) < 10, `metal key ${D.soundKey(metal)}`);
  assert.equal(gun.pitch, null);
  assert.ok(gun.flatness > 0.3 && D.soundKey(gun) > 60);
});

test('accents land on their anchors; lead-ins end at the anchor and extend the start', () => {
  const src = threeHits(), a = D.analyzeStructure(src, SR);
  const each = D.renderAccents(src, SR, [slot({ kind: 'sub', anchor: 'each', level: -12 })], { analysis: a });
  assert.equal(each.marks.length, 3);
  each.marks.forEach((m, i) => assert.equal(m.start, a.transients[i].at));
  const off = D.renderAccents(src, SR, [slot({ kind: 'click', anchor: 'end', offset: 100 })], { analysis: a });
  assert.equal(off.marks[0].start, a.tailEnd + Math.round(0.1 * SR));
  const sw = D.renderAccents(src, SR, [slot({ kind: 'whoosh', anchor: 'start', dur: 400 })], { analysis: a });
  assert.equal(sw.marks[0].start + sw.marks[0].len, a.onset + sw.lead);
  assert.ok(sw.lead > 0 && sw.ch[0].length >= src[0].length + sw.lead);
});

test('the source is kept intact under the accents and the peak stays at or below -1 dBFS', () => {
  const src = threeHits(), r = D.renderAccents(src, SR, [slot({ kind: 'hit', anchor: 'end', level: 0 })], {});
  assert.ok(D.peak(r.ch) <= D.dbToLin(-1) + 1e-6);
  const quiet = D.renderAccents(src, SR, [slot({ kind: 'hit', anchor: 'end', level: -30 })], { safe: false });
  for (let i = 0; i < src[0].length; i += 997) if (i < quiet.marks[0].start) assert.equal(quiet.ch[0][i], src[0][i]);
});

test('every accent kind renders finite audio on mono and stereo sounds', () => {
  const ex = examples();
  assert.deepEqual(Object.keys(ACCENT_NAMES).sort(), Object.keys(D.ACCENT_KINDS).sort());
  for (const kind of Object.keys(D.ACCENT_KINDS)) for (const s of [ex.footstep, ex.gunshot]) {
    const r = D.renderAccents(s, SR, [slot({ kind, anchor: 'peak' })], {});
    assert.ok(finite(r.ch) && r.ch.length === s.length && r.marks.length === 1, kind);
  }
});

test('jitter changes variations but the same seed repeats them', () => {
  const s = examples().laser, sl = [slot({ kind: 'hit', anchor: 'end' })];
  const a = D.renderAccents(s, SR, sl, { seed: 1, jitter: true }), b = D.renderAccents(s, SR, sl, { seed: 1, jitter: true }), c = D.renderAccents(s, SR, sl, { seed: 2, jitter: true });
  assert.deepEqual(a.marks, b.marks);
  assert.notDeepEqual(a.marks, c.marks);
});

test('every recipe uses known keys, fits the slots and renders', () => {
  const s = examples().gunshot;
  for (const [g, items] of Object.entries(ACCENT_RECIPES)) for (const [name, list] of Object.entries(items)) {
    assert.ok(list.length <= SLOTS, `${g}/${name}: too many accents`);
    for (const p of list) for (const k of Object.keys(p)) assert.ok(ACCENT_SPECS.some(sp => sp.k === k), `${g}/${name}: unknown key ${k}`);
    const r = D.renderAccents(s, SR, list.map(p => slot(p)), {});
    assert.ok(finite(r.ch) && r.marks.length >= 1, `${g}/${name}`);
  }
});
