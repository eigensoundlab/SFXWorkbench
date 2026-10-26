// SPDX-License-Identifier: Apache-2.0
/** Number formatting and slider mapping for parameter specs. */
import { linToDb } from '../dsp/index.js';

export const khz = sr => (sr / 1000).toFixed(sr % 1000 ? (sr % 100 ? 2 : 1) : 0);
export const fmtDb = x => { const d = linToDb(x); return d < -120 ? '−∞' : (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(1); };
export const fmtLufs = l => isFinite(l) ? (l < 0 ? '−' : '') + Math.abs(l).toFixed(1) + ' LUFS' : '−∞ LUFS';
export const fmtDur = n => n.toFixed(n < 10 ? 3 : 2);
export const bitsLabel = s => s.isFloat ? '32-bit float' : s.bits + '-bit';
export const chLabel = n => n === 1 ? 'mono' : n === 2 ? 'stereo' : n + ' ch';
export const safeName = s => (s || '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'sound';
export const sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '');

/**
 * Display a parameter value. The spec's `u` (unit) picks the format:
 * Hz, ms, st, dB, cut, LUFS, %, ±%, s, ×, ratio, #, bit, /s (events per second), oct, mm, ct (cents),
 * off% and offms (0 shows "off"), or '' for a plain number.
 */
export function fmtVal(sp, v) {
  const u = sp.u || '';
  if (u === 'Hz') return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 1 : 2) + ' kHz' : (v < 10 ? (+v).toFixed(1) : Math.round(v)) + ' Hz';
  if (u === 'ms') return (v < 10 ? (+v).toFixed(1) : Math.round(v)) + ' ms';
  if (u === 'st') return sgn(v) + Math.abs(v).toFixed(1) + ' st';
  if (u === 'dB') return sgn(v) + Math.abs(v).toFixed(1) + ' dB';
  if (u === 'cut') return '−' + Math.abs(v).toFixed(0) + ' dB';
  if (u === 'LUFS') return sgn(v) + Math.abs(v).toFixed(1);
  if (u === '%') return Math.round(v) + '%';
  if (u === '±%') return '±' + Math.round(v) + '%';
  if (u === 's') return (+v).toFixed(1) + ' s';
  if (u === '×') return '×' + (+v).toFixed(sp.step && sp.step < 1 ? 1 : 0);
  if (u === 'ratio') return '×' + (+v).toFixed(2);
  if (u === '#') return '#' + Math.round(v);
  if (u === 'bit') return Math.round(v) + '-bit';
  if (u === '/s') return (v < 10 ? (+v).toFixed(1) : Math.round(v)) + ' /s';
  if (u === 'oct') return (+v).toFixed(1) + ' oct';
  if (u === 'mm') return (v < 10 ? (+v).toFixed(1) : Math.round(v)) + ' mm';
  if (u === 'ct') return '±' + Math.round(v) + ' ct';
  if (u === 'off%') return v > 0 ? Math.round(v) + '%' : 'off';
  if (u === 'offms') return v > 0 ? Math.round(v) + ' ms' : 'off';
  return String(+(+v).toFixed(2));
}

export const roundLog = v => v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;
/** Log sliders run 0..1000 internally; linear sliders use the spec range directly. */
export const toSlider = (sp, v) => sp.log ? Math.round(1000 * Math.log(v / sp.min) / Math.log(sp.max / sp.min)) : v;
export const fromSlider = (sp, x) => sp.log ? roundLog(sp.min * Math.pow(sp.max / sp.min, x / 1000)) : +x;
/** { key: default } from a list of parameter specs. */
export const defaults = specs => Object.fromEntries(specs.filter(sp => sp.k).map(sp => [sp.k, sp.d]));
