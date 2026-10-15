/// <reference types="@pptb/types" />

import {
    describeStep,
    mutateBackups,
    newBackupId,
    planRollback,
    readBackups,
    RETENTION_DAYS,
    summarizeVariable,
    type BackupEntry,
    type RollbackStep,
} from './backups';

const toolbox = window.toolboxAPI;
const dataverse = window.dataverseAPI;

// ── State ────────────────────────────────────────────────────────────────────
interface Solution {
    solutionId: string;
    uniqueName: string;
    friendlyName: string;
    isManaged: boolean;
    isVisible: boolean;
    publisherPrefix: string;
    publisherName: string;
    version: string;
    createdOn: string;
    agentCount: number;
}

interface AgentRecord {
    id: string;
    currentName: string;
    baseName: string;     // name with current suffix stripped
    newName: string;      // baseName + new suffix
    warnLength: boolean;  // newName > 30 chars
    renameState: 'no-change' | 'suffix-added' | 'suffix-changed' | 'suffix-removed';
}

/** An agent as listed in the left panel. Sourced from the `bot` table (authoritative). */
interface AgentListItem {
    id: string;
    name: string;
    solution: Solution | null;   // resolved via solutioncomponent, may be null
    isActive: boolean;           // bot.statecode === 0
    createdOn: string;
    modifiedOn: string;
    publishedOn: string;         // empty when the agent was never published
    /**
     * True when the agent belongs to a managed solution whose publisher turned off the
     * "Can be customized" managed property, so Dataverse refuses to edit it here.
     * Null when it couldn't be determined; nothing is blocked on that basis.
     */
    isLocked: boolean | null;
}

type AppStep = 'welcome' | 'solution' | 'suffix' | 'preview' | 'apply' | 'history';

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
    // Suffix flow
    envVarDefId: null as string | null,      // existing definition GUID
    envVarValueId: null as string | null,    // existing value GUID (for PATCH vs POST)
    envVarSchemaName: '',
    currentSuffix: '',    // value stored in env variable now
    pendingSuffix: '',    // value confirmed with "Preview rename"
    suffixDraft: null as string | null,   // what is typed right now; null = untouched, so going back restores it
    // Where the effective value comes from. 'default' means no current value is stored in this
    // environment and the variable's default value is being used instead.
    envVarSource: 'none' as 'value' | 'default' | 'none',
    // A suffix the user told us the agent's name carries even though the variable doesn't
    // (e.g. the stored value was deleted). Null = trust the variable.
    nameSuffixOverride: null as string | null,
    // Agents
    agents: [] as AgentListItem[],           // ALL agents in the environment
    activeAgent: null as AgentListItem | null,
    agentRecords: [] as AgentRecord[],
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const els = {
    connectionBadge: document.getElementById('connection-badge')!,
    connectionName: document.getElementById('connection-name')!,
    refreshBtn: document.getElementById('refresh-solutions-btn') as HTMLButtonElement,
    welcomeScreen: document.getElementById('welcome-screen')!,
    breadcrumb: document.getElementById('breadcrumb')!,
    stepSolution: document.getElementById('step-solution')!,
    stepHistory: document.getElementById('step-history')!,
    historyBtn: document.getElementById('history-btn') as HTMLButtonElement,
    stepSuffix: document.getElementById('step-suffix')!,
    stepPreview: document.getElementById('step-preview')!,
    stepApply: document.getElementById('step-apply')!,
    stepPublish: document.getElementById('step-publish')!,
    logEntries: document.getElementById('log-entries')!,
    clearLogBtn: document.getElementById('clear-log-btn') as HTMLButtonElement,
    confirmOverlay: document.getElementById('confirm-overlay')!,
    confirmTitle: document.getElementById('confirm-title')!,
    confirmBody: document.getElementById('confirm-body')!,
    confirmOkBtn: document.getElementById('confirm-ok-btn') as HTMLButtonElement,
    confirmCancelBtn: document.getElementById('confirm-cancel-btn') as HTMLButtonElement,
};

// ── Logging ──────────────────────────────────────────────────────────────────
type LogLevel = 'info' | 'success' | 'warning' | 'error';

function log(message: string, level: LogLevel = 'info'): void {
    const ts = new Date().toTimeString().slice(0, 8);
    const entry = document.createElement('div');
    entry.className = `log-entry log-entry--${level}`;
    entry.innerHTML = `<span class="log-timestamp">${ts}</span>${escapeHtml(message)}`;
    els.logEntries.appendChild(entry);
    els.logEntries.scrollTop = els.logEntries.scrollHeight;
}

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
interface FetchedData { agents: AgentListItem[]; solutions: Solution[]; }

/**
 * Which agents Dataverse will refuse to edit. A component is locked only when it is part of a
 * managed solution (`ismanaged`) AND its `iscustomizable` managed property is off — the managed
 * properties are not enforced on unmanaged components. `iscustomizable` is a managed property,
 * so the Web API returns it as `{ Value, CanBeChanged, ManagedPropertyLogicalName }`.
 *
 * Best effort: returns null if it can't be read, and callers then treat every agent as unknown
 * instead of blocking anything on a guess.
 */
async function readLockedAgents(): Promise<Map<string, boolean> | null> {
    try {
        const res = await dataverse.queryData('bots?$select=botid,ismanaged,iscustomizable&$top=5000');
        const map = new Map<string, boolean>();
        for (const row of res.value as Record<string, unknown>[]) {
            const prop = row.iscustomizable;
            const value = typeof prop === 'object' && prop !== null
                ? (prop as { Value?: unknown }).Value
                : prop;
            if (typeof value !== 'boolean') continue;      // shape not understood: leave it unknown
            map.set(row.botid as string, row.ismanaged === true && value === false);
        }
        return map;
    } catch (err) {
        log(`Could not read which agents are locked (nothing will be blocked): ${err}`, 'warning');
        return null;
    }
}

/**
 * Reads agents and solutions from Dataverse without touching the UI or the state, so the
 * same code serves the initial load and the silent refreshes.
 * `strict` makes a failed solution lookup throw instead of degrading to "no solution":
 * a background refresh must keep the last good data rather than blank the table.
 */
async function fetchAgents(strict: boolean): Promise<FetchedData> {
    type Row = Record<string, unknown>;

    const botResult = await dataverse.fetchXmlQuery(`
        <fetch>
          <entity name="bot">
            <attribute name="botid"/>
            <attribute name="name"/>
            <attribute name="solutionid"/>
            <attribute name="statecode"/>
            <attribute name="createdon"/>
            <attribute name="modifiedon"/>
            <attribute name="publishedon"/>
            <order attribute="name"/>
          </entity>
        </fetch>`);
    const bots = botResult.value as Row[];
    if (!bots.length) return { agents: [], solutions: [] };

    const botIds = bots.map(b => b.botid as string).filter(Boolean);
    const [{ byBotId, bySolutionId, ok }, lockedById] = await Promise.all([
        buildSolutionMap(botIds),
        readLockedAgents(),
    ]);
    if (strict && !ok) throw new Error('the solution lookup failed');

    const agents = bots.map((b): AgentListItem => {
        const botId = b.botid as string;
        return {
            id: botId,
            name: (b.name as string) ?? '(unnamed)',
            solution: byBotId.get(botId) ?? bySolutionId.get(b.solutionid as string) ?? null,
            isActive: (b.statecode as number | undefined) !== 1,
            createdOn: (b.createdon as string) ?? '',
            modifiedOn: (b.modifiedon as string) ?? '',
            publishedOn: (b.publishedon as string) ?? '',
            isLocked: lockedById ? (lockedById.get(botId) ?? null) : null,
        };
    });
    for (const a of agents) {
        if (a.solution) a.solution.agentCount++;
    }
    return { agents, solutions: [...bySolutionId.values()] };
}

/** Swaps in fresh data and re-points selections, which hold object references, at it. */
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
        .map(a => [a.id, a.name, a.isActive, a.modifiedOn, a.publishedOn, a.isLocked, a.solution?.solutionId ?? ''].join('|'))
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
        applyFetched(await fetchAgents(false));
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
        const data = await fetchAgents(true);
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

const SYSTEM_SOLUTIONS = new Set(['Default', 'Active', 'Basic']);

/**
 * System/default containers that shouldn't appear as pickable solutions.
 * Checks the display name too: "Common Data Services Default Solution" carries an
 * auto-generated uniquename, so matching on uniquename alone misses it.
 */
function isSystemSolution(s: Solution): boolean {
    if (SYSTEM_SOLUTIONS.has(s.uniqueName)) return true;
    return /default solution/i.test(s.friendlyName);
}

/**
 * Resolves which solution each agent belongs to. Best-effort: failures here
 * must never hide an agent from the list.
 *
 * Matches solutioncomponent rows by objectid against the known bot ids rather
 * than filtering on componenttype — the documented componenttype enum has no
 * value for Bot, so filtering on a guessed number silently returns nothing.
 */
async function buildSolutionMap(botIds: string[]): Promise<{
    byBotId: Map<string, Solution>;
    bySolutionId: Map<string, Solution>;
    ok: boolean;
}> {
    type Row = Record<string, unknown>;
    const byBotId = new Map<string, Solution>();
    const bySolutionId = new Map<string, Solution>();
    let ok = true;
    try {
        const solResult = await dataverse.queryData(
            'solutions?$select=solutionid,uniquename,friendlyname,ismanaged,isvisible,version,createdon'
            + '&$expand=publisherid($select=customizationprefix,friendlyname)&$top=5000'
        );
        for (const sol of solResult.value as Row[]) {
            const pub = sol.publisherid as Row | undefined;
            bySolutionId.set(sol.solutionid as string, {
                solutionId: sol.solutionid as string,
                uniqueName: (sol.uniquename as string) ?? '',
                friendlyName: (sol.friendlyname as string) ?? '',
                isManaged: (sol.ismanaged as boolean) ?? false,
                isVisible: (sol.isvisible as boolean) ?? false,
                publisherPrefix: (pub?.customizationprefix as string) ?? 'new',
                publisherName: (pub?.friendlyname as string) ?? '',
                version: (sol.version as string) ?? '',
                createdOn: (sol.createdon as string) ?? '',
                agentCount: 0,
            });
        }

        const idValues = botIds.map(id => `<value>${escapeHtml(id)}</value>`).join('');
        const scResult = await dataverse.fetchXmlQuery(`
            <fetch top="5000">
              <entity name="solutioncomponent">
                <attribute name="objectid"/>
                <attribute name="solutionid"/>
                <filter>
                  <condition attribute="objectid" operator="in">${idValues}</condition>
                </filter>
              </entity>
            </fetch>`);

        // Prefer a real solution over Default/Active when a bot sits in several
        for (const row of scResult.value as Row[]) {
            const botId = row.objectid as string;
            const solId = (row['_solutionid_value'] ?? row.solutionid) as string;
            const sol = bySolutionId.get(solId);
            if (!botId || !sol) continue;
            const existing = byBotId.get(botId);
            if (!existing || isSystemSolution(existing)) byBotId.set(botId, sol);
        }
    } catch (err) {
        ok = false;
        log(`Could not resolve solutions (agents still listed): ${err}`, 'warning');
    }
    return { byBotId, bySolutionId, ok };
}

/** Escapes first, then wraps the matched span — never interpolates raw input. */
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
            ${sol ? `
            <div class="detail-meta detail-meta--flat">
                <div><span class="meta-label">Version</span><span>${escapeHtml(sol.version || '—')}</span></div>
                <div><span class="meta-label">Publisher</span><span>${escapeHtml(sol.publisherName || sol.publisherPrefix)}</span></div>
                <div><span class="meta-label">Prefix</span><span>${escapeHtml(sol.publisherPrefix)}</span></div>
                <div><span class="meta-label">Created</span>
                    <span title="${escapeHtml(formatAbsoluteDate(sol.createdOn))}">${escapeHtml(formatRelativeDate(sol.createdOn))}</span></div>
            </div>` : `
            <div class="panel-note">
                These agents aren't part of any unmanaged solution. You can still rename them.
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
                            <td><span class="chip chip--${a.isActive ? 'success' : 'muted'}">${a.isActive ? 'Active' : 'Inactive'}</span>${a.isLocked
                                ? ' <span class="chip chip--error" title="Managed property &quot;Can be customized&quot; is off: this agent can\'t be renamed in this environment">Locked</span>'
                                : ''}</td>
                            ${dateCell(a.publishedOn, '<span class="cell-never">Never published</span>')}
                            ${dateCell(a.modifiedOn, '—')}
                            ${dateCell(a.createdOn, '—')}
                            <td class="col-action"><span class="row-cta">Rename →</span></td>
                        </tr>`).join('')}
                    </tbody>
                </table>` : `
                <div class="empty-state"><p>This solution has no agents.</p></div>`}
            </div>
        </section>`;

    container.querySelectorAll<HTMLElement>('.data-row').forEach(el => {
        el.addEventListener('click', () => selectAgent(el.dataset.agent!));
    });
    const table = container.querySelector<HTMLElement>('.panel-table');
    if (table) table.scrollTop = prevScroll;
}

function selectAgent(agentId: string): void {
    const agent = state.agents.find(a => a.id === agentId);
    if (!agent) return;
    // Opening an agent from a list always starts from what Dataverse holds now. The draft only
    // survives stepping back from Preview or via the breadcrumb, which don't go through here.
    state.suffixDraft = null;
    state.nameSuffixOverride = null;
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

    if (state.activeAgent) trail.push({ label: state.activeAgent.name, step: 'suffix' });
    if (state.currentStep === 'suffix') return trail;

    trail.push({ label: 'Preview', step: 'preview' });
    if (state.currentStep === 'preview') return trail;

    trail.push({ label: 'Apply', step: 'apply' });
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
    els.stepHistory.style.display = 'none';
    els.stepSuffix.style.display = 'none';
    els.stepPreview.style.display = 'none';
    els.stepApply.style.display = 'none';
    els.stepPublish.style.display = 'none';

    switch (step) {
        // List views paint from the cache at once, then update in place from a silent refresh
        case 'welcome':
            els.welcomeScreen.style.display = '';
            renderSolutionsTable();
            void refreshData();
            void updateHistoryButton();
            break;
        case 'history':
            els.stepHistory.style.display = '';
            void renderHistory();
            break;
        case 'solution':
            els.stepSolution.style.display = '';
            renderSolutionDetail();
            void refreshData();
            break;
        case 'suffix':  els.stepSuffix.style.display  = ''; renderSuffixStep();  break;
        case 'preview': els.stepPreview.style.display = ''; renderPreviewStep(); break;
        case 'apply':   els.stepApply.style.display   = ''; renderApplyStep();   break;
    }
}

// ── Rename math ────────────────────────────────────────────────────────────────
function stripSuffix(name: string, suffix: string): string {
    if (!suffix) return name;
    const tagged = ` [${suffix}]`;
    if (name.endsWith(tagged)) return name.slice(0, -tagged.length);
    const parenD = ` (${suffix})`;
    if (name.endsWith(parenD)) return name.slice(0, -parenD.length);
    return name;
}

/**
 * The suffix to strip from the agent's current name. Normally it is the one stored in the
 * variable, but the two can drift apart (value deleted, name edited by hand), so the user can
 * declare which suffix the name really carries.
 */
function suffixInName(): string {
    return state.nameSuffixOverride ?? state.currentSuffix;
}

/**
 * A trailing " [X]" on the agent's name that the stored variable doesn't account for.
 * Only square brackets are considered: that is the exact format this tool writes, which keeps
 * ordinary names like "Helpdesk (IT)" from being flagged. It is a hint, never applied silently.
 */
function findUnrecognisedSuffix(name: string): string | null {
    const m = /\s\[([^\[\]]{1,20})\]\s*$/.exec(name);
    if (!m) return null;
    return m[1] === state.currentSuffix ? null : m[1];
}

function buildAgentRecord(bot: { id: string; name: string }, currentSuffix: string, newSuffix: string): AgentRecord {
    const baseName = stripSuffix(bot.name, currentSuffix);
    const newName = newSuffix ? `${baseName} [${newSuffix}]` : baseName;
    const changed = newName !== bot.name;
    let renameState: AgentRecord['renameState'] = 'no-change';
    if (changed) {
        if (!currentSuffix && newSuffix) renameState = 'suffix-added';
        else if (currentSuffix && !newSuffix) renameState = 'suffix-removed';
        else renameState = 'suffix-changed';
    }
    return { id: bot.id, currentName: bot.name, baseName, newName, warnLength: newName.length > 30, renameState };
}

// ── Step: Suffix ──────────────────────────────────────────────────────────────
const SUFFIX_PRESETS = ['DEV', 'TEST', 'UAT', 'STAGING', 'PREPROD', 'PROD'];
const SUFFIX_MAX = 20;
/** Teams manifest short-name limit; exceeding it only warns, it never blocks. */
const NAME_LIMIT = 30;

/** Guards against a slow env-variable lookup landing after the user moved to another agent. */
let suffixLoadSeq = 0;

function stepperHtml(active: 1 | 2 | 3): string {
    const labels = ['Suffix', 'Preview', 'Apply'];
    return `<ol class="stepper" aria-label="Progress">${labels.map((label, i) => {
        const n = i + 1;
        const cls = n < active ? 'done' : n === active ? 'active' : '';
        return `<li class="stepper-item ${cls}"${n === active ? ' aria-current="step"' : ''}>
                    <span class="stepper-dot">${n < active ? '✓' : n}</span>
                    <span class="stepper-label">${label}</span>
                </li>`;
    }).join('<li class="stepper-line" aria-hidden="true"></li>')}</ol>`;
}

function renderSuffixStep(): void {
    const sol = state.activeSolution;
    const agent = state.activeAgent!;
    els.stepSuffix.innerHTML = `
        <div class="step-header">
            <div class="step-header-row">
                <div>
                    <div class="step-title">Configure environment suffix</div>
                    <div class="step-subtitle">
                        Agent <strong id="suffix-agent-name">${escapeHtml(agent.name)}</strong>
                        · ${escapeHtml(sol ? (sol.friendlyName || sol.uniqueName) : 'No solution')}
                    </div>
                </div>
                ${stepperHtml(1)}
            </div>
        </div>
        <div id="suffix-body">
            <div class="empty-state">
                <span class="spinner"></span>
                <p style="margin-top:12px">Checking the suffix variable...</p>
            </div>
        </div>`;

    void loadEnvVar(sol, ++suffixLoadSeq);
}

function renderSuffixError(message: string, retry: () => void): void {
    const body = document.getElementById('suffix-body');
    if (!body) return;
    body.innerHTML = `
        <div class="banner banner--error">Could not check the suffix variable: ${escapeHtml(message)}</div>
        <div class="step-footer">
            <button class="btn btn--secondary" id="back-btn">← Back</button>
            <button class="btn btn--primary" id="retry-btn">Retry</button>
        </div>`;
    document.getElementById('back-btn')!.addEventListener('click', () => navigateTo('solution'));
    document.getElementById('retry-btn')!.addEventListener('click', retry);
}

/** Says where the value in the field was read from, so a fallback never looks like a stored value. */
function sourceNoteHtml(): string {
    const cur = state.currentSuffix;
    const q = (s: string) => `<strong>"${escapeHtml(s)}"</strong>`;
    switch (state.envVarSource) {
        case 'value':
            return cur
                ? `Current value stored in this environment: ${q(cur)}.`
                : 'The current value stored in this environment is empty.';
        case 'default':
            return `No current value is stored in this environment, so the variable's
                <strong>default value</strong>${cur ? ` ${q(cur)}` : ' (empty)'} is shown.
                Applying saves a current value that takes precedence.`;
        default:
            return 'The variable does not exist in this environment yet — it is created when you apply.';
    }
}

/** Builds the interactive form once the variable lookup has finished. */
function renderSuffixBody(found: boolean): void {
    const body = document.getElementById('suffix-body');
    if (!body) return;
    const initial = state.suffixDraft ?? state.currentSuffix;

    // The name was re-read from Dataverse during the lookup; bring header and breadcrumb along
    const nameEl = document.getElementById('suffix-agent-name');
    if (nameEl && state.activeAgent) nameEl.textContent = state.activeAgent.name;
    renderBreadcrumb();

    const locked = state.activeAgent?.isLocked === true;

    body.innerHTML = `
        ${locked ? lockedBannerHtml() : ''}
        <div id="orphan-suffix"></div>
        <div class="suffix-layout">
            <section class="panel">
                <div class="panel-head">
                    <span class="panel-title">Suffix for ${escapeHtml(state.connectionName || 'this environment')}</span>
                </div>
                <div class="panel-body">
                    <label class="field-label" for="suffix-input">Suffix value</label>
                    <div class="input-row">
                        <input id="suffix-input" class="text-input" type="text" autocomplete="off"
                            spellcheck="false" maxlength="${SUFFIX_MAX}" placeholder="e.g. DEV, UAT, PROD"
                            value="${escapeHtml(initial)}">
                        <button id="clear-suffix-btn" class="btn btn--secondary" type="button">✕ Clear</button>
                    </div>
                    <div class="field-hint">
                        <span id="suffix-count">0</span> / ${SUFFIX_MAX} characters ·
                        added in square brackets after the agent name
                    </div>
                    <div class="source-note source-note--${state.envVarSource}">${sourceNoteHtml()}</div>

                    <div class="field-label field-label--spaced">Quick pick</div>
                    <div class="preset-row" id="suffix-presets">
                        ${SUFFIX_PRESETS.map(p =>
                            `<button type="button" class="preset" data-value="${p}">${p}</button>`).join('')}
                    </div>
                    <p class="field-hint field-hint--block">
                        Each environment keeps its own value — set <strong>DEV</strong> here, and
                        <strong>UAT</strong> or <strong>PROD</strong> when you open the tool there.
                    </p>
                </div>
            </section>

            <section class="panel">
                <div class="panel-head">
                    <span class="panel-title">Live preview</span>
                    <span id="pv-state"></span>
                </div>
                <div class="panel-body">
                    <div class="pv-label">Current name</div>
                    <div class="pv-current" id="pv-current"></div>
                    <div class="pv-base" id="pv-base"></div>
                    <div class="pv-arrow" aria-hidden="true">↓</div>
                    <div class="pv-label">New name</div>
                    <div class="pv-card">
                        <span class="pv-avatar" aria-hidden="true">🤖</span>
                        <div class="pv-card-text">
                            <div class="pv-new" id="pv-new"></div>
                            <div class="pv-card-sub">How the agent will be named in Copilot Studio</div>
                        </div>
                    </div>
                    <div class="pv-meter">
                        <div class="pv-meter-bar"><div id="pv-bar" class="pv-meter-fill"></div></div>
                        <span id="pv-count" class="pv-meter-text"></span>
                    </div>
                    <div id="pv-warning"></div>
                </div>
            </section>
        </div>

        <section class="panel">
            <div class="panel-head">
                <span class="panel-title">What happens when you apply</span>
                <span class="chip chip--${found ? 'success' : 'warning'}">
                    Variable ${found ? 'exists' : 'not created yet'}
                </span>
            </div>
            <div class="panel-body">
                <ul class="effects" id="pv-effects"></ul>
            </div>
        </section>

        <div class="step-footer">
            <button class="btn btn--secondary" id="back-btn">← Back</button>
            <button class="btn btn--primary" id="next-btn">${locked ? 'Try anyway' : 'Preview rename'} →</button>
        </div>`;

    const input = document.getElementById('suffix-input') as HTMLInputElement;
    const clearBtn = document.getElementById('clear-suffix-btn') as HTMLButtonElement;

    input.addEventListener('input', updateSuffixPreview);
    input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') document.getElementById('next-btn')!.click();
    });
    clearBtn.addEventListener('click', () => {
        input.value = '';
        updateSuffixPreview();
        input.focus();
    });
    document.getElementById('suffix-presets')!.addEventListener('click', ev => {
        const btn = (ev.target as HTMLElement).closest<HTMLElement>('.preset');
        if (!btn) return;
        input.value = btn.dataset.value!;
        updateSuffixPreview();
        input.focus();
    });
    document.getElementById('back-btn')!.addEventListener('click', () => navigateTo('solution'));
    document.getElementById('next-btn')!.addEventListener('click', () => {
        state.pendingSuffix = input.value.trim();
        navigateTo('preview');
    });

    renderOrphanSuffixBanner();
    updateSuffixPreview();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
}

/**
 * Handles the name and the variable disagreeing — typically the stored value was deleted while
 * the agent still carries it. Without this, typing a new suffix would stack a second one behind
 * the old: "Agent [DEVS] [DEV]". The user picks how to reconcile; nothing is changed silently.
 */
function renderOrphanSuffixBanner(): void {
    const host = document.getElementById('orphan-suffix');
    const agent = state.activeAgent;
    if (!host || !agent) return;

    const found = findUnrecognisedSuffix(agent.name);
    if (!found) { host.innerHTML = ''; return; }

    const tag = `<strong>[${escapeHtml(found)}]</strong>`;

    if (state.nameSuffixOverride === found) {
        host.innerHTML = `
            <div class="banner banner--success banner-row">
                <div>✓ ${tag} is treated as this agent's current suffix. The value you enter replaces it;
                    leave the field empty to remove it from the name.</div>
                <div class="banner-actions">
                    <button type="button" class="btn btn--secondary btn--sm" id="orphan-undo">Undo</button>
                </div>
            </div>`;
        document.getElementById('orphan-undo')!.addEventListener('click', () => {
            state.nameSuffixOverride = null;
            renderOrphanSuffixBanner();
            updateSuffixPreview();
        });
        return;
    }

    const stored = state.currentSuffix
        ? `<strong>"${escapeHtml(state.currentSuffix)}"</strong>` : 'no value';
    host.innerHTML = `
        <div class="banner banner--warning banner-row">
            <div><strong>Suffix out of sync.</strong> The agent name ends with ${tag}, but the variable stores
                ${stored}, so the tool doesn't recognise it as a suffix. A new one would be added after it:
                <em>"… ${tag} [NEW]"</em>.</div>
            <div class="banner-actions">
                <button type="button" class="btn btn--secondary btn--sm" id="orphan-replace">Replace ${tag}</button>
                <button type="button" class="btn btn--secondary btn--sm" id="orphan-adopt">Keep ${tag} and save it to the variable</button>
            </div>
        </div>`;

    document.getElementById('orphan-replace')!.addEventListener('click', () => {
        state.nameSuffixOverride = found;
        renderOrphanSuffixBanner();
        updateSuffixPreview();
    });
    document.getElementById('orphan-adopt')!.addEventListener('click', () => {
        state.nameSuffixOverride = found;
        (document.getElementById('suffix-input') as HTMLInputElement).value = found;
        renderOrphanSuffixBanner();
        updateSuffixPreview();
    });
}

/** Recomputes everything derived from the input; runs on every keystroke. */
function updateSuffixPreview(): void {
    const agent = state.activeAgent;
    const input = document.getElementById('suffix-input') as HTMLInputElement | null;
    if (!agent || !input) return;

    const value = input.value.trim();
    state.suffixDraft = input.value;
    const rec = buildAgentRecord({ id: agent.id, name: agent.name }, suffixInName(), value);

    (document.getElementById('clear-suffix-btn') as HTMLButtonElement).disabled = input.value === '';
    document.getElementById('suffix-count')!.textContent = String(input.value.length);
    document.querySelectorAll<HTMLElement>('#suffix-presets .preset').forEach(p =>
        p.classList.toggle('active', p.dataset.value === value));

    // Names
    document.getElementById('pv-current')!.textContent = rec.currentName;
    document.getElementById('pv-base')!.textContent = rec.baseName !== rec.currentName
        ? `Base name without the current suffix: ${rec.baseName}` : '';
    document.getElementById('pv-new')!.innerHTML = value
        ? `${escapeHtml(rec.baseName)} <span class="pv-suffix">[${escapeHtml(value)}]</span>`
        : escapeHtml(rec.baseName);

    // Rename state chip
    const stateChip: Record<AgentRecord['renameState'], [string, string]> = {
        'no-change':      ['muted',   'No change'],
        'suffix-added':   ['success', 'Suffix added'],
        'suffix-changed': ['warning', 'Suffix changed'],
        'suffix-removed': ['error',   'Suffix removed'],
    };
    const [chipClass, chipLabel] = stateChip[rec.renameState];
    document.getElementById('pv-state')!.innerHTML =
        `<span class="chip chip--${chipClass}">${chipLabel}</span>`;

    // Length meter against the Teams limit
    const len = rec.newName.length;
    const bar = document.getElementById('pv-bar')!;
    bar.style.width = `${Math.min(100, (len / NAME_LIMIT) * 100)}%`;
    bar.classList.toggle('over', rec.warnLength);
    const count = document.getElementById('pv-count')!;
    count.textContent = `${len} / ${NAME_LIMIT} chars`;
    count.classList.toggle('over', rec.warnLength);
    document.getElementById('pv-warning')!.innerHTML = rec.warnLength
        ? `<div class="banner banner--warning pv-banner">
               ⚠ ${len} characters is over the ${NAME_LIMIT}-character limit of the Teams short name.
               You can still continue, but consider a shorter suffix.
           </div>`
        : '';

    renderSuffixEffects(rec, value);
}

/** Plain-language list of the two writes the apply step performs. */
function renderSuffixEffects(rec: AgentRecord, value: string): void {
    const list = document.getElementById('pv-effects');
    if (!list) return;
    const sol = state.activeSolution;
    const cur = state.currentSuffix;
    const q = (s: string) => `<strong>"${escapeHtml(s)}"</strong>`;

    let varKind: 'create' | 'update' | 'same';
    let varText: string;
    if (!state.envVarDefId) {
        varKind = 'create';
        varText = value
            ? `Create the variable and set it to ${q(value)}`
            : 'Create the variable with an empty value';
    } else if (state.envVarSource === 'default') {
        // No current value exists, so applying always writes one, even if the text matches
        varKind = 'update';
        const fallback = cur ? ` (this environment now falls back to the default ${q(cur)})` : '';
        varText = value
            ? `Save ${q(value)} as the current value${fallback}`
            : `Save an empty current value${fallback}`;
    } else if (value === cur) {
        varKind = 'same';
        varText = cur ? `Already set to ${q(cur)} — nothing to change` : 'Already empty — nothing to change';
    } else {
        varKind = 'update';
        varText = !value ? `Clear the value (currently ${q(cur)})`
            : cur ? `Change the value from ${q(cur)} to ${q(value)}`
            : `Set the value to ${q(value)}`;
    }
    const varIcon = { create: '＋', update: '✎', same: '✓' }[varKind];
    const solName = sol ? escapeHtml(sol.friendlyName || sol.uniqueName) : '';
    const where = !sol ? 'outside any solution'
        : sol.isManaged && varKind === 'create'
            ? `created outside the managed solution <strong>${solName}</strong>, which can't take new components`
            : `in solution <strong>${solName}</strong>`;

    const renamed = rec.renameState !== 'no-change';
    list.innerHTML = `
        <li class="effect">
            <span class="effect-icon effect-icon--${varKind}">${varIcon}</span>
            <div class="effect-main">
                <div class="effect-title">Environment variable</div>
                <div class="effect-detail">${varText}</div>
                <div class="effect-detail"><code>${escapeHtml(state.envVarSchemaName)}</code> · ${where}</div>
            </div>
        </li>
        <li class="effect">
            <span class="effect-icon effect-icon--${renamed ? 'update' : 'same'}">${renamed ? '✎' : '✓'}</span>
            <div class="effect-main">
                <div class="effect-title">Agent name</div>
                <div class="effect-detail">${renamed
                    ? `Rename ${q(rec.currentName)} to ${q(rec.newName)}`
                    : 'The name already matches — nothing to change'}</div>
            </div>
        </li>`;
}

async function loadEnvVar(sol: Solution | null, seq: number): Promise<void> {
    try {
        // Agents outside any solution get an environment-wide suffix variable
        const schemaName = sol
            ? `${sol.publisherPrefix}_AgentSuffix_${sol.uniqueName}`
            : 'new_AgentSuffix_Environment';

        type Row = Record<string, unknown>;
        const agentId = state.activeAgent!.id;

        // The agent's name is re-read alongside the variable: the cached name can be stale if
        // the agent was renamed elsewhere, and the preview is computed from it.
        const [defResult, botResult] = await Promise.all([
            dataverse.fetchXmlQuery(`
                <fetch top="1">
                  <entity name="environmentvariabledefinition">
                    <attribute name="environmentvariabledefinitionid"/>
                    <attribute name="defaultvalue"/>
                    <filter>
                      <condition attribute="schemaname" operator="eq" value="${schemaName}"/>
                    </filter>
                  </entity>
                </fetch>`),
            dataverse.fetchXmlQuery(`
                <fetch top="1">
                  <entity name="bot">
                    <attribute name="botid"/>
                    <attribute name="name"/>
                    <filter>
                      <condition attribute="botid" operator="eq" value="${agentId}"/>
                    </filter>
                  </entity>
                </fetch>`),
        ]);

        const freshBot = (botResult.value as Row[])[0];
        if (!freshBot) throw new Error('this agent no longer exists in the environment');

        const def = (defResult.value as Row[])[0];
        const defId = def ? (def.environmentvariabledefinitionid as string) : null;
        let valueId: string | null = null;
        let currentSuffix = '';
        let source: 'value' | 'default' | 'none' = 'none';

        if (def && defId) {
            const valResult = await dataverse.fetchXmlQuery(`
                <fetch top="1">
                  <entity name="environmentvariablevalue">
                    <attribute name="environmentvariablevalueid"/>
                    <attribute name="value"/>
                    <filter>
                      <condition attribute="environmentvariabledefinitionid" operator="eq"
                        value="${defId}"/>
                    </filter>
                  </entity>
                </fetch>`);
            const val = (valResult.value as Row[])[0];
            if (val) {
                valueId = val.environmentvariablevalueid as string;
                currentSuffix = (val.value as string) ?? '';
                source = 'value';
            } else {
                currentSuffix = (def.defaultvalue as string) ?? '';
                source = 'default';
            }
        }

        // The user may have opened another agent while this lookup was in flight
        if (seq !== suffixLoadSeq) return;

        state.activeAgent!.name = (freshBot.name as string) ?? state.activeAgent!.name;
        state.envVarSchemaName = schemaName;
        state.envVarDefId = defId;
        state.envVarValueId = valueId;
        state.envVarSource = source;
        state.currentSuffix = currentSuffix;

        const found = !!def;
        renderSuffixBody(found);

        log(!found
            ? `Env variable not found: "${schemaName}" — will create on apply.`
            : source === 'default'
                ? `Env variable "${schemaName}": no current value, using default "${state.currentSuffix}".`
                : `Env variable found: "${schemaName}" = "${state.currentSuffix}"`,
            found ? (source === 'default' ? 'warning' : 'success') : 'warning');
    } catch (err) {
        if (seq !== suffixLoadSeq) return;
        renderSuffixError(String(err), () => {
            const body = document.getElementById('suffix-body');
            if (body) body.innerHTML = `<div class="empty-state"><span class="spinner"></span>
                <p style="margin-top:12px">Checking the suffix variable...</p></div>`;
            void loadEnvVar(sol, ++suffixLoadSeq);
        });
        log(`Env variable check failed: ${err}`, 'error');
    }
}

// ── Step: Preview ─────────────────────────────────────────────────────────────
function renderPreviewStep(): void {
    const agent = state.activeAgent!;
    const newSuffix = state.pendingSuffix;

    els.stepPreview.innerHTML = `
        <div class="step-header">
            <div class="step-header-row">
                <div>
                    <div class="step-title">Preview rename</div>
                    <div class="step-subtitle">
                        Suffix <strong>${escapeHtml(newSuffix) || '(empty)'}</strong>
                        · ${escapeHtml(agent.name)}
                    </div>
                </div>
                ${stepperHtml(2)}
            </div>
        </div>
        ${agent.isLocked ? lockedBannerHtml() : ''}
        <div class="card">
            <div id="preview-table"><span class="spinner"></span> Loading agents...</div>
        </div>
        <div class="step-footer">
            <button class="btn btn--secondary" id="back-btn">← Back</button>
            <button class="btn btn--primary" id="apply-btn" disabled>Apply →</button>
        </div>`;

    document.getElementById('back-btn')!.addEventListener('click', () => navigateTo('suffix'));
    document.getElementById('apply-btn')!.addEventListener('click', () => showConfirmDialog());

    loadPreviewAgents();
}

async function loadPreviewAgents(): Promise<void> {
    const container = document.getElementById('preview-table');
    if (!container) return;
    try {
        type Row = Record<string, unknown>;

        const agent = state.activeAgent!;
        // Refresh current name from Dataverse in case it changed
        const botResult = await dataverse.fetchXmlQuery(`
            <fetch top="1">
              <entity name="bot">
                <attribute name="botid"/>
                <attribute name="name"/>
                <filter>
                  <condition attribute="botid" operator="eq" value="${agent.id}"/>
                </filter>
              </entity>
            </fetch>`);
        const bot = (botResult.value as Row[])[0] ?? { botid: agent.id, name: agent.name };

        state.agentRecords = [
            buildAgentRecord(
                { id: bot.botid as string, name: bot.name as string },
                suffixInName(),
                state.pendingSuffix
            )
        ];

        const stateColors: Record<string, string> = {
            'no-change': 'var(--color-text-muted)',
            'suffix-added': 'var(--color-success)',
            'suffix-changed': 'var(--color-warning)',
            'suffix-removed': 'var(--color-error)',
        };
        const stateLabels: Record<string, string> = {
            'no-change': '— no change',
            'suffix-added': '+ added',
            'suffix-changed': '~ changed',
            'suffix-removed': '- removed',
        };

        const hasChanges = state.agentRecords.some(a => a.renameState !== 'no-change');

        container.innerHTML = `
            <table style="width:100%;border-collapse:collapse">
                <thead>
                    <tr style="border-bottom:1px solid var(--color-border)">
                        <th style="text-align:left;padding:6px 8px;color:var(--color-text-muted);font-size:11px;text-transform:uppercase">Current Name</th>
                        <th style="text-align:left;padding:6px 8px;color:var(--color-text-muted);font-size:11px;text-transform:uppercase">→ New Name</th>
                        <th style="text-align:left;padding:6px 8px;color:var(--color-text-muted);font-size:11px;text-transform:uppercase">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.agentRecords.map(a => `
                        <tr style="border-bottom:1px solid var(--color-border)">
                            <td style="padding:8px;color:var(--color-text-muted)">${escapeHtml(a.currentName)}</td>
                            <td style="padding:8px;color:var(--color-text-strong);font-weight:500">
                                ${escapeHtml(a.newName)}
                                ${a.warnLength ? `<span class="badge badge--warning" title="Teams display name exceeds 30 chars (${a.newName.length} chars)" style="margin-left:4px">⚠ ${a.newName.length}</span>` : ''}
                            </td>
                            <td style="padding:8px;font-size:12px;color:${stateColors[a.renameState]}">
                                ${stateLabels[a.renameState]}
                            </td>
                        </tr>`).join('')}
                </tbody>
            </table>
            ${!hasChanges ? '<div class="banner banner--info" style="margin-top:12px">ℹ️ All agents already have this suffix — nothing to change.</div>' : ''}`;

        (document.getElementById('apply-btn') as HTMLButtonElement).disabled = !hasChanges;

        const warns = state.agentRecords.filter(a => a.warnLength).length;
        log(`Preview: ${state.agentRecords.length} agents. ${state.agentRecords.filter(a => a.renameState !== 'no-change').length} will change.${warns ? ` ⚠ ${warns} exceed 30 chars.` : ''}`,
            warns ? 'warning' : 'info');
    } catch (err) {
        container.innerHTML = `<span class="text-error">Failed: ${escapeHtml(String(err))}</span>`;
        log(`Preview failed: ${err}`, 'error');
    }
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
interface ConfirmOptions {
    title: string;
    bodyHtml: string;
    okLabel?: string;
    /** Styles the confirm button as destructive. */
    danger?: boolean;
}

/** Resolves true on confirm; false on cancel or Escape. */
function askConfirm(opts: ConfirmOptions): Promise<boolean> {
    return new Promise(resolve => {
        els.confirmTitle.textContent = opts.title;
        els.confirmBody.innerHTML = opts.bodyHtml;
        els.confirmOkBtn.textContent = opts.okLabel ?? 'Confirm';
        els.confirmOkBtn.className = opts.danger ? 'btn btn--danger' : 'btn btn--primary';
        els.confirmOverlay.style.display = 'flex';
        els.confirmOkBtn.focus();

        const finish = (result: boolean) => {
            els.confirmOverlay.style.display = 'none';
            els.confirmOkBtn.removeEventListener('click', onOk);
            els.confirmCancelBtn.removeEventListener('click', onCancel);
            document.removeEventListener('keydown', onKey);
            resolve(result);
        };
        const onOk = () => finish(true);
        const onCancel = () => finish(false);
        const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') finish(false); };

        els.confirmOkBtn.addEventListener('click', onOk);
        els.confirmCancelBtn.addEventListener('click', onCancel);
        document.addEventListener('keydown', onKey);
    });
}

async function showConfirmDialog(): Promise<void> {
    const toChange = state.agentRecords.filter(a => a.renameState !== 'no-change');
    const ok = await askConfirm({
        title: 'Confirm rename',
        okLabel: 'Apply',
        bodyHtml: `
        <p style="margin-bottom:12px">
            This will rename <strong>${toChange.length}</strong> agent${toChange.length !== 1 ? 's' : ''}
            in <strong>${escapeHtml(state.activeSolution?.friendlyName ?? "No solution")}</strong>.
        </p>
        <div style="background:var(--color-surface-2);border-radius:4px;padding:10px;font-size:12px;max-height:200px;overflow-y:auto">
            ${toChange.map(a => `
                <div style="padding:4px 0;border-bottom:1px solid var(--color-border)">
                    <span style="color:var(--color-text-muted)">${escapeHtml(a.currentName)}</span>
                    → <span style="color:var(--color-text-strong)">${escapeHtml(a.newName)}</span>
                </div>`).join('')}
        </div>
        <p style="margin-top:12px;color:var(--color-text-muted);font-size:12px">
            The env variable <code>${escapeHtml(state.envVarSchemaName)}</code>
            will be ${state.envVarDefId ? 'updated' : 'created'} with value
            "<strong>${escapeHtml(state.pendingSuffix)}</strong>".
        </p>
        <p style="margin-top:10px;color:var(--color-text-muted);font-size:12px">
            <strong>Backup:</strong> the current state is saved first, so you can undo this from the
            result screen or from <strong>History</strong>.
        </p>`,
    });
    if (ok) navigateTo('apply');
}

// ── Step: Apply ───────────────────────────────────────────────────────────────
type DotState = 'pending' | 'running' | 'success' | 'error' | 'skipped';

const DOT_GLYPH: Record<DotState, string> = { pending: '', running: '', success: '✓', error: '✕', skipped: '–' };

/** A round status marker, matching the circles of the stepper. */
function statusDotHtml(id: string, s: DotState = 'pending'): string {
    return `<span class="status-dot status-dot--${s}" id="${escapeHtml(id)}" role="img"
                aria-label="${s}">${DOT_GLYPH[s]}</span>`;
}

function setStatusDot(id: string, s: DotState): void {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `status-dot status-dot--${s}`;
    el.textContent = DOT_GLYPH[s];
    el.setAttribute('aria-label', s);
}

function renderApplyStep(): void {
    const toChange = state.agentRecords.filter(a => a.renameState !== 'no-change');
    els.stepApply.innerHTML = `
        <div class="step-header">
            <div class="step-header-row">
                <div>
                    <div class="step-title">Applying rename</div>
                    <div class="step-subtitle">
                        Renaming ${toChange.length} agent${toChange.length !== 1 ? 's' : ''}
                        in ${escapeHtml(state.activeSolution?.friendlyName ?? "No solution")}
                    </div>
                </div>
                ${stepperHtml(3)}
            </div>
        </div>
        <section class="panel">
            <div class="panel-head"><span class="panel-title">Progress</span></div>
            <div class="panel-body">
                <ul class="effects" id="apply-progress">
                    ${toChange.map(a => `
                    <li class="effect">
                        ${statusDotHtml(`agent-icon-${a.id}`)}
                        <div class="effect-main">
                            <div class="effect-title">${escapeHtml(a.newName)}</div>
                            <div class="effect-detail">was ${escapeHtml(a.currentName)}</div>
                        </div>
                    </li>`).join('')}
                    <li class="effect">
                        ${statusDotHtml('apply-env-icon')}
                        <div class="effect-main">
                            <div class="effect-title">Environment variable</div>
                            <div class="effect-detail">
                                <code>${escapeHtml(state.envVarSchemaName)}</code>
                                → <strong>"${escapeHtml(state.pendingSuffix)}"</strong>
                            </div>
                        </div>
                    </li>
                </ul>
            </div>
        </section>
        <div id="apply-result"></div>
        <div class="step-footer">
            <button class="btn btn--secondary" id="done-btn" disabled>← Back to Solutions</button>
        </div>`;

    runApply(toChange);
}

/** Everything an apply is about to overwrite, captured before the first write. */
function buildBackupEntry(agents: AgentRecord[]): BackupEntry {
    const hadValue = state.envVarValueId !== null;
    const sol = state.activeSolution;
    return {
        id: newBackupId(),
        createdAt: new Date().toISOString(),
        environment: state.connectionName,
        solution: sol ? (sol.friendlyName || sol.uniqueName) : null,
        agents: agents.map(a => ({ id: a.id, nameBefore: a.currentName, nameAfter: a.newName })),
        variable: {
            schemaName: state.envVarSchemaName,
            definitionExisted: state.envVarDefId !== null,
            valueRecordExisted: hadValue,
            valueBefore: hadValue ? state.currentSuffix : null,
            valueAfter: state.pendingSuffix,
            definitionId: state.envVarDefId,
            valueId: state.envVarValueId,
        },
        status: 'pending',
    };
}

const saveBackup = (entry: BackupEntry) =>
    mutateBackups(toolbox.settings, list => [entry, ...list.filter(e => e.id !== entry.id)]);

async function runApply(agents: AgentRecord[]): Promise<void> {
    const doneBtn = document.getElementById('done-btn') as HTMLButtonElement;
    doneBtn.addEventListener('click', () => {
        state.agentRecords = [];
        state.activeAgent = null;
        navigateTo('welcome');
    });

    // No backup, no write: if the snapshot can't be stored, nothing is touched.
    const entry = buildBackupEntry(agents);
    try {
        await saveBackup(entry);
        log(`Backup saved before applying (${entry.id}).`, 'info');
    } catch (err) {
        log(`Could not save a backup, so nothing was changed: ${err}`, 'error');
        renderApplyResult(null, { kind: 'no-backup', message: String(err) });
        doneBtn.disabled = false;
        return;
    }

    let successCount = 0;
    let errorCount = 0;
    const renamed = new Set<string>();
    let firstError: unknown = null;

    for (const agent of agents) {
        const dotId = `agent-icon-${agent.id}`;
        setStatusDot(dotId, 'running');
        try {
            await dataverse.update('bot', agent.id, { name: agent.newName });
            const cached = state.agents.find(a => a.id === agent.id);
            if (cached) cached.name = agent.newName;
            setStatusDot(dotId, 'success');
            log(`Renamed "${agent.currentName}" → "${agent.newName}"`, 'success');
            renamed.add(agent.id);
            successCount++;
        } catch (err) {
            setStatusDot(dotId, 'error');
            log(`Failed to rename "${agent.currentName}": ${err}`, 'error');
            firstError ??= err;
            errorCount++;
        }
    }
    for (const a of entry.agents) a.renamed = renamed.has(a.id);

    // A refused rename must not leave the variable ahead of the name. When no agent could be
    // renamed the variable stays as it was, so a failed apply changes nothing at all.
    const skipVariable = agents.length > 0 && renamed.size === 0;
    let envOk = false;
    if (skipVariable) {
        entry.variable.written = false;
        setStatusDot('apply-env-icon', 'skipped');
        log('The variable was left untouched because no agent could be renamed.', 'warning');
    } else {
        setStatusDot('apply-env-icon', 'running');
        entry.variable.written = true;
        try {
            await upsertEnvVariable();
            envOk = true;
            setStatusDot('apply-env-icon', 'success');
            log(`Env variable "${state.envVarSchemaName}" set to "${state.pendingSuffix}"`, 'success');
            state.currentSuffix = state.pendingSuffix;
            state.envVarSource = 'value';
            state.suffixDraft = null;   // reopening the agent reads the stored value back
            state.nameSuffixOverride = null;
        } catch (err) {
            setStatusDot('apply-env-icon', 'error');
            log(`Failed to update env variable: ${err}`, 'error');
            errorCount++;
        }
    }

    if (skipVariable) {
        // Nothing was written, so there is nothing to undo: don't leave a pointless backup behind.
        try {
            await mutateBackups(toolbox.settings, list => list.filter(e => e.id !== entry.id));
        } catch (err) {
            log(`The unused backup could not be removed: ${err}`, 'warning');
        }
        void updateHistoryButton();
        doneBtn.disabled = false;
        toolbox.utils.showNotification({
            title: 'Agent Rename Manager',
            body: 'Nothing was changed: Dataverse refused the rename.',
            type: 'error',
        });
        renderApplyResult(null, {
            kind: 'refused',
            locked: isManagedPropertyError(firstError),
            message: String(firstError),
        });
        return;
    }

    // Records created along the way go into the backup, even if a later step failed, so the
    // change stays fully reversible.
    entry.variable.definitionId = state.envVarDefId;
    entry.variable.valueId = state.envVarValueId;
    entry.status = errorCount === 0 ? 'applied' : (renamed.size > 0 || envOk ? 'partial' : 'failed');
    try {
        await saveBackup(entry);
    } catch (err) {
        log(`The backup could not be updated with the result — undo may be incomplete: ${err}`, 'warning');
    }

    // Only agents that were actually renamed count as done
    state.agentRecords = state.agentRecords.map(a =>
        renamed.has(a.id) ? { ...a, currentName: a.newName, renameState: 'no-change' as const } : a);
    // Re-read in the background so the lists reflect what was just written
    void refreshData(true);
    void updateHistoryButton();

    doneBtn.disabled = false;

    if (errorCount === 0) {
        log(`Done! ${successCount} agent(s) renamed successfully.`, 'success');
        toolbox.utils.showNotification({
            title: 'Agent Rename Manager',
            body: `${successCount} agent(s) renamed successfully.`,
            type: 'success',
        });
        renderApplyResult(entry, { kind: 'success' });
    } else {
        log(`Completed with errors: ${successCount} ok, ${errorCount} failed.`, 'warning');
        toolbox.utils.showNotification({
            title: 'Agent Rename Manager',
            body: `${successCount} renamed, ${errorCount} failed — check the log.`,
            type: 'warning',
        });
        renderApplyResult(entry, { kind: 'errors', failed: errorCount });
    }
}

// ── Result panel, rollback ────────────────────────────────────────────────────
/** Dataverse refuses to edit a managed component whose publisher turned off "Can be customized". */
const isManagedPropertyError = (err: unknown) => /0x8004f026|managed property|iscustomizable/i.test(String(err));

/** Shared by every place that has to tell the user an agent can't be edited here. */
const LOCKED_EXPLANATION = `This agent comes from a managed solution whose publisher turned off the
    managed property <strong>Can be customized</strong>, so it can't be edited in this environment.
    Ask the publisher to turn it on in the source environment (managed properties are set before
    exporting as managed) and import the updated solution here.`;

function lockedBannerHtml(): string {
    return `
        <div class="banner banner--error banner-row">
            <div><strong>This agent can't be renamed here.</strong> ${LOCKED_EXPLANATION}</div>
        </div>`;
}

type ApplyOutcome =
    | { kind: 'success' }
    | { kind: 'errors'; failed: number }
    | { kind: 'refused'; locked: boolean; message: string }
    | { kind: 'no-backup'; message: string }
    | { kind: 'rolled-back' }
    | { kind: 'kept' }
    | { kind: 'rollback-failed'; errors: string[] };

function renderApplyResult(entry: BackupEntry | null, outcome: ApplyOutcome): void {
    const host = document.getElementById('apply-result');
    if (!host) return;
    const btn = (id: string, label: string, cls = 'btn--secondary') =>
        `<button type="button" class="btn ${cls} btn--sm" id="${id}">${label}</button>`;

    let tone: 'success' | 'warning' | 'error' | 'info';
    let text: string;
    let actions = '';
    switch (outcome.kind) {
        case 'success':
            tone = 'success';
            text = '<strong>Done.</strong> The previous state was saved as a backup, so you can undo this change.';
            actions = btn('res-undo', 'Undo this change') + btn('res-history', 'View history');
            break;
        case 'errors':
            tone = 'warning';
            text = `<strong>${outcome.failed} step${outcome.failed === 1 ? '' : 's'} failed.</strong>
                Your previous state is backed up. Roll back everything, or keep what was applied.`;
            actions = btn('res-rollback', 'Roll back everything', 'btn--danger') + btn('res-keep', 'Keep current state');
            break;
        case 'refused': {
            tone = 'error';
            const reason = outcome.locked
                ? LOCKED_EXPLANATION
                : `Dataverse said: ${escapeHtml(outcome.message.slice(0, 300))}`;
            text = `<strong>Nothing was changed.</strong> Dataverse refused the rename. ${reason}`;
            break;
        }
        case 'no-backup':
            tone = 'error';
            text = `<strong>Nothing was changed.</strong> The backup could not be saved
                (${escapeHtml(outcome.message)}), and no change is made without one.`;
            break;
        case 'rolled-back':
            tone = 'info';
            text = '<strong>Rolled back.</strong> The agent and the variable are back to how they were.';
            actions = btn('res-history', 'View history');
            break;
        case 'kept':
            tone = 'info';
            text = '<strong>Current state kept.</strong> The backup stays available in History.';
            actions = btn('res-history', 'View history');
            break;
        case 'rollback-failed':
            tone = 'error';
            text = `<strong>Rollback incomplete.</strong> Some steps could not be undone:
                <ul class="result-errors">${outcome.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`;
            actions = btn('res-rollback', 'Try again') + btn('res-history', 'View history');
            break;
    }

    host.innerHTML = `
        <div class="banner banner--${tone} banner-row">
            <div>${text}</div>
            <div class="banner-actions">${actions}</div>
        </div>`;

    const on = (id: string, fn: () => void) =>
        document.getElementById(id)?.addEventListener('click', fn);
    on('res-history', () => navigateTo('history'));
    if (entry) {
        on('res-keep', () => renderApplyResult(entry, { kind: 'kept' }));
        const undo = async () => {
            const res = await performRollback(entry);
            if (res.status === 'done') renderApplyResult(entry, { kind: 'rolled-back' });
            else if (res.status === 'failed') renderApplyResult(entry, { kind: 'rollback-failed', errors: res.errors });
        };
        on('res-undo', () => void undo());
        on('res-rollback', () => void undo());
    }
}

/** "Already gone" is the outcome a delete step wants, so it isn't an error. */
const isMissingRecord = (err: unknown) => /does not exist|not found|404/i.test(String(err));

async function runRollbackStep(step: RollbackStep): Promise<void> {
    switch (step.kind) {
        case 'rename':
            await dataverse.update('bot', step.agentId, { name: step.to });
            break;
        case 'restore-value':
            await dataverse.update('environmentvariablevalue', step.valueId, { value: step.value });
            break;
        case 'delete-value':
            try { await dataverse.delete('environmentvariablevalue', step.valueId); }
            catch (err) { if (!isMissingRecord(err)) throw err; }
            break;
        case 'delete-definition':
            try { await dataverse.delete('environmentvariabledefinition', step.definitionId); }
            catch (err) { if (!isMissingRecord(err)) throw err; }
            break;
    }
}

type RenameStep = Extract<RollbackStep, { kind: 'rename' }>;
const isRenameStep = (s: RollbackStep): s is RenameStep => s.kind === 'rename';

/** Current names of the given agents; null when they couldn't be read. A missing id means deleted. */
async function readAgentNames(ids: string[]): Promise<Map<string, string> | null> {
    if (!ids.length) return new Map();
    try {
        const values = ids.map(id => `<value>${escapeHtml(id)}</value>`).join('');
        const res = await dataverse.fetchXmlQuery(`
            <fetch>
              <entity name="bot">
                <attribute name="botid"/>
                <attribute name="name"/>
                <filter><condition attribute="botid" operator="in">${values}</condition></filter>
              </entity>
            </fetch>`);
        return new Map((res.value as Record<string, unknown>[])
            .map(r => [r.botid as string, r.name as string]));
    } catch {
        return null;
    }
}

/** Warnings about things that changed since the backup, which a rollback would overwrite. */
function rollbackWarnings(
    entry: BackupEntry,
    steps: RollbackStep[],
    current: Map<string, string> | null,
): string[] {
    const warnings: string[] = [];
    const renames = steps.filter(isRenameStep);

    if (renames.length) {
        if (!current) {
            warnings.push("The agents' current names couldn't be checked, so changes made since can't be ruled out.");
        } else {
            for (const s of renames) {
                const now = current.get(s.agentId);
                if (now === undefined) {
                    warnings.push(`The agent "${s.from}" no longer exists, so its name can't be restored.`);
                } else if (now !== s.from) {
                    warnings.push(`The agent is now named "${now}", not "${s.from}" — it was renamed again after this change. Undoing overwrites that name.`);
                }
            }
        }
    }
    if (steps.some(s => s.kind === 'delete-definition')) {
        warnings.push(`Deleting the variable "${entry.variable.schemaName}" also removes it from its solution. Anything that started using it since will lose its value.`);
    }
    return warnings;
}

interface RollbackResult { status: 'done' | 'failed' | 'cancelled'; errors: string[]; }

async function markRolledBack(entry: BackupEntry): Promise<void> {
    try {
        await mutateBackups(toolbox.settings, list => list.map(e =>
            e.id === entry.id ? { ...e, status: 'rolled-back', rolledBackAt: new Date().toISOString() } : e));
    } catch (err) {
        log(`The change was undone, but the backup couldn't be marked as such: ${err}`, 'warning');
    }
    entry.status = 'rolled-back';
}

async function performRollback(entry: BackupEntry): Promise<RollbackResult> {
    if (entry.environment !== state.connectionName) {
        toolbox.utils.showNotification({
            title: 'Agent Rename Manager',
            body: `This backup belongs to ${entry.environment}. Connect to it to restore.`,
            type: 'warning',
        });
        return { status: 'cancelled', errors: [] };
    }

    const planned = planRollback(entry);
    if (!planned.length) {
        toolbox.utils.showNotification({
            title: 'Agent Rename Manager',
            body: 'This change did not alter anything, so there is nothing to undo.',
            type: 'info',
        });
        return { status: 'cancelled', errors: [] };
    }

    // A name that already matches the target needs no write. Skipping it also avoids tripping
    // over the same restriction that stopped the original rename, which would make the undo
    // fail for an agent that is already exactly where the backup wants it.
    const current = await readAgentNames(planned.filter(isRenameStep).map(s => s.agentId));
    const steps = planned.filter(s => !(isRenameStep(s) && current?.get(s.agentId) === s.to));

    if (!steps.length) {
        await markRolledBack(entry);
        log('Nothing to undo: everything is already as it was before this change.', 'info');
        toolbox.utils.showNotification({
            title: 'Agent Rename Manager',
            body: 'Everything is already as it was before this change.',
            type: 'success',
        });
        return { status: 'done', errors: [] };
    }

    const warnings = rollbackWarnings(entry, steps, current);
    const confirmed = await askConfirm({
        title: 'Undo this change?',
        okLabel: 'Undo',
        danger: true,
        bodyHtml: `
            <p style="margin-bottom:10px">This will:</p>
            <ul class="confirm-list">${steps.map(s => `<li>${escapeHtml(describeStep(s))}</li>`).join('')}</ul>
            ${warnings.length ? `
            <div class="banner banner--warning" style="margin-top:12px;margin-bottom:0">
                <div>${warnings.map(w => `<div>${escapeHtml(w)}</div>`).join('')}</div>
            </div>` : ''}`,
    });
    if (!confirmed) return { status: 'cancelled', errors: [] };

    const errors: string[] = [];
    for (const step of steps) {
        try {
            await runRollbackStep(step);
            log(`Undo: ${describeStep(step)}`, 'success');
        } catch (err) {
            errors.push(`${describeStep(step)} — ${err}`);
            log(`Undo failed: ${describeStep(step)} — ${err}`, 'error');
        }
    }

    // Whatever happened, what the lists and the form show is stale now
    for (const a of entry.agents) {
        const cached = state.agents.find(x => x.id === a.id);
        if (cached && !errors.length) cached.name = a.nameBefore;
    }
    state.suffixDraft = null;
    state.nameSuffixOverride = null;
    void refreshData(true);

    if (errors.length) {
        toolbox.utils.showNotification({
            title: 'Agent Rename Manager',
            body: `${errors.length} undo step(s) failed — check the log.`,
            type: 'warning',
        });
        return { status: 'failed', errors };
    }

    await markRolledBack(entry);
    log('Change rolled back.', 'success');
    toolbox.utils.showNotification({
        title: 'Agent Rename Manager',
        body: 'The change was rolled back.',
        type: 'success',
    });
    return { status: 'done', errors: [] };
}

// ── History ───────────────────────────────────────────────────────────────────
async function updateHistoryButton(): Promise<void> {
    try {
        const count = (await readBackups(toolbox.settings)).length;
        els.historyBtn.textContent = count ? `History (${count})` : 'History';
    } catch {
        els.historyBtn.textContent = 'History';
    }
}

const STATUS_CHIP: Record<BackupEntry['status'], [string, string]> = {
    'applied':     ['success', 'Applied'],
    'partial':     ['warning', 'Partial'],
    'failed':      ['error',   'Failed'],
    'pending':     ['warning', 'Interrupted'],
    'rolled-back': ['muted',   'Rolled back'],
};

async function saveToFile(fileName: string, data: unknown): Promise<void> {
    try {
        const path = await toolbox.fileSystem.saveFile(fileName, JSON.stringify(data, null, 2));
        if (path) log(`Saved ${path}`, 'success');
    } catch (err) {
        log(`Could not save the file: ${err}`, 'error');
    }
}

async function renderHistory(): Promise<void> {
    const host = els.stepHistory;
    host.innerHTML = `
        <section class="panel panel--fill">
            <div class="empty-state"><span class="spinner"></span>
                <p style="margin-top:12px">Loading history...</p></div>
        </section>`;

    let list: BackupEntry[];
    try {
        list = await readBackups(toolbox.settings);
    } catch (err) {
        host.innerHTML = `<div class="banner banner--error">Could not read the history: ${escapeHtml(String(err))}</div>`;
        return;
    }
    if (state.currentStep !== 'history') return;   // the user moved on while it loaded

    host.innerHTML = `
        <section class="panel panel--fill">
            <div class="panel-head panel-head--lg">
                <div>
                    <h2 class="panel-heading">History</h2>
                    <div class="panel-sub">
                        A backup is saved before every change and kept ${RETENTION_DAYS} days on this device.
                        Nothing is sent anywhere.
                    </div>
                </div>
                <button type="button" class="btn btn--secondary btn--sm" data-action="export-all"
                    ${list.length ? '' : 'disabled'}>Export all</button>
            </div>
            <div class="panel-table">
                ${list.length ? `
                <table class="data-table data-table--plain">
                    <thead>
                        <tr>
                            <th>When</th><th>Environment</th><th>Agent</th><th>Variable</th><th>Status</th>
                            <th class="col-action"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${list.map(e => {
                            const [chip, label] = STATUS_CHIP[e.status];
                            const wrongEnv = e.environment !== state.connectionName;
                            const noop = planRollback(e).length === 0;
                            const restoreOff = e.status === 'rolled-back' || wrongEnv || noop;
                            const restoreTip = e.status === 'rolled-back' ? 'Already rolled back'
                                : wrongEnv ? `Connect to ${e.environment} to restore`
                                : noop ? 'This change did not alter anything' : 'Undo this change';
                            return `
                        <tr>
                            <td class="cell-muted" title="${escapeHtml(formatAbsoluteDate(e.createdAt))}">${escapeHtml(formatRelativeDate(e.createdAt))}</td>
                            <td><span class="cell-strong">${escapeHtml(e.environment)}</span>
                                <div class="cell-sub">${escapeHtml(e.solution ?? 'No solution')}</div></td>
                            <td>${e.agents.map(a => `
                                <div class="cell-strong">${escapeHtml(a.nameBefore)}</div>
                                <div class="cell-sub">→ ${escapeHtml(a.nameAfter)}</div>`).join('')}</td>
                            <td class="cell-muted" title="${escapeHtml(e.variable.schemaName)}">${escapeHtml(summarizeVariable(e.variable))}</td>
                            <td><span class="chip chip--${chip}">${label}</span></td>
                            <td class="col-action">
                                <div class="row-actions">
                                    <button type="button" class="btn btn--secondary btn--sm" data-action="restore"
                                        data-id="${escapeHtml(e.id)}" title="${escapeHtml(restoreTip)}"
                                        ${restoreOff ? 'disabled' : ''}>Restore</button>
                                    <button type="button" class="btn btn--secondary btn--sm" data-action="export"
                                        data-id="${escapeHtml(e.id)}">Export</button>
                                    <button type="button" class="btn btn--secondary btn--sm" data-action="delete"
                                        data-id="${escapeHtml(e.id)}">Delete</button>
                                </div>
                            </td>
                        </tr>`;
                        }).join('')}
                    </tbody>
                </table>` : `
                <div class="empty-state">
                    <p>No backups yet. One is saved automatically before every change.</p>
                </div>`}
            </div>
        </section>`;

    host.querySelectorAll<HTMLElement>('[data-action]').forEach(el => {
        el.addEventListener('click', () => void onHistoryAction(el.dataset.action!, el.dataset.id, list));
    });
}

async function onHistoryAction(action: string, id: string | undefined, list: BackupEntry[]): Promise<void> {
    if (action === 'export-all') {
        await saveToFile('agent-rename-backups.json', list);
        return;
    }
    const entry = list.find(e => e.id === id);
    if (!entry) return;

    if (action === 'export') {
        await saveToFile(`agent-rename-backup-${entry.id}.json`, entry);
    } else if (action === 'restore') {
        const res = await performRollback(entry);
        if (res.status !== 'cancelled') await renderHistory();
        void updateHistoryButton();
    } else if (action === 'delete') {
        const ok = await askConfirm({
            title: 'Delete this backup?',
            okLabel: 'Delete',
            danger: true,
            bodyHtml: `<p>The change to <strong>${escapeHtml(entry.agents[0]?.nameAfter ?? 'this agent')}</strong>
                can no longer be undone once its backup is gone.</p>`,
        });
        if (!ok) return;
        try {
            await mutateBackups(toolbox.settings, l => l.filter(e => e.id !== entry.id));
            log('Backup deleted.', 'info');
        } catch (err) {
            log(`Could not delete the backup: ${err}`, 'error');
        }
        await renderHistory();
        void updateHistoryButton();
    }
}

async function upsertEnvVariable(): Promise<void> {
    const sol = state.activeSolution;
    const isNewDefinition = !state.envVarDefId;

    if (isNewDefinition) {
        const createResult = await dataverse.create('environmentvariabledefinition', {
            schemaname: state.envVarSchemaName,
            displayname: `Agent Display Suffix — ${sol?.friendlyName ?? 'Environment'}`,
            type: 100000000, // String
            defaultvalue: state.pendingSuffix,
        });
        state.envVarDefId = createResult.id;
    }

    // Components can't be added to a managed solution, so in a downstream environment the variable
    // is created outside it. Normally it never gets here: the definition travels with the solution
    // from the environment where it was first created.
    if (isNewDefinition && sol?.isManaged) {
        log(`"${sol.friendlyName || sol.uniqueName}" is managed, so the variable was created outside it.`, 'warning');
    }
    if (isNewDefinition && sol && !sol.isManaged) {
        await dataverse.execute({
            operationName: 'AddSolutionComponent',
            operationType: 'action',
            parameters: {
                ComponentId: state.envVarDefId,
                ComponentType: 380, // Environment Variable Definition (per official componenttype enum)
                SolutionUniqueName: sol.uniqueName,
                AddRequiredComponents: false,
            },
        });
    }

    // Upsert value record
    if (state.envVarValueId) {
        await dataverse.update('environmentvariablevalue', state.envVarValueId, {
            value: state.pendingSuffix,
        });
    } else {
        const valResult = await dataverse.create('environmentvariablevalue', {
            value: state.pendingSuffix,
            'EnvironmentVariableDefinitionId@odata.bind':
                `/environmentvariabledefinitions(${state.envVarDefId})`,
        });
        state.envVarValueId = valResult.id;
    }
}

// ── Controls ──────────────────────────────────────────────────────────────────
els.clearLogBtn.addEventListener('click', () => {
    els.logEntries.innerHTML = '';
    log('Log cleared.');
});
els.refreshBtn.addEventListener('click', () => loadAgents());
els.historyBtn.addEventListener('click', () => navigateTo('history'));

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


toolbox.events.on((_event, payload) => {
    if (payload.event === 'connection:updated' || payload.event === 'connection:created') {
        log('Connection changed. Reloading...', 'info');
        state.agents = [];
        state.solutions = [];
        state.activeAgent = null;
        state.activeSolution = null;
        state.browsingSolutionId = null;
        state.suffixDraft = null;
        state.nameSuffixOverride = null;
        state.solutionFilter = null;   // the new environment may hold the other kind of solution
        state.connectionName = '';   // keeps the silent refresh idle until the new connection is confirmed
        navigateTo('welcome');
        initConnection();
    }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
log('Agent Rename Manager starting...');
void updateHistoryButton();
initConnection();
