# Instructions for coding agents

This file is for AI coding agents (Claude Code, Codex, Copilot, Cursor and others) and for humans who want the short version.
Read it before changing anything. Deeper detail lives in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DSP.md](docs/DSP.md).

## What this is

SFX Workbench is a static, client-side web app for designing game sound effects: record, edit, time-stretch, re-pitch,
generate (synth, physical impacts, textures), vary, morph, slice and loop. It runs entirely in the browser. There is no
backend, no account, no network use at runtime (apart from Google Fonts, which are optional). It is deployed to
GitHub Pages and also shipped as one offline HTML file.

## Commands

| Task | Command |
|---|---|
| Install dev tools | `npm ci` |
| Run locally | `npm start` then open http://localhost:8080 (ES modules do not load from `file://`) |
| Lint | `npm run lint` |
| Test | `npm test` (Node built-in test runner, no browser) |
| Build offline file | `npm run build` writes `dist/sfx-workbench.html` |
| Everything CI runs | `npm run check` |

Run `npm run check` before you finish. All three steps must pass with no lint warnings.

## Layout

```
index.html            markup only; loads css/style.css and src/main.js
css/style.css         all styles; colors are theme tokens on :root (light + dark)
src/main.js           entry: boot, tabs, keyboard shortcuts, theme redraw
src/dsp/              pure DSP, no DOM; `index.js` is the public API (imported as `D`)
src/io/               WAV and ZIP encoding/decoding, also pure
src/config/           data that drives the UI: effects, presets, tool and generator specs
src/app/              UI modules: state, deck, library, output, files, drawing, audio, recorder, folders, store
src/app/panels/       one module per tab: effects, variations, combine, accents, generate, slice
tests/                node:test suites, including config consistency checks
scripts/              build (esbuild) and dev server
docs/                 architecture, DSP notes, roadmap
```

## Rules that keep the project healthy

1. **DSP stays pure.** `src/dsp` and `src/io` must not import from `src/app` or `src/config`, touch the DOM, or use Web Audio.
   They take and return plain arrays so they run in Node tests. ESLint enforces the import boundary.
2. **Audio format.** Audio is `Channels` = `Float32Array[]` (one array per channel, equal lengths) plus a sample rate.
   Functions return new arrays and never mutate their input. See `src/dsp/types.js`.
3. **Quality is the product.** Never change a sound's sample rate, channel count or bit depth unless the user chose it
   (Finishing and Format controls). Unprocessed audio must round-trip bit-exactly; there is a test for it.
4. **No runtime dependencies.** Do not add npm packages to the app. Dev dependencies need a clear reason.
5. **Config over code.** Effects, presets, generator types and tool parameters are data in `src/config/`. The UI builds
   controls from parameter specs, so most features need no UI code at all.
6. **Every change has a test.** New DSP gets a unit test in `tests/`. `tests/config.test.js` must keep passing; it checks
   that config and DSP agree (keys, ranges, defaults, presets rendering without NaN).
7. **Keep the offline build working.** `index.html` must keep the exact stylesheet and module script tags that
   `scripts/build.mjs` replaces.
8. **UI copy.** Plain, specific words from the user's side ("Save output WAV", not "Export buffer"). No emoji.
   Errors say what happened and how to fix it.
9. **Styles.** Use the CSS tokens (`var(--accent)` etc.), never literal colors in components. Check both themes and a
   400 px wide viewport. Every control needs a label or `aria-label`.
10. **Small, focused changes.** One feature or fix per commit/PR. Update `CHANGELOG.md` under "Unreleased".

## Recipes

**Add an effect**
1. Add the processor to `FX` in `src/dsp/effects.js`: `(channels, sampleRate, params) => channels`.
2. Add the UI definition under the same key in `src/config/effects.js` (name, group, optional hint, params).
3. Add a unit test for the processor. `npm test` will also check the spec against the processor.

**Add a preset**
Add `'Name': [[effectType, params], ...]` to a category in `src/config/presets.js`. Only use param keys that exist
for that effect; the config test renders every preset on a footstep and fails on unknown keys or NaN.

**Add a generator sound type**
Add a function to the `types` of an engine in `src/config/generator.js` (`GEN_TYPES`, `IMPACT_TYPES`,
`TEXTURE_TYPES`) that returns partial params, randomised within sensible ranges. Use only keys of that engine's specs.

**Add a generator parameter or engine**
Parameters: add the spec to the engine's groups and read it in the render function (`synthGen` in
`src/dsp/generator.js`, `impactGen` in `src/dsp/physical.js`, `textureGen` in `src/dsp/textures.js`). Use
`show: { k: 'kind', in: [...] }` for rows that only apply to some kinds or causes.
Engine: write a pure `(params, sampleRate) => Channels` function, export it from `src/dsp/index.js`, and add an entry to
`ENGINES` with `render` set to its exported name. The config test renders every engine and dice type.

**Add a material or shape (Impact engine)**
Add it to `MATERIALS` or `SHAPES` in `src/dsp/physical.js`. Menus are built from those tables automatically.
Materials need `eta` (loss factor), `delta` (constant loss, 1/s), `noiseHz` and `grit` (0..1, contact noise share).

**Add an accent kind or recipe**
Kind: add a function to `ACCENT_KINDS` in `src/dsp/accents.js` returning `{ x, align }` (mono, peak 1; `align`
'after' starts at the anchor, 'before' ends at it). It gets the slot params and a context `{ src, t, a, sr, R, seed }`
with the mono source, the anchor sample and the structure analysis, so it can tune to `soundKey(a)`, use
`autoMaterial(a)` or excite something with the sound at `t`. Add its name to `ACCENT_NAMES` in
`src/config/accents.js` and list it in the `show` of the specs it uses.
Recipe: add a list of partial slot params to `ACCENT_RECIPES`. The accent tests render every kind and recipe.

**Add a morph mode**
Add the processor to `MORPH` in `src/dsp/morph.js` (`(A, B, sr, params) => channels`; A and B already share rate and
channel count), and a matching entry with `desc` and `params` in `MIX` in `src/config/tools.js`.

**Add a finishing option**
Extend `S.fin` in `src/app/state.js`, the control in `index.html` (Finishing row), its handler in `initDeck`
(`src/app/deck.js`) and the step in `finish()` (`src/app/finish.js`). Finishing is part of the output cache key.

## State and rendering in one paragraph

All UI state is the object `S` in `src/app/state.js`. Modules mutate `S` and then call the render function for what
changed (`renderLibrary`, `renderDeck`, `renderChain`, `renderMix`, ...). The output lane is computed lazily by
`ensureOut()` in `src/app/output.js` and cached by a key built from sound id, sound version, chain JSON and finishing
settings; call `scheduleRender()` after any change that affects it. Every edit to a sound increments `sound.ver`.

## Things that look odd but are intentional

- `window.claude` checks in `src/app/files.js`: the page can also run as a Claude artifact, where downloads go through a
  platform capability and must be zipped. On GitHub Pages and offline this path is never taken.
- Waveform canvases cache an offscreen image in `canvas._c`; the cache key includes theme colors so theme changes redraw.
- The recorder (`src/app/recorder.js`) creates its own AudioContext at the input's sample rate; playback uses another
  one. Keep them separate so recordings are never resampled.
- `src/app/folders.js` wraps real directory handles and uploaded file trees behind one small node interface (`list()`).
  Directory handles are stored in IndexedDB via `src/app/store.js`, never in localStorage.
- The STFT uses 75% overlap with Hann analysis and synthesis windows and normalises by the summed window power.
