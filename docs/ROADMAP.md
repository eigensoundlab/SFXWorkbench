# Roadmap

Ideas ranked roughly by value for game sound work. Open an issue before starting a large item.

## Next

- **Installable and offline (PWA):** web manifest and service worker so the site works without a connection and can be
  installed as an app.
- **Web Worker processing:** move `processChain`, morphing and variations off the main thread; show progress for long
  files.
- **Save into working folders:** write outputs and variations straight into a pinned folder (File System Access, read-write).
- **Batch processing:** apply the current chain and finishing to many files at once and save them as one zip.
- **Preset import/export:** share chains as JSON files.
- **WAV metadata:** keep and write `smpl` loop points and `cue` markers, so loops built here loop in engines and samplers
  without extra setup.

## Sound design

- Accents, next steps: duck the source under an accent, per-accent pan and width, accents that follow a pitch glide,
  accent placement learned from a reference sound (copy the accent structure of one sound onto another).
- Modal resynthesis: measure the resonant modes of a recorded hit and turn it into an editable Impact object
  (change material, size or strike position of a real recording).
- Transient / tail split: export attack and tail as separate files so the engine can mix tails by environment.
- Perspective set: render close, mid and distant versions of a sound (level, air absorption, early reflections).

- Formant-preserving pitch shift for voices and creatures.
- Phase-locked phase vocoder (Laroche–Dolson) for cleaner spectral stretch.
- Transient-aware stretch: detect onsets and keep each attack unstretched, not only the first.
- Spectral freeze and spectral blur effects.
- Per-variation random chain parameters (randomize selected effect params within ranges, not just pitch and tone).
- Doppler / pass-by tool with distance-based level and air absorption.
- More physical models: Karplus-Strong strings and plucks, friction (bowed / squeaking) with a stick-slip oscillator,
  hollow tube resonance (Helmholtz) for whooshes and bottles, contact between two bodies (both resonate).
- Measured material data (modal analysis of real recordings) to replace hand-tuned loss factors.
- Event designer: chain a cause and several effects on a timeline (for example trigger, shot, shell drop, tail), with
  variations of the whole chain.
- Texture looping: render textures as seamless loops directly.

## Workflow

- Undo history for chain and finishing changes, not only source edits.
- Recorder: input gain trim and monitoring, take list with keep/discard, punch-in on a selection.
- Multiple selections and markers; export markers as slices.
- True-peak meter and per-category loudness profiles (UI, weapons, foley).
- Naming templates for engines and middleware (Unity, Unreal, Godot, FMOD, Wwise).
- Project save/load (library + chains) to a single file.
- Keyboard shortcut overlay.

## Engineering

- JSDoc types on all public DSP functions and `checkJs` in CI.
- Browser smoke test in CI (Playwright) for every tab.
- Golden-file tests for presets (render fingerprints) to catch accidental sound changes.
