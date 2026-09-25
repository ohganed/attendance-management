# Student record links

The production app is a static page; tests do not change its stored data or schema.
Use Node.js 22 or later and install the test dependencies locally:

```sh
npm install --no-save --package-lock=false jsdom fake-indexeddb playwright
node --test tests/record-dom.test.cjs
npx playwright install chromium
node --test tests/student-records.test.cjs
```

`record-dom.test.cjs` exercises the actual enhancement script against DOM fixtures and an IndexedDB implementation. It covers record counts, safe text rendering, school/class isolation, switching context, legacy records and unchanged persistence on viewing. Only native dialog presentation is stubbed because jsdom does not implement it.

`student-records.test.cjs` serves the actual app with the same bundle extraction and enhancement injection as GitHub Pages. It uses an isolated browser context with synthetic data. It additionally covers attendance saving and reloads. To check WebKit, install it with Playwright and run with `BROWSER=webkit`.

The browser test requires an environment that permits browser subprocesses. In the Codex sandbox used for this change, Chromium launch was blocked by macOS Mach-port permissions. The corresponding register, record viewer, school-switch and attendance-save/reload flows were checked manually in the Codex in-app browser against the local preview.
