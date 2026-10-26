import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Configurazione separata da quella di Vite: la build non deve sapere dei test.
export default defineConfig({
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    test: {
        include: ['test/**/*.test.ts'],
        environment: 'node',
        setupFiles: ['test/setup.ts'],
        // La matrice esaustiva fa decine di migliaia di piani: il limite di 5 s di default non basta
        testTimeout: 300_000,
    },
});
