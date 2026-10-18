/**
 * Banco di prova della schermata.
 *
 * Carica la vera `index.html` in jsdom e importa l'app vera: si sostituiscono solo i confini
 * con il mondo esterno — Dataverse (elenco di agent e solution, export), il file system e le
 * API di PPTB. Tutto il resto, dal clic al package prodotto, e' il codice di produzione.
 *
 * Un file di test che lo usa deve avere `// @vitest-environment jsdom` in testa.
 */

import { vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import indexHtml from '../../src/index.html?raw';
import { makePackage } from './fixture';
import { installFakeDev, makeDev, type FakeDev } from './fake-dev';
import type { AgentListItem, PublishMode, Solution } from '../../src/types';

export interface UiAgent {
    name: string;
    schema: string;
    /** `uniqueName` della solution, o `null` per un agent senza solution. */
    solution: string | null;
    publish: boolean | null;
    connected?: boolean;
    /** Nome del componente GPT intero invece del nome base. */
    gptFull?: boolean;
    /** Valore grezzo di `bot.iconbase64` (spec 008). */
    icon?: string | null;
    modifiedOn?: string;
    /** Valore di `bot.template` (spec 010). Default: `default-2.1.0`. `null` = colonna vuota. */
    template?: string | null;
}

export interface UiSolution {
    unique: string;
    /** Nome visualizzato. Default: `Solution <unique>`. */
    friendly?: string;
    managed?: boolean;
    version?: string;
    /** Data di creazione ISO (spec 012: serve a ordinare). Default: 2026-10-10. */
    created?: string;
}

export interface UiWorld {
    solutions: UiSolution[];
    agents: UiAgent[];
}

const PUBLISH_BY_LABEL: Record<string, PublishMode> = {
    'Leave as is': 'keep', 'Force yes': 'force-true', 'Force no': 'force-false',
};
export const PUBLISH_LABEL: Record<PublishMode, string> = {
    'keep': 'Leave as is', 'force-true': 'Force yes', 'force-false': 'Force no',
};

/** Lascia girare le promesse in coda senza toccare i timer (che nei test sono finti). */
export async function flush(rounds = 80): Promise<void> {
    for (let i = 0; i < rounds; i++) await Promise.resolve();
}

function solutionFixture(s: UiSolution, world: UiWorld, dev?: FakeDev): Solution {
    return {
        solutionId: `sol-${s.unique}`, uniqueName: s.unique, friendlyName: s.friendly ?? `Solution ${s.unique}`,
        isManaged: s.managed === true, isVisible: true, publisherPrefix: 'ava', publisherName: 'Contoso',
        version: dev ? dev.versionOf(s.unique) : (s.version ?? '1.0.0.2'), createdOn: s.created ?? '2026-10-10T10:00:00Z',
        agentCount: world.agents.filter(a => a.solution === s.unique).length,
        exportable: s.managed !== true,
    };
}

export function fixtures(world: UiWorld, dev?: FakeDev): { agents: AgentListItem[]; solutions: Solution[] } {
    const solutions = world.solutions.map(s => solutionFixture(s, world, dev));
    const agents = world.agents.map(a => ({
        id: `bot-${a.schema}`, name: a.name, schemaName: a.schema,
        solution: solutions.find(s => s.uniqueName === a.solution) ?? null,
        isActive: true, createdOn: '2026-10-10T10:00:00Z', modifiedOn: a.modifiedOn ?? '2026-10-10T10:00:00Z',
        publishedOn: '2026-10-10T10:00:00Z',
    }));
    return { agents, solutions };
}

/** Il file system finto: quello che l'app scrive si rilegge da qui. */
export interface FakeFs {
    files: Map<string, string | Uint8Array>;
    dirs: Set<string>;
    settings: Map<string, unknown>;
}

export interface Driver {
    world: UiWorld;
    /** Il DEV finto: versioni, scritture, ordine delle chiamate. */
    dev: FakeDev;
    fs: FakeFs;
    doc: Document;
    /** Le letture dell'icona (spec 008): cosa e' stato chiesto, e come farle fallire. */
    cards: { bot: string[][]; failWith?: string };
    /** Icona mostrata per un agent nella schermata attuale. */
    cardOf(name: string): { img: string | null; generic: boolean } | null;
    /** La cella del tipo di agent nella schermata attuale (spec 010). */
    kindOf(name: string): { kind: string; label: string; title: string; hasLogo: boolean; hasMask: boolean; text: string } | null;
    // ── navigazione
    openSolution(unique: string): Promise<void>;
    startRename(): Promise<void>;
    next(): Promise<void>;
    back(): Promise<void>;
    crumb(label: string): Promise<void>;
    // ── step del suffisso
    typeSuffix(value: string): Promise<void>;
    clearSuffix(): Promise<void>;
    preset(name: string): Promise<void>;
    toggleAgent(name: string): Promise<void>;
    setPublish(name: string, mode: PublishMode): Promise<void>;
    setAll(mode: PublishMode): Promise<void>;
    /** L'opzione "Raise the version in DEV". */
    setRaise(on: boolean): Promise<void>;
    typeVersion(value: string): Promise<void>;
    raiseOn(): boolean;
    versionInput(): string;
    /** Il messaggio sotto il campo (vuoto = nessun problema). */
    versionIssue(): string;
    versionFieldVisible(): boolean;
    /** Il testo sotto l'opzione. */
    versionHint(): string;
    setKeepCopies(on: boolean): Promise<void>;
    suffixRows(): SuffixRow[];
    suffixInput(): string;
    /** Il valore acceso nel toggle "per tutti", o `null` se nessuno lo e'. */
    allActive(): PublishMode | null;
    nextDisabled(): boolean;
    // ── revisione, anteprima, verifica, salvataggio
    reviewRows(): ReviewRow[];
    buildPackage(): Promise<void>;
    /** Avvia la costruzione senza aspettarne la fine: per osservare le fasi una a una. */
    startBuild(): Promise<void>;
    /** Fa scorrere il tempo (finto) e lascia girare le promesse. */
    tick(ms: number): Promise<void>;
    /** Etichetta della fase che la schermata indica come in corso. */
    runningPhase(): string | null;
    previewText(): string;
    toVerify(): Promise<void>;
    verifyText(): string;
    /** Salva; ogni conferma che compare riceve `answerOk` (default: si). */
    save(answerOk?: boolean): Promise<{ confirmations: string[] }>;
    search(text: string): Promise<void>;
    clickChip(agentName: string): Promise<void>;
    exists(selector: string): boolean;
    clickSelector(selector: string): Promise<void>;
    written(): { manifest: Record<string, unknown> | null; zips: Record<string, Uint8Array> };
    history(): unknown[];
    text(step: string): string;
    step(): string;
}

export interface SuffixRow {
    name: string;
    checked: boolean;
    nameAfter: string;
    publish: PublishMode | null;     // null = nessun toggle (agent escluso)
}
export interface ReviewRow { agent: string; resulting: string; publish: PublishMode | null; length: string }

const STEP_IDS: Record<string, string> = {
    welcome: 'welcome-screen', solution: 'step-solution', suffix: 'step-suffix', review: 'step-review',
    preview: 'step-preview', verify: 'step-verify', result: 'step-result', history: 'step-history',
};

export async function boot(world: UiWorld, presetSettings?: Record<string, unknown>): Promise<Driver> {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });

    const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(indexHtml)?.[1] ?? '';
    document.body.innerHTML = body;
    (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};

    const fs: FakeFs = { files: new Map(), dirs: new Set(), settings: new Map(Object.entries(presetSettings ?? {})) };
    const g = globalThis as unknown as Record<string, unknown>;
    g.toolboxAPI = {
        connections: { getActiveConnection: async () => ({ name: 'DEV' }) },
        events: { on: () => {} },
        utils: { showNotification: () => {}, copyToClipboard: async () => {} },
        settings: {
            get: async (k: string) => fs.settings.get(k),
            set: async (k: string, v: unknown) => { fs.settings.set(k, v); },
        },
        fileSystem: {
            createDirectory: async (p: string) => { fs.dirs.add(p); },
            exists: async (p: string) => fs.dirs.has(p) || fs.files.has(p),
            selectPath: async () => '/out',
            writeText: async (p: string, c: string) => { fs.files.set(p, c); },
            writeBinary: async (p: string, c: Uint8Array) => { fs.files.set(p, c); },
            saveFile: async () => null,
        },
        terminal: { create: async () => ({ id: 't' }), execute: async () => {}, setVisibility: async () => {} },
    };
    const dev = makeDev(world.solutions.map(s => ({
        id: `sol-${s.unique}`, unique: s.unique, version: s.version ?? '1.0.0.2', managed: s.managed,
    })));
    g.dataverseAPI = {};
    installFakeDev(dev, g.dataverseAPI as object);
    const cards: Driver['cards'] = { bot: [] };
    (g.dataverseAPI as Record<string, unknown>).fetchXmlQuery = async (xml: string) => {
        const ids = Array.from(xml.matchAll(/<value>([^<]*)<\/value>/g)).map(m => m[1]!);
        const mine = world.agents.filter(a => ids.includes(`bot-${a.schema}`));
        if (/entity name="bot"/.test(xml)) {
            cards.bot.push(ids);
            if (cards.failWith) throw new Error(cards.failWith);
            return { value: mine.map(a => ({ botid: `bot-${a.schema}`, iconbase64: a.icon ?? null, modifiedon: a.modifiedOn ?? 'm', template: a.template === undefined ? 'default-2.1.0' : a.template })) };
        }
        throw new Error('query non prevista dal DEV finto');
    };

    vi.doMock('../../src/services/solutions', async () => {
        const actual = await vi.importActual<typeof import('../../src/services/solutions')>(
            '../../src/services/solutions');
        return {
            ...actual,
            // Le versioni sono quelle che DEV ha adesso: dopo un export sono salite
            fetchAgentsAndSolutions: async () => fixtures(world, dev),
            findSuffixVariable: async () => null,
        };
    });
    vi.doMock('../../src/services/export', () => ({
        exportPair: async (solutionName: string) => {
            dev.events.push(`export ${solutionName}`);
            const mine = world.agents.filter(a => a.solution === solutionName);
            const spec = (managed: boolean) => makePackage({
                uniqueName: solutionName, managed,
                // L'export porta la versione che DEV ha NEL MOMENTO in cui parte
                version: dev.versionOf(solutionName),
                agents: mine.map(a => ({
                    schema: a.schema, name: a.name, publishOnImport: a.publish,
                    connected: a.connected, gptName: a.gptFull ? a.name : undefined, topics: 1,
                })),
            });
            return {
                managed: { bytes: spec(true), mode: 'sync' as const, seconds: 0 },
                unmanaged: { bytes: spec(false), mode: 'sync' as const, seconds: 0 },
            };
        },
    }));

    await import('../../src/app');
    await flush();

    const doc = document;
    const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = doc) =>
        root.querySelector<T>(sel);
    const click = async (el: Element | null, what: string) => {
        if (!el) throw new Error(`elemento non trovato: ${what}`);
        (el as HTMLElement).click();
        await flush();
    };
    const visibleStep = (): string =>
        Object.entries(STEP_IDS).find(([, id]) => {
            const el = doc.getElementById(id);
            return el && el.style.display !== 'none';
        })?.[0] ?? '';
    const stepEl = (): HTMLElement => doc.getElementById(STEP_IDS[visibleStep()]!)!;
    const schemaOf = (name: string): string => {
        const a = world.agents.find(x => x.name === name);
        if (!a) throw new Error(`agent sconosciuto: ${name}`);
        return a.schema;
    };
    const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

    /** Avanza i timer finti e lascia girare le promesse: serve per l'attesa a fine export. */
    const settleTimers = async () => {
        for (let i = 0; i < 6; i++) {
            await vi.advanceTimersByTimeAsync(1000);
            await flush();
        }
    };

    const driver: Driver = {
        world, dev, fs, doc, cards,
        cardOf(name) {
            const id = `bot-${schemaOf(name)}`;
            const icon = stepEl().querySelector(`[data-card-icon="${id}"]`);
            if (!icon) return null;
            return {
                img: icon.querySelector('img')?.getAttribute('src') ?? null,
                generic: !icon.querySelector('img') && !!icon.querySelector('.icon'),
            };
        },
        kindOf(name) {
            const id = `bot-${schemaOf(name)}`;
            const cell = stepEl().querySelector<HTMLElement>(`[data-card-kind="${id}"]`);
            if (!cell) return null;
            return {
                kind: cell.dataset.kind ?? '', label: cell.getAttribute('aria-label') ?? '', title: cell.getAttribute('title') ?? '',
                hasLogo: !!cell.querySelector('img'), hasMask: !!cell.querySelector('.icon'), text: norm(cell.textContent),
            };
        },
        step: visibleStep,
        text: step => norm(doc.getElementById(STEP_IDS[step]!)?.textContent),

        async openSolution(unique) {
            await click($(`.data-row[data-solution="sol-${unique}"]`), `solution ${unique}`);
        },
        async startRename() { await click($('#rename-btn'), 'Set the suffix'); },
        async next() { await click($('#next-btn', stepEl()), 'Next'); },
        async back() { await click($('#back-btn', stepEl()), 'Back'); },
        async crumb(label) {
            const el = Array.from(doc.querySelectorAll('#breadcrumb a, #breadcrumb button, #breadcrumb [data-step]'))
                .find(e => norm(e.textContent) === label);
            await click(el ?? null, `crumb ${label}`);
        },

        async typeSuffix(value) {
            const input = $<HTMLInputElement>('#suffix-input')!;
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await flush();
        },
        async clearSuffix() { await click($('#clear-suffix-btn'), 'Clear'); },
        async preset(name) { await click($(`.chip-btn[data-preset="${name}"]`), `preset ${name}`); },
        async toggleAgent(name) {
            await click($(`#agent-list input[data-agent="bot-${schemaOf(name)}"]`), `checkbox ${name}`);
        },
        async setPublish(name, mode) {
            await click($(`#agent-list .toggle-btn[data-publish="${schemaOf(name)}"][data-val="${mode}"]`),
                `publish ${name} ${mode}`);
        },
        async setAll(mode) {
            await click($(`#agent-list .toggle-btn[data-publish-all="${mode}"]`), `all ${mode}`);
        },
        async setRaise(on) {
            const box = $<HTMLInputElement>('#opt-version')!;
            if (box.checked !== on) await click(box, 'raise the version');
        },
        async typeVersion(value) {
            const input = $<HTMLInputElement>('#version-input')!;
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await flush();
        },
        raiseOn: () => $<HTMLInputElement>('#opt-version')?.checked ?? false,
        versionInput: () => $<HTMLInputElement>('#version-input')?.value ?? '',
        versionIssue: () => norm($('#version-issue')?.textContent),
        versionFieldVisible: () => { const f = $('#version-field'); return !!f && !f.hasAttribute('hidden'); },
        versionHint: () => norm($('#version-hint')?.textContent),
        async setKeepCopies(on) {
            const box = $<HTMLInputElement>('#opt-keep')!;
            if (box.checked !== on) await click(box, 'keep copies');
        },
        allActive: () => {
            const on = $('#agent-list tfoot .toggle-btn.is-active');
            return on ? PUBLISH_BY_LABEL[norm(on.textContent)] ?? null : null;
        },
        suffixInput: () => $<HTMLInputElement>('#suffix-input')?.value ?? '',
        nextDisabled: () => $<HTMLButtonElement>('#next-btn', stepEl())?.disabled ?? true,
        suffixRows() {
            return Array.from(doc.querySelectorAll('#agent-list tbody tr')).map(tr => {
                const cells = Array.from(tr.querySelectorAll('td'));
                const active = tr.querySelector('.toggle-btn.is-active');
                return {
                    name: norm(cells[1]?.querySelector('.agent-name')?.textContent ?? cells[1]?.textContent),
                    checked: (tr.querySelector('input[type="checkbox"]') as HTMLInputElement).checked,
                    nameAfter: norm(cells[3]?.textContent),
                    publish: active ? PUBLISH_BY_LABEL[norm(active.textContent)] ?? null : null,
                };
            });
        },

        reviewRows() {
            return Array.from(doc.querySelectorAll('#step-review table tbody tr')).map(tr => {
                const cells = Array.from(tr.querySelectorAll('td'));
                return {
                    agent: norm(cells[0]?.textContent),
                    resulting: norm(cells[1]?.textContent),
                    publish: PUBLISH_BY_LABEL[norm(cells[2]?.textContent)] ?? null,
                    length: norm(cells[3]?.textContent),
                };
            });
        },
        async startBuild() { await click($('#next-btn', stepEl()), 'Build the package'); },
        async tick(ms) { await vi.advanceTimersByTimeAsync(ms); await flush(); },
        runningPhase: () => norm(doc.querySelector('#preview-progress .ph--running')?.textContent) || null,
        async buildPackage() {
            await click($('#next-btn', stepEl()), 'Build the package');
            await settleTimers();
        },
        previewText: () => norm(doc.getElementById('step-preview')?.textContent),
        async toVerify() { await click($('#to-verify-btn'), 'Checks'); },
        verifyText: () => norm(doc.getElementById('step-verify')?.textContent),

        async save(answerOk = true) {
            const seen: string[] = [];
            await click($('#save-btn'), 'Save the artifact set');
            // Ogni conferma che compare viene accettata e registrata
            for (let i = 0; i < 6; i++) {
                const overlay = doc.getElementById('confirm-overlay');
                if (overlay && overlay.style.display !== 'none') {
                    seen.push(norm(doc.getElementById('confirm-title')?.textContent));
                    await click($(answerOk ? '#confirm-ok-btn' : '#confirm-cancel-btn'), 'confirm');
                } else {
                    await settleTimers();
                    if (visibleStep() === 'result') break;
                }
            }
            return { confirmations: seen };
        },
        async search(text) {
            const input = $<HTMLInputElement>('#solution-search')!;
            input.value = text;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await flush();
        },
        async clickChip(agentName) {
            const a = world.agents.find(x => x.name === agentName);
            if (!a) throw new Error(`agent sconosciuto: ${agentName}`);
            await click($(`.match-chip[data-agent="bot-${a.schema}"]`), `chip ${agentName}`);
        },
        exists: selector => $(selector) !== null,
        async clickSelector(selector) { await click($(selector), selector); },
        written() {
            let manifest: Record<string, unknown> | null = null;
            const zips: Record<string, Uint8Array> = {};
            for (const [path, content] of fs.files) {
                if (path.endsWith('manifest.json') && typeof content === 'string') {
                    manifest = JSON.parse(content) as Record<string, unknown>;
                }
                if (path.endsWith('.zip') && typeof content !== 'string') zips[path] = content;
            }
            return { manifest, zips };
        },
        history: () => (fs.settings.get('packagingHistory') as unknown[] | undefined) ?? [],
    };
    return driver;
}

/** Legge il `<name>` e il publishOnImport di ogni agent di uno zip prodotto. */
export function readProduced(zip: Uint8Array): Record<string, { name: string; publish: boolean | null }> {
    const files = unzipSync(zip);
    const out: Record<string, { name: string; publish: boolean | null }> = {};
    for (const path of Object.keys(files)) {
        const m = /^bots\/([^/]+)\/bot\.xml$/.exec(path);
        if (!m) continue;
        const name = /<name>([^<]*)<\/name>/.exec(strFromU8(files[path]!))?.[1] ?? '';
        const cfgPath = path.replace(/bot\.xml$/, 'configuration.json');
        const cfg = files[cfgPath] ? JSON.parse(strFromU8(files[cfgPath]!)) as { publishOnImport?: boolean } : {};
        out[m[1]!] = {
            name: name.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
            publish: typeof cfg.publishOnImport === 'boolean' ? cfg.publishOnImport : null,
        };
    }
    return out;
}
