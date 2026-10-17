/**
 * Patch del package.
 *
 * Regola unica e non negoziabile (FR-069, FR-101): si riscrive **soltanto** il contenuto
 * dell'elemento `<name>` di `bots/<schemaname>/bot.xml`. Non si toccano `schemaname`, nomi di
 * cartella, nomi di file, GUID, `[Content_Types].xml`, `customizations.xml`, e non si fanno
 * sostituzioni testuali globali.
 *
 * Il motivo è misurato: lo schemaname compare in **31 entry su 34**, il display name in **1**
 * (research.md §14). Uno "cerca e sostituisci" distruggerebbe la solution, e cambiare lo
 * schemaname trasformerebbe l'upgrade in un agent nuovo lasciando il vecchio orfano.
 */

import { TEAMS_NAME_LIMIT, type PackageContents, type PackagedAgent, type AgentOutcome, type PackagingOptions, type PatchChange, type PatchState } from '../types';
import { PackageFormatError, splitSuffix } from './package';

const decoder = new TextDecoder('utf-8', { fatal: false });
const encoder = new TextEncoder();

/** Testo XML: `&` e `<` vanno sfuggiti, altrimenti un nome con "&" produce XML non valido. */
function xmlText(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Nome finale = nome base **letto dal package** + suffisso.
 *
 * Idempotente per costruzione: un suffisso già presente viene prima tolto, quindi
 * `agenteTool1 [DEV]` + `UAT` → `agenteTool1 [UAT]`, mai `agenteTool1 [DEV] [UAT]` (FR-071).
 * Suffisso vuoto ⇒ resta il nome base.
 */
export function buildName(nameInPackage: string, suffix: string): string {
    const { baseName } = splitSuffix(nameInPackage);
    const clean = suffix.trim();
    return clean ? `${baseName} [${clean}]` : baseName;
}

function stateFor(agent: PackagedAgent, newName: string, suffix: string): PatchState {
    if (agent.name === newName) return 'no-change';
    if (!suffix.trim()) return 'suffix-removed';
    return agent.currentSuffix ? 'suffix-changed' : 'suffix-added';
}

/** Incrementa l'ultimo segmento: `1.0.0.2` → `1.0.0.3` (FR-073). */
export function bumpVersion(version: string): string {
    const parts = version.split('.');
    const last = Number(parts[parts.length - 1]);
    if (!parts.length || Number.isNaN(last)) return version;
    parts[parts.length - 1] = String(last + 1);
    return parts.join('.');
}

/**
 * Il Patch Plan: ciò che verrà scritto, mostrato **prima** di scrivere (FR-075).
 * Calcolarlo non modifica nulla.
 */
export function buildPatchPlan(
    pkg: PackageContents,
    suffix: string,
    selected: string[],
    options: PackagingOptions,
): PatchChange[] {
    const changes: PatchChange[] = [];

    for (const agent of pkg.agents) {
        if (!selected.includes(agent.schemaName)) continue;   // resta byte-identico (FR-076)
        const after = buildName(agent.name, suffix);
        changes.push({
            file: agent.file,
            element: 'name',
            before: agent.name,
            after,
            state: stateFor(agent, after, suffix),
            // Il limite dei 30 caratteri riguarda il manifest Teams, il cui nome deriva da
            // bot.name: avviso informativo, mai bloccante (FR-019, FR-079)
            exceedsTeamsLimit: after.length > TEAMS_NAME_LIMIT,
        });

        if (options.publishOnImport !== 'keep') {
            const target = options.publishOnImport === 'force-true';
            if (agent.publishOnImport !== target) {
                changes.push({
                    file: agent.file.replace(/bot\.xml$/, 'configuration.json'),
                    element: 'publishOnImport',
                    before: agent.publishOnImport === null ? null : String(agent.publishOnImport),
                    after: String(target),
                    state: agent.publishOnImport === null ? 'added' : 'suffix-changed',
                    exceedsTeamsLimit: false,
                });
            }
        }
    }

    if (options.bumpVersion) {
        const after = bumpVersion(pkg.version);
        if (after !== pkg.version) {
            changes.push({
                file: 'solution.xml',
                element: 'Version',
                before: pkg.version,
                after,
                state: 'suffix-changed',
                exceedsTeamsLimit: false,
            });
        }
    }

    return changes;
}

/**
 * Esito del rename per **ogni** agent del package, esclusi compresi (FR-076).
 * Unica fonte per manifest e storico: prima ciascuno ricostruiva la lista a modo suo.
 */
export function agentOutcomes(pkg: PackageContents, plan: PatchChange[]): AgentOutcome[] {
    return pkg.agents.map(a => {
        const change = plan.find(c => c.element === 'name' && c.file === a.file);
        return {
            schemaName: a.schemaName,
            before: a.name,
            after: change?.after ?? a.name,
            excluded: !change,
        };
    });
}

/** Sostituisce il testo di un elemento, lasciando il resto del file intatto byte per byte. */
function replaceElementText(xml: string, tag: string, value: string, file: string): string {
    const re = new RegExp(`(<${tag}>)([^<]*)(</${tag}>)`, 'g');
    const matches = [...xml.matchAll(re)];
    if (matches.length === 0) {
        throw new PackageFormatError(`<${tag}> non trovato in ${file}: formato non riconosciuto`, file);
    }
    if (matches.length > 1) {
        // Più di una occorrenza significa che il formato non è quello verificato: fermarsi è
        // più sicuro che scegliere la prima e sperare (FR-069)
        throw new PackageFormatError(
            `<${tag}> compare ${matches.length} volte in ${file}: il formato del package `
            + `may have changed, check before proceeding.`, file);
    }
    const m = matches[0]!;
    return xml.slice(0, m.index) + m[1] + xmlText(value) + m[3] + xml.slice(m.index + m[0].length);
}

export interface PatchedFiles {
    /** Mappa percorso → contenuto, pronta per la ricostruzione dell'archivio. */
    files: Record<string, Uint8Array>;
    /** Percorsi effettivamente riscritti. */
    patchedPaths: string[];
}

/**
 * Applica il Patch Plan alle entry. Non scrive niente su disco: produce la mappa dei file.
 *
 * Lo stesso piano viene applicato a entrambi gli archivi della coppia, ciascuno in modo
 * indipendente (FR-085).
 */
export function applyPatch(pkg: PackageContents, changes: PatchChange[]): PatchedFiles {
    const files: Record<string, Uint8Array> = {};
    for (const e of pkg.entries) files[e.path] = e.data;

    const patchedPaths: string[] = [];
    const touch = (path: string, next: string) => {
        files[path] = encoder.encode(next);
        if (!patchedPaths.includes(path)) patchedPaths.push(path);
    };

    for (const change of changes) {
        if (change.state === 'no-change') continue;
        const current = files[change.file];
        if (!current) throw new PackageFormatError(`entry da patchare assente: ${change.file}`, change.file);
        const text = decoder.decode(current);

        if (change.element === 'name') {
            touch(change.file, replaceElementText(text, 'name', change.after, change.file));
        } else if (change.element === 'Version') {
            touch(change.file, replaceElementText(text, 'Version', change.after, change.file));
        } else {
            // configuration.json: unico file che viene riserializzato. È un file patchato,
            // quindi la verifica byte-per-byte non lo riguarda (FR-070 vale sulle entry
            // NON patchate).
            const cfg = JSON.parse(text) as Record<string, unknown>;
            cfg.publishOnImport = change.after === 'true';
            touch(change.file, `${JSON.stringify(cfg, null, 2)}\n`);
        }
    }

    return { files, patchedPaths };
}
