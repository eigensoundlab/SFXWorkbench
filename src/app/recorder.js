// SPDX-License-Identifier: Apache-2.0
/**
 * Microphone / line-in recorder.
 *
 * Quality choices:
 * - Browser voice processing (echo cancellation, noise suppression, auto gain) is off by default ("Raw input").
 * - The capture AudioContext runs at the input track's own sample rate, so nothing is resampled.
 * - Samples are captured as 32-bit float by an AudioWorklet (ScriptProcessor fallback) and saved as 24-bit by default.
 * Optional sound-activated start keeps a short pre-roll so the attack is never cut, and can stop after silence.
 * Needs a secure context (https, localhost; most browsers also allow file://) and the user's permission.
 */
import { $, h, toast } from './dom.js';
import { newSound } from './state.js';
import { khz, chLabel, fmtDur } from './format.js';
import { addSound } from './library.js';
import { dbToLin } from '../dsp/index.js';

const WORKLET = `
class SfxCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = null; this.n = 0; this.size = 2048; }
  process(inputs) {
    const inp = inputs[0];
    if (!inp || !inp.length) return true;
    const nc = inp.length, L = inp[0].length;
    if (!this.buf || this.buf.length !== nc) { this.buf = Array.from({ length: nc }, () => new Float32Array(this.size)); this.n = 0; }
    if (this.n + L > this.size) { this.port.postMessage(this.buf.map(b => b.slice(0, this.n))); this.n = 0; }
    for (let c = 0; c < nc; c++) this.buf[c].set(inp[c], this.n);
    this.n += L;
    return true;
  }
}
registerProcessor('sfx-capture', SfxCapture);
`;

const R = {
  stream: null, ctx: null, node: null, src: null, sink: null,
  state: 'off', // off | idle | armed | recording
  chunks: [], frames: 0, pre: [], preFrames: 0, silent: 0,
  level: 0, hold: 0, clipped: false, raf: 0, count: 0,
  opts: { device: '', channels: 1, raw: true, trigger: false, thr: -36, autoStop: true },
};
const MAX_SECONDS = 600, PREROLL = 0.15, SILENCE_STOP = 1.5;

export const recorderBusy = () => R.state === 'armed' || R.state === 'recording';

function msg(text, kind) { const el = $('#rec-msg'); el.textContent = text || ''; el.classList.toggle('warn', kind === 'err'); }

async function openInput() {
  closeInput();
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    msg('Recording needs a secure page. Use the GitHub Pages site or npm start (localhost); some browsers block it in the offline file.', 'err');
    return false;
  }
  const o = R.opts;
  const audio = {
    channelCount: { ideal: o.channels },
    echoCancellation: !o.raw, noiseSuppression: !o.raw, autoGainControl: !o.raw,
  };
  if (o.device) audio.deviceId = { exact: o.device };
  try {
    R.stream = await navigator.mediaDevices.getUserMedia({ audio });
  } catch (e) {
    msg(e && e.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it in the browser\'s site settings, then press Record again.'
      : e && e.name === 'NotFoundError' ? 'No microphone or audio input was found.' : 'Could not open the input: ' + ((e && e.message) || e), 'err');
    return false;
  }
  const track = R.stream.getAudioTracks()[0], set = track.getSettings ? track.getSettings() : {};
  const Ctx = window.AudioContext || window.webkitAudioContext;
  try { R.ctx = set.sampleRate ? new Ctx({ sampleRate: set.sampleRate }) : new Ctx(); } catch (e) { R.ctx = new Ctx(); }
  await R.ctx.resume();
  R.src = R.ctx.createMediaStreamSource(R.stream);
  R.sink = R.ctx.createGain(); R.sink.gain.value = 0; R.sink.connect(R.ctx.destination);
  const nc = o.channels;
  let worklet = false;
  if (R.ctx.audioWorklet) {
    // Blob-URL worklets fail on file:// pages (opaque origin); fall back to ScriptProcessor there.
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
    try { await R.ctx.audioWorklet.addModule(url); worklet = true; } catch (e) { worklet = false; } finally { URL.revokeObjectURL(url); }
  }
  if (worklet) {
    R.node = new AudioWorkletNode(R.ctx, 'sfx-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: nc, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
    R.node.port.onmessage = e => onChunk(e.data);
  } else {
    R.node = R.ctx.createScriptProcessor(4096, nc, 1);
    R.node.channelCountMode = 'explicit'; R.node.channelCount = nc;
    R.node.onaudioprocess = e => onChunk(Array.from({ length: nc }, (_, c) => e.inputBuffer.getChannelData(c).slice()));
  }
  R.src.connect(R.node); R.node.connect(R.sink);
  R.state = 'idle';
  await listDevices(track);
  $('#rec-info').textContent = `${khz(R.ctx.sampleRate)} kHz · ${chLabel(nc)} · saved as 24-bit`;
  msg(o.raw ? 'Raw input: set the level in your system or interface so peaks stay below the red zone.' : 'Browser voice processing is on: good for dialogue, not for sound effects.');
  startMeter();
  return true;
}

function closeInput() {
  if (R.stream) R.stream.getTracks().forEach(t => t.stop());
  if (R.ctx) R.ctx.close().catch(() => {});
  cancelAnimationFrame(R.raf);
  Object.assign(R, { stream: null, ctx: null, node: null, src: null, sink: null, state: 'off', chunks: [], frames: 0, pre: [], preFrames: 0 });
  updateButton();
}

async function listDevices(track) {
  if (!navigator.mediaDevices.enumerateDevices) return;
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
  const sel = $('#rec-dev'), current = track && track.getSettings ? track.getSettings().deviceId : '';
  sel.replaceChildren(...devs.map((d, i) => h('option', { value: d.deviceId, text: d.label || `Input ${i + 1}` })));
  if (current && devs.some(d => d.deviceId === current)) sel.value = current;
}

function chunkPeak(chs) {
  let m = 0;
  for (const c of chs) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > m) m = v; }
  return m;
}

function onChunk(chs) {
  if (!R.ctx || !chs.length) return;
  const pk = chunkPeak(chs), L = chs[0].length, sr = R.ctx.sampleRate, thr = dbToLin(R.opts.thr);
  R.level = Math.max(R.level, pk);
  if (pk >= 0.999 && R.state === 'recording') R.clipped = true;
  if (R.state === 'armed') {
    R.pre.push(chs); R.preFrames += L;
    while (R.preFrames - R.pre[0][0].length > PREROLL * sr) R.preFrames -= R.pre.shift()[0].length;
    if (pk >= thr) { R.state = 'recording'; R.chunks = R.pre; R.frames = R.preFrames; R.pre = []; R.preFrames = 0; R.silent = 0; updateButton(); }
    return;
  }
  if (R.state !== 'recording') return;
  R.chunks.push(chs); R.frames += L;
  if (R.opts.trigger && R.opts.autoStop) {
    R.silent = pk < thr * 0.5 ? R.silent + L : 0;
    if (R.silent > SILENCE_STOP * sr) { stopRecording(true); return; }
  }
  if (R.frames > MAX_SECONDS * sr) stopRecording(false);
}

function startMeter() {
  const fill = $('#rec-meter'), time = $('#rec-time');
  const tick = () => {
    if (!R.ctx) return;
    R.hold = Math.max(R.level, R.hold * 0.9); R.level = 0;
    const db = 20 * Math.log10(Math.max(R.hold, 1e-6)), pct = Math.max(0, Math.min(1, (db + 60) / 60));
    fill.style.transform = `scaleX(${pct})`;
    fill.classList.toggle('is-hot', R.hold > 0.89);
    time.textContent = R.state === 'recording' ? `● ${fmtDur(R.frames / R.ctx.sampleRate)} s` : R.state === 'armed' ? 'Waiting for sound…' : 'Ready';
    R.raf = requestAnimationFrame(tick);
  };
  tick();
}

function updateButton() {
  const b = $('#rec-go');
  if (!b) return;
  const busy = recorderBusy();
  b.textContent = busy ? '■ Stop' : '● Record';
  b.classList.toggle('is-rec', busy);
  $('#rec-open').classList.toggle('is-rec', busy);
}

function stopRecording(fromSilence) {
  if (!R.ctx) return;
  const was = R.state, sr = R.ctx.sampleRate;
  R.state = 'idle'; updateButton();
  if (was !== 'recording' || !R.frames) { R.chunks = []; R.pre = []; R.preFrames = 0; return; }
  const nc = R.chunks[0].length;
  let n = R.frames;
  if (fromSilence) n = Math.max(1, n - Math.round((SILENCE_STOP - 0.3) * sr));
  const ch = Array.from({ length: nc }, () => new Float32Array(n));
  let p = 0;
  for (const c of R.chunks) {
    const take = Math.min(c[0].length, n - p);
    if (take <= 0) break;
    for (let k = 0; k < nc; k++) ch[k].set(c[k].subarray(0, take), p);
    p += take;
  }
  const fo = Math.min(n >> 2, Math.round(0.005 * sr));
  for (const c of ch) for (let i = 0; i < fo; i++) c[n - 1 - i] *= i / fo;
  R.chunks = []; R.frames = 0;
  R.count++;
  const s = addSound(newSound(`rec_${String(R.count).padStart(2, '0')}`, sr, ch, 24, false, 'recorded'), { select: true });
  toast(R.clipped ? `Recorded ${s.name}, but it clipped. Lower the input level and record again.` : `Recorded ${s.name} (${fmtDur(n / sr)} s)`, R.clipped ? 'err' : undefined);
  R.clipped = false;
  if (R.opts.trigger && fromSilence) { R.state = 'armed'; updateButton(); }
}

/** Start, arm or stop, depending on the current state. Used by the button and the Space key. */
export async function toggleRecord() {
  if (!R.ctx && !(await openInput())) return;
  if (recorderBusy()) { R.opts.trigger && R.state === 'armed' ? (R.state = 'idle', updateButton()) : stopRecording(false); return; }
  R.clipped = false; R.chunks = []; R.frames = 0; R.pre = []; R.preFrames = 0; R.silent = 0;
  R.state = R.opts.trigger ? 'armed' : 'recording';
  updateButton();
}

function syncOptionRows() {
  $('#rec-thr-row').hidden = !R.opts.trigger;
  $('#rec-auto-row').hidden = !R.opts.trigger;
  $('#rec-thr-val').textContent = `${R.opts.thr} dB`;
  $('#rec-thr-mark').style.left = `${(R.opts.thr + 60) / 60 * 100}%`;
}

/** Wire the recorder panel in the library rail. */
export function initRecorder() {
  const panel = $('#rec-panel');
  $('#rec-open').onclick = async () => {
    if (!panel.hidden) { panel.hidden = true; closeInput(); return; }
    panel.hidden = false; syncOptionRows();
    await openInput();
  };
  $('#rec-close').onclick = () => { panel.hidden = true; closeInput(); };
  $('#rec-go').onclick = toggleRecord;
  const reopen = async () => { if (R.ctx && !recorderBusy()) await openInput(); };
  $('#rec-dev').onchange = e => { R.opts.device = e.target.value; reopen(); };
  $('#rec-ch').onchange = e => { R.opts.channels = +e.target.value; reopen(); };
  $('#rec-raw').onchange = e => { R.opts.raw = e.target.checked; reopen(); };
  $('#rec-trig').onchange = e => { R.opts.trigger = e.target.checked; syncOptionRows(); };
  $('#rec-auto').onchange = e => { R.opts.autoStop = e.target.checked; };
  $('#rec-thr').oninput = e => { R.opts.thr = +e.target.value; syncOptionRows(); };
  syncOptionRows();
}
