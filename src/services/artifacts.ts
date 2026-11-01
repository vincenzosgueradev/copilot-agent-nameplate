/**
 * Artifact set: ciò che una operazione di packaging lascia su disco.
 *
 * Il principio è quello delle Power Platform Pipelines, che conservano la coppia
 * managed+unmanaged per versione e la trattano come immutabile. La differenza è che qui
 * l'artefatto è patchato — cosa che il pipelines host proibisce esplicitamente — e che quindi
 * accanto restano gli export originali, intatti (FR-083, FR-078).
 *
 *   testAgentTool 1.0.0.2 [UAT, PROD] - 2026-11-01 15-30/
 *   ├── manifest.json                              formato v2: un elenco `targets[]`
 *   ├── testAgentTool_1_0_0_2_managed_UAT.zip      role: deploy   ← l'unico da importare in UAT
 *   ├── testAgentTool_1_0_0_2_managed_PROD.zip     role: deploy   ← l'unico da importare in PROD
 *   ├── testAgentTool_1_0_0_2_unmanaged_UAT.zip    role: source   ← mai a valle (solo con le copie extra)
 *   ├── source_managed.zip                         role: restore  ← una volta sola, comune ai Target
 *   └── source_unmanaged.zip                       role: restore
 *
 * Un giro con piu' Target e' una sola cartella e un solo manifest (spec 016).
 */

import { ensureDirectory, pathExists, warnAboutDialogs, writeBinary, writeText } from './files';
import { log } from './log';
import { agentOutcomes } from './patch';
import type { ArtifactFile, ArtifactSet, PackagingOptions, PackagingRecord } from '../types';
import type { MultiPackagingResult } from './packaging';

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

/**
 * Unisce due pezzi di percorso col separatore che usa gia' il percorso di partenza.
 *
 * La cartella base arriva dal dialog nativo, quindi su Windows ha i backslash: concatenare
 * con `/` produceva `C:\Development\...\tools/testAgentTool 1.0.0.2 [TEST]`, che funziona
 * ma si mostra all'utente e finisce nello storico.
 */
function joinPath(base: string, name: string): string {
    const sep = base.includes('\\') ? '\\' : '/';
    return base.replace(/[\\/]+$/, '') + sep + name;
}

export interface ManifestInput {
    result: MultiPackagingResult;
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
        super(`Overwrite cancelled: ${folderName}`);
        this.name = 'OverwriteDeclined';
    }
}

/** Le etichette dei Target nel nome della cartella: fino a tre, oltre si conta (percorsi Windows, spec 016). */
function targetsTag(names: readonly string[]): string {
    if (names.length > 3) return ` [${names.length} targets]`;
    return ` [${names.map(n => safeForPath(n) || 'no suffix').join(', ')}]`;
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
    const { result, options } = input;
    const pkg = result.targets[0]!.managed.source;
    const now = new Date();

    // La cartella e' per l'occhio: `testAgentTool 1.0.0.2 [UAT, PROD] - 2026-11-01 15-30`.
    // La solution resta in testa, cosi' in Esplora file le operazioni si raggruppano per solution.
    const folderName = `${safeForPath(pkg.uniqueName)} ${pkg.version}${targetsTag(result.targets.map(t => t.target.name))} - ${stamp(now)}`;
    const folderPath = joinPath(baseFolder, folderName);

    // La marca temporale si ferma al minuto, quindi due operazioni sulla stessa solution,
    // versione e Target entro lo stesso minuto ricadono qui (FR-074).
    if (await pathExists(folderPath)) {
        const ok = input.confirmOverwrite ? await input.confirmOverwrite(folderName) : false;
        if (!ok) throw new OverwriteDeclined(folderName);
    }

    await ensureDirectory(folderPath);

    // I nomi dei file restano quelli di FR-074: `{UniqueName}_{Version}_managed_{SUFFISSO}.zip`, uno per Target.
    const base = `${pkg.uniqueName}_${flat(pkg.version)}`;
    const planned: {
        fileName: string; role: ArtifactFile['role']; managed: boolean;
        patched: boolean; bytes: Uint8Array; entryCount: number;
        verification: ArtifactFile['verification']; target?: string;
    }[] = [];
    for (const tr of result.targets) {
        const suffixTag = tr.target.name.trim() || 'nosuffix';
        planned.push({
            fileName: `${base}_managed_${suffixTag}.zip`, role: 'deploy', managed: true,
            patched: true, bytes: tr.managed.bytes,
            entryCount: tr.managed.source.entries.length,
            verification: tr.managed.verification, target: tr.target.name,
        });
        // Scrivere un archivio costa un dialog di salvataggio, perche' PPTB non espone una
        // scrittura binaria: il minimo indispensabile e' un file per Target.
        if (options.keepSourceArtifacts) {
            planned.push({
                fileName: `${base}_unmanaged_${suffixTag}.zip`, role: 'source', managed: false,
                patched: true, bytes: tr.unmanaged.bytes,
                entryCount: tr.unmanaged.source.entries.length,
                verification: tr.unmanaged.verification, target: tr.target.name,
            });
        }
    }
    // Gli export originali sono gli stessi per tutti i Target: una copia sola
    if (options.keepSourceArtifacts) {
        const first = result.targets[0]!;
        planned.push(
            {
                fileName: 'source_managed.zip', role: 'restore', managed: true, patched: false,
                bytes: first.managed.source.bytes,
                entryCount: first.managed.source.entries.length, verification: null,
            },
            {
                fileName: 'source_unmanaged.zip', role: 'restore', managed: false, patched: false,
                bytes: first.unmanaged.source.bytes,
                entryCount: first.unmanaged.source.entries.length, verification: null,
            },
        );
    }

    warnAboutDialogs(planned.length);

    const files: ArtifactFile[] = [];
    let complete = true;
    for (const f of planned) {
        const written = await writeBinary(joinPath(folderPath, f.fileName), f.bytes);
        if (!written) {
            complete = false;
            log(`Save cancelled: ${f.fileName}`, 'warning');
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
            ...(f.target !== undefined ? { target: f.target } : {}),
        });
    }

    const manifest = buildManifest(input, folderName, files, now);
    const manifestPath = joinPath(folderPath, 'manifest.json');
    await writeText(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const set: ArtifactSet = {
        folderPath,
        folderName,
        files,
        manifestPath,
        totalBytes: files.reduce((n, f) => n + f.bytes, 0),
    };
    log(`Artifact set written to ${folderPath} (${files.length} archive(s), `
        + `${(set.totalBytes / 1024).toFixed(0)} KB).`, complete ? 'success' : 'warning');
    return { set, manifest, complete };
}

/** Come un file compare nel manifest. */
function fileEntry(f: ArtifactFile): Record<string, unknown> {
    return {
        fileName: f.fileName,
        role: f.role,
        managed: f.managed,
        patched: f.patched,
        bytes: f.bytes,
        entryCount: f.entryCount,
        sha256: f.sha256,
        verification: f.verification,
        ...(f.role === 'source'
            ? { warning: 'Patched unmanaged: do not import into UAT/PROD, it would create an unmanaged solution.' }
            : {}),
    };
}

/**
 * Il manifest è ciò che permette, mesi dopo, di dire **quale file è stato importato dove**.
 * Porta con sé anche la dichiarazione di FR-102: chi lo apre deve sapere cosa ha in mano.
 *
 * Formato v2 (spec 016, `contracts/manifest-v2.md`): sempre, anche con un solo Target. Le cose
 * comuni a tutti i Target stanno in alto, quelle di ciascun Target dentro `targets[]`.
 */
function buildManifest(
    input: ManifestInput,
    operationId: string,
    files: ArtifactFile[],
    now: Date,
): Record<string, unknown> {
    const { result, options } = input;
    const pkg = result.targets[0]!.managed.source;
    return {
        manifestVersion: 2,
        operationId,
        timestamp: now.toISOString(),
        user: input.user,
        notice:
            'This package was modified by the tool: a single element, '
            + 'bots/<schema>/bot.xml <name>. Microsoft does not support editing a solution\'s '
            + 'files by hand. source_managed.zip, untouched, sits in the same folder.',
        source: {
            environmentUrl: input.sourceEnvironmentUrl,
            solutionUniqueName: pkg.uniqueName,
            version: pkg.version,
            publisher: { uniqueName: pkg.publisherUniqueName, prefix: pkg.publisherPrefix },
        },
        export: { mode: result.exportMode, seconds: Number(result.exportSeconds.toFixed(1)) },
        options: { newVersion: options.newVersion, keepSourceArtifacts: options.keepSourceArtifacts },
        // La versione alzata in DEV prima dell'export (FR-073c): da qui si capisce che DEV e artefatto coincidono
        versionChange: result.versionChange,
        fingerprint: pkg.fingerprint,
        drift: pkg.drift,
        nameOccurrences: pkg.nameOccurrences,
        confirmations: input.confirmations,
        sharedFiles: files.filter(f => f.target === undefined).map(fileEntry),
        targets: result.targets.map((tr, order) => ({
            name: tr.target.name,
            suffix: tr.target.name.trim(),
            order,
            options: {
                publishOnImport: tr.target.publishOnImport,
                publishByAgent: tr.target.publishByAgent ?? options.publishByAgent ?? {},
            },
            agents: agentOutcomes(pkg, tr.plan),
            files: files.filter(f => f.target === tr.target.name).map(fileEntry),
            comparison: tr.comparison
                ? {
                    against: tr.comparison.against,
                    differing: tr.comparison.differing,
                    identicalEntries: tr.comparison.identicalEntries,
                }
                : null,
        })),
    };
}

/**
 * Il record di storico di un'operazione (FR-014): **uno**, anche con piu' Target. I campi di sempre
 * (`suffix`, `agents`, `verification`) sono quelli del primo Target, cosi' i record nuovi si leggono
 * come i vecchi; `targets` porta il dettaglio di ognuno.
 */
export function buildHistoryRecord(input: {
    written: WrittenArtifactSet;
    result: MultiPackagingResult;
    options: PackagingOptions;
    user: string;
    sourceEnvironmentUrl: string;
    confirmations: { what: string; confirmedAt: string }[];
    now?: Date;
}): PackagingRecord {
    const { written, result, options } = input;
    const first = result.targets[0]!;
    const pkg = first.managed.source;
    const names = result.targets.map(t => t.target.name);
    return {
        id: written.set.folderName,
        timestamp: (input.now ?? new Date()).toISOString(),
        user: input.user,
        sourceEnvironmentUrl: input.sourceEnvironmentUrl,
        solutionUniqueName: pkg.uniqueName,
        version: pkg.version,
        managed: true,
        // Un Target solo: il suffisso com'e'. Piu' Target: i nomi uniti, uno vuoto si legge "no suffix".
        suffix: names.length === 1 ? names[0]! : names.map(n => n.trim() || 'no suffix').join(' + '),
        agents: agentOutcomes(pkg, first.plan),
        options: {
            ...options,
            publishOnImport: first.target.publishOnImport,
            publishByAgent: first.target.publishByAgent ?? options.publishByAgent,
        },
        versionChange: result.versionChange,
        artifactSetPath: written.set.folderPath,
        targets: result.targets.map(tr => ({
            name: tr.target.name,
            publishOnImport: tr.target.publishOnImport,
            files: written.set.files
                .filter(f => f.target === tr.target.name)
                .map(f => ({ fileName: f.fileName, role: f.role, sha256: f.sha256 })),
            verification: { managed: tr.managed.verification, unmanaged: tr.unmanaged.verification },
            valid: tr.valid,
        })),
        files: written.set.files.map(f => ({ fileName: f.fileName, role: f.role, sha256: f.sha256 })),
        verification: { managed: first.managed.verification, unmanaged: first.unmanaged.verification },
        exportMode: result.exportMode,
        exportSeconds: result.exportSeconds,
        fingerprint: pkg.fingerprint,
        drift: pkg.drift,
        confirmations: input.confirmations,
        status: written.complete ? 'ok' : 'failed',
    };
}
