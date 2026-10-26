# SFX Workbench

A fast, browser-based workbench for game sound effects. Record, cut, reverse, re-pitch, stretch, generate, vary, morph,
slice and loop sounds, then save WAV files at the source's sample rate and bit depth. Everything runs locally in your browser;
no audio is uploaded.

**Use it:** https://eigensoundlab.github.io/SFXWorkbench/
**Offline copy:** download [`sfx-workbench.html`](https://eigensoundlab.github.io/SFXWorkbench/download/sfx-workbench.html)
and open it in any modern browser.

## Features

- **Record** from a microphone or interface: raw input, native sample rate, sound-activated start with pre-roll,
  automatic stop after silence so you can perform take after take.
- **Folders:** pin your sound library folders, browse and preview with the arrow keys, add with Enter. WAV, AIFF, FLAC,
  MP3, OGG and more.
- **Editing:** trim, delete, silence, reverse, fades, normalize, gain, trim silence, to mono, with undo.
- **Effect chain** with 23 effects, including a resonator body (play a sound through virtual metal, wood or glass) and
  dispersion / spring. Also: speed/pitch with sweeps, time stretch (clean, spectral, extreme smear), pitch shift
  that keeps length, filter with sweep, EQ, distortion, bitcrush, noise reduction, ring modulator, tremolo,
  flanger/chorus, echo, reverb, transient shaper, compressor, gain, fades, normalize, loudness, DC removal.
- **51 presets** in six groups: weapons, power and devices, movement and foley, inventory and UI, impacts, space and
  character. Save your own chains as presets in the browser. Mutate nudges every setting a little; Back undoes it.
- **Compare:** press B while the output plays to switch effects on and off at the same position.
- **Variations:** seeded random pitch, length, volume, tone, start offset and reverse, with a file-name pattern such as
  `{name}_var{nn}`. Play all, save all as one zip.
- **Combine and morph:** layer stack, spectral morph, cross-synthesis, convolution, envelope transfer, ring multiply and
  granular weave.
- **Generate** with three engines, each with dice types to roll, mutate and refine:
  - *Impact*: a physical model built as **cause → object → aftermath**. An action (hit, scrape, roll, crack) excites a
    resonant object (11 materials, 7 shapes), followed by bounces, rolling, debris and rumble. Ammo shells, coins,
    glass shatter, wall collapse, ice cracks, blaster wires, ricochets and more.
  - *Texture*: gravel and debris, sparks, electric arcs, fire, bubbles and drips, rain, wind, energy fields, rumble.
  - *Synth*: classic one-shot synthesis in the spirit of sfxr.
  - "Add as layer" sends a generated sound straight into the layer stack to build action + effect designs.
- **Slice and loop:** split many takes in one recording at the silences; build seamless loops and start/loop/stop sets
  for looping devices.
- **Finishing on everything you save:** loudness target (LUFS), mono or stereo, silence trim, DC removal, de-click
  edges, peak ceiling. Formats: source, 16/24-bit PCM or 32-bit float; any common sample rate.
- **Waveform or spectrum** display, light and dark themes, keyboard shortcuts.

### Keyboard shortcuts

| Key | Action |
|---|---|
| Space | Play output / stop |
| Shift+Space | Play source (selection if any) |
| B | Effects on/off (compare) |
| Esc | Stop and clear the selection |
| Delete / Backspace | Delete the selection |
| Ctrl/Cmd+Z | Undo the last edit |

## Development

Requires Node.js 22 or newer.

```sh
npm ci          # install dev tools (esbuild, eslint)
npm start       # dev server at http://localhost:8080
npm test        # unit and consistency tests (Node, no browser)
npm run lint
npm run build   # dist/sfx-workbench.html, the single-file offline build
npm run check   # lint + test + build, as CI runs it
```

The app has no runtime dependencies and no build step for development: `index.html` loads `src/main.js` as an ES module.
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the module map and data flow, [docs/DSP.md](docs/DSP.md) for the
algorithms, and [docs/ROADMAP.md](docs/ROADMAP.md) for planned work.

Working with an AI coding assistant? [AGENTS.md](AGENTS.md) has the project rules and recipes for common changes.

### Deployment

Pushing to `main` runs `.github/workflows/pages.yml`, which lints, tests, builds and publishes the site with the offline
file under `/download/`. One-time setup: repository **Settings → Pages → Source: GitHub Actions**.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Browser support

Everything works in current Chrome, Edge, Firefox and Safari. Pinned folders that persist between visits need the
File System Access API (Chrome, Edge and other Chromium browsers); other browsers open a folder for the current visit.
Recording needs a secure page (the GitHub Pages site, or `npm start` on localhost) and microphone permission.

## License and citation

Licensed under the [Apache License 2.0](LICENSE). Copyright 2026 Daniel Sandner
([ORCID 0000-0002-1041-814X](https://orcid.org/0000-0002-1041-814X)).
If you use SFX Workbench in research or teaching, please cite it using [CITATION.cff](CITATION.cff).
