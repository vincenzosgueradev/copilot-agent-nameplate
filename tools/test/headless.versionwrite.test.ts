/**
 * Spec 014 — headless: scrivere la versione in DEV senza `confirmVersionWrite` si rifiuta,
 * prima di qualunque chiamata a Dataverse.
 */
import { describe, expect, it, vi } from 'vitest';

// files.ts legge toolboxAPI.fileSystem appena viene importato: lo stub deve esserci prima
vi.hoisted(() => {
    (globalThis as Record<string, unknown>).toolboxAPI = { fileSystem: {}, terminal: {}, utils: {} };
    (globalThis as Record<string, unknown>).dataverseAPI = {};
});
import { invokeHeadless } from '../src/headless';

const base = { operation: 'package', solutionUniqueName: 'S1', suffix: 'UAT', outputDirectory: 'C:/out' };

describe('headless: consenso alla scrittura della versione', () => {
    it('con options.newVersion e senza flag rifiuta, e nomina soluzione e versione', async () => {
        const r = await invokeHeadless({ ...base, options: { newVersion: '1.0.0.3' } }) as { status: string; code: string; message: string };
        expect(r.status).toBe('error');
        expect(r.code).toBe('VERSION_WRITE_NOT_CONFIRMED');
        expect(r.message).toContain('S1');
        expect(r.message).toContain('1.0.0.3');
    });
    it('il flag deve essere esattamente true: "true" e 1 non valgono', async () => {
        for (const v of ['true', 1, null]) {
            const r = await invokeHeadless({ ...base, confirmVersionWrite: v, options: { newVersion: '1.0.0.3' } }) as { code?: string };
            expect(r.code).toBe('VERSION_WRITE_NOT_CONFIRMED');
        }
    });
    it('senza newVersion il rifiuto non scatta (nulla da scrivere)', async () => {
        const r = await invokeHeadless({ ...base, options: {} }) as { code?: string };
        expect(r.code).not.toBe('VERSION_WRITE_NOT_CONFIRMED');
    });
});
