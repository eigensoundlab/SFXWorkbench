# Architecture

SFX Workbench is a static single-page app. The browser loads `index.html`, `css/style.css` and the ES module graph
rooted at `src/main.js`. There is no framework and no runtime dependency. The same sources are bundled by esbuild into
one offline HTML file (`npm run build`).

## Layers

```
src/config   data: effect specs, presets, tool and generator specs
   │
src/app      UI: state, rendering, events, playback, files        ──uses──▶  src/dsp, src/io
   │
src/main.js  boot and global wiring
```

`src/dsp` and `src/io` are pure: they import nothing from the UI, never touch the DOM or Web Audio, and run in Node.
This boundary is enforced by ESLint (`no-restricted-imports`) and is what makes the DSP testable.

## Data model

- **Channels**: `Float32Array[]`, one array per channel, equal lengths. All DSP takes and returns Channels.
- **Sound** (library item): `{ id, name, sr, ch, bits, isFloat, origin, ver, undo }`. `bits` and `isFloat` describe the
  source file and are the default save format. `ver` increments on every edit and is part of every cache key.
- **Effect**: `{ id, type, on, p }`. `type` keys both `FX` (processor) and `FXDEF` (UI definition).
- **Parameter spec**: `{ k, l, min, max, step, log, u, d, type, opts, when, whenNot }`. One format for effects, tools
  and the generator; `paramRow()` in `src/app/controls.js` turns a spec into a labelled control.

Shapes are documented as JSDoc typedefs in `src/dsp/types.js`.

## Signal flow

```
Source sound ──▶ effect chain (processChain) ──▶ finish() ──▶ output lane (heard, drawn, cached)
                                                       └──▶ encodeFor(): optional resample, peak ceiling, WAV encode ──▶ save
```

- The output is computed lazily by `ensureOut()` (`src/app/output.js`) and cached by
  `soundId:ver:chainJSON:finishingJSON`. Call `scheduleRender()` after anything that can change it.
- Finishing (`src/app/finish.js`) is part of what the user hears, so playback and saved files match. Variations, slices
  and loops run through the same finishing. Loops skip trimming and de-click fades, which would break the seam.
- The Slice & loop tools work on the source sound without the effect chain; the UI says so.

## UI state and rendering

All state lives in `S` (`src/app/state.js`). Modules mutate it and call the specific render function:

| Function | Module | Redraws |
|---|---|---|
| `renderLibrary` | library.js | the library list |
| `renderDeck` | deck.js | sound name, info chips, export menus, source waveform |
| `renderChain` | panels/effects.js | effect cards |
| `renderVarParams`, `renderVars` | panels/variations.js | variation settings and list |
| `renderMix` | panels/combine.js | mode chips, sources, parameters |
| `renderGenParams` | panels/generate.js | generator parameters |
| `updateSliceInfo` | panels/slice.js | take list and markers |
| `drawSrc`, `drawOut`, `drawGen` | draw.js | canvases |

Modules import each other's render functions; the cycles are safe because nothing is called while modules are being
evaluated, only after `boot()`.

## Saving

`saveBytes()` in `src/app/files.js` downloads via a temporary link. When the page runs inside a Claude artifact
(`window.claude` exists), it uses the platform `downloads` capability instead, which only accepts certain extensions, so
WAVs are wrapped in a zip there.

## Performance

All processing runs on the main thread. Typical game sounds (under 10 s) process in tens of milliseconds. Long files
(minutes) will block the UI; moving `processChain` and the morph modes into a Web Worker is on the roadmap.
