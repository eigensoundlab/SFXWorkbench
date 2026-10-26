// SPDX-License-Identifier: Apache-2.0
/** Effects tab: the chain editor, presets (built-in and saved in this browser), Mutate and Back. */
import { $, h, toast } from '../dom.js';
import { S, makeFx, nextFxId } from '../state.js';
import { FXDEF } from '../../config/effects.js';
import { PRESETS } from '../../config/presets.js';
import { paramRow, syncWhen, nudge } from '../controls.js';
import { playing } from '../audio.js';
import { scheduleRender } from '../output.js';

export function chainChanged() { scheduleRender(); }
export function pushChainHist() { S.chainHist.push(JSON.stringify(S.chain)); if (S.chainHist.length > 30) S.chainHist.shift(); }
export function renderChain() {
  const box = $('#chain');
  if (!S.chain.length) { box.replaceChildren(h('div', { class: 'empty', text: 'No effects yet. Pick a preset or add an effect; the output above updates as you go.' })); return; }
  box.replaceChildren(...S.chain.map((fx, idx) => {
    const def = FXDEF[fx.type];
    const card = h('div', { class: 'fx' + (fx.on ? '' : ' is-off') });
    const params = h('div', { class: 'fx-params' }, def.params.map(sp => paramRow(sp, fx.p, () => { syncWhen(card, fx.p); chainChanged(); }, `fx${fx.id}`)));
    card.append(
      h('div', { class: 'fx-head' },
        h('span', { class: 'fx-idx', text: String(idx + 1).padStart(2, '0') }),
        h('span', { class: 'fx-name', text: def.name }),
        h('label', { class: 'chk', title: 'Turn this effect on or off' }, h('input', { type: 'checkbox', id: `fx${fx.id}-on`, checked: fx.on, 'aria-label': 'Enable ' + def.name, onchange: e => { fx.on = e.target.checked; card.classList.toggle('is-off', !fx.on); chainChanged(); } })),
        h('button', { class: 'icon-btn', type: 'button', title: 'Move earlier', 'aria-label': 'Move earlier', disabled: idx === 0, onclick: () => moveFx(idx, -1) }, '↑'),
        h('button', { class: 'icon-btn', type: 'button', title: 'Move later', 'aria-label': 'Move later', disabled: idx === S.chain.length - 1, onclick: () => moveFx(idx, 1) }, '↓'),
        h('button', { class: 'icon-btn', type: 'button', title: 'Remove', 'aria-label': 'Remove ' + def.name, onclick: () => { pushChainHist(); S.chain.splice(idx, 1); renderChain(); chainChanged(); } }, '×')),
      ...(def.hint ? [h('p', { class: 'fx-hint', text: def.hint })] : []),
      params);
    syncWhen(card, fx.p);
    return card;
  }));
}
export function moveFx(i, d) { const j = i + d; if (j < 0 || j >= S.chain.length) return; [S.chain[i], S.chain[j]] = [S.chain[j], S.chain[i]]; renderChain(); chainChanged(); }
export function loadChain(list) { pushChainHist(); S.chain = list.map(([t, p]) => makeFx(t, p)); renderChain(); chainChanged(); }
export function mutateChain() {
  if (!S.chain.length) return toast('Add effects or load a preset first.');
  pushChainHist();
  for (const fx of S.chain) for (const sp of FXDEF[fx.type].params) if (!sp.type) fx.p[sp.k] = nudge(sp, fx.p[sp.k], 0.12);
  renderChain(); chainChanged();
  const p = playing(); if (S.out && p && p.where === 'out') setTimeout(() => $('#btn-play-out').click(), 160);
}
export function chainBack() {
  if (!S.chainHist.length) return toast('Nothing to go back to.');
  const prev = JSON.parse(S.chainHist.pop());
  S.chain = prev.map(f => ({ ...f, id: nextFxId() })); renderChain(); chainChanged();
}
/* user presets (this browser only) */
export const LS_KEY = 'sfx-workbench.presets.v1';
export function loadMine() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { return {}; } }
export function saveMine(m) { try { localStorage.setItem(LS_KEY, JSON.stringify(m)); return true; } catch (e) { return false; } }
export function renderPresetSelect() {
  const ps = $('#preset-sel'), mine = loadMine();
  const groups = Object.entries(PRESETS).map(([g, items]) => h('optgroup', { label: g }, Object.keys(items).map(k => h('option', { value: g + '|' + k, text: k }))));
  if (Object.keys(mine).length) groups.push(h('optgroup', { label: 'My presets' }, Object.keys(mine).map(k => h('option', { value: '~|' + k, text: k }))));
  ps.replaceChildren(h('option', { value: '', text: 'Choose…' }), ...groups);
  $('#my-presets').replaceChildren(...Object.keys(mine).map(k => h('span', { class: 'mine-chip' },
    h('button', { type: 'button', title: 'Load', onclick: () => { loadChain(mine[k]); toast(`Loaded ${k}`); } }, k),
    h('button', { type: 'button', title: 'Delete', 'aria-label': 'Delete preset ' + k, onclick: () => { const m = loadMine(); delete m[k]; saveMine(m); renderPresetSelect(); toast(`Deleted ${k}`); } }, '×'))));
}

/** Wire the effects tab: preset menu, add-effect menu, Mutate, Back, Clear and saving user presets. */
export function initEffects() {
  renderPresetSelect();
  $('#preset-sel').onchange = e => {
    const v = e.target.value; e.target.value = ''; if (!v) return;
    const [g, k] = v.split('|');
    const list = g === '~' ? loadMine()[k] : PRESETS[g][k];
    if (list) { loadChain(list); toast(`Loaded ${k}`); }
  };
  const af = $('#add-fx'), groups = {};
  for (const [k, d] of Object.entries(FXDEF)) (groups[d.group] = groups[d.group] || []).push(h('option', { value: k, text: d.name }));
  af.replaceChildren(h('option', { value: '', text: 'Choose…' }), ...Object.entries(groups).map(([g, opts]) => h('optgroup', { label: g }, opts)));
  af.onchange = e => { const k = e.target.value; e.target.value = ''; if (!k) return; S.chain.push(makeFx(k)); renderChain(); chainChanged(); };
  $('#btn-clear').onclick = () => { if (!S.chain.length) return; pushChainHist(); S.chain = []; renderChain(); chainChanged(); };
  $('#btn-mutate').onclick = mutateChain;
  $('#btn-back').onclick = chainBack;
  $('#btn-save-preset').onclick = () => {
    const name = $('#preset-name').value.trim();
    if (!name) return toast('Type a name for the preset first.');
    if (!S.chain.length) return toast('The chain is empty.');
    const m = loadMine(); m[name] = S.chain.map(f => [f.type, f.p]);
    if (!saveMine(m)) return toast('This browser blocked saving presets.', 'err');
    $('#preset-name').value = ''; renderPresetSelect(); toast(`Saved preset ${name}`);
  };
}
