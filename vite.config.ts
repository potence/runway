/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const geminiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || '';
  // The key never reaches the browser or the build: the client calls /gemini on the dev server and the
  // proxy adds the key header. Production builds ship only an "off" flag, so the AI review stays hidden.
  const aiOn = mode === 'development' && geminiKey !== '';
  return {
    base: './', plugins: [react()],
    define: { 'import.meta.env.VITE_AI_REVIEW': JSON.stringify(aiOn ? 'on' : '') },
    server: aiOn
      ? {
          proxy: {
            '/gemini': {
              target: 'https://generativelanguage.googleapis.com',
              changeOrigin: true,
              rewrite: (p: string) => p.replace(/^\/gemini/, ''),
              headers: { 'x-goog-api-key': geminiKey },
            },
          },
        }
      : undefined,
    // The synthetic sample CSV (~330 KB) is bundled on purpose so the demo works offline; that is the large chunk.
    build: { chunkSizeWarningLimit: 900 },
    test: { include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'], environment: 'node' },
  };
});
