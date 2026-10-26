// SPDX-License-Identifier: Apache-2.0
/** Parameter specs for the Variations, Combine & morph and Slice & loop tools. Same spec format as src/config/effects.js. */

export const VAR_SPEC = [
  { k: 'count', l: 'Count', min: 1, max: 32, step: 1, u: '', d: 8 },
  { k: 'pitch', l: 'Pitch ±', min: 0, max: 12, step: 0.1, u: 'st', d: 1.5 },
  { k: 'stretch', l: 'Length ±', min: 0, max: 40, step: 1, u: '±%', d: 0 },
  { k: 'gain', l: 'Volume ±', min: 0, max: 12, step: 0.1, u: 'dB', d: 2 },
  { k: 'tone', l: 'Darken up to', min: 0, max: 100, step: 1, u: '%', d: 20 },
  { k: 'offset', l: 'Start offset', min: 0, max: 200, step: 1, u: 'ms', d: 0 },
  { k: 'rev', l: 'Reverse chance', min: 0, max: 100, step: 1, u: '%', d: 0 },
  { k: 'seed', l: 'Seed', min: 1, max: 999, step: 1, u: '#', d: 1 },
  { k: 'chain', l: 'Run the effect chain on each variation', type: 'bool', d: true },
];

export const FIT = { k: 'fit', l: 'Stretch B to the length of A', type: 'bool', d: true };
export const FFT = { k: 'fft', l: 'Resolution', type: 'select', opts: [['1024', '1024: sharper attacks'], ['2048', '2048: balanced'], ['4096', '4096: smoother tone']], d: '2048' };
export const MIX = {
  layer: { name: 'Layer stack', desc: 'Stack up to four sounds with offsets, pitch and pan, then bounce them to one file. The classic weapon build: mechanism click, body, sub thump and tail.' },
  spectral: { name: 'Spectral morph', short: 'morph', desc: 'Blends the frequency content of A and B frame by frame instead of their waveforms. Give it different start and end amounts and A turns into B over time.', tryIt: 'Try A: laser, B: metal hit, 0% → 100%.',
    params: [{ k: 't0', l: 'B at start', min: 0, max: 100, u: '%', d: 0 }, { k: 't1', l: 'B at end', min: 0, max: 100, u: '%', d: 100 },
      { k: 'style', l: 'Character', type: 'select', opts: [['hybrid', 'Hybrid: keeps what both share'], ['blend', 'Blend: crossfades the spectra']], d: 'hybrid' }, FIT, FFT] },
  cross: { name: 'Cross-synthesis', short: 'xsyn', desc: 'A provides the sound, B provides the shape. B\'s spectral envelope and rhythm are imposed on A, like a vocoder. Works best with a buzzy or noisy A.', tryIt: 'Try A: servo, B: gunshot.',
    params: [{ k: 'amt', l: 'Amount', min: 0, max: 100, u: '%', d: 100 }, { k: 'smooth', l: 'Smoothing', min: 1, max: 50, u: '%', d: 8 }, FIT, FFT] },
  conv: { name: 'Convolution', short: 'conv', desc: 'Every moment of A triggers a copy of B. A short B behaves like a resonant body (metal, wood, a gun barrel); a long B behaves like a space. Reverse B for a pre-echo swell.', tryIt: 'Try A: footstep, B: metal hit.',
    params: [{ k: 'irMs', l: 'B length used', min: 5, max: 4000, log: true, u: 'ms', d: 600 }, { k: 'reverse', l: 'Reverse B', type: 'bool', d: false }, { k: 'mix', l: 'Wet', min: 0, max: 100, u: '%', d: 100 }] },
  env: { name: 'Envelope transfer', short: 'env', desc: 'A takes on the loudness contour of B. Give a hum the punch of a gunshot, or make a drone pulse with the rhythm of footsteps.', tryIt: 'Try A: whoosh, B: gunshot.',
    params: [{ k: 'amt', l: 'Amount', min: 0, max: 100, u: '%', d: 100 }, { k: 'att', l: 'Attack', min: 0.1, max: 50, log: true, u: 'ms', d: 1 }, { k: 'rel', l: 'Release', min: 5, max: 500, log: true, u: 'ms', d: 60 },
      { k: 'flatten', l: 'Remove A\'s own envelope first', type: 'bool', d: true }, FIT] },
  ring: { name: 'Ring multiply', short: 'ring', desc: 'Multiplies A by B sample by sample, which creates sum and difference frequencies: metallic, alien and broken-radio textures.', tryIt: 'Try A: servo, B: laser.',
    params: [{ k: 'mix', l: 'Wet', min: 0, max: 100, u: '%', d: 100 }, FIT] },
  grain: { name: 'Granular weave', short: 'grain', desc: 'Rebuilds the sound from short overlapping grains taken from A and B. Good for glitchy devices, energy crackle and textures that never repeat exactly.', tryIt: 'Try A: servo, B: metal hit, small grains.',
    params: [{ k: 'grain', l: 'Grain size', min: 10, max: 300, log: true, u: 'ms', d: 60 }, { k: 'overlap', l: 'Density', min: 1, max: 8, step: 0.5, u: '×', d: 3 },
      { k: 'bStart', l: 'B share, start', min: 0, max: 100, u: '%', d: 20 }, { k: 'bEnd', l: 'B share, end', min: 0, max: 100, u: '%', d: 80 },
      { k: 'jitter', l: 'Position scatter', min: 0, max: 300, u: 'ms', d: 20 }, { k: 'pjit', l: 'Pitch scatter', min: 0, max: 12, step: 0.1, u: 'st', d: 0 },
      { k: 'rev', l: 'Reversed grains', min: 0, max: 100, u: '%', d: 0 }, { k: 'seed', l: 'Seed', min: 1, max: 999, step: 1, u: '#', d: 1 }] },
};
export const LAYER_SPEC = [
  { k: 'offset', l: 'Offset', min: 0, max: 3000, step: 1, u: 'ms', d: 0 },
  { k: 'gain', l: 'Gain', min: -30, max: 12, step: 0.5, u: 'dB', d: 0 },
  { k: 'pitch', l: 'Pitch', min: -24, max: 24, step: 0.1, u: 'st', d: 0 },
  { k: 'pan', l: 'Pan', min: -100, max: 100, step: 1, u: '%', d: 0 },
];

export const SLICE_SPEC = [
  { k: 'thr', l: 'Threshold', min: -70, max: -10, step: 1, u: 'dB', d: -40 },
  { k: 'gap', l: 'Min silence', min: 10, max: 1000, log: true, u: 'ms', d: 120 },
  { k: 'minLen', l: 'Min take length', min: 5, max: 1000, log: true, u: 'ms', d: 40 },
  { k: 'pre', l: 'Pre-roll', min: 0, max: 50, step: 1, u: 'ms', d: 3 },
  { k: 'tail', l: 'Keep tail', min: 0, max: 500, step: 1, u: 'ms', d: 40 },
  { k: 'fade', l: 'Fade out', min: 0, max: 100, step: 1, u: 'ms', d: 10 },
];
export const LOOP_SPEC = [
  { k: 'xf', l: 'Crossfade', min: 5, max: 1000, log: true, u: 'ms', d: 80 },
  { k: 'shape', l: 'Crossfade type', type: 'select', opts: [['power', 'Equal power: noise, ambience'], ['linear', 'Linear: tonal hums']], d: 'power' },
  { k: 'snap', l: 'Snap loop points to zero crossings', type: 'bool', d: true },
];
