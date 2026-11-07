# Vendored builds

Files here are copied in unchanged from other projects. They are not npm packages, are bundled into the offline build
like the app's own modules, and are excluded from linting. `src/dsp` and `src/io` must not import them (ESLint checks):
the app passes their results to the DSP as plain arrays.

## playhead-core.mjs

[Playhead](https://github.com/eigensoundlab/playhead) core as one ES module: analysis, cross-field descriptors, the
analysis-driven tools and the public API (`analyze`, `drawStrip`, `curveAt`, `toMarkers`, `process`, `combine`, `align`,
`measureParts`, `arrange`). Apache-2.0,
Copyright 2026 Daniel Sandner. Concept DOI [10.5281/zenodo.23932625](https://doi.org/10.5281/zenodo.23932625).

- Playhead 0.3.0 (`npm run build:dist` in the Playhead repository at the "Release 0.3.0" commit, file
  `dist/playhead-core.mjs`): combining documents (`combine`, `align`), searching arrangements (`measureParts`,
  `arrange`), the views of rhythm and form (for sound effects the modulation spectrogram and the curve scalogram fit),
  and the loudness fix that makes a clip's document its share of any mix (arrangements of layers that start with sound
  are predicted to within 0.2 LU at the peak). The app checks for the functions, not the version (`PH_PARTS`).
- SHA-256: `194cd22995a9c90c2c949c252a75a074a13b964bf13aed485e03715782f54236`
- Used by `src/app/playhead.js` only: `analyze()` with the `sfx` profile (`fast` above 30 s; layers of the layer stack
  as sound effects at 100 curve columns per second), `drawStrip()` with a look, `looks`, `parseLook()`, `lookCode()`,
  `lookFits()`, `tools()`, `process()` (de-harsh, attack and body, reverb on the tails, drive the hits, ring time, level
  the events, fold to mono, widen the tails), `combine()`, `align()`, `measureParts()`, `arrange()` (the layer stack's
  folder views, measures and search) and `version`.

To update: build `dist/playhead-core.mjs` in the Playhead repository, copy it here, update the version and checksum above
and in `CHANGELOG.md`, and run `npm run check` (`tests/playhead.test.js` analyses a sound with it).
