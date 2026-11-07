# Vendored builds

Files here are copied in unchanged from other projects. They are not npm packages, are bundled into the offline build
like the app's own modules, and are excluded from linting. `src/dsp` and `src/io` must not import them (ESLint checks):
the app passes their results to the DSP as plain arrays.

## playhead-core.mjs

[Playhead](https://github.com/eigensoundlab/playhead) core as one ES module: analysis, cross-field descriptors, the
analysis-driven tools and the public API (`analyze`, `drawStrip`, `curveAt`, `toMarkers`, `process`, `combine`, `align`,
`measureParts`, `arrange`). Apache-2.0,
Copyright 2026 Daniel Sandner. Concept DOI [10.5281/zenodo.23932625](https://doi.org/10.5281/zenodo.23932625).

- Playhead 0.2.0 with the unreleased changes up to "Check searched arrangements against their real mixes" (`npm run
  build:dist` in the Playhead repository at that commit, file `dist/playhead-core.mjs`): combining documents (`combine`,
  `align`), searching arrangements (`measureParts`, `arrange`), the views of rhythm and form (bar raster, tempogram,
  lag view, curve scalogram; for sound effects the scalogram is the one that fits) and the loudness fix that makes a
  clip's document its share of any mix (arrangements of layers that start with sound are now predicted to within
  0.2 LU at the peak). It still reports `version` 0.2.0; the app checks for the functions, not the version
  (`PH_PARTS`). Replace it with the build of Playhead 0.3.0 once that is released.
- SHA-256: `612e156097ab5e70c141403493971a1aad7328b3c6baabd75edd16f26cb64b0c`
- Used by `src/app/playhead.js` only: `analyze()` with the `sfx` profile (`fast` above 30 s; layers of the layer stack
  as sound effects at 100 curve columns per second), `drawStrip()` with a look, `looks`, `parseLook()`, `lookCode()`,
  `lookFits()`, `tools()`, `process()` (de-harsh, attack and body, reverb on the tails, drive the hits, ring time, level
  the events, fold to mono, widen the tails), `combine()`, `align()`, `measureParts()`, `arrange()` (the layer stack's
  folder views, measures and search) and `version`.

To update: build `dist/playhead-core.mjs` in the Playhead repository, copy it here, update the version and checksum above
and in `CHANGELOG.md`, and run `npm run check` (`tests/playhead.test.js` analyses a sound with it).
