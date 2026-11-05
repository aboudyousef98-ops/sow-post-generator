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
// WHY A SHIM AND NOT A REAL jsdom Storage (changed 2026-11-05, same day):
//
// The first fix borrowed a Storage off a throwaway `new JSDOM()`, for fidelity.
// That is a SECOND jsdom instance per test file, on top of the one vitest
// already builds — and once the suite passed ~67 files, environment setup
// became the dominant cost and the whole run started tipping over into
// wall-clock timeouts, non-deterministically (44 / 28 / 42 failures on three
// identical runs, every file green in isolation).
//
// So: a real Storage implementation, in process, costing nothing. It is a
// faithful one — length, key(), clear(), null for a missing key, and String()
// coercion of both keys and values, which is where naive Map shims diverge
// from the spec and let a test pass that production would fail.
//
// Not implemented: cross-tab `storage` events and the quota limit. Nothing in
// this app uses either; if that changes, this is the file to revisit.

export {};

class MemoryStorage implements Storage {
  #map = new Map<string, string>();

  get length(): number {
    return this.#map.size;
  }

  key(index: number): string | null {
    // Insertion order, which is what Storage guarantees in practice.
    return [...this.#map.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    // `null`, never `undefined` — code that checks `=== null` must behave the
    // same here as in a browser.
    return this.#map.has(String(key)) ? (this.#map.get(String(key)) as string) : null;
  }

  setItem(key: string, value: string): void {
    // Storage stringifies BOTH. A test that stores a number and reads it back
    // as a number would pass here and fail in a browser without this.
    this.#map.set(String(key), String(value));
  }

  removeItem(key: string): void {
    this.#map.delete(String(key));
  }

  clear(): void {
    this.#map.clear();
  }
}

if (typeof document !== 'undefined' && typeof globalThis.localStorage === 'undefined') {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(globalThis, key, {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  }
}
