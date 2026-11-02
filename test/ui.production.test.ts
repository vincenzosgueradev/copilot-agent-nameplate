// @vitest-environment jsdom
/**
 * Spec 017 — il Target «Production» senza suffisso: la casella, l'avviso della 013 che non scatta,
 * la persistenza e la rinomina. Oracolo scritto dalla spec (FR-001…FR-009), non dal codice.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot, flush, type Driver, type UiWorld } from './helpers/ui-harness';
import { readSource } from './helpers/source';

afterEach(() => { vi.useRealTimers(); });

const WORLD: UiWorld = {
    solutions: [{ unique: 'S1' }],
    agents: [
        { name: 'agent1 [DEV]', schema: 'ava_a1', solution: 'S1', publish: null },
        { name: 'agent2 [DEV]', schema: 'ava_a2', solution: 'S1', publish: null },
    ],
};

async function bare(settings?: Record<string, unknown>) {
    const ui = await boot(WORLD, settings);
    await ui.openSolution('S1');
    await ui.startRenameBare();
    return ui;
}

const warningShown = (ui: Driver) => ui.doc.getElementById('confirm-overlay')!.style.display === 'flex';
const savedDev = (ui: Driver) => (ui.fs.settings.get('releaseTargets') as Record<string, Record<string, unknown>[]>).DEV!;

describe('la casella Production sulla riga (FR-001, FR-008)', () => {
    it('compare solo sulla riga senza nome, e parte spenta', async () => {
        const ui = await bare();
        expect(ui.production('UAT'), 'un target con un nome non la ha').toBeNull();
        expect(ui.production('PROD'), 'nemmeno il preset PROD: ha un suffisso').toBeNull();
        await ui.addTarget('');
        expect(ui.production('')).toBe(false);
    });
    it('Add "no suffix" non la marca, e Restore defaults non marca nessuna riga', async () => {
        const ui = await bare();
        await ui.addTarget('');
        await ui.setProduction('', true);
        await ui.removeTarget('UAT');
        await ui.restoreTargets();
        expect(ui.production(''), 'la marcatura resta dov\'era').toBe(true);
        expect(ui.targetNames().filter(n => n && ui.production(n) !== null)).toEqual([]);
        await ui.removeTarget('');
        await ui.addTarget('');
        expect(ui.production(''), 'un "no suffix" nuovo riparte spento').toBe(false);
    });
    it('il testo sotto la lista spiega la casella (FR-009)', async () => {
        const ui = await bare();
        expect(ui.doc.getElementById('step-suffix')!.textContent).toMatch(/tick\s+Production/);
    });
});

describe('la casella sta a destra, dopo il publish (allineamento delle righe)', () => {
    it('nella riga senza nome la casella viene dopo i pulsanti del publish e prima dei pulsanti di ordine', async () => {
        const ui = await bare();
        await ui.addTarget('');
        const row = Array.from(ui.doc.querySelectorAll<HTMLElement>('#target-list .target-row'))
            .find(r => r.querySelector<HTMLInputElement>('[data-target-name]')!.value === '')!;
        const kids = Array.from(row.children);
        const at = (sel: string) => kids.findIndex(k => k.matches(sel) || k.querySelector(sel));
        expect(at('[data-target-name]')).toBeLessThan(at('[data-target-publish]'));
        expect(at('[data-target-publish]'), 'il publish non si sposta per via della casella').toBeLessThan(at('[data-target-production]'));
        expect(at('[data-target-production]')).toBeLessThan(at('[data-target-act]'));
    });
    it('il publish ha la stessa posizione con e senza casella: viene subito dopo il nome', async () => {
        const ui = await bare();
        await ui.addTarget('');
        const names = Array.from(ui.doc.querySelectorAll<HTMLElement>('#target-list .target-row')).map(r =>
            Array.from(r.children).findIndex(k => k.matches('.target-publish')) - Array.from(r.children).findIndex(k => k.matches('[data-target-name]')));
        expect(new Set(names).size, 'stessa distanza tra nome e publish in ogni riga').toBe(1);
    });
    it('il CSS spinge la casella a destra senza raddoppiare lo spazio dei pulsanti', () => {
        const css = readSource('styles.css');
        expect(/\.target-prod\s*\{[^}]*margin-left:\s*auto/.test(css)).toBe(true);
        expect(/\.target-prod \+ \.target-actions\s*\{[^}]*margin-left:\s*0/.test(css)).toBe(true);
    });
});

describe('matrice: avviso della 013 × marcatura × target spuntati (FR-002, FR-003, FR-004)', () => {
    // L'oracolo: l'avviso compare se e solo se il Target senza nome e' spuntato e NON e' marcato.
    for (const emptyTicked of [true, false]) {
        for (const marked of [true, false]) {
            for (const uatTicked of [true, false]) {
                if (!emptyTicked && !uatTicked) continue;          // niente spuntato: Review e' spento
                const label = `senza nome ${emptyTicked ? 'spuntato' : 'non spuntato'}, ${marked ? 'Production' : 'non marcato'}, UAT ${uatTicked ? 'spuntato' : 'non spuntato'}`;
                it(label, async () => {
                    const ui = await bare();
                    await ui.addTarget('');
                    await ui.setProduction('', marked);
                    await ui.tickTarget('', emptyTicked);
                    await ui.tickTarget('UAT', uatTicked);
                    await ui.nextRaw();
                    const expectWarning = emptyTicked && !marked;
                    expect(warningShown(ui)).toBe(expectWarning);
                    expect(ui.step()).toBe(expectWarning ? 'suffix' : 'review');
                });
            }
        }
    }
    it('con un solo Target, quello Production, senza avviso', async () => {
        const ui = await bare();
        await ui.addTarget('');
        await ui.setProduction('', true);
        await ui.tickTarget('', true);
        await ui.nextRaw();
        expect(warningShown(ui)).toBe(false);
        expect(ui.step()).toBe('review');
    });
    it('smarcare la casella riporta l\'avviso', async () => {
        const ui = await bare();
        await ui.addTarget('');
        await ui.setProduction('', true);
        await ui.setProduction('', false);
        await ui.nextRaw();
        expect(warningShown(ui)).toBe(true);
    });
    it('i preset con un nome non hanno mai avviso, come prima', async () => {
        const ui = await bare();
        await ui.tickTarget('PROD', true);
        await ui.nextRaw();
        expect(warningShown(ui)).toBe(false);
    });
});

describe('persistenza (FR-005)', () => {
    it('la marcatura si salva con la lista, e solo per il Target marcato', async () => {
        const ui = await bare();
        await ui.addTarget('');
        await ui.setProduction('', true);
        expect(savedDev(ui).find(t => t.name === '')).toEqual({ name: '', publishOnImport: 'keep', production: true });
        expect(savedDev(ui).filter(t => 'production' in t).length).toBe(1);
        await ui.setProduction('', false);
        expect('production' in savedDev(ui).find(t => t.name === '')!, 'smarcata = campo assente').toBe(false);
    });
    it('riaprendo il tool la casella e\' ancora spuntata e l\'avviso non compare', async () => {
        const first = await bare();
        await first.addTarget('');
        await first.setProduction('', true);
        const settings = Object.fromEntries(first.fs.settings);
        const again = await bare(settings);
        expect(again.production('')).toBe(true);
        await again.tickTarget('', true);
        await again.nextRaw();
        expect(warningShown(again)).toBe(false);
        expect(again.step(), 'Review e\' partito davvero').toBe('review');
    });
    it('una lista salvata prima della 017, senza il campo, vale non marcato', async () => {
        const ui = await bare({ releaseTargets: { DEV: [{ name: '', publishOnImport: 'keep' }, { name: 'UAT', publishOnImport: 'keep' }] } });
        expect(ui.production('')).toBe(false);
    });
});

describe('rinomina (FR-006)', () => {
    it('dare un nome al Target Production toglie la casella e la marcatura; svuotarlo la ridà spenta', async () => {
        const ui = await bare();
        await ui.addTarget('');
        await ui.setProduction('', true);
        await ui.renameTarget('', 'LIVE');
        expect(ui.production('LIVE'), 'con un nome non c\'e\' la casella').toBeNull();
        expect(savedDev(ui).find(t => t.name === 'LIVE')).toEqual({ name: 'LIVE', publishOnImport: 'keep' });
        await ui.renameTarget('LIVE', '');
        expect(ui.production(''), 'tornato senza nome, riparte spento').toBe(false);
    });
    it('rinominare un altro Target non tocca la marcatura', async () => {
        const ui = await bare();
        await ui.addTarget('');
        await ui.setProduction('', true);
        await ui.renameTarget('UAT', 'UAT2');
        expect(ui.production('')).toBe(true);
    });
});

describe('la tabella dei package e il package (FR-007, FR-008)', () => {
    const cells = (ui: Driver) => Array.from(ui.doc.querySelectorAll('#step-review .confirm-targets tbody tr'))
        .map(tr => tr.querySelector('td')!.textContent!.replace(/\s+/g, ' ').trim());

    it('il Target Production dice (production)', async () => {
        const ui = await bare();
        await ui.tickTarget('UAT', true);
        await ui.addTarget('');
        await ui.setProduction('', true);
        await ui.next();
        expect(cells(ui)).toEqual(['[UAT]', 'no suffix (production)']);
    });
    it('il Target senza nome non marcato dice ancora (removes the suffix)', async () => {
        const ui = await bare();
        await ui.tickTarget('UAT', true);
        await ui.addTarget('');
        await ui.next();                         // conferma l'avviso come farebbe l'utente
        expect(cells(ui)).toEqual(['[UAT]', 'no suffix (removes the suffix)']);
    });
    it('il manifest e lo storico non contengono la marcatura, i nomi cambiano come prima', async () => {
        const ui = await bare();
        await ui.tickTarget('UAT', true);
        await ui.addTarget('');
        await ui.setProduction('', true);
        await ui.next();
        await ui.buildPackage();
        await flush();
        await ui.toVerify();
        await ui.save();
        expect(JSON.stringify(ui.written().manifest)).not.toMatch(/production/i);
        expect(JSON.stringify(ui.history())).not.toMatch(/production/i);
        const names = ui.written().manifest as { targets?: { name: string }[] };
        expect(names.targets?.map(t => t.name)).toEqual(['UAT', '']);
    });
});
