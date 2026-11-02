// @vitest-environment jsdom
/**
 * Spec 016 (Fase 4) — la schermata dei Target: lista, spunte, nomi, ordine, publish, selettore, giro con piu' Target.
 * Oracolo scritto dalla spec (FR-001...FR-015, D1...D7), non dal codice.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot, readProduced, type Driver, type UiWorld } from './helpers/ui-harness';
import { readSource } from './helpers/source';
import type { PublishMode } from '../src/types';

afterEach(() => { vi.useRealTimers(); });

const PRESETS = ['DEV', 'TEST', 'UAT', 'STAGING', 'PREPROD', 'PROD'];

const WORLD: UiWorld = {
    solutions: [{ unique: 'S1' }, { unique: 'S2' }],
    agents: [
        { name: 'agent1 [DEV]', schema: 'ava_a1', solution: 'S1', publish: null },
        { name: 'agent2', schema: 'ava_a2', solution: 'S1', publish: false },
        { name: 'other [DEV]', schema: 'ava_o1', solution: 'S2', publish: null },
    ],
};

/** Per il giro con piu' Target: agent1 pubblica gia' (true), agent2 no: con force-true cambia solo agent2. */
const MULTI: UiWorld = {
    solutions: [{ unique: 'S1' }],
    agents: [
        { name: 'agent1 [DEV]', schema: 'ava_a1', solution: 'S1', publish: true },
        { name: 'agent2', schema: 'ava_a2', solution: 'S1', publish: false },
    ],
};

type SavedTargets = Record<string, { name: string; publishOnImport: PublishMode }[]>;
const savedList = (ui: Driver) => ui.fs.settings.get('releaseTargets') as SavedTargets | undefined;
const savedSel = (ui: Driver) => ui.fs.settings.get('targetSelection') as Record<string, Record<string, string[]>> | undefined;

async function bare(world: UiWorld = WORLD, settings?: Record<string, unknown>, unique = 'S1') {
    const ui = await boot(world, settings);
    await ui.openSolution(unique);
    await ui.startRenameBare();
    return ui;
}

describe('la lista di partenza (FR-002)', () => {
    it('sei preset in ordine, nessuno spuntato; senza Target spuntati non si va avanti e si dice perche\'', async () => {
        const ui = await bare();
        expect(ui.targetNames()).toEqual(PRESETS);
        expect(ui.ticked()).toEqual([]);
        expect(ui.nextDisabled()).toBe(true);
        expect(ui.text('suffix')).toContain('Tick at least one target to continue');
        expect(ui.doc.querySelector('#target-list .target-agents'), 'senza Target spuntati non ci sono tabelle di agent').toBeNull();
        expect(ui.doc.getElementById('target-none')!.hidden).toBe(false);
    });

    it('con un Target spuntato si va avanti, il messaggio sparisce e i nomi si vedono', async () => {
        const ui = await bare();
        await ui.tickTarget('UAT', true);
        expect(ui.nextDisabled()).toBe(false);
        expect(ui.doc.getElementById('target-none')!.hidden).toBe(true);
        expect(ui.suffixRows().map(r => r.nameAfter)).toEqual(['agent1 [UAT]', 'agent2 [UAT]']);
    });

    it('togliere la spunta dell\'ultimo Target riporta il blocco', async () => {
        const ui = await bare();
        await ui.tickTarget('UAT', true);
        await ui.tickTarget('UAT', false);
        expect(ui.nextDisabled()).toBe(true);
        expect(ui.doc.getElementById('target-none')!.hidden).toBe(false);
    });
});

describe('aggiungere un Target (FR-003, FR-005)', () => {
    it('lo crea in fondo, lo spunta, ripulisce il campo e salva lista e spunte', async () => {
        const ui = await bare();
        await ui.addTarget('  HOTFIX ');
        expect(ui.targetNames()).toEqual([...PRESETS, 'HOTFIX']);
        expect(ui.ticked()).toEqual(['HOTFIX']);
        expect((ui.doc.getElementById('target-new') as HTMLInputElement).value).toBe('');
        expect(savedList(ui)!.DEV!.at(-1)).toEqual({ name: 'HOTFIX', publishOnImport: 'keep' });
        expect(savedSel(ui)!.DEV!.S1).toEqual(['HOTFIX']);
        expect(ui.targetNotice()).toBe('');
    });

    it('Invio nel campo fa lo stesso del pulsante Add', async () => {
        const ui = await bare();
        const input = ui.doc.getElementById('target-new') as HTMLInputElement;
        input.value = 'QA';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await vi.waitFor(() => expect(ui.targetNames()).toContain('QA'));
    });

    const REFUSED: [string, string, RegExp][] = [
        ['un nome che c\'e\' gia\'', 'UAT', /already a target/],
        ['lo stesso con altre maiuscole', 'uat', /already a target/],
        ['lo stesso con spazi ai lati', '  UAT ', /already a target/],
        ['21 caratteri', 'a'.repeat(21), /At most 20/],
        ['una parentesi quadra', 'A[B', /not allowed/],
        ['una barra', 'A/B', /not allowed/],
        ['HTML', '<b>x</b>', /not allowed/],
        ['solo spazi (e\' il campo vuoto)', '   ', /Type a name/],
        ['il campo vuoto', '', /Type a name/],
    ];
    for (const [label, name, notice] of REFUSED) {
        it(`rifiuta ${label}: nessun Target in piu', nulla salvato, il messaggio dice perche'`, async () => {
            const ui = await bare();
            const input = ui.doc.getElementById('target-new') as HTMLInputElement;
            input.value = name;
            await ui.clickSelector('#target-add-btn');
            expect(ui.targetNames()).toEqual(PRESETS);
            expect(ui.ticked()).toEqual([]);
            expect(ui.targetNotice()).toMatch(notice);
            expect(savedList(ui)).toBeUndefined();
            expect(ui.doc.querySelector('#step-suffix b')).toBeNull();
        });
    }

    it('il messaggio sparisce al primo Target aggiunto bene', async () => {
        const ui = await bare();
        await ui.addTarget('UAT');
        expect(ui.targetNotice()).not.toBe('');
        await ui.addTarget('QA');
        expect(ui.targetNotice()).toBe('');
    });

    it('"no suffix": si aggiunge una volta sola e il pulsante sparisce', async () => {
        const ui = await bare();
        const btn = () => ui.doc.getElementById('target-add-empty-btn') as HTMLButtonElement;
        expect(btn().hidden).toBe(false);
        await ui.addTarget('');
        expect(ui.targetNames()).toEqual([...PRESETS, '']);
        expect(ui.ticked()).toEqual(['']);
        expect(btn().hidden).toBe(true);
        // il campo senza nome nella riga si legge "(no suffix)"
        const row = ui.doc.querySelector('#target-list .target-row:last-child input[data-target-name]') as HTMLInputElement;
        expect(row.placeholder).toBe('(no suffix)');
        // tolto, il pulsante torna
        await ui.removeTarget('');
        expect(btn().hidden).toBe(false);
    });
});

describe('rinominare, rimuovere, riordinare (FR-003)', () => {
    it('rinominare un Target spuntato: la spunta lo segue, salva lista e spunte, e i nomi si aggiornano', async () => {
        const ui = await bare();
        await ui.tickTarget('UAT', true);
        await ui.renameTarget('UAT', 'QA');
        expect(ui.targetNames()).toEqual(['DEV', 'TEST', 'QA', 'STAGING', 'PREPROD', 'PROD']);
        expect(ui.ticked()).toEqual(['QA']);
        expect(ui.suffixRows().map(r => r.nameAfter)).toEqual(['agent1 [QA]', 'agent2 [QA]']);
        expect(savedList(ui)!.DEV!.map(t => t.name)).toContain('QA');
        expect(savedSel(ui)!.DEV!.S1).toEqual(['QA']);
    });

    it('rinominare porta con se\' le spunte salvate delle altre solution', async () => {
        const ui = await boot(WORLD, {
            targetSelection: { DEV: { S1: ['UAT'], S2: ['UAT', 'PROD'] } },
        });
        await ui.openSolution('S1');
        await ui.startRenameBare();
        await ui.renameTarget('UAT', 'QA');
        expect(savedSel(ui)!.DEV!.S1).toEqual(['QA']);
        expect(savedSel(ui)!.DEV!.S2).toEqual(['QA', 'PROD']);
    });

    it('rinominare in un nome che c\'e\' gia\': rifiutato, il campo torna com\'era, nulla salvato', async () => {
        const ui = await bare();
        await ui.renameTarget('UAT', 'PROD');
        expect(ui.targetNames()).toEqual(PRESETS);
        expect(ui.targetNotice()).toMatch(/already a target/);
        expect(savedList(ui)).toBeUndefined();
    });

    it('rinominare in un nome con carattere vietato: rifiutato', async () => {
        const ui = await bare();
        await ui.renameTarget('UAT', 'U:A');
        expect(ui.targetNames()).toEqual(PRESETS);
        expect(ui.targetNotice()).toMatch(/not allowed/);
    });

    it('rinominare solo le maiuscole di se stesso e\' lecito', async () => {
        const ui = await bare();
        await ui.renameTarget('UAT', 'Uat');
        expect(ui.targetNames()[2]).toBe('Uat');
        expect(ui.targetNotice()).toBe('');
    });

    it('rimuovere un Target spuntato lo toglie dalla lista e dalle spunte e salva', async () => {
        const ui = await bare();
        await ui.tickTarget('UAT', true);
        await ui.tickTarget('PROD', true);
        await ui.removeTarget('UAT');
        expect(ui.targetNames()).toEqual(['DEV', 'TEST', 'STAGING', 'PREPROD', 'PROD']);
        expect(ui.ticked()).toEqual(['PROD']);
        expect(savedList(ui)!.DEV!.map(t => t.name)).not.toContain('UAT');
        expect(savedSel(ui)!.DEV!.S1).toEqual(['PROD']);
    });

    it('un Target rimosso non lascia la spunta a un altro che prende lo stesso nome', async () => {
        const ui = await bare();
        await ui.tickTarget('UAT', true);
        await ui.removeTarget('UAT');
        await ui.renameTarget('TEST', 'UAT');
        expect(ui.ticked()).toEqual([]);
    });

    it('rimuovere tutti i Target lascia una lista vuota e il blocco; resta vuota alla riapertura', async () => {
        const ui = await bare();
        for (const n of PRESETS) await ui.removeTarget(n);
        expect(ui.targetNames()).toEqual([]);
        expect(ui.text('suffix')).toContain('No targets yet');
        expect(ui.nextDisabled()).toBe(true);
        expect(savedList(ui)!.DEV).toEqual([]);
        // una nuova sessione con quel salvataggio: lista vuota, non i preset
        const again = await bare(WORLD, { releaseTargets: savedList(ui) });
        expect(again.targetNames()).toEqual([]);
    });

    it('su e giu\' spostano un Target e si salva; ai bordi i pulsanti sono spenti', async () => {
        const ui = await bare();
        await ui.moveTarget('PROD', 'up');
        expect(ui.targetNames()).toEqual(['DEV', 'TEST', 'UAT', 'STAGING', 'PROD', 'PREPROD']);
        await ui.moveTarget('DEV', 'down');
        expect(ui.targetNames()).toEqual(['TEST', 'DEV', 'UAT', 'STAGING', 'PROD', 'PREPROD']);
        expect(savedList(ui)!.DEV!.map(t => t.name)).toEqual(['TEST', 'DEV', 'UAT', 'STAGING', 'PROD', 'PREPROD']);
        const rows = Array.from(ui.doc.querySelectorAll('#target-list .target-row'));
        expect((rows[0]!.querySelector('[data-target-act="up"]') as HTMLButtonElement).disabled).toBe(true);
        expect((rows.at(-1)!.querySelector('[data-target-act="down"]') as HTMLButtonElement).disabled).toBe(true);
        expect((rows[1]!.querySelector('[data-target-act="up"]') as HTMLButtonElement).disabled).toBe(false);
    });

    it('trascinare una riga su un\'altra la sposta come i pulsanti; trascinarla su se stessa non cambia nulla', async () => {
        const ui = await bare();
        await ui.dragTarget('PROD', 'DEV');
        expect(ui.targetNames()).toEqual(['PROD', 'DEV', 'TEST', 'UAT', 'STAGING', 'PREPROD']);
        expect(savedList(ui)!.DEV!.map(t => t.name)).toEqual(['PROD', 'DEV', 'TEST', 'UAT', 'STAGING', 'PREPROD']);
        await ui.dragTarget('TEST', 'TEST');
        expect(ui.targetNames()).toEqual(['PROD', 'DEV', 'TEST', 'UAT', 'STAGING', 'PREPROD']);
    });

    it('l\'ordine della lista e\' quello dei Target spuntati nel giro', async () => {
        const ui = await bare();
        await ui.tickTarget('PROD', true);
        await ui.tickTarget('UAT', true);
        expect(ui.ticked()).toEqual(['UAT', 'PROD']);   // lista: UAT prima di PROD
        for (let i = 0; i < 4; i++) await ui.moveTarget('PROD', 'up');   // da posizione 5 a 1: prima di UAT (2)
        expect(ui.targetNames().slice(0, 3)).toEqual(['DEV', 'PROD', 'TEST']);
        expect(ui.ticked()).toEqual(['PROD', 'UAT']);
        await ui.next();
        const rows = Array.from(ui.doc.querySelectorAll('#step-review .confirm-targets tbody tr td:first-child')).map(td => td.textContent!.trim());
        expect(rows, 'la tabella della revisione segue l\'ordine').toEqual(['[PROD]', '[UAT]']);
    });
});

describe('il publish di un Target: tre pulsanti, e gli agent sotto lo seguono (D9)', () => {
    it('ogni riga ha i tre stati visibili e cliccabili; il clic li cambia e li salva', async () => {
        const ui = await bare();
        const row = ui.doc.querySelector('#target-list .target-row')!;
        expect(Array.from(row.querySelectorAll('[data-target-publish]')).map(b => b.textContent!.trim()))
            .toEqual(['Leave as is', 'Force yes', 'Force no']);
        expect(row.querySelector('select'), 'niente piu\' menu a tendina').toBeNull();
        for (const mode of ['force-true', 'force-false', 'keep'] as const) {
            await ui.setTargetPublish('UAT', mode);
            expect(ui.targetPublish('UAT'), mode).toBe(mode);
            expect(savedList(ui)!.DEV!.find(x => x.name === 'UAT')!.publishOnImport, `salvato ${mode}`).toBe(mode);
        }
    });

    it('cambiare il publish di un Target aggiorna i pulsanti dei suoi agent, anche con eccezioni gia\' scelte', async () => {
        const ui = await bare();
        await ui.tickTarget('PROD', true);
        await ui.setPublish('agent1 [DEV]', 'force-false', 'PROD');     // eccezione per un agent
        expect(ui.suffixRows('PROD').map(r => r.publish)).toEqual(['force-false', 'keep']);
        await ui.setTargetPublish('PROD', 'force-true');
        expect(ui.suffixRows('PROD').map(r => r.publish), 'tutti seguono il Target').toEqual(['force-true', 'force-true']);
        await ui.setTargetPublish('PROD', 'force-false');
        expect(ui.suffixRows('PROD').map(r => r.publish)).toEqual(['force-false', 'force-false']);
    });

    it('cambiare il publish di un Target non tocca gli agent degli altri Target', async () => {
        const ui = await bare();
        await ui.tickTarget('UAT', true);
        await ui.tickTarget('PROD', true);
        await ui.setPublish('agent1 [DEV]', 'force-false', 'UAT');
        await ui.setTargetPublish('PROD', 'force-true');
        expect(ui.suffixRows('UAT').map(r => r.publish), 'UAT conserva la sua eccezione').toEqual(['force-false', 'keep']);
        expect(ui.suffixRows('PROD').map(r => r.publish)).toEqual(['force-true', 'force-true']);
    });

    it('dopo il cambio, una nuova eccezione per agent vale ancora (D7)', async () => {
        const ui = await bare();
        await ui.tickTarget('PROD', true);
        await ui.setTargetPublish('PROD', 'force-true');
        await ui.setPublish('agent1 [DEV]', 'keep', 'PROD');
        expect(ui.suffixRows('PROD').map(r => r.publish)).toEqual(['keep', 'force-true']);
    });
});

describe('Restore: rimettere i Target tolti (D9)', () => {
    it('spento finche\' la lista e\' completa; dopo aver tolto dei preset torna a funzionare', async () => {
        const ui = await bare();
        expect(ui.restoreEnabled()).toBe(false);
        await ui.removeTarget('PROD');
        expect(ui.restoreEnabled()).toBe(true);
    });

    it('rimette i preset tolti al loro posto, salva la lista, e poi si spegne', async () => {
        const ui = await bare();
        await ui.removeTarget('UAT');
        await ui.removeTarget('PROD');
        await ui.restoreTargets();
        expect(ui.targetNames()).toEqual(['DEV', 'TEST', 'UAT', 'STAGING', 'PREPROD', 'PROD']);
        expect(savedList(ui)!.DEV!.map(x => x.name)).toEqual(['DEV', 'TEST', 'UAT', 'STAGING', 'PREPROD', 'PROD']);
        expect(ui.restoreEnabled()).toBe(false);
    });

    it('non tocca i Target personalizzati, il loro publish, ne\' le spunte', async () => {
        const ui = await bare();
        await ui.addTarget('HOTFIX');
        await ui.setTargetPublish('HOTFIX', 'force-true');
        await ui.removeTarget('PROD');
        await ui.restoreTargets();
        expect(ui.targetNames()).toContain('HOTFIX');
        expect(ui.targetPublish('HOTFIX')).toBe('force-true');
        expect(ui.ticked(), 'HOTFIX resta spuntato, PROD ripristinato no').toEqual(['HOTFIX']);
        expect(ui.targetPublish('PROD'), 'il ripristinato riparte da "keep"').toBe('keep');
    });

    it('lista vuota: tornano tutti e sei; un preset rinominato conta come tolto', async () => {
        const ui = await bare();
        for (const n of PRESETS) await ui.removeTarget(n);
        expect(ui.targetNames()).toEqual([]);
        await ui.restoreTargets();
        expect(ui.targetNames()).toEqual(PRESETS);
        await ui.renameTarget('UAT', 'LIVE');
        await ui.restoreTargets();
        expect(ui.targetNames(), 'UAT torna prima di STAGING, LIVE resta al suo posto').toEqual(['DEV', 'TEST', 'LIVE', 'UAT', 'STAGING', 'PREPROD', 'PROD']);
    });

    it('un Target tolto e ripristinato riparte senza le scelte per agent di prima', async () => {
        const ui = await bare();
        await ui.tickTarget('PROD', true);
        await ui.toggleAgent('agent2', 'PROD');
        await ui.removeTarget('PROD');
        await ui.restoreTargets();
        await ui.tickTarget('PROD', true);
        expect(ui.suffixRows('PROD').map(r => r.checked)).toEqual([true, true]);
    });
});

describe('i popup dicono quanti package escono e li elencano (D9)', () => {
    async function twoWithFiles() {
        const ui = await bare(MULTI);
        await ui.tickTarget('UAT', true);
        await ui.tickTarget('PROD', true);
        await ui.toggleAgent('agent2', 'PROD');
        await ui.setTargetPublish('PROD', 'force-true');
        return ui;
    }

    it('il dialogo della versione dice "2 packages", una riga per Target, con agent, publish e file', async () => {
        const ui = await twoWithFiles();
        await ui.setRaise(true);
        await ui.next();
        await ui.buildPackageRaw();
        const text = ui.confirmText();
        expect(text).toContain('2 packages');
        expect(text).toContain('exports once');
        expect(text).toContain('S1_1_0_0_3_managed_UAT.zip');
        expect(text).toContain('S1_1_0_0_3_managed_PROD.zip');
        const rows = Array.from(ui.doc.querySelectorAll('#confirm-body .confirm-targets tbody tr')).map(tr =>
            Array.from(tr.querySelectorAll('td')).map(td => td.textContent!.replace(/\s+/g, ' ').trim()));
        expect(rows.map(r => r.slice(0, 3))).toEqual([['[UAT]', '2 of 2', 'Leave as is'], ['[PROD]', '1 of 2', 'Force yes']]);
        expect(ui.doc.querySelector('#confirm-overlay .dialog')!.classList.contains('dialog--wide'), 'largo, per la tabella').toBe(true);
    });

    it('il dialogo largo con la tabella dei package non ha barre di scorrimento inutili', () => {
        const css = readSource('styles.css');
        const rule = (re: RegExp) => re.exec(css)?.[1] ?? '';
        expect(rule(/\.dialog--wide\s*\{([^}]*)\}/), 'largo abbastanza per il nome del file').toMatch(/width:\s*min\(1\d{3}px,\s*9\dvw\)/);
        const body = rule(/\.dialog--wide \.dialog-body\s*\{([^}]*)\}/);
        expect(body, 'alto quanto la finestra, non 400px').toMatch(/max-height:\s*calc\(100vh/);
        expect(body, 'mai scorrimento orizzontale').toMatch(/overflow-x:\s*hidden/);
        expect(rule(/\.dialog \.data-table\.confirm-targets td\s*\{([^}]*)\}/), 'il nome del file va a capo invece di allargare la tabella')
            .toMatch(/white-space:\s*normal/);
    });

    it('con un Target solo il dialogo della versione non parla di piu\' package', async () => {
        const ui = await bare(MULTI);
        await ui.tickTarget('UAT', true);
        await ui.setRaise(true);
        await ui.next();
        await ui.buildPackageRaw();
        expect(ui.confirmText()).not.toContain('packages');
        expect(ui.doc.querySelector('#confirm-body .confirm-targets')).toBeNull();
        expect(ui.doc.querySelector('#confirm-overlay .dialog')!.classList.contains('dialog--wide'), 'con un Target solo resta stretto').toBe(false);
    });

    it('il dialogo del suffisso vuoto, con piu\' Target, li elenca e dice come uscirne', async () => {
        const ui = await bare(MULTI);
        await ui.tickTarget('UAT', true);
        await ui.addTarget('');
        await ui.nextRaw();
        const text = ui.confirmText();
        expect(text).toContain('A target without a suffix');
        expect(text).toContain('2 packages');
        expect(text).toContain('Untick the target without a suffix');
        expect(text).toContain('S1_');
        expect(text).toContain('nosuffix.zip');
        expect(text).toContain('(removes the suffix)');
        expect(ui.doc.querySelector('#confirm-overlay .dialog')!.classList.contains('dialog--wide'), 'largo, per la tabella').toBe(true);
    });

    it('la revisione ha la tabella dei package: una riga per Target', async () => {
        const ui = await twoWithFiles();
        await ui.next();
        expect(ui.doc.querySelectorAll('#step-review .confirm-targets tbody tr').length).toBe(2);
        expect(ui.text('review')).toContain('2 packages');
        await ui.back();
        await ui.tickTarget('PROD', false);
        await ui.next();
        expect(ui.doc.querySelectorAll('#step-review .confirm-targets tbody tr').length, 'con un Target, una riga').toBe(1);
        expect(ui.text('review')).toContain('1 package');
        expect(ui.text('review')).not.toContain('packages');
    });

    it('un Target con publish diversi per agent si riassume come "Mixed"', async () => {
        const ui = await bare(MULTI);
        await ui.tickTarget('UAT', true);
        await ui.tickTarget('PROD', true);
        await ui.setPublish('agent1 [DEV]', 'force-true', 'UAT');
        await ui.next();
        const cells = Array.from(ui.doc.querySelectorAll('#step-review .confirm-targets tbody tr')).map(tr =>
            tr.querySelectorAll('td')[2]!.textContent!.trim());
        expect(cells).toEqual(['Mixed: 1 yes, 1 as is', 'Leave as is']);
    });
});

describe('publish on import per Target e per agent (FR-011, D2, D7)', () => {
    it('il valore del Target si salva e vale per tutti gli agent; l\'eccezione dell\'agent lo batte', async () => {
        const ui = await bare();
        await ui.setTargetPublish('PROD', 'force-true');
        expect(savedList(ui)!.DEV!.find(t => t.name === 'PROD')!.publishOnImport).toBe('force-true');
        expect(ui.targetPublish('PROD')).toBe('force-true');
        await ui.tickTarget('PROD', true);
        expect(ui.suffixRows().map(r => r.publish)).toEqual(['force-true', 'force-true']);   // il default del Target
        await ui.setPublish('agent1 [DEV]', 'keep');                                           // eccezione esplicita
        expect(ui.suffixRows().map(r => r.publish)).toEqual(['keep', 'force-true']);
        // nel package: agent1 resta com'era (nessun publishOnImport), agent2 passa a true
        await ui.next();
        await ui.buildPackage();
        await ui.toVerify();
        await ui.save();
        const zip = Object.values(ui.written().zips)[0]!;
        expect(readProduced(zip)).toEqual({
            ava_a1: { name: 'agent1 [PROD]', publish: null },
            ava_a2: { name: 'agent2 [PROD]', publish: true },
        });
    });

    it('cambiare il publish di un Target non tocca gli altri', async () => {
        const ui = await bare();
        await ui.setTargetPublish('UAT', 'force-false');
        expect(ui.targetPublish('UAT')).toBe('force-false');
        for (const n of PRESETS.filter(x => x !== 'UAT')) expect(ui.targetPublish(n), n).toBe('keep');
    });
});

describe('quello che si ricorda (D1, D3)', () => {
    it('una lista salvata si ritrova, con ordine, nomi e publish; le spunte sono quelle dell\'ultimo giro', async () => {
        const ui = await bare(WORLD, {
            releaseTargets: { DEV: [
                { name: 'PROD', publishOnImport: 'force-true' }, { name: 'UAT', publishOnImport: 'keep' }, { name: 'HOTFIX', publishOnImport: 'force-false' },
            ] },
            targetSelection: { DEV: { S1: ['UAT', 'GONE', 'PROD'] } },
        });
        expect(ui.targetNames()).toEqual(['PROD', 'UAT', 'HOTFIX']);
        expect(ui.targetPublish('PROD')).toBe('force-true');
        expect(ui.targetPublish('HOTFIX')).toBe('force-false');
        expect(ui.ticked(), 'un Target che non c\'e\' piu\' sparisce dalle spunte, l\'ordine e\' quello della lista').toEqual(['PROD', 'UAT']);
    });

    it('la lista e\' per connessione: un\'altra connessione non la vede', async () => {
        const ui = await bare(WORLD, { releaseTargets: { ALTRA: [{ name: 'X', publishOnImport: 'keep' }] } });
        expect(ui.targetNames()).toEqual(PRESETS);
    });

    it('una lista salvata illeggibile vale "mai configurata": i preset, senza errori', async () => {
        for (const bad of ['rotto', 5, [1, 2], { DEV: 'x' }, { DEV: [null, 3] }]) {
            const ui = await bare(WORLD, { releaseTargets: bad });
            expect(ui.targetNames(), JSON.stringify(bad)).toEqual(
                (bad as { DEV?: unknown[] }).DEV?.length === 2 ? [] : PRESETS);
        }
    });

    it('le spunte si ricordano per solution: un\'altra solution parte da zero, tornando si ritrovano', async () => {
        const ui = await bare();
        await ui.tickTarget('UAT', true);
        await ui.tickTarget('PROD', true);
        await ui.crumb('Solutions');
        await ui.openSolution('S2');
        await ui.startRenameBare();
        expect(ui.ticked(), 'altra solution: nessuna spunta').toEqual([]);
        await ui.tickTarget('DEV', true);
        await ui.crumb('Solutions');
        await ui.openSolution('S1');
        await ui.startRenameBare();
        expect(ui.ticked()).toEqual(['UAT', 'PROD']);
        expect(savedSel(ui)!.DEV).toEqual({ S1: ['UAT', 'PROD'], S2: ['DEV'] });
    });

    it('le spunte si salvano anche procedendo a Review', async () => {
        const ui = await bare();
        await ui.tickTarget('UAT', true);
        await ui.next();
        expect(savedSel(ui)!.DEV!.S1).toEqual(['UAT']);
    });

    it('se il salvataggio fallisce lo dice, e si puo\' lavorare lo stesso', async () => {
        const ui = await bare();
        ui.fs.failSettings = true;
        await ui.addTarget('HOTFIX');
        expect(ui.targetNames()).toContain('HOTFIX');
        expect(ui.ticked()).toEqual(['HOTFIX']);
        expect(ui.targetNotice()).toContain('Not saved');
        expect(ui.nextDisabled()).toBe(false);
        await ui.next();
        expect(ui.step()).toBe('review');
    });
});

describe('piu\' Target nello stesso giro (FR-006, FR-008, FR-009, FR-012, FR-013, FR-014)', () => {
    async function twoTargets() {
        const ui = await bare(MULTI);
        await ui.setTargetPublish('PROD', 'force-true');
        await ui.tickTarget('UAT', true);
        await ui.tickTarget('PROD', true);
        return ui;
    }

    it('la revisione non ha il selettore dei Target ne\' l\'elenco degli agent, con uno o con due Target', async () => {
        const ui = await bare();
        await ui.tickTarget('UAT', true);
        await ui.next();
        expect(ui.switchTabs()).toEqual([]);
        expect(ui.doc.querySelector('#step-review table:not(.confirm-targets)')).toBeNull();
        await ui.back();
        await ui.tickTarget('PROD', true);
        await ui.next();
        expect(ui.switchTabs()).toEqual([]);
        expect(ui.doc.querySelector('#step-review table:not(.confirm-targets)')).toBeNull();
    });

    it('D8: sotto ogni Target spuntato c\'e\' la sua tabella di agent, con il nome "dopo" di quel Target', async () => {
        const ui = await twoTargets();
        const tables = ui.doc.querySelectorAll('#target-list .target-agents');
        expect(tables.length, 'una tabella per Target spuntato').toBe(2);
        expect(ui.suffixRows('UAT').map(r => r.nameAfter)).toEqual(['agent1 [UAT]', 'agent2 [UAT]']);
        expect(ui.suffixRows('PROD').map(r => r.nameAfter)).toEqual(['agent1 [PROD]', 'agent2 [PROD]']);
        expect(ui.suffixRows('PROD').map(r => r.publish), 'il default di PROD').toEqual(['force-true', 'force-true']);
        expect(ui.suffixRows('UAT').map(r => r.publish), 'il default di UAT').toEqual(['keep', 'keep']);
        // togliere la spunta al Target toglie la sua tabella
        await ui.tickTarget('PROD', false);
        expect(ui.doc.querySelectorAll('#target-list .target-agents').length).toBe(1);
    });

    it('D8: gli agent e il publish per agent sono indipendenti fra i Target', async () => {
        const ui = await twoTargets();
        await ui.toggleAgent('agent2', 'PROD');
        expect(ui.suffixRows('UAT').map(r => r.checked), 'UAT non cambia').toEqual([true, true]);
        expect(ui.suffixRows('PROD').map(r => r.checked)).toEqual([true, false]);
        await ui.setPublish('agent1 [DEV]', 'force-false', 'UAT');
        expect(ui.suffixRows('UAT').map(r => r.publish)).toEqual(['force-false', 'keep']);
        expect(ui.suffixRows('PROD').map(r => r.publish), 'PROD non cambia').toEqual(['force-true', null]);
        await ui.setAll('force-true', 'UAT');
        expect(ui.suffixRows('UAT').map(r => r.publish)).toEqual(['force-true', 'force-true']);
        expect(ui.suffixRows('PROD').map(r => r.publish)).toEqual(['force-true', null]);
    });

    it('D8: le scelte di un Target si ritrovano se si toglie e si rimette la spunta; la rinomina le porta con se\'', async () => {
        const ui = await twoTargets();
        await ui.toggleAgent('agent2', 'PROD');
        await ui.tickTarget('PROD', false);
        await ui.tickTarget('PROD', true);
        expect(ui.suffixRows('PROD').map(r => r.checked)).toEqual([true, false]);
        await ui.renameTarget('PROD', 'LIVE');
        expect(ui.suffixRows('LIVE').map(r => r.checked), 'dopo la rinomina').toEqual([true, false]);
        expect(ui.suffixRows('LIVE').map(r => r.nameAfter)[0]).toBe('agent1 [LIVE]');
    });

    it('D8: un Target senza agent da rinominare blocca Next e lo dice nella sua tabella', async () => {
        const ui = await twoTargets();
        await ui.toggleAgent('agent1 [DEV]', 'PROD');
        await ui.toggleAgent('agent2', 'PROD');
        expect(ui.nextDisabled()).toBe(true);
        const warn = ui.doc.querySelector('#target-list [data-agents-for]:last-of-type')?.textContent ?? '';
        expect(Array.from(ui.doc.querySelectorAll('#target-list .target-agents')).map(t => t.textContent!.includes('Nothing to rename')))
            .toEqual([false, true]);
        expect(warn).toBeDefined();
        await ui.toggleAgent('agent1 [DEV]', 'PROD');
        expect(ui.nextDisabled()).toBe(false);
    });

    it('D8: cambiare gli agent di un Target rifa il package, invece di riusare quello gia\' preparato', async () => {
        const ui = await twoTargets();
        await ui.next();
        await ui.buildPackage();
        const exports = () => ui.dev.events.filter(e => e.startsWith('export')).length;
        expect(exports()).toBe(1);
        await ui.back();
        await ui.back();
        expect(ui.step()).toBe('suffix');
        await ui.toggleAgent('agent2', 'PROD');
        await ui.next();
        await ui.buildPackage();
        expect(exports(), 'una scelta diversa rifa il giro').toBe(2);
    });

    it('cambiare solo il nome o il publish di un Target rifa il package', async () => {
        const ui = await twoTargets();
        await ui.next();
        await ui.buildPackage();
        const exports = () => ui.dev.events.filter(e => e.startsWith('export')).length;
        await ui.back();
        await ui.back();
        await ui.setTargetPublish('PROD', 'force-false');
        await ui.next();
        await ui.buildPackage();
        expect(exports(), 'publish del Target cambiato').toBe(2);
        await ui.back();
        await ui.back();
        await ui.renameTarget('PROD', 'LIVE');
        await ui.next();
        await ui.buildPackage();
        expect(exports(), 'nome del Target cambiato').toBe(3);
    });

    it('D8: un Target tolto e rimesso con lo stesso nome riparte da zero', async () => {
        const ui = await twoTargets();
        await ui.toggleAgent('agent2', 'PROD');
        await ui.setPublish('agent1 [DEV]', 'force-false', 'PROD');
        await ui.removeTarget('PROD');
        await ui.addTarget('PROD');
        expect(ui.suffixRows('PROD').map(r => r.checked), 'tutti gli agent').toEqual([true, true]);
        expect(ui.suffixRows('PROD').map(r => r.publish), 'il default del Target, non l\'eccezione di prima').toEqual(['keep', 'keep']);
    });

    it('D8: «Select all», «Deselect all» e la casella dell\'intestazione valgono per la tabella del loro Target', async () => {
        const ui = await twoTargets();
        await ui.selectAgents(false, 'PROD');
        expect(ui.suffixRows('PROD').map(r => r.checked)).toEqual([false, false]);
        expect(ui.suffixRows('UAT').map(r => r.checked), 'UAT non cambia').toEqual([true, true]);
        await ui.selectAgents(true, 'PROD');
        expect(ui.suffixRows('PROD').map(r => r.checked)).toEqual([true, true]);
        await ui.toggleAllAgents('PROD');          // tutti spuntati: la casella li toglie
        expect(ui.suffixRows('PROD').map(r => r.checked)).toEqual([false, false]);
        expect(ui.suffixRows('UAT').map(r => r.checked)).toEqual([true, true]);
        await ui.toggleAllAgents('PROD');          // nessuno: li mette tutti
        expect(ui.suffixRows('PROD').map(r => r.checked)).toEqual([true, true]);
    });

    it('D8: «Set for all ticked agents» agisce sugli agent spuntati di quel Target e non tocca gli altri', async () => {
        const ui = await twoTargets();
        await ui.toggleAgent('agent2', 'PROD');
        await ui.setAll('force-false', 'PROD');
        expect(ui.suffixRows('PROD').map(r => r.publish)).toEqual(['force-false', null]);
        expect(ui.suffixRows('UAT').map(r => r.publish), 'UAT non cambia').toEqual(['keep', 'keep']);
        await ui.toggleAgent('agent2', 'PROD');     // rimesso: non ha preso il valore «per tutti» mentre era escluso
        expect(ui.suffixRows('PROD').map(r => r.publish)).toEqual(['force-false', 'force-true']);
    });

    it('D8: l\'avviso dei nomi misti sta nella tabella del Target che li ha e nomina i suoi agent', async () => {
        const world: UiWorld = {
            solutions: [{ unique: 'S1' }],
            agents: [
                { name: 'a1 [DEV]', schema: 'ava_a1', solution: 'S1', publish: null },
                { name: 'a2 [DEV]', schema: 'ava_a2', solution: 'S1', publish: null },
            ],
        };
        const ui = await bare(world);
        await ui.tickTarget('UAT', true);
        await ui.tickTarget('PROD', true);
        await ui.toggleAgent('a2 [DEV]', 'PROD');
        expect(ui.agentsText('UAT')).not.toContain('different suffixes');
        const prod = ui.agentsText('PROD');
        expect(prod).toContain('different suffixes');
        expect(prod).toContain('Excluded and keeping the old suffix: a2 [DEV]');
    });

    it('D8: l\'avviso del suffisso vuoto parla degli agent del Target senza suffisso', async () => {
        const world: UiWorld = {
            solutions: [{ unique: 'S1' }],
            agents: [
                { name: 'a1 [DEV]', schema: 'ava_a1', solution: 'S1', publish: null },
                { name: 'a2', schema: 'ava_a2', solution: 'S1', publish: null },
            ],
        };
        const ui = await bare(world);
        await ui.tickTarget('UAT', true);
        await ui.tickTarget('PROD', true);
        await ui.addTarget('');
        await ui.toggleAgent('a1 [DEV]', 'PROD');    // escluso solo in PROD: nel Target senza suffisso c'e' ancora
        await ui.nextRaw();
        const text = (ui.doc.getElementById('confirm-overlay')!.textContent ?? '').replace(/\s+/g, ' ');
        expect(text).toContain('a1 [DEV]');
        expect(text).toContain('removes the existing suffix');
    });

    it('D8: un solo giro, due zip con agent e publish diversi', async () => {
        const ui = await twoTargets();
        await ui.toggleAgent('agent2', 'PROD');            // PROD lascia agent2 com'e'
        await ui.setPublish('agent1 [DEV]', 'force-false', 'UAT');
        await ui.next();
        await ui.buildPackage();
        await ui.toVerify();
        await ui.save();
        const { manifest, zips } = ui.written();
        const byName = (n: string) => readProduced(Object.entries(zips).find(([pth]) => pth.endsWith(n))![1]);
        expect(byName('_managed_UAT.zip')).toEqual({ ava_a1: { name: 'agent1 [UAT]', publish: false }, ava_a2: { name: 'agent2 [UAT]', publish: false } });
        expect(byName('_managed_PROD.zip')).toEqual({ ava_a1: { name: 'agent1 [PROD]', publish: true }, ava_a2: { name: 'agent2', publish: false } });
        const mf = manifest as { targets: { name: string; options: { publishByAgent: object }; agents: { schemaName: string; excluded: boolean }[] }[] };
        expect(mf.targets[0]!.options.publishByAgent).toEqual({ ava_a1: 'force-false' });
        expect(mf.targets[1]!.options.publishByAgent).toEqual({});
        expect(mf.targets[0]!.agents.map(a => a.excluded)).toEqual([false, false]);
        expect(mf.targets[1]!.agents.map(a => a.excluded)).toEqual([false, true]);
    });

    it('gli avvisi della revisione parlano di ogni Target, con le sue scelte', async () => {
        const long = 'a'.repeat(26) + ' [DEV]';
        const world: UiWorld = {
            solutions: [{ unique: 'S1' }],
            agents: [
                { name: long, schema: 'ava_a1', solution: 'S1', publish: null },
                { name: 'b [DEV]', schema: 'ava_a2', solution: 'S1', publish: null },
            ],
        };
        const ui = await bare(world);
        await ui.tickTarget('UAT', true);
        await ui.tickTarget('STAGING', true);
        await ui.toggleAgent(long, 'STAGING');   // il nome lungo resta fuori da STAGING
        await ui.next();
        const warn = ui.text('review');
        expect(warn).toMatch(/\[UAT\] 1 name is over 30 characters/);
        expect(warn, 'STAGING non ha nomi lunghi').not.toMatch(/\[STAGING\] \d+ names? (is|are) over/);
    });

    it('la revisione nomina i Target e conta gli archivi', async () => {
        const ui = await twoTargets();
        await ui.next();
        const t = ui.text('review');
        expect(t).toContain('[UAT]');
        expect(t).toContain('[PROD]');
        expect(t).toContain('2 archives');
        expect(ui.doc.querySelector('#step-review table:not(.confirm-targets)'), 'i nomi degli agent stanno nel passo Suffix').toBeNull();
    });

    it('con le copie extra gli archivi diventano 2 per Target piu\' 2', async () => {
        const ui = await twoTargets();
        await ui.setKeepCopies(true);
        await ui.next();
        expect(ui.text('review')).toContain('6 archives');
    });

    it('un solo export e una sola versione scritta per tutti i Target, e uno zip per Target', async () => {
        const ui = await twoTargets();
        await ui.next();
        await ui.buildPackage();
        expect(ui.dev.events.filter(e => e.startsWith('export')).length, 'un solo export').toBe(1);
        expect(ui.dev.writes.length, 'una sola scrittura di versione').toBe(1);
        // l'anteprima e i controlli hanno il selettore
        expect(ui.switchTabs().map(t => t.label)).toEqual(['[UAT]', '[PROD]']);
        await ui.toVerify();
        expect(ui.step()).toBe('verify');
        const matrix = ui.doc.getElementById('targets-matrix')!;
        const rows = Array.from(matrix.querySelectorAll('tbody tr')).map(tr =>
            Array.from(tr.querySelectorAll('td')).map(td => td.textContent!.replace(/\s+/g, ' ').trim()));
        expect(rows[0]![0]).toBe('[UAT]');
        expect(rows[0]![4]).toBe('reference');
        expect(rows[1]![0]).toBe('[PROD]');
        expect(rows[1]![2], 'nomi cambiati rispetto al primo').toBe('2');
        // keep contro force-true: agent1 era gia' true, cambia solo agent2
        expect(rows[1]![3], 'publish cambiato rispetto al primo').toBe('1');
        expect(rows[1]![4]).toMatch(/^\d+ of \d+$/);
        await ui.save();
        expect(ui.step()).toBe('result');

        const { manifest, zips } = ui.written();
        const names = Object.keys(zips).map(p => p.split(/[\\/]/).pop()!).sort();
        expect(names).toEqual(['S1_1_0_0_3_managed_PROD.zip', 'S1_1_0_0_3_managed_UAT.zip']);
        const mf = manifest as { manifestVersion: number; targets: { name: string; order: number; options: { publishOnImport: string };
            comparison: { against: string } | null; files: { fileName: string }[] }[] };
        expect(mf.manifestVersion).toBe(2);
        expect(mf.targets.map(x => x.name)).toEqual(['UAT', 'PROD']);
        expect(mf.targets.map(x => x.options.publishOnImport)).toEqual(['keep', 'force-true']);
        expect(mf.targets[0]!.comparison).toBeNull();
        expect(mf.targets[1]!.comparison!.against).toBe('UAT');
        // il contenuto di ciascuno zip
        const byName = (n: string) => readProduced(Object.entries(zips).find(([p]) => p.endsWith(n))![1]);
        expect(byName('_managed_UAT.zip')).toEqual({ ava_a1: { name: 'agent1 [UAT]', publish: true }, ava_a2: { name: 'agent2 [UAT]', publish: false } });
        expect(byName('_managed_PROD.zip')).toEqual({ ava_a1: { name: 'agent1 [PROD]', publish: true }, ava_a2: { name: 'agent2 [PROD]', publish: true } });
        // un solo record di storico, con i due Target
        const history = ui.history() as { suffix: string; targets: { name: string }[] }[];
        expect(history.length).toBe(1);
        expect(history[0]!.suffix).toBe('UAT + PROD');
        expect(history[0]!.targets.map(x => x.name)).toEqual(['UAT', 'PROD']);
    });

    it('nell\'anteprima il selettore cambia il Target mostrato; nei controlli ricorda la scelta', async () => {
        const ui = await twoTargets();
        await ui.next();
        await ui.buildPackage();
        const heads = () => Array.from(ui.doc.querySelectorAll('#step-preview .change-head')).map(h => h.textContent!.replace(/\s+/g, ' ').trim());
        expect(heads()[0]).toContain('agent1 [UAT]');
        await ui.switchTo('[PROD]');
        expect(heads()[0]).toContain('agent1 [PROD]');
        expect(ui.switchTabs().map(t => t.active)).toEqual([false, true]);
        await ui.toVerify();
        expect(ui.switchTabs().map(t => t.active), 'i controlli mostrano ancora PROD').toEqual([false, true]);
        await ui.switchTo('[UAT]');
        expect(ui.switchTabs().map(t => t.active)).toEqual([true, false]);
        // tornando all'anteprima si vede UAT
        await ui.back();
        expect(heads()[0]).toContain('agent1 [UAT]');
    });

    it('il risultato elenca un archivio da importare per ogni Target', async () => {
        const ui = await twoTargets();
        await ui.next();
        await ui.buildPackage();
        await ui.toVerify();
        await ui.save();
        const t = ui.text('result');
        expect(t).toContain('one managed archive per environment');
        expect(t).toContain('S1_1_0_0_3_managed_UAT.zip');
        expect(t).toContain('S1_1_0_0_3_managed_PROD.zip');
        expect(ui.doc.querySelectorAll('#step-result .handoff-line').length).toBe(2);
    });

    it('con un Target solo il risultato e\' quello di sempre: un archivio, nessun elenco', async () => {
        const ui = await bare();
        await ui.tickTarget('UAT', true);
        await ui.next();
        await ui.buildPackage();
        await ui.toVerify();
        await ui.save();
        expect(ui.text('result')).toContain('To import into UAT or PROD');
        expect(ui.doc.querySelectorAll('#step-result .handoff-line').length).toBe(0);
    });

    it('cambiare i Target dopo l\'anteprima rifa\' l\'export; non cambiare nulla no', async () => {
        const ui = await twoTargets();
        await ui.setRaise(false);
        await ui.next();
        await ui.buildPackage();
        const exports = () => ui.dev.events.filter(e => e.startsWith('export')).length;
        expect(exports()).toBe(1);
        // indietro e di nuovo avanti senza toccare nulla: nessun nuovo export
        await ui.back();
        await ui.back();
        await ui.next();
        await ui.buildPackage();
        expect(exports()).toBe(1);
        // togliere un Target: il package preparato non vale piu'
        await ui.back();
        await ui.back();
        await ui.tickTarget('PROD', false);
        await ui.next();
        await ui.buildPackage();
        expect(exports()).toBe(2);
        await ui.toVerify();
        await ui.save();
        expect(Object.keys(ui.written().zips).length).toBe(1);
    });

    it('un agent escluso con un suffisso diverso: la conferma dice in quali Target i nomi sarebbero misti', async () => {
        const world: UiWorld = {
            solutions: [{ unique: 'S1' }],
            agents: [
                { name: 'a1 [DEV]', schema: 'ava_a1', solution: 'S1', publish: null },
                { name: 'a2 [DEV]', schema: 'ava_a2', solution: 'S1', publish: null },
            ],
        };
        const ui = await bare(world);
        await ui.tickTarget('UAT', true);
        await ui.tickTarget('PROD', true);
        await ui.toggleAgent('a2 [DEV]', 'UAT');     // escluso solo in UAT: li' resta [DEV], in PROD no
        await ui.next();
        await ui.buildPackage();
        await ui.toVerify();
        const saved = await ui.save();
        expect(saved.confirmations).toEqual(['The agents would have different suffixes']);
        const mf = ui.written().manifest as { confirmations: { what: string }[] };
        expect(mf.confirmations[0]!.what).toContain('[UAT]: [UAT], [DEV]');
        expect(mf.confirmations[0]!.what, 'PROD non ha nomi misti').not.toContain('[PROD]:');
    });

    it('lo stesso agent escluso in tutti e due i Target: la conferma elenca tutti e due', async () => {
        const world: UiWorld = {
            solutions: [{ unique: 'S1' }],
            agents: [
                { name: 'a1 [DEV]', schema: 'ava_a1', solution: 'S1', publish: null },
                { name: 'a2 [DEV]', schema: 'ava_a2', solution: 'S1', publish: null },
            ],
        };
        const ui = await bare(world);
        await ui.tickTarget('UAT', true);
        await ui.tickTarget('PROD', true);
        await ui.toggleAgent('a2 [DEV]', 'UAT');
        await ui.toggleAgent('a2 [DEV]', 'PROD');
        await ui.next();
        await ui.buildPackage();
        await ui.toVerify();
        await ui.save();
        const mf = ui.written().manifest as { confirmations: { what: string }[] };
        expect(mf.confirmations[0]!.what).toContain('[UAT]: [UAT], [DEV]');
        expect(mf.confirmations[0]!.what).toContain('[PROD]: [PROD], [DEV]');
    });

    it('con un Target senza suffisso spuntato compare l\'avviso del suffisso vuoto; senza no', async () => {
        const ui = await bare();
        await ui.tickTarget('UAT', true);
        await ui.addTarget('');            // lo spunta anche
        await ui.nextRaw();
        expect(ui.doc.getElementById('confirm-overlay')!.style.display).toBe('flex');
        expect(ui.step()).toBe('suffix');
        const clean = await bare();
        await clean.tickTarget('UAT', true);
        await clean.nextRaw();
        expect(clean.step()).toBe('review');
    });
});
