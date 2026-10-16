/**
 * Fase 2 — import dell'artefatto nell'ambiente di destinazione.
 *
 * È **opzionale e separato**: la fase 1 si chiude con lo zip sul disco (FR-081). Qui si fa
 * solo ciò che si farebbe a mano dal portale, con tre cose in più che a mano si dimenticano:
 * il controllo dell'unmanaged layer preesistente (FR-082), l'avviso update/upgrade (FR-073)
 * e la rilettura del nome a import finito (FR-099).
 *
 * Si importa **solo** l'archivio con `role: 'deploy'`. Quello unmanaged a valle creerebbe una
 * solution unmanaged, cioè il problema che tutto questo flusso elimina (FR-087).
 */

import { fetchXml } from './dataverse';
import { log } from './log';

const dataverse = globalThis.dataverseAPI;

/** Valore sentinella di `overwritetime` quando il componente non è mai stato sovrascritto. */
const NEVER_OVERWRITTEN = '1900-01-01';

export interface TargetAgentState {
    found: boolean;
    name: string;
    isManaged: boolean;
    /**
     * Best effort: `overwritetime` diverso dalla sentinella su un componente managed indica
     * che qualcuno lo ha modificato nell'environment, cioè un unmanaged layer attivo.
     * **Non verificato su un caso reale**: l'avviso di FR-082 si mostra comunque, perché
     * sbagliare per eccesso qui costa un controllo in più, sbagliare per difetto costa un
     * deploy che non cambia il nome e nessuno capisce perché.
     */
    probablyHasUnmanagedLayer: boolean;
}

export async function readTargetAgent(schemaName: string): Promise<TargetAgentState> {
    const rows = await fetchXml(`
        <fetch top="1">
          <entity name="bot">
            <attribute name="name"/>
            <attribute name="ismanaged"/>
            <attribute name="overwritetime"/>
            <filter>
              <condition attribute="schemaname" operator="eq" value="${schemaName}"/>
            </filter>
          </entity>
        </fetch>`);
    const row = rows[0];
    if (!row) return { found: false, name: '', isManaged: false, probablyHasUnmanagedLayer: false };
    const overwrite = String(row.overwritetime ?? '');
    const isManaged = Boolean(row.ismanaged);
    return {
        found: true,
        name: (row.name as string) ?? '',
        isManaged,
        probablyHasUnmanagedLayer: isManaged && !!overwrite && !overwrite.startsWith(NEVER_OVERWRITTEN),
    };
}

/** La versione della solution già installata nel target, se c'è. */
export async function readInstalledVersion(uniqueName: string): Promise<string | null> {
    const rows = await fetchXml(`
        <fetch top="1">
          <entity name="solution">
            <attribute name="version"/>
            <filter><condition attribute="uniquename" operator="eq" value="${uniqueName}"/></filter>
          </entity>
        </fetch>`);
    return rows[0] ? ((rows[0].version as string) ?? null) : null;
}

export interface DeployProgress {
    (text: string, percent?: number): void;
}

export interface DeployOutcome {
    importJobId: string;
    status: 'succeeded' | 'failed';
    message: string;
    /** Nome riletto dal target dopo l'import: la controprova end-to-end (FR-099). */
    nameInTarget: string | null;
    nameMatches: boolean | null;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Importa l'archivio e segue l'import job fino all'esito, poi rilegge `bot.name`.
 *
 * Se il nome riletto non coincide con quello patchato, il deploy **non** viene dichiarato
 * riuscito: vorrebbe dire che l'assunzione sul formato è caduta da qualche parte, ed è
 * esattamente il caso in cui tacere costa di più (FR-099).
 */
export async function deployArtifact(
    bytes: Uint8Array,
    expected: { schemaName: string; name: string },
    onProgress?: DeployProgress,
): Promise<DeployOutcome> {
    onProgress?.('starting import…');
    const { ImportJobId } = await dataverse.deploySolution(bytes, { publishWorkflows: false });
    log(`Import started (job ${ImportJobId}).`);

    let lastPercent = -1;
    for (;;) {
        await sleep(3000);
        const status = await dataverse.getImportJobStatus(ImportJobId) as {
            progress?: number; completedon?: string; data?: string;
        };
        const percent = Math.round(Number(status.progress ?? 0));
        if (percent !== lastPercent) {
            lastPercent = percent;
            onProgress?.(`importing — ${percent}%`, percent);
        }
        if (status.completedon) {
            const failed = /<result result="failure"/i.test(status.data ?? '');
            const outcome: DeployOutcome = {
                importJobId: ImportJobId,
                status: failed ? 'failed' : 'succeeded',
                message: failed ? estraiErrore(status.data ?? '') : 'import completed',
                nameInTarget: null,
                nameMatches: null,
            };
            if (failed) {
                log(`Import failed: ${outcome.message}`, 'error');
                return outcome;
            }

            onProgress?.('verifying agent name…');
            const target = await readTargetAgent(expected.schemaName);
            outcome.nameInTarget = target.found ? target.name : null;
            outcome.nameMatches = target.found ? target.name === expected.name : false;
            if (!outcome.nameMatches) {
                outcome.status = 'failed';
                outcome.message = target.found
                    ? `import succeeded but the agent in the target is named `
                      + `"${target.name}" instead of "${expected.name}"`
                    : 'the agent was not found in the target after the import';
                log(outcome.message, 'error');
            } else {
                log(`Import completed: the agent in the target is named "${target.name}".`, 'success');
            }
            return outcome;
        }
    }
}

/** Il log di import è XML: si prende il primo messaggio di errore leggibile. */
function estraiErrore(xml: string): string {
    const m = /errortext="([^"]+)"/i.exec(xml) ?? /<errortext>([^<]+)</i.exec(xml);
    return m ? m[1]! : 'unspecified error in the import log';
}
