// SPDX-License-Identifier: Apache-2.0
// The vendored Playhead core (src/vendor/playhead-core.mjs) and the app's helpers that turn its document into
// accent anchors and drive curves (src/app/playhead.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { D, SR, examples } from './helpers.js';
import Playhead from '../src/vendor/playhead-core.mjs';
import { PH, phEvents, phCurve, phSummary, PH_CURVES } from '../src/app/playhead.js';

const ex = examples();

test('the vendored Playhead core analyses a Workbench sound at 48 kHz', async () => {
  const doc = await Playhead.analyze({ sampleRate: SR, channels: ex.footstep }, { profile: 'sfx' });
  assert.equal(doc.schema, 'playhead-analysis');
  assert.equal(doc.source.sampleRate, SR);
  assert.ok(doc.events.length >= 1 && doc.descriptors && Number.isFinite(doc.descriptors.arrow.T20));
  for (const k of Object.keys(PH_CURVES)) assert.equal(doc.curves[k].length, Math.round(doc.source.duration * doc.curves.rate), k);
  assert.equal(PH.version, Playhead.version);
  assert.equal(PH.on, false, 'off unless the user turns it on');
});

test('Playhead events become accent anchors and curves become 0..1 drives', async () => {
  const doc = await Playhead.analyze({ sampleRate: SR, channels: ex.footstep }, { profile: 'sfx' });
  const ev = phEvents(doc, SR);
  assert.equal(ev.length, doc.events.length);
  ev.forEach((e, i) => { assert.equal(e.at, Math.round(doc.events[i].start * SR)); assert.ok(e.strength <= 0); });
  const c = phCurve(doc, 'activity');
  assert.equal(c.rate, doc.curves.rate);
  assert.ok(c.values.every(v => v >= 0 && v <= 1) && Math.max(...c.values) === 1);
  assert.equal(phCurve(doc, 'nope'), null);
  assert.equal(phEvents({ events: null }, SR), null);
  assert.ok(phSummary(doc).some(([label]) => label === 'Events'));
  // a drive from Playhead renders like any other
  const out = D.reactionGen({ kind: 'particles', lag: 10, inertia: 200, thresh: 10, follow: 100, bright: 50, action: 0, width: 0, seed: 1, density: 200, material: 'stone', pitch: 2500, spread: 1.5, driveCurve: c.values, driveRate: c.rate }, SR);
  assert.ok(D.peak(out) > 0.5);
});

test('looks: ready-made looks, codes checked by Playhead, looks that fit a sound effect, the strip in a look', async () => {
  const { phLooks, phCheckCode, phLookFits, drawPhStrip, setLook, PH } = await import('../src/app/playhead.js');
  const doc = await Playhead.analyze({ sampleRate: SR, channels: ex.metal }, { profile: 'sfx' });
  const names = phLooks().map(([k]) => k);
  assert.ok(names.includes('auto') && names.includes('spectrum') && names.includes('sculpted') && names.length >= 10);
  assert.ok(names.includes('character') && phLookFits(doc, 'character'), 'the sound-effect look fits a sound effect');
  assert.equal(phCheckCode(' wave:harshness , lane:activity,nonsense '), 'wave:harshness,lane:activity');
  assert.equal(phCheckCode('nonsense'), null);
  assert.ok(phLookFits(doc, 'events') && phLookFits(doc, 'spectrum') && !phLookFits(doc, 'structure'), 'structure needs music');
  let fills = 0; const g = new Proxy({ canvas: { width: 300, height: 80 } }, { get: (t, k) => k in t ? t[k] : (...a) => { if (k === 'fillRect') fills++; }, set: () => true });
  setLook('spectrum');
  const r = drawPhStrip(g, doc, 300, 80, {});
  assert.ok(r.legend.startsWith('spectrogram') && fills > 100 && PH.look === 'spectrum');
  setLook('auto');
});

test('Playhead tools: specs fit the Workbench controls; de-harsh keeps rate, channels and length', async () => {
  const { phToolSpecs, phProcess } = await import('../src/app/playhead.js');
  const specs = phToolSpecs();
  assert.deepEqual(specs.map(t => t.id), ['deharsh', 'hpss', 'tailverb', 'drive', 'ring', 'level', 'mono', 'widen']);
  for (const t of specs) for (const sp of t.params) {
    assert.ok(sp.k && sp.l, `${t.id}: key and label`);
    if (sp.type === 'select') assert.ok(sp.opts.some(([v]) => v === sp.d), `${t.id}.${sp.k}: default among options`);
    else if (sp.type === 'bool') assert.equal(typeof sp.d, 'boolean');
    else assert.ok(sp.min < sp.max && sp.d >= sp.min && sp.d <= sp.max, `${t.id}.${sp.k}: default in range`);
  }
  const p = Object.fromEntries(specs[0].params.map(sp => [sp.k, sp.d]));
  assert.equal(p.delta, false, 'the removed part is not rendered unless asked for');
  assert.equal(specs.find(t => t.id === 'mono').params.find(sp => sp.k === 'plain').d, false, 'nor the plain mono sum');
  const src = ex.metal.length === 1 ? [ex.metal[0], ex.metal[0].map(v => v * 0.8)] : ex.metal;
  const r = await phProcess({ sr: SR, ch: src, name: 'metal' }, 'deharsh', p);
  assert.equal(r.outputs.length, 1);
  const o = r.outputs[0];
  assert.ok(o.sampleRate === SR && o.channels.length === 2 && o.channels[0].length === src[0].length);
  assert.ok(o.channels.every(c => c.every(Number.isFinite)) && r.report.length > 0);
  assert.notDeepEqual(o.channels[0], src[0]);
});

test('Playhead tools that follow the events: reverb adds a tail, drive and ring time keep the length', async () => {
  const { phToolSpecs, phProcess } = await import('../src/app/playhead.js');
  const specs = Object.fromEntries(phToolSpecs().map(t => [t.id, Object.fromEntries(t.params.map(sp => [sp.k, sp.d]))]));
  const src = ex.gunshot, n = src[0].length;
  const tv = await phProcess({ sr: SR, ch: src, name: 'gunshot' }, 'tailverb', specs.tailverb);
  assert.ok(tv.outputs[0].channels[0].length > n && tv.outputs[0].sampleRate === SR && tv.outputs[0].channels.length === src.length);
  for (const id of ['drive', 'ring']) {
    const r = await phProcess({ sr: SR, ch: src, name: 'gunshot' }, id, specs[id]), o = r.outputs[0];
    assert.ok(o.channels[0].length === n && o.channels.length === src.length && o.channels.every(c => c.every(Number.isFinite)), id);
    assert.ok(r.report.length > 0, id);
  }
});

test('Playhead tools for levels and channels: level keeps the shape, fold to mono and widen the tails change the channel count', async () => {
  const { phToolSpecs, phProcess } = await import('../src/app/playhead.js');
  const specs = Object.fromEntries(phToolSpecs().map(t => [t.id, Object.fromEntries(t.params.map(sp => [sp.k, sp.d]))]));
  // three hits at very different levels
  const n = SR * 2, x = new Float32Array(n);
  [0.9, 0.1, 0.4].forEach((g, j) => { const i0 = Math.round((0.2 + 0.6 * j) * SR); for (let k = 0; k < 0.3 * SR; k++) x[i0 + k] += g * Math.exp(-k / (0.05 * SR)) * Math.sin(2 * Math.PI * 600 * k / SR); });
  const lv = await phProcess({ sr: SR, ch: [x], name: 'hits' }, 'level', { ...specs.level, match: false }), y = lv.outputs[0].channels[0];
  const pk = (z, j) => { const i0 = Math.round((0.2 + 0.6 * j) * SR); let m = 0; for (let k = 0; k < 0.25 * SR; k++) m = Math.max(m, Math.abs(z[i0 + k])); return m; };
  assert.ok(y.length === n && pk(y, 1) / pk(y, 0) > 2 * pk(x, 1) / pk(x, 0), 'the quiet hit comes closer to the loud one');
  // a stereo pair 2 ms apart: the fold keeps the level a plain average loses to comb filtering
  const d = Math.round(0.002 * SR), L = ex.gunshot[0], R = Float32Array.from(L, (_, i) => (i >= d ? L[i - d] : 0));
  const fold = await phProcess({ sr: SR, ch: [L, R], name: 'pair' }, 'mono', { ...specs.mono, plain: true });
  assert.deepEqual(fold.outputs.map(o => o.channels.length), [1, 1]);
  assert.ok(fold.outputs.every(o => o.sampleRate === SR && o.channels[0].length === L.length));
  const e = c => c.reduce((s, v) => s + v * v, 0), eL = e(L), eR = e(R);
  const [fe, pe] = fold.outputs.map(o => e(o.channels[0]) / (0.5 * (eL + eR)));
  assert.ok(Math.abs(10 * Math.log10(fe)) < 0.5 && fe > pe, `folded ${fe}, plain ${pe}`);
  // widen a mono sound: two channels whose average is the original
  const wd = await phProcess({ sr: SR, ch: [L], name: 'shot' }, 'widen', { ...specs.widen, width: 100 }), [a, b] = wd.outputs[0].channels;
  assert.equal(wd.outputs[0].channels.length, 2);
  let back = 0, side = 0; for (let i = 0; i < L.length; i++) { back = Math.max(back, Math.abs(0.5 * (a[i] + b[i]) - L[i])); side += (a[i] - b[i]) ** 2; }
  assert.ok(back < 1e-6 && side > 0, `fold back ${back}`);
});

test('the vendored core combines layers and searches their arrangement', async () => {
  const o = { profile: 'sfx', assetClass: 'sfx', curveRate: 100 };
  const shot = await Playhead.analyze({ sampleRate: SR, channels: ex.gunshot }, o), metal = await Playhead.analyze({ sampleRate: SR, channels: ex.metal }, o);
  const parts = [{ doc: shot, offset: 0.1, gain: 0 }, { doc: metal, offset: 0.14, gain: -6 }];
  const whole = Playhead.combine(parts);
  assert.equal(whole.schema, 'playhead-analysis');
  assert.ok(Math.abs(whole.source.duration - Math.max(0.1 + shot.source.duration, 0.14 + metal.source.duration)) < 0.02);
  const m = Playhead.measureParts(parts, { goal: 'punch' }), r = Playhead.arrange(parts, { goal: 'punch', minOffset: 0, seed: 1 });
  assert.ok(m.rise > 0 && m.together >= 0 && m.together <= 1 && Number.isFinite(m.score));
  assert.ok(r.evaluated > 100 && r.candidates.length >= 1 && r.candidates[0].score > r.baseline.score);
  assert.deepEqual(r.locked, [0], 'the louder part stays');
  for (const c of r.candidates) assert.ok(c.parts[1].offset >= 0 && Math.abs(c.parts[1].offset - 0.14) <= 0.25 + 1e-9);
});
