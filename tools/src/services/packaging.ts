/**
 * Orchestratore del packaging: mette in fila export, lettura, patch, rezip e verifica.
 *
 * Lo **stesso Patch Plan** viene applicato ai due archivi della coppia, ciascuno patchato e
 * verificato in modo indipendente. Se la verifica fallisce anche su uno solo dei due, l'intero
 * risultato è dichiarato non valido: un set in cui managed e unmanaged non concordano è peggio
 * di nessun set (FR-085).
 *
 * Niente di quanto succede qui tocca un environment: si legge, si esporta, si costruisce in
 * memoria. La scrittura su disco è dell'artifact set (Phase 5).
 */

import { exportPair, type ExportProgress } from './export';
import { readPackage } from './package';
import { applyPatch, buildPatchPlan } from './patch';
import { buildZip, verifyZip, verificationPassed } from './rezip';
import { log } from './log';
import type { PackageContents, PackagingOptions, PatchChange, VerificationResult } from '../types';

export interface BuiltArchive {
    bytes: Uint8Array;
    source: PackageContents;
    patchedPaths: string[];
    verification: VerificationResult;
    /** Quante entry non patchate dovevano restare identiche. */
    expectedIdenticalEntries: number;
}

export interface PackagingResult {
    plan: PatchChange[];
    managed: BuiltArchive;
    unmanaged: BuiltArchive;
    exportMode: 'sync' | 'async';
    exportSeconds: number;
    /** `true` solo se **entrambi** gli archivi hanno superato la verifica (FR-085). */
    valid: boolean;
}

function build(pkg: PackageContents, plan: PatchChange[]): BuiltArchive {
    const { files, patchedPaths } = applyPatch(pkg, plan);
    const bytes = buildZip(files);

    const expectedNames: Record<string, string> = {};
    for (const c of plan) if (c.element === 'name') expectedNames[c.file] = c.after;

    const verification = verifyZip(bytes, pkg, expectedNames, patchedPaths);
    return {
        bytes,
        source: pkg,
        patchedPaths,
        verification,
        expectedIdenticalEntries: pkg.entries.length - patchedPaths.length,
    };
}

/**
 * Esporta la coppia e produce i due archivi patchati, senza scrivere nulla su disco.
 *
 * Il Patch Plan viene calcolato sull'archivio **managed** ed è quello che l'anteprima mostra;
 * l'unmanaged riceve lo stesso piano. I due export hanno le stesse entry e differiscono solo
 * in `solution.xml` (verificato, research.md §10), quindi i percorsi del piano valgono per
 * entrambi — e se un domani non fosse più vero, la verifica indipendente se ne accorge.
 */
export async function runPackaging(
    solutionUniqueName: string,
    suffix: string,
    selectedAgents: string[],
    options: PackagingOptions,
    onProgress?: ExportProgress,
): Promise<PackagingResult> {
    const pair = await exportPair(solutionUniqueName, onProgress);

    onProgress?.('lettura dei package…');
    const managedPkg = readPackage(pair.managed.bytes);
    const unmanagedPkg = readPackage(pair.unmanaged.bytes);
    log(`Package letti: ${managedPkg.uniqueName} v${managedPkg.version}, `
        + `${managedPkg.entries.length} entry, ${managedPkg.agents.length} agent.`);
    if (managedPkg.drift.length) {
        log(`Il formato si discosta dal riferimento in ${managedPkg.drift.length} punti: `
            + managedPkg.drift.map(d => d.what).join('; '), 'warning');
    }
    const unexpected = managedPkg.nameOccurrences.filter(o => !o.expected);
    if (unexpected.length) {
        log(`Il display name compare in ${unexpected.length} punti non previsti: `
            + unexpected.map(o => `${o.file} ${o.locator}`).join('; '), 'warning');
    }
    managedPkg.exportMode = pair.managed.mode;
    managedPkg.exportSeconds = pair.managed.seconds;
    unmanagedPkg.exportMode = pair.unmanaged.mode;
    unmanagedPkg.exportSeconds = pair.unmanaged.seconds;

    const plan = buildPatchPlan(managedPkg, suffix, selectedAgents, options);

    log(`Patch Plan: ${plan.length} modifiche `
        + `(${plan.filter(c => c.state !== 'no-change').length} effettive).`);

    onProgress?.('patch e verifica…');
    const managed = build(managedPkg, plan);
    const unmanaged = build(unmanagedPkg, plan);
    for (const [label, a] of [['managed', managed], ['unmanaged', unmanaged]] as const) {
        log(`Verifica ${label}: `
            + `${a.verification.byteIdenticalEntries}/${a.expectedIdenticalEntries} entry non `
            + `patchate byte-identiche, valori ${a.verification.patchedValuesConfirmed ? 'confermati' : 'NON confermati'}.`,
            a.verification.patchedValuesConfirmed ? 'info' : 'error');
    }

    const valid = verificationPassed(managed.verification, managed.expectedIdenticalEntries)
        && verificationPassed(unmanaged.verification, unmanaged.expectedIdenticalEntries);

    if (valid) {
        log(`Package pronti: managed ${managed.bytes.length} byte, `
            + `unmanaged ${unmanaged.bytes.length} byte.`, 'success');
    } else {
        log('La verifica non è passata su almeno uno dei due archivi: l\'artefatto non è '
            + 'utilizzabile. Gli export originali restano importabili.', 'error');
    }

    return {
        plan,
        managed,
        unmanaged,
        exportMode: pair.managed.mode === 'async' || pair.unmanaged.mode === 'async' ? 'async' : 'sync',
        exportSeconds: pair.managed.seconds + pair.unmanaged.seconds,
        valid,
    };
}
