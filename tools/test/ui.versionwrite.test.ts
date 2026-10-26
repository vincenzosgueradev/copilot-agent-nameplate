// @vitest-environment jsdom
/**
 * Spec 014 — conferma prima di scrivere la versione in DEV, nome senza marchio, versione
 * dell'header presa da package.json. Oracolo: il rifiuto del marketplace (v1.1.0).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot, flush, type UiWorld } from './helpers/ui-harness';

afterEach(() => { vi.useRealTimers(); });

const WORLD: UiWorld = {
    solutions: [{ unique: 'S1', version: '1.0.0.2' }],
    agents: [{ name: 'agent1', schema: 'ava_a1', solution: 'S1', publish: null }],
};
const overlay = (ui: { doc: Document }) => ui.doc.getElementById('confirm-overlay')!;
const shown = (ui: { doc: Document }) => overlay(ui).style.display === 'flex';
const text = (ui: { doc: Document }) => overlay(ui).textContent!.replace(/\s+/g, ' ');

async function toReview(raise = true) {
    const ui = await boot(WORLD);
    await ui.openSolution('S1');
    await ui.startRename();
    await ui.typeSuffix('UAT');
    if (!raise) await ui.setRaise(false);
    await ui.next();
    return ui;
}

describe('conferma della scrittura in DEV', () => {
    it('con la versione da alzare, "Build the package" chiede conferma e resta sulla revisione', async () => {
        const ui = await toReview();
        await ui.startBuildRaw();
        expect(shown(ui)).toBe(true);
        expect(ui.step()).toBe('review');
    });
    it('nomina ambiente, solution, versione di partenza e di arrivo, e come tornare indietro', async () => {
        const ui = await toReview();
        await ui.startBuildRaw();
        const t = text(ui);
        expect(t).toContain('DEV');
        expect(t).toContain('https://dev.crm4.dynamics.com');
        expect(t).toMatch(/one property of one solution/);
        expect(t).toContain('S1');
        expect(t).toContain('1.0.0.2');
        expect(t).toContain('1.0.0.3');
        expect(t).toMatch(/cannot undo/i);
        expect(t).toMatch(/export the solution/i);
    });
    it('"Go back" non scrive e non avvia l\'export', async () => {
        const ui = await toReview();
        await ui.startBuildRaw();
        (ui.doc.getElementById('confirm-cancel-btn') as HTMLButtonElement).click();
        await flush();
        expect(shown(ui)).toBe(false);
        expect(ui.step()).toBe('review');
    });
    it('con "Raise the version" spento non compare nessun avviso: nulla viene scritto', async () => {
        const ui = await toReview(false);
        await ui.startBuildRaw();
        expect(shown(ui)).toBe(false);
        expect(ui.step()).toBe('preview');
    });
    it('confermando si passa all\'anteprima', async () => {
        const ui = await toReview();
        await ui.startBuildRaw();
        (ui.doc.getElementById('confirm-ok-btn') as HTMLButtonElement).click();
        await flush();
        expect(ui.step()).toBe('preview');
    });
});

describe('marketplace: identità del tool', () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
    const html = readFileSync(resolve(process.cwd(), 'src/index.html'), 'utf8');
    it('il nome visualizzato non contiene "Copilot"', () => {
        expect(pkg.displayName).not.toMatch(/copilot/i);
        expect(html.match(/<title>(.*?)<\/title>/)![1]).not.toMatch(/copilot/i);
        expect(html).not.toMatch(/header-title">[^<]*copilot/i);
    });
    it('l\'autore non e\' la piattaforma', () => {
        expect(pkg.author).not.toMatch(/power platform toolbox/i);
    });
    it('nessuna versione scritta a mano nell\'header', () => {
        expect(html).not.toMatch(/>v\d+\.\d+\.\d+</);
    });
});

describe('README: cosa cambia il tool', () => {
    const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8');
    it('ha la sezione e non nega la scrittura', () => {
        expect(readme).toContain('## What this tool changes');
        expect(readme).not.toMatch(/writes nothing to any environment/i);
        expect(readme).not.toMatch(/reads only \(no writes/i);
    });
});
