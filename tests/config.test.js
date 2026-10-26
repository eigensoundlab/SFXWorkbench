// SPDX-License-Identifier: Apache-2.0
// Consistency checks between the UI configuration and the DSP. These catch the usual mistakes when adding
// an effect, preset, morph mode or generator type: a key typo, a missing processor, a param without a spec.
import test from 'node:test';
import assert from 'node:assert/strict';
import { D, SR, finite, examples } from './helpers.js';
import { FXDEF } from '../src/config/effects.js';
import { PRESETS } from '../src/config/presets.js';
import { MIX, VAR_SPEC, LAYER_SPEC, SLICE_SPEC, LOOP_SPEC } from '../src/config/tools.js';
import { GEN_SPECS, GEN_TYPES } from '../src/config/generator.js';
import { defaults } from '../src/app/format.js';

const ex = examples();

function checkSpecs(name, specs) {
  for (const sp of specs) {
    assert.ok(sp.k && sp.l, `${name}: spec needs k and l`);
    if (sp.type === 'select') assert.ok(sp.opts.some(([v]) => v === sp.d), `${name}.${sp.k}: default not among options`);
    else if (sp.type === 'bool') assert.equal(typeof sp.d, 'boolean', `${name}.${sp.k}`);
    else {
      assert.ok(sp.min < sp.max && sp.d >= sp.min && sp.d <= sp.max, `${name}.${sp.k}: default outside range`);
      if (sp.log) assert.ok(sp.min > 0, `${name}.${sp.k}: log slider needs min > 0`);
    }
    for (const dep of [sp.when, sp.whenNot].filter(Boolean)) assert.ok(specs.some(o => o.k === dep && o.type === 'bool'), `${name}.${sp.k}: when/whenNot must name a bool param`);
  }
}

test('every UI effect has a DSP processor and valid parameter specs', () => {
  for (const [k, def] of Object.entries(FXDEF)) {
    assert.equal(typeof D.FX[k], 'function', `missing FX.${k}`);
    assert.ok(def.name && def.group, k);
    checkSpecs(k, def.params);
  }
});

test('every preset uses known effects and known parameters, and renders cleanly', () => {
  for (const [group, items] of Object.entries(PRESETS)) {
    for (const [name, chain] of Object.entries(items)) {
      const fx = chain.map(([type, p], i) => {
        assert.ok(FXDEF[type], `${group}/${name}: unknown effect ${type}`);
        for (const key of Object.keys(p)) assert.ok(FXDEF[type].params.some(sp => sp.k === key), `${group}/${name}: ${type} has no param "${key}"`);
        return { id: i, type, on: true, p: { ...defaults(FXDEF[type].params), ...p } };
      });
      const out = D.processChain({ sr: SR, ch: ex.footstep }, fx).ch;
      assert.ok(D.len(out) > 0 && finite(out), `${group}/${name} output`);
    }
  }
});

test('morph modes with params have processors; tool specs are valid', () => {
  for (const [k, m] of Object.entries(MIX)) {
    if (!m.params) continue;
    assert.equal(typeof D.MORPH[k], 'function', `missing MORPH.${k}`);
    checkSpecs(k, m.params);
  }
  for (const [n, s] of Object.entries({ VAR_SPEC, LAYER_SPEC, SLICE_SPEC, LOOP_SPEC })) checkSpecs(n, s);
});

test('generator types only set known params and render', () => {
  checkSpecs('generator', GEN_SPECS);
  for (const [name, roll] of Object.entries(GEN_TYPES)) {
    const p = roll();
    for (const key of Object.keys(p)) assert.ok(GEN_SPECS.some(sp => sp.k === key), `${name}: unknown param ${key}`);
    const out = D.synthGen({ ...defaults(GEN_SPECS), ...p }, SR);
    assert.ok(finite(out) && D.len(out) > 0, name);
  }
});
