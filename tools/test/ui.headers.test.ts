// @vitest-environment jsdom
/**
 * Spec 011 — intestazioni uniformi e senza ripetizioni.
 *
 * Le intestazioni a tile (elenco delle solution, anteprima) usano lo stesso
 * componente, con etichette in inglese e senza dire due volte la stessa cosa.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot, type UiWorld } from './helpers/ui-harness';

afterEach(() => { vi.useRealTimers(); });

const ITALIAN = /\b(Versione|Creata|Verifica|Risultato|Agente|Riepilogo|Avanti|Indietro)\b/;

const world = (over: Partial<UiWorld['solutions'][number]> = {}): UiWorld => ({
    solutions: [{ unique: 'S1', ...over }, { unique: 'M1', managed: true }],
    agents: [
        { name: 'one [DEV]', schema: 'ava_a1', solution: 'S1', publish: true },
        { name: 'two [DEV]', schema: 'ava_a2', solution: 'S1', publish: null },
        { name: 'lock [DEV]', schema: 'ava_m1', solution: 'M1', publish: null },
        { name: 'lonely', schema: 'ava_o1', solution: null, publish: null },
    ],
});

const labels = (ui: { doc: Document }, sel: string) =>
    Array.from(ui.doc.querySelectorAll(`${sel} dt`)).map(d => d.textContent!.trim());
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

describe('elenco delle solution', () => {
    it('due totali (solution e agent); il tipo sta gia\' nelle schede, non si ripete', async () => {
        const ui = await boot(world());
        expect(labels(ui, '#hero-stats')).toEqual(['Solutions', 'Agents']);
        const values = Array.from(ui.doc.querySelectorAll('#hero-stats dd')).map(d => norm(d.textContent));
        expect(values).toEqual(['2', '4']);
        expect(ui.doc.querySelector('#hero-stats')!.textContent).not.toMatch(/managed/i);
    });
});

describe('solution aperta', () => {
    const head = (ui: { doc: Document }) => norm(ui.doc.querySelector('#step-solution .panel-head')!.textContent).replace(/Updating…/, '').trim();

    it('niente tile e titolo: i dati stanno nel percorso e nella riga dell elenco', async () => {
        const ui = await boot(world());
        await ui.openSolution('S1');
        expect(ui.doc.querySelector('#step-solution .strip')).toBeNull();
        expect(ui.doc.querySelector('#step-solution .panel-heading')).toBeNull();
        expect(ui.doc.querySelector('#step-solution .panel-sub')).toBeNull();
    });

    it('resta solo il tipo della solution', async () => {
        const ui = await boot(world());
        await ui.openSolution('S1');
        expect(head(ui)).toBe('Unmanaged');
    });

    it('una solution managed lo dice', async () => {
        const ui = await boot(world());
        await ui.crumb('Solutions').catch(() => undefined);
        await ui.doc.querySelector<HTMLElement>('[data-filter="managed"]')!.click();
        await ui.openSolution('M1');
        expect(head(ui)).toBe('Managed');
    });

    it('agent senza solution: la nota spiega il caso, il conteggio non si ripete', async () => {
        const ui = await boot(world());
        await ui.search('lonely');
        await ui.clickChip('lonely');
        expect(head(ui)).toBe('No solution');
        expect(ui.doc.querySelector('#step-solution .panel-note')).not.toBeNull();
        expect(norm(ui.doc.getElementById('step-solution')!.textContent)).not.toMatch(/1 agents?/);
    });
});

describe('anteprima', () => {
    it('le tile: Version, Publisher, Entries, Export time; la solution non si ripete (sta nel percorso)', async () => {
        const ui = await boot(world());
        await ui.openSolution('S1');
        await ui.startRename();
        await ui.typeSuffix('UAT');
        await ui.next();
        await ui.buildPackage();
        expect(labels(ui, '#preview-body')).toEqual(['Version', 'Publisher', 'Entries', 'Export time']);
    });
});

describe('percorso e lingua', () => {
    it('il percorso usa gli stessi nomi del passo: Checks e Result', async () => {
        const ui = await boot(world());
        await ui.openSolution('S1');
        await ui.startRename();
        await ui.typeSuffix('UAT');
        await ui.next();
        await ui.buildPackage();
        await ui.toVerify();
        const trail = (): string[] => Array.from(ui.doc.querySelectorAll('#breadcrumb a, #breadcrumb [aria-current], #breadcrumb span, #breadcrumb button'))
            .map(e => norm(e.textContent)).filter(x => x && x !== '›');
        expect(trail()).toContain('Checks');
        await ui.save();
        expect(trail()).toContain('Result');
    });

    it('nessuna parola italiana in nessuna schermata attraversata', async () => {
        const ui = await boot(world());
        const seen: string[] = [];
        const snap = () => seen.push(norm(ui.doc.getElementById('main-content')!.textContent));
        snap();
        await ui.openSolution('S1'); snap();
        await ui.startRename(); snap();
        await ui.typeSuffix('UAT');
        await ui.next(); snap();
        await ui.buildPackage(); snap();
        await ui.toVerify(); snap();
        await ui.save(); snap();
        for (const [i, text] of seen.entries()) expect(text, `schermata ${i}`).not.toMatch(ITALIAN);
    });
});

describe('contenuto non fidato', () => {
    it('un nome con HTML resta testo, nel percorso e nella lista', async () => {
        const ui = await boot(world({ friendly: '<b>x</b>' }));
        await ui.openSolution('S1');
        const main = ui.doc.getElementById('main-content')!;
        expect(main.querySelectorAll('b')).toHaveLength(0);
        expect(norm(ui.doc.getElementById('breadcrumb')!.textContent)).toContain('<b>x</b>');
    });
});
