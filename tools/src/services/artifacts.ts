/**
 * Artifact set: ciò che una operazione di packaging lascia su disco.
 *
 * Il principio è quello delle Power Platform Pipelines, che conservano la coppia
 * managed+unmanaged per versione e la trattano come immutabile. La differenza è che qui
 * l'artefatto è patchato — cosa che il pipelines host proibisce esplicitamente — e che quindi
 * accanto restano gli export originali, intatti (FR-083, FR-078).
 *
 *   testAgentTool_1.0.0.2_UAT_20261015-143022/
 *   ├── manifest.json
 *   ├── testAgentTool_1_0_0_2_managed_UAT.zip      role: deploy   ← l'unico da importare
 *   ├── testAgentTool_1_0_0_2_unmanaged_UAT.zip    role: source   ← mai a valle
 *   ├── source_managed.zip                         role: restore
 *   └── source_unmanaged.zip                       role: restore
 */

import { ensureDirectory, pathExists, warnAboutDialogs, writeBinary, writeText } from './files';
import { log } from './log';
import type { ArtifactFile, ArtifactSet, PackagingOptions } from '../types';
import type { PackagingResult } from './packaging';

/** SHA-256 in esadecimale. È ciò che distingue due artefatti con la stessa `<Version>`. */
export async function sha256(bytes: Uint8Array): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Data e ora al minuto, leggibili: `2026-10-15 21-38`.
 *
 * I due punti separerebbero meglio ore e minuti ma Windows non li ammette nei nomi di
 * cartella, quindi trattino.
 */
function stamp(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
        + ` ${p(d.getHours())}-${p(d.getMinutes())}`;
}

/** Via i caratteri che Windows rifiuta: il suffisso lo scrive l'utente, puo' contenere di tutto. */
const safeForPath = (s: string) => s.replace(/[\\/:*?"<>|]/g, '').trim();

/** `1.0.0.2` → `1_0_0_2`, perché i punti nel nome file confondono l'estensione. */
const flat = (v: string) => v.replace(/\./g, '_');

export interface ManifestInput {
    result: PackagingResult;
    suffix: string;
    options: PackagingOptions;
    sourceEnvironmentUrl: string;
    user: string;
    /** Conferme esplicite date dall'utente (componenti extra, occorrenze impreviste). */
    confirmations: { what: string; confirmedAt: string }[];
    /**
     * Chiesta quando la cartella dell'operazione esiste gia' (FR-074). Rispondere `false`
     * annulla la scrittura senza toccare nulla. Il nome della cartella lo compone questo
     * servizio, quindi la domanda non puo' che partire da qui.
     */
    confirmOverwrite?: (folderName: string) => Promise<boolean>;
}

export interface WrittenArtifactSet {
    set: ArtifactSet;
    manifest: Record<string, unknown>;
    /** `false` se l'utente ha annullato uno dei salvataggi. */
    complete: boolean;
}

/** L'utente ha rifiutato di sovrascrivere: non e' un errore, e' una scelta. */
export class OverwriteDeclined extends Error {
    constructor(public readonly folderName: string) {
        super(`Sovrascrittura annullata: ${folderName}`);
        this.name = 'OverwriteDeclined';
    }
}

/**
 * Scrive l'artifact set e il suo manifest.
 *
 * L'ordine conta: prima gli archivi, poi il manifest. Un manifest che descrive file non ancora
 * scritti sarebbe peggio di nessun manifest.
 */
export async function writeArtifactSet(
    baseFolder: string,
    input: ManifestInput,
): Promise<WrittenArtifactSet> {
    const { result, suffix, options } = input;
    const pkg = result.managed.source;
    const now = new Date();
    // I nomi dei file restano quelli di FR-074: `{UniqueName}_{Version}_managed_{SUFFISSO}.zip`.
    const suffixTag = suffix.trim() || 'nosuffix';

    // La cartella invece e' per l'occhio: `testAgentTool 1.0.0.2 [UAT] - 2026-10-15 21-38`.
    // La solution resta in testa, cosi' in Esplora file le operazioni si raggruppano per solution.
    const clean = safeForPath(suffix);
    const tag = clean ? ` [${clean}]` : ' [senza suffisso]';
    const folderName = `${safeForPath(pkg.uniqueName)} ${pkg.version}${tag} - ${stamp(now)}`;
    const folderPath = `${baseFolder}/${folderName}`;

    // La marca temporale si ferma al minuto, quindi due operazioni sulla stessa solution,
    // versione e suffisso entro lo stesso minuto ricadono qui (FR-074).
    if (await pathExists(folderPath)) {
        const ok = input.confirmOverwrite ? await input.confirmOverwrite(folderName) : false;
        if (!ok) throw new OverwriteDeclined(folderName);
    }

    await ensureDirectory(folderPath);

    const base = `${pkg.uniqueName}_${flat(pkg.version)}`;
    const planned: {
        fileName: string; role: ArtifactFile['role']; managed: boolean;
        patched: boolean; bytes: Uint8Array; entryCount: number;
        verification: ArtifactFile['verification'];
    }[] = [
        {
            fileName: `${base}_managed_${suffixTag}.zip`, role: 'deploy', managed: true,
            patched: true, bytes: result.managed.bytes,
            entryCount: result.managed.source.entries.length,
            verification: result.managed.verification,
        },
    ];
    // Scrivere un archivio costa un dialog di salvataggio, perche' PPTB non espone una
    // scrittura binaria: il minimo indispensabile e' un file solo.
    if (options.keepSourceArtifacts) {
        planned.push(
            {
                fileName: `${base}_unmanaged_${suffixTag}.zip`, role: 'source', managed: false,
                patched: true, bytes: result.unmanaged.bytes,
                entryCount: result.unmanaged.source.entries.length,
                verification: result.unmanaged.verification,
            },
            {
                fileName: 'source_managed.zip', role: 'restore', managed: true, patched: false,
                bytes: result.managed.source.bytes,
                entryCount: result.managed.source.entries.length, verification: null,
            },
            {
                fileName: 'source_unmanaged.zip', role: 'restore', managed: false, patched: false,
                bytes: result.unmanaged.source.bytes,
                entryCount: result.unmanaged.source.entries.length, verification: null,
            },
        );
    }

    warnAboutDialogs(planned.length);

    const files: ArtifactFile[] = [];
    let complete = true;
    for (const f of planned) {
        const written = await writeBinary(`${folderPath}/${f.fileName}`, f.bytes);
        if (!written) {
            complete = false;
            log(`Salvataggio annullato: ${f.fileName}`, 'warning');
            continue;
        }
        files.push({
            fileName: f.fileName,
            role: f.role,
            managed: f.managed,
            patched: f.patched,
            bytes: f.bytes.length,
            entryCount: f.entryCount,
            sha256: await sha256(f.bytes),
            verification: f.verification,
        });
    }

    const manifest = buildManifest(input, folderName, files, now);
    const manifestPath = `${folderPath}/manifest.json`;
    await writeText(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const set: ArtifactSet = {
        folderPath,
        folderName,
        files,
        manifestPath,
        totalBytes: files.reduce((n, f) => n + f.bytes, 0),
    };
    log(`Artifact set scritto in ${folderPath} (${files.length} archivi, `
        + `${(set.totalBytes / 1024).toFixed(0)} KB).`, complete ? 'success' : 'warning');
    return { set, manifest, complete };
}

/**
 * Il manifest è ciò che permette, mesi dopo, di dire **quale file è stato importato dove**.
 * Porta con sé anche la dichiarazione di FR-102: chi lo apre deve sapere cosa ha in mano.
 */
function buildManifest(
    input: ManifestInput,
    operationId: string,
    files: ArtifactFile[],
    now: Date,
): Record<string, unknown> {
    const { result, suffix, options } = input;
    const pkg = result.managed.source;
    return {
        operationId,
        timestamp: now.toISOString(),
        user: input.user,
        notice:
            'Questo package e\' stato modificato dal tool: un solo elemento, '
            + 'bots/<schema>/bot.xml <name>. Microsoft non supporta la modifica manuale dei file '
            + 'di una solution. source_managed.zip, non modificato, e\' nella stessa cartella.',
        source: {
            environmentUrl: input.sourceEnvironmentUrl,
            solutionUniqueName: pkg.uniqueName,
            version: pkg.version,
            publisher: { uniqueName: pkg.publisherUniqueName, prefix: pkg.publisherPrefix },
        },
        suffix,
        export: { mode: result.exportMode, seconds: Number(result.exportSeconds.toFixed(1)) },
        options,
        agents: result.plan
            .filter(c => c.element === 'name')
            .map(c => ({
                schemaName: pkg.agents.find(a => a.file === c.file)?.schemaName ?? '',
                before: c.before,
                after: c.after,
            })),
        fingerprint: pkg.fingerprint,
        drift: pkg.drift,
        nameOccurrences: pkg.nameOccurrences,
        confirmations: input.confirmations,
        files: files.map(f => ({
            fileName: f.fileName,
            role: f.role,
            managed: f.managed,
            patched: f.patched,
            bytes: f.bytes,
            entryCount: f.entryCount,
            sha256: f.sha256,
            verification: f.verification,
            ...(f.role === 'source'
                ? { warning: 'Unmanaged patchato: non importare in UAT/PROD, creerebbe una solution unmanaged.' }
                : {}),
        })),
    };
}
