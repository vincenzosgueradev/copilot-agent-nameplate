/**
 * Matrice del piano di patch (`buildPatchPlan`) contro l'oracolo.
 *
 * - 1 e 2 agent: prodotto cartesiano COMPLETO di tutte le dimensioni.
 * - 3 e 4 agent: copertura di tutte le coppie di valori + campioni casuali con seme fisso.
 *
 * Dimensioni: nome di partenza di ogni agent, suo publishOnImport di partenza, suffisso,
 * eccezione di publish per agent, valore di partenza per tutti, bump di versione, sottoinsieme
 * di agent selezionati (vuoto compreso).
 */

import { describe, expect, it } from 'vitest';
import { buildPatchPlan } from '../src/services/patch';
import { readPackage } from '../src/services/package';
import { DEFAULT_OPTIONS, TEAMS_NAME_LIMIT, type PackagingOptions, type PublishMode } from '../src/types';
import { makePackage } from './helpers/fixture';
import { FULL } from './helpers/mode';
import { allPairs, cartesian, cartesianSize, rng, subsets } from './helpers/combinatorics';
import { effectiveMode, expectedName, expectedNameState, expectedPublish, expectedVersion } from './helpers/oracle';


const NAMES = [
    'alpha',                       // mai suffissato
    'alpha [DEV]',                 // il caso di partenza
    'alpha [UAT]',                 // gia' sul suffisso di destinazione
    'alpha [DEV] [X]',             // due suffissi: si toglie solo l'ultimo
    'alpha [thisisaverylongsuffix1]', // 21 caratteri: NON e' un suffisso, resta parte del nome
    'A & B <x> [DEV]',             // caratteri da sfuggire in XML
];
const PUBLISH: (boolean | null)[] = [null, true, false];
const SUFFIXES = ['', 'UAT', '  PROD  ', 'DEV', 'A&B <1>', 'x'.repeat(20)];
const MODES: (PublishMode | undefined)[] = [undefined, 'keep', 'force-true', 'force-false'];
const GLOBALS: PublishMode[] = ['keep', 'force-true', 'force-false'];
const BUMP = [false, true];

interface AgentState { name: string; publish: boolean | null }

const VERSION = '1.0.0.2';
const schemaOf = (i: number) => `ava_a${i + 1}`;

const pkgCache = new Map<string, ReturnType<typeof readPackage>>();
function packageFor(states: AgentState[]) {
    const key = JSON.stringify(states);
    let pkg = pkgCache.get(key);
    if (!pkg) {
        pkg = readPackage(makePackage({
            version: VERSION,
            agents: states.map((s, i) => ({
                schema: schemaOf(i), name: s.name, publishOnImport: s.publish, topics: 1,
            })),
        }));
        pkgCache.set(key, pkg);
    }
    return pkg;
}

interface Case {
    states: AgentState[];
    selected: boolean[];
    suffix: string;
    modes: (PublishMode | undefined)[];
    global: PublishMode;
    bump: boolean;
}

/** Confronta il piano reale con quello che l'oracolo prevede. Lancia con il caso nel messaggio. */
function check(c: Case): void {
    const pkg = packageFor(c.states);
    const options: PackagingOptions = {
        ...DEFAULT_OPTIONS,
        bumpVersion: c.bump,
        publishOnImport: c.global,
        publishByAgent: Object.fromEntries(
            c.modes.flatMap((m, i) => (m ? [[schemaOf(i), m]] : []))),
    };
    const selectedSchemas = c.selected.flatMap((on, i) => (on ? [schemaOf(i)] : []));
    const plan = buildPatchPlan(pkg, c.suffix, selectedSchemas, options);
    const where = `caso ${JSON.stringify(c)}`;

    const expected: { file: string; element: string; before: string | null; after: string; state: string; long: boolean }[] = [];
    c.states.forEach((s, i) => {
        if (!c.selected[i]) return;
        const file = `bots/${schemaOf(i)}/bot.xml`;
        const after = expectedName(s.name, c.suffix, true);
        expected.push({
            file, element: 'name', before: s.name, after,
            state: expectedNameState(s.name, c.suffix), long: after.length > TEAMS_NAME_LIMIT,
        });
        const mode = effectiveMode(c.modes[i], c.global);
        const target = expectedPublish(s.publish, mode, true);
        if (mode !== 'keep' && target !== s.publish) {
            expected.push({
                file: `bots/${schemaOf(i)}/configuration.json`, element: 'publishOnImport',
                before: s.publish === null ? null : String(s.publish),
                after: String(target), state: s.publish === null ? 'added' : 'suffix-changed', long: false,
            });
        }
    });
    const nextVersion = expectedVersion(VERSION, c.bump);
    if (nextVersion !== VERSION) {
        expected.push({
            file: 'solution.xml', element: 'Version', before: VERSION, after: nextVersion,
            state: 'suffix-changed', long: false,
        });
    }

    const norm = (rows: { file: string; element: string }[]) =>
        [...rows].sort((a, b) => (a.file + a.element).localeCompare(b.file + b.element));
    const actual = plan.map(p => ({
        file: p.file, element: p.element, before: p.before, after: p.after,
        state: p.state, long: p.exceedsTeamsLimit,
    }));
    expect(norm(actual), where).toEqual(norm(expected));
}

describe('piano di patch: matrice esaustiva (1 e 2 agent) — solo test:full', () => {
    for (const n of [1, 2]) {
        (FULL ? it : it.skip)(`${n} agent: prodotto cartesiano completo`, () => {
            const agentStates: AgentState[] = [];
            for (const name of NAMES) for (const publish of PUBLISH) agentStates.push({ name, publish });
            const stateDims = Array.from({ length: n }, () => agentStates);
            const selections = subsets(Array.from({ length: n }, (_, i) => i));
            const modeDims = Array.from({ length: n }, () => MODES);

            let count = 0;
            for (const states of cartesian(stateDims)) {
                for (const sel of selections) {
                    const selected = Array.from({ length: n }, (_, i) => sel.includes(i));
                    for (const suffix of SUFFIXES) {
                        for (const global of GLOBALS) {
                            for (const bump of BUMP) {
                                for (const modes of cartesian(modeDims)) {
                                    check({ states, selected, suffix, modes, global, bump });
                                    count++;
                                }
                            }
                        }
                    }
                }
            }
            const expectedCount = cartesianSize(stateDims) * selections.length * SUFFIXES.length
                * GLOBALS.length * BUMP.length * cartesianSize(modeDims);
            expect(count).toBe(expectedCount);
            console.log(`${n} agent: ${count} combinazioni verificate`);
        });
    }
});

describe('piano di patch: tutte le coppie + campioni (1-4 agent)', () => {
    for (const n of [1, 2, 3, 4]) {
        it(`${n} agent`, () => {
            const masks = 1 << n;
            // parametri: suffisso, globale, bump, selezione, e per ogni agent nome/publish/eccezione
            const sizes = [
                SUFFIXES.length, GLOBALS.length, BUMP.length, masks,
                ...Array.from({ length: n }, () => [NAMES.length, PUBLISH.length, MODES.length]).flat(),
            ];
            const toCase = (row: number[]): Case => ({
                suffix: SUFFIXES[row[0]!]!,
                global: GLOBALS[row[1]!]!,
                bump: BUMP[row[2]!]!,
                selected: Array.from({ length: n }, (_, i) => Boolean(row[3]! & (1 << i))),
                states: Array.from({ length: n }, (_, i) => ({
                    name: NAMES[row[4 + i * 3]!]!, publish: PUBLISH[row[5 + i * 3]!]!,
                })),
                modes: Array.from({ length: n }, (_, i) => MODES[row[6 + i * 3]!]),
            });

            const pairRows = allPairs(sizes, 7 + n);
            for (const row of pairRows) check(toCase(row));

            const rand = rng(1000 + n);
            const samples = FULL ? 20000 : 3000;
            for (let k = 0; k < samples; k++) check(toCase(sizes.map(s => Math.floor(rand() * s))));
            console.log(`${n} agent: ${pairRows.length} righe per coprire tutte le coppie + ${samples} campioni`);
            expect(pairRows.length).toBeGreaterThan(0);
        });
    }
});
