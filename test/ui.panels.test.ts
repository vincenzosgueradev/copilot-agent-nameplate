// @vitest-environment jsdom
/**
 * Spec 019 (blocco B) — riquadri ripiegabili con un'icona info. Oracolo scritto dalla spec (FR-003…FR-006).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot, type Driver, type UiWorld } from './helpers/ui-harness';
import { readSource } from './helpers/source';

afterEach(() => { vi.useRealTimers(); });

const WORLD: UiWorld = {
    solutions: [{ unique: 'S1' }],
    agents: [{ name: 'agent1 [DEV]', schema: 'ava_a1', solution: 'S1', publish: null }],
};
const WORLD_EXTRA: UiWorld = { ...WORLD, extraFolders: ['workflows/', 'canvasapps/'] };

/** I riquadri decorati di ogni schermata, con l'id che hanno e il titolo. */
const SCREENS: { step: string; id: string; panels: [string, string][] }[] = [
    { step: 'suffix', id: 'step-suffix', panels: [['suffix-targets', 'Targets'], ['suffix-options', 'Options'], ['suffix-artifacts', 'Artifacts']] },
    { step: 'review', id: 'step-review', panels: [['review-rename', 'Rename'], ['review-options', 'Options']] },
    { step: 'preview', id: 'step-preview', panels: [['preview-changes', 'What gets changed'], ['preview-publish', 'Publish and channels']] },
    { step: 'verify', id: 'step-verify', panels: [['verify-contents', 'Package contents'], ['verify-checks', 'Checks']] },
    { step: 'result', id: 'step-result', panels: [['result-files', 'Files produced'], ['result-where', 'Where it is']] },
];

async function toStep(ui: Driver, step: string) {
    if (step === 'suffix') return;
    await ui.typeSuffix('UAT');
    await ui.next();
    if (step === 'review') return;
    await ui.buildPackage();
    if (step === 'preview') return;
    await ui.toVerify();
    if (step === 'verify') return;
    await ui.save();
}

async function open(step: string, world = WORLD) {
    const ui = await boot(world);
    await ui.openSolution('S1');
    await ui.startRename();
    await toStep(ui, step);
    return ui;
}

const panel = (ui: Driver, id: string) => ui.doc.querySelector<HTMLElement>(`.panel[data-panel="${id}"]`)!;
const toggle = (ui: Driver, id: string) => panel(ui, id).querySelector<HTMLButtonElement>(':scope > .panel-head > .panel-toggle')!;
const infoBtn = (ui: Driver, id: string) => panel(ui, id).querySelector<HTMLButtonElement>(':scope > .panel-head > .panel-info')!;
const bar = (ui: Driver, id: string) => panel(ui, id).querySelector<HTMLElement>(':scope > .panel-infobar')!;
const click = async (ui: Driver, el: Element) => { (el as HTMLElement).click(); await ui.tick(0); };

describe('ogni schermata ha i suoi riquadri decorati (FR-003, FR-005)', () => {
    for (const s of SCREENS) {
        it(`${s.step}: ${s.panels.map(p => p[1]).join(', ')}`, async () => {
            const ui = await open(s.step);
            const ids = Array.from(ui.doc.querySelectorAll(`#${s.id} .panel[data-panel]`)).map(p => (p as HTMLElement).dataset.panel);
            expect(ids).toEqual(s.panels.map(p => p[0]));
            for (const [id, title] of s.panels) {
                expect(toggle(ui, id), `chevron di ${id}`).not.toBeNull();
                expect(infoBtn(ui, id), `info di ${id}`).not.toBeNull();
                expect(bar(ui, id), `striscia di ${id}`).not.toBeNull();
                expect(panel(ui, id).querySelector('.panel-heading')!.textContent!.trim()).toBe(title);
                // un solo chevron e una sola info per riquadro
                expect(panel(ui, id).querySelectorAll('.panel-toggle').length).toBe(1);
                expect(panel(ui, id).querySelectorAll('.panel-info').length).toBe(1);
            }
        });
    }
    it('l\ elenco delle solution e lo storico non sono riquadri ripiegabili', async () => {
        const ui = await boot(WORLD);
        expect(ui.doc.querySelectorAll('#welcome-screen .panel-toggle, #step-solution .panel-toggle').length).toBe(0);
    });
});

describe('l ordine nell intestazione (FR-003, FR-005)', () => {
    it('il chevron e il primo elemento, l icona info viene dopo il titolo', async () => {
        const ui = await open('review');
        for (const id of ['review-rename', 'review-options']) {
            const head = panel(ui, id).querySelector<HTMLElement>(':scope > .panel-head')!;
            expect(head.firstElementChild, id).toBe(toggle(ui, id));
            const heading = head.querySelector('.panel-heading')!;
            expect(heading.compareDocumentPosition(infoBtn(ui, id)) & Node.DOCUMENT_POSITION_FOLLOWING, id).toBeTruthy();
            expect(toggle(ui, id).compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING, id).toBeTruthy();
        }
    });
    it('cio che sta a destra resta a destra: i controlli di Restore defaults stanno in panel-head-end', async () => {
        const ui = await open('suffix');
        expect(ui.doc.getElementById('target-restore-btn')!.closest('.panel-head-end')).not.toBeNull();
        expect(panel(ui, 'suffix-options').querySelectorAll('.panel-head-end').length, 'senza controlli a destra non c e nulla da spingere').toBe(0);
    });
});

describe('ripiegare e riaprire (FR-003, FR-006)', () => {
    it('il chevron ripiega il riquadro e un secondo clic lo riapre, con aria-expanded e l\ etichetta', async () => {
        const ui = await open('suffix');
        expect(panel(ui, 'suffix-targets').classList.contains('panel--collapsed')).toBe(false);
        expect(toggle(ui, 'suffix-targets').getAttribute('aria-expanded')).toBe('true');
        expect(toggle(ui, 'suffix-targets').getAttribute('aria-label')).toBe('Collapse Targets');
        await click(ui, toggle(ui, 'suffix-targets'));
        expect(panel(ui, 'suffix-targets').classList.contains('panel--collapsed')).toBe(true);
        expect(toggle(ui, 'suffix-targets').getAttribute('aria-expanded')).toBe('false');
        expect(toggle(ui, 'suffix-targets').getAttribute('aria-label')).toBe('Expand Targets');
        await click(ui, toggle(ui, 'suffix-targets'));
        expect(panel(ui, 'suffix-targets').classList.contains('panel--collapsed')).toBe(false);
        expect(toggle(ui, 'suffix-targets').getAttribute('aria-label')).toBe('Collapse Targets');
    });
    it('un clic sull\ intestazione ripiega come il chevron', async () => {
        const ui = await open('suffix');
        const head = panel(ui, 'suffix-options').querySelector<HTMLElement>(':scope > .panel-head')!;
        await click(ui, head);
        expect(panel(ui, 'suffix-options').classList.contains('panel--collapsed')).toBe(true);
        await click(ui, panel(ui, 'suffix-options').querySelector('.panel-heading')!);
        expect(panel(ui, 'suffix-options').classList.contains('panel--collapsed')).toBe(false);
    });
    it('un clic su un controllo dentro l\ intestazione non ripiega il riquadro (Restore defaults)', async () => {
        const ui = await open('suffix');
        await ui.removeTarget('UAT');
        await click(ui, ui.doc.getElementById('target-restore-btn')!);
        expect(panel(ui, 'suffix-targets').classList.contains('panel--collapsed')).toBe(false);
    });
    it('il selettore dei Target dentro l\ intestazione dei controlli non ripiega il riquadro', async () => {
        const ui = await boot(WORLD);
        await ui.openSolution('S1');
        await ui.startRenameBare();
        await ui.tickTarget('UAT', true);
        await ui.tickTarget('PROD', true);
        await ui.next();
        await ui.buildPackage();
        await ui.toVerify();
        const seg = ui.doc.querySelector<HTMLElement>('#step-verify [data-target-view]')!;
        await click(ui, seg);
        expect(panel(ui, 'verify-checks').classList.contains('panel--collapsed')).toBe(false);
    });
    it('il selettore dei Target compare solo con piu\' di un Target spuntato', async () => {
        for (const [targets, buttons] of [[['UAT'], 0], [['UAT', 'PROD'], 2]] as const) {
            const ui = await boot(WORLD);
            await ui.openSolution('S1');
            await ui.startRenameBare();
            for (const t of targets) await ui.tickTarget(t, true);
            await ui.next();
            await ui.buildPackage();
            await ui.toVerify();
            const found = ui.doc.querySelectorAll('#step-verify [data-target-view]').length;
            expect(found, `${targets.length} Target spuntati`).toBe(buttons);
        }
    });
    it('ripiegare non perde nulla: i controlli restano nella pagina con il loro stato', async () => {
        const ui = await open('suffix');
        const before = ui.suffixRows().map(r => r.checked);
        await click(ui, toggle(ui, 'suffix-targets'));
        expect(ui.doc.querySelector('#target-list')).not.toBeNull();
        expect(ui.suffixRows().map(r => r.checked)).toEqual(before);
        await click(ui, toggle(ui, 'suffix-targets'));
        expect(ui.suffixRows().map(r => r.checked)).toEqual(before);
    });
    it('ogni riquadro e\  indipendente dagli altri', async () => {
        const ui = await open('review');
        await click(ui, toggle(ui, 'review-rename'));
        expect(panel(ui, 'review-rename').classList.contains('panel--collapsed')).toBe(true);
        expect(panel(ui, 'review-options').classList.contains('panel--collapsed')).toBe(false);
    });
});

describe('lo stato si conserva tra le schermate (FR-004)', () => {
    it('ripiegato, e tornando sul passo e\  ancora ripiegato; riaperto, ancora riaperto', async () => {
        const ui = await open('suffix');
        await click(ui, toggle(ui, 'suffix-options'));
        await ui.next();
        await ui.back();
        expect(panel(ui, 'suffix-options').classList.contains('panel--collapsed')).toBe(true);
        expect(toggle(ui, 'suffix-options').getAttribute('aria-expanded')).toBe('false');
        await click(ui, toggle(ui, 'suffix-options'));
        await ui.next();
        await ui.back();
        expect(panel(ui, 'suffix-options').classList.contains('panel--collapsed')).toBe(false);
    });
    it('un riquadro riaperto dall\ utente non torna chiuso da solo (il «chiuso di partenza» vale una volta)', async () => {
        const ui = await open('suffix');
        expect(panel(ui, 'suffix-artifacts').classList.contains('panel--collapsed')).toBe(true);
        await click(ui, toggle(ui, 'suffix-artifacts'));
        await ui.next();
        await ui.back();
        expect(panel(ui, 'suffix-artifacts').classList.contains('panel--collapsed')).toBe(false);
    });
});

describe('quali riquadri partono ripiegati (FR-004)', () => {
    it('Artifacts: ripiegato; Targets e Options: aperti', async () => {
        const ui = await open('suffix');
        expect(panel(ui, 'suffix-artifacts').classList.contains('panel--collapsed')).toBe(true);
        expect(panel(ui, 'suffix-targets').classList.contains('panel--collapsed')).toBe(false);
        expect(panel(ui, 'suffix-options').classList.contains('panel--collapsed')).toBe(false);
    });
    it('Package contents: ripiegato senza componenti extra, aperto con componenti extra', async () => {
        const none = await open('verify');
        expect(panel(none, 'verify-contents').classList.contains('panel--collapsed')).toBe(true);
        expect(panel(none, 'verify-checks').classList.contains('panel--collapsed')).toBe(false);
        const extra = await open('verify', WORLD_EXTRA);
        expect(panel(extra, 'verify-contents').classList.contains('panel--collapsed')).toBe(false);
    });
    it('le altre schermate partono tutte aperte', async () => {
        for (const step of ['review', 'preview', 'result']) {
            const ui = await open(step);
            const closed = ui.doc.querySelectorAll(`#step-${step} .panel--collapsed`).length;
            expect(closed, step).toBe(0);
        }
    });
});

describe('l\'icona info (FR-005)', () => {
    it('apre la striscia con la spiegazione e il secondo clic la chiude', async () => {
        const ui = await open('suffix');
        expect(bar(ui, 'suffix-targets').hidden).toBe(true);
        expect(infoBtn(ui, 'suffix-targets').getAttribute('aria-expanded')).toBe('false');
        await click(ui, infoBtn(ui, 'suffix-targets'));
        expect(bar(ui, 'suffix-targets').hidden).toBe(false);
        expect(infoBtn(ui, 'suffix-targets').getAttribute('aria-expanded')).toBe('true');
        expect(bar(ui, 'suffix-targets').textContent).toContain('Each target is an environment you will import into');
        await click(ui, infoBtn(ui, 'suffix-targets'));
        expect(bar(ui, 'suffix-targets').hidden).toBe(true);
        expect(infoBtn(ui, 'suffix-targets').getAttribute('aria-expanded')).toBe('false');
    });
    it('l\ info non ripiega il riquadro, e il chevron non apre l\ info', async () => {
        const ui = await open('suffix');
        await click(ui, infoBtn(ui, 'suffix-targets'));
        expect(panel(ui, 'suffix-targets').classList.contains('panel--collapsed')).toBe(false);
        await click(ui, toggle(ui, 'suffix-targets'));
        expect(bar(ui, 'suffix-targets').hidden).toBe(false);
    });
    it('e\  collegata alla sua striscia: aria-controls, role note, etichetta col titolo', async () => {
        const ui = await open('review');
        const b = infoBtn(ui, 'review-rename');
        expect(b.getAttribute('aria-controls')).toBe('info-review-rename');
        expect(bar(ui, 'review-rename').id).toBe('info-review-rename');
        expect(bar(ui, 'review-rename').getAttribute('role')).toBe('note');
        expect(b.getAttribute('aria-label')).toBe('What is Rename?');
    });
    it('ogni riquadro ha una spiegazione di una o due frasi, diversa dalle altre', async () => {
        const seen = new Set<string>();
        for (const s of SCREENS) {
            const ui = await open(s.step);
            for (const [id] of s.panels) {
                const text = bar(ui, id).textContent!.trim();
                expect(text.length, id).toBeGreaterThan(40);
                expect(text.length, id).toBeLessThan(230);
                expect((text.match(/\./g) ?? []).length, `${id}: frasi`).toBeLessThanOrEqual(2);
                expect(seen.has(text), `${id} ripete una spiegazione`).toBe(false);
                seen.add(text);
            }
        }
    });
    it('la spiegazione e\  testo, mai HTML', async () => {
        const ui = await open('suffix');
        const b = bar(ui, 'suffix-targets');
        expect(b.querySelectorAll('b, i, img, script, a').length).toBe(0);
        expect(Array.from(b.children).map(c => c.tagName)).toEqual(['SPAN', 'SPAN']);
    });
    it('la striscia ripiegata sparisce con il riquadro e torna con lui', async () => {
        const ui = await open('suffix');
        await click(ui, infoBtn(ui, 'suffix-options'));
        await click(ui, toggle(ui, 'suffix-options'));
        expect(panel(ui, 'suffix-options').classList.contains('panel--collapsed')).toBe(true);
        await click(ui, toggle(ui, 'suffix-options'));
        expect(bar(ui, 'suffix-options').hidden).toBe(false);
    });
});

describe('il CSS dei riquadri (FR-003, FR-014)', () => {
    const css = readSource('styles.css');
    const rule = (re: RegExp) => re.exec(css)?.[1] ?? '';

    it('un riquadro ripiegato nasconde tutto tranne la sua intestazione', () => {
        expect(rule(/\.panel--collapsed > :not\(\.panel-head\)\s*\{([^}]*)\}/)).toMatch(/display:\s*none/);
        expect(rule(/\.panel--collapsed > \.panel-head\s*\{([^}]*)\}/)).toMatch(/border-bottom:\s*none/);
    });
    it('la striscia con l attributo hidden non si vede', () => {
        expect(rule(/\.panel-infobar\[hidden\]\s*\{([^}]*)\}/)).toMatch(/display:\s*none/);
    });
    it('il chevron ruota quando il riquadro e  chiuso', () => {
        expect(rule(/\.panel-toggle\[aria-expanded="false"\] \.icon\s*\{([^}]*)\}/)).toMatch(/rotate\(-90deg\)/);
    });
    it('l intestazione si legge da sinistra e si puo cliccare; i controlli stanno a destra', () => {
        const head = rule(/\.panel\[data-panel\] > \.panel-head\s*\{([^}]*)\}/);
        expect(head).toMatch(/justify-content:\s*flex-start/);
        expect(head).toMatch(/cursor:\s*pointer/);
        expect(rule(/\.panel-head-end\s*\{([^}]*)\}/)).toMatch(/margin-left:\s*auto/);
    });
    it('chevron e info hanno un bersaglio di almeno 26px e il focus visibile', () => {
        expect(rule(/\.panel-toggle,\s*\.panel-info\s*\{([^}]*)\}/)).toMatch(/width:\s*26px[\s\S]*height:\s*26px/);
        expect(css).toMatch(/\.panel-toggle:focus-visible/);
    });
    it('con prefers-reduced-motion le transizioni dei riquadri si spengono', () => {
        const blocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)].map(m => m[1]!).join('\n');
        expect(blocks).toMatch(/\.panel-toggle[^{]*\{\s*transition:\s*none/);
    });
});
