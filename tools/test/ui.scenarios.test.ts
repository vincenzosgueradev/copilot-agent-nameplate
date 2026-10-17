// @vitest-environment jsdom
/**
 * Scenari della schermata che un percorso casuale non incontra con certezza: cambio di solution,
 * solution managed, agent senza solution, ricerca, annullare una conferma, copie extra, nomi
 * che contengono HTML. Ogni scenario dice, nel nome, la regola che difende.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
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
        expect(ui.text('suffix')).toContain('Select at least one agent');
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
                    'S1_1_0_0_2_managed_UAT.zip', 'S1_1_0_0_2_unmanaged_UAT.zip',
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

    it('le descrizioni degli artefatti non hanno una larghezza massima', () => {
        const rule = /\.art-desc\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
        expect(rule).not.toBe('');
        expect(rule).not.toMatch(/max-width/);
        expect(/\.art-body\s*\{([^}]*)\}/.exec(css)?.[1]).toMatch(/flex:\s*1/);
    });

    it('"What gets changed" ha un blocco per agent toccato e uno per la solution', async () => {
        const ui = await boot(WORLD);
        await ui.openSolution('S2');
        await ui.startRename();
        await ui.typeSuffix('UAT');
        await ui.toggleAgent('beta2 [DEV]');
        await ui.setPublish('beta1 [DEV]', 'force-true');
        await ui.setBump(true);
        await ui.next();
        await ui.buildPackage();
        const groups = Array.from(ui.doc.querySelectorAll('#step-preview .change-group'));
        expect(groups.map(g => g.getAttribute('data-group'))).toEqual(['agent:ava_b1', 'agent:ava_b3', 'solution']);
        const rowsOf = (g: Element) => Array.from(g.querySelectorAll('tbody tr')).map(tr => tr.querySelector('td')!.textContent!.replace(/\s+/g, ' ').trim());
        expect(rowsOf(groups[0]!)).toEqual(['Name ava_b1/bot.xml'.replace('ava_b1/', 'bots/ava_b1/'), 'Publish on import bots/ava_b1/configuration.json']);
        expect(rowsOf(groups[1]!)).toEqual(['Name bots/ava_b3/bot.xml']);
        expect(rowsOf(groups[2]!)).toEqual(['Version solution.xml']);
        expect(groups[0]!.querySelector('.change-head')!.textContent).toContain('beta1 [UAT]');
        // l'agent escluso non ha un blocco ma e' nominato
        expect(ui.previewText()).toContain('Left as they are: beta2 [DEV]');
        expect(ui.doc.querySelector('#step-preview [data-group="agent:ava_b2"]')).toBeNull();
        // niente piu' tabella piatta con la colonna "File"
        expect(ui.doc.querySelector('#step-preview th')?.textContent).not.toBe('File');
    });

    it('senza bump non c\'e\' il blocco della solution', async () => {
        const ui = await boot(WORLD);
        await ui.openSolution('S1');
        await ui.startRename();
        await ui.typeSuffix('UAT');
        await ui.next();
        await ui.buildPackage();
        expect(ui.doc.querySelector('#step-preview [data-group="solution"]')).toBeNull();
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

describe('contenuto non fidato: nessun HTML eseguibile', () => {
    const evil = '<img src=x onerror=alert(1)> & "q" [DEV]';
    const world: UiWorld = {
        solutions: [{ unique: 'S1' }],
        agents: [{ name: evil, schema: 'ava_a1', solution: 'S1', publish: null }],
    };
    it('il nome di un agent resta testo in ogni schermata', async () => {
        const ui = await boot(world);
        await ui.openSolution('S1');
        expect(ui.doc.querySelector('#step-solution img')).toBeNull();
        await ui.startRename();
        expect(ui.doc.querySelector('#step-suffix img')).toBeNull();
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
