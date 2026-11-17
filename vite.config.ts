import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'netlify/**/*.test.ts'],
    // Gives jsdom's localStorage back to the files that ask for the jsdom
    // environment — Node 26 shadows it with a global that returns undefined.
    // See src/test-setup.ts for the full story.
    setupFiles: ['./src/test-setup.ts'],
    // These are WALL-CLOCK timeouts, and the suite runs 78 files across 8
    // worker threads. Under that contention a test needing 200 ms of CPU can
    // sit far longer waiting for a slot, which showed up as non-deterministic
    // timeouts (44 / 28 / 42 failures on three identical runs, every file
    // green in isolation). Headroom for the end-to-end App tests on a busy
    // laptop, not a licence for a slow test.
    //
    // Raised 20s -> 30s on 2026-11-17. The same symptom came back as the
    // suite grew to 78 files and the SVT card gained five blocks: every
    // full-App mount got heavier, and the files that mount <App /> are the
    // ones that fail — App.integration (12 s isolated), App.phase9 (11 s),
    // ComposeTab.reminders (5 s) — in a different combination each run.
    // The real cost is the NUMBER of full-App mounts across the suite; if
    // this needs raising a third time, cut mounts instead of the ceiling.
    testTimeout: 30_000,
    // Half the cores, not all 16. Every jsdom file builds its own environment,
    // and 16 of those at once starved each other badly enough to trip the
    // wall-clock timeouts above. Measured on this laptop: 16 threads = 135 s
    // and 3 flaky failures, 8 threads = 110 s and fewer. 4 was worse again —
    // too little parallelism.
    // Re-measured 2026-11-17 at 78 files: 6 threads was NOT better than 8
    // (identical failures in both of two runs), so this stays where the
    // original measurement put it. The remaining pressure is the hardcoded
    // 2 s waitFor budgets inside App.integration, not the thread count.
    poolOptions: { threads: { maxThreads: 8 } },
  },
});
