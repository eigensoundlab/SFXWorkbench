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
