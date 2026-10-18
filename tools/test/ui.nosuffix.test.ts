// @vitest-environment jsdom
/**
 * Spec 013 — avviso "nessun suffisso": percorsi della schermata.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot, flush, type UiWorld } from './helpers/ui-harness';

afterEach(() => { vi.useRealTimers(); });

const WORLD: UiWorld = {
    solutions: [{ unique: 'S1' }],
    agents: [
        { name: 'agent1 [DEV]', schema: 'ava_a1', solution: 'S1', publish: null },
        { name: 'agent2 [DEV]', schema: 'ava_a2', solution: 'S1', publish: null },
        { name: 'agent3', schema: 'ava_a3', solution: 'S1', publish: null },
    ],
};

const overlay = (ui: { doc: Document }) => ui.doc.getElementById('confirm-overlay')!;
const shown = (ui: { doc: Document }) => overlay(ui).style.display === 'flex';
const text = (ui: { doc: Document }) => overlay(ui).textContent!.replace(/\s+/g, ' ');

async function toSuffix() {
    const ui = await boot(WORLD);
    await ui.openSolution('S1');
    await ui.startRename();
    return ui;
}

describe('suffisso vuoto: avviso prima della revisione', () => {
    it('senza suffisso compare l\'avviso e non si cambia schermata', async () => {
        const ui = await toSuffix();
        await ui.nextRaw();
        expect(shown(ui)).toBe(true);
        expect(ui.step()).toBe('suffix');
        expect(overlay(ui).querySelector('.dialog')!.classList.contains('dialog--warning')).toBe(true);
    });
    it('spiega che il suffisso esistente viene tolto, con esempi prima → dopo', async () => {
        const ui = await toSuffix();
        await ui.nextRaw();
        expect(text(ui)).toContain('removed');
        expect(text(ui)).toContain('agent1 [DEV]');
        expect(overlay(ui).querySelector('.warn-list')!.textContent).toContain('agent1');
        expect(text(ui)).toContain('Continue without suffix');
    });
    it('elenca tutti gli agent selezionati, non solo i primi', async () => {
        const ui = await boot({ solutions: [{ unique: 'S1' }], agents: Array.from({ length: 7 }, (_, i) =>
            ({ name: `agent${i} [DEV]`, schema: `ava_a${i}`, solution: 'S1', publish: null })) });
        await ui.openSolution('S1');
        await ui.startRename();
        await ui.nextRaw();
        expect(overlay(ui).querySelectorAll('.warn-list li').length).toBe(7);
        expect(text(ui)).not.toContain('more');
    });
    it('"Go back" chiude l\'avviso e resta sul suffisso', async () => {
        const ui = await toSuffix();
        await ui.nextRaw();
        (ui.doc.getElementById('confirm-cancel-btn') as HTMLButtonElement).click();
        await flush();
        expect(shown(ui)).toBe(false);
        expect(ui.step()).toBe('suffix');
    });
    it('"Continue without suffix" porta alla revisione', async () => {
        const ui = await toSuffix();
        await ui.nextRaw();
        (ui.doc.getElementById('confirm-ok-btn') as HTMLButtonElement).click();
        await flush();
        expect(ui.step()).toBe('review');
    });
    it('con un suffisso scritto non compare nessun avviso', async () => {
        const ui = await toSuffix();
        await ui.typeSuffix('UAT');
        await ui.nextRaw();
        expect(shown(ui)).toBe(false);
        expect(ui.step()).toBe('review');
    });
    it('un suffisso di soli spazi vale vuoto', async () => {
        const ui = await toSuffix();
        await ui.typeSuffix('   ');
        await ui.nextRaw();
        expect(shown(ui)).toBe(true);
    });
});
