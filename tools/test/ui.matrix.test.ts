// @vitest-environment jsdom
/**
 * Test a modello della schermata.
 *
 * Per ogni percorso casuale (con seme fisso) di azioni dell'utente — digitare il suffisso,
 * scegliere un preset, svuotare, togliere la spunta a un agent, scegliere il publish di un agent,
 * applicarlo a tutti, alzare o no la versione e scegliere quale — si tiene un MODELLO scritto dalla spec e dopo ogni azione
 * si confronta con quello che la pagina mostra davvero. In fondo il percorso prosegue fino al
 * salvataggio e si controlla che cosa e' finito nel manifest, nello storico e dentro lo zip.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { PublishMode } from '../src/types';
import { TEAMS_NAME_LIMIT } from '../src/types';
import { boot, PUBLISH_LABEL, readProduced, type Driver, type SuffixRow, type UiAgent } from './helpers/ui-harness';
import { rng } from './helpers/combinatorics';
import { distinctSuffixes, effectiveMode, expectedName, expectedPublish } from './helpers/oracle';
import { FULL } from './helpers/mode';

afterEach(() => { vi.useRealTimers(); });

const MODES: PublishMode[] = ['keep', 'force-true', 'force-false'];
const VARIANTS = ['', ' [DEV]', ' [UAT]', ' [DEV] [X]'];
const PRESETS = ['DEV', 'TEST', 'UAT', 'STAGING', 'PREPROD', 'PROD'];
const TYPED = ['', 'UAT', '  PROD  ', 'A&B <1>', 'DEV', 'x'.repeat(20), 'q'];
const PUBLISH_START: (boolean | null)[] = [null, true, false];

/** La versione che DEV ha all'inizio, e le cose che l'utente puo' scrivere nel campo. */
const START = '1.0.0.2';
const TYPED_VERSIONS = ['1.0.0.3', '1.0.0.2', '1.0.0.1', 'abc', '', '2.0.0.0', '1.0.0.10', ' 1.0.0.4 ', '1.0', '1.0.0.9'];
/** Oracolo del controllo: valida e strettamente piu' alta, confrontando segmenti riempiti a larghezza fissa. */
const vkey = (v: string) => v.trim().split('.').map(p => p.padStart(8, '0')).join('.');
const versionProblemOracle = (candidate: string, current: string): boolean =>
    !/^\d+\.\d+\.\d+\.\d+$/.test(candidate.trim()) || !(vkey(candidate) > vkey(current));

/** Un mondo con `n` agent dai nomi tutti diversi, in vari stati di partenza. */
function worldOf(n: number, rand: () => number) {
    const agents: UiAgent[] = Array.from({ length: n }, (_, i) => {
        const base = i % 3 === 0 ? `A & B <${i + 1}>` : `agent${i + 1}`;
        return {
            name: base + VARIANTS[Math.floor(rand() * VARIANTS.length)]!,
            schema: `ava_a${i + 1}`, solution: 'S1',
            publish: PUBLISH_START[Math.floor(rand() * 3)]!,
            connected: rand() < 0.7, gptFull: rand() < 0.4,
        };
    });
    return { solutions: [{ unique: 'S1', version: '1.0.0.2' }], agents };
}

/** Il modello: che cosa DEVE mostrare la schermata e produrre il package. */
class Model {
    suffix = '';
    /** "Raise the version in DEV": per default si, come nel pannello di export del portale. */
    raise = true;
    versionTouched = false;
    versionInput = '';
    keepCopies = false;
    excluded = new Set<string>();
    modes = new Map<string, PublishMode>();
    /** Come li mostra la schermata: ordinati per nome. */
    readonly agents: UiAgent[];
    constructor(unsorted: UiAgent[]) {
        this.agents = [...unsorted].sort((a, b) => a.name.localeCompare(b.name));
    }
    /** Come li scrive il package: per schemaname. */
    bySchema = () => [...this.agents].sort((a, b) => a.schema.localeCompare(b.schema));

    selected = (a: UiAgent) => !this.excluded.has(a.name);
    chosen = () => this.agents.filter(this.selected);
    modeOf = (a: UiAgent): PublishMode => this.modes.get(a.name) ?? 'keep';
    after = (a: UiAgent) => expectedName(a.name, this.suffix, this.selected(a));
    publishAfter = (a: UiAgent) => expectedPublish(a.publish, effectiveMode(this.modes.get(a.name), 'keep'), this.selected(a));
    mixed = () => distinctSuffixes(this.agents.map(a => ({ name: a.name, selected: this.selected(a) })), this.suffix).length > 1;

    /** Quanti entry cambiano davvero: nomi diversi + publishOnImport diversi + versione. */
    /** Quello che il campo mostra: la proposta (1.0.0.3) o quello che si e' scritto. */
    chosenVersion = () => (this.versionTouched ? this.versionInput : '1.0.0.3');
    /** C'e' un problema con la versione scelta? Solo se l'opzione e' attiva. */
    hasVersionIssue = () => this.raise && versionProblemOracle(this.chosenVersion(), START);
    /** La versione che finira' in DEV, o null. */
    newVersion = (): string | null => (this.raise && !this.hasVersionIssue() ? this.chosenVersion().trim() : null);
    canContinue = () => this.chosen().length > 0 && !this.hasVersionIssue();

    changedEntries(): number {
        let n = 0;
        for (const a of this.chosen()) {
            if (this.after(a) !== a.name) n++;
            if (this.modeOf(a) !== 'keep' && this.publishAfter(a) !== a.publish) n++;
        }
        return n;
    }

    /** Il valore comune degli agent spuntati, o null se sono misti o non ce n'e'. */
    commonMode = (): PublishMode | null => {
        const chosen = this.chosen();
        const first = chosen[0] ? this.modeOf(chosen[0]) : null;
        return first && chosen.every(a => this.modeOf(a) === first) ? first : null;
    };

    expectedRows(): SuffixRow[] {
        return this.agents.map(a => {
            const on = this.selected(a);
            const next = this.after(a);
            return {
                name: a.name, checked: on,
                nameAfter: on ? (next === a.name ? `${next} (unchanged)` : next) : 'left as it is',
                publish: on ? this.modeOf(a) : null,
            };
        });
    }
}

function assertSuffixStep(ui: Driver, m: Model, where: string): void {
    expect(ui.suffixRows(), `${where}: righe`).toEqual(m.expectedRows());
    expect(ui.nextDisabled(), `${where}: Next disabilitato`).toBe(!m.canContinue());
    // la versione: opzione, campo, messaggio e testo
    expect(ui.raiseOn(), `${where}: opzione versione`).toBe(m.raise);
    expect(ui.versionFieldVisible(), `${where}: campo versione visibile`).toBe(m.raise);
    expect(ui.versionInput(), `${where}: contenuto del campo versione`).toBe(m.chosenVersion());
    expect(ui.versionIssue() !== '', `${where}: messaggio sulla versione (${ui.versionIssue()})`).toBe(m.hasVersionIssue());
    const hint = ui.versionHint();
    if (m.hasVersionIssue()) {
        expect(hint, `${where}: testo con versione non valida`).toContain('Choose a valid new version');
    } else if (m.newVersion()) {
        expect(hint, `${where}: testo con versione`).toContain(`${START} → ${m.newVersion()}`);
        expect(hint, where).toContain('in DEV before the export');
    } else {
        expect(hint, `${where}: testo senza versione`).toContain(`${START} stays as it is in DEV`);
    }
    expect(ui.allActive(), `${where}: toggle "per tutti"`).toBe(m.commonMode());
    const panel = ui.doc.getElementById('agent-list')!.textContent ?? '';
    expect(panel.includes('different suffixes'), `${where}: avviso suffissi misti`).toBe(m.mixed());
    expect(panel.includes('Select at least one agent'), `${where}: avviso nessun agent`).toBe(m.chosen().length === 0);
    expect(ui.suffixInput(), `${where}: campo suffisso`).toBe(m.suffix);
}

type Action = (ui: Driver, m: Model, rand: () => number) => Promise<string>;
const ACTIONS: Action[] = [
    async (ui, m, r) => { const v = TYPED[Math.floor(r() * TYPED.length)]!; await ui.typeSuffix(v); m.suffix = v; return `type "${v}"`; },
    async (ui, m, r) => { const p = PRESETS[Math.floor(r() * PRESETS.length)]!; await ui.preset(p); m.suffix = p; return `preset ${p}`; },
    async (ui, m) => { await ui.clearSuffix(); m.suffix = ''; return 'clear'; },
    async (ui, m, r) => {
        const a = m.agents[Math.floor(r() * m.agents.length)]!;
        await ui.toggleAgent(a.name);
        if (m.excluded.has(a.name)) m.excluded.delete(a.name); else m.excluded.add(a.name);
        return `toggle ${a.name}`;
    },
    async (ui, m, r) => {
        const chosen = m.chosen();
        if (!chosen.length) return 'noop';
        const a = chosen[Math.floor(r() * chosen.length)]!;
        const mode = MODES[Math.floor(r() * 3)]!;
        await ui.setPublish(a.name, mode);
        m.modes.set(a.name, mode);
        return `publish ${a.name} ${mode}`;
    },
    async (ui, m, r) => {
        const mode = MODES[Math.floor(r() * 3)]!;
        await ui.setAll(mode);
        for (const a of m.chosen()) m.modes.set(a.name, mode);
        return `all ${mode}`;
    },
    async (ui, m) => { m.raise = !m.raise; await ui.setRaise(m.raise); return `raise ${m.raise}`; },
    async (ui, m, r) => {
        const v = TYPED_VERSIONS[Math.floor(r() * TYPED_VERSIONS.length)]!;
        // il campo si vede solo con l'opzione attiva: con l'opzione spenta si accende prima
        if (!m.raise) { m.raise = true; await ui.setRaise(true); }
        await ui.typeVersion(v);
        m.versionTouched = true;
        m.versionInput = v;
        return `version "${v}"`;
    },
];

async function walk(n: number, seed: number, steps: number, e2e: boolean): Promise<void> {
    const rand = rng(seed * 7919 + n);
    const world = worldOf(n, rand);
    const ui = await boot(world);
    const m = new Model(world.agents);
    const trace: string[] = [];
    const where = () => `n=${n} seed=${seed} dopo [${trace.join(' | ')}]`;

    await ui.openSolution('S1');
    await ui.startRename();
    assertSuffixStep(ui, m, `${where()} (inizio)`);

    for (let i = 0; i < steps; i++) {
        const act = ACTIONS[Math.floor(rand() * ACTIONS.length)]!;
        trace.push(await act(ui, m, rand));
        assertSuffixStep(ui, m, where());
    }
    // Con nessun agent o con una versione non valida Next e' spento: il percorso si ferma qui
    if (!m.canContinue()) return;

    // ── revisione
    await ui.next();
    expect(ui.step(), where()).toBe('review');
    expect(ui.reviewRows(), `${where()}: tabella di revisione`).toEqual(m.chosen().map(a => ({
        agent: `${a.name} ${a.schema}`,
        resulting: m.after(a),
        publish: m.modeOf(a),
        length: `${m.after(a).length} / ${TEAMS_NAME_LIMIT}`,
    })));
    const review = ui.text('review');
    for (const a of m.agents.filter(x => !m.selected(x))) {
        expect(review.includes(a.name), `${where()}: escluso ${a.name} citato in revisione`).toBe(true);
    }
    expect(review.includes('different suffixes'), `${where()}: suffissi misti in revisione`).toBe(m.mixed());

    // il passo indietro conserva tutto
    await ui.back();
    assertSuffixStep(ui, m, `${where()} (dopo Back)`);
    await ui.next();

    if (!e2e) return;

    // ── anteprima, verifica, salvataggio
    await ui.buildPackage();
    expect(ui.step(), `${where()}: anteprima`).toBe('preview');
    const preview = ui.previewText();
    for (const a of m.chosen()) {
        expect(preview.includes(m.after(a)), `${where()}: anteprima cita ${m.after(a)}`).toBe(true);
    }
    // un blocco per agent selezionato, in ordine di nome finale; la versione non e' un blocco
    const sortedChosen = [...m.chosen()].sort((a, b) => m.after(a).localeCompare(m.after(b)));
    const groups = Array.from(ui.doc.querySelectorAll('#step-preview .change-group'));
    expect(groups.map(g => g.getAttribute('data-group')),
        `${where()}: blocchi dell'anteprima`)
        .toEqual(sortedChosen.map(a => `agent:${a.schema}`));
    const note = ui.doc.getElementById('version-note');
    expect(note !== null, `${where()}: nota sulla versione`).toBe(m.newVersion() !== null);
    if (note) expect(note.textContent!.replace(/\s+/g, ' '), where()).toContain(`${START} → ${m.newVersion()}`);
    sortedChosen.forEach((a, i) => {
        const rows = Array.from(groups[i]!.querySelectorAll('tbody tr')).map(tr => tr.querySelector('td')!.textContent!.replace(/\s+/g, ' ').trim().split(' ')[0]);
        const publishChanges = m.modeOf(a) !== 'keep' && m.publishAfter(a) !== a.publish;
        expect(rows.length, `${where()}: righe del blocco ${a.schema}`).toBe(publishChanges ? 2 : 1);
        expect(groups[i]!.querySelector('.change-head')!.textContent, `${where()}: titolo del blocco`).toContain(m.after(a));
    });
    for (const a of m.agents.filter(x => !m.selected(x))) {
        expect(ui.doc.querySelector(`#step-preview [data-group="agent:${a.schema}"]`),
            `${where()}: l'escluso ${a.name} non ha un blocco`).toBeNull();
    }

    await ui.toVerify();
    expect(ui.step(), where()).toBe('verify');
    const changed = m.changedEntries();
    expect(ui.verifyText().includes(`with ${changed} ${changed === 1 ? 'entry' : 'entries'} changed`),
        `${where()}: banner "${changed} entry" in: ${ui.verifyText().slice(-200)}`).toBe(true);

    const saved = await ui.save();
    expect(saved.confirmations, `${where()}: conferme richieste`)
        .toEqual(m.mixed() ? ['The agents would have different suffixes'] : []);
    expect(ui.step(), `${where()}: risultato`).toBe('result');

    // ── che cosa e' stato scritto
    const { manifest, zips } = ui.written();
    expect(manifest, `${where()}: manifest`).not.toBeNull();
    const mf = manifest as { suffix: string; versionChange: { from: string; to: string; changed: boolean } | null;
        options: { newVersion: string | null; publishByAgent?: Record<string, PublishMode> };
        agents: { schemaName: string; before: string; after: string; excluded: boolean }[]; confirmations: unknown[] };
    expect(mf.suffix, where()).toBe(m.suffix);
    expect(mf.options.newVersion, `${where()}: versione nelle opzioni del manifest`).toBe(m.newVersion());
    expect(mf.versionChange, `${where()}: versionChange nel manifest`)
        .toEqual(m.newVersion() ? { from: START, to: m.newVersion(), changed: true } : null);
    const finalVersion = m.newVersion() ?? START;
    expect(ui.dev.versionOf('S1'), `${where()}: versione in DEV dopo il salvataggio`).toBe(finalVersion);
    expect(ui.dev.writes.map(w => w.version), `${where()}: scritture in DEV`).toEqual(m.newVersion() ? [m.newVersion()] : []);
    // la scrittura precede l'export, mai il contrario
    const exportAt = ui.dev.events.findIndex(e => e.startsWith('export'));
    const writeAt = ui.dev.events.findIndex(e => e.startsWith('write'));
    if (m.newVersion()) expect(writeAt, `${where()}: scrittura prima dell'export (${ui.dev.events.join(', ')})`).toBeLessThan(exportAt);
    expect(mf.agents, `${where()}: agenti nel manifest`).toEqual(m.bySchema().map(a => ({
        schemaName: a.schema, before: a.name, after: m.after(a), excluded: !m.selected(a),
    })));
    const explicit = Object.fromEntries(m.agents.filter(a => m.modes.has(a.name)).map(a => [a.schema, m.modes.get(a.name)!]));
    expect(mf.options.publishByAgent ?? {}, `${where()}: publishByAgent nel manifest`).toEqual(explicit);
    expect(mf.confirmations.length, `${where()}: conferme nel manifest`).toBe(m.mixed() ? 1 : 0);

    const managed = Object.entries(zips).filter(([p]) => p.includes('_managed_'));
    expect(managed.length, `${where()}: un solo archivio managed`).toBe(1);
    const produced = readProduced(managed[0]![1]);
    for (const a of m.agents) {
        expect(produced[a.schema], `${where()}: ${a.schema} nello zip`).toEqual({
            name: m.after(a), publish: m.publishAfter(a),
        });
    }
    const solutionXml = strFromU8(unzipSync(managed[0]![1])['solution.xml']!);
    expect(solutionXml.includes(`<Version>${finalVersion}</Version>`), `${where()}: versione nello zip`).toBe(true);

    const history = ui.history() as { agents: unknown[]; suffix: string; versionChange: unknown }[];
    expect(history.length, `${where()}: voci di storico`).toBe(1);
    expect(history[0]!.suffix, where()).toBe(m.suffix);
    expect(history[0]!.versionChange, `${where()}: versionChange nello storico`).toEqual(mf.versionChange);
    expect(history[0]!.agents, `${where()}: agenti nello storico`).toEqual(mf.agents);
}

describe('schermata: percorsi casuali contro il modello', () => {
    for (const n of [1, 2, 3, 4, 5]) {
        it(`${n} agent: solo suffisso e revisione`, async () => {
            const seeds = FULL ? 60 : 12;
            for (let seed = 1; seed <= seeds; seed++) await walk(n, seed, 25, false);
        });
        it(`${n} agent: fino al salvataggio`, async () => {
            const seeds = FULL ? 25 : 5;
            for (let seed = 100; seed < 100 + seeds; seed++) await walk(n, seed, 20, true);
        });
    }
});

// Il modo in cui il pannello e' fatto, perche' un layout storto e' un difetto come un altro
describe('toggle "per tutti": si accende quando i valori sono tutti uguali', () => {
    const three = () => ({
        solutions: [{ unique: 'S1' }],
        agents: ['a', 'b', 'c'].map((n, i) => ({ name: `${n} [DEV]`, schema: `ava_${n}`, solution: 'S1', publish: i === 0 ? true : null })),
    });
    it('parte su "Leave as is" perche\' tutti i toggle di riga lo sono', async () => {
        const ui = await boot(three());
        await ui.openSolution('S1');
        await ui.startRename();
        expect(ui.allActive()).toBe('keep');
    });
    it('un clic lo accende e lo tiene acceso, e accende ogni riga', async () => {
        const ui = await boot(three());
        await ui.openSolution('S1');
        await ui.startRename();
        await ui.setAll('force-true');
        expect(ui.allActive()).toBe('force-true');
        expect(ui.suffixRows().map(r => r.publish)).toEqual(['force-true', 'force-true', 'force-true']);
        await ui.setAll('force-false');
        expect(ui.allActive()).toBe('force-false');
    });
    it('si spegne se una riga diverge e si riaccende quando tornano uguali', async () => {
        const ui = await boot(three());
        await ui.openSolution('S1');
        await ui.startRename();
        await ui.setAll('force-true');
        await ui.setPublish('b [DEV]', 'keep');
        expect(ui.allActive()).toBeNull();
        await ui.setPublish('b [DEV]', 'force-true');
        expect(ui.allActive()).toBe('force-true');
    });
    it('conta solo gli agent spuntati: un escluso non lo spegne', async () => {
        const ui = await boot(three());
        await ui.openSolution('S1');
        await ui.startRename();
        await ui.setPublish('c [DEV]', 'force-false');
        expect(ui.allActive()).toBeNull();
        await ui.toggleAgent('c [DEV]');                 // c esce: restano a, b entrambi "keep"
        expect(ui.allActive()).toBe('keep');
        await ui.setAll('force-true');                   // tocca solo a e b
        await ui.toggleAgent('c [DEV]');                 // c rientra con il suo force-false
        expect(ui.allActive()).toBeNull();
    });
    it('senza agent spuntati non e\' acceso', async () => {
        const ui = await boot(three());
        await ui.openSolution('S1');
        await ui.startRename();
        for (const r of ui.suffixRows()) await ui.toggleAgent(r.name);
        expect(ui.allActive()).toBeNull();
    });
});

describe('schermata: struttura della tabella degli agent', () => {
    it('le azioni globali stanno nel piede della tabella, non nell\'intestazione', async () => {
        const ui = await boot(worldOf(3, rng(1)));
        await ui.openSolution('S1');
        await ui.startRename();
        const table = ui.doc.querySelector('#agent-list table')!;
        const foot = table.querySelector('tfoot')!;
        expect(foot, 'piede della tabella').not.toBeNull();
        expect(foot.querySelectorAll('[data-publish-all]').length).toBe(3);
        expect(table.querySelector('thead [data-publish-all]'), 'niente "all" nell\'intestazione').toBeNull();
        expect(table.querySelector('tbody [data-publish-all]')).toBeNull();
        // il piede segue il corpo
        expect(table.querySelector('tbody')!.compareDocumentPosition(foot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    it('il toggle "per tutti" sta nella STESSA colonna dei toggle di riga, con gli stessi pulsanti', async () => {
        const ui = await boot(worldOf(3, rng(1)));
        await ui.openSolution('S1');
        await ui.startRename();
        const table = ui.doc.querySelector('#agent-list table')!;
        // colonna del toggle di riga: la quarta; nel piede la prima cella copre le prime tre
        const rowCell = table.querySelector('tbody tr td:nth-child(4)')!;
        const footCells = Array.from(table.querySelectorAll('tfoot tr td'));
        expect(footCells.length).toBe(2);
        expect(footCells[0]!.getAttribute('colspan')).toBe('3');
        const footCell = footCells[1]!;
        const cols = (c: Element) => Array.from(c.querySelectorAll('.toggle-btn')).map(b => b.textContent?.trim());
        expect(cols(footCell)).toEqual(cols(rowCell));
        expect(footCell.querySelector('.toggle-group')!.className).toBe(rowCell.querySelector('.toggle-group')!.className);
        // e la tabella ha un layout fisso: le colonne sono le stesse in ogni riga
        expect(table.classList.contains('data-table--fill')).toBe(true);
    });
    it('la tabella usa tutta la larghezza: layout fisso e colonne definite', async () => {
        const ui = await boot(worldOf(2, rng(2)));
        await ui.openSolution('S1');
        await ui.startRename();
        const table = ui.doc.querySelector('#agent-list table')!;
        expect(table.classList.contains('data-table--fill')).toBe(true);
        expect(table.querySelectorAll('colgroup col').length).toBe(4);
    });
    it('il nome risultante non va a capo', async () => {
        const ui = await boot(worldOf(2, rng(3)));
        await ui.openSolution('S1');
        await ui.startRename();
        await ui.next();
        const cells = ui.doc.querySelectorAll('#step-review tbody tr td:nth-child(2)');
        expect(cells.length).toBe(2);
        cells.forEach(c => expect(c.classList.contains('cell-nowrap')).toBe(true));
    });
    it('ogni toggle ha esattamente un valore attivo', async () => {
        const ui = await boot(worldOf(4, rng(4)));
        await ui.openSolution('S1');
        await ui.startRename();
        ui.doc.querySelectorAll('#agent-list tbody tr').forEach(tr => {
            expect(tr.querySelectorAll('.toggle-btn.is-active').length).toBe(1);
        });
        // etichette complete, mai abbreviazioni
        const labels = Array.from(ui.doc.querySelectorAll('#agent-list tbody tr:first-child .toggle-btn')).map(b => b.textContent?.trim());
        expect(labels).toEqual(Object.values(PUBLISH_LABEL));
    });
});
