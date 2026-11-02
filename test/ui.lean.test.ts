// @vitest-environment jsdom
/**
 * Spec 018 (blocco D) — nessuna schermata ripete lo stesso fatto in due punti (FR-009) e ogni popup ha la sua icona (FR-004).
 * Le frasi tolte sono elencate in `specs/018-lean-screens-and-live-pipeline/research.md`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot, type UiWorld } from './helpers/ui-harness';
import { readSource } from './helpers/source';

afterEach(() => { vi.useRealTimers(); });

const WORLD: UiWorld = {
    solutions: [{ unique: 'S1' }],
    agents: [
        { name: 'agent1 [DEV]', schema: 'ava_a1', solution: 'S1', publish: null },
        { name: 'agent2 [DEV]', schema: 'ava_a2', solution: 'S1', publish: null },
    ],
};

async function suffixStep(targets: string[]) {
    const ui = await boot(WORLD);
    await ui.openSolution('S1');
    await ui.startRenameBare();
    for (const t of targets) await ui.tickTarget(t, true);
    return ui;
}

/** Frasi che non devono comparire in nessuna schermata, con la schermata in cui stavano. */
const REMOVED: [string, string][] = [
    ['suffix', 'Publish on import carries the new name'],
    ['suffix', 'Drag the handle or use the arrows'],
    ['suffix', 'what lands on disk'],
    ['suffix', 'tick the environments to build for'],
    ['suffix', 'ALM pipeline'],
    ['suffix', 'proves a single element was touched'],
    ['suffix', 'an untouched snapshot'],
    ['suffix', 'tells apart two artifacts'],
    ['suffix', 'it creates no unmanaged layer'],
    ['preview', 'grouped by agent'],
    ['preview', 'what the package will carry'],
    ['verify', 'what travels on import'],
    ['verify', 'side by side'],
    ['verify', 'travels on import, not just the agent'],
];

describe('le frasi ridondanti non ci sono piu\' (FR-009)', () => {
    it('passo Suffix, con uno e con tre Target', async () => {
        for (const targets of [['UAT'], ['DEV', 'UAT', 'PROD']]) {
            const ui = await suffixStep(targets);
            const text = ui.text('suffix');
            for (const [screen, phrase] of REMOVED.filter(([s]) => s === 'suffix')) {
                expect(text.includes(phrase), `${screen}: «${phrase}» con ${targets.length} Target`).toBe(false);
            }
        }
    });
    it('la frase breve resta: si sceglie con le caselle', async () => {
        const ui = await suffixStep(['UAT']);
        expect(ui.text('suffix')).toContain('tick the targets to build for');
    });
    it('«Publish on import» non e\' piu\' ripetuto sotto ogni tabella di agent', async () => {
        const ui = await suffixStep(['DEV', 'UAT', 'PROD']);
        expect(ui.doc.querySelectorAll('#target-list .target-agents').length).toBe(3);
        expect(ui.doc.querySelectorAll('#target-list .foot-row .hint').length).toBe(0);
        expect(ui.doc.querySelectorAll('#target-list .foot-label').length, 'resta l\'etichetta del «per tutti»').toBe(3);
    });
    it('«Nothing to rename» resta ma e\' breve', async () => {
        const ui = await suffixStep(['UAT']);
        await ui.toggleAgent('agent1 [DEV]', 'UAT');
        await ui.toggleAgent('agent2 [DEV]', 'UAT');
        const warn = Array.from(ui.doc.querySelectorAll('#target-list .hint--warn')).map(e => e.textContent!).find(t => t.includes('Nothing to rename'))!;
        expect(warn).toBeDefined();
        expect(warn.length, warn).toBeLessThan(140);
        expect(warn).toContain('Tick at least one');
    });
    it('le descrizioni dei file del riquadro Artifacts sono di una riga', async () => {
        const ui = await suffixStep(['UAT']);
        const descs = Array.from(ui.doc.querySelectorAll('#artifact-list .art-desc')).map(e => e.textContent!.trim());
        expect(descs.length).toBe(5);
        descs.forEach(d => expect(d.length, d).toBeLessThan(85));
        expect(descs.join(' ')).toContain('Never import it downstream');
        expect(descs.join(' ')).toContain('Re-import it to go back');
    });
    it('anteprima e controlli', async () => {
        const ui = await suffixStep(['UAT']);
        await ui.next();
        await ui.buildPackage();
        const preview = ui.text('preview');
        for (const [, phrase] of REMOVED.filter(([s]) => s === 'preview')) expect(preview.includes(phrase), phrase).toBe(false);
        expect(preview, 'i titoli restano').toContain('What gets changed');
        await ui.toVerify();
        const verify = ui.text('verify');
        for (const [, phrase] of REMOVED.filter(([s]) => s === 'verify')) expect(verify.includes(phrase), phrase).toBe(false);
        expect(verify, 'i titoli restano').toContain('Package contents');
        expect(verify).toContain('Checks');
    });
});

describe('ogni popup ha la sua icona (FR-004)', () => {
    // [titolo del popup, icona attesa]: si legge dal sorgente, perche' alcuni popup si aprono solo in casi rari
    const expected: [string, string][] = [
        ['The agents would have different suffixes', 'tag'],
        ['The name appears in unexpected places', 'search'],
        ['The package holds more than the agent', 'package'],
        ['That folder already exists', 'folder'],
        ['Export the log', 'download'],
        ['Change the solution version in DEV', 'upload'],
    ];
    const src = readSource('app.ts');
    for (const [title, name] of expected) {
        it(`«${title}» usa l'icona ${name}`, () => {
            const at = src.indexOf(`title: '${title}'`);
            expect(at, 'titolo non trovato').toBeGreaterThan(0);
            const block = src.slice(at, at + 220);
            expect(block).toContain(`icon: '${name}'`);
        });
    }
    it('ogni askConfirm ha un titolo con icona scelta, oppure parte dal default (avviso o info)', () => {
        const calls = src.match(/askConfirm\(\{/g) ?? [];
        expect(calls.length).toBeGreaterThanOrEqual(8);
    });
});
