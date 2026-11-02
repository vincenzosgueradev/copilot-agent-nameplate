// @vitest-environment jsdom
/**
 * Spec 019 (blocco C) — il diff nell'anteprima: schede Diff / Table, Split / Unified, file veri.
 * Oracolo scritto dalla spec (FR-007…FR-013).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { boot, type Driver, type UiWorld } from './helpers/ui-harness';
import { readSource } from './helpers/source';

afterEach(() => { vi.useRealTimers(); });

const WORLD: UiWorld = {
    solutions: [{ unique: 'S1' }],
    agents: [
        { name: 'agent1 [DEV]', schema: 'ava_a1', solution: 'S1', publish: false },
        { name: 'agent2 [DEV]', schema: 'ava_a2', solution: 'S1', publish: null },
    ],
};

async function toPreview(world: UiWorld = WORLD, targets: string[] = ['UAT'], tweak?: (ui: Driver) => Promise<void>) {
    const ui = await boot(world);
    await ui.openSolution('S1');
    await ui.startRenameBare();
    for (const t of targets) await ui.tickTarget(t, true);
    for (const t of targets) await ui.setTargetPublish(t, 'force-true');
    if (tweak) await tweak(ui);
    await ui.next();
    await ui.buildPackage();
    return ui;
}

const group = (ui: Driver, schema: string) => ui.doc.querySelector<HTMLElement>(`#step-preview .change-group[data-group="agent:${schema}"]`)!;
const pane = (g: Element, which: 'diff' | 'table') => g.querySelector<HTMLElement>(`.change-pane[data-pane="${which}"]`)!;
const diffs = (g: Element) => Array.from(g.querySelectorAll<HTMLElement>('.diff'));
const diffOf = (g: Element, file: string) => diffs(g).find(d => d.dataset.file === file)!;
const text = (el: Element) => el.textContent!.replace(/\s+/g, ' ').trim();
const click = async (ui: Driver, el: Element) => { (el as HTMLElement).click(); await ui.tick(0); };

/** Le righe di un diff in due colonne: numero e testo di ogni lato, senza il segno. */
function sides(diff: Element) {
    return Array.from(diff.querySelectorAll('tbody tr.diff-row'))
        .filter(tr => !tr.classList.contains('diff-row--gap') && !tr.classList.contains('diff-row--more'))
        .map(tr => {
            const tds = Array.from(tr.querySelectorAll('td'));
            const body = (td: Element) => {
                const mark = td.querySelector('.diff-mark')?.textContent ?? '';
                return td.classList.contains('diff-code--empty') ? null : td.textContent!.slice(mark.length);
            };
            return {
                kind: tr.className.replace('diff-row diff-row--', ''),
                oldNo: tds[0]!.textContent!.trim() ? Number(tds[0]!.textContent) : null,
                oldText: body(tds[1]!),
                newNo: tds[2]!.textContent!.trim() ? Number(tds[2]!.textContent) : null,
                newText: body(tds[3]!),
            };
        });
}

/** I file di un zip prodotto dal tool, per nome del package. */
function zipFiles(ui: Driver, part: string): Record<string, string> {
    const entry = Object.entries(ui.written().zips).find(([path]) => path.includes(part));
    expect(entry, `zip ${part}`).toBeDefined();
    const files = unzipSync(entry![1]);
    return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strFromU8(v)]));
}

describe('schede e pannelli (FR-007)', () => {
    it('ogni agent ha le schede Diff (scelta) e Table, con i loro pannelli', async () => {
        const ui = await toPreview();
        for (const schema of ['ava_a1', 'ava_a2']) {
            const g = group(ui, schema);
            const tabs = Array.from(g.querySelectorAll<HTMLElement>('[data-change-tab]'));
            expect(tabs.map(t => t.textContent), schema).toEqual(['Diff', 'Table']);
            expect(tabs.map(t => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
            expect(tabs.map(t => t.classList.contains('is-active'))).toEqual([true, false]);
            expect(tabs.every(t => t.getAttribute('role') === 'tab')).toBe(true);
            expect(g.querySelector('.change-tabs')!.getAttribute('role')).toBe('tablist');
            expect([pane(g, 'diff').hidden, pane(g, 'table').hidden]).toEqual([false, true]);
            expect(pane(g, 'diff').getAttribute('role')).toBe('tabpanel');
        }
    });
    it('la scheda Table ha la tabella di prima, con i nomi e gli stati', async () => {
        const ui = await toPreview();
        const rows = Array.from(pane(group(ui, 'ava_a1'), 'table').querySelectorAll('tbody tr')).map(text);
        expect(rows.length).toBe(2);
        expect(rows[0]).toContain('Name');
        expect(rows[0]).toContain('agent1 [DEV]');
        expect(rows[0]).toContain('agent1 [UAT]');
        expect(rows[1]).toContain('Publish on import');
    });
    it('un clic su Table mostra la tabella e nasconde il diff; un clic su Diff li rimette', async () => {
        const ui = await toPreview();
        const g = group(ui, 'ava_a1');
        await click(ui, g.querySelector('[data-change-tab="table"]')!);
        expect([pane(g, 'diff').hidden, pane(g, 'table').hidden]).toEqual([true, false]);
        expect(Array.from(g.querySelectorAll('[data-change-tab]')).map(t => t.getAttribute('aria-selected'))).toEqual(['false', 'true']);
        await click(ui, g.querySelector('[data-change-tab="diff"]')!);
        expect([pane(g, 'diff').hidden, pane(g, 'table').hidden]).toEqual([false, true]);
    });
    it('la scheda scelta vale per quell\'agent e non per gli altri', async () => {
        const ui = await toPreview();
        await click(ui, group(ui, 'ava_a1').querySelector('[data-change-tab="table"]')!);
        expect(pane(group(ui, 'ava_a2'), 'diff').hidden).toBe(false);
        expect(pane(group(ui, 'ava_a2'), 'table').hidden).toBe(true);
    });
});

describe('il diff di ogni agent (FR-008, FR-009)', () => {
    it('un diff per ogni file modificato: bot.xml e configuration.json, in quest\'ordine', async () => {
        const ui = await toPreview();
        expect(diffs(group(ui, 'ava_a1')).map(d => d.dataset.file)).toEqual(['bots/ava_a1/bot.xml', 'bots/ava_a1/configuration.json']);
    });
    it('bot.xml: la riga del nome e\' rossa a sinistra e verde a destra, con DEV e UAT evidenziati', async () => {
        const ui = await toPreview();
        const d = diffOf(group(ui, 'ava_a1'), 'bots/ava_a1/bot.xml');
        expect([text(d.querySelector('.diff-add')!), text(d.querySelector('.diff-del')!)]).toEqual(['+1', '−1']);
        const changed = d.querySelector('.diff-row--changed')!;
        expect(text(changed.querySelector('.diff-code--old')!)).toContain('<name>agent1 [DEV]</name>');
        expect(text(changed.querySelector('.diff-code--new')!)).toContain('<name>agent1 [UAT]</name>');
        expect(Array.from(changed.querySelectorAll('mark.diff-hl')).map(m => m.textContent)).toEqual(['DEV', 'UAT']);
        expect(changed.querySelector('.diff-code--old mark')).not.toBeNull();
        expect(changed.querySelector('.diff-code--new mark')).not.toBeNull();
    });
    it('configuration.json: «false» diventa «true» con il tratto evidenziato', async () => {
        const ui = await toPreview();
        const d = diffOf(group(ui, 'ava_a1'), 'bots/ava_a1/configuration.json');
        const changed = d.querySelector('.diff-row--changed')!;
        expect(text(changed.querySelector('.diff-code--old')!)).toContain('"publishOnImport": false');
        expect(text(changed.querySelector('.diff-code--new')!)).toContain('"publishOnImport": true');
        expect(Array.from(changed.querySelectorAll('mark.diff-hl')).map(m => m.textContent)).toEqual(['false', 'true']);
    });
    it('un agent che non aveva publishOnImport lo vede aggiunto, e a sinistra non c\'e\'', async () => {
        const ui = await toPreview();
        const d = diffOf(group(ui, 'ava_a2'), 'bots/ava_a2/configuration.json');
        const rows = sides(d);
        expect(rows.some(r => r.newText?.includes('"publishOnImport": true'))).toBe(true);
        expect(rows.some(r => r.oldText?.includes('publishOnImport'))).toBe(false);
        expect(rows.some(r => r.kind === 'added')).toBe(true);
    });
    it('il contesto sono righe grigie con i numeri, e il resto e\' un salto', async () => {
        const ui = await toPreview();
        const d = diffOf(group(ui, 'ava_a1'), 'bots/ava_a1/bot.xml');
        const ctx = d.querySelectorAll('.diff-row--context');
        expect(ctx.length).toBeGreaterThanOrEqual(3);
        ctx.forEach(r => expect(r.querySelector('.diff-code--old, .diff-code--new')).toBeNull());
        expect(d.querySelectorAll('.diff-row--changed').length).toBe(1);
    });
    it('FR-009: ogni riga a destra e\' esattamente la riga del file dentro lo zip prodotto', async () => {
        const ui = await toPreview();
        await ui.toVerify();
        await ui.save();
        const saved = zipFiles(ui, '_managed_UAT');
        for (const schema of ['ava_a1', 'ava_a2']) {
            for (const d of diffs(group(ui, schema))) {
                const lines = saved[d.dataset.file!]!.replace(/\r\n/g, '\n').split('\n');
                for (const r of sides(d)) {
                    if (r.newNo !== null) expect(lines[r.newNo - 1], `${d.dataset.file} riga ${r.newNo}`).toBe(r.newText);
                }
            }
        }
    });
    it('FR-009: ogni riga a sinistra e\' esattamente la riga del file dell\'export originale', async () => {
        const ui = await toPreview(WORLD, ['UAT'], u => u.setKeepCopies(true));
        await ui.toVerify();
        await ui.save();
        const original = zipFiles(ui, 'source_managed');
        for (const schema of ['ava_a1', 'ava_a2']) {
            for (const d of diffs(group(ui, schema))) {
                const lines = original[d.dataset.file!]!.replace(/\r\n/g, '\n').split('\n');
                for (const r of sides(d)) {
                    if (r.oldNo !== null) expect(lines[r.oldNo - 1], `${d.dataset.file} riga ${r.oldNo}`).toBe(r.oldText);
                }
            }
        }
    });
});

describe('Split e Unified (FR-010)', () => {
    const modes = (ui: Driver) => ({
        split: ui.doc.querySelectorAll('#step-preview .diff--split').length,
        unified: ui.doc.querySelectorAll('#step-preview .diff--unified').length,
        pressed: Array.from(ui.doc.querySelectorAll('#step-preview [data-diff-mode]')).map(b => b.getAttribute('aria-pressed')),
        active: Array.from(ui.doc.querySelectorAll('#step-preview [data-diff-mode].active')).map(b => (b as HTMLElement).dataset.diffMode),
    });

    it('di partenza Split: due colonne, il pulsante Split premuto', async () => {
        const ui = await toPreview();
        expect(modes(ui)).toEqual({ split: 4, unified: 0, pressed: ['true', 'false'], active: ['split'] });
        expect(ui.doc.querySelectorAll('#step-preview .diff--split colgroup col').length).toBe(4 * 4);
    });
    it('Unified: una colonna di codice, tolte sopra e aggiunte sotto', async () => {
        const ui = await toPreview();
        await click(ui, ui.doc.querySelector('#step-preview [data-diff-mode="unified"]')!);
        expect(modes(ui)).toEqual({ split: 0, unified: 4, pressed: ['false', 'true'], active: ['unified'] });
        const d = diffOf(group(ui, 'ava_a1'), 'bots/ava_a1/bot.xml');
        const changed = Array.from(d.querySelectorAll('.diff-row--changed'));
        expect(changed.length).toBe(2);
        expect(changed[0]!.querySelector('.diff-code--old')).not.toBeNull();
        expect(changed[1]!.querySelector('.diff-code--new')).not.toBeNull();
        expect(Array.from(d.querySelectorAll('mark.diff-hl')).map(m => m.textContent)).toEqual(['DEV', 'UAT']);
    });
    it('un secondo clic su Split torna alle due colonne', async () => {
        const ui = await toPreview();
        await click(ui, ui.doc.querySelector('#step-preview [data-diff-mode="unified"]')!);
        await click(ui, ui.doc.querySelector('#step-preview [data-diff-mode="split"]')!);
        expect(modes(ui).split).toBe(4);
    });
    it('il modo vale per tutti gli agent e per tutti i Target', async () => {
        const ui = await toPreview(WORLD, ['UAT', 'PROD']);
        await click(ui, ui.doc.querySelector('#step-preview [data-diff-mode="unified"]')!);
        await ui.switchTo('[PROD]');
        expect(modes(ui).split).toBe(0);
        expect(modes(ui).unified).toBe(4);
    });
    it('cambiare modo conserva la scheda scelta per l\'agent', async () => {
        const ui = await toPreview();
        await click(ui, group(ui, 'ava_a1').querySelector('[data-change-tab="table"]')!);
        await click(ui, ui.doc.querySelector('#step-preview [data-diff-mode="unified"]')!);
        expect(pane(group(ui, 'ava_a1'), 'table').hidden).toBe(false);
        expect(pane(group(ui, 'ava_a1'), 'diff').hidden).toBe(true);
        expect(pane(group(ui, 'ava_a2'), 'diff').hidden).toBe(false);
    });
    it('i numeri e i nomi dei file sono gli stessi nei due modi', async () => {
        const ui = await toPreview();
        const files = () => diffs(group(ui, 'ava_a1')).map(d => d.dataset.file);
        const before = files();
        await click(ui, ui.doc.querySelector('#step-preview [data-diff-mode="unified"]')!);
        expect(files()).toEqual(before);
    });
});

describe('piu\' Target: il diff segue il Target mostrato (FR-013)', () => {
    it('con il selettore, il diff cambia con il Target e con i suoi agent', async () => {
        const ui = await toPreview(WORLD, ['UAT', 'PROD'], u => u.toggleAgent('agent2 [DEV]', 'PROD'));
        const uat = Array.from(ui.doc.querySelectorAll('#step-preview .change-group')).map(g => (g as HTMLElement).dataset.group);
        expect(uat).toEqual(['agent:ava_a1', 'agent:ava_a2']);
        expect(Array.from(ui.doc.querySelectorAll('#step-preview mark.diff-hl')).map(m => m.textContent)).toContain('UAT');
        await ui.switchTo('[PROD]');
        const prod = Array.from(ui.doc.querySelectorAll('#step-preview .change-group')).map(g => (g as HTMLElement).dataset.group);
        expect(prod, 'PROD non rinomina agent2').toEqual(['agent:ava_a1']);
        const marks = Array.from(ui.doc.querySelectorAll('#step-preview mark.diff-hl')).map(m => m.textContent);
        expect(marks).toContain('PROD');
        expect(marks).not.toContain('UAT');
    });
});

describe('senza cambio e contenuto non fidato (FR-012)', () => {
    it('un file che non cambia dice «This file does not change.» e non ha tabella', async () => {
        const world: UiWorld = { solutions: [{ unique: 'S1' }], agents: [{ name: 'x [UAT]', schema: 'ava_a1', solution: 'S1', publish: null }] };
        const ui = await boot(world);
        await ui.openSolution('S1');
        await ui.startRenameBare();
        await ui.tickTarget('UAT', true);
        await ui.next();
        await ui.buildPackage();
        const d = diffOf(group(ui, 'ava_a1'), 'bots/ava_a1/bot.xml');
        expect(text(d.querySelector('.diff-empty')!)).toBe('This file does not change.');
        expect(d.querySelector('table')).toBeNull();
        expect([text(d.querySelector('.diff-add')!), text(d.querySelector('.diff-del')!)]).toEqual(['+0', '−0']);
    });
    it('un nome di agent con HTML resta testo nel diff', async () => {
        const evil = '<img src=x onerror=alert(1)> & "q" [DEV]';
        const world: UiWorld = { solutions: [{ unique: 'S1' }], agents: [{ name: evil, schema: 'ava_a1', solution: 'S1', publish: null }] };
        const ui = await boot(world);
        await ui.openSolution('S1');
        await ui.startRenameBare();
        await ui.tickTarget('UAT', true);
        await ui.next();
        await ui.buildPackage();
        expect(ui.doc.querySelector('#step-preview img')).toBeNull();
        const d = diffOf(group(ui, 'ava_a1'), 'bots/ava_a1/bot.xml');
        expect(text(d)).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(d.querySelector('script, img, a')).toBeNull();
    });
});

describe('il riquadro «What gets changed» (FR-003, FR-007)', () => {
    it('resta un riquadro ripiegabile e la barra Split / Unified sta dentro', async () => {
        const ui = await toPreview();
        const panel = ui.doc.querySelector<HTMLElement>('#step-preview .panel[data-panel="preview-changes"]')!;
        expect(panel.querySelector('.panel-toggle')).not.toBeNull();
        expect(panel.querySelectorAll('[data-diff-mode]').length).toBe(2);
        expect(panel.querySelector('.diff-toolbar-label')!.textContent).toBe('Layout');
        expect(panel.querySelector('[data-diff-mode]')!.closest('.segmented')!.getAttribute('aria-label')).toBe('Diff layout');
    });
});

describe('il CSS del diff (FR-008, FR-011, FR-014)', () => {
    const css = readSource('styles.css');
    const rule = (re: RegExp) => re.exec(css)?.[1] ?? '';

    it('le righe tolte sono rosse e quelle aggiunte verdi, e il tratto evidenziato segue il colore', () => {
        expect(rule(/\.diff-code--old\s*\{([^}]*)\}/)).toMatch(/--diff-del-bg/);
        expect(rule(/\.diff-code--new\s*\{([^}]*)\}/)).toMatch(/--diff-add-bg/);
        expect(rule(/\.diff-code--old \.diff-hl\s*\{([^}]*)\}/)).toMatch(/--diff-del-hl/);
        expect(rule(/\.diff-code--new \.diff-hl\s*\{([^}]*)\}/)).toMatch(/--diff-add-hl/);
        expect(rule(/\.diff-code--old \.diff-mark\s*\{([^}]*)\}/)).toMatch(/--diff-del-fg/);
        expect(rule(/\.diff-code--new \.diff-mark\s*\{([^}]*)\}/)).toMatch(/--diff-add-fg/);
    });
    it('il codice non va a capo e una riga lunga si scorre dentro il suo riquadro (FR-011)', () => {
        expect(rule(/\.diff-code\s*\{([^}]*)\}/)).toMatch(/white-space:\s*pre/);
        expect(rule(/\.diff-scroll\s*\{([^}]*)\}/)).toMatch(/overflow-x:\s*auto/);
    });
    it('il pannello nascosto non si vede', () => {
        expect(rule(/\.change-pane\[hidden\]\s*\{([^}]*)\}/)).toMatch(/display:\s*none/);
    });
    it('i numeri di riga non si selezionano e hanno il loro fondo', () => {
        const no = rule(/\.diff-no\s*\{([^}]*)\}/);
        expect(no).toMatch(/user-select:\s*none/);
        expect(no).toMatch(/--diff-gutter/);
    });
    it('rosso e verde esistono nel tema scuro e nel tema chiaro, con valori diversi', () => {
        const dark = /:root \{([^}]*)\}/.exec(css)![1]!;
        const light = /:root\[data-theme="light"\] \{([^}]*)\}/.exec(css)![1]!;
        for (const v of ['--diff-del-bg', '--diff-del-hl', '--diff-del-fg', '--diff-add-bg', '--diff-add-hl', '--diff-add-fg', '--diff-gutter']) {
            const get = (b: string) => new RegExp(`${v}:\s*([^;]+);`).exec(b)?.[1]?.trim();
            expect(get(dark), `${v} scuro`).toBeDefined();
            expect(get(light), `${v} chiaro`).toBeDefined();
            expect(get(light), `${v} cambia col tema`).not.toBe(get(dark));
        }
    });
    it('le schede hanno lo stato attivo e il focus visibile', () => {
        expect(rule(/\.change-tab\.is-active\s*\{([^}]*)\}/)).toMatch(/background:\s*var\(--color-primary\)/);
        expect(css).toMatch(/\.change-tab:focus-visible/);
    });
});
