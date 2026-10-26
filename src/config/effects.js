// SPDX-License-Identifier: Apache-2.0
/**
 * Effect definitions for the UI: name, menu group, hint and parameter specs.
 * Keys must match the processors in src/dsp/effects.js (FX).
 *
 * Parameter spec fields:
 *   k: key in the effect's params object      l: label
 *   min, max, step: slider range              log: true for a logarithmic slider
 *   u: unit/format (see fmtVal in src/app/format.js)   d: default value
 *   type: 'select' (with opts: [[value, label]]) or 'bool'; omit for a slider
 *   when / whenNot: key of a bool param that enables / disables this row
 *   show: { k, in: [values] } hides the row unless param k has one of the values (used by generator engines)
 */
import { MATERIALS, SHAPES } from '../dsp/physical.js';


export const STRETCH_METHODS = [['wsola', 'Clean: impacts, foley, noise'], ['pv', 'Spectral: tonal, smoother'], ['smear', 'Extreme smear: drones, ambience']];
export const FXDEF = {
  pitch: { name: 'Speed / pitch', group: 'Pitch & time', hint: 'Tape-style: pitch and length change together.', params: [
    { k: 'st', l: 'Pitch', min: -24, max: 24, step: 0.1, u: 'st', d: 0 },
    { k: 'sweep', l: 'Sweep to a different end pitch', type: 'bool', d: false },
    { k: 'end', l: 'End pitch', min: -24, max: 24, step: 0.1, u: 'st', d: -12, when: 'sweep' },
    { k: 'curve', l: 'Sweep shape', type: 'select', opts: [['lin', 'Even'], ['exp', 'Fast at start'], ['late', 'Fast at end']], d: 'lin', when: 'sweep' }] },
  stretch: { name: 'Time stretch', group: 'Pitch & time', hint: 'Changes length without changing pitch.', params: [
    { k: 'factor', l: 'Length', min: 0.25, max: 16, log: true, u: 'ratio', d: 1.5, whenNot: 'fit' },
    { k: 'fit', l: 'Fit to an exact length', type: 'bool', d: false },
    { k: 'length', l: 'Target length', min: 20, max: 20000, log: true, u: 'ms', d: 1000, when: 'fit' },
    { k: 'method', l: 'Method', type: 'select', opts: STRETCH_METHODS, d: 'wsola' },
    { k: 'win', l: 'Window', min: 10, max: 150, log: true, u: 'ms', d: 40 },
    { k: 'keep', l: 'Keep attack', min: 0, max: 300, step: 1, u: 'offms', d: 0 }] },
  pshift: { name: 'Pitch shift', group: 'Pitch & time', hint: 'Changes pitch and keeps the length.', params: [
    { k: 'st', l: 'Pitch', min: -24, max: 24, step: 0.1, u: 'st', d: -5 },
    { k: 'method', l: 'Method', type: 'select', opts: STRETCH_METHODS.slice(0, 2), d: 'wsola' },
    { k: 'win', l: 'Window', min: 10, max: 150, log: true, u: 'ms', d: 40 }] },
  reverse: { name: 'Reverse', group: 'Pitch & time', hint: 'Plays the sound backwards at this point in the chain.', params: [] },
  filter: { name: 'Filter', group: 'Tone', params: [
    { k: 'mode', l: 'Type', type: 'select', opts: [['lowpass', 'Low-pass'], ['highpass', 'High-pass'], ['bandpass', 'Band-pass']], d: 'lowpass' },
    { k: 'freq', l: 'Cutoff', min: 20, max: 20000, log: true, u: 'Hz', d: 2000 },
    { k: 'q', l: 'Resonance', min: 0.3, max: 18, log: true, u: '', d: 0.71 },
    { k: 'sweep', l: 'Sweep the cutoff over time', type: 'bool', d: false },
    { k: 'freqEnd', l: 'End cutoff', min: 20, max: 20000, log: true, u: 'Hz', d: 300, when: 'sweep' }] },
  eq: { name: 'EQ', group: 'Tone', params: [
    { k: 'lowGain', l: 'Low shelf', min: -18, max: 18, step: 0.5, u: 'dB', d: 0 },
    { k: 'lowFreq', l: 'Low freq', min: 20, max: 1000, log: true, u: 'Hz', d: 120 },
    { k: 'midGain', l: 'Mid', min: -18, max: 18, step: 0.5, u: 'dB', d: 0 },
    { k: 'midFreq', l: 'Mid freq', min: 100, max: 12000, log: true, u: 'Hz', d: 1000 },
    { k: 'midQ', l: 'Mid width (Q)', min: 0.3, max: 10, log: true, u: '', d: 1 },
    { k: 'highGain', l: 'High shelf', min: -18, max: 18, step: 0.5, u: 'dB', d: 0 },
    { k: 'highFreq', l: 'High freq', min: 1000, max: 18000, log: true, u: 'Hz', d: 6000 }] },
  distort: { name: 'Distortion', group: 'Tone', params: [
    { k: 'type', l: 'Character', type: 'select', opts: [['soft', 'Soft saturation'], ['hard', 'Hard clip'], ['fold', 'Wavefold'], ['asym', 'Asymmetric (tube-like)']], d: 'soft' },
    { k: 'drive', l: 'Drive', min: 0, max: 36, step: 0.5, u: 'dB', d: 12 },
    { k: 'mix', l: 'Mix', min: 0, max: 100, u: '%', d: 100 }] },
  crush: { name: 'Bitcrush', group: 'Tone', params: [
    { k: 'bits', l: 'Bit depth', min: 1, max: 16, step: 1, u: 'bit', d: 8 },
    { k: 'ds', l: 'Downsample', min: 1, max: 32, step: 1, u: '×', d: 1 },
    { k: 'mix', l: 'Mix', min: 0, max: 100, u: '%', d: 100 }] },
  denoise: { name: 'Noise reduction', group: 'Tone', hint: 'Learns the noise floor from the quietest moments. Best on recordings with some room tone.', params: [
    { k: 'reduce', l: 'Reduce by', min: 0, max: 40, step: 1, u: 'cut', d: 18 },
    { k: 'sens', l: 'Sensitivity', min: 0.5, max: 4, step: 0.1, u: 'ratio', d: 1.5 }] },
  resonate: { name: 'Resonator body', group: 'Tone', hint: 'Plays the sound through a virtual object, as if it were struck through metal, wood or glass. Try it on recordings of taps and knocks.', params: [
    { k: 'material', l: 'Material', type: 'select', opts: Object.entries(MATERIALS).map(([k, m]) => [k, m.name]), d: 'steel' },
    { k: 'shape', l: 'Shape', type: 'select', opts: Object.entries(SHAPES).map(([k, m]) => [k, m.name]), d: 'plate' },
    { k: 'size', l: 'Size (pitch)', min: 30, max: 8000, log: true, u: 'Hz', d: 300 },
    { k: 'modes', l: 'Modes', min: 2, max: 32, step: 1, u: '', d: 16 },
    { k: 'ring', l: 'Ring time', min: 0.05, max: 6, log: true, u: 'ratio', d: 1 },
    { k: 'pos', l: 'Strike position', min: 1, max: 50, step: 1, u: '%', d: 25 },
    { k: 'mix', l: 'Mix', min: 0, max: 100, u: '%', d: 70 }] },
  ring: { name: 'Ring modulator', group: 'Modulation', params: [
    { k: 'freq', l: 'Frequency', min: 1, max: 4000, log: true, u: 'Hz', d: 120 },
    { k: 'sweep', l: 'Sweep the frequency', type: 'bool', d: false },
    { k: 'freqEnd', l: 'End frequency', min: 1, max: 4000, log: true, u: 'Hz', d: 30, when: 'sweep' },
    { k: 'mix', l: 'Mix', min: 0, max: 100, u: '%', d: 50 }] },
  trem: { name: 'Tremolo', group: 'Modulation', params: [
    { k: 'rate', l: 'Rate', min: 0.5, max: 60, log: true, u: 'Hz', d: 8 },
    { k: 'depth', l: 'Depth', min: 0, max: 100, u: '%', d: 60 },
    { k: 'shape', l: 'Shape', type: 'select', opts: [['sine', 'Smooth'], ['square', 'Chopped']], d: 'sine' }] },
  moddelay: { name: 'Flanger / chorus', group: 'Modulation', params: [
    { k: 'delay', l: 'Delay', min: 0.5, max: 30, log: true, u: 'ms', d: 3 },
    { k: 'depth', l: 'Depth', min: 0, max: 10, step: 0.1, u: 'ms', d: 2 },
    { k: 'rate', l: 'Rate', min: 0.05, max: 10, log: true, u: 'Hz', d: 0.4 },
    { k: 'fb', l: 'Feedback', min: -90, max: 90, u: '%', d: 50 },
    { k: 'mix', l: 'Mix', min: 0, max: 100, u: '%', d: 50 }] },
  echo: { name: 'Echo', group: 'Space', params: [
    { k: 'time', l: 'Time', min: 10, max: 1500, log: true, u: 'ms', d: 220 },
    { k: 'fb', l: 'Feedback', min: 0, max: 95, u: '%', d: 40 },
    { k: 'damp', l: 'Echo tone', min: 500, max: 20000, log: true, u: 'Hz', d: 6000 },
    { k: 'mix', l: 'Echo level', min: 0, max: 100, u: '%', d: 35 }] },
  disperse: { name: 'Dispersion / spring', group: 'Space', hint: 'Delays low frequencies more than high ones, so clicks turn into descending "pew" chirps. Feedback adds spring-reverb repeats.', params: [
    { k: 'amount', l: 'Amount', min: 0, max: 100, u: '%', d: 80 },
    { k: 'stages', l: 'Length', min: 10, max: 600, log: true, u: '', d: 200 },
    { k: 'fb', l: 'Feedback', min: 0, max: 90, u: '%', d: 30 },
    { k: 'delay', l: 'Loop delay', min: 5, max: 150, log: true, u: 'ms', d: 35 },
    { k: 'mix', l: 'Mix', min: 0, max: 100, u: '%', d: 60 }] },
  reverb: { name: 'Reverb', group: 'Space', params: [
    { k: 'size', l: 'Room size', min: 0, max: 100, u: '%', d: 70 },
    { k: 'damp', l: 'Damping', min: 0, max: 100, u: '%', d: 50 },
    { k: 'predelay', l: 'Pre-delay', min: 0, max: 200, u: 'ms', d: 10 },
    { k: 'mix', l: 'Wet', min: 0, max: 100, u: '%', d: 30 },
    { k: 'tail', l: 'Max tail', min: 0, max: 10, step: 0.1, u: 's', d: 2 },
    { k: 'width', l: 'Stereo width', min: 0, max: 100, u: '%', d: 100 }] },
  transient: { name: 'Transient shaper', group: 'Dynamics', params: [
    { k: 'attack', l: 'Attack', min: -100, max: 100, u: '%', d: 50 },
    { k: 'sustain', l: 'Sustain', min: -100, max: 100, u: '%', d: 0 }] },
  comp: { name: 'Compressor', group: 'Dynamics', params: [
    { k: 'thr', l: 'Threshold', min: -48, max: 0, step: 0.5, u: 'dB', d: -18 },
    { k: 'ratio', l: 'Ratio', min: 1, max: 20, log: true, u: '', d: 4 },
    { k: 'att', l: 'Attack', min: 0.1, max: 100, log: true, u: 'ms', d: 5 },
    { k: 'rel', l: 'Release', min: 10, max: 1000, log: true, u: 'ms', d: 120 },
    { k: 'makeup', l: 'Makeup', min: 0, max: 24, step: 0.5, u: 'dB', d: 4 }] },
  gain: { name: 'Gain', group: 'Dynamics', params: [{ k: 'db', l: 'Gain', min: -24, max: 24, step: 0.1, u: 'dB', d: 0 }] },
  fade: { name: 'Fades', group: 'Dynamics', params: [
    { k: 'in', l: 'Fade in', min: 0, max: 2000, step: 1, u: 'ms', d: 0 },
    { k: 'out', l: 'Fade out', min: 0, max: 4000, step: 1, u: 'ms', d: 80 },
    { k: 'curve', l: 'Curve', type: 'select', opts: [['smooth', 'S-curve'], ['linear', 'Linear'], ['exp', 'Exponential']], d: 'smooth' }] },
  normalize: { name: 'Normalize', group: 'Dynamics', params: [{ k: 'target', l: 'Peak', min: -24, max: 0, step: 0.1, u: 'dB', d: -1 }] },
  loud: { name: 'Loudness', group: 'Dynamics', hint: 'Sets perceived loudness (LUFS). The peak ceiling wins if they conflict.', params: [
    { k: 'target', l: 'Target', min: -36, max: -6, step: 0.5, u: 'LUFS', d: -16 },
    { k: 'ceil', l: 'Peak ceiling', min: -12, max: 0, step: 0.1, u: 'dB', d: -1 }] },
  dc: { name: 'Remove DC offset', group: 'Dynamics', hint: 'Removes a constant offset that can cause clicks at the start and end.', params: [] },
};
