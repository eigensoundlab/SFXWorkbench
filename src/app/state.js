// SPDX-License-Identifier: Apache-2.0
/**
 * The single mutable application state object S, plus sound and effect constructors.
 * UI modules read and write S directly, then call the matching render function.
 */
import { defaults } from './format.js';
import { FXDEF } from '../config/effects.js';
import { VAR_SPEC, MIX, SLICE_SPEC, LOOP_SPEC } from '../config/tools.js';
import { ENGINES, engineSpecs } from '../config/generator.js';

let uid = 1, fxid = 1;
export const S = {
  sounds: [], selId: null, sel: null, cursor: 0, chain: [], chainOn: true, chainHist: [], out: null, view: 'wave', tab: 'fx',
  vp: defaults(VAR_SPEC), vname: '{name}_var{nn}', vars: [],
  mode: 'cross', A: null, B: null, mp: Object.fromEntries(Object.entries(MIX).filter(([, m]) => m.params).map(([k, m]) => [k, defaults(m.params)])),
  layers: [], layerNorm: true,
  gEngine: 'synth', gParams: Object.fromEntries(Object.keys(ENGINES).map(e => [e, defaults(engineSpecs(e))])), gTypes: {}, gOut: null, gVer: 0, gCount: {},
  sp: defaults(SLICE_SPEC), slices: null, lp: defaults(LOOP_SPEC),
  exp: { fmt: 'source', sr: 'source' },
  fin: { lufs: 'off', ch: 'source', trim: false, dc: true, declick: true, ceil: true },
};
export const cur = () => S.sounds.find(s => s.id === S.selId) || null;
export const byId = id => S.sounds.find(s => s.id === id) || null;
export function newSound(name, sr, ch, bits = 24, isFloat = false, origin = 'file') { return { id: uid++, name, sr, ch, bits, isFloat, origin, ver: 1, undo: [] }; }
export function makeFx(type, p) { return { id: fxid++, type, on: true, p: Object.assign(defaults(FXDEF[type].params), p || {}) }; }
/** Fresh id for an effect instance (used when restoring a chain from history). */
export const nextFxId = () => fxid++;
