// @vitest-environment jsdom
/**
 * La schermata, percorsa come la percorre un utente: elenco → solution → suffisso → revisione →
 * anteprima → verifica → salvataggio. Il codice e' quello di produzione; si sostituiscono solo
 * Dataverse, il file system e le API di PPTB (vedi `helpers/ui-harness.ts`).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot, type UiWorld } from './helpers/ui-harness';

const world = (n: number): UiWorld => ({
    solutions: [{ unique: 'S1' }],
    agents: Array.from({ length: n }, (_, i) => ({
        name: `agent${i + 1} [DEV]`, schema: `ava_a${i + 1}`, solution: 'S1', publish: i === 0 ? true : null,
    })),
});

afterEach(() => { vi.useRealTimers(); });

describe('avvio e navigazione', () => {
    it('elenca la solution e apre il suffisso con tutti gli agent', async () => {
        const ui = await boot(world(3));
        expect(ui.step()).toBe('welcome');
        await ui.openSolution('S1');
        expect(ui.step()).toBe('solution');
        await ui.startRename();
        expect(ui.step()).toBe('suffix');
        expect(ui.suffixRows().map(r => r.name)).toEqual(['agent1 [DEV]', 'agent2 [DEV]', 'agent3 [DEV]']);
        expect(ui.suffixRows().every(r => r.checked)).toBe(true);
    });
});
