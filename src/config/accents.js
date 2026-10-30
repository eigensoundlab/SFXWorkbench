// SPDX-License-Identifier: Apache-2.0
/**
 * Accents tab: accent kinds, the parameter specs of one accent slot, and recipes (sets of accents) by category.
 * DSP: src/dsp/accents.js (ACCENT_KINDS keys must match ACCENT_NAMES keys here).
 * Spec format: see src/config/effects.js. `show: { k: 'kind', in: [...] }` limits a row to some kinds.
 */
import { MATERIALS, SHAPES } from '../dsp/physical.js';

export const ACCENT_NAMES = {
  hit: 'Impact hit',
  ring: 'Resonant ring (driven by the sound)',
  zap: 'Dispersion zap (from the sound)',
  sub: 'Sub thump',
  swell: 'Reverse swell into the anchor',
  whoosh: 'Whoosh into the anchor',
  slap: 'Back slap / echo of the attack',
  stutter: 'Stutter / glitch repeat',
  debris: 'Debris settle',
  shell: 'Shell drop',
  click: 'Mechanical click',
  sparks: 'Sparks',
};

export const ANCHORS = [
  ['start', 'Start of the sound'], ['peak', 'Peak (end of attack)'], ['each', 'Every transient'],
  ['tail', 'Start of the tail'], ['end', 'End of the sound'], ['at', 'Position (%)'], ['time', 'Selection start'],
];

const K = list => ({ k: 'kind', in: list });
const TUNED = ['hit', 'ring', 'sub', 'click'];
const MATERIAL_KINDS = ['hit', 'ring', 'debris', 'click'];
const WINDOWED = ['ring', 'zap', 'swell', 'slap', 'stutter'];

export const ACCENT_SPECS = [
  { k: 'kind', l: 'Accent', type: 'select', opts: Object.entries(ACCENT_NAMES), d: 'hit' },
  { k: 'anchor', l: 'Place at', type: 'select', opts: ANCHORS, d: 'end' },
  { k: 'at', l: 'Position', min: 0, max: 100, step: 1, u: '%', d: 50, show: { k: 'anchor', in: ['at'] } },
  { k: 'offset', l: 'Offset', min: -500, max: 1000, step: 1, u: 'ms', d: 0 },
  { k: 'level', l: 'Level', min: -36, max: 6, step: 0.5, u: 'dB', d: -6 },
  { k: 'follow', l: 'Follow the sound\'s loudness at that point', type: 'bool', d: true },
  { k: 'material', l: 'Material', type: 'select', opts: [['auto', 'Auto (from the sound)'], ...Object.entries(MATERIALS).map(([k, m]) => [k, m.name])], d: 'auto', show: K(MATERIAL_KINDS) },
  { k: 'shape', l: 'Shape', type: 'select', opts: Object.entries(SHAPES).map(([k, m]) => [k, m.name]), d: 'plate', show: K(['hit', 'ring']) },
  { k: 'tune', l: 'Tuning', type: 'select', opts: [['match', 'Match the sound'], ['octave', 'Octave below'], ['fifth', 'Fifth above'], ['free', 'Free (use Size)']], d: 'match', show: K(TUNED) },
  { k: 'size', l: 'Pitch (Free tuning)', min: 25, max: 8000, log: true, u: 'Hz', d: 400, show: K(TUNED) },
  { k: 'ring', l: 'Ring time', min: 0.05, max: 6, log: true, u: 'ratio', d: 0.8, show: K(['hit', 'ring']) },
  { k: 'hard', l: 'Hardness', min: 0, max: 100, step: 1, u: '%', d: 80, show: K(['hit']) },
  { k: 'win', l: 'Uses', min: 5, max: 800, log: true, u: 'ms', d: 40, show: K(WINDOWED) },
  { k: 'disp', l: 'Dispersion', min: 10, max: 100, step: 1, u: '%', d: 85, show: K(['zap']) },
  { k: 'dur', l: 'Length', min: 30, max: 3000, log: true, u: 'ms', d: 400, show: K(['sub', 'swell', 'whoosh', 'debris', 'sparks']) },
  { k: 'repeats', l: 'Repeats', min: 1, max: 8, step: 1, u: '', d: 2, show: K(['slap', 'stutter']) },
  { k: 'gap', l: 'Repeat gap', min: 10, max: 500, log: true, u: 'ms', d: 90, show: K(['slap', 'stutter']) },
  { k: 'tone', l: 'Distance (tone)', min: 200, max: 12000, log: true, u: 'Hz', d: 1800, show: K(['slap']) },
  { k: 'seed', l: 'Seed', min: 1, max: 999, step: 1, u: '#', d: 1 },
];

export const SLOTS = 4;

/**
 * Recipes: name -> list of partial slot params (on: true is implied). Slots not listed are turned off.
 * Keep recipes useful on arbitrary sounds: rely on anchors and Auto material/Match tuning rather than fixed pitches.
 */
export const ACCENT_RECIPES = {
  'Weapons': {
    'Gun: click, sub, back slap': [
      { kind: 'click', anchor: 'start', offset: -28, level: -14, follow: false },
      { kind: 'sub', anchor: 'peak', level: -3, dur: 350 },
      { kind: 'slap', anchor: 'peak', offset: 140, level: -12, win: 120, repeats: 2, gap: 110, tone: 1500 },
    ],
    'Gun: shell drop after': [{ kind: 'shell', anchor: 'tail', offset: 120, level: -16, follow: false }],
    'Laser: zap tail and glass ring': [
      { kind: 'zap', anchor: 'peak', level: -8, win: 25, disp: 90 },
      { kind: 'ring', anchor: 'tail', level: -14, material: 'glass', shape: 'shell', tune: 'fifth', win: 40, ring: 0.6 },
    ],
    'Melee: whoosh in, body hit': [
      { kind: 'whoosh', anchor: 'start', level: -10, follow: false, dur: 220 },
      { kind: 'hit', anchor: 'peak', level: -6, material: 'wood', shape: 'box', tune: 'octave', hard: 55, ring: 0.3 },
    ],
    'Reload: ring on every transient': [{ kind: 'ring', anchor: 'each', level: -12, material: 'steel', shape: 'bar', tune: 'free', size: 1800, win: 20, ring: 0.4 }],
    'Charged shot: swell into the attack': [{ kind: 'swell', anchor: 'start', level: -8, follow: false, win: 300, dur: 700 }, { kind: 'sub', anchor: 'peak', level: -6, dur: 300 }],
  },
  'Impacts': {
    'Heavy hit: sub and debris settle': [
      { kind: 'sub', anchor: 'peak', level: -2, dur: 500 },
      { kind: 'debris', anchor: 'tail', offset: 40, level: -14, follow: false, dur: 900 },
    ],
    'Back impact (wall behind)': [{ kind: 'slap', anchor: 'peak', offset: 70, level: -10, win: 150, repeats: 3, gap: 140, tone: 1000 }],
    'Glass reaction': [
      { kind: 'ring', anchor: 'peak', level: -10, material: 'glass', shape: 'shell', tune: 'fifth', win: 30, ring: 1.2 },
      { kind: 'debris', anchor: 'tail', level: -16, follow: false, material: 'glass', dur: 700 },
    ],
    'Metal reaction ring': [{ kind: 'ring', anchor: 'peak', level: -8, material: 'steel', shape: 'plate', tune: 'match', win: 30, ring: 1.4 }],
    'Ricochet tail': [{ kind: 'zap', anchor: 'tail', level: -8, win: 30, disp: 95 }],
    'Body hit reaction': [{ kind: 'hit', anchor: 'peak', offset: 25, level: -8, material: 'wood', shape: 'box', tune: 'octave', hard: 35, ring: 0.2 }],
  },
  'Devices & sci-fi': {
    'Device on: clunk, then ring': [
      { kind: 'click', anchor: 'start', level: -10, follow: false, tune: 'free', size: 2200 },
      { kind: 'ring', anchor: 'tail', level: -14, material: 'aluminium', shape: 'plate', tune: 'match', win: 60, ring: 0.8 },
    ],
    'Device off: thud at the end': [{ kind: 'sub', anchor: 'end', offset: -40, level: -8, follow: false, dur: 300 }, { kind: 'hit', anchor: 'end', offset: -40, level: -16, follow: false, material: 'steel', shape: 'box', tune: 'octave', hard: 45, ring: 0.3 }],
    'Sliding door: whoosh in, clunk at end': [
      { kind: 'whoosh', anchor: 'start', level: -12, follow: false, dur: 300 },
      { kind: 'hit', anchor: 'end', offset: -20, level: -8, follow: false, material: 'steel', shape: 'plate', tune: 'octave', hard: 70, ring: 0.5 },
    ],
    'Electric reaction': [{ kind: 'sparks', anchor: 'peak', offset: 10, level: -12, dur: 350 }, { kind: 'zap', anchor: 'peak', level: -14, win: 15, disp: 70 }],
    'Glitch stutter': [{ kind: 'stutter', anchor: 'start', level: -4, win: 45, repeats: 4, gap: 60 }],
    'Portal: swell in, dispersion out': [{ kind: 'swell', anchor: 'peak', level: -8, win: 400, dur: 900 }, { kind: 'zap', anchor: 'end', offset: -100, level: -10, win: 60, disp: 100 }],
  },
  'UI & pickups': {
    'Pickup: sparkle ring at the end': [{ kind: 'ring', anchor: 'tail', level: -10, material: 'glass', shape: 'bell', tune: 'fifth', win: 25, ring: 1 }],
    'Confirm: click before': [{ kind: 'click', anchor: 'start', offset: -30, level: -10, follow: false }],
    'Error: stutter': [{ kind: 'stutter', anchor: 'peak', level: -6, win: 30, repeats: 3, gap: 45 }],
    'Coin: shell tink after': [{ kind: 'shell', anchor: 'tail', level: -14, follow: false }],
  },
};
