// SPDX-License-Identifier: Apache-2.0
/**
 * Library rows (pure, no DOM): sounds with a `group` are gathered under one collapsible row, placed where the first of
 * them sits in the library, in their library order. Sounds without a group are rows of their own.
 * open[name] === false collapses a group; groups start open.
 */
export function libraryRows(sounds, open = {}) {
  const rows = [], seen = new Set();
  for (const s of sounds) {
    if (!s.group) { rows.push({ sound: s }); continue; }
    if (seen.has(s.group)) continue;
    seen.add(s.group);
    rows.push({ group: s.group, open: open[s.group] !== false, members: sounds.filter(x => x.group === s.group) });
  }
  return rows;
}

/** What tells a stem apart from the mix it came with: its name after the part they share, cut at a separator. */
export function stemShortName(stem, mix) {
  if (!mix) return stem;
  let i = 0;
  while (i < stem.length && i < mix.length && stem[i] === mix[i]) i++;
  const cut = Math.max(stem.lastIndexOf('-', i - 1), stem.lastIndexOf('_', i - 1), stem.lastIndexOf(' ', i - 1));
  const rest = stem.slice(cut + 1);
  return rest && cut > 0 ? rest : stem;
}
