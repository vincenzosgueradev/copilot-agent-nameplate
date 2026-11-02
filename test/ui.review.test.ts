// @vitest-environment jsdom
/**
 * Spec 018 (Review sobrio) — la revisione non elenca gli agent e non ha il selettore dei Target:
 * mostra il riepilogo, la tabella dei package e gli avvisi. Oracolo scritto dalla spec (FR-001…FR-003).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot, type Driver, type UiWorld } from './helpers/ui-harness';
import { TEAMS_NAME_LIMIT } from '../src/types';

afterEach(() => { vi.useRealTimers(); });

const LONG = `${'a'.repeat(TEAMS_NAME_LIMIT - 4)} [DEV]`;           // con [UAT] arriva a 33: oltre il limite
const SHORT = 'b [DEV]';

const worldOf = (...names: string[]): UiWorld => ({
    solutions: [{ unique: 'S1' }],
    agents: names.map((name, i) => ({ name, schema: `ava_a${i}`, solution: 'S1', publish: null })),
});

async function toReview(world: UiWorld, targets: string[], tweak?: (ui: Driver) => Promise<void>) {
    const ui = await boot(world);
    await ui.openSolution('S1');
    await ui.startRenameBare();
    for (const t of targets) await ui.tickTarget(t, true);
    if (tweak) await tweak(ui);
    await ui.next();
    return ui;
}

describe('la revisione non ripete quello che si e\' gia\' visto (FR-001)', () => {
    for (const targets of [['UAT'], ['UAT', 'PROD'], ['DEV', 'TEST', 'UAT']]) {
        it(`senza elenco degli agent ne' selettore, con ${targets.length} Target`, async () => {
            const ui = await toReview(worldOf(SHORT, 'c [DEV]'), targets);
            expect(ui.step()).toBe('review');
            expect(ui.doc.querySelector('#step-review table:not(.confirm-targets)')).toBeNull();
            expect(ui.doc.querySelector('#step-review [data-target-view]')).toBeNull();
            expect(ui.text('review')).not.toContain('Resulting name');
            expect(ui.text('review'), 'nemmeno i nomi degli agent').not.toContain('b [DEV]');
        });
        it(`la tabella dei package ha una riga per Target (${targets.length})`, async () => {
            const ui = await toReview(worldOf(SHORT), targets);
            const rows = Array.from(ui.doc.querySelectorAll('#step-review .confirm-targets tbody tr td:first-child'));
            expect(rows.map(td => td.textContent!.trim())).toEqual(targets.map(t => `[${t}]`));
            expect(ui.text('review')).toContain(targets.length === 1 ? '1 package' : `${targets.length} packages`);
        });
    }
    it('non c\'e\' piu\' l\'elenco «What happens next» ne\' la riga «Targets»', async () => {
        const ui = await toReview(worldOf(SHORT), ['UAT', 'PROD']);
        expect(ui.text('review')).not.toContain('What happens next');
        expect(ui.text('review')).not.toContain('Two exports');
    });
});

describe('gli avvisi che restano (FR-002)', () => {
    // [descrizione, agent, Target spuntati, cosa tolgo prima, avviso atteso sul limite]
    const cases: [string, string[], string[], boolean][] = [
        ['un nome lungo, un Target', [LONG, SHORT], ['UAT'], true],
        ['nomi corti, un Target', [SHORT, 'c [DEV]'], ['UAT'], false],
        ['un nome lungo, due Target', [LONG, SHORT], ['UAT', 'PROD'], true],
        ['solo nomi corti, due Target', [SHORT, 'c [DEV]'], ['UAT', 'PROD'], false],
    ];
    for (const [label, agents, targets, expectLong] of cases) {
        it(`oltre i ${TEAMS_NAME_LIMIT} caratteri: ${label}`, async () => {
            const ui = await toReview(worldOf(...agents), targets);
            expect(/over \d+ characters/.test(ui.text('review'))).toBe(expectLong);
        });
    }
    // Il confine: il nome risultante ha esattamente TEAMS_NAME_LIMIT caratteri: va bene; uno in piu': avviso
    for (const [extra, warns] of [[0, false], [1, true], [-1, false]] as const) {
        it(`al confine: nome risultante di ${TEAMS_NAME_LIMIT + extra} caratteri ${warns ? 'avvisa' : 'non avvisa'}`, async () => {
            const name = `${'a'.repeat(TEAMS_NAME_LIMIT + extra - ' [UAT]'.length)} [DEV]`;
            const ui = await toReview(worldOf(name), ['UAT']);
            expect(/over \d+ characters/.test(ui.text('review'))).toBe(warns);
        });
    }
    it('con piu\' Target l\'avviso dice di quale, e conta solo gli agent di quel Target', async () => {
        const ui = await toReview(worldOf(LONG, SHORT), ['UAT', 'STAGING'], ui => ui.toggleAgent(LONG, 'STAGING'));
        const text = ui.text('review');
        expect(text).toMatch(/\[UAT\] 1 name is over 30 characters/);
        expect(text).not.toMatch(/\[STAGING\] \d+ names? (is|are) over/);
    });
    it('con un Target solo l\'avviso non nomina il Target', async () => {
        const ui = await toReview(worldOf(LONG), ['UAT']);
        expect(ui.text('review')).toMatch(/1 name is over 30 characters/);
        expect(ui.text('review')).not.toMatch(/\[UAT\] 1 name is over/);
    });
    it('nessun cambio: gli agent hanno gia\' il nome', async () => {
        const ui = await toReview(worldOf('x [UAT]', 'y [UAT]'), ['UAT']);
        expect(ui.text('review')).toContain('No name changes');
    });
    it('un cambio vero non da\' l\'avviso «nessun cambio»', async () => {
        const ui = await toReview(worldOf('x [UAT]', 'y [DEV]'), ['UAT']);
        expect(ui.text('review')).not.toContain('No name changes');
    });
    it('suffissi misti: l\'avviso resta, per il Target che li produce', async () => {
        const ui = await toReview(worldOf('x [DEV]', 'y [DEV]'), ['UAT'], ui => ui.toggleAgent('y [DEV]', 'UAT'));
        expect(ui.text('review')).toContain('different suffixes');
    });
    it('gli avvisi sono testo, mai HTML', async () => {
        const evil = `<img src=x onerror=alert(1)>${'a'.repeat(30)} [DEV]`;
        const ui = await toReview(worldOf(evil), ['UAT']);
        expect(ui.doc.querySelector('#step-review img')).toBeNull();
    });
});

describe('le opzioni della revisione (FR-003)', () => {
    it('dice una sola volta se si scrive su Dataverse, senza il resto dell\'elenco', async () => {
        const ui = await toReview(worldOf(SHORT), ['UAT'], ui => ui.setRaise(false));
        const text = ui.text('review');
        expect(text).toContain('Nothing is written to Dataverse');
        expect(text).not.toContain('From a few seconds');
    });
    it('con la versione da alzare lo dice, e nomina l\'unica scrittura', async () => {
        const ui = await boot(worldOf(SHORT));
        await ui.openSolution('S1');
        await ui.startRenameBare();
        await ui.tickTarget('UAT', true);
        await ui.setRaise(true);
        await ui.next();
        expect(ui.text('review')).toContain('The only change to Dataverse is the solution version');
    });
    it('conta gli archivi: 1 con un Target, 2 per Target piu\' 2 con le copie extra', async () => {
        const one = await toReview(worldOf(SHORT), ['UAT']);
        expect(one.text('review')).toContain('1 archive ');
        const many = await toReview(worldOf(SHORT), ['UAT', 'PROD']);
        expect(many.text('review')).toContain('2 archives');
    });
});
