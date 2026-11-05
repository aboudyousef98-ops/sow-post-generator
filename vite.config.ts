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
    // These are WALL-CLOCK timeouts, and the suite runs 67 files across 16
    // worker threads. Under that contention a test needing 200 ms of CPU can
    // sit far longer waiting for a slot, which showed up as non-deterministic
    // timeouts (44 / 28 / 42 failures on three identical runs, every file
    // green in isolation). 20 s is headroom for the end-to-end App tests on a
    // busy laptop, not a licence for a slow test.
    testTimeout: 20_000,
    // Half the cores, not all 16. Every jsdom file builds its own environment,
    // and 16 of those at once starved each other badly enough to trip the
    // wall-clock timeouts above. Measured on this laptop: 16 threads = 135 s
    // and 3 flaky failures, 8 threads = 110 s and fewer. 4 was worse again —
    // too little parallelism.
    poolOptions: { threads: { maxThreads: 8 } },
  },
});
