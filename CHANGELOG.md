# Changelog

All notable changes to this project are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.11.0] - 2026-11-07

### Added
- Time stretch can keep every attack: only the sound between the hits stretches, the first 30 ms (adjustable) after each
  onset is copied as it is, and each hit lands where the stretched rhythm puts it (onset × length). A plain stretch
  smears or doubles hits, moves them by tens of milliseconds at large ratios and loses some when shrinking hard; the joins
  go through the source's own samples, so they do not click. With Playhead on, the attacks are Playhead's onsets and
  events while the stretch comes before any speed change in the chain; otherwise they are found by the built-in
  detector (`stretchAttacks` in `stretch.js`).
- Layer stack: each layer has a length (×0.25 to ×8), set with its slider or by dragging the clip's right edge in the
  timeline (snapping to the other layers' starts and onsets). It keeps every attack, so a bed or ambience can be
  stretched under the hits or tightened to them, and the layers' Playhead analyses follow.
- Bypass beside Clear chain: hear the source without the effect chain (finishing stays) and keep the chain. It is the
  same switch as "Effects on" in the output lane and the B key; a bypassed chain is dimmed.
- Save source WAV, before Save output WAV: the selected sound as the source lane shows it, with your edits, without
  effects or finishing (the format, sample rate and peak ceiling still apply).

### Changed
- `processChain(snd, chain, ctx)` passes what is known about the source (`ctx.onsets`) to each effect while the timing is
  still the source's. `layerOnsets` moved from `layering.js` to `stretch.js` (same export).

## [0.10.0] - 2026-11-07

### Added
- The layer stack as a timeline, now its default view (the sliders stay one click away): one lane per layer with a clip
  to drag, snapping to the other layers' clip starts and onsets (Alt moves freely; arrow keys move by 1 ms, Shift by
  10 ms), and the mix on a folder lane above, as in a DAW. Each layer has mute, solo, polarity and reverse buttons and
  its offset, gain, pitch and pan; "Play layers" plays the mix from where you click.
- Align hits: each layer's strongest hit shared with the loudest layer is lined up to the sample, with the polarity
  that makes it add (compared in the low band when both carry low end there). A layer moves only when that makes the
  hit at least 1 dB stronger, so flams that are a choice stay.
- Low end: the bounce can sum the layers' low end in phase (below 120, 200 or 300 Hz), the way Fold to mono lines up
  two channels. It only repairs cancellation between layers: the low band ends up no weaker than the plain sum and no
  stronger than the layers' power sum.
- With Playhead analysis on, the folder lane shows the layers' combined Playhead (from their analyses, without
  analysing the mix, so it follows every move), each layer's share of the energy, the loudest layer in each band, or the
  bands two layers share (fading where they are panned apart), with measures of the whole: rise time, how many layers
  start together, focus, tail, shared bands, spectral coverage.
- Find arrangements (Playhead on): Playhead tries some 500 offsets and gains of the layers in a fraction of a second and
  offers the best six that differ, for a punchy, big (cinematic) or clean result. Each can be played and used, and
  "Back to the arrangement before" undoes it. The loudest layer stays; the others move up to 250 ms and −6 to +3 dB.

### Changed
- Playhead core with combining and arranging (Playhead 0.2.0 plus unreleased changes; see `src/vendor/README.md`).
- `layerMix` moved from `morph.js` to the new `layering.js`, with polarity per layer and the low-end option.

## [0.9.0] - 2026-11-05

### Added
- Three Playhead tools for levels and channels. Level the events evens out how loud the events are (footsteps, impacts,
  a burst of shots) with one gain per event, so attacks and decays keep their shape and the background does not pump
  as it does under a compressor. Fold to mono lines up the channels' phase per frequency before summing and keeps the
  level per channel; each attack is folded with its own delay between the channels, and the report names the bands
  and events that a plain average (To mono, Finishing) would cancel. Widen the tails adds width only after the
  attacks, with the lows centred; the result folds back to the original exactly.
- Two Playhead looks for sound effects, Sound character (onset strength, harshness, impulsiveness) and Hits and
  surprise (with spectral surprise instead of impulsiveness).

### Changed
- Playhead 0.2.0 (the released build of the core used since 0.6.0).

## [0.8.0] - 2026-11-05

### Added
- Three Playhead tools that no EQ can copy, because they follow the sound's events: reverb on the tails (a reverb fed
  only from each hit's peak to the end of its decay, so the attacks stay dry; it adds the tail at the end), drive the
  hits (saturation on the attacks, bodies or whole events, held at the original level so only the harmonics change)
  and ring time (each event rings longer or shorter relative to its own peak, optionally more in the high partials).

### Changed
- Newer Playhead build: the impulsiveness curve now peaks at the impulses instead of rising half a window before them;
  onset strength is a new curve; beats and bar lines are easier to see in the Playhead view; two music looks (Music
  overview, Hits and pulse), disabled for sound effects.

## [0.7.0] - 2026-11-05

### Added
- Playhead looks: with the Playhead view on, a look bar above the source lane chooses what the strip shows, from
  Playhead's ready-made looks (Automatic, Waveform only, Spectrogram, Events, Separate lanes, Curves as waveforms,
  Curves over the waveform, Horizon lanes, Waveform as loud as it sounds, and the music looks) or a pasted look code
  from the Playhead lab's composer. Looks a sound cannot use (Structure needs music, for example) are disabled for it.
  The choice is remembered; the legend under the menu says what is drawn.
- "Tell us if this look helps": a link to a short feedback form in the Playhead repository, with the look filled in.
- Playhead tools in the Effects tab (with Playhead analysis on): de-harsh and attack and body, from Playhead's effects
  bench. They run on the selected source sound and add the result to the library, keeping its sample rate, channel
  count and length, with a short report of what changed.

### Changed
- The Playhead build in `src/vendor/` adds looks, lanes, a spectrogram layer and the tools (see its README).
- The Playhead view's legend moved from the canvas to the look bar.

## [0.6.0] - 2026-11-04

### Added
- Optional Playhead analysis ([Playhead](https://github.com/eigensoundlab/playhead), vendored in `src/vendor/`). A
  "Playhead analysis" switch next to the Display buttons turns it on; it is off by default and remembered in the
  browser. While it is off nothing is analysed and no tool changes, so every result can be compared with and without
  it (same settings, same seed). When on:
  - **Playhead view** for the source and output lanes: the waveform faint where the sound is calm and strong where it
    is harsh, Playhead's activity curve and its events. Source and output side by side show what the chain changed.
  - **Accents:** "Events from" switches the "Each transient" and "Reference rhythm" anchors between the built-in
    transients and Playhead's events. The detector not in use stays marked as outlines and a chip counts both.
    Variations keep the built-in transients, which they detect again on each pitched or stretched file.
  - **Generate check:** every generated sound is measured (events and their type, decay and material class, time
    arrow, burstiness, impulsiveness). For Impact hits the decay that the engine's damping law predicts is shown next
    to Playhead's measurement.
  - Playhead curves (loudness, activity, arousal, harshness, surprise) as drives for the Reaction engine and as
    paths for spectral morph and granular weave.
- Reaction engine in the Generate tab (action and reaction): the selected library sound is the action and a medium
  responds to it: gravel, dry leaves, debris, water, air, sparks or a force field. The medium's event rate, level and
  brightness follow the action's level (or a Playhead curve) after a delay, above a threshold, and settle with their
  own inertia; the action can be mixed in. The preview draws the action and the medium's response. 8 types such as
  Through gravel, Water wake, Air wake and Friction sparks.
- Spectral morph and granular weave: "Amount over time" can follow A's level instead of an even ramp ("start" when A is
  quiet, "end" when it is loud), or a Playhead curve of A.
- DSP: `reactionGen`, `reactionControl`, `levelCurve`, `normalizeCurve` (`src/dsp/reaction.js`), `morphAmount`;
  `textureGen` accepts an event-rate envelope (`rateEnv`); `renderAccents` accepts `events` and `refEvents` that
  replace the built-in transients.

### Changed
- The engine switch in the Generate tab wraps on narrow screens.

## [0.5.0] - 2026-10-30

### Added
- Resynth engine in the Generate tab (modal resynthesis): measures the resonant modes of a recorded hit (frequency,
  level and decay time of each, by spectral peak picking and decay fitting) and rebuilds it as a physical object.
  Reshape it (size, ring time, high-mode tilt, stiffness, morph towards another material's damping, dispersion), keep
  some of the original attack, and strike, scrape, roll, bounce or break it with the Impact engine's causes and
  aftermath. A mode view shows measured and reshaped modes. 13 types such as Bigger and darker, Turn to glass, Drop
  it, Break it and Blaster from it.
- Accent transfer: choose a reference sound in the Accents tab. "Reference rhythm" places accents at the reference's
  events relative to this sound's peak (optionally scaled to its length); the "Reference audio (graft)" kind
  transplants the reference's own events. Variations use the reference too.
- Accent refinements: duck the sound under an accent, pan each accent (a mono result becomes stereo), tune to the
  pitch at the anchor ("Match the pitch at that point"), and a chance per accent so variations differ.
- 8 new accent recipes (Transfer, Refinements).
- Version number in the footer, checked against package.json by a test.

## [0.4.0] - 2026-10-30

### Added
- Accents tab: context-aware accent generator. It analyses the selected sound's structure (onset, attack and peak,
  body, tail, end, every transient, pitch or strongest resonance, brightness, noisiness) and adds up to four accents
  at structural points: start, peak, every transient, tail, end, a position or the selection start, with an offset.
  Twelve kinds: impact hit, resonant ring and dispersion zap driven by the sound itself, sub thump, reverse swell and
  whoosh lead-ins, back slap, stutter, debris settle, shell drop, mechanical click, sparks. Accents can match the
  sound's pitch (or a fifth or octave from it), pick a material from its brightness and follow its loudness.
- 22 accent recipes for weapons, impacts, devices and sci-fi, UI and pickups.
- Variations option "Add the accents from the Accents tab", with small random changes per file.

### Changed
- AGENTS.md line wrapping.

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

[Unreleased]: https://github.com/eigensoundlab/SFXWorkbench/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/eigensoundlab/SFXWorkbench/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/eigensoundlab/SFXWorkbench/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/eigensoundlab/SFXWorkbench/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/eigensoundlab/SFXWorkbench/releases/tag/v0.2.0
