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
  assert.deepEqual(specs.map(t => t.id), ['deharsh', 'hpss', 'tailverb', 'drive', 'ring']);
  for (const t of specs) for (const sp of t.params) {
    assert.ok(sp.k && sp.l, `${t.id}: key and label`);
    if (sp.type === 'select') assert.ok(sp.opts.some(([v]) => v === sp.d), `${t.id}.${sp.k}: default among options`);
    else if (sp.type === 'bool') assert.equal(typeof sp.d, 'boolean');
    else assert.ok(sp.min < sp.max && sp.d >= sp.min && sp.d <= sp.max, `${t.id}.${sp.k}: default in range`);
  }
  const p = Object.fromEntries(specs[0].params.map(sp => [sp.k, sp.d]));
  assert.equal(p.delta, false, 'the removed part is not rendered unless asked for');
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
