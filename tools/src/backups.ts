/**
 * Backups of what an apply is about to overwrite, and the plan to put it back.
 *
 * Everything here is pure or takes its storage as a parameter, so it can be exercised
 * without the PPTB host. Backups live in the tool's local settings store: nothing leaves the
 * device.
 */

export const BACKUPS_KEY = 'backups';
export const RETENTION_DAYS = 30;
export const MAX_ENTRIES = 200;

export interface BackupAgent {
    id: string;
    nameBefore: string;
    nameAfter: string;
    /**
     * Whether the rename went through. `false` means Dataverse refused it, so there is nothing
     * to undo; undefined means unknown (the apply was interrupted), which is treated as "maybe".
     */
    renamed?: boolean;
}

export interface BackupVariable {
    schemaName: string;
    /** The definition was already there before this apply. */
    definitionExisted: boolean;
    /** A current value record existed (otherwise the default value was in effect). */
    valueRecordExisted: boolean;
    /** The current value before the apply; only meaningful when `valueRecordExisted`. */
    valueBefore: string | null;
    valueAfter: string;
    /** Ids are filled in as records are created, so a half-finished apply is still reversible. */
    definitionId: string | null;
    valueId: string | null;
    /** `false` when the variable was deliberately left untouched; undefined means unknown. */
    written?: boolean;
}

export type BackupStatus = 'pending' | 'applied' | 'partial' | 'failed' | 'rolled-back';

export interface BackupEntry {
    id: string;
    createdAt: string;
    environment: string;
    solution: string | null;
    agents: BackupAgent[];
    variable: BackupVariable;
    status: BackupStatus;
    rolledBackAt?: string;
}

export type RollbackStep =
    | { kind: 'rename'; agentId: string; from: string; to: string }
    | { kind: 'restore-value'; valueId: string; value: string }
    | { kind: 'delete-value'; valueId: string }
    | { kind: 'delete-definition'; definitionId: string };

export interface KeyValueStore {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
}

export function newBackupId(now: Date = new Date()): string {
    const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    return `${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Drops entries past retention and caps the list, keeping the newest. */
export function pruneBackups(
    list: BackupEntry[],
    now: Date = new Date(),
    retentionDays: number = RETENTION_DAYS,
    max: number = MAX_ENTRIES,
): BackupEntry[] {
    const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
    return list
        .filter(e => {
            const t = Date.parse(e.createdAt);
            return Number.isNaN(t) || t >= cutoff;
        })
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, max);
}

/**
 * The steps that undo an entry, in the order they must run (a value is removed before the
 * definition that owns it). Anything that was never written is left out: agents whose name did
 * not change or whose rename was refused, and the variable when the apply skipped it.
 */
export function planRollback(entry: BackupEntry): RollbackStep[] {
    const steps: RollbackStep[] = [];

    for (const a of entry.agents) {
        if (a.nameBefore !== a.nameAfter && a.renamed !== false) {
            steps.push({ kind: 'rename', agentId: a.id, from: a.nameAfter, to: a.nameBefore });
        }
    }

    const v = entry.variable;
    if (v.written === false) return steps;
    if (!v.definitionExisted) {
        // The apply created the variable, so undoing it means removing what was created.
        if (v.valueId) steps.push({ kind: 'delete-value', valueId: v.valueId });
        if (v.definitionId) steps.push({ kind: 'delete-definition', definitionId: v.definitionId });
    } else if (v.valueRecordExisted) {
        if (v.valueId && v.valueBefore !== v.valueAfter) {
            steps.push({ kind: 'restore-value', valueId: v.valueId, value: v.valueBefore ?? '' });
        }
    } else if (v.valueId) {
        // Only the default value was in effect; the apply added a current value on top of it.
        steps.push({ kind: 'delete-value', valueId: v.valueId });
    }

    return steps;
}

/** Plain-language description of one step, for confirmation text and the log. */
export function describeStep(step: RollbackStep): string {
    switch (step.kind) {
        case 'rename':
            return `Rename the agent back to "${step.to}"`;
        case 'restore-value':
            return step.value
                ? `Set the variable's value back to "${step.value}"`
                : 'Set the variable\'s value back to empty';
        case 'delete-value':
            return 'Remove the value this change saved on the variable';
        case 'delete-definition':
            return 'Delete the variable this change created';
    }
}

/** One-line summary of what an entry changed, for the history table. */
export function summarizeVariable(v: BackupVariable): string {
    if (!v.definitionExisted) return `Created, set to "${v.valueAfter}"`;
    if (!v.valueRecordExisted) return `Saved "${v.valueAfter}" (was using the default)`;
    if (v.valueBefore === v.valueAfter) return 'Unchanged';
    return `"${v.valueBefore ?? ''}" → "${v.valueAfter}"`;
}

/**
 * Read-modify-write against the store, one at a time within this instance. The list is
 * re-read on every write because several copies of the tool can be open at once.
 */
let queue: Promise<unknown> = Promise.resolve();

export function mutateBackups(
    store: KeyValueStore,
    mutator: (list: BackupEntry[]) => BackupEntry[],
    now: Date = new Date(),
): Promise<BackupEntry[]> {
    const run = queue.then(async () => {
        const raw = await store.get(BACKUPS_KEY);
        const current = Array.isArray(raw) ? (raw as BackupEntry[]) : [];
        const next = pruneBackups(mutator(current), now);
        await store.set(BACKUPS_KEY, next);
        return next;
    });
    queue = run.catch(() => undefined);
    return run;
}

/** Newest first, with expired entries hidden even if they haven't been pruned from disk yet. */
export async function readBackups(store: KeyValueStore, now: Date = new Date()): Promise<BackupEntry[]> {
    const raw = await store.get(BACKUPS_KEY);
    return pruneBackups(Array.isArray(raw) ? (raw as BackupEntry[]) : [], now);
}
