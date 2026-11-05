# Vendored builds

Files here are copied in unchanged from other projects. They are not npm packages, are bundled into the offline build
like the app's own modules, and are excluded from linting. `src/dsp` and `src/io` must not import them (ESLint checks):
the app passes their results to the DSP as plain arrays.

## playhead-core.mjs

[Playhead](https://github.com/eigensoundlab/playhead) core as one ES module: analysis, cross-field descriptors, the
analysis-driven tools and the public API (`analyze`, `drawStrip`, `curveAt`, `toMarkers`, `process`). Apache-2.0,
Copyright 2026 Daniel Sandner. Concept DOI [10.5281/zenodo.23932625](https://doi.org/10.5281/zenodo.23932625).

- Built from the Playhead sources after release 0.1.0, with the integration API and the looks that will be released
  as 0.2.0 (`npm run build:dist` in the Playhead repository, file `dist/playhead-core.mjs`). It reports `version` 0.1.0.
- SHA-256: `9591dcc55cb32fee544c83fa1a9afca70fdc776c7337d228fe1219a47261d772`
- Used by `src/app/playhead.js` only: `analyze()` with the `sfx` profile (`fast` above 30 s), `drawStrip()` with a
  look, `looks`, `parseLook()`, `lookCode()`, `lookFits()`, `tools()`, `process()` (de-harsh, attack and body, reverb on
  the tails, drive the hits, ring time) and `version`.

To update: build `dist/playhead-core.mjs` in the Playhead repository, copy it here, update the version and checksum above
and in `CHANGELOG.md`, and run `npm run check` (`tests/playhead.test.js` analyses a sound with it).
