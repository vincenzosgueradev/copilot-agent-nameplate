// @vitest-environment jsdom
/**
 * Spec 019 (blocco D) — elenchi ripiegabili con piu' di due agent, cerchio dello stepper che non si taglia,
 * storico con «Clear all». Oracolo scritto dalla spec (FR-015…FR-017).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot, type Driver, type UiWorld } from './helpers/ui-harness';
import { readSource } from './helpers/source';

afterEach(() => { vi.useRealTimers(); });

const worldOf = (n: number): UiWorld => ({
    solutions: [{ unique: 'S1' }],
    agents: Array.from({ length: n }, (_, i) => ({
        name: `agent${i + 1} [DEV]`, schema: `ava_a${i + 1}`, solution: 'S1', publish: null as boolean | null,
    })),
});

async function toSuffix(n: number, targets: string[] = ['UAT']) {
    const ui = await boot(worldOf(n));
    await ui.openSolution('S1');
    await ui.startRenameBare();
    for (const t of targets) await ui.tickTarget(t, true);
    return ui;
}

const head = (ui: Driver, i = 0) => ui.doc.querySelectorAll<HTMLButtonElement>('#target-list [data-agents-fold]')[i];
const body = (ui: Driver, i = 0) => ui.doc.querySelectorAll<HTMLElement>('#target-list .agents-body')[i];
const click = async (ui: Driver, el: Element) => { (el as HTMLElement).click(); await ui.tick(0); };

describe('elenco degli agent di un Target: si ripiega solo con piu\' di due agent (FR-015)', () => {
    for (const [n, expected] of [[1, false], [2, false], [3, true], [5, true]] as const) {
        it(`${n} agent: ${expected ? 'ha' : 'non ha'} l'intestazione che ripiega`, async () => {
            const ui = await toSuffix(n);
            expect(!!head(ui)).toBe(expected);
            expect(body(ui)).toBeTruthy();
            expect(body(ui).hidden).toBe(false);   // di partenza e' aperto
        });
    }

    it('il clic ripiega e riapre, aria-expanded segue, il conteggio dice quanti sono scelti', async () => {
        const ui = await toSuffix(4);
        expect(head(ui).getAttribute('aria-expanded')).toBe('true');
        expect(head(ui).textContent).toContain('4 of 4 selected');
        await click(ui, head(ui));
        expect(head(ui).getAttribute('aria-expanded')).toBe('false');
        expect(body(ui).hidden).toBe(true);
        expect(head(ui).getAttribute('aria-label')).toMatch(/^Expand/);
        await click(ui, head(ui));
        expect(head(ui).getAttribute('aria-expanded')).toBe('true');
        expect(body(ui).hidden).toBe(false);
    });

    it('ripiegato, il conteggio resta corretto dopo aver tolto un agent e riaperto', async () => {
        const ui = await toSuffix(4);
        await ui.toggleAgent('agent2 [DEV]');
        expect(head(ui).textContent).toContain('3 of 4 selected');
        await click(ui, head(ui));
        expect(head(ui).textContent).toContain('3 of 4 selected');
        await click(ui, head(ui));
        expect(ui.suffixRows().find(r => r.name === 'agent2 [DEV]')!.checked).toBe(false);
    });

    it('ogni Target ripiega per conto suo', async () => {
        const ui = await toSuffix(3, ['UAT', 'TEST']);
        const heads = ui.doc.querySelectorAll('#target-list [data-agents-fold]');
        expect(heads.length).toBe(2);
        await click(ui, head(ui, 0));
        expect(body(ui, 0).hidden).toBe(true);
        expect(body(ui, 1).hidden).toBe(false);
    });

    it('lo stato ripiegato resta quando la lista si ridisegna (cambio del publish del Target)', async () => {
        const ui = await toSuffix(3);
        await click(ui, head(ui));
        await ui.setTargetPublish('UAT', 'force-true');
        expect(body(ui).hidden).toBe(true);
    });

    it('negativo: il clic sull\'intestazione non cambia le scelte e non toglie il Target', async () => {
        const ui = await toSuffix(3);
        const before = ui.suffixRows();
        await click(ui, head(ui));
        await click(ui, head(ui));
        expect(ui.suffixRows()).toEqual(before);
        expect(ui.ticked()).toContain('UAT');
    });
});

describe('Collapse all / Expand all sui Target', () => {
    const btn = (ui: Driver, id: string) => ui.doc.querySelector<HTMLButtonElement>(`#${id}`);

    it('con piu\' di due agent ci sono, con due o meno no', async () => {
        expect(btn(await toSuffix(3), 'targets-collapse-btn')).toBeTruthy();
        expect(btn(await toSuffix(2), 'targets-collapse-btn')).toBeNull();
        expect(btn(await toSuffix(2), 'targets-expand-btn')).toBeNull();
    });

    it('Collapse all ripiega tutti i Target spuntati, Expand all li riapre', async () => {
        const ui = await toSuffix(3, ['UAT', 'TEST']);
        await click(ui, btn(ui, 'targets-collapse-btn')!);
        expect(body(ui, 0).hidden).toBe(true);
        expect(body(ui, 1).hidden).toBe(true);
        await click(ui, btn(ui, 'targets-expand-btn')!);
        expect(body(ui, 0).hidden).toBe(false);
        expect(body(ui, 1).hidden).toBe(false);
    });

    it('ogni bottone e\' spento quando non ha effetto', async () => {
        const ui = await toSuffix(3);
        expect(btn(ui, 'targets-expand-btn')!.disabled).toBe(true);
        expect(btn(ui, 'targets-collapse-btn')!.disabled).toBe(false);
        await click(ui, btn(ui, 'targets-collapse-btn')!);
        expect(btn(ui, 'targets-collapse-btn')!.disabled).toBe(true);
        expect(btn(ui, 'targets-expand-btn')!.disabled).toBe(false);
    });

    it('negativo: non cambia spunte, agent scelti o Target', async () => {
        const ui = await toSuffix(3, ['UAT', 'TEST']);
        const before = ui.suffixRows();
        await click(ui, btn(ui, 'targets-collapse-btn')!);
        await click(ui, btn(ui, 'targets-expand-btn')!);
        expect(ui.suffixRows()).toEqual(before);
        expect(ui.ticked()).toEqual(expect.arrayContaining(['UAT', 'TEST']));
    });
});

describe('Select all / Deselect all sui Target', () => {
    const btn = (ui: Driver, id: string) => ui.doc.querySelector<HTMLButtonElement>(`#${id}`)!;

    it('Select all spunta tutti i Target, Deselect all li toglie e Next si spegne', async () => {
        const ui = await toSuffix(2, ['UAT']);
        await click(ui, btn(ui, 'targets-select-all-btn'));
        expect(ui.ticked().length).toBe(ui.targetNames().length);
        expect(btn(ui, 'targets-select-all-btn').disabled).toBe(true);
        await click(ui, btn(ui, 'targets-deselect-all-btn'));
        expect(ui.ticked()).toEqual([]);
        expect(btn(ui, 'targets-deselect-all-btn').disabled).toBe(true);
        expect(ui.nextDisabled()).toBe(true);
    });

    it('negativo: non toglie e non aggiunge Target alla lista', async () => {
        const ui = await toSuffix(2);
        const names = ui.targetNames();
        await click(ui, btn(ui, 'targets-select-all-btn'));
        await click(ui, btn(ui, 'targets-deselect-all-btn'));
        expect(ui.targetNames()).toEqual(names);
    });
});

describe('Back disattivato mentre si esporta', () => {
    it('spento durante l\'export, acceso a export finito', async () => {
        const ui = await toSuffix(2);
        await ui.setRaise(false);   // senza il dialogo di conferma della versione
        await ui.next();
        await ui.buildPackageRaw();
        const back = () => ui.doc.querySelector<HTMLButtonElement>('#step-preview #back-btn')!;
        expect(back().disabled).toBe(true);
        await ui.tick(8000);
        expect(back().disabled).toBe(false);
    });
});

describe('agent dell\'anteprima: si ripiegano solo con piu\' di due agent (FR-015)', () => {
    async function preview(n: number) {
        const ui = await toSuffix(n);
        await ui.next();
        await ui.buildPackage();
        return ui;
    }
    const folds = (ui: Driver) => Array.from(ui.doc.querySelectorAll<HTMLButtonElement>('#step-preview [data-change-fold]'));
    const groups = (ui: Driver) => Array.from(ui.doc.querySelectorAll<HTMLElement>('#step-preview .change-group'));

    it('due agent: nessun pulsante; tre: uno per agent', async () => {
        expect(folds(await preview(2)).length).toBe(0);
        expect(folds(await preview(3)).length).toBe(3);
    });

    it('il clic nasconde le schede dell\'agent e il secondo clic le ripristina, rispettando la scheda scelta', async () => {
        const ui = await preview(3);
        const g = groups(ui)[0]!;
        const panes = () => Array.from(g.querySelectorAll<HTMLElement>('.change-pane'));
        expect(panes().filter(p => !p.hidden).map(p => p.dataset.pane)).toEqual(['diff']);
        await click(ui, folds(ui)[0]!);
        expect(g.classList.contains('is-folded')).toBe(true);
        expect(panes().every(p => p.hidden)).toBe(true);
        expect(folds(ui)[0]!.getAttribute('aria-expanded')).toBe('false');
        await click(ui, g.querySelector('[data-change-tab="table"]')!);   // cambiare scheda da chiuso non la apre
        expect(panes().every(p => p.hidden)).toBe(true);
        await click(ui, folds(ui)[0]!);
        expect(panes().filter(p => !p.hidden).map(p => p.dataset.pane)).toEqual(['table']);
    });

    it('lo stato ripiegato resta quando l\'anteprima si ridisegna (Split / Unified)', async () => {
        const ui = await preview(3);
        await click(ui, folds(ui)[0]!);
        await click(ui, ui.doc.querySelector('#step-preview [data-diff-mode="unified"]')!);
        const g = groups(ui)[0]!;
        expect(g.classList.contains('is-folded')).toBe(true);
        expect(g.querySelectorAll('.change-pane:not([hidden])').length).toBe(0);
        expect(folds(ui)[0]!.getAttribute('aria-expanded')).toBe('false');
        expect(groups(ui).slice(1).every(x => !x.classList.contains('is-folded'))).toBe(true);
    });

    it('negativo: ripiegare un agent non tocca gli altri', async () => {
        const ui = await preview(3);
        await click(ui, folds(ui)[1]!);
        expect(groups(ui).map(g => g.classList.contains('is-folded'))).toEqual([false, true, false]);
    });
});

describe('lo stepper non si taglia in alto (FR-016)', () => {
    const css = readSource('styles.css');
    const px = (re: RegExp) => Number(re.exec(css)?.[1]);

    it('il contenitore dello stepper lascia sopra piu\' spazio di quanto il cerchio sporge', () => {
        // Il cerchio da 32px scala 1.25: sporge di 4px; con anello 4px e bagliore 18px, 26px in tutto sopra e sotto.
        const stepper = /\.stepper \{[^}]*padding:\s*(\d+)px/.exec(css);
        const row = /\.step-header-row \{\s*padding-top:\s*(\d+)px/.exec(css);
        expect(stepper).toBeTruthy();
        expect(row).toBeTruthy();
        expect(px(/\.stepper \{[^}]*padding:\s*(\d+)px/) + px(/\.step-header-row \{\s*padding-top:\s*(\d+)px/)).toBeGreaterThanOrEqual(26);
    });
});

describe('storico: «Clear all» (FR-017)', () => {
    const record = (id: string, agents = 1) => ({
        id, solutionUniqueName: `Sol_${id}`, version: '1.0.0.1', suffix: 'UAT + TEST', status: 'ok',
        agents: Array.from({ length: agents }, (_, i) => ({ before: `a${i} [DEV]`, after: `a${i} [UAT]`, excluded: false })),
        artifactSetPath: `C:\\out\\${id}`, timestamp: new Date().toISOString(), exportMode: 'sync', exportSeconds: 1.2,
        files: [{ role: 'managed', sha256: 'abcdef0123456789' }],
    });

    async function openHistory(records: ReturnType<typeof record>[]) {
        const ui = await boot(worldOf(1));
        (ui.fs.settings as Map<string, unknown>).set('packagingHistory', records);
        await ui.clickSelector('#history-btn');
        await ui.tick(0);
        return ui;
    }
    const cards = (ui: Driver) => ui.doc.querySelectorAll('#history-body .rec').length;
    const clearBtn = (ui: Driver) => ui.doc.getElementById('history-clear-btn') as HTMLButtonElement | null;

    it('con voci mostra il conteggio e «Clear all»; senza voci nessuno dei due', async () => {
        const ui = await openHistory([record('a'), record('b')]);
        expect(ui.doc.getElementById('history-count')!.textContent).toBe('2 entries');
        expect(clearBtn(ui)).toBeTruthy();
        const empty = await openHistory([]);
        expect(clearBtn(empty)).toBeNull();
        expect(empty.doc.getElementById('history-count')).toBeNull();
    });

    it('una sola voce: «1 entry»', async () => {
        const ui = await openHistory([record('a')]);
        expect(ui.doc.getElementById('history-count')!.textContent).toBe('1 entry');
    });

    it('chiede conferma, e confermando svuota lo storico e mostra lo stato vuoto', async () => {
        const ui = await openHistory([record('a'), record('b'), record('c')]);
        await click(ui, clearBtn(ui)!);
        expect(ui.confirmText()).toContain('Clear all 3 entries');
        expect(ui.confirmText()).toContain('files on disk are not touched');
        await click(ui, ui.doc.getElementById('confirm-ok-btn')!);
        await ui.tick(0);
        expect(ui.history()).toEqual([]);
        expect(cards(ui)).toBe(0);
        expect(ui.doc.querySelector('#history-body')!.textContent).toContain('No packaging recorded yet');
    });

    it('negativo: annullando non si perde nulla', async () => {
        const ui = await openHistory([record('a'), record('b')]);
        await click(ui, clearBtn(ui)!);
        await click(ui, ui.doc.getElementById('confirm-cancel-btn')!);
        await ui.tick(0);
        expect(ui.history().length).toBe(2);
        expect(cards(ui)).toBe(2);
    });

    it('«Delete» toglie una sola voce e lascia le altre', async () => {
        const ui = await openHistory([record('a'), record('b')]);
        await click(ui, ui.doc.querySelector('[data-delete="a"]')!);
        await click(ui, ui.doc.getElementById('confirm-ok-btn')!);
        await ui.tick(0);
        expect((ui.history() as { id: string }[]).map(r => r.id)).toEqual(['b']);
    });

    it('i Target sono chip separati, e gli agent oltre due stanno in un elenco ripiegabile', async () => {
        const ui = await openHistory([record('a', 1), record('b', 4)]);
        const recs = Array.from(ui.doc.querySelectorAll<HTMLElement>('#history-body .rec'));
        const chipsOf = (r: HTMLElement) => Array.from(r.querySelectorAll('.rec-targets .chip')).map(c => c.textContent);
        expect(chipsOf(recs[0]!)).toEqual(['UAT', 'TEST']);
        const withFold = recs.filter(r => r.querySelector('details.rec-agents'));
        expect(withFold.length).toBe(1);
        expect(withFold[0]!.querySelector('details')!.hasAttribute('open')).toBe(false);
        expect(withFold[0]!.querySelector('summary')!.textContent).toContain('4 agents');
    });

    it('il testo del nome in storico non e\' HTML eseguibile', async () => {
        const evil = { ...record('x'), solutionUniqueName: '<img src=x onerror=alert(1)>' };
        const ui = await openHistory([evil]);
        expect(ui.doc.querySelector('#history-body img')).toBeNull();
    });
});
