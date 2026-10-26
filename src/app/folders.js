// SPDX-License-Identifier: Apache-2.0
/**
 * Folder browser in the library rail: pin working folders, browse them, preview sounds and add them to the library.
 *
 * Chrome, Edge and other Chromium browsers support the File System Access API: folders are opened with
 * showDirectoryPicker() and their handles are kept in IndexedDB, so pinned folders come back on the next visit
 * (the browser asks for permission again once per session). Other browsers fall back to a folder upload
 * (<input webkitdirectory>), which works for the current visit only.
 */
import { $, h, playIcon, toast } from './dom.js';
import { khz, chLabel, bitsLabel, fmtDur } from './format.js';
import { play } from './audio.js';
import { decodeFile, importFiles } from './files.js';
import { kvGet, kvSet } from './store.js';

const AUDIO_EXT = /\.(wav|wave|aif|aiff|aifc|mp3|ogg|oga|opus|flac|m4a|aac|webm)$/i;
const MAX_ROWS = 2000;
const canPin = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

const F = {
  pins: [],        // [{ id, name, handle? , tree? }]
  stack: [],       // open path: [{ name, dir }] where dir is a node
  entries: [],     // listing of the current folder
  sel: -1, filter: '', auto: true,
  cache: new Map(), // file key -> decoded audio (small LRU)
};
let pinId = 1;

/* ---------- nodes: one interface over real handles and uploaded file trees ---------- */
const byName = (a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : a.kind === 'dir' ? -1 : 1);

function handleNode(handle) {
  return {
    name: handle.name,
    async list() {
      const out = [];
      for await (const entry of handle.values()) {
        if (entry.kind === 'directory') out.push({ kind: 'dir', name: entry.name, node: handleNode(entry) });
        else if (AUDIO_EXT.test(entry.name)) out.push({ kind: 'file', name: entry.name, getFile: () => entry.getFile() });
      }
      return out.sort(byName);
    },
  };
}

function treeNode(name, tree) {
  return {
    name,
    async list() {
      const out = [];
      for (const [k, v] of Object.entries(tree.dirs)) out.push({ kind: 'dir', name: k, node: treeNode(k, v) });
      for (const f of tree.files) out.push({ kind: 'file', name: f.name, getFile: async () => f });
      return out.sort(byName);
    },
  };
}

/** Build a folder tree from an <input webkitdirectory> file list. */
function treeFromFiles(files) {
  const root = { dirs: {}, files: [] };
  let rootName = 'Folder';
  for (const f of files) {
    if (!AUDIO_EXT.test(f.name)) continue;
    const parts = (f.webkitRelativePath || f.name).split('/');
    rootName = parts.length > 1 ? parts[0] : rootName;
    let t = root;
    for (const d of parts.slice(1, -1)) t = t.dirs[d] || (t.dirs[d] = { dirs: {}, files: [] });
    t.files.push(f);
  }
  return { name: rootName, tree: root };
}

/* ---------- pins ---------- */
async function loadPins() {
  if (!canPin) return;
  const saved = await kvGet('folders');
  if (Array.isArray(saved)) F.pins = saved.filter(p => p && p.handle).map(p => ({ id: pinId++, name: p.name, handle: p.handle }));
}
const savePins = () => (canPin ? kvSet('folders', F.pins.filter(p => p.handle).map(p => ({ name: p.name, handle: p.handle }))) : Promise.resolve(false));

async function addFolder() {
  if (canPin) {
    let handle;
    try { handle = await window.showDirectoryPicker({ id: 'sfx-workbench', mode: 'read' }); } catch (e) { return; }
    let pin = null;
    for (const p of F.pins) if (p.handle && p.handle.isSameEntry && await p.handle.isSameEntry(handle)) pin = p;
    if (!pin) { pin = { id: pinId++, name: handle.name, handle }; F.pins.push(pin); if (!(await savePins())) toast('Opened the folder, but this browser could not remember it for next time.'); }
    await openPin(pin);
  } else {
    $('#dir-in').click();
  }
}

async function openPin(pin) {
  if (pin.handle) {
    try {
      if (pin.handle.queryPermission && (await pin.handle.queryPermission({ mode: 'read' })) !== 'granted') {
        if ((await pin.handle.requestPermission({ mode: 'read' })) !== 'granted') { toast('The browser did not allow reading this folder. Click it again to retry.', 'err'); return; }
      }
    } catch (e) { toast('This folder is no longer available. Remove it and add it again.', 'err'); return; }
    F.stack = [{ name: pin.name, dir: handleNode(pin.handle) }];
  } else {
    F.stack = [{ name: pin.name, dir: treeNode(pin.name, pin.tree) }];
  }
  F.filter = ''; $('#dir-filter').value = '';
  renderPins(pin.id);
  await refresh();
}

function removePin(pin) {
  F.pins = F.pins.filter(p => p !== pin);
  savePins();
  if (F.stack.length && F.stack[0].name === pin.name) { F.stack = []; F.entries = []; }
  renderPins(); renderList();
}

/* ---------- listing ---------- */
async function refresh() {
  const top = F.stack[F.stack.length - 1];
  if (!top) { F.entries = []; renderList(); return; }
  $('#dir-info').textContent = 'Reading folder…';
  try { F.entries = await top.dir.list(); } catch (e) { console.error(e); F.entries = []; toast('Could not read this folder: ' + e.message, 'err'); }
  F.sel = -1;
  renderList();
}
const visible = () => (F.filter ? F.entries.filter(e => e.name.toLowerCase().includes(F.filter)) : F.entries);

function renderPins(activeId) {
  const ul = $('#dir-pins');
  if (!F.pins.length) {
    ul.replaceChildren(h('li', { class: 'hint', text: canPin ? 'No folders yet. Add one to browse and preview its sounds.' : 'No folder open.' }));
    return;
  }
  ul.replaceChildren(...F.pins.map(p => h('li', { class: 'pin' + (p.id === activeId ? ' is-sel' : '') },
    h('button', { class: 'pin-name', type: 'button', title: p.handle ? 'Open this folder' : 'Open (this visit only)', onclick: () => openPin(p) }, p.name),
    h('button', { class: 'lib-del', type: 'button', title: 'Remove from the list', 'aria-label': 'Remove folder ' + p.name, onclick: () => removePin(p) }, '×'))));
}

function renderCrumbs() {
  $('#dir-crumbs').replaceChildren(...F.stack.flatMap((s, i) => [
    i ? h('span', { class: 'crumb-sep', 'aria-hidden': 'true', text: '/' }) : null,
    h('button', { class: 'crumb', type: 'button', disabled: i === F.stack.length - 1, onclick: () => { F.stack = F.stack.slice(0, i + 1); refresh(); } }, s.name),
  ]).filter(Boolean));
}

function renderList() {
  renderCrumbs();
  const ul = $('#dir-list'), list = visible();
  if (!F.stack.length) { ul.replaceChildren(); $('#dir-info').textContent = ''; return; }
  const files = list.filter(e => e.kind === 'file').length;
  ul.replaceChildren(...list.slice(0, MAX_ROWS).map((e, i) => {
    if (e.kind === 'dir') {
      return h('li', { class: 'dir-row is-dir' }, h('span', { class: 'dir-glyph', 'aria-hidden': 'true', text: '▸' }),
        h('button', { class: 'dir-name', type: 'button', onclick: () => openDir(e) }, e.name));
    }
    return h('li', { class: 'dir-row' + (i === F.sel ? ' is-sel' : ''), 'data-i': i, role: 'option', 'aria-selected': i === F.sel ? 'true' : 'false' },
      h('button', { class: 'icon-btn play', type: 'button', title: 'Play', 'aria-label': 'Play ' + e.name, onclick: () => { selectRow(i); preview(e, true); } }, playIcon()),
      h('button', { class: 'dir-name', type: 'button', title: 'Click to preview, double-click to add to the library', onclick: () => { selectRow(i); if (F.auto) preview(e); }, ondblclick: () => addEntry(e) }, e.name),
      h('button', { class: 'icon-btn', type: 'button', title: 'Add to library', 'aria-label': 'Add ' + e.name + ' to the library', onclick: () => addEntry(e) }, '+'));
  }));
  const more = list.length > MAX_ROWS ? ` Showing the first ${MAX_ROWS}; type in the filter to narrow it down.` : '';
  $('#dir-info').textContent = list.length ? `${files} sound${files === 1 ? '' : 's'}${list.length > files ? `, ${list.length - files} folder${list.length - files === 1 ? '' : 's'}` : ''}.${more}` : (F.filter ? 'Nothing matches the filter.' : 'No sounds or folders here.');
}

function openDir(e) { F.stack.push({ name: e.name, dir: e.node }); F.filter = ''; $('#dir-filter').value = ''; refresh(); }

function selectRow(i) {
  F.sel = i;
  for (const li of $('#dir-list').querySelectorAll('.dir-row[data-i]')) {
    const on = +li.dataset.i === i;
    li.classList.toggle('is-sel', on); li.setAttribute('aria-selected', on ? 'true' : 'false');
    if (on) li.scrollIntoView({ block: 'nearest' });
  }
}

async function load(e) {
  const key = F.stack.map(s => s.name).join('/') + '/' + e.name;
  if (F.cache.has(key)) return F.cache.get(key);
  const dec = await decodeFile(await e.getFile());
  F.cache.set(key, dec);
  if (F.cache.size > 24) F.cache.delete(F.cache.keys().next().value);
  return dec;
}

async function preview(e) {
  try {
    const dec = await load(e), n = dec.ch[0] ? dec.ch[0].length : 0;
    $('#dir-info').textContent = `${e.name}: ${khz(dec.sr)} kHz · ${dec.decoded ? 'compressed' : bitsLabel(dec)} · ${chLabel(dec.ch.length)} · ${fmtDur(n / dec.sr)} s`;
    play({ sr: dec.sr, ch: dec.ch }, 0, null, 'dir');
  } catch (err) {
    console.error(err); toast(`${e.name}: ${err.message || 'could not be read as audio'}`, 'err');
  }
}

async function addEntry(e) {
  try { await importFiles([await e.getFile()]); } catch (err) { toast(`${e.name}: ${err.message}`, 'err'); }
}

function onKey(ev) {
  const list = visible(), files = list.map((e, i) => (e.kind === 'file' ? i : -1)).filter(i => i >= 0);
  const move = d => {
    if (!files.length) return;
    const pos = files.indexOf(F.sel), next = files[Math.max(0, Math.min(files.length - 1, pos < 0 ? (d > 0 ? 0 : files.length - 1) : pos + d))];
    selectRow(next); if (F.auto) preview(list[next]);
  };
  if (ev.key === 'ArrowDown') { ev.preventDefault(); move(1); }
  else if (ev.key === 'ArrowUp') { ev.preventDefault(); move(-1); }
  else if (ev.key === 'Enter' && F.sel >= 0 && list[F.sel]) { ev.preventDefault(); addEntry(list[F.sel]); }
  else if ((ev.key === 'ArrowLeft' || ev.key === 'Backspace') && F.stack.length > 1 && ev.target.id !== 'dir-filter') { ev.preventDefault(); F.stack.pop(); refresh(); }
}

/** Wire the folders view of the rail. */
export async function initFolders() {
  $('#dir-add').textContent = canPin ? 'Add folder' : 'Open folder';
  $('#dir-note').textContent = canPin
    ? 'Folders stay in this list between visits. Arrow keys move and preview, Enter adds to the library.'
    : 'This browser cannot remember folders, so pick the folder again next visit (Chrome and Edge can keep them). Arrow keys move and preview, Enter adds.';
  $('#dir-add').onclick = addFolder;
  $('#dir-in').addEventListener('change', e => {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length) return;
    const { name, tree } = treeFromFiles(files), pin = { id: pinId++, name, tree };
    F.pins.push(pin); openPin(pin);
  });
  $('#dir-filter').addEventListener('input', e => { F.filter = e.target.value.trim().toLowerCase(); F.sel = -1; renderList(); });
  $('#dir-auto').onchange = e => { F.auto = e.target.checked; };
  $('#dir-list').addEventListener('keydown', onKey);
  $('#dir-filter').addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); $('#dir-list').focus(); onKey(e); } });
  await loadPins();
  renderPins(); renderList();
}
