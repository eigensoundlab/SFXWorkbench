# Changelog

All notable changes to this project are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-10-26

### Added
- Recorder in the library rail: raw input without browser voice processing, input and channel choice, level meter,
  start when sound arrives (150 ms pre-roll), stop after silence and re-arm for the next take, clip warning.
- Folders view: pin working folders (kept between visits in Chrome and Edge), browse subfolders, filter, preview with
  arrow keys, add to the library with Enter or double-click. Folder upload fallback for other browsers.
- AIFF and AIFF-C import (PCM, little-endian 'sowt', 32/64-bit float).
- Generate tab engines. **Impact**: physical modal model built as cause (hit, scrape, roll, crack), object (11
  materials, 7 shapes, size, ring time, strike position, irregularity, dispersion) and aftermath (bounces, roll out,
  debris, rumble), with 21 types such as ammo shell drop, coin drop, glass shatter, wall collapse, ice crack and
  blaster wire. **Texture**: particles, sparks, electric arc, fire, liquid bubbles, rain, wind, energy fields and
  rumble, with 20 types. Synth stays as before.
- "Add as layer" in the Generate tab puts a generated sound straight into the layer stack.
- Effects: Resonator body (play any sound through a virtual object) and Dispersion / spring.
- Presets: Blaster (spring zap), Strike through metal, Knock through wood, Ring as glass, Spring reverb.
- Footer with copyright, source link and eigensound.com.

### Changed
- GitHub Actions updated to versions that run on Node 24 (checkout v7, setup-node v7, configure-pages v6,
  upload-pages-artifact v5, deploy-pages v5, upload-artifact v7).
- Parameter specs support `show: { k, in }` to show rows only for some values of a select.

## [0.2.0] - 2026-10-26

First public version.

### Added
- Editing with undo: trim, delete, silence, reverse, fades, normalize, gain, trim silence, to mono.
- Effect chain with 21 effects, including time stretch (WSOLA, phase vocoder, smear), pitch shift that keeps length,
  EQ, noise reduction and loudness.
- 46 presets in six categories; user presets saved in the browser; Mutate and Back.
- Compare (B) switches effects on and off during playback.
- Variations with seeded randomization and a file-name pattern.
- Combine and morph: layer stack, spectral morph, cross-synthesis, convolution, envelope transfer, ring multiply,
  granular weave.
- Procedural generator with 12 sound types.
- Take splitting, seamless loops and start/loop/stop sets.
- Finishing: loudness target, channels, trim, DC removal, de-click, peak ceiling; applied to everything saved.
- Waveform and spectrogram views; light and dark themes.
- WAV import/export keeping sample rate, channels and bit depth; zip for multi-file saves.
- Single-file offline build, tests, CI and GitHub Pages deployment.

[Unreleased]: https://github.com/eigensoundlab/SFXWorkbench/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/eigensoundlab/SFXWorkbench/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/eigensoundlab/SFXWorkbench/releases/tag/v0.2.0
