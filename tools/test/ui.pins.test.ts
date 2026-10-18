// @vitest-environment jsdom
/**
 * Spec 012 — pin delle solution: percorsi della schermata.
 * Ogni scenario dice, nel nome, la regola che difende.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot, flush, type UiWorld, type Driver } from './helpers/ui-harness';

afterEach(() => { vi.useRealTimers(); });

/** 5 solution con agent, data, nome e versione diversi: ogni colonna dà un ordine diverso. */
const world = (): UiWorld => ({
    solutions: [
        { unique: 'Alpha', friendly: 'Delta tool', version: '1.0.0.9', created: '2026-01-05T10:00:00Z' },
        { unique: 'Bravo', friendly: 'Charlie tool', version: '2.0.0.1', created: '2026-03-05T10:00:00Z' },
        { unique: 'Charlie', friendly: 'Alpha tool', version: '1.5.0.0', created: '2026-02-05T10:00:00Z' },
        { unique: 'Delta', friendly: 'Echo tool', version: '1.0.0.1', created: '2026-05-05T10:00:00Z' },
        { unique: 'Echo', friendly: 'Bravo tool', version: '3.0.0.0', created: '2026-04-05T10:00:00Z' },
    ],
    agents: [
        { name: 'a1 [DEV]', schema: 'ava_a1', solution: 'Alpha', publish: null, icon: null },
        { name: 'a2 [DEV]', schema: 'ava_a2', solution: 'Alpha', publish: null, icon: null },
        { name: 'a3 [DEV]', schema: 'ava_a3', solution: 'Alpha', publish: null, icon: null },
        { name: 'b1 [DEV]', schema: 'ava_b1', solution: 'Bravo', publish: null, icon: null },
        { name: 'b2 [DEV]', schema: 'ava_b2', solution: 'Bravo', publish: null, icon: null },
        { name: 'c1 [DEV]', schema: 'ava_c1', solution: 'Charlie', publish: null, icon: null },
        { name: 'd1 [DEV]', schema: 'ava_d1', solution: 'Delta', publish: null, icon: null },
        { name: 'e1 [DEV]', schema: 'ava_e1', solution: 'Echo', publish: null, icon: null },
        { name: 'e2 [DEV]', schema: 'ava_e2', solution: 'Echo', publish: null, icon: null },
    ],
});

const rows = (ui: Driver) => Array.from(ui.doc.querySelectorAll<HTMLElement>('#solutions-table-container tr.data-row'))
    .map(r => r.dataset.solution!.replace('sol-', ''))
    .filter(id => id !== '__none__');
const pinBtn = (ui: Driver, unique: string) =>
    ui.doc.querySelector<HTMLButtonElement>(`tr[data-solution="sol-${unique}"] .pin-btn`)!;
const pressed = (ui: Driver, unique: string) => pinBtn(ui, unique).getAttribute('aria-pressed');
const pin = async (ui: Driver, unique: string) => { pinBtn(ui, unique).click(); await flush(); };
const COLS = ['displayName', 'name', 'agents', 'created', 'version', 'publisher'] as const;
const sortCol = async (ui: Driver, col: string) => ui.clickSelector(`th[data-sort="${col}"]`);

describe('le fissate stanno sempre prime (FR-002) — 6 colonne x 2 direzioni', () => {
    for (const col of COLS) {
        it(`ordinando per ${col}, in entrambe le direzioni, la fissata è la prima`, async () => {
            const ui = await boot(world());
            await pin(ui, 'Echo');
            await sortCol(ui, col);
            expect(rows(ui)[0]).toBe('Echo');
            await sortCol(ui, col);
            expect(rows(ui)[0]).toBe('Echo');
            // una fissata che per quella colonna sarebbe ultima resta prima lo stesso
            await pin(ui, 'Echo');
            await pin(ui, 'Alpha');
            expect(rows(ui)[0]).toBe('Alpha');
        });
    }
});

describe('ordine dentro ciascun gruppo (FR-003)', () => {
    it('due fissate, ordine per Created: fissate per data, poi le altre per data, in entrambe le direzioni', async () => {
        const ui = await boot(world());
        await pin(ui, 'Delta');   // maggio
        await pin(ui, 'Alpha');   // gennaio
        await sortCol(ui, 'created');            // prima volta: discendente
        expect(rows(ui)).toEqual(['Delta', 'Alpha', 'Echo', 'Bravo', 'Charlie']);
        await sortCol(ui, 'created');            // ascendente
        expect(rows(ui)).toEqual(['Alpha', 'Delta', 'Charlie', 'Bravo', 'Echo']);
    });
    it('senza pin la lista è identica a quella di prima (SC-004)', async () => {
        const ui = await boot(world());
        expect(rows(ui)).toEqual(['Alpha', 'Echo', 'Bravo', 'Charlie', 'Delta']); // agents desc, poi nome
        expect(ui.doc.querySelectorAll('.pin-btn[aria-pressed="true"]').length).toBe(0);
    });
    it('le prime tre visibili fissate: stesso ordine di prima', async () => {
        const ui = await boot(world());
        const before = rows(ui);
        for (const u of before.slice(0, 3)) await pin(ui, u);
        expect(rows(ui)).toEqual(before);
    });
});

describe('massimo tre fissate, ancorate allo scroll', () => {
    it('raggiunte le tre, gli altri pin sono disabilitati e dicono perché', async () => {
        const ui = await boot(world());
        for (const u of ['Alpha', 'Bravo', 'Charlie']) await pin(ui, u);
        for (const u of ['Delta', 'Echo']) {
            expect(pinBtn(ui, u).disabled).toBe(true);
            expect(pinBtn(ui, u).title).toContain('up to 3');
        }
        for (const u of ['Alpha', 'Bravo', 'Charlie']) expect(pinBtn(ui, u).disabled).toBe(false);
    });
    it('un pin oltre il limite non fissa nulla e non scrive', async () => {
        const ui = await boot(world());
        for (const u of ['Alpha', 'Bravo', 'Charlie']) await pin(ui, u);
        await pin(ui, 'Delta');
        expect(pressed(ui, 'Delta')).toBe('false');
        expect(ui.fs.settings.get('solutionPins')).toEqual({ DEV: ['Alpha', 'Bravo', 'Charlie'] });
    });
    it('togliendone una, il posto torna libero', async () => {
        const ui = await boot(world());
        for (const u of ['Alpha', 'Bravo', 'Charlie']) await pin(ui, u);
        await pin(ui, 'Bravo');
        expect(pinBtn(ui, 'Delta').disabled).toBe(false);
        await pin(ui, 'Delta');
        expect(pressed(ui, 'Delta')).toBe('true');
    });
    it('le fissate portano la classe che le ancora, con un offset che le impila', async () => {
        const ui = await boot(world());
        for (const u of ['Alpha', 'Bravo']) await pin(ui, u);
        const pinned = Array.from(ui.doc.querySelectorAll<HTMLElement>('tr.data-row.is-pinned'));
        expect(pinned.map(r => r.dataset.solution)).toEqual(['sol-Alpha', 'sol-Bravo']);
        for (const r of pinned) expect(r.style.getPropertyValue('--pin-top')).toMatch(/^\d+px$/);
        expect(ui.doc.querySelectorAll('tr.data-row:not(.is-pinned)').length).toBeGreaterThan(0);
    });
});

describe('niente checkbox nude (Constitution)', () => {
    it('la lista delle solution non ha checkbox senza interruttore', async () => {
        const ui = await boot(world());
        const bare = Array.from(ui.doc.querySelectorAll('input[type="checkbox"]'))
            .filter(i => !i.classList.contains('switch-input'));
        expect(bare).toEqual([]);
    });
});

describe('controllo e indicatore (FR-001, FR-004, FR-005)', () => {
    it('ogni riga ha il suo controllo, con etichetta e aria-pressed coerenti', async () => {
        const ui = await boot(world());
        for (const u of rows(ui)) {
            expect(pinBtn(ui, u)).toBeTruthy();
            expect(pressed(ui, u)).toBe('false');
            expect(pinBtn(ui, u).getAttribute('aria-label')).toBe('Pin solution to the top');
            expect(pinBtn(ui, u).tagName).toBe('BUTTON');
        }
        await pin(ui, 'Bravo');
        expect(pressed(ui, 'Bravo')).toBe('true');
        expect(pinBtn(ui, 'Bravo').getAttribute('aria-label')).toBe('Unpin solution');
        expect(pressed(ui, 'Alpha')).toBe('false');
    });
    it('il click sul pin non apre la solution', async () => {
        const ui = await boot(world());
        await pin(ui, 'Bravo');
        expect(ui.step()).toBe('welcome');   // la lista, non una solution aperta
        expect(ui.exists('#solutions-table-container table')).toBe(true);
    });
    it('il pin usa un\'icona a maschera, mai testo emoji', async () => {
        const ui = await boot(world());
        const btn = pinBtn(ui, 'Alpha');
        expect(btn.querySelector('.icon-pin')).toBeTruthy();
        expect((btn.textContent ?? '').trim()).toBe('');
    });
    it('togliere il pin riporta la solution al suo posto', async () => {
        const ui = await boot(world());
        const before = rows(ui);
        await pin(ui, 'Delta');
        expect(rows(ui)[0]).toBe('Delta');
        await pin(ui, 'Delta');
        expect(rows(ui)).toEqual(before);
    });
    it('i conteggi dei tab non cambiano', async () => {
        const ui = await boot(world());
        const tabs = ui.doc.getElementById('solution-type-filter')!.textContent;
        await pin(ui, 'Delta');
        expect(ui.doc.getElementById('solution-type-filter')!.textContent).toBe(tabs);
    });
});

describe('tab e ricerca (US3, FR-005)', () => {
    it('una fissata che non corrisponde alla ricerca non compare, e torna in cima a ricerca azzerata', async () => {
        const ui = await boot(world());
        await pin(ui, 'Delta');
        await ui.search('Charlie tool');
        expect(rows(ui)).not.toContain('Delta');
        await ui.search('');
        expect(rows(ui)[0]).toBe('Delta');
    });
    it('con la ricerca le fissate che corrispondono restano prime', async () => {
        const ui = await boot(world());
        await pin(ui, 'Delta');
        await ui.search('tool');
        expect(rows(ui)[0]).toBe('Delta');
        expect(rows(ui)).toHaveLength(5);
    });
    it('una fissata del tipo non mostrato resta fissata quando si cambia tab', async () => {
        const w = world();
        w.solutions[1]!.managed = true; // Bravo managed
        const ui = await boot(w);
        await ui.clickSelector('[data-filter="all"]');
        await pin(ui, 'Bravo');
        await ui.clickSelector('[data-filter="unmanaged"]');
        expect(rows(ui)).not.toContain('Bravo');
        await ui.clickSelector('[data-filter="all"]');
        expect(rows(ui)[0]).toBe('Bravo');
        expect(pressed(ui, 'Bravo')).toBe('true');
    });
});

describe('persistenza per ambiente (FR-006, FR-007, SC-003)', () => {
    it('il pin si scrive nelle impostazioni, per ambiente, col nome univoco', async () => {
        const ui = await boot(world());
        await pin(ui, 'Echo');
        expect(ui.fs.settings.get('solutionPins')).toEqual({ DEV: ['Echo'] });
        await pin(ui, 'Echo');
        expect(ui.fs.settings.get('solutionPins')).toEqual({});
    });
    it('riaprendo lo strumento i pin dell\'ambiente ci sono', async () => {
        const ui = await boot(world(), { solutionPins: { DEV: ['Charlie', 'Delta'] } });
        expect(rows(ui).slice(0, 2).sort()).toEqual(['Charlie', 'Delta']);
        expect(pressed(ui, 'Charlie')).toBe('true');
        expect(pressed(ui, 'Alpha')).toBe('false');
    });
    it('i pin di un altro ambiente non si applicano', async () => {
        const ui = await boot(world(), { solutionPins: { UAT: ['Charlie'] } });
        expect(rows(ui)).toEqual(['Alpha', 'Echo', 'Bravo', 'Charlie', 'Delta']);
    });
    it('un pin orfano è ignorato in silenzio e non viene cancellato', async () => {
        const ui = await boot(world(), { solutionPins: { DEV: ['Fantasma', 'Delta'] } });
        expect(rows(ui)[0]).toBe('Delta');
        expect(rows(ui)).toHaveLength(5);
        expect(ui.fs.settings.get('solutionPins')).toEqual({ DEV: ['Fantasma', 'Delta'] });
        expect(ui.text('solution')).not.toContain('Fantasma');
    });
    it('un salvataggio non valido non blocca la lista', async () => {
        const ui = await boot(world(), { solutionPins: 'rotto' });
        expect(rows(ui)).toHaveLength(5);
    });
});

describe('il pin non lascia tracce (FR-008)', () => {
    it('il pin non finisce nello storico dei packaging', async () => {
        const ui = await boot(world());
        await pin(ui, 'Echo');
        expect(ui.history()).toEqual([]);
    });
    it('nessun file scritto', async () => {
        const ui = await boot(world());
        await pin(ui, 'Echo');
        expect(ui.written().manifest).toBeNull();
        expect(Object.keys(ui.written().zips)).toEqual([]);
    });
});

describe('FR-009 — si sposta sul posto', () => {
    it('fissare non rilegge i dati da Dataverse', async () => {
        const ui = await boot(world());
        const before = ui.dev.events.length;
        await pin(ui, 'Echo');
        expect(ui.dev.events.length).toBe(before);
    });
});
