// @vitest-environment jsdom
/**
 * Spec 014 — tema chiaro e scuro (marketplace policy §3: il tool deve reagire ai temi di PPTB ed
 * essere leggibile in entrambi). Oracolo: WCAG 2.x, rapporto di contrasto >= 4.5 per il testo.
 * I pixel veri non si vedono qui: resta la prova a mano nei due temi.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot, flush } from './helpers/ui-harness';

afterEach(() => { vi.useRealTimers(); delete (globalThis as Record<string, unknown>).__theme; });

const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
const block = (open: string): string => {
    const i = css.indexOf(open);
    return css.slice(i, css.indexOf('}', i));
};
const vars = (b: string) => Object.fromEntries([...b.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(m => [m[1]!, m[2]!.trim()]));
const DARK = vars(block(':root {'));
const LIGHT = vars(block(':root[data-theme="light"] {'));

const lum = (hex: string): number => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: string, b: string): number => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x! + 0.05) / (y! + 0.05);
};

describe('tema: variabili', () => {
    it('il tema chiaro ridefinisce ogni colore del tema scuro', () => {
        for (const k of Object.keys(DARK).filter(k => k.startsWith('--color-'))) {
            expect(LIGHT[k], `manca ${k} nel tema chiaro`).toBeDefined();
        }
    });
    it('il tema chiaro e quello scuro non coincidono', () => {
        for (const k of ['--color-bg', '--color-surface', '--color-text']) expect(LIGHT[k]).not.toBe(DARK[k]);
    });
});

describe('tema chiaro: contrasto del testo >= 4.5', () => {
    const L = LIGHT as Record<string, string>;
    const pairs: [string, string, string][] = [
        ['testo su sfondo', L['--color-text']!, L['--color-bg']!],
        ['testo su superficie', L['--color-text']!, L['--color-surface']!],
        ['testo secondario su sfondo', L['--color-text-muted']!, L['--color-bg']!],
        ['testo secondario su superficie', L['--color-text-muted']!, L['--color-surface']!],
        ['testo forte su superficie', L['--color-text-strong']!, L['--color-surface']!],
        ['bianco su primario', '#ffffff', L['--color-primary']!],
        ['bianco su primario (hover)', '#ffffff', L['--color-primary-hover']!],
        ['avviso su superficie', L['--color-warning']!, L['--color-surface']!],
        ['successo su superficie', L['--color-success']!, L['--color-surface']!],
        ['errore su superficie', L['--color-error']!, L['--color-surface']!],
        ['info su superficie', L['--color-info']!, L['--color-surface']!],
    ];
    it.each(pairs)('%s', (_n, fg, bg) => { expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5); });

    it('chip, badge e banner: ogni coppia colore/fondo del tema chiaro e\' leggibile', () => {
        const lightRules = [...css.slice(css.indexOf(':root[data-theme="light"] {')).matchAll(/([^{}]+)\{([^}]*)\}/g)];
        let checked = 0;
        for (const [, sel, body] of lightRules) {
            const fg = /(?:^|[;\s])color:\s*(#[0-9a-f]{6})/i.exec(body!)?.[1];
            const bg = /background:\s*(#[0-9a-f]{6})/i.exec(body!)?.[1];
            if (fg && bg) {
                expect(contrast(fg, bg), `${sel!.trim()}: ${fg} su ${bg}`).toBeGreaterThanOrEqual(4.5);
                checked++;
            }
        }
        expect(checked).toBeGreaterThanOrEqual(6);
    });
});

describe('tema: applicazione', () => {
    const WORLD = { solutions: [{ unique: 'S1' }], agents: [] };
    const themeAfterBoot = async (theme?: unknown) => {
        if (theme !== undefined) (globalThis as Record<string, unknown>).__theme = theme;
        await boot(WORLD);
        await flush();
        return document.documentElement.dataset.theme;
    };
    it('PPTB dice "light" → data-theme light', async () => { expect(await themeAfterBoot('light')).toBe('light'); });
    it('PPTB dice "dark" → data-theme dark', async () => { expect(await themeAfterBoot('dark')).toBe('dark'); });
    it('quando PPTB cambia le impostazioni il tema si rilegge', async () => {
        expect(await themeAfterBoot('dark')).toBe('dark');
        const g = globalThis as Record<string, unknown>;
        g.__theme = 'light';
        (g.__events as (e: unknown, p: { event: string }) => void)(null, { event: 'settings:updated' });
        await flush();
        expect(document.documentElement.dataset.theme).toBe('light');
    });
    it('un altro evento non cambia il tema', async () => {
        expect(await themeAfterBoot('dark')).toBe('dark');
        const g = globalThis as Record<string, unknown>;
        g.__theme = 'light';
        (g.__events as (e: unknown, p: { event: string }) => void)(null, { event: 'notification:shown' });
        await flush();
        expect(document.documentElement.dataset.theme).toBe('dark');
    });
    it('un valore sconosciuto vale scuro, non chiaro', async () => { expect(await themeAfterBoot('sepia')).toBe('dark'); });
});
