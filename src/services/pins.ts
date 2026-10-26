/// <reference types="@pptb/types" />

/**
 * Pin delle solution (spec 012).
 *
 * L'insieme dei pin sta nello store `settings` locale di PPTB, come lo storico: e' personale e
 * di questo dispositivo, non va su Dataverse e non entra mai nel package. Per ambiente, col nome
 * univoco della solution (stabile tra rinomine del nome visibile).
 */

import { log } from './log';
import type { PinMap } from '../types';

const KEY = 'solutionPins';

/** Le fissate restano ancorate sotto l'intestazione mentre si scorre: più di tre mangerebbero la lista. */
export const MAX_PINS = 3;

/** Serializza le scritture: più copie del tool possono essere aperte insieme. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Le fissate prima, le altre dopo, e dentro ciascun gruppo l'ordine di ingresso: va chiamata
 * DOPO l'ordinamento scelto dall'utente, così quell'ordinamento vale in entrambi i gruppi.
 */
export function pinFirst<T>(list: readonly T[], isPinned: (item: T) => boolean): T[] {
    const pinned: T[] = [];
    const rest: T[] = [];
    for (const item of list) (isPinned(item) ? pinned : rest).push(item);
    return [...pinned, ...rest];
}

/** Tiene solo ciò che ha la forma attesa: un valore rovinato vale "nessun pin", mai un errore. */
function parse(raw: unknown): PinMap {
    const out: PinMap = {};
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
    for (const [env, names] of Object.entries(raw as Record<string, unknown>)) {
        if (!Array.isArray(names)) continue;
        out[env] = names.filter((n): n is string => typeof n === 'string');
    }
    return out;
}

export async function readPins(environment: string): Promise<string[]> {
    try {
        const raw = await globalThis.toolboxAPI.settings.get(KEY);
        return parse(raw)[environment] ?? [];
    } catch (err) {
        log(`Could not read the pins: ${err}`, 'warning');
        return [];
    }
}

/** Fissa o toglie una solution. Rilancia l'errore di scrittura: chi chiama decide cosa dire. */
export async function setPinned(environment: string, uniqueName: string, on: boolean): Promise<void> {
    const run = queue.then(async () => {
        const settings = globalThis.toolboxAPI.settings;
        const map = parse(await settings.get(KEY));
        const current = map[environment] ?? [];
        const next = on
            ? (current.includes(uniqueName) ? current : [...current, uniqueName])
            : current.filter(n => n !== uniqueName);
        if (next.length) map[environment] = next;
        else delete map[environment];
        await settings.set(KEY, map);
    });
    // Un errore non deve bloccare le scritture successive
    queue = run.catch(() => {});
    await run;
}
