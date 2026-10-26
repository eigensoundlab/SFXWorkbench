# DSP notes

Implementation notes and references for the algorithms in `src/dsp/`. Keep this file in step with the code when an
algorithm changes.

## Resampling and varispeed (`resample.js`)

Windowed-sinc interpolation, 12 zero crossings per side, Blackman window, kernel table with 512 steps per zero crossing
and linear interpolation between steps. When reading faster than 1× the kernel is widened by the rate (cutoff
`min(1, 1/rate)`) to avoid aliasing. Varispeed takes a rate function of input progress, which gives pitch sweeps.

## Filters (`filters.js`)

Biquads from Robert Bristow-Johnson's *Audio EQ Cookbook*: low/high/band-pass, peaking, low and high shelf. Swept filters
recompute coefficients every 16 samples with log-frequency interpolation.

## STFT (`fft.js`)

Iterative radix-2 FFT. STFT with Hann analysis and synthesis windows at 75% overlap; ISTFT divides by the summed squared
window, so unmodified frames reconstruct the input (tested). FFT convolution zero-pads to the next power of two.

## Time-stretch and pitch shift (`stretch.js`)

- **Clean (WSOLA):** overlap-add of input segments, each shifted within a tolerance to the position whose waveform best
  continues the previous segment (normalised cross-correlation, coarse search then refinement). Good for transients and
  noise. W. Verhelst and M. Roelands, "An overlap-add technique based on waveform similarity (WSOLA) for high quality
  time-scale modification of speech," ICASSP 1993.
- **Spectral (phase vocoder):** per-bin phase advance from instantaneous frequency. J. L. Flanagan and R. M. Golden,
  "Phase vocoder," Bell System Technical Journal, 1966; J. Laroche and M. Dolson, "Improved phase vocoder time-scale
  modification of audio," IEEE Trans. Speech and Audio Processing, 1999. No phase locking yet, so expect some phasiness.
- **Extreme smear:** phase vocoder with random phases and a ~0.3 s window, the approach popularised by Paulstretch
  (Nasca Octavian Paul).
- **Pitch shift:** stretch by the pitch ratio, then varispeed back to the original length.
- **Keep attack:** the first N ms pass unprocessed; only the rest is stretched.

## Loudness (`loudness.js`)

ITU-R BS.1770 integrated loudness: K-weighting (two biquads, coefficients computed for any sample rate), 400 ms blocks
with 75% overlap, absolute gate at −70 LUFS and relative gate at −10 LU. Sounds shorter than 400 ms are measured as one
block. Reference check in tests: a 997 Hz sine at −20 dBFS reads −23.0 LUFS mono.

## Morphing (`morph.js`)

- **Spectral morph:** per-frame magnitude interpolation, linear ("blend") or geometric ("hybrid"), with the phase of
  whichever source dominates the bin. The amount can ramp across the sound. Optional time-fit maps B's frames onto A's.
- **Cross-synthesis:** A's spectrum multiplied by the ratio of smoothed spectral envelopes (B/A) raised to the amount.
  Envelope smoothing width grows with frequency.
- **Convolution:** A ⊗ B (B truncated, faded, optionally reversed), peak-matched to A.
- **Envelope transfer:** attack/release follower on B applied to A, optionally after flattening A's own envelope.
- **Ring multiply:** A × B, peak-matched.
- **Granular weave:** Hann-windowed grains from A or B chosen by a probability that ramps over time, with position,
  pitch and reverse scatter; seeded for repeatability.

## Effects (`effects.js`)

- **Reverb:** Freeverb topology (8 parallel lowpass-feedback combs, 4 series all-passes, stereo spread 23 samples),
  tunings scaled from 44.1 kHz. Freeverb by Jezar at Dreampoint, public domain.
- **Transient shaper:** gain from the difference between fast and slow envelope followers (attack) and between short and
  long release followers (sustain).
- **Compressor:** peak detector in dB, smoothed gain reduction with attack and release.
- **Noise reduction:** spectral subtraction; the noise floor per bin is the 10th percentile of magnitudes over time, gain
  smoothed with fast opening and slower closing to limit musical noise.
- **Distortion:** static waveshapers (tanh, hard clip, sine fold, asymmetric tanh with DC blocking), wet path
  peak-matched to the dry signal.

## Generator (`generator.js`)

One-shot synth inspired by sfxr (Tomas Pettersson, 2007): oscillator (sine, triangle, polyBLEP square and saw, two-op
FM, sample-and-hold pitched noise, white, pink), pitch slide with curve, pitch jump, vibrato, retrigger, attack/hold/release
envelope with punch, swept resonant low-pass and fixed high-pass. PolyBLEP: V. Välimäki and A. Huovilainen,
"Antialiasing oscillators in subtractive synthesis," IEEE Signal Processing Magazine, 2007. Pink noise uses Paul
Kellet's filter.

## Physical models (`physical.js`)

**Modal synthesis.** An object is a set of modes, each a two-pole resonator with frequency f, decay time τ and gain g.
The resonator is scaled so a unit impulse gives a unit-amplitude damped sine. J.-M. Adrien, "The missing link: modal
synthesis," in *Representations of Musical Signals*, MIT Press, 1991; K. van den Doel, P. G. Kry and D. K. Pai,
"FoleyAutomatic: physically-based sound effects for interactive simulation and animation," SIGGRAPH 2001.

- **Materials** set the decay through a loss model `1/τ = π f η + δ`: η is the internal-friction loss factor
  (high-Q metals and glass ring, wood and stone thud), δ a constant loss (radiation, mounting). Values are tuned by ear.
  Each material also sets the colour (`noiseHz`) and share (`grit`) of contact noise.
- **Shapes** set the mode-frequency ratios: free-free bar (1, 2.756, 5.404…), rectangular plate (m² + (n/1.37)²),
  circular membrane (Bessel zeros), ring/shell modes n(n²−1)/√(n²+1) split into close pairs (the shimmer of casings and
  cans), bell partials (hum, prime, tierce, quint, nominal), stiff string with inharmonicity, irregular box.
- **Strike position** weights modes by |sin(π k x)|, so hitting near an edge or the centre changes the timbre.
- **Hardness** is the contact time of a half-sine force pulse (10 ms soft to 20 µs hard). Longer contact low-passes the
  excitation, exactly as a soft mallet does.

**Cause → object → aftermath.** The Impact engine schedules events on one body:
- *Hit* is one strike; *crack* is a series of clicks whose gaps shrink geometrically (fracture speeding up) ending in the
  break; *scrape* drives the body with low-passed noise plus random stick-slip impulses; *roll* with slowing periodic
  bumps.
- *Bounces* follow a restitution coefficient e: each impact is e times as strong and the next gap e times as long, so
  bounces accelerate into a rattle. Each bounce lands at a random strike position, so no two sound alike.
- *Debris* is a burst of small bodies whose sizes, times and loudness are random (most early, small ones higher and
  quieter), in the spirit of PhISEM: P. R. Cook, "Physically Informed Sonic Modeling (PhISM): synthesis of percussive
  sounds," Computer Music Journal 21(3), 1997.
- *Rumble* is low-passed brown noise with an exponential decay for weight.

**Dispersion.** A cascade of first-order all-pass sections `y = a·x + x₁ − a·y₁` with a < 0 delays low frequencies more
than high ones (group delay at DC (1−a)/(1+a) samples per section), so a click becomes a descending chirp. This is the
"pew" of struck wires and springs (the classic film blaster was recorded from a struck antenna guy-wire) and of
cracking lake ice. In a feedback loop with a delay and gentle low-pass it becomes a spring reverb: J. S. Abel, D. P.
Berners, S. Costello and J. O. Smith, "Spring reverb emulation using dispersive allpass filters in a waveguide
structure," AES Convention 121, 2006.

**Resonator effect.** Runs any sound through the same modal body, so a recorded tap can be heard "through" metal, wood
or glass.

## Textures (`textures.js`)

- Event textures (particles, sparks, liquid, rain, fire pops, distant thuds) are Poisson streams whose rate follows an
  envelope (steady, burst, swell, random), each event a tiny modal strike, click or bubble.
- **Bubbles** follow K. van den Doel, "Physically based models for liquid sounds," ACM Transactions on Applied
  Perception 2(4), 2005: a damped sine at the Minnaert frequency f₀ ≈ 3.26 m·Hz / r (3260 / r in mm), damping
  d = 0.043 f₀ + 0.0014 f₀^1.5, and a pitch rise f(t) = f₀ (1 + ξ d t) as the bubble moves towards the surface.
- **Fire** is three layers: crackle (pops), hiss (high-passed noise with fast flicker) and roar/lapping (low-passed brown
  noise with slow modulation), after A. Farnell, *Designing Sound*, MIT Press, 2010, which is also a good general
  reference for procedural game audio.
- **Wind** is pink noise through a band-pass and low-pass whose centre and level follow a smooth random gust signal;
  whistle is a narrow resonance riding on the gusts.
- **Electric arc** is a jittered pulse train at the hum frequency (100 Hz for rectified 50 Hz mains), band-passed for
  buzz, gated by a random instability signal, plus crackle and hiss.
- **Energy fields** are detuned polyBLEP saw and sine voices with slow drift, optional pitch sweep, noise-excited narrow
  resonances at harmonics (shimmer), amplitude pulsing and crackle.
- Stereo is two independently seeded renders mixed by the width control.

## Slicing and loops (`edit.js`)

- **Take detection:** envelope follower (1 ms attack, 15 ms release) against a threshold; regions closer than the minimum
  silence merge; short regions are dropped; pre-roll and tail are added without overlapping the next take.
- **Loops:** equal-power or linear crossfade. Preferred method uses the audio just before the loop start so the loop keeps
  its length; falls back to audio after the end, then to an internal crossfade that shortens the loop. Loop points can
  snap to upward zero crossings within 5 ms.

## WAV (`../io/wav.js`)

Reads PCM 8/16/24/32-bit and float 32/64-bit, including WAVE_FORMAT_EXTENSIBLE; uses the block align to find the sample
container size. Writes PCM or 32-bit float (with a `fact` chunk). TPDF dither is applied only when writing 16 bits or
less and the signal is not already on that grid, so unprocessed files round-trip bit-exactly. Metadata chunks (loop
points, cues, BWF) are not preserved yet. AIFF and AIFF-C (big-endian PCM, `sowt`, `fl32`, `fl64`) are read by
`decodeAiff`; the 80-bit extended sample rate is decoded exactly.
