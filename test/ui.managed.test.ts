// @vitest-environment jsdom
/**
 * Spec 015 — guida sulle solution managed: nota sopra l'elenco, righe distinguibili, banner nella solution.
 *
 * L'oracolo e' scritto dalla spec (FR-003/FR-004), non letto dal codice: per ogni mondo (che tipo di
 * solution contiene l'ambiente) e ogni filtro (quale tipo si guarda), la tabella dice quale nota compare.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot, type UiWorld } from './helpers/ui-harness';

afterEach(() => { vi.useRealTimers(); });

type Filter = 'unmanaged' | 'managed' | 'all';
type Note = 'downstream' | 'managed-view' | null;
type Kind = 'only-managed' | 'only-unmanaged' | 'mixed';

const agent = (n: string, solution: string) =>
    ({ name: `${n} [DEV]`, schema: `ava_${n}`, solution, publish: null });

const WORLDS: Record<Kind, UiWorld> = {
    'only-managed': {
        solutions: [{ unique: 'M1', managed: true }, { unique: 'M2', managed: true }],
        agents: [agent('m1', 'M1'), agent('m2', 'M2')],
    },
    'only-unmanaged': {
        solutions: [{ unique: 'U1' }, { unique: 'U2' }],
        agents: [agent('u1', 'U1'), agent('u2', 'U2')],
    },
    'mixed': {
        solutions: [{ unique: 'U1' }, { unique: 'M1', managed: true }],
        agents: [agent('u1', 'U1'), agent('m1', 'M1')],
    },
};

/** Oracolo della spec: che nota compare, per mondo e filtro. */
const EXPECTED: Record<Kind, Record<Filter, Note>> = {
    'only-managed':   { unmanaged: null, managed: 'downstream',   all: 'downstream' },
    'only-unmanaged': { unmanaged: null, managed: null,           all: null },
    'mixed':          { unmanaged: null, managed: 'managed-view', all: null },
};

const note = (ui: { doc: Document }) => ui.doc.getElementById('solutions-notice')!;
const noteText = (ui: { doc: Document }) => note(ui).textContent!.replace(/\s+/g, ' ').trim();
const kindOf = (ui: { doc: Document }): Note => {
    if (note(ui).hidden) return null;
    const t = noteText(ui);
    if (t.includes('holds only')) return 'downstream';
    if (t.includes('under Unmanaged')) return 'managed-view';
    throw new Error(`nota non riconosciuta: ${t}`);
};
const row = (ui: { doc: Document }, unique: string) =>
    ui.doc.querySelector(`#solutions-table-container tr[data-solution="sol-${unique}"]`);

async function view(kind: Kind, filter: Filter, connection = 'DEV') {
    const ui = await boot(WORLDS[kind], undefined, connection);
    await ui.clickSelector(`#solution-type-filter [data-filter="${filter}"]`);
    return ui;
}

describe('nota sopra l\'elenco: mondo × filtro (FR-003, FR-004)', () => {
    for (const kind of Object.keys(WORLDS) as Kind[]) {
        for (const filter of ['unmanaged', 'managed', 'all'] as Filter[]) {
            it(`${kind}, filtro ${filter}: ${EXPECTED[kind][filter] ?? 'nessuna nota'}`, async () => {
                const ui = await view(kind, filter);
                expect(kindOf(ui)).toBe(EXPECTED[kind][filter]);
            });
        }
    }

    it('all\'avvio, senza scegliere nulla, un ambiente solo managed mostra la nota e l\'elenco managed', async () => {
        const ui = await boot(WORLDS['only-managed']);
        expect(kindOf(ui)).toBe('downstream');
        expect(row(ui, 'M1')).not.toBeNull();
    });

    it('la nota dice quale ambiente è connesso, e dove andare (FR-003)', async () => {
        const ui = await view('only-managed', 'managed', 'UAT');
        const t = noteText(ui);
        expect(t).toContain('UAT holds only managed solutions');
        expect(t).toContain('Open the tool in another tab');
        expect(t).toContain('usually DEV');
    });

    it('il nome dell\'ambiente è scritto come testo, non come HTML', async () => {
        const ui = await view('only-managed', 'managed', '<b>x</b>');
        expect(note(ui).querySelector('strong b')).toBeNull();
        expect(noteText(ui)).toContain('<b>x</b> holds only');
    });

    it('nota: la versione a valle ha titolo e due passi, quella del filtro Managed solo titolo e spiegazione', async () => {
        const down = await view('only-managed', 'managed', 'UAT');
        expect(note(down).querySelector('.note-title')!.textContent).toContain('UAT holds only managed solutions');
        expect(note(down).querySelectorAll('ol.note-steps li').length).toBe(2);
        const mixed = await view('mixed', 'managed');
        expect(note(mixed).querySelector('.note-title')!.textContent).toContain('cannot be the source of a package');
        expect(note(mixed).querySelector('ol')).toBeNull();
    });

    it('con unmanaged presenti, la nota del filtro Managed rimanda al filtro Unmanaged e non parla di DEV', async () => {
        const ui = await view('mixed', 'managed');
        expect(noteText(ui)).toContain('cannot be the source of a package');
        expect(noteText(ui)).not.toContain('Open the tool in another tab');
    });

    it('cambiando filtro la nota sparisce e ricompare', async () => {
        const ui = await view('only-managed', 'managed');
        expect(kindOf(ui)).toBe('downstream');
        await ui.clickSelector('#solution-type-filter [data-filter="unmanaged"]');
        expect(kindOf(ui)).toBeNull();
        expect(note(ui).innerHTML).toBe('');
        await ui.clickSelector('#solution-type-filter [data-filter="all"]');
        expect(kindOf(ui)).toBe('downstream');
    });
});

describe('righe managed nell\'elenco (FR-002)', () => {
    it('vista All: la riga managed è marcata e ha il tooltip, la unmanaged no', async () => {
        const ui = await view('mixed', 'all');
        expect(row(ui, 'M1')!.classList.contains('is-managed')).toBe(true);
        expect(row(ui, 'M1')!.getAttribute('title')).toContain('cannot be the source of a package');
        expect(row(ui, 'U1')!.classList.contains('is-managed')).toBe(false);
        expect(row(ui, 'U1')!.hasAttribute('title')).toBe(false);
    });

    it('vista Managed: il tooltip c\'è, ma non si spegne tutto l\'elenco', async () => {
        const ui = await view('mixed', 'managed');
        expect(row(ui, 'M1')!.getAttribute('title')).toContain('Managed');
        expect(row(ui, 'M1')!.classList.contains('is-managed')).toBe(false);
    });

    it('vista Unmanaged: nessuna riga ha tooltip o marcatura', async () => {
        const ui = await view('only-unmanaged', 'unmanaged');
        for (const u of ['U1', 'U2']) {
            expect(row(ui, u)!.hasAttribute('title')).toBe(false);
            expect(row(ui, u)!.classList.contains('is-managed')).toBe(false);
        }
    });

    it('la riga managed resta cliccabile: serve a vedere gli agent', async () => {
        const ui = await view('only-managed', 'managed');
        await ui.openSolution('M1');
        expect(ui.step()).toBe('solution');
    });
});

describe('banner nella solution managed (FR-001)', () => {
    it('nomina l\'ambiente, spiega che è normale e dice cosa fare', async () => {
        const ui = await boot(WORLDS['only-managed'], undefined, 'UAT');
        await ui.openSolution('M1');
        const t = ui.text('solution');
        expect(t).toContain('cannot be exported');
        expect(t).toContain('A managed solution in UAT is normal');
        expect(t).toContain('is what an import leaves behind');
        expect(t).toContain('Open the tool in another tab');
        expect(t).toContain('M1');
        expect(t).toContain('unmanaged');
        expect(t).toContain('Import the package here');
        expect(ui.exists('#rename-btn')).toBe(false);
    });

    it('il nome dell\'ambiente nel banner è testo, non HTML', async () => {
        const ui = await boot(WORLDS['only-managed'], undefined, '<b>x</b>');
        await ui.openSolution('M1');
        expect(ui.doc.querySelector('#step-solution .panel-note--warning b')).toBeNull();
        expect(ui.text('solution')).toContain('solution in <b>x</b> is normal');
    });

    it('banner: titolo, spiegazione e tre passi numerati (struttura)', async () => {
        const ui = await boot(WORLDS['only-managed'], undefined, 'UAT');
        await ui.openSolution('M1');
        const banner = ui.doc.querySelector('#step-solution .panel-note--warning')!;
        expect(banner.querySelector('.note-title')!.textContent).toContain('cannot be exported');
        expect(banner.querySelector('.note-label')!.textContent).toContain('To build a package');
        const steps = Array.from(banner.querySelectorAll('ol.note-steps li')).map(li => li.textContent!.replace(/\s+/g, ' ').trim());
        expect(steps.length).toBe(3);
        expect(steps[0]).toContain('M1');
        expect(steps[1]).toContain('Build the package there');
        expect(steps[2]).toContain('Import the package here');
    });

    it('una solution unmanaged non mostra il banner e offre il rename', async () => {
        const ui = await boot(WORLDS['only-unmanaged']);
        await ui.openSolution('U1');
        expect(ui.text('solution')).not.toContain('cannot be exported');
        expect(ui.exists('#rename-btn')).toBe(true);
    });
});
