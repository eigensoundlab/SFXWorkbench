// SPDX-License-Identifier: Apache-2.0
/**
 * Accents tab: analyse the selected sound's structure and add context-aware accents at structural points.
 * The analysis and rendering live in src/dsp/accents.js; kinds, slot specs and recipes in src/config/accents.js.
 */
import * as D from '../../dsp/index.js';
import { $, h, toast } from '../dom.js';
import { S, cur, newSound } from '../state.js';
import { defaults, fmtDur, safeName } from '../format.js';
import { ACCENT_SPECS, ACCENT_RECIPES, SLOTS } from '../../config/accents.js';
import { MATERIALS } from '../../dsp/physical.js';
import { paramRow, syncWhen, nudge } from '../controls.js';
import { play } from '../audio.js';
import { drawWave } from '../draw.js';
import { addSound } from '../library.js';

const freshSlot = (on = false) => ({ on, ...defaults(ACCENT_SPECS) });
let timer = 0, baseCache = { key: '', ch: null };

/** Slots ready for rendering: the "Selection start" anchor reads the current selection on the source waveform. */
export function activeSlots(sound) {
  const t = S.sel && sound ? S.sel.a / sound.sr : 0;
  return S.acc.slots.map(sl => ({ ...sl, time: t }));
}
export const hasAccents = () => S.acc.slots.some(sl => sl.on);

/** The sound the accents are built on: the source, or the source through the effect chain (without finishing). */
function baseAudio(s) {
  const useChain = S.acc.src === 'out' && S.chainOn && S.chain.some(f => f.on);
  const key = `${s.id}:${s.ver}:${useChain ? JSON.stringify(S.chain) : 'dry'}`;
  if (baseCache.key !== key) baseCache = { key, ch: useChain ? D.processChain(s, S.chain).ch : s.ch };
  return baseCache.ch;
}

export function renderAccentResult() {
  const s = cur();
  if (!s) { S.accRes = null; drawAcc(); return null; }
  try {
    const base = baseAudio(s);
    const r = D.renderAccents(base, s.sr, activeSlots(s), { seed: S.acc.seed });
    S.accRes = { ...r, sr: s.sr, src: s, ver: (S.accRes ? S.accRes.ver : 0) + 1 };
  } catch (e) {
    console.error(e); S.accRes = null; toast('Could not render the accents: ' + e.message, 'err');
  }
  renderReadout(); drawAcc();
  return S.accRes;
}

function renderReadout() {
  const r = S.accRes, el = $('#acc-readout');
  if (!r) { el.replaceChildren(); return; }
  const d = D.describeStructure(r.analysis), hz = v => (v >= 1000 ? (v / 1000).toFixed(2) + ' kHz' : Math.round(v) + ' Hz');
  const chip = (label, value) => h('span', { class: 'chip', title: label }, h('b', { text: label + ' ' }), value);
  el.replaceChildren(
    chip('Attack', `${d.attackMs} ms`), chip('Peak', `${fmtDur(d.peakS)} s`), chip('Tail from', `${fmtDur(d.bodyEndS)} s`),
    chip('Ends', `${fmtDur(d.tailEndS)} s`), chip('Transients', String(d.transients)),
    chip(d.pitch ? 'Pitch' : 'Key', hz(d.key)), chip('Character', d.character), chip('Auto material', MATERIALS[d.material].name),
    chip('Result', `${fmtDur(D.len(r.ch) / r.sr)} s${r.lead ? `, ${fmtDur(r.lead / r.sr)} s lead-in` : ''}`));
}

/** Waveform of the result with the source structure (attack, body, tail, transients) and the accents marked. */
export function drawAcc() {
  if (S.tab !== 'acc') return;
  const r = S.accRes;
  drawWave($('#wave-acc'), r ? { sr: r.sr, ch: r.ch } : null, {
    key: r ? 'acc' + r.ver : '', out: true, waveOnly: true, empty: 'Select a sound in the library',
    overlay: r ? (g, W, H, n, T) => {
      const a = r.analysis, x = s => (s + r.lead) / n * W;
      const band = (s0, s1, color, label) => {
        g.fillStyle = color; g.globalAlpha = 0.5; g.fillRect(x(s0), 0, Math.max(1, x(s1) - x(s0)), 5); g.globalAlpha = 1;
        g.fillStyle = T.muted; g.font = '10px "IBM Plex Mono", monospace'; if (x(s1) - x(s0) > 34) g.fillText(label, x(s0) + 3, 16);
      };
      band(a.onset, a.peakAt, T.danger, 'attack'); band(a.peakAt, a.bodyEnd, T.accent, 'body'); band(a.bodyEnd, a.tailEnd, T.muted, 'tail');
      g.fillStyle = T.ink;
      for (const t of a.transients) { const px = x(t.at); g.beginPath(); g.moveTo(px - 4, H); g.lineTo(px + 4, H); g.lineTo(px, H - 7); g.fill(); }
      // One lane per accent slot: a bar for the accent's sound, a tick at its anchor and the slot number.
      g.font = '10px "IBM Plex Mono", monospace';
      const labelled = new Set();
      for (const m of r.marks) {
        const y = 22 + m.slot * 13, x0 = m.start / n * W, w = Math.max(3, m.len / n * W), xa = Math.round(m.anchor / n * W);
        g.fillStyle = T.accent; g.globalAlpha = 0.5; g.fillRect(x0, y, w, 8); g.globalAlpha = 1;
        g.fillRect(xa, y - 2, 2, 12);
        if (!labelled.has(m.slot)) { labelled.add(m.slot); g.fillStyle = T.ink; g.fillText(String(m.slot + 1), x0 > 10 ? x0 - 9 : x0 + w + 3, y + 8); }
      }
    } : null,
  });
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => { const r = renderAccentResult(); if (r && $('#acc-auto').checked) play({ sr: r.sr, ch: r.ch }, 0, null, 'acc'); }, 250);
}

export function renderSlots() {
  const box = $('#acc-slots');
  box.replaceChildren(...S.acc.slots.map((sl, i) => {
    const card = h('div', { class: 'fx acc-slot' + (sl.on ? '' : ' is-off') });
    const onChange = () => { syncWhen(card, sl); schedule(); };
    card.append(
      h('div', { class: 'fx-head' },
        h('span', { class: 'fx-idx', text: String(i + 1).padStart(2, '0') }),
        h('span', { class: 'fx-name', text: 'Accent ' + (i + 1) }),
        h('label', { class: 'chk', title: 'Use this accent' }, h('input', { type: 'checkbox', id: `acc${i}-on`, checked: sl.on, 'aria-label': `Use accent ${i + 1}`, onchange: e => { sl.on = e.target.checked; card.classList.toggle('is-off', !sl.on); schedule(); } })),
        h('button', { class: 'icon-btn', type: 'button', title: 'Reset this accent', 'aria-label': `Reset accent ${i + 1}`, onclick: () => { S.acc.slots[i] = freshSlot(); renderSlots(); schedule(); } }, '×')),
      h('div', { class: 'fx-params' }, ACCENT_SPECS.map(sp => paramRow(sp, sl, onChange, `acc${i}`))));
    syncWhen(card, sl);
    return card;
  }));
}

function loadRecipe(list) {
  S.acc.slots = Array.from({ length: SLOTS }, (_, i) => (list[i] ? { ...freshSlot(true), ...list[i] } : freshSlot(false)));
  renderSlots(); schedule();
}

function mutate() {
  if (!hasAccents()) return toast('Turn on an accent or load a recipe first.');
  for (const sl of S.acc.slots) if (sl.on) for (const sp of ACCENT_SPECS) if (!sp.type && sp.k !== 'seed' && sp.k !== 'at') sl[sp.k] = nudge(sp, sl[sp.k], sp.k === 'offset' ? 0.03 : 0.1);
  S.acc.seed = 1 + Math.floor(Math.random() * 999);
  renderSlots(); schedule();
}

/** Wire the Accents tab. */
export function initAccents() {
  S.acc = { src: 'out', seed: 1, slots: Array.from({ length: SLOTS }, () => freshSlot()) };
  const rs = $('#acc-recipe');
  rs.replaceChildren(h('option', { value: '', text: 'Choose…' }), ...Object.entries(ACCENT_RECIPES).map(([g, items]) => h('optgroup', { label: g }, Object.keys(items).map(k => h('option', { value: g + '|' + k, text: k })))));
  rs.onchange = e => { const v = e.target.value; e.target.value = ''; if (!v) return; const [g, k] = v.split('|'); loadRecipe(ACCENT_RECIPES[g][k]); toast(`Loaded ${k}`); };
  $('#acc-src').onchange = e => { S.acc.src = e.target.value; schedule(); };
  $('#acc-play').onclick = () => { const r = renderAccentResult(); if (r) play({ sr: r.sr, ch: r.ch }, 0, null, 'acc'); };
  $('#acc-mutate').onclick = mutate;
  $('#acc-clear').onclick = () => { S.acc.slots = Array.from({ length: SLOTS }, () => freshSlot()); renderSlots(); schedule(); };
  $('#acc-add').onclick = () => {
    const r = renderAccentResult(); if (!r) return;
    if (!hasAccents()) return toast('Turn on an accent or load a recipe first.');
    const s = r.src, snd = addSound(newSound(safeName(s.name) + '_acc', r.sr, D.copy(r.ch), s.bits, s.isFloat, 'render'), { select: true });
    toast(`Added ${snd.name} to the library and selected it.`);
  };
  renderSlots();
}

/** Called when the tab opens or the selected sound changes. */
export function refreshAccents() { if (S.tab === 'acc') renderAccentResult(); }
