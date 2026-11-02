/// <reference types="@pptb/types" />

import { attachLog, clearLog, getEntries, log, toCsv, toJson } from './services/log';
import {
    fetchAgentsAndSolutions,
    findSuffixVariable,
    isSystemSolution,
    type FetchedData,
    type SuffixVariableHint,
} from './services/solutions';
import { OverwriteDeclined, buildHistoryRecord, writeArtifactSet } from './services/artifacts';
import { describeError } from './services/dataverse';
import { openFolder, saveJsonFile, saveTextFile, selectFolder } from './services/files';
import { addRecord, deleteRecord, readHistory } from './services/history';
import { askConfirm } from './services/ui';
import { loadAgentCards } from './services/agentCards';
import { MAX_PINS, pinFirst, readPins, setPinned } from './services/pins';
import { runPackagingTargets, targetView, type MultiPackagingResult, type PackagingResult } from './services/packaging';
import {
    addTarget, moveTarget, readSelection, readTargets, removeTarget, renameTarget,
    isProductionTarget, missingPresets, needsNoSuffixWarning, restoreDefaults, saveSelection, saveTargets,
    setTargetProduction, setTargetPublish, validateTargetName,
} from './services/targets';
import { agentOutcomes, buildName } from './services/patch';
import { nextVersion, versionProblem } from './services/solutionVersion';
import { relevantDrift } from './services/compat';
import { splitSuffix } from './services/package';
import { icon, type IconName } from './icons';
import {
    DEFAULT_OPTIONS,
    SUFFIX_MAX,
    TEAMS_NAME_LIMIT,
    type AgentCard,
    type AgentKind,
    type AgentListItem,
    type ArtifactSet,
    type NameOccurrence,
    type PackageComponent,
    type PackagingOptions,
    type PatchChange,
    type PublishMode,
    type Solution,
    type Target,
    type TargetRun,
    type VerificationResult,
} from './types';


const toolbox = globalThis.toolboxAPI;

// ── State ────────────────────────────────────────────────────────────────────
type AppStep = 'welcome' | 'solution' | 'suffix' | 'review' | 'preview' | 'verify' | 'result' | 'history';

const state = {
    connectionName: '',
    /** URL dell'environment della connessione attiva: il dialog di scrittura lo nomina (policy §7). */
    connectionUrl: '',
    solutions: [] as Solution[],
    /** Nomi univoci delle solution fissate in questo ambiente (spec 012). */
    pins: [] as string[],
    activeSolution: null as Solution | null,
    browsingSolutionId: null as string | null,
    searchQuery: '',
    // null = not chosen yet, so the type is picked from what the environment holds
    solutionFilter: null as SolutionFilter | null,
    sortColumn: 'agents' as SortColumn,
    sortDir: 'desc' as 'asc' | 'desc',
    isLoading: false,
    currentStep: 'welcome' as AppStep,
    // Packaging
    /** I Target dell'ambiente (spec 016): la lista che l'utente compone e il tool ricorda. */
    targets: [] as Target[],
    /** `true` quando la lista di questa connessione e' stata letta. */
    targetsReady: false,
    /** Nomi dei Target spuntati per la solution aperta (D3). Il nome e' il suffisso: vuoto = nessun suffisso. */
    selectedTargets: [] as string[],
    /** Il Target di cui le schermate mostrano i nomi: uno dei spuntati. */
    activeTargetName: '',
    /** `uniqueName` della solution a cui si riferiscono le spunte lette. */
    selectionFor: '',
    /** Perche' l'ultima modifica alla lista non e' valida o non e' stata salvata. */
    targetNotice: '',
    options: { ...DEFAULT_OPTIONS } as PackagingOptions,
    /**
     * Versione della solution in DEV all'inizio dell'operazione. Resta fissa per tutta l'operazione:
     * dopo un export DEV e' gia' piu' alta, e senza questo la proposta scivolerebbe al numero dopo
     * a ogni giro indietro-avanti (FR-073b).
     */
    versionFrom: '',
    /** Alzare la versione in DEV prima dell'export: per default si', come nel pannello di export del portale. */
    raiseVersion: true,
    /** Quello che l'utente ha scritto nel campo; conta solo se `versionTouched`. */
    versionInput: '',
    versionTouched: false,
    /** Esito dell'ultimo packaging preparato, tenuto in memoria finché non viene salvato. */
    packaging: null as MultiPackagingResult | null,
    /** Da cosa è stato generato: se non cambia, non si riesporta (l'export costa 13-110 s). */
    packagingKey: '',
    /** Artifact set appena scritto su disco. */
    lastSet: null as ArtifactSet | null,
    /** Conferme esplicite date in questa sessione, finiscono nel manifest. */
    confirmations: [] as { what: string; confirmedAt: string }[],
    // Agents
    agents: [] as AgentListItem[],           // ALL agents in the environment
    /**
     * Per Target (chiave = nome del Target), gli agent della solution aperta che l'utente ha escluso
     * dal rename (FR-023, FR-076, spec 016 D8). Si tiene l'esclusione, non la selezione: il default
     * e' "tutti", cosi' un agent nuovo comparso in DEV viene rinominato insieme agli altri invece di
     * restare indietro.
     */
    excludedByTarget: new Map<string, Set<string>>(),
    /** Per Target, le eccezioni di publish on import per agent (`schemaName`): battono il default del Target (D7, D8). */
    publishByTarget: new Map<string, Record<string, PublishMode>>(),
    /** Icona e descrizione gia' lette, per agent (spec 008): solo da mostrare, mai nel package. */
    cards: new Map<string, AgentCard>(),
    /** Agent trovato dalla ricerca: evidenziato nella vista della sua solution (FR-023b). */
    highlightAgentId: '',
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const els = {
    connectionBadge: document.getElementById('connection-badge')!,
    connectionName: document.getElementById('connection-name')!,
    appVersion: document.getElementById('app-version')!,
    refreshBtn: document.getElementById('refresh-solutions-btn') as HTMLButtonElement,
    welcomeScreen: document.getElementById('welcome-screen')!,
    breadcrumb: document.getElementById('breadcrumb')!,
    stepSolution: document.getElementById('step-solution')!,
    stepSuffix: document.getElementById('step-suffix')!,
    stepReview: document.getElementById('step-review')!,
    stepPreview: document.getElementById('step-preview')!,
    stepVerify: document.getElementById('step-verify')!,
    stepResult: document.getElementById('step-result')!,
    stepHistory: document.getElementById('step-history')!,
    historyBtn: document.getElementById('history-btn') as HTMLButtonElement,
    logEntries: document.getElementById('log-entries')!,
    clearLogBtn: document.getElementById('clear-log-btn') as HTMLButtonElement,
    exportLogBtn: document.getElementById('export-log-btn') as HTMLButtonElement,
    confirmOverlay: document.getElementById('confirm-overlay')!,
    confirmTitle: document.getElementById('confirm-title')!,
    confirmBody: document.getElementById('confirm-body')!,
    confirmOkBtn: document.getElementById('confirm-ok-btn') as HTMLButtonElement,
    confirmCancelBtn: document.getElementById('confirm-cancel-btn') as HTMLButtonElement,
};

// ── Logging ──────────────────────────────────────────────────────────────────
function escapeHtml(s: string): string {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Connection ─────────────────────────────────────────────────────────────────
function setConnectionBadge(name: string, status: 'connected' | 'loading' | 'error'): void {
    els.connectionBadge.className = `connection-badge connection-badge--${status}`;
    els.connectionName.textContent = name;
}

async function initConnection(): Promise<void> {
    setConnectionBadge('Connecting...', 'loading');
    try {
        const conn = await toolbox.connections.getActiveConnection();
        if (!conn) {
            setConnectionBadge('No connection', 'error');
            log('No active connection.', 'warning');
            return;
        }
        state.connectionName = conn.name;
        state.connectionUrl = conn.url ?? '';
        state.pins = await readPins(conn.name);
        setConnectionBadge(conn.name, 'connected');
        log(`Connected to ${conn.name}`, 'success');
        els.refreshBtn.disabled = false;
        await loadAgents();
    } catch (err) {
        setConnectionBadge('Connection error', 'error');
        log(`Connection failed: ${err}`, 'error');
    }
}

// ── Agents ────────────────────────────────────────────────────────────────────
/**
 * The `bot` table is the authoritative list of agents in an environment.
 * Solution membership is resolved separately and is purely decorative — an agent
 * that belongs to no visible solution still gets listed.
 */
function applyFetched(data: FetchedData): void {
    state.agents = data.agents;
    state.solutions = data.solutions;
    if (state.activeSolution) {
        const id = state.activeSolution.solutionId;
        state.activeSolution = state.solutions.find(s => s.solutionId === id) ?? state.activeSolution;
    }
}

/** Cheap fingerprint of everything the lists display, to log only real changes. */
function dataSignature(): string {
    return state.agents
        .map(a => [a.id, a.name, a.isActive, a.modifiedOn, a.publishedOn, a.solution?.solutionId ?? ''].join('|'))
        .join('\n');
}

let refreshSeq = 0;
let lastRefreshAt = 0;
/** Quick back-and-forth through breadcrumbs shouldn't fire a query storm. */
const REFRESH_MIN_INTERVAL_MS = 2000;

async function loadAgents(): Promise<void> {
    refreshSeq++;                                   // discards any silent refresh still in flight
    document.body.classList.remove('is-refreshing');
    state.isLoading = true;
    renderSolutionsTable();
    log('Loading agents...');
    try {
        applyFetched(await fetchAgentsAndSolutions(false));
        log(`Found ${state.agents.length} agent(s) in the environment.`, 'success');
        if (state.agents.length) {
            const resolved = state.agents.filter(a => a.solution).length;
            log(`Solution resolved for ${resolved}/${state.agents.length} agent(s).`,
                resolved ? 'info' : 'warning');
        }
    } catch (err) {
        log(`Failed to load agents: ${err}`, 'error');
    } finally {
        state.isLoading = false;
        lastRefreshAt = Date.now();
        renderSolutionsTable();
    }
}

/**
 * Silent re-read run when the user enters a list, so what they see matches Dataverse
 * even if something changed elsewhere (Copilot Studio, the maker portal, another session).
 * The cached view is shown immediately and updated in place when the data arrives.
 */
async function refreshData(force = false): Promise<void> {
    if (!state.connectionName || state.isLoading) return;
    if (!force && Date.now() - lastRefreshAt < REFRESH_MIN_INTERVAL_MS) return;

    const seq = ++refreshSeq;
    lastRefreshAt = Date.now();
    document.body.classList.add('is-refreshing');
    try {
        const before = dataSignature();
        const data = await fetchAgentsAndSolutions(true);
        if (seq !== refreshSeq) return;
        applyFetched(data);
        if (dataSignature() !== before) log('Data refreshed — changes detected.', 'info');
        rerenderCurrentView();
    } catch (err) {
        if (seq === refreshSeq) log(`Could not refresh (showing last known data): ${err}`, 'warning');
    } finally {
        if (seq === refreshSeq) document.body.classList.remove('is-refreshing');
    }
}

/** Only list views re-render; forms keep whatever the user is typing. */
function rerenderCurrentView(): void {
    if (state.currentStep === 'welcome') {
        renderSolutionsTable();
    } else if (state.currentStep === 'solution') {
        const id = state.browsingSolutionId;
        if (id && id !== '__none__' && !state.solutions.some(s => s.solutionId === id)) {
            log('This solution no longer exists — back to the solution list.', 'warning');
            navigateTo('welcome');
            return;
        }
        state.activeSolution = id === '__none__'
            ? null : state.solutions.find(s => s.solutionId === id) ?? null;
        renderSolutionDetail(true);
    }
    renderBreadcrumb();
}

function highlight(text: string, query: string): string {
    const safe = escapeHtml(text);
    if (!query) return safe;
    const idx = text.toLowerCase().indexOf(query);
    if (idx < 0) return safe;
    return escapeHtml(text.slice(0, idx))
        + '<mark class="hl">' + escapeHtml(text.slice(idx, idx + query.length)) + '</mark>'
        + escapeHtml(text.slice(idx + query.length));
}

function formatAbsoluteDate(iso: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function formatRelativeDate(iso: string): string {
    if (!iso) return '—';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '—';
    const mins = Math.floor((Date.now() - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
    return new Date(iso).toLocaleDateString();
}

/** Compares dotted version strings segment by segment, so 1.0.0.10 > 1.0.0.6. */
function compareVersions(a: string, b: string): number {
    const pa = a.split('.');
    const pb = b.split('.');
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = Number(pa[i] ?? 0);
        const nb = Number(pb[i] ?? 0);
        if (na !== nb) return na - nb;
    }
    return 0;
}

const SORT_KEYS = {
    displayName: (s: Solution) => s.friendlyName || s.uniqueName,
    name:        (s: Solution) => s.uniqueName,
    agents:      (s: Solution) => s.agentCount,
    created:     (s: Solution) => Date.parse(s.createdOn) || 0,
    version:     (s: Solution) => s.version,
    publisher:   (s: Solution) => s.publisherName || s.publisherPrefix,
    type:        (s: Solution) => (s.isManaged ? 'Managed' : 'Unmanaged'),
} as const;

type SortColumn = keyof typeof SORT_KEYS;

function compareSolutions(a: Solution, b: Solution): number {
    const col = state.sortColumn;
    const va = SORT_KEYS[col](a);
    const vb = SORT_KEYS[col](b);

    let cmp: number;
    if (col === 'version') cmp = compareVersions(va as string, vb as string);
    else if (typeof va === 'number') cmp = va - (vb as number);
    else cmp = String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' });

    if (cmp === 0) {
        // Stable tiebreak so equal values keep a predictable order
        cmp = (a.friendlyName || a.uniqueName).localeCompare(b.friendlyName || b.uniqueName);
        return cmp;
    }
    return state.sortDir === 'asc' ? cmp : -cmp;
}

type SolutionFilter = 'unmanaged' | 'managed' | 'all';

const FILTER_LABEL: Record<SolutionFilter, string> = {
    unmanaged: 'Unmanaged',
    managed: 'Managed',
    all: 'All',
};

/**
 * User-authored solutions that actually contain agents, of either kind.
 * This is an agent tool, so a solution with no agents is noise.
 */
function solutionPool(): Solution[] {
    return state.solutions.filter(s => s.agentCount > 0 && s.isVisible && !isSystemSolution(s));
}

function typeCounts(): Record<SolutionFilter, number> {
    const pool = solutionPool();
    const managed = pool.filter(s => s.isManaged).length;
    return { unmanaged: pool.length - managed, managed, all: pool.length };
}

/**
 * Development environments hold unmanaged solutions and everything downstream holds managed
 * ones, so a fixed filter hides everything in one of them. Until the user picks a type, show
 * whichever kind actually has agents (unmanaged wins when both do). Decided from the data
 * rather than from the environment's name, which can be anything.
 */
function effectiveFilter(): SolutionFilter {
    if (state.solutionFilter) return state.solutionFilter;
    const c = typeCounts();
    return c.unmanaged === 0 && c.managed > 0 ? 'managed' : 'unmanaged';
}

function visibleSolutions(): Solution[] {
    const f = effectiveFilter();
    const sorted = solutionPool()
        .filter(s => f === 'all' || (f === 'managed' ? s.isManaged : !s.isManaged))
        .sort(compareSolutions);
    // Le fissate stanno sopra qualunque ordinamento; questo vale dentro ciascun gruppo (spec 012)
    return pinFirst(sorted, s => state.pins.includes(s.uniqueName));
}

/**
 * Which note (if any) the list shows about managed solutions (spec 015 FR-003/FR-004). Pure, so
 * the rule stays in one place: a note appears only when managed rows are on screen and
 * either the Managed type is picked or the environment holds nothing else.
 */
function listNoticeKind(
    filter: SolutionFilter, counts: Record<SolutionFilter, number>,
): 'downstream' | 'managed-view' | null {
    if (filter === 'unmanaged' || counts.managed === 0) return null;
    if (counts.unmanaged === 0) return 'downstream';
    return filter === 'managed' ? 'managed-view' : null;
}

/** Fills the note above the list; hides it when there is nothing to say. */
function renderListNotice(filter: SolutionFilter, counts: Record<SolutionFilter, number>): void {
    const host = document.getElementById('solutions-notice');
    if (!host) return;
    const kind = listNoticeKind(filter, counts);
    if (!kind) { host.hidden = true; host.innerHTML = ''; return; }
    const env = state.connectionName ? `<strong>${escapeHtml(state.connectionName)}</strong>` : 'This environment';
    host.innerHTML = kind === 'downstream'
        ? `<p class="note-title">${env} holds only managed solutions.</p>
            <p>That is what you expect in UAT or PROD: a managed solution is what an import leaves
            behind, and Microsoft does not allow exporting it.</p>
            <p class="note-label">To build a package</p>
            <ol class="note-steps">
                <li>Open the tool in another tab, on a connection to the environment where these
                    solutions are <strong>unmanaged</strong> — usually DEV.</li>
                <li>Build the package there, then import it here.</li>
            </ol>`
        : `<p class="note-title">Managed solutions cannot be the source of a package.</p>
            <p>Microsoft does not allow exporting a managed solution. The solutions you can build
            from are under <strong>Unmanaged</strong>.</p>`;
    host.hidden = false;
}

/** Keeps the type switch, its counts and the subtitle in step with the data. */
function renderTypeFilter(): void {
    const host = document.getElementById('solution-type-filter');
    const subtitle = document.getElementById('browser-subtitle');
    const active = effectiveFilter();
    const counts = typeCounts();

    if (host) {
        const mark = { unmanaged: 'unmanaged', managed: 'managed', all: 'all-solutions' } as const;
        host.innerHTML = (['unmanaged', 'managed', 'all'] as const).map(f => `
            <button type="button" class="segment${f === active ? ' active' : ''}" data-filter="${f}"
                aria-pressed="${f === active}">
                ${icon(mark[f], 'icon--sm')}
                ${FILTER_LABEL[f]}<span class="segment-count">${counts[f]}</span>
            </button>`).join('');
    }
    renderListNotice(active, counts);
    const stats = document.getElementById('hero-stats');
    if (stats) {
        const agents = state.agents.length;
        // I conteggi per tipo (unmanaged, managed, tutte) stanno gia' nelle schede sotto: qui i totali
        stats.innerHTML = statsHtml([
            { label: 'Solutions', value: String(counts.all) },
            { label: 'Agents', value: String(agents) },
        ]);
    }
    if (subtitle) {
        subtitle.textContent = active === 'all'
            ? 'Solutions containing agents. Select one to see its agents.'
            : `${FILTER_LABEL[active]} solutions containing agents. Select one to see its agents.`;
    }
}

/**
 * Filters solutions by a free-text query matched against the solution's own names
 * AND the names of the agents inside it, so you can find a solution by typing an
 * agent name you remember. Returns the agents that matched, for display under the row.
 */
function searchSolutions(query: string): { solution: Solution; matchedAgents: AgentListItem[] }[] {
    const q = query.trim().toLowerCase();
    const all = visibleSolutions();
    if (!q) return all.map(solution => ({ solution, matchedAgents: [] }));

    const results: { solution: Solution; matchedAgents: AgentListItem[] }[] = [];
    for (const solution of all) {
        const solutionHit = solution.friendlyName.toLowerCase().includes(q)
            || solution.uniqueName.toLowerCase().includes(q)
            || solution.publisherName.toLowerCase().includes(q);
        const matchedAgents = agentsInSolution(solution.solutionId)
            .filter(a => a.name.toLowerCase().includes(q));
        if (solutionHit || matchedAgents.length) results.push({ solution, matchedAgents });
    }
    return results;
}

/** Numbers and dates start descending (newest/most first); text starts A→Z. */
function sortBy(col: SortColumn): void {
    if (state.sortColumn === col) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortColumn = col;
        state.sortDir = (col === 'agents' || col === 'created' || col === 'version')
            ? 'desc' : 'asc';
    }
    renderSolutionsTable();
}

/** Fissa o toglie una solution: la riga si sposta sul posto, senza rileggere nulla. */
function togglePin(uniqueName: string): void {
    const on = !state.pins.includes(uniqueName);
    if (on && pinsFull()) return;   // il pulsante e' gia' disabilitato: difesa per chi arriva da tastiera/script
    state.pins = on ? [...state.pins, uniqueName] : state.pins.filter(n => n !== uniqueName);
    renderSolutionsTable();
    setPinned(state.connectionName, uniqueName, on).catch(err =>
        log(`Pin not saved, it lasts only until you close the tool: ${err}`, 'warning'));
}

/** Conta solo le fissate che esistono ancora: un pin di una solution cancellata non deve occupare un posto. */
function pinsFull(): boolean {
    const known = new Set(solutionPool().map(s => s.uniqueName));
    return state.pins.filter(n => known.has(n)).length >= MAX_PINS;
}

function pinButtonHtml(s: Solution): string {
    const on = state.pins.includes(s.uniqueName);
    const blocked = !on && pinsFull();
    const title = on ? 'Unpin solution'
        : blocked ? `You can pin up to ${MAX_PINS} solutions: unpin one first`
        : 'Pin solution to the top';
    return `<button type="button" class="pin-btn" data-pin="${escapeHtml(s.uniqueName)}"
                aria-pressed="${on}" aria-label="${title}" title="${title}"${blocked ? ' disabled' : ''}>${icon('pin')}</button>`;
}

/**
 * Le fissate (al massimo MAX_PINS) restano sotto l'intestazione mentre si scorre. Ogni riga si
 * ancora sotto l'intestazione e sotto le fissate che la precedono, quindi l'offset si misura.
 */
function anchorPinnedRows(container: HTMLElement): void {
    let top = container.querySelector<HTMLElement>('thead')?.offsetHeight ?? 0;
    container.querySelectorAll<HTMLElement>('tr.is-pinned').forEach((row, i) => {
        if (i >= MAX_PINS) { row.classList.remove('is-pinned'); return; }   // pin vecchi oltre il limite: restano in cima, non ancorati
        row.style.setProperty('--pin-top', `${top}px`);
        top += row.offsetHeight;
    });
}

function renderSolutionsTable(): void {
    const container = document.getElementById('solutions-table-container');
    if (!container) return;

    if (state.isLoading) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="spinner"></span>
                <p style="margin-top:12px">Loading solutions...</p>
            </div>`;
        return;
    }

    renderTypeFilter();
    const showType = effectiveFilter() === 'all';
    const colCount = showType ? 7 : 6;

    const q = state.searchQuery.trim().toLowerCase();
    const rows = searchSolutions(state.searchQuery);

    const orphans = state.agents.filter(a => !a.solution || isSystemSolution(a.solution));
    const matchedOrphans = q
        ? orphans.filter(a => a.name.toLowerCase().includes(q))
        : orphans;
    // Gli agent senza solution non sono managed: la vista Managed mostra solo solution managed (spec 015 FR-007)
    const orphansInView = effectiveFilter() !== 'managed';
    const showOrphans = orphansInView && (q
        ? matchedOrphans.length > 0
        : orphans.length > 0);

    if (!rows.length && !showOrphans) {
        const f = effectiveFilter();
        const kind = f === 'all' ? '' : `${FILTER_LABEL[f].toLowerCase()} `;
        // When the other type has solutions, say so: an empty table alone reads as "nothing here"
        const others = f === 'all' ? 0 : typeCounts()[f === 'managed' ? 'unmanaged' : 'managed'];
        const otherKind = f === 'managed' ? 'unmanaged' : 'managed';
        container.innerHTML = `
            <div class="empty-state">
                <p>${q ? `No ${kind}solution or agent matches "${escapeHtml(state.searchQuery)}".`
                       : `No ${kind}solutions with agents found.`}</p>
                ${others ? `<p class="empty-hint">${others} ${otherKind} solution${others === 1 ? '' : 's'}
                    ${others === 1 ? 'has' : 'have'} agents — switch the type above to see
                    ${others === 1 ? 'it' : 'them'}.</p>` : ''}
            </div>`;
        return;
    }

    const agentHits = (agents: AgentListItem[]) => agents.length ? `
        <tr class="match-row">
            <td colspan="${colCount}">
                <div class="match-list">
                    ${agents.map(a => `
                    <span class="match-chip" data-agent="${escapeHtml(a.id)}">
                        ${agentIconHtml(a.id, 16)} ${highlight(a.name, q)}
                    </span>`).join('')}
                </div>
            </td>
        </tr>` : '';

    const th = (col: SortColumn, label: string, extraClass = '') => {
        const active = state.sortColumn === col;
        const arrow = active
            ? icon(state.sortDir === 'asc' ? 'chevron-up' : 'chevron-down', 'icon--xs')
            : '';
        return `<th class="sortable ${extraClass}${active ? ' sorted' : ''}"
                    data-sort="${col}"
                    aria-sort="${active ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}">
                    <span class="th-label">${label}<span class="sort-arrow">${arrow}</span></span>
                </th>`;
    };

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    ${th('displayName', 'Display name')}
                    ${th('name', 'Name')}
                    ${th('agents', 'Agents', 'col-num')}
                    ${th('created', 'Created')}
                    ${th('version', 'Version')}
                    ${th('publisher', 'Publisher')}
                    ${showType ? th('type', 'Type') : ''}
                </tr>
            </thead>
            <tbody>
                ${rows.map(({ solution: s, matchedAgents }) => `
                <tr class="data-row${state.pins.includes(s.uniqueName) ? ' is-pinned' : ''}${s.isManaged && showType ? ' is-managed' : ''}" data-solution="${escapeHtml(s.solutionId)}"${s.isManaged ? ' title="Managed: it cannot be exported, so it cannot be the source of a package"' : ''}>
                    <td class="cell-strong">${pinButtonHtml(s)}${highlight(s.friendlyName || s.uniqueName, q)}</td>
                    <td class="cell-muted">${highlight(s.uniqueName, q)}</td>
                    <td class="col-num"><span class="count-pill">${s.agentCount}</span></td>
                    <td class="cell-muted" title="${escapeHtml(formatAbsoluteDate(s.createdOn))}">
                        ${escapeHtml(formatRelativeDate(s.createdOn))}</td>
                    <td class="cell-muted">${escapeHtml(s.version || '—')}</td>
                    <td class="cell-muted">${highlight(s.publisherName || s.publisherPrefix, q)}</td>
                    ${showType ? `<td><span class="chip chip--${s.isManaged ? 'warning' : 'success'}">${s.isManaged ? 'Managed' : 'Unmanaged'}</span></td>` : ''}
                </tr>
                ${agentHits(matchedAgents)}`).join('')}
                ${showOrphans ? `
                <tr class="data-row" data-solution="__none__">
                    <td class="cell-strong"><span class="pin-slot"></span>Agents without a solution</td>
                    <td class="cell-muted">—</td>
                    <td class="col-num"><span class="count-pill">${orphans.length}</span></td>
                    <td class="cell-muted">—</td>
                    <td class="cell-muted">—</td>
                    <td class="cell-muted">—</td>
                    ${showType ? '<td class="cell-muted">—</td>' : ''}
                </tr>
                ${q ? agentHits(matchedOrphans) : ''}` : ''}
            </tbody>
        </table>`;

    anchorPinnedRows(container);
    container.querySelectorAll<HTMLElement>('th.sortable').forEach(el => {
        el.addEventListener('click', () => sortBy(el.dataset.sort as SortColumn));
    });
    container.querySelectorAll<HTMLElement>('.pin-btn').forEach(el => {
        el.addEventListener('click', ev => {
            ev.stopPropagation();                 // il pin non apre la solution
            togglePin(el.dataset.pin!);
        });
    });
    container.querySelectorAll<HTMLElement>('.data-row').forEach(el => {
        el.addEventListener('click', () => selectSolution(el.dataset.solution!));
    });
    // A chip opens the solution that holds the agent: the rename is per solution (FR-023b)
    container.querySelectorAll<HTMLElement>('.match-chip').forEach(el => {
        el.addEventListener('click', ev => {
            ev.stopPropagation();
            const agent = state.agents.find(a => a.id === el.dataset.agent);
            if (agent) selectSolution(agent.solution ? agent.solution.solutionId : '__none__', agent.id);
        });
    });
}

function sortedByName(agents: AgentListItem[]): AgentListItem[] {
    return [...agents].sort((a, b) => a.name.localeCompare(b.name));
}

/** Tutti gli agent della solution aperta. */
function solutionAgents(): AgentListItem[] {
    return state.browsingSolutionId
        ? sortedByName(agentsInSolution(state.browsingSolutionId)) : [];
}

/** Gli agent esclusi di un Target, da modificare (D8). */
function excludedOf(target: string): Set<string> {
    let set = state.excludedByTarget.get(target);
    if (!set) { set = new Set<string>(); state.excludedByTarget.set(target, set); }
    return set;
}

/** Quelli che il rename tocca davvero in un Target: tutti meno gli esclusi. Senza Target, quello mostrato. */
function selectedAgents(target: string = activeSuffix()): AgentListItem[] {
    const out = state.excludedByTarget.get(target);
    return solutionAgents().filter(a => !out?.has(a.id));
}

/**
 * I suffissi distinti che gli agent della solution avranno dopo il rename, esclusi compresi.
 * Piu' di uno significa nomi misti nello stesso environment (FR-023a). Un agent senza
 * suffisso conta come "nessuno" (stringa vuota).
 */
function suffixesAfter(names: { name: string; selected: boolean }[], suffix: string): string[] {
    const clean = suffix.trim();
    const set = new Set(names.map(n =>
        n.selected ? clean : (splitSuffix(n.name).currentSuffix ?? '')));
    return [...set];
}

/** Gli agent esclusi che restano con un suffisso diverso da quello nuovo: la causa dei nomi misti. */
function clashingAgents(name: string | undefined = activeTarget()?.name): AgentListItem[] {
    if (name === undefined) return [];
    const target = name.trim();
    const out = state.excludedByTarget.get(name);
    return solutionAgents().filter(a =>
        out?.has(a.id) && (splitSuffix(a.name).currentSuffix ?? '') !== target);
}

function mixedSuffixHtml(found: string[], targetName?: string): string {
    const label = found.map(s => s ? `[${escapeHtml(s)}]` : 'no suffix').join(', ');
    const who = clashingAgents(targetName).map(a => `<strong>${escapeHtml(a.name)}</strong>`).join(', ');
    return `
        <p class="hint hint--warn" style="margin-top:12px">
            The agents of this solution would end up with <strong>different suffixes</strong>
            (${label}) in the same environment. Excluded and keeping the old suffix: ${who}.
        </p>`;
}

function agentsInSolution(solutionId: string): AgentListItem[] {
    if (solutionId === '__none__') {
        return state.agents.filter(
            a => !a.solution || isSystemSolution(a.solution));
    }
    return state.agents.filter(a => a.solution?.solutionId === solutionId);
}

function selectSolution(solutionId: string, highlightAgentId = ''): void {
    state.highlightAgentId = highlightAgentId;
    state.activeSolution = solutionId === '__none__'
        ? null
        : state.solutions.find(s => s.solutionId === solutionId) ?? null;
    if (state.browsingSolutionId !== solutionId) {
        // Un'altra solution: bozza, esclusioni e package gia' preparato non valgono piu'
        state.excludedByTarget.clear();
        state.publishByTarget.clear();
        state.options.publishByAgent = {};
        resetVersionPlan();
        state.selectedTargets = [];
        state.selectionFor = '';
        state.activeTargetName = '';
        state.packaging = null;
    }
    state.browsingSolutionId = solutionId;
    navigateTo('solution');
}

/**
 * Intestazione della solution aperta: il nome sta nel percorso, versione, publisher, numero di agent
 * e data di creazione stanno nella riga dell'elenco. Resta solo il tipo, che l'elenco mostra
 * come scheda del filtro e qui non si vede.
 */
function solutionKindChipHtml(sol: Solution | null): string {
    if (!sol) return '<span class="chip chip--muted">No solution</span>';
    return sol.isManaged
        ? '<span class="chip chip--muted">Managed</span>'
        : '<span class="chip chip--muted">Unmanaged</span>';
}

function renderSolutionDetail(keepScroll = false): void {
    const container = els.stepSolution;
    const solId = state.browsingSolutionId;
    if (!solId) { navigateTo('welcome'); return; }
    const prevScroll = keepScroll
        ? container.querySelector<HTMLElement>('.panel-table')?.scrollTop ?? 0 : 0;
    const seq = ++solutionDetailSeq;

    const sol = state.activeSolution;
    const agents = solutionAgents();
    const dateCell = (iso: string, empty: string) => iso
        ? `<td class="cell-muted" title="${escapeHtml(formatAbsoluteDate(iso))}">${escapeHtml(formatRelativeDate(iso))}</td>`
        : `<td class="cell-muted">${empty}</td>`;

    container.innerHTML = `
        <section class="panel panel--fill">
            <div class="panel-head panel-head--slim">
                ${solutionKindChipHtml(sol)}
                <span class="refresh-indicator" role="status"><span class="spinner"></span> Updating…</span>
            </div>
            <div id="solution-notices">${sol ? notExportableBannerHtml(sol) : ''}</div>
            ${sol ? '' : `
            <div class="panel-note">
                These agents don't belong to any visible solution. Packaging works on a solution,
                so add the agent to one before producing a package.
            </div>`}
            <div class="panel-table">
                ${agents.length ? `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Agent</th>
                            <th>Agent type</th>
                            <th>Status</th>
                            <th>Last published</th>
                            <th>Modified</th>
                            <th>Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${agents.map(a => `
                        <tr data-agent="${escapeHtml(a.id)}"${a.id === state.highlightAgentId ? ' class="is-highlight"' : ''}>
                            <td class="cell-strong" title="${escapeHtml(a.name)}">${agentCellHtml(a)}</td>
                            <td class="cell-type">${agentKindHtml(a.id)}</td>
                            <td><span class="chip chip--${a.isActive ? 'success' : 'muted'}">${a.isActive ? 'Active' : 'Inactive'}</span></td>
                            ${dateCell(a.publishedOn, '<span class="cell-never">Never published</span>')}
                            ${dateCell(a.modifiedOn, '—')}
                            ${dateCell(a.createdOn, '—')}
                        </tr>`).join('')}
                    </tbody>
                </table>
                ${sol && sol.exportable ? `
                <div class="panel-foot">
                    <span class="hint">The suffix applies to all ${agents.length}
                        agent${agents.length === 1 ? '' : 's'} of the solution.
                        You can exclude some in the next step.</span>
                    <button class="btn btn--primary" id="rename-btn">
                        Set the suffix ${icon('arrow-right', 'icon--sm')}</button>
                </div>` : ''}` : `
                <div class="empty-state">
                    <p>This solution contains no agents.</p>
                    <p class="empty-hint">Packaging starts from an agent: add one to this
                    solution, or pick a solution that has some.</p>
                </div>`}
            </div>
        </section>`;

    container.querySelector('#rename-btn')?.addEventListener('click', startRename);
    container.querySelector('.is-highlight')?.scrollIntoView({ block: 'nearest' });
    const table = container.querySelector<HTMLElement>('.panel-table');
    if (table) table.scrollTop = prevScroll;
    if (sol) void loadSuffixHint(sol, seq);
    void loadCards(agents, seq);
}

/**
 * Una managed solution non e' esportabile ("You can't export managed solutions"), quindi non
 * puo' essere sorgente di un packaging. Si dice subito e si indica dove operare (FR-068).
 */
function notExportableBannerHtml(sol: Solution): string {
    if (sol.exportable) return '';
    const env = state.connectionName ? ` in <strong>${escapeHtml(state.connectionName)}</strong>` : '';
    return `
        <div class="panel-note panel-note--warning note-rich">
            <p class="note-title">This solution is managed and cannot be exported.</p>
            <p>A managed solution${env} is normal: it is what an import leaves behind. Microsoft does
            not allow exporting it, so it cannot be the source of a package.</p>
            <p class="note-label">To build a package</p>
            <ol class="note-steps">
                <li>Open the tool in another tab, on a connection to the environment where
                    <code>${escapeHtml(sol.uniqueName)}</code> is <strong>unmanaged</strong> — usually DEV.</li>
                <li>Build the package there.</li>
                <li>Import the package here.</li>
            </ol>
        </div>`;
}

/**
 * Segnala, in sola lettura, una environment variable di tipo String nella solution.
 *
 * Non serve al rename: il nome sui canali deriva gia' da `bot.name` al publish. Serve ad
 * avvisare che un *Channel display name suffix* nativo si sommerebbe al suffisso del nome,
 * producendo `agenteTool1 [UAT] (UAT)` (FR-089).
 */
async function loadSuffixHint(sol: Solution, seq: number): Promise<void> {
    const hint: SuffixVariableHint | null = await findSuffixVariable(sol.solutionId);
    if (seq !== solutionDetailSeq) return;   // l'utente e' gia' passato ad altro
    const host = document.getElementById('solution-notices');
    if (!host || !hint) return;
    host.insertAdjacentHTML('beforeend', `
        <div class="panel-note">
            This solution holds the environment variable
            <code>${escapeHtml(hint.schemaName)}</code> (String), usable as Copilot Studio's
            native <em>Channel display name suffix</em>.
            <strong>The tool does not touch it.</strong> It affects only Teams and M365 Copilot,
            and if set its value <strong>adds to</strong> the suffix in the agent's name:
            use one mechanism or the other, not both.
        </div>`);
}

let solutionDetailSeq = 0;

/** Il rename riguarda la solution aperta e tutti i suoi agent (FR-023). */
/** Il numero proposto: l'ultimo segmento della versione di partenza, +1. */
const proposedVersion = (): string => nextVersion(state.versionFrom);
/** La versione scelta: quella digitata, o la proposta se non si e' toccato nulla. */
const chosenVersion = (): string => (state.versionTouched ? state.versionInput : proposedVersion());
/** Perche' la versione scelta non va bene, o `null`. Senza l'opzione attiva non c'e' nulla da controllare. */
const versionIssue = (): string | null =>
    state.raiseVersion ? versionProblem(chosenVersion(), state.versionFrom) : null;
/** Porta la scelta nelle opzioni di packaging: `null` se non si alza o se non e' valida. */
function syncVersionOption(): void {
    state.options.newVersion = state.raiseVersion && !versionIssue() ? chosenVersion().trim() : null;
}
/** Un'altra solution (o un'altra connessione): la versione si ricalcola da capo. */
function resetVersionPlan(): void {
    state.versionFrom = '';
    state.raiseVersion = true;
    state.versionInput = '';
    state.versionTouched = false;
    state.options.newVersion = null;
}

async function startRename(): Promise<void> {
    const sol = state.activeSolution;
    const agents = solutionAgents();
    if (!sol || !agents.length) return;
    if (!sol.exportable) {
        log(`"${sol.friendlyName || sol.uniqueName}" is managed: it cannot be exported, so it `
            + `cannot be the source of a package. Work on the environment where it is `
            + `unmanaged.`, 'warning');
        return;
    }
    // La versione parte da quella che DEV ha ora, a meno che ci sia gia' un lavoro in corso:
    // un package preparato o un numero digitato a mano non si buttano tornando alla solution.
    if (!state.versionFrom || (!state.packaging && !state.versionTouched)) state.versionFrom = sol.version;
    syncVersionOption();
    await ensureTargets(sol);
    navigateTo('suffix');
    log(`Rename in ${sol.friendlyName || sol.uniqueName}: ${agents.length} agent(s)`);
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────
interface Crumb { label: string; step: AppStep; }

/**
 * The trail mirrors the real hierarchy. The rename is per solution, so the step after
 * the solution is the suffix form, not an agent.
 */
function buildBreadcrumb(): Crumb[] {
    const trail: Crumb[] = [{ label: 'Solutions', step: 'welcome' }];
    if (state.currentStep === 'welcome') return trail;
    if (state.currentStep === 'history') return [...trail, { label: 'History', step: 'history' }];
    if (state.browsingSolutionId) {
        trail.push({
            label: state.activeSolution
                ? (state.activeSolution.friendlyName || state.activeSolution.uniqueName)
                : 'Agents without a solution',
            step: 'solution',
        });
    }
    if (state.currentStep === 'solution') return trail;

    trail.push({ label: 'Suffix', step: 'suffix' });
    if (state.currentStep === 'suffix') return trail;

    trail.push({ label: 'Review', step: 'review' });
    if (state.currentStep === 'review') return trail;

    trail.push({ label: 'Preview', step: 'preview' });
    if (state.currentStep === 'preview') return trail;

    trail.push({ label: 'Checks', step: 'verify' });
    if (state.currentStep === 'verify') return trail;

    trail.push({ label: 'Result', step: 'result' });
    return trail;
}

/**
 * Una tile statistica: etichetta, valore e, se serve, un dettaglio accanto al valore. Tutte le
 * intestazioni a tile (elenco delle solution, solution aperta, anteprima) la usano, cosi' etichette
 * e struttura restano uguali (spec 011).
 */
interface Stat { label: string; value: string; sub?: string; title?: string }
function statsHtml(stats: Stat[]): string {
    return stats.map(s => `
        <div class="stat"><dt>${escapeHtml(s.label)}</dt>
            <dd${s.title ? ` title="${escapeHtml(s.title)}"` : ''}>${escapeHtml(s.value)}${s.sub ? `<span class="stat-sub">${escapeHtml(s.sub)}</span>` : ''}</dd></div>`).join('');
}

function renderBreadcrumb(): void {
    const nav = els.breadcrumb;
    const trail = buildBreadcrumb();

    // Nothing to navigate back to from the root
    if (trail.length < 2) {
        nav.innerHTML = '';
        nav.hidden = true;
        return;
    }
    nav.hidden = false;

    nav.innerHTML = trail.map((c, i) => {
        const isLast = i === trail.length - 1;
        const sep = i > 0 ? `<span class="crumb-sep" aria-hidden="true">›</span>` : '';
        return sep + (isLast
            ? `<span class="crumb crumb--current" aria-current="page">${escapeHtml(c.label)}</span>`
            : `<button class="crumb crumb--link" data-step="${c.step}"
                   title="${escapeHtml(c.label)}">${escapeHtml(c.label)}</button>`);
    }).join('');

    nav.querySelectorAll<HTMLElement>('.crumb--link').forEach(el => {
        el.addEventListener('click', () => navigateTo(el.dataset.step as AppStep));
    });
}

// ── Step navigation ───────────────────────────────────────────────────────────

/** Ogni contenitore che scorre: lo step, la tabella dell'elenco e quella interna alla solution. */
const SCROLLERS = '.step-panel, #solutions-table-container, .panel-table';

/**
 * Una schermata nuova parte dall'alto. Il contenitore che scorre e' lo stesso per tutti gli
 * step, quindi senza questo si ereditava la posizione della schermata precedente: tornando
 * indietro da fondo pagina si ricominciava dal basso.
 */
function scrollToTop(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>(SCROLLERS).forEach(el => { el.scrollTop = 0; });
}

/**
 * Suffisso vuoto = togliere quello che c'e' (spec 013). E' lecito ma sorprende: prima di andare
 * avanti si dice, con esempi veri, che cosa succede ai nomi.
 */
function confirmNoSuffix(sol: Solution): Promise<boolean> {
    const several = selectedTargetList().length > 1;
    const picked = selectedAgents('');
    const changing = picked.filter(a => splitSuffix(a.name).currentSuffix);
    const sample = changing.length ? changing : picked;
    const rows = sample.map(a => `
        <li><span class="warn-from">${escapeHtml(a.name)}</span>
            <span class="warn-arrow">${icon('arrow-right', 'icon--xs')}</span>
            <strong>${escapeHtml(buildName(a.name, ''))}</strong></li>`).join('');
    const some = changing.length === 1 ? 'one agent' : `${changing.length} agents`;
    const lead = changing.length
        ? (several
            ? `The target <strong>without a suffix</strong> <strong>removes</strong> the existing suffix from ${some}.`
            : `The suffix is empty, so the existing one is <strong>removed</strong> from ${changing.length === 1 ? 'the agent' : `${changing.length} agents`}.`)
        : (several
            ? 'The target <strong>without a suffix</strong> changes no names: its agents have no suffix.'
            : 'The suffix is empty and these agents have none, so their names stay as they are.');
    return askConfirm({
        title: several ? 'A target without a suffix' : 'No suffix selected',
        warning: true,
        wide: several,
        okLabel: several ? 'Continue' : 'Continue without suffix',
        cancelLabel: several ? 'Go back' : 'Go back and choose one',
        bodyHtml: `
            <p class="warn-lead">${lead}</p>
            <ul class="warn-list">${rows}</ul>
            ${several ? `
            <p>This run builds <strong>${selectedTargetList().length} packages</strong> from one export, one for each target:</p>
            ${targetsOverviewHtml(sol)}
            <p class="hint">Untick the target without a suffix if you did not mean to build one.</p>`
                : '<p class="hint">Pick a suffix such as DEV, UAT or PROD if you meant to name the environment.</p>'}`,
    });
}

function navigateTo(step: AppStep): void {
    state.currentStep = step;
    renderBreadcrumb();
    els.welcomeScreen.style.display = 'none';
    els.stepSolution.style.display = 'none';
    els.stepSuffix.style.display = 'none';
    els.stepReview.style.display = 'none';
    els.stepPreview.style.display = 'none';
    els.stepVerify.style.display = 'none';
    els.stepResult.style.display = 'none';
    els.stepHistory.style.display = 'none';

    switch (step) {
        // List views paint from the cache at once, then update in place from a silent refresh
        case 'welcome':
            els.welcomeScreen.style.display = '';
            renderSolutionsTable();
            void refreshData();
            break;
        case 'solution':
            els.stepSolution.style.display = '';
            renderSolutionDetail();
            void refreshData();
            break;
        case 'suffix':  els.stepSuffix.style.display  = ''; renderSuffixStep();  break;
        case 'review':  els.stepReview.style.display  = ''; renderReviewStep();  break;
        case 'preview': els.stepPreview.style.display = ''; renderPreviewStep(); break;
        case 'verify':  els.stepVerify.style.display  = ''; renderVerifyStep();  break;
        case 'result':  els.stepResult.style.display  = ''; renderResultStep();  break;
        case 'history': els.stepHistory.style.display = ''; void renderHistoryStep(); break;
    }
    // Una sola volta, per ogni cambio di schermata: i ridisegni sul posto (aggiornamento
    // silenzioso dell'elenco, digitazione del suffisso) non passano di qui e non perdono la posizione
    scrollToTop(document.getElementById('main-content') ?? els.welcomeScreen);
}

// ── Step: suffisso e opzioni ──────────────────────────────────────────────────

// ── Targets (spec 016) ────────────────────────────────────────────────────────

/** I Target spuntati, nell'ordine della lista. */
function selectedTargetList(): Target[] {
    return state.targets.filter(t => state.selectedTargets.includes(t.name));
}

/** Il Target di cui le schermate mostrano i nomi: quello scelto nel selettore se e' spuntato, altrimenti il primo spuntato. */
function activeTarget(): Target | null {
    const list = selectedTargetList();
    return list.find(t => t.name === state.activeTargetName) ?? list[0] ?? null;
}

/** Il suffisso del Target mostrato; vuoto se nessun Target e' spuntato. */
const activeSuffix = (): string => activeTarget()?.name ?? '';

/** L'etichetta di un Target nei testi: `[UAT]`, o «no suffix». */
const targetLabel = (name: string): string => (name.trim() ? `[${name.trim()}]` : 'no suffix');

/** Il publish on import di un agent per un Target (di default il mostrato): la sua eccezione batte il default del Target (D7, D8). */
function agentPublishMode(schemaName: string, target: string = activeSuffix()): PublishMode {
    return state.publishByTarget.get(target)?.[schemaName]
        ?? state.targets.find(t => t.name === target)?.publishOnImport ?? 'keep';
}

/** Legge la lista dell'ambiente (una volta per connessione) e le spunte della solution aperta. */
async function ensureTargets(sol: Solution): Promise<void> {
    if (!state.targetsReady) {
        state.targets = await readTargets(state.connectionName);
        state.targetsReady = true;
    }
    if (state.selectionFor !== sol.uniqueName) {
        state.selectedTargets = await readSelection(state.connectionName, sol.uniqueName, state.targets);
        state.selectionFor = sol.uniqueName;
    }
}

/** Salva la lista. Un errore non blocca il lavoro: si dice che la lista dura fino alla chiusura (FR-004). */
function persistTargets(renamed?: { from: string; to: string }): void {
    saveTargets(state.connectionName, state.targets, renamed).catch(err => {
        state.targetNotice = `Not saved, the list lasts only until you close the tool: ${describeError(err)}`;
        log(`Targets not saved: ${describeError(err)}`, 'warning');
        renderTargetNotice();
    });
}

function persistSelection(): void {
    const sol = state.activeSolution;
    if (!sol) return;
    saveSelection(state.connectionName, sol.uniqueName, selectedTargetList().map(t => t.name)).catch(err =>
        log(`The selected targets were not saved: ${describeError(err)}`, 'warning'));
}

function renderTargetNotice(): void {
    const el = document.getElementById('target-notice');
    if (el) el.textContent = state.targetNotice;
}

/** I nomi dei Target per i file dell'elenco: senza nessuno spuntato si mostra il caso del suffisso vuoto. */
const artifactTargetNames = (): string[] => {
    const names = selectedTargetList().map(t => t.name);
    return names.length ? names : [''];
};

/** Quanti archivi finiranno su disco: uno per Target e, con le copie extra, anche l'unmanaged di ciascuno e i due originali. */
function archiveCount(): number {
    const n = Math.max(1, selectedTargetList().length);
    return state.options.keepSourceArtifacts ? n * 2 + 2 : n;
}

/** Un selettore dei Target spuntati, quando sono piu' di uno: dice di quale si vedono i nomi. */
function targetSwitchHtml(): string {
    const list = selectedTargetList();
    if (list.length < 2) return '';
    const active = activeTarget();
    return `<div class="segmented target-switch" role="group" aria-label="Show the names for">${list.map(t => `
        <button type="button" class="segment${t === active ? ' active' : ''}" aria-pressed="${t === active}"
            data-target-view="${escapeHtml(t.name)}">${escapeHtml(targetLabel(t.name))}</button>`).join('')}</div>`;
}

/** Il clic sul selettore: sceglie il Target mostrato e lascia a chi chiama il ridisegno. */
function bindTargetSwitch(host: Element | null, onChange: () => void): void {
    host?.addEventListener('click', ev => {
        const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-target-view]');
        if (!btn) return;
        state.activeTargetName = btn.dataset.targetView ?? '';
        onChange();
    });
}

/** La posizione del Target mostrato nel risultato del giro (stesso ordine dei Target spuntati). */
function activeIndex(multi: MultiPackagingResult): number {
    const name = activeTarget()?.name;
    return Math.max(0, multi.targets.findIndex(t => t.target.name === name));
}

function stepperHtml(active: 1 | 2 | 3 | 4 | 5): string {
    const steps = ['Suffix', 'Review', 'Preview', 'Checks', 'Result'];
    const items = steps.map((label, i) => {
        const n = i + 1;
        const cls = n === active ? 'active' : n < active ? 'done' : '';
        const mark = n < active ? icon('check') : String(n);
        return `<li class="stepper-item ${cls}"><span class="stepper-dot">${mark}</span><span class="stepper-label">${label}</span></li>`;
    });
    const withLines = items.flatMap((item, i) =>
        i < items.length - 1 ? [item, '<li class="stepper-line" aria-hidden="true"></li>'] : [item]
    );
    return `<ol class="stepper">${withLines.join('')}</ol>`;
}

/**
 * Elenco di cosa finira' su disco, aggiornato mentre si digita.
 *
 * Gli archivi che l'opzione non produce restano in elenco, spenti: vedere cosa si sta
 * rinunciando a scrivere dice piu' di una riga di testo che lo racconta. Il manifest e' sempre
 * acceso e porta la sua nota, perche' essendo testo non costa un salvataggio.
 */
/**
 * Un canale col suo marchio. I `channelId` noti hanno l'icona di prodotto; gli altri
 * restano un chip col loro identificativo, perche' l'elenco dei canali lo decide Copilot
 * Studio e non vale la pena fingere di conoscerli tutti.
 */
function channelChip(id: string): string {
    const brands: Record<string, [string, string]> = {
        MsTeams: ['teams', 'Microsoft Teams'],
        Microsoft365Copilot: ['copilot', 'Microsoft 365 Copilot'],
    };
    const known = brands[id];
    const mark = known ? `<span class="brand brand-${known[0]}" aria-hidden="true"></span>` : '';
    return `<span class="channel-chip">${mark}${escapeHtml(known ? known[1] : id)}</span>`;
}

/**
 * Che versione avra' il package, e che cosa comporta all'import.
 *
 * Stessa versione = solo un **Update**, che non rimuove mai componenti: gli agent cancellati
 * nell'origine restano nella destinazione. Versione piu' alta = si puo' importare come
 * **Upgrade**, che li rimuove. E' la conseguenza che sorprende (Microsoft: "You can't delete
 * components with an update"), quindi la si dice insieme ai due numeri.
 */
/** Il testo giusto adesso: quello della versione scelta, o l'invito a correggerla se non e' valida. */
function versionHintNow(): string {
    if (state.raiseVersion && versionIssue()) return 'Choose a valid new version below to continue.';
    return versionHintHtml(state.versionFrom, state.options.newVersion);
}

function versionHintHtml(from: string, to: string | null): string {
    if (!to) {
        return `
        <span class="vline"><code>${escapeHtml(from)}</code> stays as it is in DEV and in the package.</span>
        <span class="vline">The target can only take it as an <strong>Update</strong>, which never removes components.</span>
        <span class="vline">Agents you deleted in the source would stay there.</span>`;
    }
    return `
        <span class="vline"><code>${escapeHtml(from)}</code> → <code>${escapeHtml(to)}</code></span>
        <span class="vline">Written to the solution <strong>in DEV before the export</strong>.</span>
        <span class="vline">DEV and the package carry the same version; the next export continues from it.</span>
        <span class="vline">Import it as an <strong>Upgrade</strong> (the default): agents you deleted in the source are removed too.</span>
        <span class="vline"><em>Update</em> and <em>Stage for upgrade</em> keep them.</span>`;
}

/** Il nome del file di un package: porta la versione che avra' (quella nuova se si alza, altrimenti quella di DEV). */
function packageFileName(sol: Solution, targetName: string, kind: 'managed' | 'unmanaged'): string {
    const version = (state.options.newVersion ?? state.versionFrom ?? sol.version).replace(/\./g, '_');
    return `${sol.uniqueName}_${version}_${kind}_${targetName.trim() || 'nosuffix'}.zip`;
}

/** Il publish on import degli agent rinominati di un Target, in una frase: il valore comune o «Mixed». */
function publishSummary(targetName: string): string {
    const modes = selectedAgents(targetName).map(a => agentPublishMode(a.schemaName, targetName));
    if (new Set(modes).size <= 1) return PUBLISH_LABELS[modes[0] ?? 'keep'];
    const part = (m: PublishMode, word: string): string => {
        const n = modes.filter(x => x === m).length;
        return n ? `${n} ${word}` : '';
    };
    return `Mixed: ${[part('force-true', 'yes'), part('force-false', 'no'), part('keep', 'as is')].filter(Boolean).join(', ')}`;
}

/**
 * Il riepilogo dei Target spuntati: per ognuno quanti agent si rinominano, il publish e il file
 * da importare. Sta nella revisione e nei dialoghi che precedono il giro, cosi' si vede da subito
 * quanti package escono e a che cosa serve ciascuno (D9).
 */
function targetsOverviewHtml(sol: Solution): string {
    const total = solutionAgents().length;
    return `
        <table class="data-table confirm-targets">
            <thead><tr><th>Target</th><th>Agents renamed</th><th>Publish on import</th><th>Package to import</th></tr></thead>
            <tbody>${selectedTargetList().map(t => `
                <tr>
                    <td class="cell-strong">${escapeHtml(targetLabel(t.name))}${t.name.trim() ? '' : ` <span class="cell-muted">(${isProductionTarget(t) ? 'production' : 'removes the suffix'})</span>`}</td>
                    <td>${selectedAgents(t.name).length} of ${total}</td>
                    <td>${escapeHtml(publishSummary(t.name))}</td>
                    <td><code>${escapeHtml(packageFileName(sol, t.name, 'managed'))}</code></td>
                </tr>`).join('')}</tbody>
        </table>`;
}

function artifactListHtml(sol: Solution, targetNames: string[], keepExtras: boolean): string {
    const many = targetNames.length > 1;
    const rows: Array<[boolean, string, string]> = [];
    for (const name of targetNames) {
        rows.push(
            [true, packageFileName(sol, name, 'managed'),
                'The only one to import into UAT or PROD. Being managed, it creates no '
                + 'unmanaged layer in the target environment.'],
            [keepExtras, packageFileName(sol, name, 'unmanaged'),
                'The same patch, unmanaged, for source control or a development environment. '
                + 'Never import it downstream.'],
        );
    }
    rows.push(
        [keepExtras, 'source_managed.zip',
            'The original managed export, unpatched. Re-import it to go back; beside the '
            + 'patched one it proves a single element was touched.'],
        [keepExtras, 'source_unmanaged.zip',
            'The original unmanaged export: an untouched snapshot of the solution as it '
            + 'stood in the source environment.'],
        [true, 'manifest.json',
            'Who, when, from where, the suffix applied and every file hash. It tells apart '
            + 'two artifacts of the same version built for different environments.'],
    );
    const n = rows.filter(([on, f]) => on && f.endsWith('.zip')).length;
    return `
        <ul class="art-list">${rows.map(([on, file, desc]) => `
            <li class="art-item${on ? '' : ' is-off'}">
                ${file.endsWith('.zip')
                    ? icon('archive', on ? 'icon--archive' : 'icon--muted')
                    : icon('file-json', on ? 'icon--data' : 'icon--muted')}
                <div class="art-body">
                    <code class="art-name">${escapeHtml(file)}</code>
                    <p class="art-desc">${escapeHtml(desc)}</p>
                </div>
            </li>`).join('')}</ul>
        <p class="hint">${n === 1
            ? 'One archive: <strong>a single save</strong>.'
            : `${n} archives: <strong>${n} saves</strong>, one per file.`}${many ? ' Each target gets its own archives.' : ''}</p>`;
}

const PUBLISH_LABELS: Record<PublishMode, string> = {
    'keep': 'Leave as is',
    'force-true': 'Force yes',
    'force-false': 'Force no',
};

/** La scelta di un agent in un Target: da qui in poi vince sul valore di partenza del Target (D7, D8). */
function setPublishMode(target: string, schemaName: string, mode: PublishMode): void {
    state.publishByTarget.set(target, { ...(state.publishByTarget.get(target) ?? {}), [schemaName]: mode });
}

/** Il toggle di un agent: stessa grammatica del resto dell'interfaccia, il valore attivo evidenziato. */
function publishToggleHtml(target: string, schemaName: string): string {
    const current = agentPublishMode(schemaName, target);
    return `<div class="toggle-group toggle-group--sm" role="group"
            aria-label="Publish on import">${(Object.keys(PUBLISH_LABELS) as PublishMode[]).map(m => `
        <button class="toggle-btn${current === m ? ' is-active' : ''}" data-publish="${escapeHtml(schemaName)}"
            data-val="${m}">${PUBLISH_LABELS[m]}</button>`).join('')}</div>`;
}

/**
 * Il toggle "per tutti". Mostra il valore comune quando tutti gli agent spuntati ne hanno uno
 * solo, e nessuno quando sono misti: un pulsante che non resta acceso dopo il clic sembra rotto.
 */
function bulkToggleHtml(target: string): string {
    const chosen = selectedAgents(target);
    const first = chosen[0] ? agentPublishMode(chosen[0].schemaName, target) : null;
    const common = first && chosen.every(a => agentPublishMode(a.schemaName, target) === first) ? first : null;
    return `<div class="toggle-group toggle-group--sm" role="group" aria-label="Publish on import for all ticked agents">${
        (Object.keys(PUBLISH_LABELS) as PublishMode[]).map(m => `
        <button class="toggle-btn${common === m ? ' is-active' : ''}" data-publish-all="${m}">${PUBLISH_LABELS[m]}</button>`).join('')}</div>`;
}

/** L'icona dell'agent: quella letta se valida, altrimenti la generica. Il `src` e' costruito qui da un valore gia' validato (FR-003). */
function agentIconHtml(id: string, size: 16 | 20 | 24 = 24): string {
    const uri = state.cards.get(id)?.iconDataUri;
    const inner = uri
        ? `<img src="${uri}" alt="" width="${size}" height="${size}">`
        : icon('bot', 'icon--sm');
    return `<span class="agent-icon agent-icon--${size}" data-card-icon="${escapeHtml(id)}">${inner}</span>`;
}

const KIND_LABEL: Record<AgentKind, string> = {
    standard: 'Standard harness',
    harness: 'GitHub Copilot harness',
    unknown: 'Unknown agent type',
};

/**
 * La cella del tipo di agent (spec 010): il logo dell'app per lo standard, il marchio GitHub
 * Copilot per l'harness, un trattino se il tipo non si riconosce. Prima della lettura e' vuota ma
 * ha gia' le sue dimensioni, quindi le righe non si spostano. Etichetta e suggerimento dicono il
 * nome del tipo: l'icona da sola non basta a chi non la riconosce.
 */
function agentKindHtml(id: string): string {
    const kind = state.cards.get(id)?.kind;
    const attrs = `data-card-kind="${escapeHtml(id)}"`;
    if (!kind) return `<span class="agent-kind" ${attrs} data-kind=""></span>`;
    const label = KIND_LABEL[kind];
    const inner = kind === 'standard'
        ? '<img src="./logo-color.svg" alt="" width="20" height="20">'
        : kind === 'harness' ? icon('github-copilot') : icon('minus', 'icon--sm');
    return `<span class="agent-kind agent-kind--${kind}" ${attrs} data-kind="${kind}" role="img" aria-label="${label}" title="${label}">${inner}</span>`;
}

/** Icona e nome: la cella dell'agent nelle liste (spec 008). */
function agentCellHtml(a: AgentListItem): string {
    return `<div class="agent-cell">${agentIconHtml(a.id)}<span class="agent-name">${escapeHtml(a.name)}</span></div>`;
}

/** Riempie sul posto icone e tipi: le righe hanno altezza fissa, quindi non si spostano. */
function paintCards(): void {
    document.querySelectorAll<HTMLElement>('[data-card-icon]').forEach(el => {
        const size = el.classList.contains('agent-icon--16') ? 16 : el.classList.contains('agent-icon--20') ? 20 : 24;
        el.outerHTML = agentIconHtml(el.dataset.cardIcon ?? '', size);
    });
    document.querySelectorAll<HTMLElement>('[data-card-kind]').forEach(el => {
        el.outerHTML = agentKindHtml(el.dataset.cardKind ?? '');
    });
}

/** Legge le icone degli agent della solution aperta, dopo che la lista e' gia' disegnata. */
async function loadCards(agents: AgentListItem[], seq: number): Promise<void> {
    if (!agents.length) return;
    const cards = await loadAgentCards(agents);
    if (seq !== solutionDetailSeq) return;   // l'utente e' gia' passato ad altro
    cards.forEach((card, id) => state.cards.set(id, card));
    paintCards();
}

/** Casella rotonda a due colori per le righe di tabella: mai la checkbox nuda del browser. */
function checkHtml(attr: string, label: string, on: boolean): string {
    return `<label class="check">
        <input class="check-input" type="checkbox" ${attr}
            aria-label="${escapeHtml(label)}" ${on ? 'checked' : ''}>
        <span class="check-mark"></span>
    </label>`;
}

function agentRowsHtml(target: Target): string {
    const agents = solutionAgents();
    const out = excludedOf(target.name);
    const names = agents.map(a => ({ name: a.name, selected: !out.has(a.id) }));
    const suffix = target.name;
    const mixed = suffixesAfter(names, suffix);
    const label = targetLabel(target.name);
    return `
        <table class="data-table data-table--fill">
            <colgroup><col style="width:68px"><col style="width:28%"><col style="width:96px"><col style="width:28%"><col></colgroup>
            <thead><tr><th class="col-check">${checkHtml('data-agent-all', `Select or deselect all agents for ${label}`,
                agents.every(a => !out.has(a.id)))}</th><th>Agent</th><th>Agent type</th><th>Name after the rename</th><th>Publish on import</th></tr></thead>
            <tbody>${agents.map(a => {
                const on = !out.has(a.id);
                const next = buildName(a.name, suffix);
                const kept = splitSuffix(a.name).currentSuffix ?? '';
                const clash = !on && kept !== suffix.trim();   // un agent lasciato com'e' dice sempre che suffisso tiene
                const offText = clash
                    ? `left as it is <span class="cell-warn">— keeps ${kept ? `[${escapeHtml(kept)}]` : 'no suffix'}</span>`
                    : 'left as it is';
                return `
                <tr${on ? '' : ' class="is-off"'}>
                    <td class="col-check">${checkHtml(`data-agent="${escapeHtml(a.id)}"`, `Rename ${a.name} for ${label}`, on)}</td>
                    <td class="cell-strong" title="${escapeHtml(a.name)}">${agentCellHtml(a)}</td>
                    <td class="cell-type">${agentKindHtml(a.id)}</td>
                    <td class="${on ? 'cell-strong' : 'cell-muted'} cell-nowrap" title="${escapeHtml(next)}">${on
                        ? escapeHtml(next) + (next === a.name ? ' <span class="cell-muted">(unchanged)</span>' : '')
                        : offText}</td>
                    <td>${on ? publishToggleHtml(target.name, a.schemaName) : '<span class="cell-muted">—</span>'}</td>
                </tr>`;
            }).join('')}</tbody>
            <tfoot>
                <tr>
                    <td colspan="4" class="foot-cell">
                        <div class="select-bar">
                            <span class="select-count"><strong>${agents.length - out.size}</strong> of ${agents.length} selected</span>
                            <button type="button" class="chip-btn" data-select="all">Select all</button>
                            <button type="button" class="chip-btn" data-select="none">Deselect all</button>
                        </div>
                        <div class="foot-row">
                            <span class="hint">Publish on import carries the new name to Teams and Microsoft 365 Copilot.</span>
                            <span class="foot-label">Set for all ticked agents</span>
                        </div>
                    </td>
                    <td>${bulkToggleHtml(target.name)}</td>
                </tr>
            </tfoot>
        </table>
        ${agents.every(a => out.has(a.id))
            ? '<p class="hint hint--warn" style="margin-top:12px"><strong>Nothing to rename.</strong> This tool exists to rename agents: with none ticked the package would be identical to the solution in DEV, so there is nothing to build. To move a solution unchanged between environments, use the native solution export or your ALM pipeline. Tick at least one agent to continue.</p>' : ''}
        ${mixed.length > 1 ? mixedSuffixHtml(mixed, target.name) : ''}`;
}

/** Le righe della lista dei Target: casella, nome, publish on import, ordine e rimozione. */
function targetRowsHtml(): string {
    if (!state.targets.length) return '<li class="hint">No targets yet: add one below.</li>';
    return state.targets.map((t, i) => {
        const on = state.selectedTargets.includes(t.name);
        const label = targetLabel(t.name);
        return `
        <li class="target-card${on ? ' is-on' : ''}" data-target-index="${i}">
        <div class="target-row${on ? ' is-on' : ''}">
            <span class="target-handle" draggable="true" title="Drag to reorder" aria-hidden="true">&#8942;&#8942;</span>
            ${checkHtml('data-target-pick', `Build for ${label}`, on)}
            <input class="text-input target-name" type="text" data-target-name maxlength="${SUFFIX_MAX}"
                autocomplete="off" placeholder="(no suffix)" aria-label="Target name"
                value="${escapeHtml(t.name)}">
            <div class="toggle-group toggle-group--sm target-publish" role="group"
                aria-label="Publish on import for ${escapeHtml(label)}">${(Object.keys(PUBLISH_LABELS) as PublishMode[]).map(m => `
                <button type="button" class="toggle-btn${t.publishOnImport === m ? ' is-active' : ''}"
                    data-target-publish data-val="${m}">${PUBLISH_LABELS[m]}</button>`).join('')}
            </div>
            ${t.name.trim() ? '' : `<label class="check target-prod"
                title="The production target has no suffix on purpose: no warning for it.">
                <input class="check-input" type="checkbox" data-target-production
                    ${isProductionTarget(t) ? 'checked' : ''}>
                <span class="check-mark"></span><span>Production</span>
            </label>`}
            <span class="target-actions">
                <button type="button" class="btn btn--secondary btn--sm" data-target-act="up"
                    aria-label="Move ${escapeHtml(label)} up"${i === 0 ? ' disabled' : ''}>${icon('chevron-up', 'icon--sm')}</button>
                <button type="button" class="btn btn--secondary btn--sm" data-target-act="down"
                    aria-label="Move ${escapeHtml(label)} down"${i === state.targets.length - 1 ? ' disabled' : ''}>${icon('chevron-down', 'icon--sm')}</button>
                <button type="button" class="btn btn--secondary btn--sm" data-target-act="remove"
                    aria-label="Remove ${escapeHtml(label)}">${icon('close', 'icon--sm')}</button>
            </span>
        </div>
        ${on ? `<div class="target-agents" data-agents-for="${i}">${agentRowsHtml(t)}</div>` : ''}
        </li>`;
    }).join('');
}

function renderSuffixStep(): void {
    const sol = state.activeSolution;
    const agents = solutionAgents();
    if (!sol || !agents.length) { navigateTo('welcome'); return; }
    renderBreadcrumb();

    els.stepSuffix.innerHTML = `
        <div class="step-header step-header-row">
            <div class="step-id">${icon('tag')}<h2 class="step-title">Suffix for the target environment</h2></div>
            ${stepperHtml(1)}
        </div>

        <div class="stack">
                <section class="panel" id="targets-panel">
                    <div class="panel-head">
                        <h3 class="panel-heading">${icon('tag', 'icon--head')}Targets</h3>
                        <span class="panel-sub">tick the environments to build for; under each one, choose its agents and publish option</span>
                        <button type="button" id="target-restore-btn" class="btn btn--secondary btn--sm target-restore"
                            title="Put back the standard targets you removed (DEV, TEST, UAT, STAGING, PREPROD, PROD)"
                            ${missingPresets(state.targets).length ? '' : 'disabled'}>Restore defaults</button>
                    </div>
                    <div class="panel-body">
                        <div class="target-head" aria-hidden="true">
                            <span class="th-pick">Include</span>
                            <span class="th-name">Suffix after the agent name</span>
                            <span class="th-publish">Default publish on import</span>
                        </div>
                        <ul class="target-list" id="target-list">${targetRowsHtml()}</ul>
                        <p class="hint hint--warn" id="target-none"${selectedTargetList().length ? ' hidden' : ''}>
                            Tick at least one target to continue.</p>
                        <div class="target-add">
                            <div class="input-row">
                                <input id="target-new" class="text-input" type="text"
                                    maxlength="${SUFFIX_MAX}" autocomplete="off"
                                    placeholder="Add a target, e.g. HOTFIX">
                                <button type="button" id="target-add-btn" class="btn btn--secondary btn--sm">Add</button>
                                <button type="button" id="target-add-empty-btn" class="btn btn--secondary btn--sm"
                                    ${state.targets.some(t => t.name === '') ? 'hidden' : ''}>Add "no suffix"</button>
                            </div>
                            <p class="hint hint--warn" id="target-notice" role="alert">${escapeHtml(state.targetNotice)}</p>
                        </div>
                        <p class="hint" style="margin-top:8px">
                            A target without a suffix <strong>removes</strong> the existing one; tick <strong>Production</strong>
                            on it if that is your production target, and the warning will not appear.
                            Drag the handle or use the arrows to reorder. The list is remembered for this environment.
                        </p>
                    </div>
                </section>

                <section class="panel">
                    <div class="panel-head"><h3 class="panel-heading">${icon('sliders', 'icon--head')}Options</h3></div>
                    <div class="panel-body" style="padding:0">

                        <div class="opt-row" style="padding:12px 16px">
                            <div class="opt-main">
                                <div class="opt-label">Raise the version in DEV</div>
                                <div class="hint" id="version-hint">${versionHintNow()}</div>
                                <div class="version-field" id="version-field"${state.raiseVersion ? '' : ' hidden'}>
                                    <label class="hint" for="version-input">New version</label>
                                    <input id="version-input" class="text-input" type="text" autocomplete="off"
                                        spellcheck="false" value="${escapeHtml(chosenVersion())}">
                                    <span class="hint hint--warn" id="version-issue">${escapeHtml(versionIssue() ?? '')}</span>
                                </div>
                            </div>
                            <label class="switch" for="opt-version">
                                <input class="switch-input" type="checkbox" id="opt-version"
                                    ${state.raiseVersion ? 'checked' : ''}>
                                <span class="switch-track"><span class="switch-thumb"></span></span>
                            </label>
                        </div>

                    </div>
                </section>

                <section class="panel">
                    <div class="panel-head">
                        <div>
                            <h3 class="panel-heading">${icon('package', 'icon--head')}Artifacts</h3>
                            <span class="panel-sub">what lands on disk</span>
                        </div>
                        <label class="switch" for="opt-keep"
                            title="the patched unmanaged archive and the two original exports">
                            <span class="switch-text">Keep the extra copies</span>
                            <input class="switch-input" type="checkbox" id="opt-keep"
                                ${state.options.keepSourceArtifacts ? 'checked' : ''}>
                            <span class="switch-track"><span class="switch-thumb"></span></span>
                        </label>
                    </div>
                    <div class="panel-body" id="artifact-list">
                        ${artifactListHtml(sol, artifactTargetNames(), state.options.keepSourceArtifacts)}
                    </div>
                </section>
        </div>

        <div class="step-footer">
            <button class="btn btn--secondary" id="back-btn">${icon('arrow-left', 'icon--sm')} Back</button>
            <button class="btn btn--primary" id="next-btn">Review ${icon('arrow-right', 'icon--sm')}</button>
        </div>`;

    const refreshArtifacts = () => {
        const host = els.stepSuffix.querySelector('#artifact-list');
        if (host) {
            host.innerHTML = artifactListHtml(sol, artifactTargetNames(), state.options.keepSourceArtifacts);
        }
    };

    const nextBtn = els.stepSuffix.querySelector<HTMLButtonElement>('#next-btn')!;
    const listEl = els.stepSuffix.querySelector<HTMLElement>('#target-list')!;
    const refreshNext = () => {
        const noAgents = selectedTargetList().some(t => selectedAgents(t.name).length === 0);
        nextBtn.disabled = selectedTargetList().length === 0 || noAgents || versionIssue() !== null;
    };
    // "Seleziona tutti" nell'intestazione di ogni tabella: spuntato se tutti, a meta' se solo alcuni
    const syncSelectAll = () => {
        listEl.querySelectorAll<HTMLInputElement>('input[data-agent-all]').forEach(all => {
            const t = state.targets[Number(all.closest<HTMLElement>('[data-target-index]')?.dataset.targetIndex)];
            if (!t) return;
            const total = solutionAgents().length;
            const on = selectedAgents(t.name).length;
            all.checked = on === total;
            all.indeterminate = on > 0 && on < total;
        });
    };
    const setAllAgents = (target: Target, selected: boolean) => {
        const out = excludedOf(target.name);
        for (const a of solutionAgents()) {
            if (selected) out.delete(a.id);
            else out.add(a.id);
        }
    };

    // ── Targets: lista, spunte, nomi e ordine (spec 016)
    const newInput = els.stepSuffix.querySelector<HTMLInputElement>('#target-new')!;
    const addBtn = els.stepSuffix.querySelector<HTMLButtonElement>('#target-add-btn')!;
    const addEmptyBtn = els.stepSuffix.querySelector<HTMLButtonElement>('#target-add-empty-btn')!;
    const restoreBtn = els.stepSuffix.querySelector<HTMLButtonElement>('#target-restore-btn')!;
    const refreshTargets = () => {
        listEl.innerHTML = targetRowsHtml();
        restoreBtn.disabled = missingPresets(state.targets).length === 0;
        addEmptyBtn.hidden = state.targets.some(t => t.name === '');
        const none = els.stepSuffix.querySelector<HTMLElement>('#target-none');
        if (none) none.hidden = selectedTargetList().length > 0;
        renderTargetNotice();
        refreshArtifacts();
        syncSelectAll();
        refreshNext();
    };
    const complain = (message: string) => { state.targetNotice = message; renderTargetNotice(); };
    const add = (name: string) => {
        const problem = validateTargetName(name, state.targets);
        if (problem) { complain(problem); return; }
        state.targetNotice = '';
        state.targets = addTarget(state.targets, name);
        state.selectedTargets = [...state.selectedTargets, name.trim()];
        persistTargets();
        persistSelection();
        newInput.value = '';
        refreshTargets();
    };
    addBtn.addEventListener('click', () => {
        if (!newInput.value.trim()) { complain('Type a name for the target.'); return; }
        add(newInput.value);
    });
    newInput.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); addBtn.click(); }
    });
    addEmptyBtn.addEventListener('click', () => add(''));
    restoreBtn.addEventListener('click', () => {
        if (!missingPresets(state.targets).length) return;
        state.targets = restoreDefaults(state.targets);
        state.targetNotice = '';
        persistTargets();
        refreshTargets();
    });

    listEl.addEventListener('change', ev => {
        const el = ev.target as HTMLInputElement | HTMLSelectElement;
        const i = Number(el.closest<HTMLElement>('[data-target-index]')?.dataset.targetIndex);
        const target = state.targets[i];
        if (!target) return;
        if (el.matches('[data-agent-all]')) {
            setAllAgents(target, (el as HTMLInputElement).checked);
        } else if (el.matches('[data-agent]')) {
            const out = excludedOf(target.name);
            if ((el as HTMLInputElement).checked) out.delete(el.dataset.agent!);
            else out.add(el.dataset.agent!);
        } else if (el.matches('[data-target-pick]')) {
            const on = (el as HTMLInputElement).checked;
            state.selectedTargets = on
                ? [...state.selectedTargets, target.name]
                : state.selectedTargets.filter(n => n !== target.name);
            persistSelection();
        } else if (el.matches('[data-target-production]')) {
            state.targets = setTargetProduction(state.targets, i, (el as HTMLInputElement).checked);
            persistTargets();
        } else if (el.matches('[data-target-name]')) {
            const problem = validateTargetName(el.value, state.targets, i);
            if (problem) { complain(problem); el.value = target.name; return; }
            const from = target.name;
            const to = el.value.trim();
            state.targetNotice = '';
            state.targets = renameTarget(state.targets, i, to);
            state.selectedTargets = state.selectedTargets.map(n => (n === from ? to : n));
            if (state.activeTargetName === from) state.activeTargetName = to;
            // Le scelte per agent seguono il Target nel suo nuovo nome
            for (const map of [state.excludedByTarget, state.publishByTarget] as Map<string, unknown>[]) {
                if (map.has(from)) { map.set(to, map.get(from)); map.delete(from); }
            }
            persistTargets({ from, to });
            persistSelection();
        } else {
            return;
        }
        refreshTargets();
    });
    listEl.addEventListener('click', ev => {
        const node = ev.target as HTMLElement;
        const owner = state.targets[Number(node.closest<HTMLElement>('[data-target-index]')?.dataset.targetIndex)];
        const sel = node.closest<HTMLButtonElement>('button[data-select]');
        const toggle = node.closest<HTMLButtonElement>('.toggle-btn');
        if (owner && toggle?.hasAttribute('data-target-publish')) {
            // Il valore del Target vale per tutti i suoi agent: le eccezioni per agent si azzerano (D9)
            state.targets = setTargetPublish(state.targets, state.targets.indexOf(owner), toggle.dataset.val as PublishMode);
            state.publishByTarget.delete(owner.name);
            persistTargets();
            refreshTargets();
            return;
        }
        if (owner && sel) {
            setAllAgents(owner, sel.dataset.select === 'all');
            refreshTargets();
            return;
        }
        if (owner && toggle) {
            if (toggle.dataset.publish) {
                setPublishMode(owner.name, toggle.dataset.publish, toggle.dataset.val as PublishMode);
            } else if (toggle.dataset.publishAll) {
                for (const a of selectedAgents(owner.name)) setPublishMode(owner.name, a.schemaName, toggle.dataset.publishAll as PublishMode);
            } else {
                return;
            }
            refreshTargets();
            return;
        }
        const btn = node.closest<HTMLElement>('[data-target-act]');
        if (!btn) return;
        const i = Number(btn.closest<HTMLElement>('[data-target-index]')?.dataset.targetIndex);
        const act = btn.dataset.targetAct;
        if (act === 'up') state.targets = moveTarget(state.targets, i, i - 1);
        else if (act === 'down') state.targets = moveTarget(state.targets, i, i + 1);
        else if (act === 'remove') {
            const gone = state.targets[i]?.name;
            if (gone !== undefined) { state.excludedByTarget.delete(gone); state.publishByTarget.delete(gone); }
            state.targets = removeTarget(state.targets, i);
            state.selectedTargets = state.selectedTargets.filter(n => n !== gone);
            persistSelection();
        } else {
            return;
        }
        state.targetNotice = '';
        persistTargets();
        refreshTargets();
    });
    // Il trascinamento chiama la stessa funzione dei pulsanti: i test coprono quella
    let dragFrom = -1;
    listEl.addEventListener('dragstart', ev => {
        const row = (ev.target as HTMLElement).closest<HTMLElement>('[data-target-index]');
        if (!row) return;
        dragFrom = Number(row.dataset.targetIndex);
        ev.dataTransfer?.setData('text/plain', String(dragFrom));
        if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
        row.classList.add('is-dragging');
    });
    listEl.addEventListener('dragover', ev => { if (dragFrom >= 0) ev.preventDefault(); });
    listEl.addEventListener('drop', ev => {
        const row = (ev.target as HTMLElement).closest<HTMLElement>('[data-target-index]');
        if (!row || dragFrom < 0) return;
        ev.preventDefault();
        const from = dragFrom;
        dragFrom = -1;
        const to = Number(row.dataset.targetIndex);
        if (from !== to) {
            state.targets = moveTarget(state.targets, from, to);
            state.targetNotice = '';
            persistTargets();
        }
        refreshTargets();
    });
    listEl.addEventListener('dragend', () => {
        dragFrom = -1;
        listEl.querySelectorAll('.is-dragging').forEach(r => r.classList.remove('is-dragging'));
    });
    syncSelectAll();
    refreshNext();

    const refreshVersion = () => {
        syncVersionOption();
        const hint = els.stepSuffix.querySelector('#version-hint');
        if (hint) hint.innerHTML = versionHintNow();
        refreshArtifacts();
        const issue = els.stepSuffix.querySelector('#version-issue');
        if (issue) issue.textContent = versionIssue() ?? '';
        els.stepSuffix.querySelector<HTMLElement>('#version-field')!.hidden = !state.raiseVersion;
        refreshNext();
    };
    (document.getElementById('opt-version') as HTMLInputElement).addEventListener('change', ev => {
        state.raiseVersion = (ev.target as HTMLInputElement).checked;
        refreshVersion();
    });
    (document.getElementById('version-input') as HTMLInputElement).addEventListener('input', ev => {
        state.versionInput = (ev.target as HTMLInputElement).value;
        state.versionTouched = true;
        refreshVersion();
    });
    (document.getElementById('opt-keep') as HTMLInputElement).addEventListener('change', ev => {
        state.options.keepSourceArtifacts = (ev.target as HTMLInputElement).checked;
        refreshArtifacts();
    });

    els.stepSuffix.querySelector('#back-btn')!.addEventListener('click', () => navigateTo('solution'));
    els.stepSuffix.querySelector('#next-btn')!.addEventListener('click', async () => {
        if (selectedTargetList().some(needsNoSuffixWarning) && !(await confirmNoSuffix(sol))) return;
        persistSelection();
        navigateTo('review');
    });
}

// ── Step: anteprima del Patch Plan ────────────────────────────────────────────

/**
 * Step 2: l'ultima schermata prima che parta l'export.
 *
 * L'export di managed e unmanaged costa da 13 secondi a 5 minuti (research.md §13), quindi
 * la revisione va fatta *prima* di pagarlo, non dopo. Qui non si chiama Dataverse: si mostra
 * solo quello che si sa gia' dalla scelta dell'agent e dalle opzioni dello step precedente.
 */
/**
 * Gli avvisi della revisione, per ogni Target spuntato. L'elenco dei nomi non c'e': l'utente li ha
 * gia' visti, uno per uno, nel passo Suffix (spec 018, FR-001). Restano solo le cose che potrebbero
 * sorprenderlo: nomi oltre il limite di Teams, nessun cambio, suffissi misti nello stesso ambiente.
 */
function reviewWarningsHtml(): string {
    const list = selectedTargetList();
    const several = list.length > 1;
    const out: string[] = [];
    for (const t of list) {
        const who = several ? `<strong>${escapeHtml(targetLabel(t.name))}</strong> ` : '';
        const agents = selectedAgents(t.name);
        const next = agents.map(a => buildName(a.name, t.name));
        const long = next.filter(n => n.length > TEAMS_NAME_LIMIT).length;
        if (long) {
            out.push(`<p class="hint hint--warn">${who}${long === 1 ? '1 name is' : `${long} names are`} over
                ${TEAMS_NAME_LIMIT} characters, the limit of the Teams manifest. Packaging is not blocked.</p>`);
        }
        if (agents.every((a, i) => next[i] === a.name)) {
            out.push(`<p class="hint hint--warn">${who}No name changes: the agents already have these names.
                The package is still produced.</p>`);
        }
        const gone = state.excludedByTarget.get(t.name);
        const mixed = suffixesAfter(solutionAgents().map(a => ({ name: a.name, selected: !gone?.has(a.id) })), t.name);
        if (mixed.length > 1) out.push(mixedSuffixHtml(mixed, t.name));
    }
    return out.join('');
}

function renderReviewStep(): void {
    const sol = state.activeSolution;
    if (!sol || !selectedAgents().length) { navigateTo('welcome'); return; }
    renderBreadcrumb();

    const n = selectedTargetList().length;
    const writes = state.options.newVersion !== null;
    els.stepReview.innerHTML = `
        <div class="step-header step-header-row">
            <div class="step-id">${icon('check')}<h2 class="step-title">Review before the export</h2></div>
            ${stepperHtml(2)}
        </div>

        <div class="stack">
            <section class="panel">
                <div class="panel-head">
                    <h3 class="panel-heading">${icon('pencil', 'icon--head')}Rename</h3>
                    <span class="panel-sub">${n > 1 ? `${n} packages from one export` : '1 package'}</span>
                </div>
                <div class="panel-body">
                    <div class="kv"><span class="kv-key">Solution</span>
                        <span class="kv-val">${escapeHtml(sol.friendlyName || sol.uniqueName)}
                        <span class="cell-muted">${escapeHtml(sol.version)}</span></span></div>
                    ${targetsOverviewHtml(sol)}
                    ${reviewWarningsHtml()}
                </div>
            </section>

            <section class="panel">
                <div class="panel-head">
                    <h3 class="panel-heading">${icon('sliders', 'icon--head')}Options</h3>
                </div>
                <div class="panel-body">
                    <div class="kv"><span class="kv-key">Version</span>
                        <span class="kv-val" id="review-version">${versionHintNow()}</span></div>
                    <div class="kv"><span class="kv-key">Artifacts produced</span>
                        <span class="kv-val">${archiveCount()} ${archiveCount() === 1 ? 'archive' : 'archives'}
                            <span class="cell-muted">${state.options.keepSourceArtifacts
                                ? '— managed and unmanaged for each target, and the two originals'
                                : '— only the managed ones to import'}</span> + manifest</span></div>
                    <ul class="facts">
                        <li>${icon('shield', 'icon--sm')}
                            <span>${writes
                                ? '<strong>The only change to Dataverse is the solution version</strong> in DEV, which you confirm before the build.'
                                : '<strong>Nothing is written to Dataverse</strong>: the artifacts are born on disk.'}</span></li>
                    </ul>
                </div>
            </section>
        </div>

        <div class="step-footer">
            <button class="btn btn--secondary" id="back-btn">${icon('arrow-left', 'icon--sm')} Back</button>
            <button class="btn btn--primary" id="next-btn">
                ${icon('package', 'icon--sm')} Build the package</button>
        </div>`;

    els.stepReview.querySelector('#back-btn')!.addEventListener('click', () => navigateTo('suffix'));
    els.stepReview.querySelector('#next-btn')!.addEventListener('click', async () => {
        if (state.options.newVersion && !(await confirmVersionWrite(sol))) return;
        navigateTo('preview');
    });
}

/**
 * Alzare la versione e' l'unica scrittura del tool su Dataverse, e non si annulla da qui:
 * prima di farla si dice dove, su quale solution, da quale numero a quale, e che cosa fare
 * per tornare indietro (marketplace policy: nessuna modifica a un ambiente senza consenso).
 */
function confirmVersionWrite(sol: Solution): Promise<boolean> {
    return askConfirm({
        title: 'Change the solution version in DEV',
        warning: true,
        wide: selectedTargetList().length > 1,
        okLabel: 'Change the version and build',
        cancelLabel: 'Go back',
        bodyHtml: `
            <p class="warn-lead">Before exporting, the tool <strong>writes to this environment</strong>:</p>
            <ul class="warn-list">
                <li>Environment: <strong>${escapeHtml(state.connectionName || 'DEV')}</strong>${state.connectionUrl
                    ? ` <span class="cell-muted">(${escapeHtml(state.connectionUrl)})</span>` : ''}</li>
                <li>Solution: <strong>${escapeHtml(sol.uniqueName)}</strong></li>
                <li>Version: <code>${escapeHtml(state.versionFrom)}</code> <span class="warn-arrow">${icon('arrow-right', 'icon--xs')}</span>
                    <code>${escapeHtml(state.options.newVersion ?? '')}</code></li>
            </ul>
            <p>Scope: <strong>one property of one solution</strong>. This is the only change the tool makes to
                the environment. Agents, components and variables are not touched.</p>
            ${selectedTargetList().length > 1 ? `
            <p>Then it exports <strong>once</strong> and builds <strong>${selectedTargetList().length} packages</strong>,
                one for each target, all with this version:</p>
            ${targetsOverviewHtml(sol)}` : ''}
            <p class="hint">The tool cannot undo it. To go back, set the previous version in the solution's
                properties in the portal. To keep a copy of the current state, export the solution
                before continuing. To skip the change, go back and turn off "Raise the version".</p>`,
    });
}

/** I Target spuntati con le scelte di ognuno: i suoi agent e le sue eccezioni di publish (D8). */
function targetRuns(): TargetRun[] {
    return selectedTargetList().map(t => ({
        name: t.name,
        publishOnImport: t.publishOnImport,
        agents: selectedAgents(t.name).map(a => a.schemaName),
        publishByAgent: { ...(state.publishByTarget.get(t.name) ?? {}) },
    }));
}

function renderPreviewStep(): void {
    const runs = targetRuns();
    const sol = state.activeSolution;
    if (!sol || !runs.length || runs.some(r => !r.agents?.length)) { navigateTo('welcome'); return; }
    renderBreadcrumb();

    els.stepPreview.innerHTML = `
        <div class="step-header step-header-row">
            <div class="step-id">${icon('package')}<h2 class="step-title">Package preview</h2></div>
            ${stepperHtml(3)}
        </div>
        <div class="strip" id="preview-body">
            <div class="pack-wait" id="preview-progress">
                ${packProgressHtml(0, 'starting…', 0, phasesFor(state.options.newVersion !== null))}
            </div>
        </div>
        <div id="preview-panels"></div>
        <div class="step-footer" id="preview-footer">
            <button class="btn btn--secondary" id="back-btn">${icon('arrow-left', 'icon--sm')} Back</button>
        </div>`;
    els.stepPreview.querySelector('#back-btn')!.addEventListener('click', () => navigateTo('review'));

    // Tornare indietro e riavanzare non deve rifare l'export: sulla solution piu' pesante
    // dell'environment di riferimento la coppia costa 111 secondi (research.md §13).
    const key = packagingKey(sol, runs);
    if (state.packaging && state.packagingKey === key) {
        renderPreviewResult(targetView(state.packaging, activeIndex(state.packaging)));
        return;
    }
    state.packaging = null;
    void runPreview(sol, runs, ++previewSeq, key);
}

/** Tutto ciò che, cambiando, rende obsoleto il package già preparato. */
function packagingKey(sol: Solution, runs: TargetRun[]): string {
    return JSON.stringify([sol.uniqueName,
        runs.map(r => [r.name, r.publishOnImport, [...(r.agents ?? [])].sort(), r.publishByAgent]), state.options]);
}

/** Le fasi del packaging, nell'ordine in cui il servizio le attraversa. */
const PACK_PHASES = [
    'Export managed',
    'Export unmanaged',
    'Read the packages',
    'Patch and verify',
] as const;
const VERSION_PHASE = 'Raise the version in DEV';
/** Con la versione da alzare si aggiunge una fase in testa: e' la prima cosa che succede. */
const phasesFor = (raise: boolean): string[] => (raise ? [VERSION_PHASE, ...PACK_PHASES] : [...PACK_PHASES]);

/**
 * A che punto siamo, dedotto dal messaggio del servizio.
 *
 * Il servizio riporta testo libero, non un indice: leggerlo qui evita di cambiare la sua
 * firma per un bisogno che e' solo di presentazione. Una frase che non si riconosce lascia
 * la fase dov'era, invece di farla saltare all'indietro.
 */
function phaseFromMessage(msg: string, current: number, phases: string[]): number {
    const m = msg.toLowerCase();
    const at = (label: string) => {
        const i = phases.indexOf(label);
        return i < 0 ? current : i;
    };
    if (m.includes('patch')) return at('Patch and verify');
    if (m.includes('read')) return at('Read the packages');
    if (m.includes('unmanaged')) return at('Export unmanaged');
    if (m.includes('export') || m.includes('queue')) return at('Export managed');
    if (m.includes('version')) return at(VERSION_PHASE);
    return current;
}

/** Il riquadro di attesa: barra indeterminata, fasi con il loro stato, messaggio e secondi. */
function packProgressHtml(phase: number, msg: string, seconds: number, phases: string[]): string {
    const done = phase >= phases.length;
    const rows = phases.map((label, i) => {
        const state = i < phase ? 'done' : i === phase ? 'running' : 'todo';
        const mark = state === 'done' ? icon('check', 'icon--xs') : '';
        return `<li class="ph ph--${state}"><span class="ph-dot">${mark}</span>${label}</li>`;
    }).join('');
    return `
        <div class="pack-bar${done ? ' pack-bar--done' : ''}"><span></span></div>
        <ul class="ph-list">${rows}</ul>
        <p class="pack-msg">${escapeHtml(msg)} · <strong>${seconds} s</strong></p>`;
}

/** Quanto resta visibile lo stato "completed" prima di passare al risultato: 900 ms sembravano uno scatto. */
const DONE_HOLD_MS = 1800;

let previewSeq = 0;

async function runPreview(
    sol: Solution, runs: TargetRun[], seq: number, key: string,
): Promise<void> {
    const startedAt = Date.now();
    const phases = phasesFor(state.options.newVersion !== null);
    let lastText = 'starting…';
    let phase = 0;
    const paint = () => {
        if (seq !== previewSeq) return;
        const el = els.stepPreview.querySelector('#preview-progress');
        if (!el) return;
        const s = Math.round((Date.now() - startedAt) / 1000);
        el.innerHTML = packProgressHtml(phase, lastText, s, phases);
    };
    // Il tempo trascorso va mostrato sempre: l'export sincrono costa 13-111 s sulle solution
    // misurate, il fallback asincrono ~154 s per archivio. Senza un contatore sembra bloccato.
    const ticker = window.setInterval(paint, 1000);
    const setProgress = (text: string) => {
        lastText = text;
        phase = phaseFromMessage(text, phase, phases);
        paint();
    };
    try {
        // Un solo export e una sola versione per tutti i Target spuntati, nell'ordine della lista
        const result = await runPackagingTargets(sol.uniqueName, runs, [], state.options, setProgress)
            .finally(() => window.clearInterval(ticker));
        if (seq !== previewSeq) return;     // l'utente è già andato altrove

        // Un istante con tutte le fasi chiuse prima di cambiare schermata: il lavoro e' durato
        // decine di secondi, sparire di colpo lascia il dubbio che sia finito davvero.
        phase = phases.length;
        lastText = 'completed';
        paint();
        await new Promise(r => window.setTimeout(r, DONE_HOLD_MS));
        if (seq !== previewSeq) return;

        state.packaging = result;
        state.packagingKey = key;
        renderPreviewResult(targetView(result, activeIndex(result)));
    } catch (err) {
        window.clearInterval(ticker);
        if (seq !== previewSeq) return;
        state.packaging = null;
        state.packagingKey = '';
        const body = document.getElementById('preview-body');
        if (body) {
            body.innerHTML = `
                <div class="empty-state">
                    <p><strong>The package could not be prepared.</strong></p>
                    <p class="hint">${escapeHtml(describeError(err))}</p>
                    <button class="btn btn--secondary" id="retry-btn">Retry</button>
                </div>`;
            els.stepPreview.querySelector('#retry-btn')!.addEventListener('click', () => renderPreviewStep());
        }
        log(`Packaging failed: ${describeError(err)}`, 'error');
    }
}

const CHANGE_LABEL: Record<PatchChange['element'], string> = {
    name: 'Name', publishOnImport: 'Publish on import',
};

/**
 * "What gets changed", raggruppato per agent: un blocco per ogni agent toccato, con le sue
 * righe (nome, publish on import). La versione non e' un cambio del package: si alza in DEV. Il percorso del
 * file resta sotto ogni riga: FR-075 chiede di mostrare quello esatto.
 */
function changeGroupsHtml(r: PackagingResult): string {
    if (!r.plan.length) return '<p class="cell-muted">Nothing to change.</p>';
    const pkg = r.managed.source;
    const outcomes = agentOutcomes(pkg, r.plan);
    const nameOf = (schema: string, fallback: string) =>
        outcomes.find(o => o.schemaName === schema)?.after ?? fallback;

    const row = (c: PatchChange) => `
        <tr>
            <td class="cell-strong">${CHANGE_LABEL[c.element]}
                <div class="cell-sub"><code>${escapeHtml(c.file)}</code></div></td>
            <td class="cell-muted">${escapeHtml(c.before ?? '—')}</td>
            <td class="cell-strong cell-nowrap">${escapeHtml(c.after)}</td>
            <td><span class="chip chip--${c.state === 'no-change' ? 'muted' : 'success'}">${c.state}</span>
                ${c.exceedsTeamsLimit ? '<span class="chip chip--warning">&gt; 30 char</span>' : ''}</td>
        </tr>`;
    const group = (title: string, sub: string, iconName: IconName, changes: PatchChange[], key: string) => `
        <section class="change-group" data-group="${escapeHtml(key)}">
            <header class="change-head">
                ${icon(iconName, 'icon--head')}
                <strong>${escapeHtml(title)}</strong>
                <code>${escapeHtml(sub)}</code>
                <span class="chip chip--muted">${changes.length} ${changes.length === 1 ? 'change' : 'changes'}</span>
            </header>
            <table class="data-table data-table--fill">
                <colgroup><col style="width:30%"><col style="width:26%"><col style="width:26%"><col></colgroup>
                <thead><tr><th>What</th><th>Before</th><th>After</th><th>State</th></tr></thead>
                <tbody>${changes.map(row).join('')}</tbody>
            </table>
        </section>`;

    const perAgent = pkg.agents
        .map(a => ({
            agent: a,
            changes: r.plan.filter(c => c.file === a.file
                || c.file === a.file.replace(/bot\.xml$/, 'configuration.json')),
        }))
        .filter(x => x.changes.length)
        .sort((x, y) => nameOf(x.agent.schemaName, x.agent.name)
            .localeCompare(nameOf(y.agent.schemaName, y.agent.name)));
    const left = outcomes.filter(o => o.excluded);

    return `
        ${perAgent.map(x => group(
            nameOf(x.agent.schemaName, x.agent.name), x.agent.schemaName, 'bot', x.changes,
            `agent:${x.agent.schemaName}`)).join('')}
        ${r.versionChange ? `
        <p class="note-version" id="version-note">${r.versionChange.changed
            ? `Version raised <strong>in DEV</strong> before the export: <code>${escapeHtml(r.versionChange.from)}</code>
               → <code>${escapeHtml(r.versionChange.to)}</code>. The package carries it.`
            : `DEV was already at <code>${escapeHtml(r.versionChange.to)}</code>: nothing was written.`}</p>` : ''}
        ${left.length ? `
        <p class="hint">Left as they are: ${left.map(o => `<strong>${escapeHtml(o.before)}</strong>`).join(', ')}.</p>` : ''}`;
}

function renderPreviewResult(r: PackagingResult): void {
    const body = document.getElementById('preview-body');
    if (!body) return;
    const pkg = r.managed.source;

    body.innerHTML = `
        ${statsHtml([
            { label: 'Version', value: pkg.version },
            { label: 'Publisher', value: pkg.publisherUniqueName, sub: pkg.publisherPrefix },
            { label: 'Entries', value: String(pkg.entries.length) },
            { label: 'Export time', value: `${r.exportSeconds.toFixed(1)} s`, sub: r.exportMode },
        ])}`;

    // Publish on import per agent: il valore che avra' il package dopo la patch, non quello
    // esportato (che sta gia' nella tabella dei cambi). "Force yes/no" lo cambia solo se il
    // plan lo prevede.
    const outcomes = agentOutcomes(pkg, r.plan);
    const publishRows = pkg.agents.map(a => {
        const change = r.plan.find(c => c.element === 'publishOnImport'
            && c.file === a.file.replace(/bot\.xml$/, 'configuration.json'));
        return {
            after: outcomes.find(o => o.schemaName === a.schemaName)?.after ?? a.name,
            excluded: outcomes.find(o => o.schemaName === a.schemaName)?.excluded ?? false,
            publishAfter: change ? change.after === 'true' : a.publishOnImport,
            channels: a.channels,
        };
    });
    const publishLabelOf = (v: boolean | null) => v === null ? 'not specified' : v ? 'yes' : 'no';

    // Il contenuto vero sta nei pannelli sotto la card: la card tiene solo il riepilogo
    const panels = document.getElementById('preview-panels');
    if (panels) {
        panels.innerHTML = `
            <div id="preview-switch-host">${targetSwitchHtml()}</div>
            <section class="panel">
                <div class="panel-head">
                    <h3 class="panel-heading">${icon('pencil', 'icon--head')}What gets changed</h3>
                    <span class="panel-sub">grouped by agent</span>
                </div>
                <div class="panel-body">
                    ${changeGroupsHtml(r)}
                    <p class="hint" style="margin-top:12px">
                        <strong>Not</strong> touched: <code>schemaname</code>, folder and file
                        names, GUIDs, <code>[Content_Types].xml</code>, <code>customizations.xml</code>.
                        No global text replacement.
                    </p>
                </div>
            </section>

            <section class="panel">
                <div class="panel-head">
                    <h3 class="panel-heading">${icon('send', 'icon--head')}Publish and channels</h3>
                    <span class="panel-sub">what the package will carry, per agent</span>
                </div>
                <div class="panel-body">
                    ${publishRows.map(row => `
                        <h4 class="section-title" style="margin-top:${row === publishRows[0] ? 0 : 16}px">
                            ${escapeHtml(row.after)}${row.excluded
                                ? ' <span class="cell-muted">— left as it is</span>' : ''}</h4>
                        <div class="kv"><span class="kv-key">Publish on import</span>
                            <span class="kv-val kv-val--strong">${publishLabelOf(row.publishAfter)}</span></div>
                        <div class="kv"><span class="kv-key">Channels</span>
                            <span class="kv-val">${row.channels.length
                                ? `<span class="channel-row">${row.channels.map(channelChip).join('')}</span>`
                                : '<span class="cell-muted">none</span>'}</span></div>`).join('')}
                    ${publishRows.some(r => r.publishAfter !== true) ? `
                    <p class="hint hint--warn" style="margin-top:12px">
                        Without a publish in the target environment the name changes only in
                        Copilot Studio and <strong>stays the old one on Teams and M365</strong>.
                        Not publishing on import: ${publishRows.filter(r => r.publishAfter !== true)
                            .map(r => escapeHtml(r.after)).join(', ')}.
                    </p>` : ''}
                </div>
            </section>`;
    }

    bindTargetSwitch(document.getElementById('preview-switch-host'), () => {
        if (state.packaging) renderPreviewResult(targetView(state.packaging, activeIndex(state.packaging)));
    });

    const footer = document.getElementById('preview-footer');
    if (footer) {
        footer.innerHTML = `
            <button class="btn btn--secondary" id="back-btn">${icon('arrow-left', 'icon--sm')} Back</button>
            <button class="btn btn--primary" id="to-verify-btn">
                Checks ${icon('arrow-right', 'icon--sm')}</button>`;
        footer.querySelector('#back-btn')!.addEventListener('click', () => navigateTo('review'));
        footer.querySelector('#to-verify-btn')!.addEventListener('click', () => navigateTo('verify'));
    }
}

/** Pallino di esito. `partial` esiste perche' "qualche entry intatta" non e' ne' ok ne' ko. */
function dotHtml(state: 'ok' | 'partial' | 'ko', title: string): string {
    return `<span class="dot dot--${state}" title="${escapeHtml(title)}"></span>`;
}

/**
 * Una riga della matrice dei controlli: un package, i suoi quattro esiti in colonna.
 *
 * `describeVerification` concatena gli stessi quattro in una frase: va bene nel log, dove
 * una riga sola e' quello che serve, ma a schermo nascondeva *quale* controllo fosse
 * passato. Affiancando managed e unmanaged la differenza fra i due si vede subito.
 */
function checkRowHtml(label: string, v: VerificationResult, expectedEntries: number): string {
    const bytes = v.byteIdenticalEntries === expectedEntries ? 'ok'
        : v.byteIdenticalEntries > 0 ? 'partial' : 'ko';
    const yn = (b: boolean) => b ? 'yes' : 'no';
    return `
        <tr>
            <td class="cell-strong">${escapeHtml(label)}</td>
            <td>${dotHtml(v.archiveReadable ? 'ok' : 'ko', yn(v.archiveReadable))}</td>
            <td>${dotHtml(v.entryCountMatches ? 'ok' : 'ko', yn(v.entryCountMatches))}</td>
            <td>${dotHtml(v.patchedValuesConfirmed ? 'ok' : 'ko', yn(v.patchedValuesConfirmed))}</td>
            <td>${dotHtml(bytes, `${v.byteIdenticalEntries} of ${expectedEntries}`)}
                <span class="check-count">${v.byteIdenticalEntries}/${expectedEntries}</span></td>
        </tr>`;
}

/** Con piu' Target: l'esito di ciascuno e quanto differisce dal primo (spec 016, FR-013). */
function targetsMatrixHtml(multi: MultiPackagingResult): string {
    if (multi.targets.length < 2) return '';
    const total = multi.targets[0]!.managed.source.entries.length;
    return `
        <section class="panel">
            <div class="panel-head">
                <h3 class="panel-heading">${icon('layers', 'icon--head')}Targets</h3>
                <span class="panel-sub">each one compared with ${escapeHtml(targetLabel(multi.targets[0]!.target.name))}, the first</span>
            </div>
            <div class="panel-body">
                <table class="data-table" id="targets-matrix">
                    <thead><tr><th>Target</th><th>Checks</th><th>Names changed</th><th>Publish changed</th>
                        <th class="col-num">Identical entries</th></tr></thead>
                    <tbody>${multi.targets.map(tr => {
                        const c = tr.comparison;
                        return `
                        <tr>
                            <td class="cell-strong">${escapeHtml(targetLabel(tr.target.name))}</td>
                            <td>${dotHtml(tr.valid ? 'ok' : 'ko', tr.valid ? 'passed' : 'failed')}</td>
                            <td>${c ? c.differing.filter(d => d.kind === 'agent-name').length : '—'}</td>
                            <td>${c ? c.differing.filter(d => d.kind === 'publish-on-import').length : '—'}</td>
                            <td class="col-num">${c ? `${c.identicalEntries} of ${total}` : 'reference'}</td>
                        </tr>`;
                    }).join('')}</tbody>
                </table>
                <p class="hint" style="margin-top:12px">
                    Every archive starts from the same export: they may differ only in the agent names
                    and in publish on import. Anything else fails the checks.
                </p>
            </div>
        </section>`;
}

/**
 * Step 3: i controlli che dicono se l'artefatto e' utilizzabile.
 *
 * Separato dall'anteprima perche' risponde a un'altra domanda — non "cosa cambia" ma "e'
 * sicuro" — e perche' insieme i due riempivano una schermata sola troppo lunga da leggere.
 * Non rifa' nulla: legge il risultato gia' in `state.packaging`.
 */
function renderVerifyStep(): void {
    const multi = state.packaging;
    if (!multi) { navigateTo('preview'); return; }
    const r = targetView(multi, activeIndex(multi));
    renderBreadcrumb();

    const pkg = r.managed.source;
    const unexpected = pkg.nameOccurrences.filter(o => !o.expected);
    // Posti noti che il tool non tocca e che portano ancora il suffisso vecchio: un agent
    // creato gia' con `[DEV]` ce l'ha anche nel nome del suo componente GPT (FR-096)
    const notableDrift = relevantDrift(pkg.drift);
    const keptOld = pkg.nameOccurrences.filter(
        o => o.expected && !o.willBePatched && splitSuffix(o.value).currentSuffix !== null);
    const changedEntries = pkg.entries.length - r.managed.expectedIdenticalEntries;
    const extra = pkg.inventory.filter(c => !c.relatedToSelectedAgent);
    const v = r.managed.verification;
    const vu = r.unmanaged.verification;

    els.stepVerify.innerHTML = `
        <div class="step-header step-header-row">
            <div class="step-id">${icon('shield')}<h2 class="step-title">Artifact checks</h2></div>
            ${stepperHtml(4)}
        </div>

        <section class="panel">
            <div class="panel-head">
                <h3 class="panel-heading">${icon('package', 'icon--head')}Package contents</h3>
                <span class="panel-sub">what travels on import</span>
            </div>
            <div class="panel-body">
                <table class="data-table">
                    <thead><tr>
                        <th>Folder</th><th>Type</th><th class="col-num">Count</th><th></th>
                    </tr></thead>
                    <tbody>${pkg.inventory.map(c => `
                        <tr>
                            <td class="cell-strong">
                                ${icon('folder', 'icon--folder icon--sm')}
                                <code>${escapeHtml(c.path)}</code></td>
                            <td>${escapeHtml(c.kind)}</td>
                            <td class="col-num">${c.count}</td>
                            <td class="col-action">${c.relatedToSelectedAgent ? ''
                                : '<span class="chip chip--warning">beyond the agent</span>'}</td>
                        </tr>`).join('')}</tbody>
                </table>
                ${extra.length ? `
                <div class="note note--warn">
                    The artifact is the <strong>whole solution</strong>: everything above
                    travels on import, not just the agent.
                </div>` : ''}
            </div>
        </section>

        <section class="panel">
            <div class="panel-head">
                <h3 class="panel-heading">${icon('shield', 'icon--head')}Checks</h3>
                <span class="panel-sub">managed and unmanaged side by side</span>
                <div id="target-switch-host">${targetSwitchHtml()}</div>
            </div>
            <div class="panel-body">
                <table class="data-table check-matrix">
                    <thead><tr>
                        <th>Package</th>
                        <th>Archive readable</th>
                        <th>Entry count</th>
                        <th>Patched values</th>
                        <th>Byte-identical entries</th>
                    </tr></thead>
                    <tbody>
                        ${checkRowHtml('Managed', v, r.managed.expectedIdenticalEntries)}
                        ${checkRowHtml('Unmanaged', vu, r.unmanaged.expectedIdenticalEntries)}
                    </tbody>
                </table>

                <div class="kv" style="margin-top:var(--sp-4)">
                    <span class="kv-key">Name occurrences</span>
                    <span class="kv-val">${pkg.nameOccurrences.length} found,
                    ${unexpected.length} unexpected</span></div>
                ${unexpected.length ? `
                <div class="note note--warn">
                    The name appears in places the tool does not know: ${unexpected.map(o =>
                        `<code>${escapeHtml(o.file)}</code> ${escapeHtml(o.locator)}`).join(', ')}.
                    Those places would <strong>not</strong> be patched.
                </div>` : ''}
                ${keptOld.length ? `
                <p class="hint" style="margin-top:12px">
                    Left as it is, on purpose: the name of the agent's GPT component, which keeps
                    its old suffix (${keptOld.map(o => `<code>${escapeHtml(o.file)}</code>`).join(', ')}).
                    It is an internal name; the one shown on channels comes from the agent.
                </p>` : ''}
                ${notableDrift.length ? `
                <h4 class="section-title">Package format</h4>
                <div class="note note--warn">
                    The package no longer has something this tool changes. Check the result
                    before you import it:
                    <ul class="drift-list">${notableDrift.map(d =>
                        `<li>${escapeHtml(d.what)} <span class="cell-muted">(vs ${escapeHtml(d.against)})</span></li>`).join('')}</ul>
                </div>` : ''}
            </div>
        </section>

        ${targetsMatrixHtml(multi)}

        <div class="result-banner result-banner--${r.valid ? 'success' : 'error'}">
            ${r.valid
                ? `Packages ready and verified: managed and unmanaged, with ${changedEntries} ${changedEntries === 1 ? 'entry' : 'entries'} changed.`
                : 'The checks did not pass: the artifact is unusable. The original exports remain importable.'}
        </div>

        <div class="step-footer">
            <button class="btn btn--secondary" id="back-btn">${icon('arrow-left', 'icon--sm')} Back</button>
            <button class="btn btn--primary" id="save-btn" ${r.valid ? '' : 'disabled'}>
                ${icon('download', 'icon--sm')} Save the artifact set</button>
        </div>`;

    bindTargetSwitch(els.stepVerify.querySelector('#target-switch-host'), renderVerifyStep);
    els.stepVerify.querySelector('#back-btn')!.addEventListener('click', () => navigateTo('preview'));
    const saveBtn = els.stepVerify.querySelector('#save-btn');
    // Suffissi che gli agent avranno DOPO la patch, esclusi compresi (FR-023a), per ogni Target
    const mixed = multi.targets.flatMap(tr => {
        const labels = suffixesAfter(pkg.agents.map(a => ({
            name: a.name,
            selected: tr.plan.some(c => c.element === 'name' && c.file === a.file),
        })), tr.target.name);
        return labels.length > 1 ? [{ target: tr.target.name, labels }] : [];
    });
    if (saveBtn) saveBtn.addEventListener('click', () => void confirmThenSave(unexpected, extra, mixed));
}
/**
 * I due casi che richiedono un assenso esplicito prima di produrre un artefatto.
 *
 * Non sono avvisi: un avviso si ignora senza accorgersene, e qui si rischia o un package
 * patchato a meta' (FR-096) o un import che porta con se' componenti che nessuno si aspettava
 * (FR-091). Ogni conferma finisce nel manifest.
 */
async function confirmThenSave(
    unexpected: NameOccurrence[],
    extra: PackageComponent[],
    mixed: { target: string; labels: string[] }[],
): Promise<void> {
    if (mixed.length) {
        const describe = (labels: string[]) => labels.map(s => s ? `[${s}]` : 'no suffix').join(', ');
        const several = (state.packaging?.targets.length ?? 1) > 1;
        const labelsText = several
            ? mixed.map(m => `${targetLabel(m.target)}: ${describe(m.labels)}`).join('; ')
            : describe(mixed[0]!.labels);
        const ok = await askConfirm({
            title: 'The agents would have different suffixes',
            okLabel: 'Continue anyway',
            danger: true,
            bodyHtml: `
                <p>After the rename the agents of this solution carry
                <strong>${escapeHtml(labelsText)}</strong>: different suffixes in the
                same environment.</p>
                <p class="hint">This usually means an agent was left out by mistake. Go back and
                tick it, or continue if it is intended.</p>`,
        });
        if (!ok) { log('Save cancelled: mixed suffixes not confirmed.', 'warning'); return; }
        state.confirmations.push({
            what: `mixed suffixes after the rename: ${labelsText}`,
            confirmedAt: new Date().toISOString(),
        });
    }

    if (unexpected.length) {
        const ok = await askConfirm({
            title: 'The name appears in unexpected places',
            okLabel: 'Understood, continue',
            danger: true,
            bodyHtml: `
                <p>The agent display name was also found here, where the tool will
                <strong>not</strong> patch it:</p>
                <ul>${unexpected.map(o =>
                    `<li><code>${escapeHtml(o.file)}</code> ${escapeHtml(o.locator)}</li>`).join('')}</ul>
                <p class="hint">Normally the name appears in one place only. If more show up, the
                package format may have changed and the patch would be
                <strong>incomplete</strong>.</p>`,
        });
        if (!ok) { log('Save cancelled: unexpected occurrences not confirmed.', 'warning'); return; }
        state.confirmations.push({
            what: `unexpected name occurrences: ${unexpected.map(o => o.file).join(', ')}`,
            confirmedAt: new Date().toISOString(),
        });
    }

    if (extra.length) {
        const ok = await askConfirm({
            title: 'The package holds more than the agent',
            okLabel: 'Continue',
            bodyHtml: `
                <p>The artifact is the <strong>whole solution</strong>: the following also travels
                on import.</p>
                <ul>${extra.map(c =>
                    `<li>${escapeHtml(c.kind)} — ${c.count}</li>`).join('')}</ul>
                <p class="hint">Microsoft warns that unmodified components included in an update
                create layers on top of existing ones and may disable their
                customizations.</p>`,
        });
        if (!ok) { log('Save cancelled: extra components not confirmed.', 'warning'); return; }
        state.confirmations.push({
            what: `components beyond the agent: ${extra.map(c => `${c.kind} x${c.count}`).join(', ')}`,
            confirmedAt: new Date().toISOString(),
        });
    }

    await saveArtifactSet();
}

// ── Salvataggio dell'artifact set ─────────────────────────────────────────────

/**
 * Chiede dove scrivere, produce l'artifact set e lo registra nello storico.
 *
 * Il salvataggio parte solo se **entrambi** gli archivi hanno superato la verifica: consegnare
 * un set in cui managed e unmanaged non concordano sarebbe peggio che non consegnarlo (FR-085).
 */
async function saveArtifactSet(): Promise<void> {
    const r = state.packaging;
    const sol = state.activeSolution;
    if (!r || !sol) return;
    if (!r.valid) {
        log('The checks did not pass: no artifact is written.', 'error');
        return;
    }

    const folder = await selectFolder('Where to save the artifact set');
    if (!folder) { log('Save cancelled.'); return; }

    const btn = els.stepVerify.querySelector('#save-btn') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
        const written = await writeArtifactSet(folder, {
            result: r,
            options: state.options,
            sourceEnvironmentUrl: state.connectionName,
            user: state.connectionName,
            confirmations: state.confirmations,
            confirmOverwrite: folderName => askConfirm({
                title: 'That folder already exists',
                okLabel: 'Overwrite',
                danger: true,
                bodyHtml: `<p>In <code>${escapeHtml(folder)}</code> a folder named
                    <strong>${escapeHtml(folderName)}</strong> already exists.</p>
                    <p>This happens when two artifact sets for the same solution, version and suffix
                    are produced within the same minute: the timestamp stops at that granularity.</p>
                    <p>Continuing will <strong>replace archives with the same name</strong>.
                    To keep both, cancel and wait a minute.</p>`,
            }),
        });

        const record = buildHistoryRecord({
            written, result: r, options: state.options, user: state.connectionName,
            sourceEnvironmentUrl: state.connectionName, confirmations: state.confirmations,
        });
        await addRecord(record);
        state.lastSet = written.set;
        // DEV e' stato alzato: la prossima operazione riparte dal numero nuovo (FR-073b)
        if (r.versionChange) {
            const to = r.versionChange.to;
            if (state.activeSolution) state.activeSolution.version = to;
            const listed = state.solutions.find(x => x.solutionId === state.activeSolution?.solutionId);
            if (listed) listed.version = to;
        }
        state.versionFrom = '';
        state.versionInput = '';
        state.versionTouched = false;
        navigateTo('result');
        toolbox.utils.showNotification({
            title: 'Agent Nameplate',
            body: `Artifact set ready in ${written.set.folderName}`,
            type: written.complete ? 'success' : 'warning',
        });
    } catch (err) {
        if (err instanceof OverwriteDeclined) {
            log('Overwrite cancelled: nothing was written.');
        } else {
            log(`Save failed: ${err}`, 'error');
        }
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `${icon('download', 'icon--sm')} Save the artifact set`;
        }
    }
}

// ── Step: esito ───────────────────────────────────────────────────────────────

function renderResultStep(): void {
    const set = state.lastSet;
    const r = state.packaging;
    renderBreadcrumb();
    if (!set || !r) { navigateTo('welcome'); return; }

    const deploys = set.files.filter(f => f.role === 'deploy');
    const deploy = deploys[0];
    els.stepResult.innerHTML = `
        <div class="step-header step-header-row">
            <div class="step-id">${icon('archive')}<h2 class="step-title">Artifact set ready</h2></div>
            ${stepperHtml(5)}
        </div>

        ${deploys.length > 1 ? `
        <div class="handoff handoff--many">
            <span class="handoff-mark">${icon('check')}</span>
            <div class="handoff-text">
                <div class="handoff-label">To import, one managed archive per environment</div>
                ${deploys.map(f => `
                <div class="handoff-line">
                    <code class="handoff-file">${icon('archive', 'icon--archive')} ${escapeHtml(f.fileName)}</code>
                    <span class="chip chip--muted">${escapeHtml(targetLabel(f.target ?? ''))}</span>
                </div>`).join('')}
            </div>
            <span class="chip chip--success">managed</span>
        </div>` : `
        <div class="handoff">
            <span class="handoff-mark">${icon('check')}</span>
            <div class="handoff-text">
                <div class="handoff-label">To import into UAT or PROD</div>
                <code class="handoff-file">${icon('archive', 'icon--archive')}
                    ${escapeHtml(deploy?.fileName ?? '—')}</code>
            </div>
            <span class="chip chip--success">managed</span>
        </div>`}

        <section class="panel">
            <div class="panel-head">
                <h3 class="panel-heading">${icon('archive', 'icon--head')}Files produced</h3>
                <span class="panel-sub">${set.files.length} archives · ${(set.totalBytes / 1024).toFixed(0)} KB</span>
            </div>
            <div class="panel-body">
                <table class="data-table">
                    <thead><tr>
                        <th>File</th><th>Role</th><th class="col-num">Entries</th><th>SHA-256</th>
                    </tr></thead>
                    <tbody>${set.files.map(f => `
                        <tr${f.role === 'deploy' ? ' class="row-highlight"' : ''}>
                            <td class="cell-strong">
                                ${icon('archive', 'icon--archive icon--sm')}
                                <code>${escapeHtml(f.fileName)}</code></td>
                            <td>${roleChip(f.role)}</td>
                            <td class="col-num">${f.entryCount}</td>
                            <td class="cell-muted"><code title="${escapeHtml(f.sha256)}">${escapeHtml(f.sha256.slice(0, 16))}…</code></td>
                        </tr>`).join('')}</tbody>
                </table>
                <div class="note note--warn">
                    Do <strong>not</strong> import the unmanaged archive into UAT or PROD: it
                    would create an unmanaged solution, the very problem this flow removes.
                </div>
                <div class="note">
                    The package carries the version <strong>DEV now has</strong>. Tick several targets
                    together to build them from one export and one version. To build another one later, turn off
                    <em>Raise the version in DEV</em>: DEV is already there. Artifacts
                    of the same version are told apart by the suffix in the name and by the
                    <strong>hash</strong> in the manifest.
                </div>
            </div>
        </section>

        <section class="panel">
            <div class="panel-head">
                <h3 class="panel-heading">${icon('folder', 'icon--head')}Where it is</h3>
            </div>
            <div class="panel-body">
                <div class="kv"><span class="kv-key">Folder</span>
                    <span class="kv-val">${icon('folder', 'icon--folder icon--sm')}
                    <code>${escapeHtml(set.folderPath)}</code></span></div>
                <div class="kv"><span class="kv-key">Manifest</span>
                    <span class="kv-val">${icon('file-json', 'icon--data icon--sm')}
                    <code>manifest.json</code> — source, suffix, operator,
                    format fingerprint and every file hash</span></div>
            </div>
        </section>

        <div class="step-footer">
            <button class="btn btn--primary" id="copy-path-btn">
                ${icon('package', 'icon--sm')} Copy path</button>
            <button class="btn btn--secondary" id="open-folder-btn"
                title="Opens File Explorer. PPTB flashes the terminal panel: that is how a tool runs a command.">
                Open folder</button>
            <button class="btn btn--secondary" id="history-nav-btn">
                ${icon('history', 'icon--sm')} View history</button>
            <button class="btn btn--secondary" id="done-btn">Done</button>
        </div>`;

    els.stepResult.querySelector('#open-folder-btn')!.addEventListener('click', () => {
        void openFolder(set.folderPath).catch(err =>
            log(`Could not open the folder: ${describeError(err)}`, 'error'));
    });
    els.stepResult.querySelector('#copy-path-btn')!.addEventListener('click', ev => {
        const btn = ev.currentTarget as HTMLButtonElement;
        void toolbox.utils.copyToClipboard(set.folderPath).then(() => {
            btn.innerHTML = `${icon('check', 'icon--sm')} Copied`;
            setTimeout(() => {
                btn.innerHTML = `${icon('package', 'icon--sm')} Copy path`;
            }, 1500);
        });
    });
    els.stepResult.querySelector('#history-nav-btn')!.addEventListener('click', () => navigateTo('history'));
    els.stepResult.querySelector('#done-btn')!.addEventListener('click', () => {
        state.packaging = null;
        state.packagingKey = '';
        state.lastSet = null;
        state.confirmations = [];
        navigateTo('welcome');
    });
}

/**
 * Etichetta del ruolo. `restore` si mostra come **backup**: quei due file *sono* la copia
 * intatta, il ripristino e' cio' che ci si fa. Il valore resta `restore` perche' finisce nel
 * manifest e nello storico, e rinominarlo invaliderebbe i record gia' scritti.
 */
function roleChip(role: string): string {
    const map: Record<string, [string, string]> = {
        deploy: ['success', 'deploy'],
        source: ['warning', 'source'],
        restore: ['muted', 'backup'],
    };
    const [cls, label] = map[role] ?? ['muted', role];
    return `<span class="chip chip--${cls}">${label}</span>`;
}

// ── Step: storico ─────────────────────────────────────────────────────────────

async function renderHistoryStep(): Promise<void> {
    renderBreadcrumb();
    els.stepHistory.innerHTML = `
        <section class="panel panel--fill">
            <div class="panel-head panel-head--lg">
                <div><h2 class="panel-heading">${icon('history', 'icon--head')}Packaging history</h2>
                    <div class="panel-sub">kept for 30 days, on this device only</div></div>
            </div>
            <div class="panel-table" id="history-body">
                <div class="progress-line"><span class="spinner"></span> reading…</div>
            </div>
        </section>`;

    const list = await readHistory();
    const body = document.getElementById('history-body');
    if (!body) return;

    if (!list.length) {
        body.innerHTML = `<div class="empty-state">
            <p>No packaging recorded yet.</p>
            <p class="hint">Operations will appear here, with their paths and file hashes.</p>
        </div>`;
        return;
    }

    body.innerHTML = `
        <ul class="rec-list">${list.map(r => `
            <li class="rec">
                <div class="rec-head">
                    <div class="rec-title">
                        ${icon('package', 'icon--head icon--sm')}
                        <span class="rec-solution">${escapeHtml(r.solutionUniqueName)}</span>
                        <span class="rec-version">${escapeHtml(r.version)}</span>
                        ${r.suffix
                            ? `<span class="chip chip--muted">${escapeHtml(r.suffix)}</span>`
                            : '<span class="chip chip--muted">no suffix</span>'}
                    </div>
                    <div class="rec-actions">
                        <span class="chip chip--${r.status === 'ok' ? 'success' : 'error'}">${escapeHtml(r.status)}</span>
                        <button class="btn btn--secondary btn--sm" data-export="${escapeHtml(r.id)}">Export</button>
                        <button class="btn btn--secondary btn--sm" data-delete="${escapeHtml(r.id)}">Delete</button>
                    </div>
                </div>

                <div class="rec-body">
                    ${r.agents.map(a => `
                        <div class="rec-rename">
                            <span class="cell-muted">${escapeHtml(a.before)}</span>
                            ${a.excluded
                                ? '<span class="cell-muted">left as it is</span>'
                                : `${icon('arrow-right', 'icon--xs')}
                            <strong>${escapeHtml(a.after)}</strong>`}
                        </div>`).join('')}

                    <div class="rec-path">
                        ${icon('folder', 'icon--folder icon--sm')}
                        <code>${escapeHtml(r.artifactSetPath)}</code>
                    </div>

                    <div class="rec-meta">
                        <span title="${escapeHtml(formatAbsoluteDate(r.timestamp))}">
                            ${escapeHtml(formatRelativeDate(r.timestamp))}</span>
                        <span>export ${escapeHtml(r.exportMode)} · ${r.exportSeconds.toFixed(1)} s</span>
                        <span>${r.files.length} files</span>
                    </div>

                    <div class="rec-files">${r.files.map(f => `
                        <span class="rec-file" title="${escapeHtml(f.sha256)}">
                            ${escapeHtml(f.role === 'restore' ? 'backup' : f.role)}
                            <code>${escapeHtml(f.sha256.slice(0, 8))}</code>
                        </span>`).join('')}</div>
                </div>
            </li>`).join('')}</ul>`;

    body.querySelectorAll<HTMLElement>('[data-export]').forEach(b => {
        b.addEventListener('click', async () => {
            const rec = list.find(x => x.id === b.dataset.export);
            if (rec) await saveJsonFile(`${rec.id}.json`, rec);
        });
    });
    body.querySelectorAll<HTMLElement>('[data-delete]').forEach(b => {
        b.addEventListener('click', async () => {
            const id = b.dataset.delete!;
            const ok = await askConfirm({
                title: 'Delete this entry?',
                okLabel: 'Delete',
                danger: true,
                bodyHtml: `<p>The history entry is removed. <strong>The files on disk are not
                    touched</strong>: they stay in their folder.</p>`,
            });
            if (!ok) return;
            await deleteRecord(id);
            void renderHistoryStep();
        });
    });
}

// ── Fase 2: deploy opzionale ──────────────────────────────────────────────────

// ── Controls ──────────────────────────────────────────────────────────────────
els.clearLogBtn.addEventListener('click', () => {
    clearLog();
    log('Log cleared.');
});

/**
 * Il log si riduce a una colonnina.
 *
 * La preferenza sta in `localStorage`: e' di questo dispositivo e di questo pannello, non
 * merita lo spazio impostazioni del tool. Se non e' leggibile — finestra privata, storage
 * negato — il pannello resta aperto, che e' lo stato giusto per chi non ha mai scelto.
 */
const LOG_COLLAPSED_KEY = 'nameplate.log.collapsed';

function setLogCollapsed(collapsed: boolean): void {
    const panel = document.getElementById('log-panel');
    const btn = document.getElementById('toggle-log-btn');
    if (!panel || !btn) return;
    panel.classList.toggle('sidebar-right--collapsed', collapsed);
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.setAttribute('title', collapsed ? 'Expand log' : 'Collapse log');
    btn.innerHTML = icon(collapsed ? 'chevron-left' : 'chevron-right', 'icon--sm');
    try { localStorage.setItem(LOG_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch { /* ok */ }
}

document.getElementById('toggle-log-btn')!.addEventListener('click', () => {
    const panel = document.getElementById('log-panel');
    setLogCollapsed(!panel?.classList.contains('sidebar-right--collapsed'));
});

try {
    if (localStorage.getItem(LOG_COLLAPSED_KEY) === '1') setLogCollapsed(true);
} catch { /* storage negato: resta aperto */ }
els.refreshBtn.addEventListener('click', () => loadAgents());
els.historyBtn.addEventListener('click', () => navigateTo('history'));

/** Il log e' un tracciato di cosa e' stato fatto: deve poter uscire dal tool (FR-017). */
els.exportLogBtn.addEventListener('click', async () => {
    const ok = await askConfirm({
        title: 'Export the log',
        okLabel: 'CSV',
        bodyHtml: `<p>${getEntries().length} entries. <strong>CSV</strong> to open it in a spreadsheet,
            <strong>Cancel</strong> and press the button again if you prefer JSON.</p>
            <p class="hint">The file stays on this device: nothing is transmitted.</p>`,
    });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    if (ok) await saveTextFile(`nameplate-log-${stamp}.csv`, toCsv());
    else await saveTextFile(`nameplate-log-${stamp}.json`, toJson());
});

document.getElementById('solution-type-filter')!.addEventListener('click', ev => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>('.segment');
    if (!btn) return;
    state.solutionFilter = btn.dataset.filter as SolutionFilter;
    renderSolutionsTable();
});

const searchInput = document.getElementById('solution-search') as HTMLInputElement;
const clearSearchBtn = document.getElementById('clear-search-btn') as HTMLButtonElement;

searchInput.addEventListener('input', () => {
    state.searchQuery = searchInput.value;
    clearSearchBtn.hidden = searchInput.value === '';
    renderSolutionsTable();
});

searchInput.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && searchInput.value) {
        ev.stopPropagation();
        clearSearchBtn.click();
    }
});

clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.searchQuery = '';
    clearSearchBtn.hidden = true;
    renderSolutionsTable();
    searchInput.focus();
});


/** Tema di PPTB: chiaro o scuro (marketplace policy §3). Senza risposta resta lo scuro. */
function applyTheme(): void {
    const set = (light: boolean) => { document.documentElement.dataset.theme = light ? 'light' : 'dark'; };
    void Promise.resolve(toolbox.utils.getCurrentTheme?.())
        .then(theme => set(theme === 'light'))
        .catch(() => set(false));
}

toolbox.events.on((_event: unknown, payload: { event: string }) => {
    if (payload.event === 'settings:updated') applyTheme();
    if (payload.event === 'connection:updated' || payload.event === 'connection:created') {
        log('Connection changed. Reloading...', 'info');
        state.agents = [];
        state.solutions = [];
        state.excludedByTarget.clear();
        state.publishByTarget.clear();
        state.options.publishByAgent = {};
        resetVersionPlan();
        state.highlightAgentId = '';
        state.activeSolution = null;
        state.browsingSolutionId = null;
        state.targets = [];
        state.targetsReady = false;
        state.selectedTargets = [];
        state.selectionFor = '';
        state.activeTargetName = '';
        state.packaging = null;
        state.solutionFilter = null;   // the new environment may hold the other kind of solution
        state.connectionName = '';   // keeps the silent refresh idle until the new connection is confirmed
        navigateTo('welcome');
        initConnection();
    }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
els.appVersion.textContent = `v${__APP_VERSION__}`;
applyTheme();
attachLog(els.logEntries);
els.exportLogBtn.disabled = false;
log('Agent Nameplate starting...');
initConnection();
