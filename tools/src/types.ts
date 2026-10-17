/**
 * Entità del flusso di packaging.
 *
 * Fonte: specs/001-agent-rename-manager/data-model.md
 * I valori citati nei commenti sono **misurati** su export reali (research.md §9 → §15),
 * non ipotesi: vanno riletti prima di cambiarli.
 */

// ── Dataverse (sola lettura) ─────────────────────────────────────────────────

export interface Solution {
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
    /** `false` per le managed: non sono esportabili, quindi non possono essere sorgente (FR-068). */
    exportable: boolean;
}

/** Che cosa è successo a un agent in un'operazione di rename. */
export interface AgentOutcome {
    schemaName: string;
    before: string;
    after: string;
    /** Escluso dall'utente: resta com'era. Assente nei record storici precedenti. */
    excluded?: boolean;
}

/** Un agent come compare nelle liste. Fonte autoritativa: la tabella `bot` (FR-024). */
/** Icona e descrizione di un agent, solo per mostrarle (spec 008). Mai nel package. */
export interface AgentCard {
    /** `data:image/png;base64,…` oppure `null` se assente o non valida. */
    iconDataUri: string | null;
    /** Testo normalizzato, oppure `null` se assente. */
    description: string | null;
}

export interface AgentListItem {
    id: string;
    name: string;
    schemaName: string;
    solution: Solution | null;
    isActive: boolean;
    createdOn: string;
    modifiedOn: string;
    /** Vuoto quando l'agent non è mai stato pubblicato. */
    publishedOn: string;
}

// ── Opzioni e sessione ───────────────────────────────────────────────────────

/** Tre stati; `keep` **non tocca il file** (FR-090). */
export type PublishMode = 'keep' | 'force-true' | 'force-false';

export interface PackagingOptions {
    /**
     * Versione a cui portare la solution **in DEV** prima dell'export (FR-073). `null` = non si
     * tocca: l'export porta la versione che DEV ha gia'. Non si scrive mai dentro lo zip.
     */
    newVersion: string | null;
    /** Valore di partenza per **tutti** gli agent; ogni agent puo' cambiarlo (FR-090a). */
    publishOnImport: PublishMode;
    /**
     * Eccezioni per agent, per `schemaName`. Un agent assente segue `publishOnImport`. Assente
     * nei record storici precedenti alla 1.0.1.
     */
    publishByAgent?: Record<string, PublishMode>;
    /**
     * Conserva le copie aggiuntive: l'unmanaged patchato e i due export originali (FR-078,
     * FR-088). Spento, l'artifact set e' il minimo che serve per importare — il managed
     * patchato e il manifest — e costa un salvataggio invece di quattro.
     */
    keepSourceArtifacts: boolean;
}

export const DEFAULT_OPTIONS: PackagingOptions = {
    newVersion: null,
    publishOnImport: 'keep',
    keepSourceArtifacts: false,
};

export type PackagingStep = 'solution' | 'suffix' | 'preview' | 'result';

export interface PackagingSession {
    sessionId: string;
    sourceEnvironmentUrl: string;
    solutionUniqueName: string;
    /** Suffisso senza parentesi quadre (es. `UAT`); vuoto = rimuovi il suffisso. */
    suffix: string;
    /** `schemaName` degli agent da rinominare (FR-076). */
    selectedAgents: string[];
    options: PackagingOptions;
    /** Popolato dopo i **due** export (FR-084). */
    packageContents: { managed: PackageContents; unmanaged: PackageContents } | null;
    patchPlan: PatchChange[];
    artifactSet: ArtifactSet | null;
    step: PackagingStep;
}

// ── Contenuto del package ────────────────────────────────────────────────────

export interface PackageEntry {
    /** Percorso nell'archivio, **immutabile** (FR-069). */
    path: string;
    data: Uint8Array;
    /** `true` solo per le entry effettivamente riscritte. */
    patched: boolean;
}

export interface PackagedAgent {
    /** Attributo `schemaname` di `<bot>` — **mai modificato** (FR-069, FR-101). */
    schemaName: string;
    /** `bots/<schemaname>/bot.xml` */
    file: string;
    /** `<name>` — **l'unico campo patchato**. */
    name: string;
    /** `name` senza il suffisso finale ` [X]`, calcolato (FR-071). */
    baseName: string;
    /** `X` estratto da ` [X]`, se presente. */
    currentSuffix: string | null;
    /**
     * `configuration.json` → `publishOnImport`.
     * **`null` = campo assente**, cioè "non specificato": 28 agent su 40 nell'environment
     * di riferimento, e il default all'import non è documentato (FR-080, FR-090).
     */
    publishOnImport: boolean | null;
    /** `configuration.json` → `channels[].channelId` */
    channels: string[];
}

export interface PackagedVariable {
    schemaName: string;
    file: string;
    /** `<type>` — `100000000` = String. */
    type: string;
    /**
     * `<defaultvalue>`, assente negli export verificati. **Sola lettura**: il tool non lo
     * scrive mai (FR-089).
     */
    defaultValue: string | null;
}

/** Una voce dell'inventario: che cosa viaggia oltre all'agent (FR-091). */
export interface PackageComponent {
    /** Cartella di primo livello (`bots/`, `botcomponents/`, `workflows/`, ...). */
    path: string;
    kind: string;
    /**
     * **Misurati** su `solutioncomponent`: 10212 = Agent, 10213 = Agent component (FR-092).
     * ⚠️ Enum **diverso** da `botcomponent.componenttype` (dove 15 = Custom GPT): usare un
     * valore dell'uno sull'altro restituisce zero righe senza errore.
     */
    componentType: number | null;
    count: number;
    names: string[];
    /** `false` ⇒ fa scattare la conferma esplicita di FR-091. */
    relatedToSelectedAgent: boolean;
}

export interface PackageContents {
    bytes: Uint8Array;
    entries: PackageEntry[];
    uniqueName: string;
    version: string;
    managed: boolean;
    publisherUniqueName: string;
    publisherPrefix: string;
    agents: PackagedAgent[];
    suffixVariable: PackagedVariable | null;
    inventory: PackageComponent[];
    fingerprint: FormatFingerprint;
    drift: FormatDrift[];
    nameOccurrences: NameOccurrence[];
    /** Quale percorso ha prodotto questo archivio (FR-093). */
    exportMode: 'sync' | 'async';
    exportSeconds: number;
}

// ── Compatibilità del formato ────────────────────────────────────────────────

export interface FormatFingerprint {
    /** `solution.xml` → attributo `SolutionPackageVersion` (osservato: `9.2`). */
    solutionPackageVersion: string;
    /** Attributi di `<ImportExportXml>`; cambiano a ogni aggiornamento di Dataverse. */
    platformStamps: {
        version: string;
        organizationVersion: string;
        serviceabilityVersion: string;
    };
    topLevelPaths: string[];
    botElements: string[];
    botComponentElements: string[];
    configurationKeys: string[];
}

export interface FormatDrift {
    against: 'baseline' | 'previous';
    kind: 'added' | 'removed' | 'changed';
    /** Es. `bot.xml: elemento nuovo 'displayname'` */
    what: string;
    /**
     * **Sempre `false`**: lo scostamento di formato è un avviso. Dataverse si aggiorna di
     * continuo e i timbri cambiano da soli; bloccare renderebbe il tool inutilizzabile (FR-097).
     */
    blocking: false;
}

/** Dove compare il display name. Atteso: **una sola** occorrenza con `expected: true` (FR-096). */
export interface NameOccurrence {
    file: string;
    /** Elemento XML o percorso JSON che contiene il valore. */
    locator: string;
    value: string;
    /**
     * `true` per `bots/<schema>/bot.xml` → `<name>`; `true` anche per l'occorrenza nota
     * `botcomponents/<schema>.gpt.default/botcomponent.xml` → `<name>` quando coincide col
     * nome base. Un `false` **blocca** finché l'utente non conferma (FR-096).
     */
    expected: boolean;
    /** `false` su tutto ciò che non è `bot.xml` → `<name>`. */
    willBePatched: boolean;
}

// ── Patch e verifica ─────────────────────────────────────────────────────────

export type PatchState =
    | 'no-change'
    | 'suffix-added'
    | 'suffix-changed'
    | 'suffix-removed'
    | 'added';

export interface PatchChange {
    file: string;
    /** `publishOnImport` è JSON, non XML. */
    element: 'name' | 'publishOnImport';
    before: string | null;
    after: string;
    state: PatchState;
    /** `after` > 30 caratteri — **solo informativo** (FR-019, FR-079). */
    exceedsTeamsLimit: boolean;
}

/**
 * Esito dei controlli post-scrittura (FR-077). Se un solo campo è `false`, lo zip non è
 * utilizzabile. La verifica è **per archivio**: se fallisce anche su uno solo dei due,
 * l'intero artifact set non è valido (FR-085).
 */
export interface VerificationResult {
    archiveReadable: boolean;
    entryCountMatches: boolean;
    patchedValuesConfirmed: boolean;
    /** Entry non patchate identiche all'originale (SC-008). */
    byteIdenticalEntries: number;
}

// ── Artefatti su disco ───────────────────────────────────────────────────────

export interface ArtifactFile {
    fileName: string;
    /**
     * `deploy` = managed patchato, **l'unico da importare in UAT/PROD**;
     * `source` = unmanaged patchato (source control / sviluppo), **mai a valle** (FR-087);
     * `restore` = export originale.
     */
    role: 'deploy' | 'source' | 'restore';
    managed: boolean;
    patched: boolean;
    bytes: number;
    entryCount: number;
    /** Ciò che distingue due artefatti con la stessa `<Version>` (FR-086). */
    sha256: string;
    /** `null` per gli originali, che non vengono patchati. */
    verification: VerificationResult | null;
}

export interface ArtifactSet {
    folderPath: string;
    /** `{UniqueName}_{Version}_{SUFFISSO}_{yyyyMMdd-HHmmss}` */
    folderName: string;
    /** Da 2 a 4 archivi (FR-088). */
    files: ArtifactFile[];
    manifestPath: string;
    totalBytes: number;
}

// ── Storico ──────────────────────────────────────────────────────────────────

export interface DeploymentRecord {
    timestamp: string;
    targetEnvironmentUrl: string;
    importJobId: string;
    status: 'running' | 'succeeded' | 'failed';
    message: string;
}

/**
 * Voce di History. Sostituisce `BackupRecord`: non essendoci scritture su Dataverse non
 * c'è nulla da annullare, l'artefatto di ripristino è il package originale (FR-078).
 */
export interface PackagingRecord {
    id: string;
    /** Versione alzata in DEV prima dell'export, o `null` se non e' stata toccata. Assente nei record piu' vecchi. */
    versionChange?: { from: string; to: string; changed: boolean } | null;
    timestamp: string;
    user: string;
    sourceEnvironmentUrl: string;
    solutionUniqueName: string;
    version: string;
    managed: boolean;
    suffix: string;
    agents: AgentOutcome[];
    options: PackagingOptions;
    artifactSetPath: string;
    /** Copia ridotta del manifest, per cercare in History senza riaprire i file. */
    files: { fileName: string; role: ArtifactFile['role']; sha256: string }[];
    /** Esito **per archivio** (FR-085). */
    verification: { managed: VerificationResult; unmanaged: VerificationResult };
    exportMode: 'sync' | 'async';
    exportSeconds: number;
    fingerprint: FormatFingerprint;
    drift: FormatDrift[];
    /** Conferme esplicite dell'utente (nome in punto non noto, componenti extra). */
    confirmations: { what: string; confirmedAt: string }[];
    status: 'ok' | 'verification-failed' | 'failed';
    deployments: DeploymentRecord[];
}

/** Retention dello storico e degli artifact set: 30 giorni, massimo 200 voci (FR-088). */
export const RETENTION_DAYS = 30;
export const MAX_RECORDS = 200;

/** Formato del suffisso scritto dal tool: 1–20 caratteri tra parentesi quadre (FR-071). */
export const SUFFIX_MAX = 20;
/** Limite `name.short` del manifest Teams: avviso informativo, mai bloccante (FR-019). */
export const TEAMS_NAME_LIMIT = 30;
