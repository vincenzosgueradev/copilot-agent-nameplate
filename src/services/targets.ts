/// <reference types="@pptb/types" />

/**
 * Targets: la lista delle destinazioni del rilascio (spec 016).
 *
 * La lista e le spunte stanno nello store `settings` locale di PPTB, come i pin: sono personali e
 * di questo dispositivo, non vanno su Dataverse e non entrano mai nel package. Per ambiente, col
 * nome della connessione (D1). Le funzioni pure stanno in cima, senza I/O, cosi' si provano da sole.
 */

import { log } from './log';
import {
    SUFFIX_MAX,
    type PublishMode,
    type Target,
    type TargetSelection,
} from '../types';

const TARGETS_KEY = 'releaseTargets';
const SELECTION_KEY = 'targetSelection';

/** I preset di partenza (FR-002): gli stessi sei che il passo Suffix offriva con i pulsanti. */
const DEFAULT_TARGET_NAMES = ['DEV', 'TEST', 'UAT', 'STAGING', 'PREPROD', 'PROD'];

const PUBLISH_MODES: readonly PublishMode[] = ['keep', 'force-true', 'force-false'];

/** `[` e `]` romperebbero il riconoscimento del suffisso; gli altri sono quelli che Windows rifiuta nei nomi di file. */
const FORBIDDEN_CHARS = /[[\]\\/:*?"<>|\u0000-\u001f]/;

// ── Funzioni pure ────────────────────────────────────────────────────────────

/** La lista di partenza: i sei preset, tutti con `publishOnImport: 'keep'`. */
export function defaultTargets(): Target[] {
    return DEFAULT_TARGET_NAMES.map(name => ({ name, publishOnImport: 'keep' as PublishMode }));
}

/**
 * Perche' `name` non va bene come nome di un Target, o `null` se va bene. Il vuoto e' ammesso
 * («nessun suffisso») ma una sola volta. `exceptIndex` e' il Target che si sta rinominando.
 */
export function validateTargetName(name: string, list: readonly Target[], exceptIndex = -1): string | null {
    const clean = name.trim();
    if (clean.length > SUFFIX_MAX) return `At most ${SUFFIX_MAX} characters.`;
    if (FORBIDDEN_CHARS.test(clean)) return 'These characters are not allowed: [ ] \\ / : * ? " < > |';
    const same = list.some((t, i) => i !== exceptIndex && t.name.toLowerCase() === clean.toLowerCase());
    if (same) return clean ? 'There is already a target with this name.' : 'There is already a target without a suffix.';
    return null;
}

/** Sposta un elemento da `from` a `to`. Fuori dai limiti o stessa posizione: una copia identica. */
export function moveTarget<T>(list: readonly T[], from: number, to: number): T[] {
    const out = [...list];
    if (from === to || from < 0 || to < 0 || from >= out.length || to >= out.length) return out;
    const [item] = out.splice(from, 1);
    out.splice(to, 0, item);
    return out;
}

/** Aggiunge in fondo. La validazione e' di chi chiama (`validateTargetName`). */
export function addTarget(list: readonly Target[], name: string, publishOnImport: PublishMode = 'keep'): Target[] {
    return [...list, { name: name.trim(), publishOnImport }];
}

export function removeTarget(list: readonly Target[], index: number): Target[] {
    return list.filter((_, i) => i !== index);
}

export function renameTarget(list: readonly Target[], index: number, name: string): Target[] {
    return list.map((t, i) => (i === index ? { ...t, name: name.trim() } : t));
}

export function setTargetPublish(list: readonly Target[], index: number, publishOnImport: PublishMode): Target[] {
    return list.map((t, i) => (i === index ? { ...t, publishOnImport } : t));
}

/** Tiene delle spunte solo i Target che esistono ancora, nell'ordine della lista (FR-007). */
export function reconcileSelection(names: readonly string[], list: readonly Target[]): string[] {
    const wanted = new Set(names);
    return list.filter(t => wanted.has(t.name)).map(t => t.name);
}

/** Dopo una rinomina la spunta segue il nuovo nome in ogni solution dell'ambiente. */
export function renameInSelections(map: TargetSelection, from: string, to: string): TargetSelection {
    const out: TargetSelection = {};
    for (const [solution, names] of Object.entries(map)) out[solution] = names.map(n => (n === from ? to : n));
    return out;
}

/**
 * Legge la lista di un ambiente da un valore salvato, tenendo solo cio' che ha la forma attesa.
 * `null` = mai configurata (chiave assente o illeggibile): si useranno i preset. Un array, anche
 * vuoto, e' una scelta dell'utente.
 */
function parseTargets(raw: unknown): Target[] | null {
    if (!Array.isArray(raw)) return null;
    const out: Target[] = [];
    for (const item of raw) {
        if (typeof item !== 'object' || item === null) continue;
        const { name, publishOnImport } = item as Record<string, unknown>;
        if (typeof name !== 'string') continue;
        const clean = name.trim();
        if (validateTargetName(clean, out) !== null) continue;   // lungo, con caratteri vietati o doppio
        const mode = PUBLISH_MODES.find(m => m === publishOnImport) ?? 'keep';
        out.push({ name: clean, publishOnImport: mode });
    }
    return out;
}

function parseMap(raw: unknown): Record<string, unknown> {
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
}

function parseSelection(raw: unknown): TargetSelection {
    const out: TargetSelection = {};
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
    for (const [solution, names] of Object.entries(raw as Record<string, unknown>)) {
        if (!Array.isArray(names)) continue;
        out[solution] = names.filter((n): n is string => typeof n === 'string');
    }
    return out;
}

// ── Store ────────────────────────────────────────────────────────────────────

/** Serializza le scritture: piu' copie del tool possono essere aperte insieme (una scheda per connessione). */
let queue: Promise<unknown> = Promise.resolve();
const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job);
    queue = run.catch(() => {});   // un errore non deve bloccare le scritture successive
    return run;
};

/** La lista dell'ambiente: quella salvata, o i preset se non e' mai stata configurata o e' illeggibile. */
export async function readTargets(environment: string): Promise<Target[]> {
    try {
        const raw = parseMap(await globalThis.toolboxAPI.settings.get(TARGETS_KEY))[environment];
        const parsed = parseTargets(raw);
        if (parsed) return parsed;
        if (raw !== undefined) log('The saved targets could not be read: the default list is used.', 'warning');
        return defaultTargets();
    } catch (err) {
        log(`Could not read the targets: ${err}`, 'warning');
        return defaultTargets();
    }
}

/**
 * Salva la lista dell'ambiente. Con `renamed` le spunte salvate seguono il nuovo nome, nella stessa
 * scrittura in coda. Rilancia l'errore di scrittura: chi chiama decide cosa dire (FR-004).
 */
export async function saveTargets(
    environment: string,
    list: readonly Target[],
    renamed?: { from: string; to: string },
): Promise<void> {
    await enqueue(async () => {
        const settings = globalThis.toolboxAPI.settings;
        const map = parseMap(await settings.get(TARGETS_KEY));
        map[environment] = list.map(t => ({ name: t.name, publishOnImport: t.publishOnImport }));
        await settings.set(TARGETS_KEY, map);

        if (renamed && renamed.from !== renamed.to) {
            const all = parseMap(await settings.get(SELECTION_KEY));
            const mine = parseSelection(all[environment]);
            all[environment] = renameInSelections(mine, renamed.from, renamed.to);
            await settings.set(SELECTION_KEY, all);
        }
    });
}

/** Le spunte dell'ultimo giro per quella solution, ripulite dai Target che non ci sono piu'. */
export async function readSelection(environment: string, solution: string, list: readonly Target[]): Promise<string[]> {
    try {
        const all = parseMap(await globalThis.toolboxAPI.settings.get(SELECTION_KEY));
        return reconcileSelection(parseSelection(all[environment])[solution] ?? [], list);
    } catch (err) {
        log(`Could not read the selected targets: ${err}`, 'warning');
        return [];
    }
}

/** Ricorda le spunte. Una lista vuota toglie la voce; l'ultima voce toglie la chiave dell'ambiente. */
export async function saveSelection(environment: string, solution: string, names: readonly string[]): Promise<void> {
    await enqueue(async () => {
        const settings = globalThis.toolboxAPI.settings;
        const all = parseMap(await settings.get(SELECTION_KEY));
        const mine = parseSelection(all[environment]);
        if (names.length) mine[solution] = [...names];
        else delete mine[solution];
        if (Object.keys(mine).length) all[environment] = mine;
        else delete all[environment];
        await settings.set(SELECTION_KEY, all);
    });
}
