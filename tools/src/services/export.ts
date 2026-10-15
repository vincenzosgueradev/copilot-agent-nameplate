/**
 * Export della solution: sincrono come percorso primario, asincrono come fallback (FR-093).
 *
 * Perché in quest'ordine, misurato il 2026-10-15 (research.md §13):
 *
 *   sincrono   testAgentTool  7,3 s   SigmaMonitoringAgent 10,3 s   FactoryHub 79,8 s
 *   asincrono  testAgentTool  154 s   ← di cui 152 s di sola coda, a prescindere dalla dimensione
 *
 * I 152 secondi non dipendono dal peso della solution: sono tempo di coda del job. Usare
 * sempre l'asincrono significherebbe ~5 minuti per ogni packaging, visto che gli export sono
 * due (managed + unmanaged, FR-084). Il fallback resta per le solution su cui il sincrono
 * andrebbe in timeout, dove è l'unica strada che arriva in fondo.
 */

import { callAction, getOne } from './dataverse';
import { log } from './log';

/**
 * Oltre questo tempo il sincrono viene considerato perso e si passa all'asincrono.
 * L'export sincrono più lento misurato è 79,8 s (FactoryHub, 976 KB): 180 s lascia margine
 * abbondante senza far aspettare all'infinito.
 */
const SYNC_TIMEOUT_MS = 180_000;

/** Intervallo fra le letture di `asyncoperation`. 53 letture per 152 s nella prova reale. */
const POLL_INTERVAL_MS = 3_000;

/** Oltre questo tempo si smette di aspettare anche il job asincrono. */
const ASYNC_TIMEOUT_MS = 900_000;

/** `statecode` 3 = Completed. */
const ASYNC_STATE_COMPLETED = 3;
/** `statuscode` 30 = Succeeded. */
const ASYNC_STATUS_SUCCEEDED = 30;

export interface ExportResult {
    bytes: Uint8Array;
    mode: 'sync' | 'async';
    seconds: number;
}

export interface ExportProgress {
    (phase: string): void;
}

/** base64 → bytes, a blocchi per non costruire stringhe enormi in un colpo solo. */
function decodeBase64(b64: string): Uint8Array {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

function fileFrom(res: Record<string, unknown>, where: string): Uint8Array {
    const b64 = res.ExportSolutionFile as string | undefined;
    if (!b64) throw new Error(`${where}: risposta senza ExportSolutionFile`);
    return decodeBase64(b64);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Percorso primario: una sola chiamata, la risposta contiene già il file. */
async function exportSync(solutionName: string, managed: boolean): Promise<Uint8Array> {
    const call = callAction('ExportSolution', { SolutionName: solutionName, Managed: managed });
    const timeout = sleep(SYNC_TIMEOUT_MS).then(() => {
        throw new Error(`export sincrono oltre ${SYNC_TIMEOUT_MS / 1000} s`);
    });
    const res = await Promise.race([call, timeout]) as Record<string, unknown>;
    return fileFrom(res, 'ExportSolution');
}

/**
 * Fallback: avvia un job, ne attende il completamento, poi scarica il file.
 *
 * ⚠️ Il `$select` sul polling deve chiedere **solo** `statecode` e `statuscode`: una colonna
 * inesistente su `asyncoperations` risponde **HTTP 400**, non un campo vuoto (FR-094).
 */
async function exportAsync(
    solutionName: string,
    managed: boolean,
    onProgress?: ExportProgress,
): Promise<Uint8Array> {
    const started = await callAction('ExportSolutionAsync', {
        SolutionName: solutionName,
        Managed: managed,
    });
    const asyncOperationId = started.AsyncOperationId as string;
    const exportJobId = started.ExportJobId as string;
    if (!asyncOperationId || !exportJobId) {
        throw new Error('ExportSolutionAsync: risposta senza AsyncOperationId o ExportJobId');
    }

    const deadline = Date.now() + ASYNC_TIMEOUT_MS;
    let polls = 0;
    for (;;) {
        const op = await getOne(`asyncoperations(${asyncOperationId})?$select=statecode,statuscode`);
        const state = op.statecode as number;
        const status = op.statuscode as number;
        if (state === ASYNC_STATE_COMPLETED) {
            if (status !== ASYNC_STATUS_SUCCEEDED) {
                throw new Error(`job di export non riuscito (statuscode ${status})`);
            }
            break;
        }
        if (Date.now() > deadline) {
            throw new Error(`job di export ancora in corso dopo ${ASYNC_TIMEOUT_MS / 60000} minuti`);
        }
        polls++;
        onProgress?.(`job di export in coda — ${polls} controlli, ${Math.round((Date.now() - (deadline - ASYNC_TIMEOUT_MS)) / 1000)} s`);
        await sleep(POLL_INTERVAL_MS);
    }

    const res = await callAction('DownloadSolutionExportData', { ExportJobId: exportJobId });
    return fileFrom(res, 'DownloadSolutionExportData');
}

/**
 * Esporta una solution, con il fallback già dentro: chi chiama non deve scegliere nulla
 * e scopre dal risultato quale percorso è stato usato (FR-093).
 */
export async function exportSolution(
    solutionName: string,
    managed: boolean,
    onProgress?: ExportProgress,
): Promise<ExportResult> {
    const label = managed ? 'managed' : 'unmanaged';
    const t0 = Date.now();
    onProgress?.(`export ${label} in corso…`);
    try {
        const bytes = await exportSync(solutionName, managed);
        const seconds = (Date.now() - t0) / 1000;
        log(`Export ${label} completato in ${seconds.toFixed(1)} s (${bytes.length} byte).`, 'success');
        return { bytes, mode: 'sync', seconds };
    } catch (err) {
        // Il fallback non si chiede all'utente: si dichiara mentre avviene (FR-093)
        log(`L'export ${label} sta richiedendo più del previsto, passo alla modalità asincrona: ${err}`,
            'warning');
        onProgress?.(`export ${label}: passo alla modalità asincrona…`);
        const bytes = await exportAsync(solutionName, managed, onProgress);
        const seconds = (Date.now() - t0) / 1000;
        log(`Export ${label} completato in modalità asincrona in ${seconds.toFixed(1)} s `
            + `(${bytes.length} byte).`, 'success');
        return { bytes, mode: 'async', seconds };
    }
}

/**
 * La coppia richiesta da FR-084: due `ExportSolution` distinti, mai uno derivato dall'altro
 * modificando `<Managed>` in solution.xml.
 *
 * Su una solution di soli bot i due archivi differiscono **solo** per quel flag (verificato,
 * research.md §10) — ma l'equivalenza cade appena entrano tabelle, form o managed property,
 * e un package managed costruito a mano non è un package managed.
 */
export async function exportPair(
    solutionName: string,
    onProgress?: ExportProgress,
): Promise<{ managed: ExportResult; unmanaged: ExportResult }> {
    const managed = await exportSolution(solutionName, true, onProgress);
    const unmanaged = await exportSolution(solutionName, false, onProgress);
    return { managed, unmanaged };
}
