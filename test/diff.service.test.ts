/**
 * Spec 019 (blocco C) — il diff riga per riga: righe affiancate, contesto, salti, tratto evidenziato, limiti.
 * Oracolo scritto dalla spec (FR-008, FR-009, FR-011), non dal codice.
 */
import { describe, expect, it } from 'vitest';
import {
    CONTEXT_LINES, MAX_CELLS, MAX_CHANGED_LINES, diffLines, fileDiff, inlineSpans, sliceBySpan, splitLines,
    type DiffRow,
} from '../src/services/diff';

const lines = (n: number, prefix = 'l'): string[] => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
const text = (ls: string[]): string => ls.join('\n');
/** Un carattere per riga: c contesto, ~ affiancata, - tolta, + aggiunta, g salto. */
const shape = (rows: DiffRow[]): string => rows.map(r => ({ context: 'c', changed: '~', removed: '-', added: '+', gap: 'g' })[r.kind]).join('');
const replaceAt = (ls: string[], at: number[], value = 'X'): string[] => ls.map((l, i) => (at.includes(i + 1) ? `${value}${i + 1}` : l));

describe('splitLines', () => {
    const cases: [string, string, string[]][] = [
        ['vuoto', '', []],
        ['una riga', 'a', ['a']],
        ['con \\n finale', 'a\n', ['a']],
        ['due righe', 'a\nb', ['a', 'b']],
        ['CRLF', 'a\r\nb\r\n', ['a', 'b']],
        ['solo un a capo', '\n', ['']],
        ['riga vuota in mezzo', 'a\n\nb', ['a', '', 'b']],
        ['riga vuota in fondo', 'a\n\n', ['a', '']],
    ];
    for (const [label, input, expected] of cases) it(label, () => expect(splitLines(input)).toEqual(expected));
});

describe('diffLines: la forma delle righe (contesto di 3)', () => {
    const ten = lines(10);
    const fourteen = lines(14);
    // [descrizione, testo prima, testo dopo, forma attesa]
    const cases: [string, string[], string[], string][] = [
        ['identico', ten, ten, ''],
        ['una riga cambiata a meta\'', ten, replaceAt(ten, [5]), 'cccc~cccg'],
        ['la prima riga cambiata', ten, replaceAt(ten, [1]), '~cccg'],
        ['l\'ultima riga cambiata', ten, replaceAt(ten, [10]), 'gccc~'],
        ['una riga aggiunta a meta\'', ten, [...ten.slice(0, 5), 'NEW', ...ten.slice(5)], 'gccc+cccg'],
        ['una riga tolta a meta\'', ten, [...ten.slice(0, 4), ...ten.slice(5)], 'cccc-cccg'],
        ['due cambi vicini: nessun salto in mezzo', ten, replaceAt(ten, [3, 8]), 'cc~cccc~cc'],
        ['due cambi lontani: un salto in mezzo', fourteen, replaceAt(fourteen, [3, 12]), 'cc~cccgccc~cc'],
        ['un salto di una sola riga si mostra', fourteen, replaceAt(fourteen, [3, 11]), 'cc~ccccccc~ccc'],
        ['tutto aggiunto', [], ['a', 'b', 'c'], '+++'],
        ['tutto tolto', ['a', 'b', 'c'], [], '---'],
        ['2 righe diventano 3', ['a', 'b', 'c', 'd'], ['a', 'X', 'Y', 'Z', 'd'], 'c~~+c'],
        ['3 righe diventano 1', ['a', 'b', 'c', 'd', 'e'], ['a', 'X', 'e'], 'c~--c'],
    ];
    for (const [label, before, after, expected] of cases) {
        it(label, () => expect(shape(diffLines(text(before), text(after)).rows)).toBe(expected));
    }

    it('l\'opzione context: 0, 1, 3 e senza limite', () => {
        const after = text(replaceAt(ten, [5]));
        expect(shape(diffLines(text(ten), after, { context: 0 }).rows)).toBe('g~g');
        expect(shape(diffLines(text(ten), after, { context: 1 }).rows)).toBe('gc~cg');
        expect(shape(diffLines(text(ten), after, { context: CONTEXT_LINES }).rows)).toBe('cccc~cccg');
        expect(shape(diffLines(text(ten), after, { context: Infinity }).rows)).toBe('cccc~ccccc');
    });
    it('CRLF e LF sono lo stesso testo; l\'a capo finale non conta', () => {
        expect(diffLines('a\r\nb\r\n', 'a\nb').rows).toEqual([]);
        expect(diffLines('a\nb\n', 'a\nb').rows).toEqual([]);
    });
});

describe('diffLines: numeri di riga, conteggi, abbinamento', () => {
    const ten = lines(10);
    it('i numeri di riga dicono dove sta la riga in ognuno dei due file', () => {
        const { rows } = diffLines(text(ten), text(replaceAt(ten, [5])));
        expect(rows.map(r => [r.oldNo, r.newNo])).toEqual([[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8], [null, null]]);
        const changed = rows[4]!;
        expect(changed).toMatchObject({ kind: 'changed', oldText: 'l5', newText: 'X5' });
        expect(rows[8]).toMatchObject({ kind: 'gap', skipped: 2, oldText: '', newText: '' });
    });
    it('dopo una riga aggiunta i numeri dei due lati si sfasano di uno', () => {
        const { rows } = diffLines(text(ten), text([...ten.slice(0, 2), 'NEW', ...ten.slice(2)]), { context: Infinity });
        const added = rows.find(r => r.kind === 'added')!;
        expect(added).toMatchObject({ oldNo: null, newNo: 3, newText: 'NEW' });
        const after = rows.filter(r => r.kind === 'context' && r.oldNo! >= 3);
        after.forEach(r => expect(r.newNo, r.oldText).toBe(r.oldNo! + 1));
    });
    it('una riga tolta ha solo il lato sinistro, una aggiunta solo il destro', () => {
        const { rows } = diffLines('a\nb\nc', 'a\nc', { context: Infinity });
        expect(rows.find(r => r.kind === 'removed')).toMatchObject({ oldNo: 2, newNo: null, oldText: 'b', newText: '' });
        const added = diffLines('a\nc', 'a\nb\nc', { context: Infinity }).rows.find(r => r.kind === 'added')!;
        expect(added).toMatchObject({ oldNo: null, newNo: 2, newText: 'b', oldText: '' });
    });
    it('una riga affiancata ha entrambi i lati', () => {
        const row = diffLines('a\nb\nc', 'a\nX\nc', { context: Infinity }).rows.find(r => r.kind === 'changed')!;
        expect(row).toMatchObject({ oldNo: 2, newNo: 2, oldText: 'b', newText: 'X' });
    });
    it('conta le righe aggiunte e tolte sul file intero', () => {
        expect(diffLines('a\nb\nc', 'a\nX\nc')).toMatchObject({ added: 1, removed: 1 });
        expect(diffLines('a\nb\nc', 'a')).toMatchObject({ added: 0, removed: 2 });
        expect(diffLines('a', 'a\nb\nc')).toMatchObject({ added: 2, removed: 0 });
        expect(diffLines('a\nb', 'a\nb')).toMatchObject({ added: 0, removed: 0, hidden: 0 });
    });
    it('i salti portano il numero delle righe che nascondono, mai meno di 2', () => {
        const { rows } = diffLines(text(lines(40)), text(replaceAt(lines(40), [20])));
        const gaps = rows.filter(r => r.kind === 'gap');
        expect(gaps.map(g => g.skipped)).toEqual([16, 17]);
        gaps.forEach(g => expect([g.oldNo, g.newNo]).toEqual([null, null]));
    });
    it('e\' deterministico', () => {
        const a = text(lines(30)); const b = text(replaceAt(lines(30), [4, 9, 22]));
        expect(diffLines(a, b)).toEqual(diffLines(a, b));
    });
    it('fileDiff porta il nome del file', () => {
        expect(fileDiff('bots/x/bot.xml', 'a', 'b').file).toBe('bots/x/bot.xml');
    });
});

describe('inlineSpans: il tratto che cambia dentro la riga', () => {
    const slices = (a: string, b: string) => {
        const { oldSpan, newSpan } = inlineSpans(a, b);
        return [sliceBySpan(a, oldSpan).mid, sliceBySpan(b, newSpan).mid];
    };
    const cases: [string, string, string, [string, string]][] = [
        ['parola tra parentesi', '<name>agent1 [DEV]</name>', '<name>agent1 [UAT]</name>', ['DEV', 'UAT']],
        ['una cifra dentro la parola: la parola intera', '<name>agent1</name>', '<name>agent2</name>', ['agent1', 'agent2']],
        ['il fondo della parola cambia: la parola intera', 'foobar', 'foobaz', ['foobar', 'foobaz']],
        ['una cifra in mezzo a una parola: la parola intera', 'ab1c', 'ab2c', ['ab1c', 'ab2c']],
        ['una cifra dopo uno spazio', 'x = 1;', 'x = 2;', ['1', '2']],
        ['true diventa false', '  "publishOnImport": true', '  "publishOnImport": false', ['true', 'false']],
        ['righe del tutto diverse', 'abc', 'xyz', ['abc', 'xyz']],
        ['una riga vuota diventa piena', '', 'a', ['', 'a']],
        ['un suffisso tolto: il tratto e tutto quello che sparisce', 'name [DEV]', 'name', ['[DEV]', '']],
    ];
    for (const [label, a, b, [mo, mn]] of cases) {
        it(label, () => {
            const [oldMid, newMid] = slices(a, b);
            expect(oldMid.trim()).toBe(mo);
            expect(newMid.trim()).toBe(mn);
        });
    }
    it('sliceBySpan: senza tratto, tutto sta nella prima parte', () => {
        expect(sliceBySpan('abc', null)).toEqual({ before: 'abc', mid: '', after: '' });
        expect(sliceBySpan('abcdef', [2, 4])).toEqual({ before: 'ab', mid: 'cd', after: 'ef' });
    });
    it('il tratto sta dentro la riga e prima + dentro + dopo la ridanno intera', () => {
        for (const [a, b] of [['<name>a [DEV]</name>', '<name>a [UAT]</name>'], ['', 'x'], ['xy', ''], ['aXb', 'aYYb']] as const) {
            const { oldSpan, newSpan } = inlineSpans(a, b);
            for (const [t, s] of [[a, oldSpan], [b, newSpan]] as const) {
                expect(s[0]).toBeGreaterThanOrEqual(0);
                expect(s[1]).toBeLessThanOrEqual(t.length);
                expect(s[0]).toBeLessThanOrEqual(s[1]);
                const p = sliceBySpan(t, s);
                expect(p.before + p.mid + p.after).toBe(t);
            }
        }
    });
    it('le righe affiancate portano i loro tratti, le altre no', () => {
        const { rows } = diffLines('a\n<n>x [DEV]</n>\nc\nd', '<n>x [UAT]</n>\nc\nd\ne', { context: Infinity });
        const changed = rows.find(r => r.kind === 'changed');
        const others = rows.filter(r => r.kind !== 'changed');
        if (changed) expect(changed.oldSpan).not.toBeNull();
        others.forEach(r => expect([r.oldSpan, r.newSpan]).toEqual([null, null]));
    });
});

describe('diffLines: i limiti (FR-011)', () => {
    const changed = (n: number) => diffLines(text(lines(n)), text(lines(n, 'm')), { context: 0 });
    it(`fino a ${MAX_CHANGED_LINES} righe di modifica si vedono tutte`, () => {
        const d = changed(MAX_CHANGED_LINES);
        expect(d.rows.filter(r => r.kind === 'changed').length).toBe(MAX_CHANGED_LINES);
        expect(d.hidden).toBe(0);
    });
    it(`con ${MAX_CHANGED_LINES + 1} righe una resta nascosta`, () => {
        const d = changed(MAX_CHANGED_LINES + 1);
        expect(d.rows.filter(r => r.kind === 'changed').length).toBe(MAX_CHANGED_LINES);
        expect(d.hidden).toBe(1);
    });
    it('i conteggi riguardano il file intero, anche oltre il limite', () => {
        const d = changed(100);
        expect(d).toMatchObject({ added: 100, removed: 100, hidden: 20 });
        expect(d.rows.length).toBe(MAX_CHANGED_LINES);
    });
    it('l\'opzione maxChanged cambia il limite', () => {
        expect(diffLines(text(lines(10)), text(lines(10, 'm')), { maxChanged: 3 }).hidden).toBe(7);
        expect(diffLines(text(lines(10)), text(lines(10, 'm')), { maxChanged: Infinity }).hidden).toBe(0);
    });
    it('oltre MAX_CELLS ripiega su «tutto sostituito» senza fermarsi', () => {
        const n = Math.ceil(Math.sqrt(MAX_CELLS)) + 10;
        const a = lines(n, 'a'); const b = lines(n, 'b');
        const started = Date.now();
        const d = diffLines(text(a), text(b));
        expect(Date.now() - started).toBeLessThan(3000);
        expect(d).toMatchObject({ added: n, removed: n });
        expect(d.rows.filter(r => r.kind === 'changed').length).toBe(MAX_CHANGED_LINES);
    });
});

describe('diffLines: proprieta\' con seme fisso', () => {
    /** Generatore con seme, cosi' il test e' lo stesso a ogni esecuzione. */
    const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    const lcs = (a: string[], b: string[]): number => {
        const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
        for (let i = a.length - 1; i >= 0; i--) {
            for (let j = b.length - 1; j >= 0; j--) {
                dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
            }
        }
        return dp[0]![0]!;
    };
    const pool = ['a', 'b', 'c', 'd', '', '<x>', '</x>', 'foo [DEV]', 'foo [UAT]'];
    const make = (r: () => number, n: number) => Array.from({ length: n }, () => pool[Math.floor(r() * pool.length)]!);
    const cases = Array.from({ length: 60 }, (_, i) => i);

    for (const i of cases) {
        it(`caso ${i}: senza salti le righe ridanno i due file, e le righe uguali sono la LCS`, () => {
            const r = rng(1000 + i);
            const a = make(r, Math.floor(r() * 14));
            const b = make(r, Math.floor(r() * 14));
            const { rows, added, removed } = diffLines(text(a), text(b), { context: Infinity, maxChanged: Infinity });
            const A = splitLines(text(a));
            const B = splitLines(text(b));
            if (text(a) === text(b) || (A.length === B.length && A.every((l, k) => l === B[k]))) {
                expect(rows).toEqual([]);
                return;
            }
            // lato sinistro e destro ridanno i due file, con numeri crescenti da 1 senza buchi
            const left = rows.filter(x => x.oldNo !== null);
            const right = rows.filter(x => x.newNo !== null);
            expect(left.map(x => x.oldText)).toEqual(A);
            expect(right.map(x => x.newText)).toEqual(B);
            expect(left.map(x => x.oldNo)).toEqual(A.map((_, k) => k + 1));
            expect(right.map(x => x.newNo)).toEqual(B.map((_, k) => k + 1));
            // le righe uguali sono una sottosequenza comune piu' lunga
            const same = rows.filter(x => x.kind === 'context').length;
            expect(same).toBe(lcs(A, B));
            expect(removed).toBe(A.length - same);
            expect(added).toBe(B.length - same);
            // mai un salto senza contesto limitato
            expect(rows.some(x => x.kind === 'gap')).toBe(false);
        });
    }
    it('con il contesto di 3, i salti nascondono solo righe uguali e le righe viste restano vere', () => {
        for (let i = 0; i < 30; i++) {
            const r = rng(5000 + i);
            const a = make(r, 20 + Math.floor(r() * 20));
            const b = a.map(l => (r() < 0.12 ? `${l}!` : l));
            const full = diffLines(text(a), text(b), { context: Infinity, maxChanged: Infinity });
            const cut = diffLines(text(a), text(b));
            const hiddenByGaps = cut.rows.filter(x => x.kind === 'gap').reduce((n, g) => n + g.skipped, 0);
            const shownContext = cut.rows.filter(x => x.kind === 'context').length;
            expect(shownContext + hiddenByGaps, `caso ${i}`).toBe(full.rows.filter(x => x.kind === 'context').length);
            // ogni riga mostrata e' uguale alla riga completa con lo stesso numero
            for (const x of cut.rows.filter(y => y.kind !== 'gap')) {
                const same = full.rows.find(y => y.oldNo === x.oldNo && y.newNo === x.newNo && y.kind === x.kind);
                expect(same, `caso ${i} riga ${x.oldNo}/${x.newNo}`).toBeDefined();
            }
        }
    });
    it('ogni salto ha almeno 2 righe e nessun numero', () => {
        const r = rng(77);
        const a = make(r, 60);
        const b = a.map((l, k) => (k % 17 === 0 ? `${l}?` : l));
        for (const g of diffLines(text(a), text(b)).rows.filter(x => x.kind === 'gap')) {
            expect(g.skipped).toBeGreaterThanOrEqual(2);
            expect([g.oldNo, g.newNo]).toEqual([null, null]);
        }
    });
});
