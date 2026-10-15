/// <reference types="@pptb/types" />

import { attachLog, clearLog, getEntries, log, toCsv, toJson } from './services/log';
import {
    fetchAgentsAndSolutions,
    findSuffixVariable,
    isSystemSolution,
    type FetchedData,
    type SuffixVariableHint,
} from './services/solutions';
import { writeArtifactSet } from './services/artifacts';
import { describeError } from './services/dataverse';
import { saveJsonFile, saveTextFile, selectFolder } from './services/files';
import { deployArtifact, readInstalledVersion, readTargetAgent } from './services/deploy';
import { addRecord, deleteRecord, readHistory, updateRecord } from './services/history';
import { askConfirm } from './services/ui';
import { runPackaging, type PackagingResult } from './services/packaging';
import { buildName } from './services/patch';
import { describeVerification } from './services/rezip';
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
    type Solution,
} from './types';


const toolbox = globalThis.toolboxAPI;

// ── State ────────────────────────────────────────────────────────────────────
type AppStep = 'welcome' | 'solution' | 'suffix' | 'preview' | 'result' | 'history';

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
    activeAgent: null as AgentListItem | null,
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
    stepPreview: document.getElementById('step-preview')!,
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
    if (state.activeAgent) {
        const id = state.activeAgent.id;
        state.activeAgent = state.agents.find(a => a.id === id) ?? state.activeAgent;
    }
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
        host.innerHTML = (['unmanaged', 'managed', 'all'] as const).map(f => `
            <button type="button" class="segment${f === active ? ' active' : ''}" data-filter="${f}"
                aria-pressed="${f === active}">
                ${FILTER_LABEL[f]}<span class="segment-count">${counts[f]}</span>
            </button>`).join('');
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
                        🤖 ${highlight(a.name, q)}
                    </span>`).join('')}
                </div>
            </td>
        </tr>` : '';

    const th = (col: SortColumn, label: string, extraClass = '') => {
        const active = state.sortColumn === col;
        const arrow = active ? (state.sortDir === 'asc' ? '▲' : '▼') : '';
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
    // Jump straight to the agent when its chip is clicked, skipping the solution view
    container.querySelectorAll<HTMLElement>('.match-chip').forEach(el => {
        el.addEventListener('click', ev => {
            ev.stopPropagation();
            selectAgent(el.dataset.agent!);
        });
    });
}

function agentsInSolution(solutionId: string): AgentListItem[] {
    if (solutionId === '__none__') {
        return state.agents.filter(
            a => !a.solution || isSystemSolution(a.solution));
    }
    return state.agents.filter(a => a.solution?.solutionId === solutionId);
}

function selectSolution(solutionId: string): void {
    state.activeSolution = solutionId === '__none__'
        ? null
        : state.solutions.find(s => s.solutionId === solutionId) ?? null;
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
    const agents = agentsInSolution(solId).sort((a, b) => a.name.localeCompare(b.name));
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
            <div class="detail-meta detail-meta--flat">
                <div><span class="meta-label">Version</span><span>${escapeHtml(sol.version || '—')}</span></div>
                <div><span class="meta-label">Publisher</span><span>${escapeHtml(sol.publisherName || sol.publisherPrefix)}</span></div>
                <div><span class="meta-label">Prefix</span><span>${escapeHtml(sol.publisherPrefix)}</span></div>
                <div><span class="meta-label">Created</span>
                    <span title="${escapeHtml(formatAbsoluteDate(sol.createdOn))}">${escapeHtml(formatRelativeDate(sol.createdOn))}</span></div>
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
                            <th class="col-action"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${agents.map(a => `
                        <tr class="data-row" data-agent="${escapeHtml(a.id)}">
                            <td class="cell-strong" title="${escapeHtml(a.name)}"><span class="cell-icon">🤖</span>${escapeHtml(a.name)}</td>
                            <td><span class="chip chip--${a.isActive ? 'success' : 'muted'}">${a.isActive ? 'Active' : 'Inactive'}</span></td>
                            ${dateCell(a.publishedOn, '<span class="cell-never">Never published</span>')}
                            ${dateCell(a.modifiedOn, '—')}
                            ${dateCell(a.createdOn, '—')}
                            <td class="col-action"><span class="row-cta">Rename →</span></td>
                        </tr>`).join('')}
                    </tbody>
                </table>` : `
                <div class="empty-state">
                    <p>Questa solution non contiene agent.</p>
                    <p class="empty-hint">Il packaging parte da un agent: aggiungine uno alla
                    solution, oppure scegli una solution che ne contenga.</p>
                </div>`}
            </div>
        </section>`;

    container.querySelectorAll<HTMLElement>('.data-row').forEach(el => {
        el.addEventListener('click', () => selectAgent(el.dataset.agent!));
    });
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
            <strong>Questa solution e' managed e non puo' essere esportata.</strong>
            Microsoft non consente l'export di una solution managed, quindi non puo' essere la
            sorgente di un package. Apri il tool sull'environment in cui
            <code>${escapeHtml(sol.uniqueName)}</code> e' <strong>unmanaged</strong> — di norma DEV —
            e fai il packaging da li'.
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
            Questa solution contiene la environment variable
            <code>${escapeHtml(hint.schemaName)}</code> (String), utilizzabile come
            <em>Channel display name suffix</em> nativo di Copilot Studio.
            <strong>Il tool non la tocca.</strong> Riguarda solo Teams e M365 Copilot e, se
            configurata, il suo valore si <strong>somma</strong> al suffisso nel nome
            dell'agent: usane uno solo.
        </div>`);
}

let solutionDetailSeq = 0;

function selectAgent(agentId: string): void {
    const agent = state.agents.find(a => a.id === agentId);
    if (!agent) return;
    if (agent.solution && !agent.solution.exportable) {
        log(`"${agent.solution.friendlyName || agent.solution.uniqueName}" e' managed: non e' `
            + `esportabile, quindi non puo' essere sorgente di un package. Opera `
            + `sull'environment in cui e' unmanaged.`, 'warning');
        return;
    }
    // Aprire un agent dalla lista azzera il lavoro precedente: il suffisso digitato
    // sopravvive solo al passo indietro, che non passa di qui.
    state.suffix = '';
    state.packaging = null;
    state.activeAgent = agent;
    state.activeSolution = agent.solution;
    // Keep the solution level populated even when the agent was picked straight from
    // search, so the breadcrumb stays complete and stepping back lands on its solution.
    state.browsingSolutionId = agent.solution ? agent.solution.solutionId : '__none__';
    navigateTo('suffix');
    log(`Selected agent: ${agent.name}`);
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────
interface Crumb { label: string; step: AppStep; }

/**
 * The trail mirrors the real hierarchy. Note that the selected agent and the
 * "configure suffix" screen are the same node — picking an agent opens its suffix
 * form — so the agent's own crumb navigates back to that step.
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

    if (state.activeAgent) trail.push({ label: state.activeAgent.name, step: 'suffix' });
    if (state.currentStep === 'suffix') return trail;

    trail.push({ label: 'Anteprima', step: 'preview' });
    if (state.currentStep === 'preview') return trail;

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
function navigateTo(step: AppStep): void {
    state.currentStep = step;
    renderBreadcrumb();
    els.welcomeScreen.style.display = 'none';
    els.stepSolution.style.display = 'none';
    els.stepSuffix.style.display = 'none';
    els.stepPreview.style.display = 'none';
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
        case 'preview': els.stepPreview.style.display = ''; renderPreviewStep(); break;
        case 'result':  els.stepResult.style.display  = ''; renderResultStep();  break;
        case 'history': els.stepHistory.style.display = ''; void renderHistoryStep(); break;
    }
}

// ── Step: suffisso e opzioni ──────────────────────────────────────────────────

const SUFFIX_PRESETS = ['DEV', 'TEST', 'UAT', 'STAGING', 'PREPROD', 'PROD'];

function stepperHtml(active: 1 | 2 | 3): string {
    const steps = ['Suffisso', 'Anteprima', 'Risultato'];
    const items = steps.map((label, i) => {
        const n = i + 1;
        const cls = n === active ? 'active' : n < active ? 'done' : '';
        return `<li class="stepper-item ${cls}"><span class="stepper-dot">${n < active ? '✓' : n}</span><span class="stepper-label">${label}</span></li>`;
    });
    const withLines = items.flatMap((item, i) =>
        i < items.length - 1 ? [item, '<li class="stepper-line" aria-hidden="true"></li>'] : [item]
    );
    return `<ol class="stepper">${withLines.join('')}</ol>`;
}

/**
 * Anteprima indicativa del nome, calcolata sul nome che Dataverse ha adesso.
 *
 * Il valore che conta è quello **nel package** (FR-071), che però esiste solo dopo l'export:
 * il Patch Plan vero arriva allo step successivo. Qui si mostra cosa aspettarsi, e lo si dice.
 */
function previewName(current: string, suffix: string): string {
    return buildName(current, suffix);
}

function renderSuffixStep(): void {
    const agent = state.activeAgent;
    if (!agent) { navigateTo('welcome'); return; }
    renderBreadcrumb();

    const draft = state.suffix;
    const pub = state.options.publishOnImport;
    els.stepSuffix.innerHTML = `
        <div class="step-header step-header-row">
            <h2 class="step-title">Suffisso per l'ambiente di destinazione</h2>
            ${stepperHtml(1)}
        </div>

        <div class="suffix-layout">

            <!-- LEFT: configurazione -->
            <div class="suffix-left">

                <section class="panel">
                    <div class="panel-head">
                        <h3 class="panel-heading">Suffisso</h3>
                        <span class="panel-sub">aggiunto tra parentesi quadre dopo il nome</span>
                    </div>
                    <div class="panel-body">
                        <div class="input-row">
                            <input id="suffix-input" class="text-input" type="text"
                                maxlength="${SUFFIX_MAX}" autocomplete="off"
                                placeholder="es. UAT" value="${escapeHtml(draft)}">
                            <button id="clear-suffix-btn" class="btn btn--secondary btn--sm"
                                ${draft ? '' : 'disabled'}>Clear</button>
                        </div>
                        <div class="chip-row" style="margin-top:10px">
                            ${SUFFIX_PRESETS.map(p => `
                                <button class="chip-btn ${p === draft ? 'is-active' : ''}"
                                    data-preset="${p}">${p}</button>`).join('')}
                        </div>
                        <p class="hint" style="margin-top:8px">
                            Lascia vuoto per <strong>rimuovere</strong> il suffisso esistente.
                        </p>
                    </div>
                </section>

                <section class="panel">
                    <div class="panel-head"><h3 class="panel-heading">Opzioni</h3></div>
                    <div class="panel-body" style="padding:0">

                        <div class="opt-row" style="padding:12px 16px">
                            <div>
                                <div class="opt-label">Incrementa la versione</div>
                                <div class="hint">stessa versione = update · superiore = upgrade</div>
                            </div>
                            <label class="switch" for="opt-bump">
                                <input class="switch-input" type="checkbox" id="opt-bump"
                                    ${state.options.bumpVersion ? 'checked' : ''}>
                                <span class="switch-track"><span class="switch-thumb"></span></span>
                            </label>
                        </div>

                        <div class="opt-row" style="padding:12px 16px">
                            <div>
                                <div class="opt-label">Publish all'import</div>
                                <div class="hint">porta il nome su Teams e M365 Copilot</div>
                            </div>
                            <div class="toggle-group" id="opt-publish" role="group">
                                <button class="toggle-btn ${pub === 'keep'        ? 'is-active' : ''}" data-val="keep">Auto</button>
                                <button class="toggle-btn ${pub === 'force-true'  ? 'is-active' : ''}" data-val="force-true">Sì</button>
                                <button class="toggle-btn ${pub === 'force-false' ? 'is-active' : ''}" data-val="force-false">No</button>
                            </div>
                        </div>

                    </div>
                </section>

            </div>

            <!-- RIGHT: anteprima -->
            <section class="panel">
                <div class="panel-head"><h3 class="panel-heading">Anteprima del nome</h3></div>
                <div class="panel-body" id="suffix-preview"></div>
            </section>

        </div>

        <div class="step-footer">
            <button class="btn btn--secondary" id="back-btn">← Indietro</button>
            <button class="btn btn--primary" id="next-btn">Genera il package →</button>
        </div>`;

    const input = document.getElementById('suffix-input') as HTMLInputElement;
    const clearBtn = document.getElementById('clear-suffix-btn') as HTMLButtonElement;

    const sync = () => {
        state.suffix = input.value;
        clearBtn.disabled = !input.value;
        document.querySelectorAll<HTMLElement>('.chip-btn').forEach(b => {
            b.classList.toggle('is-active', b.dataset.preset === input.value);
        });
        updateSuffixPreview();
    };

    input.addEventListener('input', sync);
    clearBtn.addEventListener('click', () => { input.value = ''; sync(); input.focus(); });
    document.querySelectorAll<HTMLElement>('.chip-btn').forEach(b => {
        b.addEventListener('click', () => { input.value = b.dataset.preset!; sync(); });
    });
    (document.getElementById('opt-bump') as HTMLInputElement).addEventListener('change', ev => {
        state.options.bumpVersion = (ev.target as HTMLInputElement).checked;
    });

    document.getElementById('opt-publish')!.addEventListener('click', ev => {
        const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('.toggle-btn');
        if (!btn) return;
        state.options.publishOnImport = btn.dataset.val as PackagingOptions['publishOnImport'];
        document.querySelectorAll<HTMLElement>('#opt-publish .toggle-btn').forEach(b => {
            b.classList.toggle('is-active', b === btn);
        });
    });
    document.getElementById('back-btn')!.addEventListener('click', () => navigateTo('solution'));
    document.getElementById('next-btn')!.addEventListener('click', () => navigateTo('preview'));

    updateSuffixPreview();
}

function updateSuffixPreview(): void {
    const host = document.getElementById('suffix-preview');
    const agent = state.activeAgent;
    if (!host || !agent) return;
    const next = previewName(agent.name, state.suffix);
    const tooLong = next.length > TEAMS_NAME_LIMIT;
    host.innerHTML = `
        <div class="kv"><span class="kv-key">Nome attuale</span>
            <span class="kv-val">${escapeHtml(agent.name)}</span></div>
        <div class="kv"><span class="kv-key">Nome risultante</span>
            <span class="kv-val kv-val--strong">${escapeHtml(next)}</span></div>
        <div class="kv"><span class="kv-key">Lunghezza</span>
            <span class="kv-val ${tooLong ? 'kv-val--warn' : ''}">${next.length} / ${TEAMS_NAME_LIMIT}</span></div>
        ${tooLong ? `
        <p class="hint hint--warn">
            Oltre ${TEAMS_NAME_LIMIT} caratteri. Il limite riguarda il manifest Teams, il cui nome
            deriva da quello dell'agent. Non blocca il packaging.
        </p>` : ''}
        <p class="hint">
            Calcolato sul nome che Dataverse ha adesso. Il valore che conta è quello
            <strong>nel package</strong>: il piano definitivo compare dopo l'export.
        </p>`;
}

// ── Step: anteprima del Patch Plan ────────────────────────────────────────────

function renderPreviewStep(): void {
    const agent = state.activeAgent;
    const sol = state.activeSolution;
    if (!agent || !sol) { navigateTo('welcome'); return; }
    renderBreadcrumb();

    els.stepPreview.innerHTML = `
        <div class="step-header step-header-row">
            <div>
                <h2 class="step-title">Anteprima del package</h2>
                <div class="step-sub">${escapeHtml(sol.uniqueName)} · ${escapeHtml(agent.name)}</div>
            </div>
            ${stepperHtml(2)}
        </div>
        <div class="card" id="preview-body">
            <div class="progress-line"><span class="spinner"></span>
                <span id="preview-progress">avvio dell'export…</span></div>
        </div>
        <div class="step-footer" id="preview-footer">
            <button class="btn btn--secondary" id="back-btn">← Indietro</button>
        </div>`;
    document.getElementById('back-btn')!.addEventListener('click', () => navigateTo('suffix'));

    // Tornare indietro e riavanzare non deve rifare l'export: sulla solution piu' pesante
    // dell'environment di riferimento la coppia costa 111 secondi (research.md §13).
    const key = packagingKey(sol, agent);
    if (state.packaging && state.packagingKey === key) {
        renderPreviewResult(state.packaging);
        return;
    }
    state.packaging = null;
    void runPreview(sol, agent, ++previewSeq, key);
}

/** Tutto ciò che, cambiando, rende obsoleto il package già preparato. */
function packagingKey(sol: Solution, agent: AgentListItem): string {
    return JSON.stringify([sol.uniqueName, agent.schemaName, state.suffix, state.options]);
}

let previewSeq = 0;

async function runPreview(
    sol: Solution, agent: AgentListItem, seq: number, key: string,
): Promise<void> {
    const startedAt = Date.now();
    let lastText = "avvio dell'export…";
    const paint = () => {
        if (seq !== previewSeq) return;
        const el = document.getElementById('preview-progress');
        if (!el) return;
        const s = Math.round((Date.now() - startedAt) / 1000);
        el.textContent = `${lastText} — ${s} s`;
    };
    // Il tempo trascorso va mostrato sempre: l'export sincrono costa 13-111 s sulle solution
    // misurate, il fallback asincrono ~154 s per archivio. Senza un contatore sembra bloccato.
    const ticker = window.setInterval(paint, 1000);
    const setProgress = (text: string) => {
        lastText = text;
        paint();
    };
    try {
        const result = await runPackaging(
            sol.uniqueName, state.suffix, [agent.schemaName], state.options, setProgress)
            .finally(() => window.clearInterval(ticker));
        if (seq !== previewSeq) return;     // l'utente è già andato altrove
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
                    <p><strong>Non è stato possibile preparare il package.</strong></p>
                    <p class="hint">${escapeHtml(describeError(err))}</p>
                    <button class="btn btn--secondary" id="retry-btn">Riprova</button>
                </div>`;
            document.getElementById('retry-btn')!.addEventListener('click', () => renderPreviewStep());
        }
        log(`Packaging non riuscito: ${describeError(err)}`, 'error');
    }
}

function renderPreviewResult(r: PackagingResult): void {
    const body = document.getElementById('preview-body');
    if (!body) return;
    const pkg = r.managed.source;
    const unexpected = pkg.nameOccurrences.filter(o => !o.expected);
    const extra = pkg.inventory.filter(c => !c.relatedToSelectedAgent);

    const planRows = r.plan.length ? r.plan.map(c => `
        <tr>
            <td><code>${escapeHtml(c.file)}</code></td>
            <td><code>&lt;${escapeHtml(c.element)}&gt;</code></td>
            <td class="cell-muted">${escapeHtml(c.before ?? '—')}</td>
            <td class="cell-strong">${escapeHtml(c.after)}</td>
            <td><span class="chip chip--${c.state === 'no-change' ? 'muted' : 'success'}">${c.state}</span>
                ${c.exceedsTeamsLimit ? '<span class="chip chip--warning">&gt; 30 char</span>' : ''}</td>
        </tr>`).join('') : `<tr><td colspan="5" class="cell-muted">Nessuna modifica da applicare.</td></tr>`;

    const v = r.managed.verification;
    const vu = r.unmanaged.verification;

    body.innerHTML = `
        <div class="detail-meta detail-meta--flat">
            <div><span class="meta-label">Solution</span><span>${escapeHtml(pkg.uniqueName)}</span></div>
            <div><span class="meta-label">Versione</span><span>${escapeHtml(pkg.version)}</span></div>
            <div><span class="meta-label">Publisher</span><span>${escapeHtml(pkg.publisherUniqueName)} (${escapeHtml(pkg.publisherPrefix)})</span></div>
            <div><span class="meta-label">Entry</span><span>${pkg.entries.length}</span></div>
            <div><span class="meta-label">Export</span><span>${r.exportMode} · ${r.exportSeconds.toFixed(1)} s</span></div>
        </div>

        <h3 class="section-title">Cosa viene modificato</h3>
        <table class="data-table">
            <thead><tr><th>File</th><th>Elemento</th><th>Prima</th><th>Dopo</th><th>Stato</th></tr></thead>
            <tbody>${planRows}</tbody>
        </table>
        <p class="hint">
            <strong>Non</strong> vengono toccati: <code>schemaname</code>, nomi di cartella e di file,
            GUID, <code>[Content_Types].xml</code>, <code>customizations.xml</code>. Nessuna
            sostituzione testuale globale.
        </p>

        <h3 class="section-title">Agent nel package</h3>
        ${pkg.agents.map(a => `
            <div class="kv"><span class="kv-key">${escapeHtml(a.schemaName)}</span>
                <span class="kv-val">${escapeHtml(a.name)} ·
                publish all'import: <strong>${a.publishOnImport === null
                    ? 'non specificato' : a.publishOnImport ? 'sì' : 'no'}</strong>
                ${a.channels.length ? `· canali: ${escapeHtml(a.channels.join(', '))}` : ''}</span></div>`).join('')}
        ${pkg.agents.some(a => a.publishOnImport !== true) ? `
        <p class="hint hint--warn">
            Senza publish nell'ambiente di destinazione il nome cambia solo in Copilot Studio e
            <strong>resta quello vecchio su Teams e M365</strong>.
        </p>` : ''}

        <h3 class="section-title">Contenuto del package</h3>
        <table class="data-table">
            <thead><tr><th>Cartella</th><th>Tipo</th><th>Quanti</th><th></th></tr></thead>
            <tbody>${pkg.inventory.map(c => `
                <tr>
                    <td><code>${escapeHtml(c.path)}</code></td>
                    <td>${escapeHtml(c.kind)}</td>
                    <td>${c.count}</td>
                    <td>${c.relatedToSelectedAgent ? '' : '<span class="chip chip--warning">oltre all\'agent</span>'}</td>
                </tr>`).join('')}</tbody>
        </table>
        ${extra.length ? `
        <p class="hint hint--warn">
            L'artefatto è la <strong>solution intera</strong>: all'import viaggia anche quanto sopra,
            non solo l'agent.
        </p>` : ''}

        ${pkg.drift.length ? `
        <h3 class="section-title">Formato del package</h3>
        <p class="hint hint--warn">
            Il formato si discosta da quello di riferimento. Non blocca il packaging — Dataverse
            si aggiorna di continuo — ma vale la pena saperlo:
        </p>
        <ul class="drift-list">${pkg.drift.map(d =>
            `<li>${escapeHtml(d.what)} <span class="cell-muted">(vs ${escapeHtml(d.against)})</span></li>`).join('')}</ul>
        ` : ''}

        <h3 class="section-title">Controlli</h3>
        <div class="kv"><span class="kv-key">Occorrenze del nome</span>
            <span class="kv-val">${pkg.nameOccurrences.length} trovate,
            ${unexpected.length} impreviste</span></div>
        ${unexpected.length ? `
        <p class="hint hint--warn">
            Il nome compare in punti che il tool non conosce: ${unexpected.map(o =>
                `<code>${escapeHtml(o.file)}</code> ${escapeHtml(o.locator)}`).join(', ')}.
            Quei punti <strong>non</strong> verrebbero patchati.
        </p>` : ''}
        <div class="kv"><span class="kv-key">Verifica managed</span>
            <span class="kv-val">${escapeHtml(describeVerification(v, r.managed.expectedIdenticalEntries))}</span></div>
        <div class="kv"><span class="kv-key">Verifica unmanaged</span>
            <span class="kv-val">${escapeHtml(describeVerification(vu, r.unmanaged.expectedIdenticalEntries))}</span></div>

        <div class="result-banner result-banner--${r.valid ? 'success' : 'error'}">
            ${r.valid
                ? 'Package pronti e verificati: managed e unmanaged, con una sola entry modificata.'
                : 'La verifica non è passata: l\'artefatto non è utilizzabile. Gli export originali restano importabili.'}
        </div>
        `;

    // Move the footer outside the card so it never overlaps the back button
    const footer = document.getElementById('preview-footer');
    if (footer) {
        footer.innerHTML = `
            <button class="btn btn--secondary" id="back-btn">← Indietro</button>
            <button class="btn btn--primary" id="save-btn" ${r.valid ? '' : 'disabled'}>
                Salva l'artifact set</button>`;
        footer.querySelector('#back-btn')!.addEventListener('click', () => navigateTo('suffix'));
    }

    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) saveBtn.addEventListener('click', () => void confirmThenSave(unexpected, extra));
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
): Promise<void> {
    if (unexpected.length) {
        const ok = await askConfirm({
            title: 'Il nome compare in punti non previsti',
            okLabel: 'Ho capito, procedi',
            danger: true,
            bodyHtml: `
                <p>Il display name dell'agent e' stato trovato anche qui, dove il tool
                <strong>non</strong> lo patchera':</p>
                <ul>${unexpected.map(o =>
                    `<li><code>${escapeHtml(o.file)}</code> ${escapeHtml(o.locator)}</li>`).join('')}</ul>
                <p class="hint">Di norma il nome sta in un punto solo. Se ne compaiono altri, il
                formato del package potrebbe essere cambiato e il patch resterebbe
                <strong>incompleto</strong>.</p>`,
        });
        if (!ok) { log('Salvataggio annullato: occorrenze impreviste non confermate.', 'warning'); return; }
        state.confirmations.push({
            what: `occorrenze impreviste del nome: ${unexpected.map(o => o.file).join(', ')}`,
            confirmedAt: new Date().toISOString(),
        });
    }

    if (extra.length) {
        const ok = await askConfirm({
            title: 'Il package contiene altro oltre all\'agent',
            okLabel: 'Procedi',
            bodyHtml: `
                <p>L'artefatto e' la <strong>solution intera</strong>: all'import viaggia anche
                quanto segue.</p>
                <ul>${extra.map(c =>
                    `<li>${escapeHtml(c.kind)} — ${c.count}</li>`).join('')}</ul>
                <p class="hint">Microsoft avverte che componenti non modificati inclusi in un
                update creano layer sopra quelli esistenti e possono disattivarne le
                customization.</p>`,
        });
        if (!ok) { log('Salvataggio annullato: componenti extra non confermati.', 'warning'); return; }
        state.confirmations.push({
            what: `componenti oltre all'agent: ${extra.map(c => `${c.kind} x${c.count}`).join(', ')}`,
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
        log('La verifica non è passata: non viene scritto nessun artefatto.', 'error');
        return;
    }

    const folder = await selectFolder('Dove salvare l\'artifact set');
    if (!folder) { log('Salvataggio annullato.'); return; }

    const btn = document.getElementById('save-btn') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = 'Salvataggio…'; }

    try {
        const written = await writeArtifactSet(folder, {
            result: r,
            suffix: state.suffix,
            options: state.options,
            sourceEnvironmentUrl: state.connectionName,
            user: state.connectionName,
            confirmations: state.confirmations,
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
            agents: r.plan.filter(c => c.element === 'name').map(c => ({
                schemaName: pkg.agents.find(a => a.file === c.file)?.schemaName ?? '',
                before: c.before ?? '',
                after: c.after,
            })),
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
            title: 'Agent Rename Manager',
            body: `Artifact set pronto in ${written.set.folderName}`,
            type: written.complete ? 'success' : 'warning',
        });
    } catch (err) {
        log(`Salvataggio non riuscito: ${err}`, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Salva l\'artifact set'; }
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
            <div>
                <h2 class="step-title">Artifact set pronto</h2>
                <div class="step-sub">${escapeHtml(set.folderName)}</div>
            </div>
            ${stepperHtml(3)}
        </div>

        <div class="card">
            <div class="result-banner result-banner--success">
                Da importare in UAT/PROD: <strong>${escapeHtml(deploy?.fileName ?? '—')}</strong>
            </div>

            <h3 class="section-title">File prodotti</h3>
            <table class="data-table">
                <thead><tr><th>File</th><th>Ruolo</th><th>Entry</th><th>SHA-256</th></tr></thead>
                <tbody>${set.files.map(f => `
                    <tr>
                        <td><code>${escapeHtml(f.fileName)}</code></td>
                        <td>${roleChip(f.role)}</td>
                        <td>${f.entryCount}</td>
                        <td class="cell-muted"><code title="${escapeHtml(f.sha256)}">${escapeHtml(f.sha256.slice(0, 16))}…</code></td>
                    </tr>`).join('')}</tbody>
            </table>
            <p class="hint">
                Due artefatti della stessa versione si distinguono dall'<strong>hash</strong>, non
                dalla <code>&lt;Version&gt;</code>: per questo non serve forzare un bump.
            </p>
            <p class="hint hint--warn">
                L'archivio <strong>unmanaged</strong> non va importato in UAT/PROD: creerebbe una
                solution unmanaged, cioè il problema che questo flusso elimina.
            </p>

            <h3 class="section-title">Cartella</h3>
            <div class="kv"><span class="kv-key">Percorso</span>
                <span class="kv-val"><code>${escapeHtml(set.folderPath)}</code></span></div>
            <div class="kv"><span class="kv-key">Manifest</span>
                <span class="kv-val"><code>manifest.json</code> — sorgente, suffisso, operatore,
                impronta del formato e hash di ogni file</span></div>
            <div class="kv"><span class="kv-key">Spazio occupato</span>
                <span class="kv-val">${(set.totalBytes / 1024).toFixed(0)} KB</span></div>
        </div>

        <div class="card" id="deploy-panel"></div>

        <div class="step-footer">
            <button class="btn btn--secondary" id="history-nav-btn">Vedi lo storico</button>
            <button class="btn btn--primary" id="done-btn">Fine</button>
        </div>`;

    const deployHost = document.getElementById('deploy-panel');
    if (deployHost) renderDeployPanel(deployHost);

    document.getElementById('history-nav-btn')!.addEventListener('click', () => navigateTo('history'));
    document.getElementById('done-btn')!.addEventListener('click', () => {
        state.packaging = null;
        state.packagingKey = '';
        state.lastSet = null;
        state.confirmations = [];
        navigateTo('welcome');
    });
}

function roleChip(role: string): string {
    const map: Record<string, [string, string]> = {
        deploy: ['success', 'deploy'],
        source: ['warning', 'source'],
        restore: ['muted', 'restore'],
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
                <div><h2 class="panel-heading">Storico dei packaging</h2>
                    <div class="panel-sub">conservato 30 giorni, solo su questo dispositivo</div></div>
            </div>
            <div class="panel-table" id="history-body">
                <div class="progress-line"><span class="spinner"></span> lettura…</div>
            </div>
        </section>`;

    const list = await readHistory();
    const body = document.getElementById('history-body');
    if (!body) return;

    if (!list.length) {
        body.innerHTML = `<div class="empty-state">
            <p>Nessun packaging registrato.</p>
            <p class="hint">Qui compariranno le operazioni, con i percorsi e gli hash dei file.</p>
        </div>`;
        return;
    }

    body.innerHTML = `
        <table class="data-table">
            <thead><tr>
                <th>Quando</th><th>Solution</th><th>Versione</th><th>Suffisso</th>
                <th>Agent</th><th>Esito</th><th></th>
            </tr></thead>
            <tbody>${list.map(r => `
                <tr>
                    <td class="cell-muted" title="${escapeHtml(formatAbsoluteDate(r.timestamp))}">
                        ${escapeHtml(formatRelativeDate(r.timestamp))}</td>
                    <td class="cell-strong">${escapeHtml(r.solutionUniqueName)}</td>
                    <td>${escapeHtml(r.version)}</td>
                    <td>${escapeHtml(r.suffix || '—')}</td>
                    <td class="cell-muted">${r.agents.map(a =>
                        `${escapeHtml(a.before)} → ${escapeHtml(a.after)}`).join('<br>')}</td>
                    <td><span class="chip chip--${r.status === 'ok' ? 'success' : 'error'}">${r.status}</span></td>
                    <td>
                        <button class="btn btn--secondary btn--sm" data-export="${escapeHtml(r.id)}">Esporta</button>
                        <button class="btn btn--secondary btn--sm" data-delete="${escapeHtml(r.id)}">Elimina</button>
                    </td>
                </tr>
                <tr><td colspan="7" class="cell-muted" style="padding-top:0">
                    <code>${escapeHtml(r.artifactSetPath)}</code> ·
                    export ${escapeHtml(r.exportMode)} ${r.exportSeconds.toFixed(1)} s ·
                    ${r.files.map(f => `${escapeHtml(f.role)} ${escapeHtml(f.sha256.slice(0, 12))}…`).join(' · ')}
                </td></tr>`).join('')}</tbody>
        </table>`;

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
                title: 'Eliminare la voce?',
                okLabel: 'Elimina',
                danger: true,
                bodyHtml: `<p>La voce di storico viene rimossa. <strong>I file sul disco non
                    vengono toccati</strong>: restano nella loro cartella.</p>`,
            });
            if (!ok) return;
            await deleteRecord(id);
            void renderHistoryStep();
        });
    });
}

// ── Fase 2: deploy opzionale ──────────────────────────────────────────────────

/**
 * Il deploy agisce sulla **connessione attiva**: PPTB non espone un selettore di environment
 * dentro il tool. Quindi si dice a chiare lettere dove si sta per scrivere, e se coincide con
 * la sorgente si chiede conferma — importare la solution nell'ambiente da cui è stata
 * esportata non è quasi mai ciò che si vuole.
 */
function renderDeployPanel(host: HTMLElement): void {
    const set = state.lastSet;
    const r = state.packaging;
    if (!set || !r) return;
    const deployFile = set.files.find(f => f.role === 'deploy');
    if (!deployFile) return;

    host.innerHTML = `
        <h3 class="section-title">Deploy (opzionale)</h3>
        <div class="kv"><span class="kv-key">Environment di destinazione</span>
            <span class="kv-val kv-val--strong">${escapeHtml(state.connectionName)}</span></div>
        <div class="kv"><span class="kv-key">File</span>
            <span class="kv-val"><code>${escapeHtml(deployFile.fileName)}</code> ${roleChip('deploy')}</span></div>
        <p class="hint">
            È la <strong>connessione attiva</strong>. Se non è l'ambiente di destinazione, cambiala
            prima di procedere. L'archivio <code>unmanaged</code> non è proponibile qui.
        </p>
        <div id="deploy-checks"></div>
        <div class="step-footer" style="margin-top:12px">
            <button class="btn btn--secondary" id="deploy-btn">Importa in ${escapeHtml(state.connectionName)}</button>
        </div>
        <div id="deploy-progress"></div>`;

    document.getElementById('deploy-btn')!.addEventListener('click', () => void runDeploy());
    void loadDeployChecks();
}

/** I due controlli che a mano si saltano sempre: layer preesistente e update vs upgrade. */
async function loadDeployChecks(): Promise<void> {
    const r = state.packaging;
    const host = document.getElementById('deploy-checks');
    if (!r || !host) return;
    const pkg = r.managed.source;
    const agent = pkg.agents[0];
    if (!agent) return;

    try {
        const [target, installed] = await Promise.all([
            readTargetAgent(agent.schemaName),
            readInstalledVersion(pkg.uniqueName),
        ]);
        const parts: string[] = [];

        if (target.found && target.probablyHasUnmanagedLayer) {
            parts.push(`<p class="hint hint--warn">
                <strong>L'agent nel target sembra avere customizations attive.</strong>
                Finché esiste un unmanaged layer, il nome del package non comparirà: va rimosso
                con <em>Solution Layers → Remove active customizations</em>. Il rilevamento è
                best effort, quindi vale la pena controllare comunque.</p>`);
        } else if (target.found) {
            parts.push(`<div class="kv"><span class="kv-key">Agent nel target</span>
                <span class="kv-val">${escapeHtml(target.name)} — nessuna customization rilevata</span></div>`);
        } else {
            parts.push(`<div class="kv"><span class="kv-key">Agent nel target</span>
                <span class="kv-val">non presente: sarà una prima installazione</span></div>`);
        }

        if (installed) {
            const same = installed === pkg.version;
            parts.push(`<div class="kv"><span class="kv-key">Versione installata</span>
                <span class="kv-val">${escapeHtml(installed)} → ${escapeHtml(pkg.version)}
                ${same ? '<span class="chip chip--warning">update</span>' : '<span class="chip chip--success">upgrade</span>'}</span></div>`);
            if (same) {
                parts.push(`<p class="hint">
                    Stessa versione: è un <strong>update</strong>, non un upgrade. Se ti serve un
                    upgrade, torna indietro e attiva l'incremento di versione.</p>`);
            }
        }
        host.innerHTML = parts.join('');
    } catch (err) {
        host.innerHTML = `<p class="hint">Controlli preliminari non riusciti: ${escapeHtml(describeError(err))}</p>`;
    }
}

async function runDeploy(): Promise<void> {
    const set = state.lastSet;
    const r = state.packaging;
    if (!set || !r) return;
    const file = set.files.find(f => f.role === 'deploy');
    const agent = r.managed.source.agents[0];
    const change = r.plan.find(c => c.element === 'name');
    if (!file || !agent) return;

    const ok = await askConfirm({
        title: `Importare in ${state.connectionName}?`,
        okLabel: 'Importa',
        bodyHtml: `
            <p>Viene importato <code>${escapeHtml(file.fileName)}</code> nell'environment
            <strong>${escapeHtml(state.connectionName)}</strong>.</p>
            <p class="hint">Assicurati che sia l'ambiente di destinazione e non quello di
            partenza.</p>`,
    });
    if (!ok) { log('Deploy annullato.'); return; }

    const btn = document.getElementById('deploy-btn') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = 'Import in corso…'; }
    const progress = document.getElementById('deploy-progress');
    const show = (text: string) => {
        if (progress) progress.innerHTML = `<div class="progress-line"><span class="spinner"></span> ${escapeHtml(text)}</div>`;
    };

    try {
        const outcome = await deployArtifact(
            file.role === 'deploy' ? r.managed.bytes : r.managed.bytes,
            { schemaName: agent.schemaName, name: change?.after ?? agent.name },
            show,
        );
        await updateRecord(set.folderName, rec => ({
            ...rec,
            deployments: [...rec.deployments, {
                timestamp: new Date().toISOString(),
                targetEnvironmentUrl: state.connectionName,
                importJobId: outcome.importJobId,
                status: outcome.status === 'succeeded' ? 'succeeded' : 'failed',
                message: outcome.message,
            }],
        }));
        if (progress) {
            progress.innerHTML = `
                <div class="result-banner result-banner--${outcome.status === 'succeeded' ? 'success' : 'error'}">
                    ${outcome.status === 'succeeded'
                        ? `Import completato. Nel target l'agent si chiama
                           <strong>${escapeHtml(outcome.nameInTarget ?? '')}</strong>.`
                        : escapeHtml(outcome.message)}
                </div>
                ${outcome.status !== 'succeeded' ? `<p class="hint">
                    L'archivio resta sul disco: puoi ritentare o importarlo dal portale.</p>` : ''}`;
        }
    } catch (err) {
        if (progress) {
            progress.innerHTML = `<div class="result-banner result-banner--error">
                ${escapeHtml(describeError(err))}</div>
                <p class="hint">L'archivio resta sul disco: puoi ritentare o importarlo dal portale.</p>`;
        }
        log(`Deploy non riuscito: ${describeError(err)}`, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = `Importa in ${state.connectionName}`; }
    }
}

// ── Controls ──────────────────────────────────────────────────────────────────
els.clearLogBtn.addEventListener('click', () => {
    clearLog();
    log('Log cleared.');
});
els.refreshBtn.addEventListener('click', () => loadAgents());
els.historyBtn.addEventListener('click', () => navigateTo('history'));

/** Il log e' un tracciato di cosa e' stato fatto: deve poter uscire dal tool (FR-017). */
els.exportLogBtn.addEventListener('click', async () => {
    const ok = await askConfirm({
        title: 'Esporta il log',
        okLabel: 'CSV',
        bodyHtml: `<p>${getEntries().length} voci. <strong>CSV</strong> per aprirlo in un foglio,
            <strong>Annulla</strong> e usa il pulsante di nuovo se preferisci JSON.</p>
            <p class="hint">Il file resta sul dispositivo: nulla viene trasmesso.</p>`,
    });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    if (ok) await saveTextFile(`agent-rename-log-${stamp}.csv`, toCsv());
    else await saveTextFile(`agent-rename-log-${stamp}.json`, toJson());
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
        state.activeAgent = null;
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
log('Agent Rename Manager starting...');
initConnection();
