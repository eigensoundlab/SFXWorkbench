# Contributing

Thanks for helping. Bug reports, presets, effects and documentation fixes are all welcome.

## Setup

```sh
npm ci
npm start      # http://localhost:8080
```

## Before you open a pull request

- Run `npm run check` (lint, tests, offline build). CI runs the same.
- Add or update tests for DSP changes. New effects, presets, morph modes and generator types are checked automatically
  by `tests/config.test.js`.
- Check UI changes in light and dark mode and at a 400 px wide window.
- Add a line to `CHANGELOG.md` under "Unreleased".
- Keep pull requests focused on one change.

The project rules and step-by-step recipes for common changes are in [AGENTS.md](AGENTS.md). They apply to human and
AI-assisted contributions alike. If you used an AI assistant, review and test its output as carefully as your own code.

## Reporting bugs

Include the browser and OS, what you did, what you expected and what happened. If a specific file triggers the problem,
say its format (sample rate, bit depth, channels, length); attach it if you can share it.

## License

By contributing you agree that your contributions are licensed under the Apache License 2.0, the license of this project.
