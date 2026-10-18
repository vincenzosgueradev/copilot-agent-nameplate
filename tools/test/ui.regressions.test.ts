// @vitest-environment jsdom
/**
 * Difetti che la mutation aveva lasciato passare (2026-10-18): la versione di partenza si rilegge
 * da DEV quando non c'e' lavoro in corso, e il valore di una tile non diventa mai HTML.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot, flush, type UiWorld } from './helpers/ui-harness';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

const world = (version = '1.0.0.2'): UiWorld => ({
    solutions: [{ unique: 'S1', version }],
    agents: [{ name: 'one [DEV]', schema: 'ava_a1', solution: 'S1', publish: true }],
});

describe('versione di partenza', () => {
    it('senza lavoro in corso, tornando alla solution si rilegge quella di DEV', async () => {
        const ui = await boot(world());
        await ui.openSolution('S1');
        await ui.startRename();
        expect(ui.versionInput()).toBe('1.0.0.3');

        // il rinfresco silenzioso e' limitato a uno ogni 2 secondi: si finge che il tempo sia passato
        const now = Date.now();
        vi.spyOn(Date, 'now').mockReturnValue(now + 60_000);
        ui.dev.solutions.find(s => s.unique === 'S1')!.version = '1.0.0.9';
        await ui.back();
        await flush();
        await ui.startRename();
        expect(ui.versionInput()).toBe('1.0.0.10');
    });
});

describe('valori delle tile', () => {
    it('un valore con codice HTML si mostra come testo, non diventa HTML', async () => {
        // nel solution.xml l'entita' diventa "<b>" dopo la lettura: se non e' sfuggita, crea un elemento
        const ui = await boot(world('1.0.&lt;b&gt;'));
        await ui.openSolution('S1');
        await ui.startRename();
        await ui.typeSuffix('UAT');
        await ui.setRaise(false);
        await ui.next();
        await ui.buildPackage();
        const body = ui.doc.getElementById('preview-body')!;
        expect(body.querySelector('dd b')).toBeNull();
        expect(body.textContent).toContain('<b>');
    });
});
