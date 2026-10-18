// @vitest-environment jsdom
/**
 * Spec 011 — intestazioni uniformi e senza ripetizioni.
 *
 * Le tre intestazioni a tile (elenco delle solution, solution aperta, anteprima) usano lo stesso
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
    it('le tile: Version, Publisher, Agents, Created', async () => {
        const ui = await boot(world());
        await ui.openSolution('S1');
        expect(labels(ui, '#step-solution .strip')).toEqual(['Version', 'Publisher', 'Agents', 'Created']);
    });

    it('il numero di agent sta nelle tile e non nel sottotitolo', async () => {
        const ui = await boot(world());
        await ui.openSolution('S1');
        const sub = norm(ui.doc.querySelector('#step-solution .panel-sub')!.textContent);
        expect(sub).not.toMatch(/\bagents?\b/i);
        const agents = Array.from(ui.doc.querySelectorAll('#step-solution .strip .stat')).find(s => s.querySelector('dt')!.textContent === 'Agents')!;
        expect(norm(agents.querySelector('dd')!.textContent)).toBe('2');
    });

    it('nome visualizzato diverso dal nome univoco: il sottotitolo dice il tipo e il nome univoco', async () => {
        const ui = await boot(world());
        await ui.openSolution('S1');
        expect(norm(ui.doc.querySelector('#step-solution .panel-sub')!.textContent)).toBe('Unmanaged solution · S1');
    });

    it('nome visualizzato uguale al nome univoco: il nome non si ripete', async () => {
        const ui = await boot(world({ friendly: 'S1' }));
        await ui.openSolution('S1');
        expect(norm(ui.doc.querySelector('#step-solution .panel-heading')!.textContent)).toBe('S1');
        expect(norm(ui.doc.querySelector('#step-solution .panel-sub')!.textContent)).toBe('Unmanaged solution');
    });

    it('una solution managed lo dice', async () => {
        const ui = await boot(world());
        await ui.crumb('Solutions').catch(() => undefined);
        await ui.doc.querySelector<HTMLElement>('[data-filter="managed"]')!.click();
        await ui.openSolution('M1');
        expect(norm(ui.doc.querySelector('#step-solution .panel-sub')!.textContent)).toBe('Managed solution · M1');
    });

    it('agent senza solution: nessuna tile, e il conteggio sta nel sottotitolo (unico posto)', async () => {
        const ui = await boot(world());
        await ui.search('lonely');
        await ui.clickChip('lonely');
        expect(ui.doc.querySelector('#step-solution .strip')).toBeNull();
        expect(norm(ui.doc.querySelector('#step-solution .panel-sub')!.textContent)).toBe('1 agent');
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

describe('contenuto non fidato nelle tile', () => {
    it('un valore con HTML resta testo', async () => {
        const ui = await boot(world({ version: '<b>1</b>.0' }));
        await ui.openSolution('S1');
        const strip = ui.doc.querySelector('#step-solution .strip')!;
        expect(strip.querySelectorAll('b')).toHaveLength(0);
        expect(norm(strip.textContent)).toContain('<b>1</b>.0');
    });
});
