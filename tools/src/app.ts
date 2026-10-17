/// <reference types="@pptb/types" />

import { attachLog, clearLog, getEntries, log, toCsv, toJson } from './services/log';
import {
    fetchAgentsAndSolutions,
    findSuffixVariable,
    isSystemSolution,
    type FetchedData,
    type SuffixVariableHint,
} from './services/solutions';
import { OverwriteDeclined, writeArtifactSet } from './services/artifacts';
import { describeError } from './services/dataverse';
import { openFolder, saveJsonFile, saveTextFile, selectFolder } from './services/files';
import { addRecord, deleteRecord, readHistory } from './services/history';
import { askConfirm } from './services/ui';
import { runPackaging, type PackagingResult } from './services/packaging';
import { agentOutcomes, buildName, bumpVersion, publishModeFor } from './services/patch';
import { splitSuffix } from './services/package';
import { icon, type IconName } from './icons';
import {
    DEFAULT_OPTIONS,
    SUFFIX_MAX,
    TEAMS_NAME_LIMIT,
    type AgentListItem,
    type ArtifactSet,
    type NameOccurrence,
    type PackageComponent,
    type PackagingOptions,
    type PackagingRecord,
    type PatchChange,
    type PublishMode,
    type Solution,
    type VerificationResult,
} from './types';


const toolbox = globalThis.toolboxAPI;

// ── State ────────────────────────────────────────────────────────────────────
type AppStep = 'welcome' | 'solution' | 'suffix' | 'review' | 'preview' | 'verify' | 'result' | 'history';

const state = {
    connectionName: '',
    solutions: [] as Solution[],
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
    /** Suffisso scelto, senza parentesi quadre. Vuoto = rimuove il suffisso esistente. */
    suffix: '',
    options: { ...DEFAULT_OPTIONS } as PackagingOptions,
    /** Esito dell'ultimo packaging preparato, tenuto in memoria finché non viene salvato. */
    packaging: null as PackagingResult | null,
    /** Da cosa è stato generato: se non cambia, non si riesporta (l'export costa 13-110 s). */
    packagingKey: '',
    /** Artifact set appena scritto su disco. */
    lastSet: null as ArtifactSet | null,
    /** Conferme esplicite date in questa sessione, finiscono nel manifest. */
    confirmations: [] as { what: string; confirmedAt: string }[],
    // Agents
    agents: [] as AgentListItem[],           // ALL agents in the environment
    /**
     * Agent della solution aperta che l'utente ha escluso dal rename (FR-023, FR-076).
     * Si tiene l'esclusione, non la selezione: il default e' "tutti", cosi' un agent nuovo
     * comparso in DEV viene rinominato insieme agli altri invece di restare indietro.
     */
    excludedAgents: new Set<string>(),
    /** Agent trovato dalla ricerca: evidenziato nella vista della sua solution (FR-023b). */
    highlightAgentId: '',
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const els = {
    connectionBadge: document.getElementById('connection-badge')!,
    connectionName: document.getElementById('connection-name')!,
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
    return solutionPool()
        .filter(s => f === 'all' || (f === 'managed' ? s.isManaged : !s.isManaged))
        .sort(compareSolutions);
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
    const stats = document.getElementById('hero-stats');
    if (stats) {
        const agents = state.agents.length;
        stats.innerHTML = `
            <div class="stat"><dt>Solution</dt><dd>${counts.all}</dd></div>
            <div class="stat"><dt>Agent</dt><dd>${agents}</dd></div>
            <div class="stat"><dt>Managed</dt><dd>${counts.managed}</dd></div>`;
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
    const showOrphans = q
        ? matchedOrphans.length > 0
        : orphans.length > 0;

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
                        ${icon('bot', 'icon--sm')} ${highlight(a.name, q)}
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
                <tr class="data-row" data-solution="${escapeHtml(s.solutionId)}">
                    <td class="cell-strong">${highlight(s.friendlyName || s.uniqueName, q)}</td>
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
                    <td class="cell-strong">Agents without a solution</td>
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

    container.querySelectorAll<HTMLElement>('th.sortable').forEach(el => {
        el.addEventListener('click', () => sortBy(el.dataset.sort as SortColumn));
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

/** Quelli che il rename tocca davvero: tutti meno gli esclusi. */
function selectedAgents(): AgentListItem[] {
    return solutionAgents().filter(a => !state.excludedAgents.has(a.id));
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

function mixedSuffixHtml(found: string[]): string {
    const label = found.map(s => s ? `[${escapeHtml(s)}]` : 'no suffix').join(', ');
    return `
        <p class="hint hint--warn" style="margin-top:12px">
            The agents of this solution would end up with <strong>different suffixes</strong>
            (${label}) in the same environment. Check the agents you excluded.
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
        state.excludedAgents.clear();
        state.options.publishByAgent = {};
        state.suffix = '';
        state.packaging = null;
    }
    state.browsingSolutionId = solutionId;
    navigateTo('solution');
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
    const title = sol ? (sol.friendlyName || sol.uniqueName) : 'Agents without a solution';
    const dateCell = (iso: string, empty: string) => iso
        ? `<td class="cell-muted" title="${escapeHtml(formatAbsoluteDate(iso))}">${escapeHtml(formatRelativeDate(iso))}</td>`
        : `<td class="cell-muted">${empty}</td>`;

    container.innerHTML = `
        <section class="panel panel--fill">
            <div class="panel-head panel-head--lg">
                <div>
                    <h2 class="panel-heading">${escapeHtml(title)}</h2>
                    <div class="panel-sub">
                        ${agents.length} agent${agents.length === 1 ? '' : 's'}
                        ${sol ? `· ${escapeHtml(sol.uniqueName)}` : ''}
                    </div>
                </div>
                <span class="refresh-indicator" role="status"><span class="spinner"></span> Updating…</span>
            </div>
            <div id="solution-notices">${sol ? notExportableBannerHtml(sol) : ''}</div>
            ${sol ? `
            <div class="strip strip--flush">
                <div class="stat"><dt>Versione</dt><dd>${escapeHtml(sol.version || '—')}</dd></div>
                <div class="stat"><dt>Publisher</dt>
                    <dd>${escapeHtml(sol.publisherName || sol.publisherPrefix)}
                    <span class="stat-sub">${escapeHtml(sol.publisherPrefix)}</span></dd></div>
                <div class="stat"><dt>Agent</dt><dd>${agents.length}</dd></div>
                <div class="stat"><dt>Creata</dt>
                    <dd title="${escapeHtml(formatAbsoluteDate(sol.createdOn))}">${escapeHtml(formatRelativeDate(sol.createdOn))}</dd></div>
            </div>` : `
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
                            <th>Status</th>
                            <th>Last published</th>
                            <th>Modified</th>
                            <th>Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${agents.map(a => `
                        <tr data-agent="${escapeHtml(a.id)}"${a.id === state.highlightAgentId ? ' class="is-highlight"' : ''}>
                            <td class="cell-strong" title="${escapeHtml(a.name)}"><span class="cell-icon">${icon('bot', 'icon--sm')}</span>${escapeHtml(a.name)}</td>
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
}

/**
 * Una managed solution non e' esportabile ("You can't export managed solutions"), quindi non
 * puo' essere sorgente di un packaging. Si dice subito e si indica dove operare (FR-068).
 */
function notExportableBannerHtml(sol: Solution): string {
    if (sol.exportable) return '';
    return `
        <div class="panel-note panel-note--warning">
            <strong>This solution is managed and cannot be exported.</strong>
            Microsoft does not allow exporting a managed solution, so it cannot be the source
            of a package. Open the tool on the environment where
            <code>${escapeHtml(sol.uniqueName)}</code> is <strong>unmanaged</strong> — usually DEV —
            and build the package from there.
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
function startRename(): void {
    const sol = state.activeSolution;
    const agents = solutionAgents();
    if (!sol || !agents.length) return;
    if (!sol.exportable) {
        log(`"${sol.friendlyName || sol.uniqueName}" is managed: it cannot be exported, so it `
            + `cannot be the source of a package. Work on the environment where it is `
            + `unmanaged.`, 'warning');
        return;
    }
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
    if (state.currentStep === 'history') return [...trail, { label: 'Storico', step: 'history' }];
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

    trail.push({ label: 'Verifica', step: 'verify' });
    if (state.currentStep === 'verify') return trail;

    trail.push({ label: 'Risultato', step: 'result' });
    return trail;
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

const SUFFIX_PRESETS = ['DEV', 'TEST', 'UAT', 'STAGING', 'PREPROD', 'PROD'];

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
function versionHintHtml(current: string, bump: boolean): string {
    if (!bump) {
        return `<code>${escapeHtml(current)}</code> stays as it is — the target can only take it as an
            <strong>Update</strong>, which never removes components: agents you deleted in the source
            would stay there.`;
    }
    return `<code>${escapeHtml(current)}</code> → <code>${escapeHtml(bumpVersion(current))}</code>
        — import it as an <strong>Upgrade</strong> (the default) so agents you deleted in the source
        are removed too. <em>Update</em> and <em>Stage for upgrade</em> keep them.`;
}

function artifactListHtml(sol: Solution, suffix: string, keepExtras: boolean): string {
    const base = `${sol.uniqueName}_${sol.version.replace(/\./g, '_')}`;
    const tag = suffix.trim() || 'nosuffix';
    const rows: Array<[boolean, string, string]> = [
        [true, `${base}_managed_${tag}.zip`,
            'The only one to import into UAT or PROD. Being managed, it creates no '
            + 'unmanaged layer in the target environment.'],
        [keepExtras, `${base}_unmanaged_${tag}.zip`,
            'The same patch, unmanaged, for source control or a development environment. '
            + 'Never import it downstream.'],
        [keepExtras, 'source_managed.zip',
            'The original managed export, unpatched. Re-import it to go back; beside the '
            + 'patched one it proves a single element was touched.'],
        [keepExtras, 'source_unmanaged.zip',
            'The original unmanaged export: an untouched snapshot of the solution as it '
            + 'stood in the source environment.'],
        [true, 'manifest.json',
            'Who, when, from where, the suffix applied and every file hash. It tells apart '
            + 'two artifacts of the same version built for different environments.'],
    ];
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
            : `${n} archives: <strong>${n} saves</strong>, one per file.`}</p>`;
}

const PUBLISH_LABELS: Record<PublishMode, string> = {
    'keep': 'Leave as is',
    'force-true': 'Force yes',
    'force-false': 'Force no',
};

/** La scelta di un agent: da qui in poi vince sul valore di partenza (`publishOnImport`). */
function setPublishMode(schemaName: string, mode: PublishMode): void {
    state.options.publishByAgent = { ...(state.options.publishByAgent ?? {}), [schemaName]: mode };
}

/** Il toggle di un agent: stessa grammatica del resto dell'interfaccia, il valore attivo evidenziato. */
function publishToggleHtml(schemaName: string): string {
    const current = publishModeFor(state.options, schemaName);
    return `<div class="toggle-group toggle-group--sm" role="group"
            aria-label="Publish on import">${(Object.keys(PUBLISH_LABELS) as PublishMode[]).map(m => `
        <button class="toggle-btn${current === m ? ' is-active' : ''}" data-publish="${escapeHtml(schemaName)}"
            data-val="${m}">${PUBLISH_LABELS[m]}</button>`).join('')}</div>`;
}

/**
 * Il toggle "per tutti". Mostra il valore comune quando tutti gli agent spuntati ne hanno uno
 * solo, e nessuno quando sono misti: un pulsante che non resta acceso dopo il clic sembra rotto.
 */
function bulkToggleHtml(): string {
    const chosen = selectedAgents();
    const first = chosen[0] ? publishModeFor(state.options, chosen[0].schemaName) : null;
    const common = first && chosen.every(a => publishModeFor(state.options, a.schemaName) === first) ? first : null;
    return `<div class="toggle-group toggle-group--sm" role="group" aria-label="Publish on import for all ticked agents">${
        (Object.keys(PUBLISH_LABELS) as PublishMode[]).map(m => `
        <button class="toggle-btn${common === m ? ' is-active' : ''}" data-publish-all="${m}">${PUBLISH_LABELS[m]}</button>`).join('')}</div>`;
}

/** Una riga per agent: spunta, nome attuale e nome che avra'. Si riscrive a ogni digitazione. */
function agentRowsHtml(): string {
    const agents = solutionAgents();
    const names = agents.map(a => ({ name: a.name, selected: !state.excludedAgents.has(a.id) }));
    const mixed = suffixesAfter(names, state.suffix);
    return `
        <table class="data-table data-table--fill">
            <colgroup><col style="width:48px"><col style="width:30%"><col style="width:30%"><col></colgroup>
            <thead><tr><th></th><th>Agent</th><th>Name after the rename</th><th>Publish on import</th></tr></thead>
            <tbody>${agents.map(a => {
                const on = !state.excludedAgents.has(a.id);
                const next = buildName(a.name, state.suffix);
                return `
                <tr${on ? '' : ' class="is-off"'}>
                    <td><input type="checkbox" data-agent="${escapeHtml(a.id)}"
                        aria-label="Rename ${escapeHtml(a.name)}" ${on ? 'checked' : ''}></td>
                    <td class="cell-strong" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</td>
                    <td class="${on ? 'cell-strong' : 'cell-muted'} cell-nowrap" title="${escapeHtml(next)}">${on
                        ? escapeHtml(next) + (next === a.name ? ' <span class="cell-muted">(unchanged)</span>' : '')
                        : 'left as it is'}</td>
                    <td>${on ? publishToggleHtml(a.schemaName) : '<span class="cell-muted">—</span>'}</td>
                </tr>`;
            }).join('')}</tbody>
            <tfoot>
                <tr>
                    <td colspan="3" class="foot-cell">
                        <div class="foot-row">
                            <span class="hint">Publish on import carries the new name to Teams and Microsoft 365 Copilot.</span>
                            <span class="foot-label">Set for all ticked agents</span>
                        </div>
                    </td>
                    <td>${bulkToggleHtml()}</td>
                </tr>
            </tfoot>
        </table>
        ${agents.every(a => state.excludedAgents.has(a.id))
            ? '<p class="hint hint--warn" style="margin-top:12px">Select at least one agent.</p>' : ''}
        ${mixed.length > 1 ? mixedSuffixHtml(mixed) : ''}`;
}

function renderSuffixStep(): void {
    const sol = state.activeSolution;
    const agents = solutionAgents();
    if (!sol || !agents.length) { navigateTo('welcome'); return; }
    renderBreadcrumb();

    const draft = state.suffix;
    els.stepSuffix.innerHTML = `
        <div class="step-header step-header-row">
            <div class="step-id">${icon('tag')}<h2 class="step-title">Suffix for the target environment</h2></div>
            ${stepperHtml(1)}
        </div>

        <div class="stack">
                <section class="panel">
                    <div class="panel-head">
                        <h3 class="panel-heading">${icon('tag', 'icon--head')}Suffix</h3>
                        <span class="panel-sub">added in square brackets after the name</span>
                    </div>
                    <div class="panel-body">
                        <div class="suffix-row">
                            <div class="input-row">
                                <input id="suffix-input" class="text-input" type="text"
                                    maxlength="${SUFFIX_MAX}" autocomplete="off"
                                    placeholder="e.g. UAT" value="${escapeHtml(draft)}">
                                <button id="clear-suffix-btn" class="btn btn--secondary btn--sm"
                                    ${draft ? '' : 'disabled'}>Clear</button>
                            </div>
                            <span class="suffix-or">or</span>
                            <div class="chip-row">
                                ${SUFFIX_PRESETS.map(p => `
                                    <button class="chip-btn ${p === draft ? 'is-active' : ''}"
                                        data-preset="${p}">${p}</button>`).join('')}
                            </div>
                        </div>
                        <p class="hint" style="margin-top:8px">
                            Leave it empty to <strong>remove</strong> the existing suffix.
                        </p>
                    </div>
                </section>

                <section class="panel">
                    <div class="panel-head">
                        <h3 class="panel-heading">${icon('bot', 'icon--head')}Agents</h3>
                        <span class="panel-sub">all renamed with the same suffix; untick to leave one as it is</span>
                    </div>
                    <div class="panel-body" id="agent-list">${agentRowsHtml()}</div>
                </section>

                <section class="panel">
                    <div class="panel-head"><h3 class="panel-heading">${icon('sliders', 'icon--head')}Options</h3></div>
                    <div class="panel-body" style="padding:0">

                        <div class="opt-row" style="padding:12px 16px">
                            <div>
                                <div class="opt-label">Bump the version</div>
                                <div class="hint" id="version-hint">${versionHintHtml(sol.version, state.options.bumpVersion)}</div>
                            </div>
                            <label class="switch" for="opt-bump">
                                <input class="switch-input" type="checkbox" id="opt-bump"
                                    ${state.options.bumpVersion ? 'checked' : ''}>
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
                        ${artifactListHtml(sol, draft, state.options.keepSourceArtifacts)}
                    </div>
                </section>
        </div>

        <div class="step-footer">
            <button class="btn btn--secondary" id="back-btn">${icon('arrow-left', 'icon--sm')} Back</button>
            <button class="btn btn--primary" id="next-btn">Review ${icon('arrow-right', 'icon--sm')}</button>
        </div>`;

    const input = document.getElementById('suffix-input') as HTMLInputElement;
    const clearBtn = document.getElementById('clear-suffix-btn') as HTMLButtonElement;

    const refreshArtifacts = () => {
        const host = els.stepSuffix.querySelector('#artifact-list');
        if (host) {
            host.innerHTML = artifactListHtml(sol, state.suffix, state.options.keepSourceArtifacts);
        }
    };

    const nextBtn = els.stepSuffix.querySelector<HTMLButtonElement>('#next-btn')!;
    const refreshAgents = () => {
        const host = els.stepSuffix.querySelector('#agent-list');
        if (host) host.innerHTML = agentRowsHtml();
        nextBtn.disabled = selectedAgents().length === 0;
    };
    els.stepSuffix.querySelector('#agent-list')!.addEventListener('click', ev => {
        const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('.toggle-btn');
        if (!btn) return;
        if (btn.dataset.publish) {
            setPublishMode(btn.dataset.publish, btn.dataset.val as PublishMode);
        } else if (btn.dataset.publishAll) {
            for (const a of selectedAgents()) setPublishMode(a.schemaName, btn.dataset.publishAll as PublishMode);
        } else {
            return;
        }
        refreshAgents();
    });
    // Una sola delegation: le righe vengono riscritte a ogni cambio di suffisso
    els.stepSuffix.querySelector('#agent-list')!.addEventListener('change', ev => {
        const box = (ev.target as HTMLElement).closest<HTMLInputElement>('input[data-agent]');
        if (!box) return;
        if (box.checked) state.excludedAgents.delete(box.dataset.agent!);
        else state.excludedAgents.add(box.dataset.agent!);
        refreshAgents();
    });

    const sync = () => {
        state.suffix = input.value;
        clearBtn.disabled = !input.value;
        document.querySelectorAll<HTMLElement>('.chip-btn').forEach(b => {
            b.classList.toggle('is-active', b.dataset.preset === input.value);
        });
        refreshArtifacts();
        refreshAgents();
    };
    refreshAgents();

    input.addEventListener('input', sync);
    clearBtn.addEventListener('click', () => { input.value = ''; sync(); input.focus(); });
    document.querySelectorAll<HTMLElement>('.chip-btn').forEach(b => {
        b.addEventListener('click', () => { input.value = b.dataset.preset!; sync(); });
    });
    (document.getElementById('opt-bump') as HTMLInputElement).addEventListener('change', ev => {
        state.options.bumpVersion = (ev.target as HTMLInputElement).checked;
        const hint = els.stepSuffix.querySelector('#version-hint');
        if (hint) hint.innerHTML = versionHintHtml(sol.version, state.options.bumpVersion);
    });
    (document.getElementById('opt-keep') as HTMLInputElement).addEventListener('change', ev => {
        state.options.keepSourceArtifacts = (ev.target as HTMLInputElement).checked;
        refreshArtifacts();
    });

    els.stepSuffix.querySelector('#back-btn')!.addEventListener('click', () => navigateTo('solution'));
    els.stepSuffix.querySelector('#next-btn')!.addEventListener('click', () => navigateTo('review'));
}

// ── Step: anteprima del Patch Plan ────────────────────────────────────────────

/**
 * Step 2: l'ultima schermata prima che parta l'export.
 *
 * L'export di managed e unmanaged costa da 13 secondi a 5 minuti (research.md §13), quindi
 * la revisione va fatta *prima* di pagarlo, non dopo. Qui non si chiama Dataverse: si mostra
 * solo quello che si sa gia' dalla scelta dell'agent e dalle opzioni dello step precedente.
 */
function renderReviewStep(): void {
    const sol = state.activeSolution;
    const chosen = selectedAgents();
    if (!sol || !chosen.length) { navigateTo('welcome'); return; }
    renderBreadcrumb();

    const rows = chosen.map(a => ({ agent: a, next: buildName(a.name, state.suffix) }));
    const tooLong = rows.some(r => r.next.length > TEAMS_NAME_LIMIT);
    const unchanged = rows.every(r => r.next === r.agent.name);
    const mixed = suffixesAfter(
        solutionAgents().map(a => ({ name: a.name, selected: !state.excludedAgents.has(a.id) })),
        state.suffix);

    els.stepReview.innerHTML = `
        <div class="step-header step-header-row">
            <div class="step-id">${icon('check')}<h2 class="step-title">Review before the export</h2></div>
            ${stepperHtml(2)}
        </div>

        <div class="stack">
            <section class="panel">
                <div class="panel-head">
                    <h3 class="panel-heading">${icon('pencil', 'icon--head')}Rename</h3>
                    <span class="panel-sub">what you are about to change</span>
                </div>
                <div class="panel-body">
                    <div class="kv"><span class="kv-key">Solution</span>
                        <span class="kv-val">${escapeHtml(sol.friendlyName || sol.uniqueName)}
                        <span class="cell-muted">${escapeHtml(sol.version)}</span></span></div>
                    <div class="kv"><span class="kv-key">Suffix</span>
                        <span class="kv-val">${state.suffix
                            ? `<strong>[${escapeHtml(state.suffix)}]</strong>`
                            : '<span class="cell-muted">none — removes the existing one</span>'}</span></div>
                    <table class="data-table" style="margin-top:12px">
                        <thead><tr><th>Agent</th><th>Resulting name</th><th>Publish on import</th>
                            <th class="col-num">Length</th></tr></thead>
                        <tbody>${rows.map(r => `
                            <tr>
                                <td class="cell-muted">${escapeHtml(r.agent.name)}
                                    <code>${escapeHtml(r.agent.schemaName)}</code></td>
                                <td class="cell-strong cell-nowrap">${escapeHtml(r.next)}</td>
                                <td class="cell-nowrap">${PUBLISH_LABELS[publishModeFor(state.options, r.agent.schemaName)]}</td>
                                <td class="col-num ${r.next.length > TEAMS_NAME_LIMIT ? 'kv-val--warn' : ''}">${r.next.length} / ${TEAMS_NAME_LIMIT}</td>
                            </tr>`).join('')}</tbody>
                    </table>
                    ${solutionAgents().length > chosen.length ? `
                    <p class="hint" style="margin-top:12px">
                        Left as they are: ${solutionAgents()
                            .filter(a => state.excludedAgents.has(a.id))
                            .map(a => `<strong>${escapeHtml(a.name)}</strong>`).join(', ')}.
                    </p>` : ''}
                    ${mixed.length > 1 ? mixedSuffixHtml(mixed) : ''}
                    ${unchanged ? `
                    <p class="hint hint--warn" style="margin-top:12px">
                        No name changes: the agents are already called that. The package
                        is still produced, but no rename actually takes place.
                    </p>` : ''}
                    ${tooLong ? `
                    <p class="hint hint--warn" style="margin-top:12px">
                        Over ${TEAMS_NAME_LIMIT} characters. The limit applies to the Teams
                        manifest, whose name derives from the agent's. It does not block packaging.
                    </p>` : ''}
                </div>
            </section>

            <section class="panel">
                <div class="panel-head">
                    <h3 class="panel-heading">${icon('sliders', 'icon--head')}Options</h3>
                    <span class="panel-sub">chosen in the previous step</span>
                </div>
                <div class="panel-body">
                    <div class="kv"><span class="kv-key">Package version</span>
                        <span class="kv-val">${versionHintHtml(sol.version, state.options.bumpVersion)}</span></div>
                    <div class="kv"><span class="kv-key">Artifacts produced</span>
                        <span class="kv-val">${state.options.keepSourceArtifacts
                            ? `4 archives <span class="cell-muted">— managed, unmanaged and the two originals</span>`
                            : `1 archive <span class="cell-muted">— only the managed one to import</span>`}
                        + manifest</span></div>

                    <h4 class="section-title">What happens next</h4>
                    <ul class="facts">
                        <li>${icon('package', 'icon--sm')}
                            <span><strong>Two exports</strong> of the solution, managed and
                            unmanaged, both patched: they also verify each other.</span></li>
                        <li>${icon('archive', 'icon--archive icon--sm')}
                            <span>On disk ${state.options.keepSourceArtifacts
                                ? `<strong>4 archives</strong> and the manifest.`
                                : `<strong>only the managed one</strong>, the only one you will
                                   import, and the manifest.`}</span></li>
                        <li>${icon('shield', 'icon--sm')}
                            <span><strong>Nothing is written to Dataverse</strong>: the
                            artifact is born on disk.</span></li>
                        <li>${icon('history', 'icon--sm')}
                            <span>From a few seconds to a few minutes, depending on the size
                            of the solution.</span></li>
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
    els.stepReview.querySelector('#next-btn')!.addEventListener('click', () => navigateTo('preview'));
}

function renderPreviewStep(): void {
    const chosen = selectedAgents().map(a => a.schemaName);
    const sol = state.activeSolution;
    if (!sol || !chosen.length) { navigateTo('welcome'); return; }
    renderBreadcrumb();

    els.stepPreview.innerHTML = `
        <div class="step-header step-header-row">
            <div class="step-id">${icon('package')}<h2 class="step-title">Package preview</h2></div>
            ${stepperHtml(3)}
        </div>
        <div class="strip" id="preview-body">
            <div class="pack-wait" id="preview-progress">
                ${packProgressHtml(0, 'starting the export…', 0)}
            </div>
        </div>
        <div id="preview-panels"></div>
        <div class="step-footer" id="preview-footer">
            <button class="btn btn--secondary" id="back-btn">${icon('arrow-left', 'icon--sm')} Back</button>
        </div>`;
    els.stepPreview.querySelector('#back-btn')!.addEventListener('click', () => navigateTo('review'));

    // Tornare indietro e riavanzare non deve rifare l'export: sulla solution piu' pesante
    // dell'environment di riferimento la coppia costa 111 secondi (research.md §13).
    const key = packagingKey(sol, chosen);
    if (state.packaging && state.packagingKey === key) {
        renderPreviewResult(state.packaging);
        return;
    }
    state.packaging = null;
    void runPreview(sol, chosen, ++previewSeq, key);
}

/** Tutto ciò che, cambiando, rende obsoleto il package già preparato. */
function packagingKey(sol: Solution, schemaNames: string[]): string {
    return JSON.stringify([sol.uniqueName, [...schemaNames].sort(), state.suffix, state.options]);
}

/** Le fasi del packaging, nell'ordine in cui il servizio le attraversa. */
const PACK_PHASES = [
    'Export managed',
    'Export unmanaged',
    'Read the packages',
    'Patch and verify',
] as const;

/**
 * A che punto siamo, dedotto dal messaggio del servizio.
 *
 * Il servizio riporta testo libero, non un indice: leggerlo qui evita di cambiare la sua
 * firma per un bisogno che e' solo di presentazione. Una frase che non si riconosce lascia
 * la fase dov'era, invece di farla saltare all'indietro.
 */
function phaseFromMessage(msg: string, current: number): number {
    const m = msg.toLowerCase();
    if (m.includes('patch')) return 3;
    if (m.includes('read')) return 2;
    if (m.includes('unmanaged')) return 1;
    if (m.includes('export') || m.includes('queue')) return 0;
    return current;
}

/** Il riquadro di attesa: barra indeterminata, fasi con il loro stato, messaggio e secondi. */
function packProgressHtml(phase: number, msg: string, seconds: number): string {
    const done = phase >= PACK_PHASES.length;
    const rows = PACK_PHASES.map((label, i) => {
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
    sol: Solution, schemaNames: string[], seq: number, key: string,
): Promise<void> {
    const startedAt = Date.now();
    let lastText = 'starting the export…';
    let phase = 0;
    const paint = () => {
        if (seq !== previewSeq) return;
        const el = els.stepPreview.querySelector('#preview-progress');
        if (!el) return;
        const s = Math.round((Date.now() - startedAt) / 1000);
        el.innerHTML = packProgressHtml(phase, lastText, s);
    };
    // Il tempo trascorso va mostrato sempre: l'export sincrono costa 13-111 s sulle solution
    // misurate, il fallback asincrono ~154 s per archivio. Senza un contatore sembra bloccato.
    const ticker = window.setInterval(paint, 1000);
    const setProgress = (text: string) => {
        lastText = text;
        phase = phaseFromMessage(text, phase);
        paint();
    };
    try {
        const result = await runPackaging(
            sol.uniqueName, state.suffix, schemaNames, state.options, setProgress)
            .finally(() => window.clearInterval(ticker));
        if (seq !== previewSeq) return;     // l'utente è già andato altrove

        // Un istante con tutte le fasi chiuse prima di cambiare schermata: il lavoro e' durato
        // decine di secondi, sparire di colpo lascia il dubbio che sia finito davvero.
        phase = PACK_PHASES.length;
        lastText = 'completed';
        paint();
        await new Promise(r => window.setTimeout(r, DONE_HOLD_MS));
        if (seq !== previewSeq) return;

        state.packaging = result;
        state.packagingKey = key;
        renderPreviewResult(result);
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
    name: 'Name', publishOnImport: 'Publish on import', Version: 'Version',
};

/**
 * "What gets changed", raggruppato per agent: un blocco per ogni agent toccato, con le sue
 * righe (nome, publish on import), poi un blocco per la solution (versione). Il percorso del
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
    const solutionChanges = r.plan.filter(c => c.element === 'Version');
    const left = outcomes.filter(o => o.excluded);

    return `
        ${perAgent.map(x => group(
            nameOf(x.agent.schemaName, x.agent.name), x.agent.schemaName, 'bot', x.changes,
            `agent:${x.agent.schemaName}`)).join('')}
        ${solutionChanges.length
            ? group(`Solution ${pkg.uniqueName}`, 'solution.xml', 'package', solutionChanges, 'solution') : ''}
        ${left.length ? `
        <p class="hint">Left as they are: ${left.map(o => `<strong>${escapeHtml(o.before)}</strong>`).join(', ')}.</p>` : ''}`;
}

function renderPreviewResult(r: PackagingResult): void {
    const body = document.getElementById('preview-body');
    if (!body) return;
    const pkg = r.managed.source;

    body.innerHTML = `
        <div class="stat"><dt>Solution</dt><dd>${escapeHtml(pkg.uniqueName)}</dd></div>
        <div class="stat"><dt>Versione</dt><dd>${escapeHtml(pkg.version)}</dd></div>
        <div class="stat"><dt>Publisher</dt>
            <dd>${escapeHtml(pkg.publisherUniqueName)}
            <span class="stat-sub">${escapeHtml(pkg.publisherPrefix)}</span></dd></div>
        <div class="stat"><dt>Entry</dt><dd>${pkg.entries.length}</dd></div>
        <div class="stat"><dt>Export</dt>
            <dd>${r.exportSeconds.toFixed(1)}<span class="stat-sub">s ${escapeHtml(r.exportMode)}</span></dd></div>`;

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

/**
 * Step 3: i controlli che dicono se l'artefatto e' utilizzabile.
 *
 * Separato dall'anteprima perche' risponde a un'altra domanda — non "cosa cambia" ma "e'
 * sicuro" — e perche' insieme i due riempivano una schermata sola troppo lunga da leggere.
 * Non rifa' nulla: legge il risultato gia' in `state.packaging`.
 */
function renderVerifyStep(): void {
    const r = state.packaging;
    if (!r) { navigateTo('preview'); return; }
    renderBreadcrumb();

    const pkg = r.managed.source;
    const unexpected = pkg.nameOccurrences.filter(o => !o.expected);
    // Posti noti che il tool non tocca e che portano ancora il suffisso vecchio: un agent
    // creato gia' con `[DEV]` ce l'ha anche nel nome del suo componente GPT (FR-096)
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
                ${pkg.drift.length ? `
                <h4 class="section-title">Package format</h4>
                <div class="note note--warn">
                    The format differs from the reference one. It does not block packaging —
                    Dataverse keeps changing — but it is worth knowing:
                    <ul class="drift-list">${pkg.drift.map(d =>
                        `<li>${escapeHtml(d.what)} <span class="cell-muted">(vs ${escapeHtml(d.against)})</span></li>`).join('')}</ul>
                </div>` : ''}
            </div>
        </section>

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

    els.stepVerify.querySelector('#back-btn')!.addEventListener('click', () => navigateTo('preview'));
    const saveBtn = els.stepVerify.querySelector('#save-btn');
    // Suffissi che gli agent avranno DOPO la patch, esclusi compresi (FR-023a)
    const mixed = suffixesAfter(pkg.agents.map(a => ({
        name: a.name,
        selected: r.plan.some(c => c.element === 'name' && c.file === a.file),
    })), state.suffix);
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
    mixed: string[],
): Promise<void> {
    if (mixed.length > 1) {
        const labels = mixed.map(s => s ? `[${s}]` : 'no suffix');
        const ok = await askConfirm({
            title: 'The agents would have different suffixes',
            okLabel: 'Continue anyway',
            danger: true,
            bodyHtml: `
                <p>After the rename the agents of this solution carry
                <strong>${labels.map(escapeHtml).join(', ')}</strong>: different suffixes in the
                same environment.</p>
                <p class="hint">This usually means an agent was left out by mistake. Go back and
                tick it, or continue if it is intended.</p>`,
        });
        if (!ok) { log('Save cancelled: mixed suffixes not confirmed.', 'warning'); return; }
        state.confirmations.push({
            what: `mixed suffixes after the rename: ${labels.join(', ')}`,
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
            suffix: state.suffix,
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

        const pkg = r.managed.source;
        const record: PackagingRecord = {
            id: written.set.folderName,
            timestamp: new Date().toISOString(),
            user: state.connectionName,
            sourceEnvironmentUrl: state.connectionName,
            solutionUniqueName: pkg.uniqueName,
            version: pkg.version,
            managed: true,
            suffix: state.suffix,
            agents: agentOutcomes(pkg, r.plan),
            options: { ...state.options },
            artifactSetPath: written.set.folderPath,
            files: written.set.files.map(f => ({ fileName: f.fileName, role: f.role, sha256: f.sha256 })),
            verification: { managed: r.managed.verification, unmanaged: r.unmanaged.verification },
            exportMode: r.exportMode,
            exportSeconds: r.exportSeconds,
            fingerprint: pkg.fingerprint,
            drift: pkg.drift,
            confirmations: state.confirmations,
            status: written.complete ? 'ok' : 'failed',
            deployments: [],
        };
        await addRecord(record);
        state.lastSet = written.set;
        navigateTo('result');
        toolbox.utils.showNotification({
            title: 'Copilot Agent Nameplate',
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

    const deploy = set.files.find(f => f.role === 'deploy');
    els.stepResult.innerHTML = `
        <div class="step-header step-header-row">
            <div class="step-id">${icon('archive')}<h2 class="step-title">Artifact set ready</h2></div>
            ${stepperHtml(5)}
        </div>

        <div class="handoff">
            <span class="handoff-mark">${icon('check')}</span>
            <div class="handoff-text">
                <div class="handoff-label">To import into UAT or PROD</div>
                <code class="handoff-file">${icon('archive', 'icon--archive')}
                    ${escapeHtml(deploy?.fileName ?? '—')}</code>
            </div>
            <span class="chip chip--success">managed</span>
        </div>

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
                    Two artifacts of the same version are told apart by their
                    <strong>hash</strong>, not by <code>&lt;Version&gt;</code>: that is why no
                    version bump is needed.
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


toolbox.events.on((_event: unknown, payload: { event: string }) => {
    if (payload.event === 'connection:updated' || payload.event === 'connection:created') {
        log('Connection changed. Reloading...', 'info');
        state.agents = [];
        state.solutions = [];
        state.excludedAgents.clear();
        state.options.publishByAgent = {};
        state.highlightAgentId = '';
        state.activeSolution = null;
        state.browsingSolutionId = null;
        state.suffix = '';
        state.packaging = null;
        state.solutionFilter = null;   // the new environment may hold the other kind of solution
        state.connectionName = '';   // keeps the silent refresh idle until the new connection is confirmed
        navigateTo('welcome');
        initConnection();
    }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
attachLog(els.logEntries);
els.exportLogBtn.disabled = false;
log('Copilot Agent Nameplate starting...');
initConnection();
