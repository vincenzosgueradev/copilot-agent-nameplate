/**
 * Spec 012 — pin delle solution: servizio e ordinamento.
 * Oracolo scritto dalla spec: le fissate stanno prima, l'ordine dentro i gruppi non cambia,
 * i pin sono per ambiente, i dati non validi non bloccano nulla.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { pinFirst, readPins, setPinned } from '../src/services/pins';

const store = new Map<string, unknown>();
let failGet = false;
let failSet = false;

beforeEach(() => {
    store.clear();
    failGet = false;
    failSet = false;
    (globalThis as unknown as Record<string, unknown>).toolboxAPI = {
        settings: {
            get: async (k: string) => { if (failGet) throw new Error('get ko'); return store.get(k); },
            set: async (k: string, v: unknown) => { if (failSet) throw new Error('set ko'); store.set(k, v); },
        },
    };
});

describe('pinFirst — partizione stabile (FR-002, FR-003)', () => {
    it('le fissate vanno prima, l\'ordine relativo resta in entrambi i gruppi', () => {
        expect(pinFirst(['a', 'b', 'c', 'd', 'e'], x => x === 'd' || x === 'b')).toEqual(['b', 'd', 'a', 'c', 'e']);
    });
    it('nessuna fissata: la lista è identica', () => {
        expect(pinFirst(['a', 'b', 'c'], () => false)).toEqual(['a', 'b', 'c']);
    });
    it('tutte fissate: la lista è identica', () => {
        expect(pinFirst(['a', 'b', 'c'], () => true)).toEqual(['a', 'b', 'c']);
    });
    it('lista vuota', () => {
        expect(pinFirst([], () => true)).toEqual([]);
    });
    it('non modifica l\'ingresso', () => {
        const input = ['a', 'b', 'c'];
        pinFirst(input, x => x === 'c');
        expect(input).toEqual(['a', 'b', 'c']);
    });
});

describe('readPins / setPinned (FR-006, FR-007)', () => {
    it('niente salvato = nessun pin', async () => {
        expect(await readPins('DEV')).toEqual([]);
    });
    it('un pin si rilegge, senza duplicati', async () => {
        await setPinned('DEV', 'S1', true);
        await setPinned('DEV', 'S1', true);
        await setPinned('DEV', 'S2', true);
        expect((await readPins('DEV')).sort()).toEqual(['S1', 'S2']);
    });
    it('i pin sono per ambiente', async () => {
        await setPinned('DEV', 'S1', true);
        expect(await readPins('UAT')).toEqual([]);
        await setPinned('UAT', 'S9', true);
        expect(await readPins('DEV')).toEqual(['S1']);
        expect(await readPins('UAT')).toEqual(['S9']);
    });
    it('togliere un pin lo toglie solo lì; l\'ultimo toglie la chiave dell\'ambiente', async () => {
        await setPinned('DEV', 'S1', true);
        await setPinned('UAT', 'S9', true);
        await setPinned('DEV', 'S1', false);
        expect(await readPins('DEV')).toEqual([]);
        expect(store.get('solutionPins')).toEqual({ UAT: ['S9'] });
    });
    it('togliere un pin che non c\'è non fa nulla', async () => {
        await setPinned('DEV', 'S1', false);
        expect(await readPins('DEV')).toEqual([]);
    });
    it('il nome della solution non si altera (maiuscole, spazi interni)', async () => {
        await setPinned('DEV', 'My Sol_X', true);
        expect(await readPins('DEV')).toEqual(['My Sol_X']);
    });
});

describe('dati non validi ed errori (negativi)', () => {
    const bad: [string, unknown, string[]][] = [
        ['stringa', 'xx', []], ['numero', 3, []], ['elenco', ['S1'], []], ['null', null, []],
        ['ambiente non elenco', { DEV: 'S1' }, []], ['elenco con non stringhe', { DEV: ['S1', 2, null, {}] }, ['S1']],
    ];
    for (const [label, raw, expected] of bad) {
        it(`valore salvato non valido (${label}): nessun errore, solo le stringhe valide`, async () => {
            store.set('solutionPins', raw);
            expect(await readPins('DEV')).toEqual(expected);
        });
    }
    it('lettura che fallisce: nessun pin e nessuna eccezione', async () => {
        failGet = true;
        expect(await readPins('DEV')).toEqual([]);
    });
    it('scrittura che fallisce: l\'errore arriva al chiamante e una scrittura dopo funziona', async () => {
        failSet = true;
        await expect(setPinned('DEV', 'S1', true)).rejects.toThrow();
        failSet = false;
        await setPinned('DEV', 'S2', true);
        expect(await readPins('DEV')).toEqual(['S2']);
    });
    it('scritture concorrenti non se ne perdono', async () => {
        await Promise.all(['A', 'B', 'C', 'D'].map(n => setPinned('DEV', n, true)));
        expect((await readPins('DEV')).sort()).toEqual(['A', 'B', 'C', 'D']);
    });
    it('un ambiente con dati non validi non rovina gli altri alla scrittura', async () => {
        store.set('solutionPins', { DEV: 'rotto', UAT: ['S9'] });
        await setPinned('PROD', 'P1', true);
        expect(await readPins('UAT')).toEqual(['S9']);
        expect(await readPins('PROD')).toEqual(['P1']);
    });
});
