// SPDX-License-Identifier: Apache-2.0
/**
 * Playhead tools in the Effects tab, shown while Playhead analysis is on: Playhead's de-harsh and attack-and-body run
 * on the selected source sound (without the effect chain) and the result joins the library, so it can be compared
 * with the original by ear and in the Playhead view, and processed further. The tools keep the sample rate, channel
 * count and length; the bit depth of the new sound is the source's.
 */
import { $, h, toast } from '../dom.js';
import { S, cur, newSound } from '../state.js';
import { defaults, safeName } from '../format.js';
import { paramRow, syncWhen } from '../controls.js';
import { PH, phToolSpecs, phProcess } from '../playhead.js';
import { addSound } from '../library.js';
import { play } from '../audio.js';

let specs = null, busy = false;
const tool = () => specs.find(t => t.id === S.phTool.id) || specs[0];

/** Show or hide the panel and build its controls from Playhead's tool definitions. */
export function renderPhTools() {
  const box = $('#ph-tools');
  box.hidden = !PH.on;
  if (box.hidden) return;
  specs = specs || phToolSpecs();
  if (!S.phTool) S.phTool = { id: specs[0].id, params: Object.fromEntries(specs.map(t => [t.id, defaults(t.params)])) };
  const t = tool(), p = S.phTool.params[t.id], sel = $('#pht-tool'), grid = $('#pht-params');
  sel.replaceChildren(...specs.map(x => h('option', { value: x.id, text: x.name })));
  sel.value = t.id;
  $('#pht-desc').textContent = t.desc;
  grid.replaceChildren(...t.params.map(sp => paramRow(sp, p, () => syncWhen(grid, p), 'pht-' + t.id)));
  syncWhen(grid, p);
}

async function run() {
  const s = cur();
  if (!s) return toast('Select a sound in the library first.');
  if (s.ch.length > 2) return toast('Playhead tools work on mono and stereo sounds. Fold this one to stereo or mono first.', 'err');
  if (busy) return;
  const t = tool(), status = $('#pht-status');
  busy = true; $('#pht-run').disabled = true; status.textContent = `Playhead is analysing ${s.name} and running ${t.name.toLowerCase()}…`;
  try {
    await new Promise(r => setTimeout(r, 30));     // let the status paint first
    const r = await phProcess(s, t.id, S.phTool.params[t.id]);
    let first = null;
    for (const o of r.outputs) {
      const snd = addSound(newSound(`${safeName(s.name)}_${o.suffix}`, o.sampleRate, o.channels, s.bits, s.isFloat, 'render'), { select: !first });
      first = first || snd;
    }
    status.textContent = `Added ${r.outputs.map(o => safeName(s.name) + '_' + o.suffix).join(' and ')} and selected it. The original is still in the library.`;
    $('#pht-report').replaceChildren(...r.report.slice(0, 4).map(line => h('span', { class: 'chip', text: line })));
    if (first) play(first, 0, null, 'src');
  } catch (e) {
    console.error(e); status.textContent = ''; toast(`${t.name} could not run: ${e.message || e}`, 'err');
  } finally {
    busy = false; $('#pht-run').disabled = false;
  }
}

/** Wire the panel. */
export function initPhTools() {
  $('#pht-tool').onchange = e => { S.phTool.id = e.target.value; $('#pht-report').replaceChildren(); $('#pht-status').textContent = ''; renderPhTools(); };
  $('#pht-run').onclick = run;
}
