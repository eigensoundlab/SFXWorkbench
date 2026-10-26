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
points, cues, BWF) are not preserved yet.
