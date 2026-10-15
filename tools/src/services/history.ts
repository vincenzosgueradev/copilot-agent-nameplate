/// <reference types="@pptb/types" />

/**
 * Storico dei packaging.
 *
 * Sostituisce i backup della versione precedente: non essendoci scritture su Dataverse non
 * c'è nulla da annullare. L'artefatto di ripristino è il package originale, che resta nella
 * cartella dell'operazione (FR-078).
 *
 * Tutto resta nello store `settings` locale di PPTB: nessun percorso da indovinare, nessun
 * prompt, nulla lascia il dispositivo.
 */

import { log } from './log';
import { MAX_RECORDS, RETENTION_DAYS, type PackagingRecord } from '../types';

const KEY = 'packagingHistory';
const settings = globalThis.toolboxAPI.settings;

/** Serializza le scritture: più copie del tool possono essere aperte insieme. */
let queue: Promise<unknown> = Promise.resolve();

function isExpired(r: PackagingRecord, now: number): boolean {
    const age = now - new Date(r.timestamp).getTime();
    return age > RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

export async function readHistory(): Promise<PackagingRecord[]> {
    try {
        const raw = await settings.get(KEY);
        const list = Array.isArray(raw) ? (raw as PackagingRecord[]) : [];
        const now = Date.now();
        // Le voci scadute si nascondono in lettura ed escono alla scrittura successiva
        return list.filter(r => !isExpired(r, now));
    } catch (err) {
        log(`Impossibile leggere lo storico: ${err}`, 'warning');
        return [];
    }
}

/** Legge, trasforma e riscrive in un'unica operazione serializzata. */
async function mutate(fn: (list: PackagingRecord[]) => PackagingRecord[]): Promise<void> {
    queue = queue.then(async () => {
        const raw = await settings.get(KEY);
        const current = Array.isArray(raw) ? (raw as PackagingRecord[]) : [];
        const now = Date.now();
        const kept = current.filter(r => !isExpired(r, now));
        const next = fn(kept)
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
            .slice(0, MAX_RECORDS);
        await settings.set(KEY, next);
    });
    await queue;
}

export async function addRecord(record: PackagingRecord): Promise<void> {
    await mutate(list => [record, ...list.filter(r => r.id !== record.id)]);
}

export async function updateRecord(
    id: string,
    fn: (r: PackagingRecord) => PackagingRecord,
): Promise<void> {
    await mutate(list => list.map(r => (r.id === id ? fn(r) : r)));
}

export async function deleteRecord(id: string): Promise<void> {
    await mutate(list => list.filter(r => r.id !== id));
}

export async function clearHistory(): Promise<void> {
    await mutate(() => []);
}
