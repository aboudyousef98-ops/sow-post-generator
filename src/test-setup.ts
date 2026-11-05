// Give the jsdom tests a working localStorage. Runs for every test file.
//
// THE BUG (2026-11-05): 19 test files / 184 tests died in `beforeEach` with
// "Cannot read properties of undefined (reading 'setItem')" — on files that
// correctly declare `// @vitest-environment jsdom`.
//
// It is Node, not jsdom. Node 26 defines `localStorage` and `sessionStorage` on
// globalThis as getters that return `undefined` unless the process was started
// with --localstorage-file. Vitest copies jsdom's window onto the global with
// this filter (vitest/dist/chunks/index.*.js, getWindowKeys):
//
//     if (k in global) return keysArray.includes(k);
//
// `'localStorage' in globalThis` is now TRUE, and 'localStorage' is NOT in
// vitest's hardcoded KEYS list — so the key is dropped and every test is left
// looking at Node's undefined one instead of jsdom's working one.
//
// Why we build a throwaway JSDOM instead of copying from `window`: inside a
// test, `window`, `document.defaultView` and `globalThis` are all the SAME
// vitest global, so there is no jsdom window left to copy from (verified) — and
// jsdom's `Storage` is an illegal constructor, so it cannot be newed directly.
// Borrowing the Storage off a fresh JSDOM is the only way to get the real
// thing, and the real thing is what we want: length, key(), the storage event
// and the quota all behave as they do in a browser, where a hand-rolled Map
// shim would quietly diverge from what production code is tested against.
//
// Per test FILE, so the stores start empty and no file can leak into another.
// Remove this once vitest adds localStorage to KEYS, or Node stops defining a
// global that resolves to undefined.

export {}; // a module, so the top-level await below is legal

if (typeof document !== 'undefined' && typeof globalThis.localStorage === 'undefined') {
  const { JSDOM } = await import('jsdom');
  // A url is required: on the default "about:blank" opaque origin jsdom
  // refuses storage access, which is the very failure being fixed.
  const donor = new JSDOM('', { url: 'http://localhost:3000/' }).window;

  for (const key of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(globalThis, key, {
      value: donor[key],
      configurable: true,
      writable: true,
    });
  }
}
