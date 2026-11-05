// SPDX-License-Identifier: Apache-2.0
/**
 * The look bar above the source lane, shown with the Playhead view: which of Playhead's looks to draw (or a pasted
 * look code), the legend of what is drawn, and a link to the look feedback form. Looks a sound cannot use (Structure
 * needs music, for example) stay in the menu but are disabled for that sound.
 */
import { $, h, toast } from './dom.js';
import { S, cur } from './state.js';
import { PH, setLook, phLooks, phLookFits, phCheckCode, phLookCode, phFeedbackUrl, phLegend, phDoc } from './playhead.js';

let shownFor = '', redraw = () => {};

/** The look's document: the source sound's, when Playhead has it (null while it is being analysed). */
function sourceDoc() {
  const s = cur();
  return s ? phDoc('s' + s.id + ':' + s.ver, s, null, null) : null;
}

/** Fill and show or hide the look bar. Cheap enough to call after every draw of the source lane. */
export function renderLookBar() {
  const bar = $('#ph-lookbar');
  if (!bar) return;
  bar.hidden = !(PH.on && S.view === 'ph');
  if (bar.hidden) return;
  const doc = sourceDoc(), sel = $('#ph-look'), code = $('#ph-code'), custom = !phLooks().some(([k]) => k === PH.look);
  const sig = [PH.look, doc ? doc.source.duration + ':' + doc.profile : 'none'].join('|');
  if (sig !== shownFor) {
    shownFor = sig;
    sel.replaceChildren(...phLooks().map(([k, name, desc]) => {
      const fits = phLookFits(doc, k);
      return h('option', { value: k, title: desc, disabled: !fits && k !== PH.look, text: name + (fits ? '' : ' (not for this sound)') });
    }), h('option', { value: 'custom', text: 'Custom look code…' }));
    sel.value = custom ? 'custom' : PH.look;
    code.hidden = !custom;
    if (custom) code.value = PH.look;
  }
  $('#ph-legend').textContent = doc ? phLegend(doc) : '';
  $('#ph-feedback').href = phFeedbackUrl();
}

function apply(look) {
  setLook(look);
  shownFor = '';
  redraw();
}

/** Wire the look bar. onChange redraws the lanes. */
export function initLookBar(onChange) {
  redraw = onChange;
  $('#ph-look').onchange = e => {
    if (e.target.value === 'custom') { const c = $('#ph-code'); c.hidden = false; c.value = phLookCode() === 'auto' ? '' : phLookCode(); c.focus(); return; }
    $('#ph-code').hidden = true;
    apply(e.target.value);
  };
  $('#ph-code').onchange = e => {
    const c = phCheckCode(e.target.value);
    if (!c) { toast('Playhead did not understand that look code. Example: wave:harshness,lane:activity,ticks:events', 'err'); return; }
    e.target.value = c;
    apply(c);
  };
}
