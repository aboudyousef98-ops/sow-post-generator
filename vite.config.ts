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
  },
});
