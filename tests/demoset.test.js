// SPDX-License-Identifier: Apache-2.0
// The Playhead demo set (src/app/demoset.js): the examples finished with Playhead's arrangement search and tools.
import test from 'node:test';
import assert from 'node:assert/strict';
import { D, SR, examples, finite } from './helpers.js';
import { buildDemoSet, DEMO_LAYERS, DEMO_TOOLS, DEMO_LABEL } from '../src/app/demoset.js';

test('the demo set: an impact arranged for each goal, better than its rough placement, and the tools applied', async () => {
  const steps = [];
  const r = await buildDemoSet(examples(), SR, s => steps.push(s));
  const names = r.sounds.map(s => s.name);
  assert.ok(names.includes('impact, rough'));
  for (const [goal, word] of [['punch', 'punchy'], ['big', 'big'], ['clean', 'clean']]) {
    const sc = r.scores[goal];
    assert.ok(sc.arranged >= sc.rough, goal);
    if (sc.arranged > sc.rough) assert.ok(names.includes('impact, ' + word), word);
  }
  for (const [name, , what] of DEMO_TOOLS) assert.ok(names.includes(DEMO_LABEL[name] + ', ' + what), what);
  for (const s of r.sounds) { assert.ok(finite(s.ch) && D.len(s.ch) > 0, s.name); assert.ok(D.peak(s.ch) <= 1.0001 && D.peak(s.ch) > 0.01, s.name); }
  // the punchy arrangement as a layer stack: the same layers, moved by at most 60 ms and within the gain range
  assert.equal(r.layers.length, DEMO_LAYERS.length);
  r.layers.forEach((L, k) => {
    assert.equal(L.name, DEMO_LAYERS[k].name);
    assert.ok(Math.abs(L.offset - DEMO_LAYERS[k].offset) <= 60.01 && L.offset >= 0, L.name);
    assert.ok(L.gain >= DEMO_LAYERS[k].gain - 6.01 && L.gain <= DEMO_LAYERS[k].gain + 3.01, L.name);
  });
  assert.ok(steps.length >= 1 + 3 + DEMO_TOOLS.length);
});
