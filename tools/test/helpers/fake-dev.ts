/**
 * Un DEV finto: le solution con la loro versione, e le due chiamate che il tool usa per alzarla.
 *
 * Risponde come risponderebbe Dataverse alle query di `solutionVersion.ts` e ricorda ogni
 * scrittura, cosi' i test possono controllare che cosa e' stato scritto, in che ordine rispetto
 * all'export, e che cosa e' successo quando la scrittura fallisce o non ha effetto.
 */

export interface FakeSolution {
    id: string;
    unique: string;
    version: string;
    managed?: boolean;
}

export interface FakeDev {
    solutions: FakeSolution[];
    /** Ogni versione scritta, in ordine. */
    writes: { id: string; unique: string; version: string }[];
    /** Registro di cio' che e' successo: serve a verificare l'ordine scrittura → export. */
    events: string[];
    /** Se impostato, la scrittura lancia questo errore (permessi mancanti). */
    failWriteWith?: string;
    /** Se `true`, la scrittura va a buon fine ma non cambia nulla (rilettura diversa da quanto scritto). */
    ignoreWrites?: boolean;
    versionOf(unique: string): string;
}

export function makeDev(solutions: FakeSolution[]): FakeDev {
    const dev: FakeDev = {
        solutions: solutions.map(s => ({ ...s })),
        writes: [],
        events: [],
        versionOf: unique => {
            const s = dev.solutions.find(x => x.unique === unique);
            if (!s) throw new Error(`soluzione sconosciuta: ${unique}`);
            return s.version;
        },
    };
    return dev;
}

type Api = Record<string, unknown>;

/**
 * Collega il DEV finto all'oggetto `dataverseAPI` che il tool usa. Si **modifica** l'oggetto
 * esistente invece di sostituirlo, perche' `dataverse.ts` lo cattura una volta sola, all'import.
 */
export function installFakeDev(dev: FakeDev, target: object = (globalThis as { dataverseAPI: object }).dataverseAPI): void {
    const api = target as Api;
    api.queryData = async (path: string) => {
        const list = /^solutions\?.*\$filter=uniquename eq '((?:[^']|'')*)'/.exec(path);
        if (list) {
            const unique = list[1]!.replace(/''/g, "'");
            return {
                value: dev.solutions.filter(s => s.unique === unique).map(s => ({
                    solutionid: s.id, version: s.version, ismanaged: s.managed === true,
                })),
            };
        }
        const one = /^solutions\(([^)]+)\)\?\$select=version/.exec(path);
        if (one) {
            const s = dev.solutions.find(x => x.id === one[1]);
            if (!s) throw new Error('404 not found');
            return { version: s.version };
        }
        throw new Error(`query non prevista dal DEV finto: ${path}`);
    };
    api.update = async (entity: string, id: string, record: Record<string, unknown>) => {
        if (entity !== 'solution') throw new Error(`scrittura non prevista su "${entity}"`);
        if (dev.failWriteWith) throw new Error(dev.failWriteWith);
        const s = dev.solutions.find(x => x.id === id);
        if (!s) throw new Error('404 not found');
        const version = String(record.version);
        dev.writes.push({ id, unique: s.unique, version });
        dev.events.push(`write ${s.unique} ${version}`);
        if (!dev.ignoreWrites) s.version = version;
    };
}
