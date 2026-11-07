/**
 * Spec 016 (Fase 1) — la lista dei Target: funzioni pure e store.
 * Oracolo scritto dalla spec: FR-001…FR-005, FR-007 e la tabella dei dati di `data-model.md`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
    addTarget, defaultTargets, isProductionTarget, missingPresets, needsNoSuffixWarning, moveTarget, readSelection, readTargets, reconcileSelection,
    removeTarget, renameInSelections, renameTarget, restoreDefaults, saveSelection, saveTargets, setTargetProduction,
    setTargetPublish,
    validateTargetName,
} from '../src/services/targets';
import type { Target } from '../src/types';

const store = new Map<string, unknown>();
let failGet = false;
let failSet = false;
let sets = 0;

beforeEach(() => {
    store.clear();
    failGet = false;
    failSet = false;
    sets = 0;
    (globalThis as unknown as Record<string, unknown>).toolboxAPI = {
        settings: {
            get: async (k: string) => { if (failGet) throw new Error('get ko'); return store.get(k); },
            set: async (k: string, v: unknown) => { if (failSet) throw new Error('set ko'); sets++; store.set(k, v); },
        },
    };
});

const t = (name: string, publishOnImport: Target['publishOnImport'] = 'keep'): Target => ({ name, publishOnImport });
const names = (list: readonly Target[]) => list.map(x => x.name);

describe('preset di partenza (FR-002)', () => {
    it('sei preset nell\'ordine DEV, TEST, UAT, STAGING, PREPROD, PROD, tutti "keep"', () => {
        expect(defaultTargets()).toEqual(['DEV', 'TEST', 'UAT', 'STAGING', 'PREPROD', 'PROD'].map(n => t(n)));
    });
    it('ogni chiamata dà una lista nuova: modificarla non altera i preset', () => {
        defaultTargets().pop();
        expect(defaultTargets().length).toBe(6);
    });
});

describe('ripristino dei preset tolti (D9)', () => {
    const P = ['DEV', 'TEST', 'UAT', 'STAGING', 'PREPROD', 'PROD'];

    it('lista completa: niente da ripristinare, lista invariata', () => {
        expect(missingPresets(defaultTargets())).toEqual([]);
        expect(restoreDefaults(defaultTargets())).toEqual(defaultTargets());
    });
    it('lista vuota: tornano tutti e sei, nell\'ordine di partenza, tutti "keep"', () => {
        expect(missingPresets([])).toEqual(P);
        expect(restoreDefaults([])).toEqual(P.map(n => t(n)));
    });
    it('uno alla volta: ognuno dei sei, se manca, torna al suo posto senza toccare gli altri', () => {
        for (const gone of P) {
            const list = defaultTargets().filter(x => x.name !== gone).map(x => ({ ...x, publishOnImport: 'force-true' as const }));
            expect(missingPresets(list), gone).toEqual([gone]);
            const back = restoreDefaults(list);
            expect(names(back), gone).toEqual(P);
            expect(back.filter(x => x.name !== gone), `gli altri restano com'erano (${gone})`).toEqual(list);
            expect(back.find(x => x.name === gone), `il ripristinato riparte da "keep" (${gone})`).toEqual(t(gone));
        }
    });
    it('piu preset tolti tornano al loro posto; i Target personalizzati restano dove sono', () => {
        const list = [t('HOTFIX'), t('DEV'), t('UAT')];
        expect(names(restoreDefaults(list))).toEqual(['HOTFIX', 'DEV', 'TEST', 'UAT', 'STAGING', 'PREPROD', 'PROD']);
    });
    it('i preset tolti tornano subito prima del successivo preset presente, anche dopo un Target personalizzato', () => {
        const list = [t('DEV'), t('UAT'), t('HOTFIX'), t('PROD')];
        expect(names(restoreDefaults(list))).toEqual(['DEV', 'TEST', 'UAT', 'HOTFIX', 'STAGING', 'PREPROD', 'PROD']);
    });
    it('senza preset successivi torna in fondo; lista vuota dei preset: tutti in fondo, in ordine', () => {
        expect(names(restoreDefaults([t('HOTFIX')]))).toEqual(['HOTFIX', ...P]);
        expect(names(restoreDefaults([t('DEV'), t('TEST')]))).toEqual(P);
    });
    it('un preset rinominato conta come tolto; il confronto non distingue le maiuscole', () => {
        expect(missingPresets([t('LIVE'), t('dev'), t('Test'), t('UAT'), t('STAGING'), t('PREPROD')])).toEqual(['PROD']);
    });
    it('non modifica la lista che riceve', () => {
        const list = [t('DEV')];
        restoreDefaults(list);
        expect(list).toEqual([t('DEV')]);
    });
    it('il risultato e\' sempre una lista valida: nomi tutti diversi e accettati', () => {
        const back = restoreDefaults([t('UAT'), t('HOTFIX')]);
        back.forEach((x, i) => expect(validateTargetName(x.name, back, i), x.name).toBeNull());
    });
});

describe('validateTargetName (FR-003, FR-005)', () => {
    const list = [t('UAT'), t('PROD')];
    const cases: [string, string, Target[], number, 'ok' | RegExp][] = [
        ['un nome nuovo', 'HOTFIX', list, -1, 'ok'],
        ['con spazio interno', 'My Env', list, -1, 'ok'],
        ['esattamente 20 caratteri', 'a'.repeat(20), list, -1, 'ok'],
        ['21 caratteri', 'a'.repeat(21), list, -1, /At most 20/],
        ['gli spazi ai lati non contano per la lunghezza', ` ${'a'.repeat(20)} `, list, -1, 'ok'],
        ['il vuoto, se non c\'è già', '', list, -1, 'ok'],
        ['il vuoto, se c\'è già', '', [t(''), t('UAT')], -1, /without a suffix/],
        ['soli spazi contano come vuoto doppio', '   ', [t('')], -1, /without a suffix/],
        ['uguale a uno esistente', 'UAT', list, -1, /already a target/],
        ['uguale con altre maiuscole', 'uat', list, -1, /already a target/],
        ['uguale con spazi ai lati', '  UAT ', list, -1, /already a target/],
        ['rinominare in se stesso è lecito', 'UAT', list, 0, 'ok'],
        ['cambiare solo le maiuscole di se stesso è lecito', 'Uat', list, 0, 'ok'],
        ['rinominare in un altro esistente', 'PROD', list, 0, /already a target/],
    ];
    for (const [label, name, from, except, expected] of cases) {
        it(label, () => {
            const r = validateTargetName(name, from, except);
            if (expected === 'ok') expect(r).toBeNull();
            else expect(r).toMatch(expected);
        });
    }
    for (const ch of ['[', ']', '\\', '/', ':', '*', '?', '"', '<', '>', '|', '\u0001']) {
        it(`rifiuta il carattere ${JSON.stringify(ch)}`, () => {
            expect(validateTargetName(`A${ch}B`, [])).toMatch(/not allowed/);
        });
    }
    it('accetta lettere accentate, cifre, trattino, underscore e punto', () => {
        for (const ok of ['CLI-A', 'cliente_1', 'Città', 'v2.0']) expect(validateTargetName(ok, [])).toBeNull();
    });
});

describe('operazioni sulla lista (FR-003): pure, senza toccare l\'ingresso', () => {
    const base = [t('A'), t('B'), t('C')];
    it('moveTarget su e giù', () => {
        expect(names(moveTarget(base, 2, 0))).toEqual(['C', 'A', 'B']);
        expect(names(moveTarget(base, 0, 2))).toEqual(['B', 'C', 'A']);
        expect(names(moveTarget(base, 1, 0))).toEqual(['B', 'A', 'C']);
        expect(names(moveTarget(base, 1, 2))).toEqual(['A', 'C', 'B']);
    });
    it('moveTarget: stessa posizione o fuori dai limiti non cambia nulla', () => {
        for (const [from, to] of [[1, 1], [-1, 0], [0, -1], [3, 0], [0, 3]] as const) {
            expect(names(moveTarget(base, from, to))).toEqual(['A', 'B', 'C']);
        }
    });
    it('moveTarget con un solo elemento e con la lista vuota', () => {
        expect(names(moveTarget([t('A')], 0, 0))).toEqual(['A']);
        expect(moveTarget([], 0, 1)).toEqual([]);
    });
    it('add: in fondo, ripulito dagli spazi, publish di partenza "keep"', () => {
        expect(addTarget(base, '  D ')).toEqual([...base, t('D')]);
        expect(addTarget(base, 'D', 'force-true')[3]).toEqual(t('D', 'force-true'));
    });
    it('remove, rename e setPublish toccano solo l\'indice dato', () => {
        expect(names(removeTarget(base, 1))).toEqual(['A', 'C']);
        expect(names(renameTarget(base, 1, ' X '))).toEqual(['A', 'X', 'C']);
        expect(setTargetPublish(base, 2, 'force-false')).toEqual([t('A'), t('B'), t('C', 'force-false')]);
    });
    it('rename conserva il publish del Target', () => {
        expect(renameTarget([t('A', 'force-true')], 0, 'Z')).toEqual([t('Z', 'force-true')]);
    });
    it('nessuna operazione modifica la lista di partenza', () => {
        const copy = JSON.stringify(base);
        moveTarget(base, 0, 2); addTarget(base, 'D'); removeTarget(base, 0); renameTarget(base, 0, 'Z'); setTargetPublish(base, 0, 'force-true');
        expect(JSON.stringify(base)).toBe(copy);
    });
});

describe('spunte: riconciliazione e rinomina (FR-007)', () => {
    const list = [t('DEV'), t('UAT'), t('PROD')];
    it('tiene solo i Target che esistono, nell\'ordine della lista', () => {
        expect(reconcileSelection(['PROD', 'GONE', 'UAT'], list)).toEqual(['UAT', 'PROD']);
    });
    it('nessuna spunta valida: vuoto', () => {
        expect(reconcileSelection(['X'], list)).toEqual([]);
        expect(reconcileSelection([], list)).toEqual([]);
    });
    it('renameInSelections cambia il nome in tutte le solution e non tocca gli altri', () => {
        expect(renameInSelections({ S1: ['UAT', 'PROD'], S2: ['UAT'], S3: ['DEV'] }, 'UAT', 'QA'))
            .toEqual({ S1: ['QA', 'PROD'], S2: ['QA'], S3: ['DEV'] });
    });
});

describe('readTargets: stato della lista × cosa si legge (FR-001, FR-002, FR-004)', () => {
    const states: [string, unknown, Target[]][] = [
        ['mai configurata (chiave assente)', undefined, defaultTargets()],
        ['configurata e vuota: resta vuota, non torna ai preset', { DEV: [] }, []],
        ['configurata e piena', { DEV: [{ name: 'UAT', publishOnImport: 'force-true' }, { name: 'PROD', publishOnImport: 'keep' }] },
            [t('UAT', 'force-true'), t('PROD')]],
        ['altro ambiente configurato, questo no', { UAT: [{ name: 'X', publishOnImport: 'keep' }] }, defaultTargets()],
        ['valore al posto della mappa: stringa', 'rotto', defaultTargets()],
        ['valore al posto della mappa: array', [1, 2], defaultTargets()],
        ['valore dell\'ambiente non array', { DEV: 'rotto' }, defaultTargets()],
        ['voci rovinate scartate, le buone restano', { DEV: [null, 3, 'x', { name: 5 }, { name: 'UAT' }, { publishOnImport: 'keep' }] }, [t('UAT')]],
        ['publish fuori dai tre valori → keep', { DEV: [{ name: 'UAT', publishOnImport: 'sempre' }] }, [t('UAT')]],
        ['doppioni (anche con altre maiuscole): resta il primo', { DEV: [{ name: 'UAT', publishOnImport: 'force-true' }, { name: 'uat', publishOnImport: 'keep' }] }, [t('UAT', 'force-true')]],
        ['due voci senza suffisso: resta la prima', { DEV: [{ name: '', publishOnImport: 'keep' }, { name: '  ', publishOnImport: 'force-true' }] }, [t('')]],
        ['nome con carattere vietato o troppo lungo: scartato', { DEV: [{ name: 'A]B' }, { name: 'x'.repeat(21) }, { name: 'OK' }] }, [t('OK')]],
        ['nome con spazi ai lati: ripulito', { DEV: [{ name: ' UAT ' }] }, [t('UAT')]],
    ];
    for (const [label, saved, expected] of states) {
        it(label, async () => {
            if (saved !== undefined) store.set('releaseTargets', saved);
            expect(await readTargets('DEV')).toEqual(expected);
        });
    }
    it('un errore di lettura dà i preset, mai un\'eccezione', async () => {
        failGet = true;
        expect(await readTargets('DEV')).toEqual(defaultTargets());
    });
});

describe('saveTargets: scrittura e rilettura (FR-001, FR-003, FR-004)', () => {
    it('salva, rilegge, mantiene ordine e publish', async () => {
        await saveTargets('DEV', [t('PROD', 'force-true'), t('UAT'), t('HOTFIX', 'force-false')]);
        expect(await readTargets('DEV')).toEqual([t('PROD', 'force-true'), t('UAT'), t('HOTFIX', 'force-false')]);
    });
    it('la lista è per ambiente (D1)', async () => {
        await saveTargets('DEV', [t('UAT')]);
        await saveTargets('CLIENTE', [t('QA')]);
        expect(await readTargets('DEV')).toEqual([t('UAT')]);
        expect(await readTargets('CLIENTE')).toEqual([t('QA')]);
        expect(await readTargets('ALTRO')).toEqual(defaultTargets());
    });
    it('salvare la lista vuota la rende "scelta dell\'utente"', async () => {
        await saveTargets('DEV', []);
        expect(await readTargets('DEV')).toEqual([]);
    });
    it('non scrive campi in più oltre a nome e publish', async () => {
        await saveTargets('DEV', [{ name: 'UAT', publishOnImport: 'keep', extra: 1 } as unknown as Target]);
        expect(store.get('releaseTargets')).toEqual({ DEV: [{ name: 'UAT', publishOnImport: 'keep' }] });
    });
    it('un errore di scrittura viene rilanciato e non blocca le scritture successive', async () => {
        failSet = true;
        await expect(saveTargets('DEV', [t('A')])).rejects.toThrow('set ko');
        failSet = false;
        await saveTargets('DEV', [t('B')]);
        expect(await readTargets('DEV')).toEqual([t('B')]);
    });
    it('due salvataggi insieme (due schede) non si perdono a vicenda', async () => {
        await Promise.all([saveTargets('DEV', [t('A')]), saveTargets('UAT', [t('B')])]);
        expect(await readTargets('DEV')).toEqual([t('A')]);
        expect(await readTargets('UAT')).toEqual([t('B')]);
    });
    it('uno stato salvato rovinato non impedisce di salvare', async () => {
        store.set('releaseTargets', 'rotto');
        await saveTargets('DEV', [t('A')]);
        expect(await readTargets('DEV')).toEqual([t('A')]);
    });
});

describe('spunte salvate (FR-007, D3)', () => {
    const list = [t('DEV'), t('UAT'), t('PROD')];
    it('niente salvato: nessuna spunta', async () => {
        expect(await readSelection('DEV', 'S1', list)).toEqual([]);
    });
    it('si rilegge per solution e per ambiente', async () => {
        await saveSelection('DEV', 'S1', ['UAT', 'PROD']);
        await saveSelection('DEV', 'S2', ['DEV']);
        await saveSelection('ALTRO', 'S1', ['PROD']);
        expect(await readSelection('DEV', 'S1', list)).toEqual(['UAT', 'PROD']);
        expect(await readSelection('DEV', 'S2', list)).toEqual(['DEV']);
        expect(await readSelection('DEV', 'S3', list)).toEqual([]);
        expect(await readSelection('ALTRO', 'S1', list)).toEqual(['PROD']);
        expect(await readSelection('TERZO', 'S1', list)).toEqual([]);
    });
    it('un Target tolto dalla lista sparisce dalle spunte lette', async () => {
        await saveSelection('DEV', 'S1', ['UAT', 'PROD']);
        expect(await readSelection('DEV', 'S1', [t('UAT')])).toEqual(['UAT']);
    });
    it('salvare vuoto toglie la voce; l\'ultima toglie la chiave dell\'ambiente', async () => {
        await saveSelection('DEV', 'S1', ['UAT']);
        await saveSelection('ALTRO', 'S9', ['PROD']);
        await saveSelection('DEV', 'S1', []);
        expect(store.get('targetSelection')).toEqual({ ALTRO: { S9: ['PROD'] } });
    });
    it('rinominare un Target porta con sé le spunte di ogni solution (nella stessa scrittura)', async () => {
        await saveSelection('DEV', 'S1', ['UAT', 'PROD']);
        await saveSelection('DEV', 'S2', ['UAT']);
        await saveSelection('ALTRO', 'S1', ['UAT']);
        await saveTargets('DEV', [t('DEV'), t('QA'), t('PROD')], { from: 'UAT', to: 'QA' });
        const renamed = [t('DEV'), t('QA'), t('PROD')];
        expect(await readSelection('DEV', 'S1', renamed)).toEqual(['QA', 'PROD']);
        expect(await readSelection('DEV', 'S2', renamed)).toEqual(['QA']);
        // un altro ambiente non si tocca
        expect(await readSelection('ALTRO', 'S1', [t('UAT')])).toEqual(['UAT']);
    });
    it('rinomina con lo stesso nome: nessuna scrittura delle spunte', async () => {
        await saveSelection('DEV', 'S1', ['UAT']);
        sets = 0;
        await saveTargets('DEV', [t('UAT')], { from: 'UAT', to: 'UAT' });
        expect(sets).toBe(1);   // solo la lista
    });
    it('senza rinomina le spunte non si toccano', async () => {
        await saveSelection('DEV', 'S1', ['UAT']);
        sets = 0;
        await saveTargets('DEV', [t('UAT'), t('NEW')]);
        expect(sets).toBe(1);
    });
    it('errori di lettura: nessuna spunta, mai un\'eccezione', async () => {
        failGet = true;
        expect(await readSelection('DEV', 'S1', list)).toEqual([]);
    });
    it('un errore di scrittura delle spunte viene rilanciato', async () => {
        failSet = true;
        await expect(saveSelection('DEV', 'S1', ['UAT'])).rejects.toThrow('set ko');
    });
    it('valori rovinati nelle spunte valgono "nessuna spunta", le stringhe buone restano', async () => {
        for (const bad of ['x', 5, [1], { DEV: 'x' }, { DEV: { S1: 'UAT' } }]) {
            store.set('targetSelection', bad);
            expect(await readSelection('DEV', 'S1', list)).toEqual([]);
        }
        store.set('targetSelection', { DEV: { S1: [1, 'UAT', null] } });
        expect(await readSelection('DEV', 'S1', list)).toEqual(['UAT']);
    });
});

describe('operazioni × stato della lista, salvate e rilette (matrice FR-003)', () => {
    type Op = [string, (l: Target[]) => Target[], (start: string[]) => string[]];
    const ops: Op[] = [
        ['crea HOTFIX', l => addTarget(l, 'HOTFIX'), s => [...s, 'HOTFIX']],
        ['rinomina il primo', l => (l.length ? renameTarget(l, 0, 'Z') : l), s => (s.length ? ['Z', ...s.slice(1)] : s)],
        ['rimuovi l\'ultimo', l => removeTarget(l, l.length - 1), s => s.slice(0, -1)],
        ['il primo giù', l => moveTarget(l, 0, 1), s => (s.length > 1 ? [s[1], s[0], ...s.slice(2)] : s)],
        ['l\'ultimo su', l => moveTarget(l, l.length - 1, l.length - 2), s => (s.length > 1 ? [...s.slice(0, -2), s[s.length - 1], s[s.length - 2]] : s)],
    ];
    const starts: [string, Target[] | null][] = [['mai configurata', null], ['vuota', []], ['con tre Target', [t('A'), t('B'), t('C')]]];
    for (const [stateLabel, saved] of starts) {
        for (const [opLabel, apply, expectNames] of ops) {
            it(`${stateLabel}: ${opLabel}`, async () => {
                if (saved) await saveTargets('DEV', saved);
                const before = await readTargets('DEV');
                await saveTargets('DEV', apply(before));
                expect(names(await readTargets('DEV'))).toEqual(expectNames(names(before)));
            });
        }
    }
});


describe('Target Production senza suffisso (spec 017)', () => {
    const prod = (): Target => ({ name: '', publishOnImport: 'keep', production: true });

    describe('isProductionTarget / needsNoSuffixWarning: nome x marcatura (FR-002, FR-003, FR-006)', () => {
        const cases: [string, Target, boolean, boolean][] = [
            // [descrizione, target, produzione?, serve l'avviso?]
            ['senza nome, non marcato', t(''), false, true],
            ['senza nome, marcato', prod(), true, false],
            ['senza nome, marcato false esplicito', { ...t(''), production: false }, false, true],
            ['solo spazi, non marcato: conta come senza nome', { name: '   ', publishOnImport: 'keep' }, false, true],
            ['solo spazi, marcato',{ name: '   ', publishOnImport: 'keep', production: true }, true, false],
            ['con nome, non marcato', t('UAT'), false, false],
            ['con nome, marcato a mano nei dati: ignorato', { ...t('PROD'), production: true }, false, false],
        ];
        for (const [label, target, isProd, warns] of cases) {
            it(label, () => {
                expect(isProductionTarget(target)).toBe(isProd);
                expect(needsNoSuffixWarning(target)).toBe(warns);
            });
        }
    });

    describe('setTargetProduction (FR-001, FR-006, FR-008)', () => {
        it('marca il Target senza nome e lo smarca', () => {
            const on = setTargetProduction([t('DEV'), t('')], 1, true);
            expect(on[1]).toEqual(prod());
            expect(setTargetProduction(on, 1, false)[1]).toEqual(t(''));
            expect('production' in setTargetProduction(on, 1, false)[1]!, 'smarcato = campo assente').toBe(false);
        });
        it('un Target con nome non si marca', () => {
            expect(setTargetProduction([t('UAT')], 0, true)).toEqual([t('UAT')]);
        });
        it('tocca solo il Target indicato e non modifica la lista che riceve', () => {
            const list = [t(''), t('UAT', 'force-true')];
            const out = setTargetProduction(list, 0, true);
            expect(out[1]).toBe(list[1]);
            expect(list[0]).toEqual(t(''));
        });
        it('indice fuori lista: lista invariata', () => {
            expect(setTargetProduction([t('')], 5, true)).toEqual([t('')]);
        });
    });

    describe('renameTarget e la marcatura (FR-006)', () => {
        it('un nome non vuoto toglie la marcatura', () => {
            expect(renameTarget([prod()], 0, 'LIVE')).toEqual([t('LIVE')]);
        });
        it('un nome vuoto (o di soli spazi) la lascia', () => {
            expect(renameTarget([prod()], 0, '   ')).toEqual([prod()]);
        });
        it('rinominare un altro Target non tocca la marcatura', () => {
            expect(renameTarget([prod(), t('UAT')], 1, 'TEST')).toEqual([prod(), t('TEST')]);
        });
    });

    describe('salvataggio e rilettura (FR-005, FR-008)', () => {
        it('la marcatura sopravvive a salva e rileggi', async () => {
            await saveTargets('DEV', [t('UAT'), prod()]);
            expect(await readTargets('DEV')).toEqual([t('UAT'), prod()]);
        });
        it('nei dati salvati compare solo per il Target marcato', async () => {
            await saveTargets('DEV', [t('UAT'), prod()]);
            const saved = (store.get('releaseTargets') as Record<string, Record<string, unknown>[]>).DEV!;
            expect(saved[0]).toEqual({ name: 'UAT', publishOnImport: 'keep' });
            expect(saved[1]).toEqual({ name: '', publishOnImport: 'keep', production: true });
        });
        it('una lista salvata prima della 017 (senza il campo) vale non marcato', async () => {
            store.set('releaseTargets', { DEV: [{ name: '', publishOnImport: 'force-true' }] });
            expect(await readTargets('DEV')).toEqual([t('', 'force-true')]);
        });
        const odd: [string, unknown][] = [
            ['stringa "true"', 'true'], ['numero 1', 1], ['false', false], ['null', null], ['oggetto', {}],
        ];
        for (const [label, value] of odd) {
            it(`un valore che non è il booleano true vale non marcato (${label})`, async () => {
                store.set('releaseTargets', { DEV: [{ name: '', publishOnImport: 'keep', production: value }] });
                expect(await readTargets('DEV')).toEqual([t('')]);
            });
        }
        it('un valore salvato su un Target con nome viene ignorato', async () => {
            store.set('releaseTargets', { DEV: [{ name: 'PROD', publishOnImport: 'keep', production: true }] });
            expect(await readTargets('DEV')).toEqual([t('PROD')]);
        });
        it('salvare un Target con nome marcato a mano non scrive la marcatura', async () => {
            await saveTargets('DEV', [{ ...t('PROD'), production: true }]);
            expect((store.get('releaseTargets') as Record<string, Record<string, unknown>[]>).DEV![0]).toEqual({ name: 'PROD', publishOnImport: 'keep' });
        });
        it('la marcatura segue il Target quando si riordina la lista', async () => {
            await saveTargets('DEV', [prod(), t('UAT')]);
            const back = await readTargets('DEV');
            await saveTargets('DEV', [back[1]!, back[0]!]);
            expect(await readTargets('DEV')).toEqual([t('UAT'), prod()]);
        });
    });

    describe('addTarget e restoreDefaults non marcano (FR-008)', () => {
        it('Add "no suffix" parte non marcato', () => {
            expect(addTarget([], '')).toEqual([t('')]);
        });
        it('Restore defaults non marca nessun preset e lascia la marcatura dove sta', () => {
            const out = restoreDefaults([prod()]);
            expect(out[0]).toEqual(prod());
            expect(out.slice(1).every(x => !('production' in x))).toBe(true);
        });
    });
});
