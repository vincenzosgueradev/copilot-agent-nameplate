/**
 * `agentOutcomes`: l'esito per agent che finisce nel manifest e nello storico (FR-076).
 * Matrice completa: ogni agent puo' essere selezionato o no, con ogni nome di partenza e ogni
 * suffisso, e l'esito deve dire sempre la verita' (prima, dopo, escluso).
 */

import { describe, expect, it } from 'vitest';
import { agentOutcomes, buildPatchPlan } from '../src/services/patch';
import { readPackage } from '../src/services/package';
import { DEFAULT_OPTIONS } from '../src/types';
import { makePackage } from './helpers/fixture';
import { cartesian, subsets } from './helpers/combinatorics';
import { expectedName } from './helpers/oracle';

const NAMES = ['alpha', 'alpha [DEV]', 'alpha [UAT]', 'A & B [DEV]'];
const SUFFIXES = ['', 'UAT', '  X  ', 'a&b'];

describe('agentOutcomes', () => {
    for (const n of [1, 2, 3]) {
        it(`${n} agent: tutte le combinazioni di nome, suffisso e selezione`, () => {
            const dims = Array.from({ length: n }, () => NAMES);
            let count = 0;
            for (const names of cartesian(dims)) {
                const pkg = readPackage(makePackage({
                    agents: names.map((name, i) => ({
                        schema: `ava_a${i + 1}`, name, publishOnImport: null, topics: 1,
                    })),
                }));
                for (const sel of subsets(names.map((_, i) => i))) {
                    for (const suffix of SUFFIXES) {
                        const selected = names.map((_, i) => sel.includes(i));
                        const plan = buildPatchPlan(pkg, suffix,
                            selected.flatMap((on, i) => (on ? [`ava_a${i + 1}`] : [])), DEFAULT_OPTIONS);
                        const out = agentOutcomes(pkg, plan);
                        const where = JSON.stringify({ names, selected, suffix });

                        expect(out.map(o => o.schemaName), where).toEqual(names.map((_, i) => `ava_a${i + 1}`));
                        out.forEach((o, i) => {
                            expect(o.before, `${where} before ${i}`).toBe(names[i]);
                            expect(o.excluded, `${where} excluded ${i}`).toBe(!selected[i]);
                            expect(o.after, `${where} after ${i}`).toBe(expectedName(names[i]!, suffix, selected[i]!));
                        });
                        count++;
                    }
                }
            }
            expect(count).toBe(NAMES.length ** n * (1 << n) * SUFFIXES.length);
        });
    }

    it('un agent selezionato il cui nome non cambia NON risulta escluso', () => {
        const pkg = readPackage(makePackage({
            agents: [{ schema: 'ava_a1', name: 'alpha [UAT]', publishOnImport: null, topics: 1 }],
        }));
        const out = agentOutcomes(pkg, buildPatchPlan(pkg, 'UAT', ['ava_a1'], DEFAULT_OPTIONS));
        expect(out).toEqual([{ schemaName: 'ava_a1', before: 'alpha [UAT]', after: 'alpha [UAT]', excluded: false }]);
    });
});
