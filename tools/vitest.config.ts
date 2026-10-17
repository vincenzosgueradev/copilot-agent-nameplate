import { defineConfig } from 'vitest/config';

// Configurazione separata da quella di Vite: la build non deve sapere dei test.
export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
        environment: 'node',
        setupFiles: ['test/setup.ts'],
        // La matrice esaustiva fa decine di migliaia di piani: il limite di 5 s di default non basta
        testTimeout: 300_000,
    },
});
