/**
 * La pipeline vera (`runPackaging`: export → lettura → piano → patch → zip → verifica), con
 * una sola cosa sostituita: l'export di Dataverse, che restituisce package sintetici.
 *
 * Per ogni caso si controlla **che cosa c'e' dentro gli zip prodotti**, entry per entry, contro
 * l'oracolo; poi si rilegge il risultato come farebbe un import, e si rilancia la pipeline
 * sul risultato per verificare l'idempotenza (FR-071).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strFromU8 } from 'fflate';
import { DEFAULT_OPTIONS, type PackagingOptions, type PublishMode } from '../src/types';

const source = vi.hoisted(() => ({
    managed: new Uint8Array() as Uint8Array,
    unmanaged: new Uint8Array() as Uint8Array,
}));
vi.mock('../src/services/export', () => ({
    exportPair: async () => ({
        managed: { bytes: source.managed, mode: 'sync' as const, seconds: 0 },
        unmanaged: { bytes: source.unmanaged, mode: 'sync' as const, seconds: 0 },
    }),
}));

import { runPackaging } from '../src/services/packaging';
import { readPackage } from '../src/services/package';
import { makePackage, packageFiles, readEntries, type AgentSpec, type PackageSpec } from './helpers/fixture';
import { FULL } from './helpers/mode';
import { allPairs, rng } from './helpers/combinatorics';
import { expectedName, expectedPublish, expectedVersion, effectiveMode } from './helpers/oracle';


const NAMES = ['alpha', 'alpha [DEV]', 'alpha [UAT]', 'alpha [DEV] [X]', 'A & B <x> [DEV]'];
const PUBLISH: (boolean | null)[] = [null, true, false];
const SUFFIXES = ['', 'UAT', '  PROD  ', 'A&B <1>', 'x'.repeat(20)];
const MODES: (PublishMode | undefined)[] = [undefined, 'keep', 'force-true', 'force-false'];
const GLOBALS: PublishMode[] = ['keep', 'force-true', 'force-false'];
const BUMP = [false, true];
const GPT = ['base', 'full'] as const;           // nome del componente GPT: base o nome intero
const CONNECTED = [true, false];                 // agent collegato a un canale o no

const VERSION = '1.0.0.2';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

interface Case {
    agents: { name: string; publish: boolean | null; gpt: typeof GPT[number]; connected: boolean }[];
    selected: boolean[];
    suffix: string;
    modes: (PublishMode | undefined)[];
    global: PublishMode;
    bump: boolean;
}

const schemaOf = (i: number) => `ava_a${i + 1}`;

function specFor(c: Case, managed: boolean): PackageSpec {
    const agents: AgentSpec[] = c.agents.map((a, i) => ({
        schema: schemaOf(i), name: a.name, publishOnImport: a.publish, connected: a.connected,
        gptName: a.gpt === 'full' ? a.name : undefined, topics: 1,
    }));
    return { version: VERSION, managed, agents };
}

const dec = (b: Uint8Array | undefined) => (b ? strFromU8(b) : '');

async function runCase(c: Case): Promise<void> {
    const where = `caso ${JSON.stringify(c)}`;
    source.managed = makePackage(specFor(c, true));
    source.unmanaged = makePackage(specFor(c, false));
    const options: PackagingOptions = {
        ...DEFAULT_OPTIONS,
        bumpVersion: c.bump,
        publishOnImport: c.global,
        publishByAgent: Object.fromEntries(c.modes.flatMap((m, i) => (m ? [[schemaOf(i), m]] : []))),
    };
    const selectedSchemas = c.selected.flatMap((on, i) => (on ? [schemaOf(i)] : []));

    const r = await runPackaging('testSolution', c.suffix, selectedSchemas, options);

    // 1. entrambi gli archivi hanno superato la verifica indipendente
    expect(r.valid, `${where}: verifica fallita`).toBe(true);

    // 2. contenuto di ogni entry, contro l'oracolo
    for (const [label, built, managed] of [
        ['managed', r.managed, true], ['unmanaged', r.unmanaged, false],
    ] as const) {
        const original = packageFiles(specFor(c, managed));
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
            } else if (path === 'solution.xml') {
                expectedText = dec(was).replace(
                    `<Version>${VERSION}</Version>`, `<Version>${expectedVersion(VERSION, c.bump)}</Version>`);
            }

            if (expectedText === null) {
                expect(now, `${where} ${label} ${path}: doveva restare byte-identica`).toEqual(was);
            } else {
                expect(dec(now), `${where} ${label} ${path}`).toBe(expectedText);
            }
        }
    }

    // 3. riletto come farebbe un import: nomi, publish, nessun posto sconosciuto
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

    // 4. seconda esecuzione sul risultato (FR-071). Con un suffisso NON vuoto e' un punto
    //    fisso: nessun cambio. Con suffisso vuoto ogni esecuzione toglie un gruppo finale
    //    `[X]`, quindi 'alpha [DEV] [X]' diventa 'alpha [DEV]' e poi 'alpha': il risultato
    //    atteso e' quello dell'oracolo applicato di nuovo, non "nessun cambio".
    source.managed = r.managed.bytes;
    source.unmanaged = r.unmanaged.bytes;
    const again = await runPackaging('testSolution', c.suffix, selectedSchemas,
        { ...options, bumpVersion: false });
    expect(again.valid, `${where}: seconda esecuzione non valida`).toBe(true);
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

beforeEach(() => { source.managed = new Uint8Array(); source.unmanaged = new Uint8Array(); });

describe('pipeline: contenuto degli zip contro l\'oracolo', () => {
    (FULL ? it : it.skip)('1 agent: matrice esaustiva — solo test:full', async () => {
        let count = 0;
        for (const name of NAMES) for (const publish of PUBLISH) for (const gpt of GPT) {
            for (const connected of CONNECTED) for (const sel of [true, false]) {
                for (const suffix of SUFFIXES) for (const global of GLOBALS) {
                    for (const bump of BUMP) for (const mode of MODES) {
                        await runCase({
                            agents: [{ name, publish, gpt, connected }],
                            selected: [sel], suffix, modes: [mode], global, bump,
                        });
                        count++;
                    }
                }
            }
        }
        console.log(`pipeline 1 agent: ${count} combinazioni`);
        expect(count).toBe(NAMES.length * PUBLISH.length * GPT.length * CONNECTED.length * 2
            * SUFFIXES.length * GLOBALS.length * BUMP.length * MODES.length);
    });

    for (const n of [1, 2, 3, 4]) {
        it(`${n} agent: tutte le coppie + campioni`, async () => {
            const sizes = [
                SUFFIXES.length, GLOBALS.length, BUMP.length, 1 << n,
                ...Array.from({ length: n }, () =>
                    [NAMES.length, PUBLISH.length, GPT.length, CONNECTED.length, MODES.length]).flat(),
            ];
            const toCase = (row: number[]): Case => ({
                suffix: SUFFIXES[row[0]!]!, global: GLOBALS[row[1]!]!, bump: BUMP[row[2]!]!,
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
