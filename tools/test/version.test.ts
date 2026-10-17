/**
 * La versione della solution sorgente (FR-073, FR-073b, FR-067a): formato, confronto, proposta,
 * i problemi che la schermata mostra e la scrittura in DEV con tutte le sue strade di errore.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
    compareVersions, isValidVersion, nextVersion, raiseSolutionVersion, versionProblem,
} from '../src/services/solutionVersion';
import { makeDev, installFakeDev, type FakeDev } from './helpers/fake-dev';
import { cartesian } from './helpers/combinatorics';

/** Oracolo indipendente: si confronta con segmenti riempiti a larghezza fissa, come stringa. */
const key = (v: string) => v.split('.').map(p => p.padStart(8, '0')).join('.');
const oracleCompare = (a: string, b: string) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);

const VALID = ['1.0.0.0', '1.0.0.2', '1.0.0.9', '1.0.0.10', '1.0.1.0', '1.2.0.0', '2.0.0.0', '10.0.0.0', '0.0.0.1', '1.0.0.99', '1.0.0.100'];
const INVALID = ['', ' ', 'abc', '1', '1.0', '1.0.0', '1.0.0.', '1.0.0.x', '1.0.0.0.0', '-1.0.0.0', '1..0.0', 'v1.0.0.0', '1.0.0.1a', '１.0.0.0'];

describe('formato', () => {
    it('accetta quattro numeri e nient\'altro', () => {
        for (const v of VALID) expect(isValidVersion(v), v).toBe(true);
        for (const v of INVALID) expect(isValidVersion(v), JSON.stringify(v)).toBe(false);
    });
    it('ignora gli spazi attorno', () => {
        expect(isValidVersion(' 1.0.0.3 ')).toBe(true);
    });
});

describe('confronto', () => {
    it('e\' numerico, segmento per segmento (matrice completa)', () => {
        let n = 0;
        for (const [a, b] of cartesian([VALID, VALID])) {
            expect(Math.sign(compareVersions(a!, b!)), `${a} vs ${b}`).toBe(oracleCompare(a!, b!));
            n++;
        }
        expect(n).toBe(VALID.length ** 2);
    });
    it('1.0.0.10 e\' piu\' alta di 1.0.0.9 (non e\' un confronto di testo)', () => {
        expect(compareVersions('1.0.0.10', '1.0.0.9')).toBeGreaterThan(0);
        expect(compareVersions('1.0.0.9', '1.0.0.10')).toBeLessThan(0);
    });
});

describe('proposta', () => {
    it('incrementa l\'ultimo segmento', () => {
        expect(nextVersion('1.0.0.2')).toBe('1.0.0.3');
        expect(nextVersion('1.0.0.9')).toBe('1.0.0.10');
        expect(nextVersion('1.0.0.99')).toBe('1.0.0.100');
        expect(nextVersion('2.5.7.0')).toBe('2.5.7.1');
    });
    it('e\' sempre piu\' alta di quella di partenza', () => {
        for (const v of VALID) expect(compareVersions(nextVersion(v), v), v).toBeGreaterThan(0);
    });
    it('una versione non valida resta com\'e\': non si inventa un numero', () => {
        for (const v of INVALID.filter(x => x.trim() !== x || !isValidVersion(x))) expect(nextVersion(v), v).toBe(v);
    });
});

describe('versionProblem: che cosa dice la schermata (matrice completa)', () => {
    const CURRENT = ['1.0.0.2', '1.0.0.9', '2.0.0.0'];
    const CANDIDATES = [...VALID, ...INVALID];
    it('nessun problema se e solo se e\' valida e strettamente piu\' alta', () => {
        let n = 0;
        for (const [current, candidate] of cartesian([CURRENT, CANDIDATES])) {
            const ok = isValidVersion(candidate!) && oracleCompare(candidate!.trim(), current!) > 0;
            const problem = versionProblem(candidate!, current!);
            expect(problem === null, `${JSON.stringify(candidate)} su ${current}: ${problem}`).toBe(ok);
            n++;
        }
        expect(n).toBe(CURRENT.length * CANDIDATES.length);
    });
    it('il messaggio dice che cosa fare', () => {
        expect(versionProblem('', '1.0.0.2')).toContain('Enter a version');
        expect(versionProblem('abc', '1.0.0.2')).toContain('four numbers');
        expect(versionProblem('1.0.0.2', '1.0.0.2')).toContain('higher than the version in DEV (1.0.0.2)');
        expect(versionProblem('1.0.0.1', '1.0.0.2')).toContain('higher');
    });
});

describe('raiseSolutionVersion: la scrittura in DEV', () => {
    let dev: FakeDev;
    beforeEach(() => {
        dev = makeDev([
            { id: 'id-a', unique: 'alpha', version: '1.0.0.2' },
            { id: 'id-m', unique: 'locked', version: '1.0.0.2', managed: true },
            { id: 'id-q', unique: "o'neil", version: '3.0.0.0' },
        ]);
        installFakeDev(dev);
    });

    it('scrive la nuova versione, la rilegge, e dice da dove parte e dove arriva', async () => {
        const r = await raiseSolutionVersion('alpha', '1.0.0.3');
        expect(r).toEqual({ from: '1.0.0.2', to: '1.0.0.3', changed: true });
        expect(dev.versionOf('alpha')).toBe('1.0.0.3');
        expect(dev.writes).toEqual([{ id: 'id-a', unique: 'alpha', version: '1.0.0.3' }]);
    });
    it('scrive esattamente il valore scelto, anche se salta (2.0.0.0)', async () => {
        await raiseSolutionVersion('alpha', '2.0.0.0');
        expect(dev.versionOf('alpha')).toBe('2.0.0.0');
    });
    it('toglie gli spazi attorno alla versione', async () => {
        const r = await raiseSolutionVersion('alpha', '  1.0.0.3  ');
        expect(r.to).toBe('1.0.0.3');
        expect(dev.versionOf('alpha')).toBe('1.0.0.3');
    });
    it('se DEV ha gia\' quella versione non scrive (un tentativo precedente era riuscito)', async () => {
        await raiseSolutionVersion('alpha', '1.0.0.3');
        dev.writes.length = 0;
        const r = await raiseSolutionVersion('alpha', '1.0.0.3');
        expect(r).toEqual({ from: '1.0.0.3', to: '1.0.0.3', changed: false });
        expect(dev.writes).toEqual([]);
    });
    it('se DEV ha una versione piu\' alta si ferma e non scrive niente', async () => {
        await expect(raiseSolutionVersion('alpha', '1.0.0.1')).rejects.toThrow(/already at 1\.0\.0\.2, higher than 1\.0\.0\.1/);
        expect(dev.writes).toEqual([]);
        expect(dev.versionOf('alpha')).toBe('1.0.0.2');
    });
    it('rifiuta una versione non valida prima di toccare Dataverse', async () => {
        for (const bad of ['', 'abc', '1.0', '1.0.0.x']) {
            await expect(raiseSolutionVersion('alpha', bad), JSON.stringify(bad)).rejects.toThrow(/not a valid version/);
        }
        expect(dev.writes).toEqual([]);
    });
    it('non tocca una solution managed', async () => {
        await expect(raiseSolutionVersion('locked', '1.0.0.3')).rejects.toThrow(/managed/);
        expect(dev.writes).toEqual([]);
    });
    it('una solution che non esiste', async () => {
        await expect(raiseSolutionVersion('nope', '1.0.0.3')).rejects.toThrow(/found 0/);
    });
    it('un nome con l\'apice (escape OData) trova la solution giusta', async () => {
        const r = await raiseSolutionVersion("o'neil", '3.0.0.1');
        expect(r.changed).toBe(true);
        expect(dev.versionOf("o'neil")).toBe('3.0.0.1');
    });
    it('una scrittura rifiutata (permessi) propaga l\'errore e non lascia nulla a meta\'', async () => {
        dev.failWriteWith = 'Principal user is missing prvWriteSolution privilege';
        await expect(raiseSolutionVersion('alpha', '1.0.0.3')).rejects.toThrow(/prvWriteSolution/);
        expect(dev.versionOf('alpha')).toBe('1.0.0.2');
    });
    it('una scrittura che non ha effetto viene scoperta dalla rilettura', async () => {
        dev.ignoreWrites = true;
        await expect(raiseSolutionVersion('alpha', '1.0.0.3')).rejects.toThrow(/reads 1\.0\.0\.2 after writing 1\.0\.0\.3.*not started/s);
    });
    it('scrive una sola volta anche se chiamata di nuovo con lo stesso valore', async () => {
        await raiseSolutionVersion('alpha', '1.0.0.3');
        await raiseSolutionVersion('alpha', '1.0.0.3');
        await raiseSolutionVersion('alpha', '1.0.0.3');
        expect(dev.writes.length).toBe(1);
    });
});
