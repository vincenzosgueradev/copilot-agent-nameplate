import { defineConfig } from 'vite';

/**
 * Build separata dell'entry headless.
 *
 * PPTB carica `headlessEntry` come file a sé: non può essere lo stesso bundle della UI, che
 * monta il DOM all'avvio. Qui si compila solo `src/headless.ts` in `dist/headless.js`,
 * senza toccare l'output della UI (`emptyOutDir: false`).
 */
export default defineConfig({
    root: './src',
    build: {
        outDir: '../dist',
        emptyOutDir: false,
        lib: {
            entry: 'headless.ts',
            formats: ['iife'],
            name: 'AgentRenameManagerHeadless',
            fileName: () => 'headless.js',
        },
    },
});
