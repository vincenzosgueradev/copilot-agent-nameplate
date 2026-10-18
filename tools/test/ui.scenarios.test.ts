// @vitest-environment jsdom
/**
 * Scenari della schermata che un percorso casuale non incontra con certezza: cambio di solution,
 * solution managed, agent senza solution, ricerca, annullare una conferma, copie extra, nomi
 * che contengono HTML. Ogni scenario dice, nel nome, la regola che difende.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { boot, readProduced, type UiWorld } from './helpers/ui-harness';
import { readSource } from './helpers/source';

const css = readSource('styles.css');

afterEach(() => { vi.useRealTimers(); });

const WORLD: UiWorld = {
    solutions: [{ unique: 'S1' }, { unique: 'S2' }, { unique: 'M', managed: true }],
    agents: [
        { name: 'agent1 [DEV]', schema: 'ava_a1', solution: 'S1', publish: true },
        { name: 'agent2 [DEV]', schema: 'ava_a2', solution: 'S1', publish: null },
        { name: 'beta1 [DEV]', schema: 'ava_b1', solution: 'S2', publish: false },
        { name: 'beta2 [DEV]', schema: 'ava_b2', solution: 'S2', publish: null },
        { name: 'beta3 [DEV]', schema: 'ava_b3', solution: 'S2', publish: true },
        { name: 'locked [DEV]', schema: 'ava_m1', solution: 'M', publish: null },
        { name: 'lonely', schema: 'ava_o1', solution: null, publish: null },
    ],
};

describe('stato tra solution (FR-044)', () => {
    it('cambiando solution si riparte da zero; tornando alla stessa si conserva', async () => {
        const ui = await boot(WORLD);
        await ui.openSolution('S1');
        await ui.startRename();
        await ui.typeSuffix('UAT');
        await ui.toggleAgent('agent2 [DEV]');
        await ui.setPublish('agent1 [DEV]', 'force-true');
        const snapshot = ui.suffixRows();

        await ui.crumb('Solutions');
        await ui.openSolution('S1');
        await ui.startRename();
        expect(ui.suffixInput()).toBe('UAT');
        expect(ui.suffixRows(), 'stessa solution: tutto conservato').toEqual(snapshot);

        await ui.crumb('Solutions');
        await ui.openSolution('S2');
        await ui.startRename();
        expect(ui.suffixInput(), 'altra solution: suffisso azzerato').toBe('');
        expect(ui.suffixRows().every(r => r.checked && r.publish === 'keep')).toBe(true);

        await ui.crumb('Solutions');
        await ui.openSolution('S1');
        await ui.startRename();
        expect(ui.suffixInput(), 'ritorno da un\'altra solution: azzerato').toBe('');
        expect(ui.suffixRows().every(r => r.checked && r.publish === 'keep')).toBe(true);
    });

    it('Back dalla revisione e dal suffisso conserva suffisso, esclusioni e publish', async () => {
        const ui = await boot(WORLD);
        await ui.openSolution('S2');
        await ui.startRename();
        await ui.typeSuffix('PROD');
        await ui.toggleAgent('beta2 [DEV]');
        await ui.setPublish('beta3 [DEV]', 'force-false');
        const snapshot = ui.suffixRows();
        await ui.next();
        expect(ui.step()).toBe('review');
        await ui.back();
        expect(ui.suffixRows()).toEqual(snapshot);
        await ui.back();
        expect(ui.step()).toBe('solution');
        await ui.startRename();
        expect(ui.suffixRows()).toEqual(snapshot);
        expect(ui.suffixInput()).toBe('PROD');
    });

    it('riattivare un agent ritrova il publish che aveva', async () => {
        const ui = await boot(WORLD);
        await ui.openSolution('S2');
        await ui.startRename();
        await ui.setPublish('beta1 [DEV]', 'force-true');
        await ui.toggleAgent('beta1 [DEV]');
        expect(ui.suffixRows().find(r => r.name === 'beta1 [DEV]')).toMatchObject({ checked: false, publish: null });
        await ui.toggleAgent('beta1 [DEV]');
        expect(ui.suffixRows().find(r => r.name === 'beta1 [DEV]')).toMatchObject({ checked: true, publish: 'force-true' });
    });
});

describe('campo del suffisso', () => {
    it('il preset attivo segue il valore; digitare altro lo spegne; Clear si abilita solo con un valore', async () => {
        const ui = await boot(WORLD);
        await ui.openSolution('S1');
        await ui.startRename();
        const clear = () => (ui.doc.getElementById('clear-suffix-btn') as HTMLButtonElement).disabled;
        const active = () => Array.from(ui.doc.querySelectorAll('.chip-btn.is-active')).map(b => b.textContent?.trim());
        expect(clear()).toBe(true);
        expect(active()).toEqual([]);
        await ui.preset('UAT');
        expect(ui.suffixInput()).toBe('UAT');
        expect(active()).toEqual(['UAT']);
        expect(clear()).toBe(false);
        await ui.typeSuffix('UAT2');
        expect(active()).toEqual([]);
        await ui.clearSuffix();
        expect(ui.suffixInput()).toBe('');
        expect(clear()).toBe(true);
    });

    it('un suffisso vuoto toglie quello esistente e lo dice', async () => {
        const ui = await boot(WORLD);
        await ui.openSolution('S1');
        await ui.startRename();
        expect(ui.suffixRows().map(r => r.nameAfter)).toEqual(['agent1', 'agent2']);
        expect(ui.text('suffix')).toContain('remove');
    });

    it('con ogni agent escluso, Next resta spento e non cambia schermata', async () => {
        const ui = await boot(WORLD);
        await ui.openSolution('S2');
        await ui.startRename();
        for (const r of ui.suffixRows()) await ui.toggleAgent(r.name);
        expect(ui.nextDisabled()).toBe(true);
        await ui.next();
        expect(ui.step()).toBe('suffix');
        expect(ui.text('suffix')).toContain('Nothing to rename');
        expect(ui.text('suffix')).toContain('native solution export or your ALM pipeline');
        expect(ui.suffixRows().every(r => r.nameAfter.startsWith('left as it is'))).toBe(true);
    });
});

describe('solution non rinominabili', () => {
    it('una solution managed non offre il rename e spiega perche\'', async () => {
        // L'elenco parte dal tipo che l'ambiente contiene: qui solo managed
        const ui = await boot({
            solutions: [{ unique: 'M', managed: true }],
            agents: [{ name: 'locked [DEV]', schema: 'ava_m1', solution: 'M', publish: null }],
        });
        await ui.search('locked');
        await ui.clickChip('locked [DEV]');
        expect(ui.step()).toBe('solution');
        expect(ui.exists('#rename-btn')).toBe(false);
        expect(ui.text('solution')).toContain('cannot be exported');
    });

    it('un agent senza solution non offre il rename', async () => {
        const ui = await boot(WORLD);
        await ui.search('lonely');
        await ui.clickChip('lonely');
        expect(ui.step()).toBe('solution');
        expect(ui.exists('#rename-btn')).toBe(false);
        expect(ui.text('solution')).toContain('any visible solution');
    });
});

describe('ricerca', () => {
    it('un risultato apre la solution dell\'agent e lo evidenzia (FR-023b)', async () => {
        const ui = await boot(WORLD);
        await ui.search('beta2');
        await ui.clickChip('beta2 [DEV]');
        expect(ui.step()).toBe('solution');
        const lit = Array.from(ui.doc.querySelectorAll('#step-solution tr.is-highlight')).map(r => r.getAttribute('data-agent'));
        expect(lit).toEqual(['bot-ava_b2']);
        await ui.startRename();
        expect(ui.suffixRows().map(r => r.name)).toEqual(['beta1 [DEV]', 'beta2 [DEV]', 'beta3 [DEV]']);
    });

    it('aprire la solution dall\'elenco non evidenzia nessuno', async () => {
        const ui = await boot(WORLD);
        await ui.openSolution('S2');
        expect(ui.doc.querySelectorAll('#step-solution tr.is-highlight').length).toBe(0);
    });
});

describe('salvataggio', () => {
    const go = async (world: UiWorld, unique: string, suffix: string) => {
        const ui = await boot(world);
        await ui.openSolution(unique);
        await ui.startRename();
        await ui.typeSuffix(suffix);
        return ui;
    };

    it('prima del salvataggio non viene scritto nulla su disco', async () => {
        const ui = await go(WORLD, 'S1', 'UAT');
        await ui.next();
        await ui.buildPackage();
        await ui.toVerify();
        expect(ui.fs.files.size).toBe(0);
        expect(ui.fs.dirs.size).toBe(0);
        expect(ui.history()).toEqual([]);
    });

    it('copie extra spente: un solo archivio; accese: i quattro', async () => {
        for (const [keep, expected] of [[false, 1], [true, 4]] as const) {
            const ui = await go(WORLD, 'S1', 'UAT');
            await ui.setKeepCopies(keep);
            expect(ui.text('suffix').includes('source_managed.zip')).toBe(true);   // elencato in entrambi i casi
            await ui.next();
            await ui.buildPackage();
            await ui.toVerify();
            await ui.save();
            const names = Object.keys(ui.written().zips).map(p => p.split('/').pop()!);
            expect(names.length, `keep=${keep}: ${names.join(', ')}`).toBe(expected);
            if (keep) {
                expect(names.sort()).toEqual([
                    'S1_1_0_0_3_managed_UAT.zip', 'S1_1_0_0_3_unmanaged_UAT.zip',
                    'source_managed.zip', 'source_unmanaged.zip',
                ]);
            }
        }
    });

    it('managed e unmanaged escono con lo stesso contenuto patchato', async () => {
        const ui = await go(WORLD, 'S1', 'UAT');
        await ui.setKeepCopies(true);
        await ui.setAll('force-true');
        await ui.next();
        await ui.buildPackage();
        await ui.toVerify();
        await ui.save();
        const zips = ui.written().zips;
        const get = (part: string) => readProduced(Object.entries(zips).find(([p]) => p.includes(part))![1]);
        expect(get('_managed_')).toEqual(get('_unmanaged_'));
        expect(get('_managed_')).toEqual({
            ava_a1: { name: 'agent1 [UAT]', publish: true },
            ava_a2: { name: 'agent2 [UAT]', publish: true },
        });
        // gli originali restano com'erano
        expect(get('source_managed')).toEqual({
            ava_a1: { name: 'agent1 [DEV]', publish: true },
            ava_a2: { name: 'agent2 [DEV]', publish: null },
        });
    });

    it('annullare la conferma sui suffissi misti non scrive niente e resta sulla verifica', async () => {
        const ui = await go(WORLD, 'S1', 'UAT');
        await ui.toggleAgent('agent2 [DEV]');           // agent2 resta [DEV], agent1 diventa [UAT]
        await ui.next();
        await ui.buildPackage();
        await ui.toVerify();
        const r = await ui.save(false);
        expect(r.confirmations).toEqual(['The agents would have different suffixes']);
        expect(ui.step()).toBe('verify');
        expect(ui.written().manifest).toBeNull();
        expect(ui.fs.files.size).toBe(0);
        expect(ui.history()).toEqual([]);
    });

    it('tutto gia\' sul suffisso: nessun cambio, e lo dice onestamente', async () => {
        const done: UiWorld = {
            solutions: [{ unique: 'S1' }],
            agents: [
                { name: 'one [UAT]', schema: 'ava_a1', solution: 'S1', publish: true },
                { name: 'two [UAT]', schema: 'ava_a2', solution: 'S1', publish: true },
            ],
        };
        const ui = await go(done, 'S1', 'UAT');
        expect(ui.suffixRows().every(r => r.nameAfter.endsWith('(unchanged)'))).toBe(true);
        await ui.next();
        expect(ui.text('review')).toContain('No name changes');
        await ui.buildPackage();
        await ui.toVerify();
        expect(ui.verifyText()).toContain('with 0 entries changed');
        await ui.save();
        const mf = ui.written().manifest as { agents: { before: string; after: string; excluded: boolean }[] };
        expect(mf.agents.every(a => a.before === a.after && !a.excluded)).toBe(true);
    });

    it('solution senza suffisso di partenza: aggiunge, non sostituisce', async () => {
        const plain: UiWorld = {
            solutions: [{ unique: 'S1' }],
            agents: [{ name: 'plain', schema: 'ava_a1', solution: 'S1', publish: null }],
        };
        const ui = await go(plain, 'S1', 'UAT');
        await ui.next();
        await ui.buildPackage();
        await ui.toVerify();
        await ui.save();
        const zips = Object.entries(ui.written().zips);
        expect(readProduced(zips[0]![1])).toEqual({ ava_a1: { name: 'plain [UAT]', publish: null } });
    });
});

describe('revisione e anteprima: layout', () => {
    it('i pannelli della revisione stanno uno sotto l\'altro, non affiancati', async () => {
        const ui = await boot(WORLD);
        await ui.openSolution('S2');
        await ui.startRename();
        await ui.next();
        expect(ui.doc.querySelector('#step-review .two-col')).toBeNull();
        const panels = ui.doc.querySelectorAll('#step-review .stack > section.panel');
        expect(panels.length).toBe(2);
        // la tabella della revisione usa un layout che non taglia l'ultima colonna
        expect(ui.reviewRows().every(r => r.length.includes('/'))).toBe(true);
    });

    it('il toggle riempie la sua colonna: tre pulsanti uguali, a tutta larghezza', () => {
        const group = /\.data-table--fill \.toggle-group--sm\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
        expect(group).toMatch(/display:\s*flex/);
        expect(group).toMatch(/width:\s*100%/);
        const btn = /\.data-table--fill \.toggle-group--sm \.toggle-btn\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
        expect(btn).toMatch(/flex:\s*1/);
    });

    it('le colonne della tabella degli agent si dividono la larghezza', async () => {
        const ui = await boot(WORLD);
        await ui.openSolution('S2');
        await ui.startRename();
        const widths = Array.from(ui.doc.querySelectorAll('#agent-list colgroup col'))
            .map(c => (c as HTMLElement).style.width);
        // checkbox stretta; agente e nome ricevono una quota; il tipo ha una larghezza fissa; l'ultima prende il resto
        expect(widths[0]).toBe('48px');
        expect(widths[1]).toMatch(/%$/);
        expect(widths[2]).toMatch(/px$/);
        expect(widths[3]).toBe(widths[1]);
        expect(widths[4]).toBe('');
        const share = (w: string) => Number(w.replace('%', ''));
        expect(share(widths[1]!) + share(widths[3]!)).toBeLessThanOrEqual(70);   // lascia spazio al toggle
        expect(share(widths[1]!) + share(widths[3]!)).toBeGreaterThanOrEqual(50);
    });

    it('le descrizioni degli artefatti non hanno una larghezza massima', () => {
        const rule = /\.art-desc\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
        expect(rule).not.toBe('');
        expect(rule).not.toMatch(/max-width/);
        expect(/\.art-body\s*\{([^}]*)\}/.exec(css)?.[1]).toMatch(/flex:\s*1/);
    });

    it('"What gets changed" ha un blocco per agent toccato; la versione non e\' un blocco ma una nota', async () => {
        const ui = await boot(WORLD);
        await ui.openSolution('S2');
        await ui.startRename();
        await ui.typeSuffix('UAT');
        await ui.toggleAgent('beta2 [DEV]');
        await ui.setPublish('beta1 [DEV]', 'force-true');
        await ui.next();
        await ui.buildPackage();
        const groups = Array.from(ui.doc.querySelectorAll('#step-preview .change-group'));
        expect(groups.map(g => g.getAttribute('data-group'))).toEqual(['agent:ava_b1', 'agent:ava_b3']);
        const rowsOf = (g: Element) => Array.from(g.querySelectorAll('tbody tr')).map(tr => tr.querySelector('td')!.textContent!.replace(/\s+/g, ' ').trim());
        expect(rowsOf(groups[0]!)).toEqual(['Name ava_b1/bot.xml'.replace('ava_b1/', 'bots/ava_b1/'), 'Publish on import bots/ava_b1/configuration.json']);
        expect(rowsOf(groups[1]!)).toEqual(['Name bots/ava_b3/bot.xml']);
        expect(ui.doc.getElementById('version-note')!.textContent!.replace(/\s+/g, ' ')).toContain('1.0.0.2 → 1.0.0.3');
        expect(groups[0]!.querySelector('.change-head')!.textContent).toContain('beta1 [UAT]');
        // l'agent escluso non ha un blocco ma e' nominato
        expect(ui.previewText()).toContain('Left as they are: beta2 [DEV]');
        expect(ui.doc.querySelector('#step-preview [data-group="agent:ava_b2"]')).toBeNull();
        // niente piu' tabella piatta con la colonna "File"
        expect(ui.doc.querySelector('#step-preview th')?.textContent).not.toBe('File');
    });

    it('la versione non e\' mai un blocco dei cambi del package', async () => {
        for (const raise of [true, false]) {
            const ui = await boot(WORLD);
            await ui.openSolution('S1');
            await ui.startRename();
            await ui.setRaise(raise);
            await ui.next();
            await ui.buildPackage();
            expect(ui.doc.querySelector('#step-preview [data-group="solution"]'), `raise=${raise}`).toBeNull();
            expect(ui.doc.getElementById('version-note') !== null, `nota con raise=${raise}`).toBe(raise);
        }
    });
});

describe('avanzamento: le fasi si vedono passare', () => {
    it('"Read the packages" e "Patch and verify" restano visibili, una dopo l\'altra', async () => {
        const ui = await boot(WORLD);
        await ui.openSolution('S1');
        await ui.startRename();
        await ui.typeSuffix('UAT');
        await ui.next();
        await ui.startBuild();

        const seen: { phase: string; at: number }[] = [];
        for (let t = 0; t <= 4000; t += 100) {
            const phase = ui.runningPhase();
            if (phase && seen.at(-1)?.phase !== phase) seen.push({ phase, at: t });
            await ui.tick(100);
        }
        const names = seen.map(s => s.phase);
        const read = names.indexOf('Read the packages');
        const patch = names.indexOf('Patch and verify');
        expect(read, `fasi viste: ${names.join(' > ')}`).toBeGreaterThanOrEqual(0);
        expect(patch, `fasi viste: ${names.join(' > ')}`).toBeGreaterThan(read);
        // tra le due passa abbastanza tempo da vederle
        expect(seen[patch]!.at - seen[read]!.at).toBeGreaterThanOrEqual(600);
        await ui.tick(3000);
        expect(ui.doc.querySelector('#preview-panels .change-group')).not.toBeNull();
    });
});

describe('versione: si alza in DEV a ogni export, come fa il portale (FR-073, FR-073b, FR-067a)', () => {
    const open = async (world: UiWorld = WORLD, unique = 'S1') => {
        const ui = await boot(world);
        await ui.openSolution(unique);
        await ui.startRename();
        await ui.typeSuffix('UAT');
        return ui;
    };
    type Ui = Awaited<ReturnType<typeof open>>;
    const buildAndSave = async (ui: Ui) => { await ui.next(); await ui.buildPackage(); await ui.toVerify(); await ui.save(); };
    const zipVersion = (ui: Ui): string => {
        const z = Object.entries(ui.written().zips).find(([p]) => p.includes('_managed_'))![1];
        return /<Version>([^<]*)</.exec(strFromU8(unzipSync(z)['solution.xml']!))![1]!;
    };
    const text = (ui: Ui, id: string) => (ui.doc.getElementById(id)?.textContent ?? '').replace(/\s+/g, ' ').trim();

    it('per default propone il numero dopo, lo scrive in DEV PRIMA dell\'export, e lo zip lo porta', async () => {
        const ui = await open();
        expect(ui.raiseOn()).toBe(true);
        expect(ui.versionFieldVisible()).toBe(true);
        expect(ui.versionInput()).toBe('1.0.0.3');
        expect(ui.nextDisabled()).toBe(false);
        const hint = ui.versionHint();
        expect(hint).toContain('1.0.0.2 → 1.0.0.3');
        expect(hint).toContain('in DEV before the export');
        expect(hint).toContain('Upgrade');
        expect(hint).toContain('removed too');
        expect(hint).toContain('Update and Stage for upgrade keep them');

        await buildAndSave(ui);
        expect(ui.dev.versionOf('S1')).toBe('1.0.0.3');
        expect(ui.dev.events.slice(0, 2)).toEqual(['write S1 1.0.0.3', 'export S1']);
        expect(zipVersion(ui)).toBe('1.0.0.3');
        expect(Object.keys(ui.written().zips)[0]).toContain('S1_1_0_0_3_managed_UAT.zip');
        const mf = ui.written().manifest as { versionChange: unknown; options: { newVersion: string } };
        expect(mf.versionChange).toEqual({ from: '1.0.0.2', to: '1.0.0.3', changed: true });
        expect(mf.options.newVersion).toBe('1.0.0.3');
        expect((ui.history()[0] as { versionChange: unknown }).versionChange).toEqual(mf.versionChange);
    });

    it('spenta: DEV non si tocca, nessuna scrittura, lo zip porta la versione di DEV, e il testo avverte', async () => {
        const ui = await open();
        await ui.setRaise(false);
        expect(ui.versionFieldVisible()).toBe(false);
        const hint = ui.versionHint();
        expect(hint).toContain('1.0.0.2 stays as it is in DEV and in the package');
        expect(hint).toContain('Update');
        expect(hint).toContain('never removes components');
        expect(hint).toContain('deleted in the source');
        expect(hint).not.toContain('Upgrade');
        await buildAndSave(ui);
        expect(ui.dev.writes).toEqual([]);
        expect(ui.dev.versionOf('S1')).toBe('1.0.0.2');
        expect(zipVersion(ui)).toBe('1.0.0.2');
        expect((ui.written().manifest as { versionChange: unknown }).versionChange).toBeNull();
    });

    it('una versione scelta a mano viene scritta e portata dallo zip', async () => {
        const ui = await open();
        await ui.typeVersion('2.0.0.0');
        expect(ui.versionHint()).toContain('1.0.0.2 → 2.0.0.0');
        await buildAndSave(ui);
        expect(ui.dev.versionOf('S1')).toBe('2.0.0.0');
        expect(zipVersion(ui)).toBe('2.0.0.0');
    });

    it('una versione non valida o non piu\' alta blocca Next e dice perche\'; correggerla lo sblocca', async () => {
        const ui = await open();
        const cases: [string, RegExp][] = [
            ['', /Enter a version/], ['   ', /Enter a version/], ['abc', /four numbers/], ['1.0', /four numbers/],
            ['1.0.0.2', /higher than the version in DEV \(1\.0\.0\.2\)/], ['1.0.0.1', /higher than the version in DEV/],
        ];
        for (const [value, message] of cases) {
            await ui.typeVersion(value);
            expect(ui.nextDisabled(), JSON.stringify(value)).toBe(true);
            expect(ui.versionIssue(), JSON.stringify(value)).toMatch(message);
            expect(ui.versionHint(), JSON.stringify(value)).toContain('Choose a valid new version');
            await ui.next();
            expect(ui.step(), `Next non deve avanzare con ${JSON.stringify(value)}`).toBe('suffix');
        }
        await ui.typeVersion('1.0.0.5');
        expect(ui.nextDisabled()).toBe(false);
        expect(ui.versionIssue()).toBe('');
    });

    it('con l\'opzione spenta una versione non valida non blocca; riaccesa, blocca di nuovo', async () => {
        const ui = await open();
        await ui.typeVersion('abc');
        expect(ui.nextDisabled()).toBe(true);
        await ui.setRaise(false);
        expect(ui.nextDisabled()).toBe(false);
        expect(ui.versionIssue()).toBe('');
        await ui.setRaise(true);
        expect(ui.versionInput()).toBe('abc');
        expect(ui.nextDisabled()).toBe(true);
    });

    it('la revisione ripete lo stesso testo, in entrambi i casi', async () => {
        for (const raise of [true, false]) {
            const ui = await open();
            await ui.setRaise(raise);
            const under = ui.versionHint();
            await ui.next();
            expect(text(ui, 'review-version'), `raise=${raise}`).toBe(under);
        }
    });

    it('tornare indietro e ricostruire NON alza la versione una seconda volta (FR-073b)', async () => {
        const ui = await open();
        await ui.next();
        await ui.buildPackage();
        expect(ui.dev.versionOf('S1')).toBe('1.0.0.3');
        await ui.back();                         // anteprima → revisione
        await ui.back();                         // revisione → suffisso
        expect(ui.versionInput(), 'la proposta resta ferma').toBe('1.0.0.3');
        await ui.setPublish('agent1 [DEV]', 'force-true');   // cambia qualcosa: serve un nuovo package
        await ui.next();
        await ui.buildPackage();
        expect(ui.dev.writes.length, 'una sola scrittura').toBe(1);
        expect(ui.dev.versionOf('S1')).toBe('1.0.0.3');
        expect(text(ui, 'version-note')).toContain('DEV was already at 1.0.0.3: nothing was written');
    });

    it('dopo il salvataggio la prossima operazione riparte dal numero nuovo', async () => {
        const ui = await open();
        await buildAndSave(ui);
        await ui.crumb('Solutions');
        await ui.openSolution('S1');
        await ui.startRename();
        expect(ui.versionInput()).toBe('1.0.0.4');
        expect(ui.versionHint()).toContain('1.0.0.3 → 1.0.0.4');
    });

    it('lo stesso package per un altro ambiente: si spegne l\'opzione e porta la versione che DEV ha gia\'', async () => {
        const ui = await open();
        await buildAndSave(ui);                                  // UAT → 1.0.0.3
        await ui.crumb('Solutions');
        await ui.openSolution('S1');
        await ui.startRename();
        await ui.typeSuffix('PROD');
        await ui.setRaise(false);
        await buildAndSave(ui);
        expect(ui.dev.writes.length, 'nessuna scrittura la seconda volta').toBe(1);
        const zips = Object.keys(ui.written().zips);
        expect(zips.some(p => p.endsWith('S1_1_0_0_3_managed_UAT.zip'))).toBe(true);
        expect(zips.some(p => p.endsWith('S1_1_0_0_3_managed_PROD.zip'))).toBe(true);
    });

    it('cambiando solution la versione si ricalcola da quella nuova', async () => {
        const ui = await open();
        await ui.typeVersion('5.0.0.0');
        await ui.crumb('Solutions');
        await ui.openSolution('S2');
        await ui.startRename();
        expect(ui.versionInput()).toBe('1.0.0.3');
        expect(ui.raiseOn()).toBe(true);
    });

    it('tornando indietro la scelta si conserva', async () => {
        const ui = await open();
        await ui.typeVersion('2.0.0.0');
        await ui.next();
        await ui.back();
        expect(ui.versionInput()).toBe('2.0.0.0');
        expect(ui.raiseOn()).toBe(true);
    });

    it('segue la versione della solution, anche quando l\'ultimo numero va a due cifre', async () => {
        const w: UiWorld = {
            solutions: [{ unique: 'S1', version: '2.7.0.9' }],
            agents: [{ name: 'x [DEV]', schema: 'ava_a1', solution: 'S1', publish: null }],
        };
        const ui = await open(w);
        expect(ui.versionInput()).toBe('2.7.0.10');
        expect(ui.versionHint()).toContain('2.7.0.9 → 2.7.0.10');
    });

    it('l\'elenco degli artefatti mostra il nome col numero che avra\'', async () => {
        const ui = await open();
        expect(ui.text('suffix')).toContain('S1_1_0_0_3_managed_UAT.zip');
        await ui.typeVersion('2.0.0.0');
        expect(ui.text('suffix')).toContain('S1_2_0_0_0_managed_UAT.zip');
        await ui.setRaise(false);
        expect(ui.text('suffix')).toContain('S1_1_0_0_2_managed_UAT.zip');
    });

    describe('quando la versione non si riesce ad alzare, non si esporta', () => {
        const failed = async (ui: Ui) => {
            await ui.next();
            await ui.buildPackage();
            expect(ui.step()).toBe('preview');
            expect(ui.previewText()).toContain('The package could not be prepared');
            expect(ui.dev.events.some(e => e.startsWith('export'))).toBe(false);
            return ui.previewText();
        };
        it('qualcuno l\'ha alzata nel frattempo', async () => {
            const ui = await open();
            ui.dev.solutions.find(s => s.unique === 'S1')!.version = '1.0.0.9';
            expect(await failed(ui)).toContain('already at 1.0.0.9');
            expect(ui.dev.writes).toEqual([]);
        });
        it('la scrittura viene rifiutata (permessi)', async () => {
            const ui = await open();
            ui.dev.failWriteWith = 'Principal user is missing prvWriteSolution privilege';
            expect(await failed(ui)).toContain('prvWriteSolution');
            expect(ui.dev.versionOf('S1')).toBe('1.0.0.2');
        });
        it('la scrittura non ha effetto', async () => {
            const ui = await open();
            ui.dev.ignoreWrites = true;
            const shown = await failed(ui);
            expect(shown).toContain('reads 1.0.0.2 after writing 1.0.0.3');
            expect(shown).toContain('The export was not started');
        });
    });

    it('le fasi dell\'avanzamento: con la versione c\'e\' "Raise the version in DEV" per prima, senza no', async () => {
        for (const raise of [true, false]) {
            const ui = await open();
            await ui.setRaise(raise);
            await ui.next();
            await ui.startBuild();
            const labels = Array.from(ui.doc.querySelectorAll('#preview-progress .ph')).map(li => li.textContent!.trim());
            expect(labels, `raise=${raise}`).toEqual([
                ...(raise ? ['Raise the version in DEV'] : []),
                'Export managed', 'Export unmanaged', 'Read the packages', 'Patch and verify',
            ]);
            await ui.tick(6000);
        }
    });
});

describe('posizione di scorrimento', () => {
    /**
     * jsdom non fa il layout, quindi nessun elemento scorre davvero: si sostituisce `scrollTop`
     * con un valore memorizzato, per simulare un utente che ha scorso in fondo.
     */
    const SCROLLERS = '.step-panel, #solutions-table-container, .panel-table';
    function watchScroll(doc: Document) {
        const store = new Map<Element, number>();
        const hook = (el: Element) => {
            if (store.has(el)) return;
            store.set(el, 0);
            Object.defineProperty(el, 'scrollTop', {
                configurable: true, get: () => store.get(el) ?? 0, set: (v: number) => { store.set(el, v); },
            });
        };
        return {
            /** Porta in fondo ogni contenitore che scorre, anche quelli appena disegnati. */
            scrollAllDown() { doc.querySelectorAll(SCROLLERS).forEach(el => { hook(el); store.set(el, 480); }); },
            top: (el: Element | null) => (el ? store.get(el) ?? 0 : -1),
            hookAll() { doc.querySelectorAll(SCROLLERS).forEach(hook); },
            set: (el: Element, v: number) => { hook(el); store.set(el, v); },
        };
    }
    const shown = (ui: { doc: Document; step(): string }) => {
        const ids: Record<string, string> = {
            welcome: 'solutions-table-container', solution: 'step-solution', suffix: 'step-suffix',
            review: 'step-review', preview: 'step-preview', verify: 'step-verify', result: 'step-result',
        };
        return ui.doc.getElementById(ids[ui.step()]!);
    };

    it('ogni cambio di schermata, avanti e indietro, riparte dall\'alto', async () => {
        const ui = await boot(WORLD);
        const sc = watchScroll(ui.doc);
        const go = async (label: string, action: () => Promise<void>) => {
            sc.scrollAllDown();                      // l'utente era in fondo, ovunque
            await action();
            sc.hookAll();
            expect(sc.top(shown(ui)), `dopo "${label}" (${ui.step()}): scorrimento`).toBe(0);
        };

        await go('apri solution', () => ui.openSolution('S2'));
        expect(ui.step()).toBe('solution');
        await go('Set the suffix', () => ui.startRename());
        expect(ui.step()).toBe('suffix');
        await go('Next', () => ui.next());
        expect(ui.step()).toBe('review');
        await go('Build', () => ui.buildPackage());
        expect(ui.step()).toBe('preview');
        await go('Checks', () => ui.toVerify());
        expect(ui.step()).toBe('verify');

        // e tornando indietro, uno step alla volta
        await go('Back da verify', () => ui.back());
        expect(ui.step()).toBe('preview');
        await go('Back da preview', () => ui.back());
        expect(ui.step()).toBe('review');
        await go('Back da review', () => ui.back());
        expect(ui.step()).toBe('suffix');
        await go('Back da suffix', () => ui.back());
        expect(ui.step()).toBe('solution');
        await go('breadcrumb Solutions', () => ui.crumb('Solutions'));
        expect(ui.step()).toBe('welcome');
    });

    it('la tabella interna alla solution riparte dall\'alto anche se un\'altra era in fondo', async () => {
        const ui = await boot(WORLD);
        const sc = watchScroll(ui.doc);
        await ui.openSolution('S2');
        sc.hookAll();
        sc.scrollAllDown();
        await ui.startRename();
        await ui.back();                              // ridisegna la vista della solution
        sc.hookAll();
        expect(sc.top(ui.doc.querySelector('#step-solution .panel-table'))).toBe(0);
    });

    it('un ridisegno sul posto NON perde la posizione (si digita il suffisso a meta\' pagina)', async () => {
        const ui = await boot(WORLD);
        const sc = watchScroll(ui.doc);
        await ui.openSolution('S2');
        await ui.startRename();
        const panel = ui.doc.getElementById('step-suffix')!;
        sc.hookAll();
        sc.set(panel, 300);
        await ui.typeSuffix('UAT');
        await ui.toggleAgent('beta1 [DEV]');
        await ui.setAll('force-true');
        expect(sc.top(panel), 'digitare e cliccare non deve riportare in cima').toBe(300);
    });
});

describe('contenuto non fidato: nessun HTML eseguibile', () => {
    const evil = '<img src=x onerror=alert(1)> & "q" [DEV]';
    const world: UiWorld = {
        solutions: [{ unique: 'S1' }],
        agents: [{ name: evil, schema: 'ava_a1', solution: 'S1', publish: null }],
    };
    it('il nome di un agent resta testo in ogni schermata', async () => {
        const ui = await boot(world);
        await ui.openSolution('S1');
        // l'unico <img> ammesso e' il logo dell'app nella cella del tipo (spec 010)
        expect(ui.doc.querySelector('#step-solution img:not([src="./logo.svg"])')).toBeNull();
        await ui.startRename();
        expect(ui.doc.querySelector('#step-suffix img:not([src="./logo.svg"])')).toBeNull();
        expect(ui.suffixRows()[0]!.name).toBe(evil);
        await ui.typeSuffix('UAT');
        await ui.next();
        expect(ui.doc.querySelector('#step-review img')).toBeNull();
        expect(ui.reviewRows()[0]!.resulting).toBe('<img src=x onerror=alert(1)> & "q" [UAT]');
        await ui.buildPackage();
        expect(ui.doc.querySelector('#step-preview img')).toBeNull();
        await ui.toVerify();
        expect(ui.doc.querySelector('#step-verify img')).toBeNull();
        await ui.save();
        const zip = Object.values(ui.written().zips)[0]!;
        expect(readProduced(zip).ava_a1!.name).toBe('<img src=x onerror=alert(1)> & "q" [UAT]');
    });
    it('un suffisso con HTML non diventa HTML', async () => {
        const ui = await boot(world);
        await ui.openSolution('S1');
        await ui.startRename();
        await ui.typeSuffix('<b>X</b>');
        expect(ui.doc.querySelector('#step-suffix b')).toBeNull();
        await ui.next();
        expect(ui.doc.querySelector('#step-review b')).toBeNull();
    });
});
