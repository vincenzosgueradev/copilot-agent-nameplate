// @vitest-environment jsdom
/**
 * Spec 019 (blocco A) — lo stepper: la pagina corrente e' la piu' evidente, i passi fatti hanno la spunta,
 * la linea si riempie. Oracolo scritto dalla spec (FR-001, FR-002).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot, type Driver, type UiWorld } from './helpers/ui-harness';
import { readSource } from './helpers/source';

afterEach(() => { vi.useRealTimers(); });

const WORLD: UiWorld = {
    solutions: [{ unique: 'S1' }],
    agents: [{ name: 'agent1 [DEV]', schema: 'ava_a1', solution: 'S1', publish: null }],
};

const LABELS = ['Suffix', 'Review', 'Preview', 'Checks', 'Result'];
const css = readSource('styles.css');
const rule = (re: RegExp) => re.exec(css)?.[1] ?? '';

/** Lo stepper della schermata `id`, letto dal DOM: per ogni passo la classe, il contenuto e l'attributo. */
function read(ui: Driver, id: string) {
    const ol = ui.doc.querySelector(`#${id} .stepper`)!;
    expect(ol, `stepper in #${id}`).not.toBeNull();
    const items = Array.from(ol.querySelectorAll(':scope > .stepper-item')).map(li => ({
        label: li.querySelector('.stepper-label')!.textContent!,
        state: li.classList.contains('active') ? 'active' : li.classList.contains('done') ? 'done' : 'todo',
        dot: li.querySelector('.stepper-dot')!.textContent!.trim(),
        check: li.querySelector('.stepper-dot .icon-check') !== null,
        current: li.getAttribute('aria-current'),
    }));
    const lines = Array.from(ol.querySelectorAll(':scope > .stepper-line')).map(l => l.classList.contains('done'));
    return { items, lines };
}

async function walk() {
    const ui = await boot(WORLD);
    await ui.openSolution('S1');
    await ui.startRename();
    const seen: [string, ReturnType<typeof read>][] = [['step-suffix', read(ui, 'step-suffix')]];
    await ui.typeSuffix('UAT');
    await ui.next();
    seen.push(['step-review', read(ui, 'step-review')]);
    await ui.buildPackage();
    seen.push(['step-preview', read(ui, 'step-preview')]);
    await ui.toVerify();
    seen.push(['step-verify', read(ui, 'step-verify')]);
    await ui.save();
    seen.push(['step-result', read(ui, 'step-result')]);
    return seen;
}

describe('lo stepper in ogni schermata (FR-001, FR-002)', () => {
    it('cinque passi con i loro nomi, in ordine, in ogni schermata', async () => {
        for (const [id, s] of await walk()) expect(s.items.map(i => i.label), id).toEqual(LABELS);
    });
    for (const page of [1, 2, 3, 4, 5]) {
        it(`pagina ${page}: ${page - 1} fatti con la spunta, 1 corrente, ${5 - page} da fare`, async () => {
            const [id, s] = (await walk())[page - 1]!;
            expect(s.items.map(i => i.state), id).toEqual(LABELS.map((_, i) => (i + 1 < page ? 'done' : i + 1 === page ? 'active' : 'todo')));
            // fatti: spunta e nessun numero; corrente e da fare: il numero e nessuna spunta
            s.items.forEach((it, i) => {
                expect(it.check, `${id} passo ${i + 1} spunta`).toBe(i + 1 < page);
                expect(it.dot, `${id} passo ${i + 1} numero`).toBe(i + 1 < page ? '' : String(i + 1));
            });
        });
        it(`pagina ${page}: aria-current solo sul passo corrente; le linee fatte sono ${page - 1} su 4`, async () => {
            const [id, s] = (await walk())[page - 1]!;
            expect(s.items.map(i => i.current), id).toEqual(LABELS.map((_, i) => (i + 1 === page ? 'step' : null)));
            expect(s.lines, id).toEqual([0, 1, 2, 3].map(i => i + 1 < page));
        });
    }
});

describe('lo stepper: l\'aspetto (FR-001, FR-002)', () => {
    const scale = (re: RegExp) => Number(/scale\(([\d.]+)\)/.exec(rule(re))?.[1] ?? 1);

    it('il cerchio corrente e\' piu\' grande degli altri', () => {
        expect(scale(/\.stepper-item\.active \.stepper-dot\s*\{([^}]*)\}/)).toBeGreaterThan(1.1);
    });
    it('il cerchio corrente ha un anello e un bagliore', () => {
        const dot = rule(/\.stepper-item\.active \.stepper-dot\s*\{([^}]*)\}/);
        expect(dot).toMatch(/box-shadow:\s*0 0 0 4px/);
        expect(dot).toMatch(/0 0 18px/);
    });
    it('i cerchi sono grandi 32px e la pagina corrente ha l\'etichetta in evidenza', () => {
        expect(rule(/\.stepper-dot\s*\{([^}]*)\}/)).toMatch(/width:\s*32px/);
        expect(rule(/\.stepper-item\.active\s*\{([^}]*)\}/)).toMatch(/font-weight:\s*600/);
    });
    it('la linea si riempie con una transizione, solo quando e\' fatta', () => {
        expect(rule(/\.stepper-line::after\s*\{([^}]*)\}/)).toMatch(/transform:\s*scaleX\(0\)/);
        expect(rule(/\.stepper-line::after\s*\{([^}]*)\}/)).toMatch(/transition:\s*transform/);
        expect(rule(/\.stepper-line\.done::after\s*\{([^}]*)\}/)).toMatch(/scaleX\(1\)/);
    });
    it('i passi fatti sono verdi e quelli da fare restano spenti', () => {
        expect(rule(/\.stepper-item\.done \.stepper-dot\s*\{([^}]*)\}/)).toMatch(/--color-success/);
        expect(rule(/\.stepper-dot\s*\{([^}]*)\}/)).toMatch(/border:\s*2px solid var\(--color-border\)/);
    });
    it('con prefers-reduced-motion le transizioni dello stepper si spengono', () => {
        const blocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)].map(m => m[1]!).join('\n');
        expect(blocks).toMatch(/\.stepper-dot[^{]*\{\s*transition:\s*none/);
    });
});
