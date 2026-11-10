// SPDX-License-Identifier: Apache-2.0
/**
 * The Kurator link: sounds sent from Kurator (a local asset manager) load into the library, and while the link is
 * on, everything saved (output, source, variations, slices, loops) goes back to Kurator as new files instead of
 * downloads: into the folder chosen in Kurator, tagged there, with the Kurator sounds it was made from as its
 * source. Kurator never overwrites anything. The pure part (address parsing, URLs) is in kuratorlink.js.
 *
 * Chrome and Edge ask once whether this site may connect to apps on this device (Local Network Access).
 * Safari does not let an https page reach http://127.0.0.1, so the link does not work there.
 */
import { $, toast } from './dom.js';
import { cur } from './state.js';
import { importFiles, setSaveTarget } from './files.js';
import { renderLibrary } from './library.js';
import { LINK_FETCH, parseLink, stripLink, manifestUrl, fileUrl, saveUrl, describe } from './kuratorlink.js';

const KEY = 'sfx-workbench-kurator';
const K = { link: null, manifest: null, toKurator: true, loaded: false };
// Save buttons: their label while saves go to Kurator
const LABELS = { 'btn-save': 'Send output to Kurator', 'btn-save-src': 'Send source to Kurator', 'btn-save-all': 'Send all to Kurator',
  'sl-save': 'Send all to Kurator', 'lp-save': 'Send loop to Kurator' };

async function permission() {
  for (const name of ['loopback-network', 'local-network-access']) {
    try { return (await navigator.permissions.query({ name })).state; } catch (e) { /* not known to this browser */ }
  }
  return 'unknown';
}

async function ask(url, opts = {}) {
  let r;
  try { r = await fetch(url, { ...LINK_FETCH, ...opts }); }
  catch (e) { const err = new Error('Kurator could not be reached'); err.unreachable = true; throw err; }
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).detail || msg; } catch (e) { /* not JSON */ }
    const err = new Error(msg); err.status = r.status; throw err;
  }
  return r;
}

function show(msg, { retry = false, err = false } = {}) {
  $('#kur-bar').hidden = false;
  $('#kur-msg').textContent = msg;
  $('#kur-msg').classList.toggle('is-err', err);
  $('#kur-retry').hidden = !retry;
  $('#kur-save').hidden = !K.manifest;
}

function syncTarget() {
  const on = !!(K.manifest && K.toKurator);
  setSaveTarget(on ? { send } : null);
  $('#kur-to-k').setAttribute('aria-pressed', on ? 'true' : 'false');
  $('#kur-to-d').setAttribute('aria-pressed', on ? 'false' : 'true');
  for (const [id, label] of Object.entries(LABELS)) {
    const b = $('#' + id);
    if (!b) continue;
    if (!b.dataset.label) b.dataset.label = b.textContent;
    b.textContent = on ? label : b.dataset.label;
  }
}

/** The Kurator sounds a result was made from: the sound it was saved from, else the selected one. */
function sourcesOf(meta) {
  const own = meta && Number.isInteger(meta.kur) ? meta.kur : null;
  const sel = cur();
  return [own ?? (sel && Number.isInteger(sel.kur) ? sel.kur : null)].filter(n => n != null);
}

async function send(files) {
  let ok = 0;
  const failed = [];
  for (const f of files) {
    try {
      const r = await ask(saveUrl(K.link, f.name, sourcesOf(f.meta)), { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: new Blob([f.bytes], { type: 'audio/wav' }) });
      const got = await r.json();
      ok++;
      if (files.length === 1) toast(`Sent to Kurator: ${got.name} in ${K.manifest.dest}`);
    } catch (e) {
      failed.push(e);
      if (e.status === 404) break;                       // the link has ended: the rest would fail too
    }
  }
  if (files.length > 1 && ok) toast(`Sent ${ok} sound${ok === 1 ? '' : 's'} to Kurator (${K.manifest.dest})${failed.length ? `; ${failed.length} failed` : ''}`, failed.length ? 'err' : undefined);
  if (failed.length) {
    const e = failed[0];
    const why = e.unreachable ? 'Kurator is not running or cannot be reached.' : e.message;
    toast(`Kurator did not take it: ${why} Choose "As download" in the Kurator box to keep it.`, 'err');
    if (e.status === 404 || e.unreachable) show(e.unreachable ? 'Kurator cannot be reached. Start it, then try again, or save as download.' : e.message, { err: true, retry: !!e.unreachable });
  }
  return failed.length === 0;
}

async function connect() {
  show('Connecting to Kurator…');
  let m;
  try { m = await (await ask(manifestUrl(K.link))).json(); }
  catch (e) {
    if (e.status === 404 || e.status === 403) { show(e.message, { err: true }); forget(); return; }
    const state = await permission();
    show(state === 'denied'
      ? 'This browser blocks connections to apps on this device for this site. Allow it in the site settings (the icon left of the address: Apps on device or Local network access), then reload.'
      : state === 'prompt'
        ? 'Kurator sent sounds. Click Load, then allow the browser to connect to apps on this device.'
        : 'Kurator cannot be reached. Is it running? Start it, then click Load.', { err: state !== 'prompt', retry: state !== 'denied' });
    return;
  }
  K.manifest = m;
  show(describe(m));
  syncTarget();
  if (K.loaded) return;
  K.loaded = true;
  const files = [];
  for (const f of m.files) {
    if (!f || f.missing) continue;
    try {
      const blob = await (await ask(fileUrl(K.link, f.n))).blob();
      const file = new File([blob], f.name, { type: blob.type });
      file.kur = f.n;
      files.push(file);
    } catch (e) { toast(`${f.name}: ${e.message}`, 'err'); }
  }
  if (!files.length) return;
  const made = await importFiles(files);
  made.forEach((s, i) => { if (s) { s.kur = files[i].kur; s.origin = 'kurator'; } });
  renderLibrary();
}

function forget() {
  K.link = null; K.manifest = null;
  try { sessionStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
  setSaveTarget(null);
  syncTarget();
}

function stored() {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    return v ? parseLink('#' + new URLSearchParams({ kurator: v.server, link: v.token })) : null;
  } catch (e) { return null; }
}

/** Wire the Kurator bar; connect when the page was opened from Kurator (or reloaded after that). */
export function initKurator() {
  let link = parseLink(location.hash);
  if (link) {
    try { sessionStorage.setItem(KEY, JSON.stringify(link)); } catch (e) { /* storage blocked: this visit only */ }
    history.replaceState(null, '', location.pathname + location.search + stripLink(location.hash));
  } else {
    link = stored();       // reloaded: the same link (sounds load again, as the library starts fresh)
  }
  $('#kur-retry').onclick = () => connect();
  $('#kur-to-k').onclick = () => { K.toKurator = true; syncTarget(); };
  $('#kur-to-d').onclick = () => { K.toKurator = false; syncTarget(); };
  $('#kur-close').onclick = () => { forget(); $('#kur-bar').hidden = true; toast('Disconnected from Kurator. Saves go to downloads again.'); };
  if (!link) return;
  K.link = link;
  connect();
}
