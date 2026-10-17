// @vitest-environment jsdom
/**
 * Test a modello della schermata.
 *
 * Per ogni percorso casuale (con seme fisso) di azioni dell'utente — digitare il suffisso,
 * scegliere un preset, svuotare, togliere la spunta a un agent, scegliere il publish di un agent,
 * applicarlo a tutti, attivare il bump — si tiene un MODELLO scritto dalla spec e dopo ogni azione
 * si confronta con quello che la pagina mostra davvero. In fondo il percorso prosegue fino al
 * salvataggio e si controlla che cosa e' finito nel manifest, nello storico e dentro lo zip.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { PublishMode } from '../src/types';
import { TEAMS_NAME_LIMIT } from '../src/types';
import { boot, PUBLISH_LABEL, readProduced, type Driver, type SuffixRow, type UiAgent } from './helpers/ui-harness';
import { rng } from './helpers/combinatorics';
import { distinctSuffixes, effectiveMode, expectedName, expectedPublish, expectedVersion } from './helpers/oracle';
import { FULL } from './helpers/mode';

afterEach(() => { vi.useRealTimers(); });

const MODES: PublishMode[] = ['keep', 'force-true', 'force-false'];
const VARIANTS = ['', ' [DEV]', ' [UAT]', ' [DEV] [X]'];
const PRESETS = ['DEV', 'TEST', 'UAT', 'STAGING', 'PREPROD', 'PROD'];
const TYPED = ['', 'UAT', '  PROD  ', 'A&B <1>', 'DEV', 'x'.repeat(20), 'q'];
const PUBLISH_START: (boolean | null)[] = [null, true, false];

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
    bump = false;
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
    changedEntries(): number {
        let n = 0;
        for (const a of this.chosen()) {
            if (this.after(a) !== a.name) n++;
            if (this.modeOf(a) !== 'keep' && this.publishAfter(a) !== a.publish) n++;
        }
        if (this.bump) n++;
        return n;
    }

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
    expect(ui.nextDisabled(), `${where}: Next disabilitato`).toBe(m.chosen().length === 0);
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
    async (ui, m) => { m.bump = !m.bump; await ui.setBump(m.bump); return `bump ${m.bump}`; },
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
    // il campo bump riflette il modello
    const hint = ui.doc.getElementById('version-hint')?.textContent ?? '';
    expect(hint.includes(expectedVersion('1.0.0.2', true)) || !m.bump, `${where()}: hint versione`).toBe(true);

    if (m.chosen().length === 0) return;

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
    // un blocco per agent selezionato, in ordine di nome finale, piu' la solution se c'e' il bump
    const sortedChosen = [...m.chosen()].sort((a, b) => m.after(a).localeCompare(m.after(b)));
    const groups = Array.from(ui.doc.querySelectorAll('#step-preview .change-group'));
    expect(groups.map(g => g.getAttribute('data-group')),
        `${where()}: blocchi dell'anteprima`)
        .toEqual([...sortedChosen.map(a => `agent:${a.schema}`), ...(m.bump ? ['solution'] : [])]);
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
    const mf = manifest as { suffix: string; options: { bumpVersion: boolean; publishByAgent?: Record<string, PublishMode> };
        agents: { schemaName: string; before: string; after: string; excluded: boolean }[]; confirmations: unknown[] };
    expect(mf.suffix, where()).toBe(m.suffix);
    expect(mf.options.bumpVersion, where()).toBe(m.bump);
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
    expect(solutionXml.includes(`<Version>${expectedVersion('1.0.0.2', m.bump)}</Version>`), `${where()}: versione nello zip`).toBe(true);

    const history = ui.history() as { agents: unknown[]; suffix: string }[];
    expect(history.length, `${where()}: voci di storico`).toBe(1);
    expect(history[0]!.suffix, where()).toBe(m.suffix);
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
describe('schermata: struttura della tabella degli agent', () => {
    it('le azioni globali stanno SOTTO la tabella, non nell\'intestazione', async () => {
        const rand = rng(1);
        const ui = await boot(worldOf(3, rand));
        await ui.openSolution('S1');
        await ui.startRename();
        const host = ui.doc.getElementById('agent-list')!;
        const table = host.querySelector('table')!;
        const foot = host.querySelector('.table-foot')!;
        expect(foot, 'barra delle azioni globali').not.toBeNull();
        expect(foot.querySelectorAll('[data-publish-all]').length).toBe(3);
        expect(table.querySelector('[data-publish-all]'), 'niente "all" nell\'intestazione').toBeNull();
        // ordine nel documento: la tabella precede la barra
        expect(table.compareDocumentPosition(foot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
