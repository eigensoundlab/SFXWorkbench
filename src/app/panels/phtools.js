// SPDX-License-Identifier: Apache-2.0
/**
 * Playhead tools in the Effects tab, shown while Playhead analysis is on: Playhead's tools (see PH_TOOLS) run on the
 * selected source sound (without the effect chain) and the result joins the library, so it can be compared with the
 * original by ear and in the Playhead view, and processed further. The tools keep the sample rate; all but reverb on
 * the tails keep the length (it adds the tail). Fold to mono and widen the tails change the channel count, which is
 * what the user chose them for; the others keep it. The bit depth of the new sound is the source's.
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
  if (t.id === 'mono' && s.ch.length === 1) return toast(`${s.name} is already mono.`);
  busy = true; $('#pht-run').disabled = true; status.textContent = `Playhead is analysing ${s.name} and running ${t.name.toLowerCase()}…`;
  try {
    await new Promise(r => setTimeout(r, 30));     // let the status paint first
    const r = await phProcess(s, t.id, S.phTool.params[t.id]);
    // a tool that found nothing to do (level the events with a single event, for example) returns the sound unchanged:
    // say why instead of adding a copy to the library
    const same = o => o.channels.length === s.ch.length && o.channels.every((c, k) => c.length === s.ch[k].length && c.every((v, i) => v === s.ch[k][i]));
    if (r.outputs.every(same)) {
      status.textContent = `Nothing to change: ${r.report[0] || 'the result is the same as the source'}.`;
      $('#pht-report').replaceChildren();
      return;
    }
    let first = null;
    for (const o of r.outputs) {
      const snd = addSound(newSound(`${safeName(s.name)}_${o.suffix}`, o.sampleRate, o.channels, s.bits, s.isFloat, 'render'), { select: !first });
      first = first || snd;
    }
    status.textContent = `Added ${r.outputs.map(o => safeName(s.name) + '_' + o.suffix).join(' and ')} and selected it. The original is still in the library.`;
    $('#pht-report').replaceChildren(...r.report.slice(0, 6).map(line => h('span', { class: 'chip', text: line })));
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
