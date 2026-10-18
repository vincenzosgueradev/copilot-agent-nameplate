/**
 * La pipeline vera (`runPackaging`: versione in DEV → export → lettura → piano → patch → zip →
 * verifica), con due cose sostituite: l'export di Dataverse, che restituisce package sintetici, e
 * Dataverse stesso, che e' un DEV finto con le sue solution e le loro versioni.
 *
 * Per ogni caso si controlla **che cosa c'e' dentro gli zip prodotti**, entry per entry, contro
 * l'oracolo; che la versione sia stata scritta in DEV **prima** dell'export e che lo zip la porti;
 * poi si rilegge il risultato come farebbe un import, e si rilancia la pipeline sul risultato per
 * verificare l'idempotenza (FR-071) anche della versione (FR-073b).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strFromU8 } from 'fflate';
import { DEFAULT_OPTIONS, type PackagingOptions, type PublishMode } from '../src/types';

const source = vi.hoisted(() => ({ make: (_managed: boolean): Uint8Array => new Uint8Array() }));
vi.mock('../src/services/export', () => ({
    exportPair: async () => ({
        managed: { bytes: source.make(true), mode: 'sync' as const, seconds: 0 },
        unmanaged: { bytes: source.make(false), mode: 'sync' as const, seconds: 0 },
    }),
}));

import { runPackaging } from '../src/services/packaging';
import { readPackage } from '../src/services/package';
import { makePackage, packageFiles, readEntries, type AgentSpec, type PackageSpec } from './helpers/fixture';
import { installFakeDev, makeDev, type FakeDev } from './helpers/fake-dev';
import { FULL } from './helpers/mode';
import { allPairs, rng } from './helpers/combinatorics';
import { expectedName, expectedPublish, effectiveMode } from './helpers/oracle';

const NAMES = ['alpha', 'alpha [DEV]', 'alpha [UAT]', 'alpha [DEV] [X]', 'A & B <x> [DEV]'];
const PUBLISH: (boolean | null)[] = [null, true, false];
const SUFFIXES = ['', 'UAT', '  PROD  ', 'A&B <1>', 'x'.repeat(20)];
const MODES: (PublishMode | undefined)[] = [undefined, 'keep', 'force-true', 'force-false'];
const GLOBALS: PublishMode[] = ['keep', 'force-true', 'force-false'];
const GPT = ['base', 'full'] as const;           // nome del componente GPT: base o nome intero
const CONNECTED = [true, false];                 // agent collegato a un canale o no

/** Versione di DEV all'inizio, e le scelte: non toccarla, il numero dopo, un salto, e quella che c'e' gia'. */
const START = '1.0.0.2';
const VERSIONS: (string | null)[] = [null, '1.0.0.3', '2.0.0.0', START];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

interface Case {
    agents: { name: string; publish: boolean | null; gpt: typeof GPT[number]; connected: boolean }[];
    selected: boolean[];
    suffix: string;
    modes: (PublishMode | undefined)[];
    global: PublishMode;
    /** La versione a cui alzare DEV, o `null` per non toccarla. */
    version: string | null;
}

const schemaOf = (i: number) => `ava_a${i + 1}`;

function specFor(c: Case, managed: boolean, version: string): PackageSpec {
    const agents: AgentSpec[] = c.agents.map((a, i) => ({
        schema: schemaOf(i), name: a.name, publishOnImport: a.publish, connected: a.connected,
        gptName: a.gpt === 'full' ? a.name : undefined, topics: 1,
    }));
    return { version, managed, agents };
}

const dec = (b: Uint8Array | undefined) => (b ? strFromU8(b) : '');

function newDev(): FakeDev {
    const dev = makeDev([{ id: 'sol-1', unique: 'testSolution', version: START }]);
    installFakeDev(dev);
    return dev;
}

async function runCase(c: Case): Promise<void> {
    const where = `caso ${JSON.stringify(c)}`;
    const dev = newDev();
    // L'export legge la versione che DEV ha NEL MOMENTO in cui parte: cosi' si vede se e' stata alzata prima
    source.make = managed => {
        dev.events.push('export');
        return makePackage(specFor(c, managed, dev.versionOf('testSolution')));
    };
    const options: PackagingOptions = {
        ...DEFAULT_OPTIONS,
        newVersion: c.version,
        publishOnImport: c.global,
        publishByAgent: Object.fromEntries(c.modes.flatMap((m, i) => (m ? [[schemaOf(i), m]] : []))),
    };
    const selectedSchemas = c.selected.flatMap((on, i) => (on ? [schemaOf(i)] : []));
    const finalVersion = c.version ?? START;

    const r = await runPackaging('testSolution', c.suffix, selectedSchemas, options);

    // 1. entrambi gli archivi hanno superato la verifica indipendente
    expect(r.valid, `${where}: verifica fallita`).toBe(true);

    // 2. la versione: scritta in DEV una volta sola e PRIMA dell'export, e lo zip la porta
    const mustWrite = c.version !== null && c.version !== START;
    expect(dev.versionOf('testSolution'), `${where}: versione in DEV dopo`).toBe(finalVersion);
    expect(dev.writes.map(w => w.version), `${where}: scritture`).toEqual(mustWrite ? [c.version] : []);
    expect(dev.events, `${where}: ordine`).toEqual(mustWrite ? [`write testSolution ${c.version}`, 'export', 'export'] : ['export', 'export']);
    expect(r.versionChange, `${where}: versionChange`).toEqual(
        c.version === null ? null : { from: START, to: c.version, changed: mustWrite });
    expect(readPackage(r.managed.bytes).version, `${where}: versione nello zip managed`).toBe(finalVersion);
    expect(readPackage(r.unmanaged.bytes).version, `${where}: versione nello zip unmanaged`).toBe(finalVersion);

    // 3. contenuto di ogni entry, contro l'oracolo
    for (const [label, built, managed] of [
        ['managed', r.managed, true], ['unmanaged', r.unmanaged, false],
    ] as const) {
        const original = packageFiles(specFor(c, managed, finalVersion));
        const produced = readEntries(built.bytes);
        expect(Object.keys(produced).sort(), `${where} ${label}: elenco entry`).toEqual(Object.keys(original).sort());

        for (const path of Object.keys(original)) {
            const was = original[path]!;
            const now = produced[path]!;
            let expectedText: string | null = null;      // null = deve essere byte-identica

            const bot = /^bots\/([^/]+)\/bot\.xml$/.exec(path);
            const cfg = /^bots\/([^/]+)\/configuration\.json$/.exec(path);
            if (bot) {
                const i = Number(bot[1]!.replace('ava_a', '')) - 1;
                const next = expectedName(c.agents[i]!.name, c.suffix, c.selected[i]!);
                expectedText = dec(was).replace(/<name>[^<]*<\/name>/, `<name>${esc(next)}</name>`);
            } else if (cfg) {
                const i = Number(cfg[1]!.replace('ava_a', '')) - 1;
                const a = c.agents[i]!;
                const mode = effectiveMode(c.modes[i], c.global);
                const target = expectedPublish(a.publish, mode, c.selected[i]!);
                if (target !== a.publish) {
                    const parsed = JSON.parse(dec(now)) as Record<string, unknown>;
                    const orig = JSON.parse(dec(was)) as Record<string, unknown>;
                    expect(parsed, `${where} ${label} ${path}`).toEqual({ ...orig, publishOnImport: target });
                    continue;
                }
            }
            // solution.xml compreso: il tool non lo tocca, porta la versione che DEV aveva all'export

            if (expectedText === null) {
                expect(now, `${where} ${label} ${path}: doveva restare byte-identica`).toEqual(was);
            } else {
                expect(dec(now), `${where} ${label} ${path}`).toBe(expectedText);
            }
        }
    }

    // 4. riletto come farebbe un import: nomi, publish, nessun posto sconosciuto
    const back = readPackage(r.managed.bytes);
    back.agents.forEach(a => {
        const i = Number(a.schemaName.replace('ava_a', '')) - 1;
        const agent = c.agents[i]!;
        expect(a.name, `${where}: nome riletto di ${a.schemaName}`)
            .toBe(expectedName(agent.name, c.suffix, c.selected[i]!));
        expect(a.publishOnImport, `${where}: publish riletto di ${a.schemaName}`).toBe(
            expectedPublish(agent.publish, effectiveMode(c.modes[i], c.global), c.selected[i]!));
    });
    expect(back.nameOccurrences.filter(o => !o.expected), `${where}: occorrenze impreviste`).toEqual([]);
    expect(back.managed, `${where}: il flag managed non deve cambiare`).toBe(true);
    expect(readPackage(r.unmanaged.bytes).managed, `${where}: il flag unmanaged non deve cambiare`).toBe(false);

    // 5. seconda esecuzione sul risultato (FR-071). Con un suffisso NON vuoto e' un punto
    //    fisso: nessun cambio. Con suffisso vuoto ogni esecuzione toglie un gruppo finale
    //    `[X]`, quindi 'alpha [DEV] [X]' diventa 'alpha [DEV]' e poi 'alpha': il risultato
    //    atteso e' quello dell'oracolo applicato di nuovo, non "nessun cambio".
    //    La versione e' gia' in DEV: la seconda volta NON si riscrive (FR-073b).
    const writesBefore = dev.writes.length;
    source.make = managed => (managed ? r.managed.bytes : r.unmanaged.bytes);
    const again = await runPackaging('testSolution', c.suffix, selectedSchemas, options);
    expect(again.valid, `${where}: seconda esecuzione non valida`).toBe(true);
    expect(dev.writes.length, `${where}: la versione non va riscritta`).toBe(writesBefore);
    expect(again.versionChange?.changed ?? false, `${where}: seconda volta: changed`).toBe(false);
    const names2 = readPackage(again.managed.bytes).agents.map(a => a.name);
    c.agents.forEach((a, i) => {
        const once = expectedName(a.name, c.suffix, c.selected[i]!);
        expect(names2[i], `${where}: nome dopo la seconda esecuzione di ${schemaOf(i)}`)
            .toBe(expectedName(once, c.suffix, c.selected[i]!));
    });
    if (c.suffix.trim()) {
        expect(again.plan.filter(p => p.state !== 'no-change' && p.element === 'name'),
            `${where}: con suffisso non vuoto i nomi devono essere un punto fisso`).toEqual([]);
    }
    expect(again.plan.filter(p => p.element === 'publishOnImport'),
        `${where}: publishOnImport non idempotente`).toEqual([]);
}

beforeEach(() => { source.make = () => new Uint8Array(); });

describe('pipeline: contenuto degli zip contro l\'oracolo', () => {
    (FULL ? it : it.skip)('1 agent: matrice esaustiva — solo test:full', async () => {
        let count = 0;
        for (const name of NAMES) for (const publish of PUBLISH) for (const gpt of GPT) {
            for (const connected of CONNECTED) for (const sel of [true, false]) {
                for (const suffix of SUFFIXES) for (const global of GLOBALS) {
                    for (const version of VERSIONS) for (const mode of MODES) {
                        await runCase({
                            agents: [{ name, publish, gpt, connected }],
                            selected: [sel], suffix, modes: [mode], global, version,
                        });
                        count++;
                    }
                }
            }
        }
        console.log(`pipeline 1 agent: ${count} combinazioni`);
        expect(count).toBe(NAMES.length * PUBLISH.length * GPT.length * CONNECTED.length * 2
            * SUFFIXES.length * GLOBALS.length * VERSIONS.length * MODES.length);
    // 28.800 combinazioni in un ciclo solo: ~13 minuti, oltre il testTimeout globale.
    }, 3_600_000);

    for (const n of [1, 2, 3, 4]) {
        it(`${n} agent: tutte le coppie + campioni`, async () => {
            const sizes = [
                SUFFIXES.length, GLOBALS.length, VERSIONS.length, 1 << n,
                ...Array.from({ length: n }, () =>
                    [NAMES.length, PUBLISH.length, GPT.length, CONNECTED.length, MODES.length]).flat(),
            ];
            const toCase = (row: number[]): Case => ({
                suffix: SUFFIXES[row[0]!]!, global: GLOBALS[row[1]!]!, version: VERSIONS[row[2]!]!,
                selected: Array.from({ length: n }, (_, i) => Boolean(row[3]! & (1 << i))),
                agents: Array.from({ length: n }, (_, i) => ({
                    name: NAMES[row[4 + i * 5]!]!, publish: PUBLISH[row[5 + i * 5]!]!,
                    gpt: GPT[row[6 + i * 5]!]!, connected: CONNECTED[row[7 + i * 5]!]!,
                })),
                modes: Array.from({ length: n }, (_, i) => MODES[row[8 + i * 5]!]),
            });
            const rows = allPairs(sizes, 31 + n);
            for (const row of rows) await runCase(toCase(row));
            const rand = rng(5000 + n);
            const samples = FULL ? (n <= 2 ? 3000 : 1500) : (n <= 2 ? 150 : 80);
            for (let k = 0; k < samples; k++) await runCase(toCase(sizes.map(s => Math.floor(rand() * s))));
            console.log(`pipeline ${n} agent: ${rows.length} righe per tutte le coppie + ${samples} campioni`);
            expect(rows.length).toBeGreaterThan(0);
        });
    }
});

describe('pipeline: quando la versione non si riesce ad alzare, NON si esporta', () => {
    const baseCase: Case = {
        agents: [{ name: 'alpha [DEV]', publish: null, gpt: 'base', connected: true }],
        selected: [true], suffix: 'UAT', modes: [undefined], global: 'keep', version: '1.0.0.3',
    };
    const run = (dev: FakeDev, version: string | null = '1.0.0.3') => {
        source.make = managed => {
            dev.events.push('export');
            return makePackage(specFor(baseCase, managed, dev.versionOf('testSolution')));
        };
        return runPackaging('testSolution', 'UAT', [schemaOf(0)], { ...DEFAULT_OPTIONS, newVersion: version });
    };

    it('la scrittura viene rifiutata (permessi): errore, DEV intatto, nessun export', async () => {
        const dev = newDev();
        dev.failWriteWith = 'Principal user is missing prvWriteSolution privilege';
        await expect(run(dev)).rejects.toThrow(/prvWriteSolution/);
        expect(dev.versionOf('testSolution')).toBe(START);
        expect(dev.events).toEqual([]);
    });
    it('la scrittura non ha effetto (la rilettura non coincide): errore e nessun export', async () => {
        const dev = newDev();
        dev.ignoreWrites = true;
        await expect(run(dev)).rejects.toThrow(/not started/);
        expect(dev.events).toEqual(['write testSolution 1.0.0.3']);   // scritto, mai esportato
    });
    it('DEV e\' gia\' piu\' alto di quanto richiesto (qualcuno l\'ha alzato): nessuna scrittura, nessun export', async () => {
        const dev = newDev();
        dev.solutions[0]!.version = '1.0.0.9';
        await expect(run(dev)).rejects.toThrow(/already at 1\.0\.0\.9/);
        expect(dev.writes).toEqual([]);
        expect(dev.events).toEqual([]);
    });
    it('la solution e\' managed: nessuna scrittura, nessun export', async () => {
        const dev = newDev();
        dev.solutions[0]!.managed = true;
        await expect(run(dev)).rejects.toThrow(/managed/);
        expect(dev.events).toEqual([]);
    });
    it('una versione non valida: nessuna scrittura, nessun export', async () => {
        const dev = newDev();
        await expect(run(dev, 'abc')).rejects.toThrow(/not a valid version/);
        expect(dev.events).toEqual([]);
    });
    it('senza versione da alzare non si scrive niente, nemmeno se la solution e\' managed in DEV finto', async () => {
        const dev = newDev();
        const r = await run(dev, null);
        expect(r.valid).toBe(true);
        expect(r.versionChange).toBeNull();
        expect(dev.writes).toEqual([]);
    });
    it('l\'export che NON porta la versione scritta viene respinto dalla verifica', async () => {
        const dev = newDev();
        // Un export che ignora la versione di DEV: porta sempre quella vecchia
        source.make = managed => makePackage(specFor(baseCase, managed, START));
        const r = await runPackaging('testSolution', 'UAT', [schemaOf(0)], { ...DEFAULT_OPTIONS, newVersion: '1.0.0.3' });
        expect(dev.versionOf('testSolution')).toBe('1.0.0.3');
        expect(r.valid, 'DEV e artefatto divergono: non puo\' risultare valido').toBe(false);
        expect(r.managed.verification.patchedValuesConfirmed).toBe(false);
        expect(r.unmanaged.verification.patchedValuesConfirmed).toBe(false);
    });
});
