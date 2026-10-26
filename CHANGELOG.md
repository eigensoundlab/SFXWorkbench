# Changelog

All notable changes to this project are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/eigensoundlab/SFXWorkbench/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/eigensoundlab/SFXWorkbench/releases/tag/v0.2.0
