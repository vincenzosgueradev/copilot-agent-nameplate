// @vitest-environment jsdom
/**
 * Spec 008 — icona dell'agent nelle liste: percorsi della schermata.
 * Ogni scenario dice, nel nome, la regola che difende.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { boot, type UiWorld } from './helpers/ui-harness';

afterEach(() => { vi.useRealTimers(); });

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const URI = `data:image/png;base64,${PNG}`;

const world = (): UiWorld => ({
    solutions: [{ unique: 'S1' }, { unique: 'S2' }],
    agents: [
        { name: 'ok [DEV]', schema: 'ava_a1', solution: 'S1', publish: true, icon: PNG },
        { name: 'plain [DEV]', schema: 'ava_a2', solution: 'S1', publish: null, icon: null },
        { name: 'bad [DEV]', schema: 'ava_a3', solution: 'S1', publish: null, icon: '/9j/4AAQSkZJRg' },
        { name: 'other [DEV]', schema: 'ava_b1', solution: 'S2', publish: null, icon: PNG },
    ],
});

describe('icone (FR-001, FR-002, FR-003)', () => {
    it('icona valida → <img> con quel dato; assente o non valida → icona generica', async () => {
        const ui = await boot(world());
        await ui.openSolution('S1');
        expect(ui.cardOf('ok [DEV]')).toMatchObject({ img: URI, generic: false });
        expect(ui.cardOf('plain [DEV]')).toMatchObject({ img: null, generic: true });
        expect(ui.cardOf('bad [DEV]')).toMatchObject({ img: null, generic: true });
    });

    it('un\'icona che prova a uscire dall\'attributo non diventa mai HTML', async () => {
        const w = world();
        w.agents[0]!.icon = PNG + '" onerror="alert(1)';
        w.agents[1]!.icon = PNG.slice(0, 20) + '"><script>x</script>';
        const ui = await boot(w);
        await ui.openSolution('S1');
        expect(ui.cardOf('ok [DEV]')!.img).toBeNull();
        expect(ui.cardOf('plain [DEV]')!.img).toBeNull();
        expect(ui.doc.querySelectorAll('[onerror], #step-solution script').length).toBe(0);
    });
});

describe('quando si legge (FR-005, FR-006, FR-009)', () => {
    it('una lettura, solo per gli agent della solution aperta', async () => {
        const ui = await boot(world());
        expect(ui.cards.bot).toHaveLength(0);          // l'elenco delle solution non legge nulla
        await ui.openSolution('S1');
        expect(ui.cards.bot.map(r => [...r].sort())).toEqual([['bot-ava_a1', 'bot-ava_a2', 'bot-ava_a3']]);
    });

    it('riaprire la stessa solution non rilegge; un\'altra solution legge solo i suoi agent', async () => {
        const ui = await boot(world());
        await ui.openSolution('S1');
        await ui.crumb('Solutions');
        await ui.openSolution('S1');
        expect(ui.cards.bot).toHaveLength(1);
        await ui.crumb('Solutions');
        await ui.openSolution('S2');
        expect(ui.cards.bot).toHaveLength(2);
        expect(ui.cards.bot[1]).toEqual(['bot-ava_b1']);
    });

    it('la lista e\' gia\' disegnata quando le letture finiscono: le righe sono le stesse', async () => {
        const ui = await boot(world());
        await ui.openSolution('S1');
        expect(ui.doc.querySelectorAll('#step-solution tbody tr[data-agent]')).toHaveLength(3);
    });
});

describe('lettura fallita (FR-005)', () => {
    it('le liste restano usabili con icone generiche; il rename prosegue', async () => {
        const ui = await boot(world());
        ui.cards.failWith = '403 forbidden';
        await ui.openSolution('S1');
        for (const n of ['ok [DEV]', 'plain [DEV]']) {
            expect(ui.cardOf(n)).toMatchObject({ img: null, generic: true });
        }
        await ui.startRename();
        await ui.typeSuffix('UAT');
        expect(ui.nextDisabled()).toBe(false);
        expect(ui.suffixRows().map(r => r.nameAfter)).toEqual(['bad [UAT]', 'ok [UAT]', 'plain [UAT]']);
    });
});

describe('la stessa icona in tutte le liste (FR-007)', () => {
    it('passo del suffisso e revisione mostrano l\'icona', async () => {
        const ui = await boot(world());
        await ui.openSolution('S1');
        await ui.startRename();
        expect(ui.cardOf('ok [DEV]')).toMatchObject({ img: URI });
        expect(ui.cardOf('plain [DEV]')).toMatchObject({ generic: true });
        await ui.typeSuffix('UAT');
        await ui.next();
        expect(ui.step()).toBe('review');
        expect(ui.cardOf('ok [DEV]')!.img).toBe(URI);
        expect(ui.reviewRows().map(r => r.resulting)).toEqual(['bad [UAT]', 'ok [UAT]', 'plain [UAT]']);
    });

    it('i chip della ricerca portano l\'icona gia\' letta; la ricerca non legge nulla', async () => {
        const ui = await boot(world());
        await ui.openSolution('S1');
        await ui.crumb('Solutions');
        const before = ui.cards.bot.length;
        await ui.search('ok');
        const chip = ui.doc.querySelector('.match-chip [data-card-icon="bot-ava_a1"] img');
        expect(chip?.getAttribute('src')).toBe(URI);
        expect(ui.cards.bot).toHaveLength(before);
    });
});

describe('niente nel package (FR-008)', () => {
    it('manifest e storico non contengono icone; bot.xml resta quello dell\'export', async () => {
        const ui = await boot(world());
        await ui.openSolution('S1');
        await ui.startRename();
        await ui.typeSuffix('UAT');
        await ui.next();
        await ui.buildPackage();
        await ui.toVerify();
        await ui.save();
        const { manifest, zips } = ui.written();
        const dump = JSON.stringify(manifest) + JSON.stringify(ui.history());
        for (const secret of [PNG, URI]) expect(dump.includes(secret), secret).toBe(false);
        const files = unzipSync(Object.values(zips)[0]!);
        expect(strFromU8(files['bots/ava_a1/bot.xml']!)).toContain('<iconbase64>iVBORw0KGgo=</iconbase64>');
    });
});
