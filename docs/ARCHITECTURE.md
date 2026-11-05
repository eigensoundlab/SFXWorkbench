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

src/vendor   copied-in builds (Playhead), used by src/app only
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

## Inputs: recorder and folders

- `src/app/recorder.js` opens the microphone with browser voice processing off (unless the user turns "Raw input"
  off), creates a dedicated AudioContext at the track's sample rate and captures float samples with an AudioWorklet
  (code loaded from a Blob URL so it works in the single-file build). States: off, idle (meter only), armed (waiting for
  the threshold, keeping a 150 ms pre-roll), recording. Finished takes become library sounds named `rec_NN`.
- `src/app/folders.js` lists folders through a small node interface (`{ name, list() }`) with two implementations: File
  System Access handles (persisted in IndexedDB by `src/app/store.js`) and a tree built from an
  `<input webkitdirectory>` upload. Previews are decoded by `decodeFile()` in `src/app/files.js` and cached (24 files).

## Generator engines

`ENGINES` in `src/config/generator.js` lists the Generate tab engines. Each names its DSP render function, its parameter
groups and its dice types. `src/app/panels/generate.js` is generic: it builds the engine switch, dice buttons and
parameter panels from that table and keeps separate parameters per engine in `S.gParams`.

## Accents

`src/dsp/accents.js` analyses the structure of a sound (`analyzeStructure`) and mixes accents into it
(`renderAccents`). Anchors are resolved to sample positions from the analysis, each accent kind renders a mono grain
from the slot params and a context (source, anchor, analysis), and grains are mixed at a level relative to the local
loudness. Lead-in accents that start before 0 shift the whole sound by `lead` samples. The panel
(`src/app/panels/accents.js`) builds on the sound with its effect chain but without finishing, so finishing still
applies when the result is saved. Variations call `renderAccents` with `jitter: true` and a per-file seed.

## Generator engines with an input sound

Two engines read the selected library sound, kept outside the engine params so rolling types keeps it: Resynth
(`measure: true`, the measurement in `S.gMeasured`) and Reaction (`drive: true`, the action in `S.gDrive` with the
chosen "Follow" curve). The panel turns the action into a drive curve (`levelCurve`, or a Playhead curve through
`normalizeCurve`) and passes it to `reactionGen` as `driveCurve`, `driveRate` and `actionCh`.

## Playhead (optional analysis)

`src/app/playhead.js` wraps the vendored Playhead core. `PH.on` is the user's switch (localStorage, default off). Every
use goes through `phDoc(key, sound, slot, onReady)`: it returns the cached Playhead document or null, starts the
analysis if needed and calls `onReady` once when it arrives. Analyses run one at a time; a newer request in the same
slot ('src', 'out', 'acc', 'ref', 'gen', 'drv', 'mix') replaces an older one that has not started, so dragging a
slider does not queue stale work. Keys follow the audio (sound id and version, output cache key, generator version).

The look of the Playhead view is `PH.look` (a look name or code, remembered): `drawPhStrip` passes it to Playhead's
`drawStrip`, and `src/app/lookbar.js` offers the looks (`lookFits` disables those a sound cannot use), shows the
legend and links to the feedback form. Playhead's own tools run through `phProcess` (`src/app/panels/phtools.js`) on
the source sound and add their outputs to the library.

The DSP never imports Playhead (ESLint checks). The panels turn Playhead results into plain data first: events become
`[{ at, strength }]` for `renderAccents`, curves become 0..1 arrays for `reactionGen` and the morphs (`morphAmount`).
With `PH.on` false none of this runs and the panels pass nothing extra, which is what makes the with/without comparison
exact.

## Saving

`saveBytes()` in `src/app/files.js` downloads via a temporary link. When the page runs inside a Claude artifact
(`window.claude` exists), it uses the platform `downloads` capability instead, which only accepts certain extensions, so
WAVs are wrapped in a zip there.

## Performance

All processing runs on the main thread. Typical game sounds (under 10 s) process in tens of milliseconds. Long files
(minutes) will block the UI; moving `processChain` and the morph modes into a Web Worker is on the roadmap.
