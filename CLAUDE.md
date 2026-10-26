# Claude Code

@AGENTS.md

Project-specific notes for Claude Code beyond AGENTS.md:

- Before declaring a UI change done, run `npm start` and check the page in a browser at desktop and 400 px widths,
  in light and dark mode. `npm run check` covers lint, tests and the offline build, not visual layout.
- When a request names a sound category (weapons, UI, foley...), presets in `src/config/presets.js` are usually the
  right place, not new code.
