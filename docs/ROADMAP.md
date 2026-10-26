# Roadmap

Ideas ranked roughly by value for game sound work. Open an issue before starting a large item.

## Next

- **Installable and offline (PWA):** web manifest and service worker so the site works without a connection and can be
  installed as an app.
- **Web Worker processing:** move `processChain`, morphing and variations off the main thread; show progress for long
  files.
- **Batch processing:** apply the current chain and finishing to many files at once and save them as one zip.
- **Preset import/export:** share chains as JSON files.
- **WAV metadata:** keep and write `smpl` loop points and `cue` markers, so loops built here loop in engines and samplers
  without extra setup.

## Sound design

- Formant-preserving pitch shift for voices and creatures.
- Phase-locked phase vocoder (Laroche–Dolson) for cleaner spectral stretch.
- Transient-aware stretch: detect onsets and keep each attack unstretched, not only the first.
- Spectral freeze and spectral blur effects.
- Per-variation random chain parameters (randomize selected effect params within ranges, not just pitch and tone).
- Doppler / pass-by tool with distance-based level and air absorption.
- More generator sources: wavetable, Karplus-Strong plucks, simple modal impacts.

## Workflow

- Undo history for chain and finishing changes, not only source edits.
- Multiple selections and markers; export markers as slices.
- True-peak meter and per-category loudness profiles (UI, weapons, foley).
- Naming templates for engines and middleware (Unity, Unreal, Godot, FMOD, Wwise).
- Project save/load (library + chains) to a single file.
- Keyboard shortcut overlay.

## Engineering

- JSDoc types on all public DSP functions and `checkJs` in CI.
- Browser smoke test in CI (Playwright) for every tab.
- Golden-file tests for presets (render fingerprints) to catch accidental sound changes.
