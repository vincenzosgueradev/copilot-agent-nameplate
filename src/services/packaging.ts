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
import { raiseSolutionVersion, type VersionChange } from './solutionVersion';
import { relevantDrift } from './compat';
import { readPackage } from './package';
import { applyPatch, buildPatchPlan } from './patch';
import { buildZip, verifyZip, verificationPassed, type ExpectedValues } from './rezip';
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
    /** La versione scritta in DEV prima dell'export, o `null` se non e' stata toccata (FR-073c). */
    versionChange: VersionChange | null;
}

function build(pkg: PackageContents, plan: PatchChange[], options: PackagingOptions): BuiltArchive {
    const { files, patchedPaths } = applyPatch(pkg, plan);
    const bytes = buildZip(files);

    const expectedNames: Record<string, string> = {};
    for (const c of plan) if (c.element === 'name') expectedNames[c.file] = c.after;

    // La versione non e' patchata: la verifica controlla che l'export porti quella scritta in DEV
    const expected: ExpectedValues = { publish: {}, version: options.newVersion ?? undefined };
    for (const c of plan) {
        if (c.element === 'publishOnImport') expected.publish![c.file] = c.after === 'true';
    }

    const verification = verifyZip(bytes, pkg, expectedNames, patchedPaths, expected);
    return {
        bytes,
        source: pkg,
        patchedPaths,
        verification,
        expectedIdenticalEntries: pkg.entries.length - patchedPaths.length,
    };
}

/**
 * Lettura dei package e patch sono calcoli istantanei: senza una pausa le due fasi scattano
 * insieme e l'utente non le vede passare. La pausa c'e' solo se qualcuno ascolta l'avanzamento
 * (la schermata); i test e l'uso headless non aspettano.
 */
const PHASE_PAUSE_MS = 700;
const pause = (listener: unknown): Promise<void> =>
    listener ? new Promise(resolve => setTimeout(resolve, PHASE_PAUSE_MS)) : Promise.resolve();

/**
 * Esporta la coppia e produce i due archivi patchati, senza scrivere nulla su disco.
 *
 * Se `options.newVersion` c'e', prima alza la versione della solution **in DEV** (FR-073) e solo
 * dopo averla riletta esporta: lo zip porta la versione di DEV, non una inventata dal tool.
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
    let versionChange: VersionChange | null = null;
    if (options.newVersion) {
        onProgress?.('raising the version in DEV…');
        versionChange = await raiseSolutionVersion(solutionUniqueName, options.newVersion);
        log(versionChange.changed
            ? `Version of ${solutionUniqueName} in DEV raised: ${versionChange.from} → ${versionChange.to}.`
            : `Version of ${solutionUniqueName} in DEV is already ${versionChange.to}: nothing to write.`,
            'success');
        await pause(onProgress);
    }

    const pair = await exportPair(solutionUniqueName, onProgress);

    onProgress?.('reading the packages…');
    await pause(onProgress);
    const managedPkg = readPackage(pair.managed.bytes);
    const unmanagedPkg = readPackage(pair.unmanaged.bytes);
    log(`Packages read: ${managedPkg.uniqueName} v${managedPkg.version}, `
        + `${managedPkg.entries.length} entries, ${managedPkg.agents.length} agent(s).`);
    if (managedPkg.drift.length) {
        log(`The format differs from the baseline in ${managedPkg.drift.length} point(s): `
            + managedPkg.drift.map(d => d.what).join('; '),
            relevantDrift(managedPkg.drift).length ? 'warning' : 'info');
    }
    const unexpected = managedPkg.nameOccurrences.filter(o => !o.expected);
    if (unexpected.length) {
        log(`The display name appears in ${unexpected.length} unexpected place(s): `
            + unexpected.map(o => `${o.file} ${o.locator}`).join('; '), 'warning');
    }
    managedPkg.exportMode = pair.managed.mode;
    managedPkg.exportSeconds = pair.managed.seconds;
    unmanagedPkg.exportMode = pair.unmanaged.mode;
    unmanagedPkg.exportSeconds = pair.unmanaged.seconds;

    const plan = buildPatchPlan(managedPkg, suffix, selectedAgents, options);

    log(`Patch Plan: ${plan.length} modifiche `
        + `(${plan.filter(c => c.state !== 'no-change').length} effettive).`);

    onProgress?.('patch and verify…');
    await pause(onProgress);
    const managed = build(managedPkg, plan, options);
    const unmanaged = build(unmanagedPkg, plan, options);
    for (const [label, a] of [['managed', managed], ['unmanaged', unmanaged]] as const) {
        log(`Verify ${label}: `
            + `${a.verification.byteIdenticalEntries}/${a.expectedIdenticalEntries} `
            + `byte-identical unpatched entries, patched values ${a.verification.patchedValuesConfirmed ? 'confirmed' : 'NOT confirmed'}.`,
            a.verification.patchedValuesConfirmed ? 'info' : 'error');
    }

    const valid = verificationPassed(managed.verification, managed.expectedIdenticalEntries)
        && verificationPassed(unmanaged.verification, unmanaged.expectedIdenticalEntries);

    if (valid) {
        log(`Package pronti: managed ${managed.bytes.length} byte, `
            + `unmanaged ${unmanaged.bytes.length} byte.`, 'success');
    } else {
        log('Verification failed on at least one of the two archives: the artifact is '
            + 'unusable. The original exports remain importable.', 'error');
    }

    return {
        plan,
        managed,
        unmanaged,
        exportMode: pair.managed.mode === 'async' || pair.unmanaged.mode === 'async' ? 'async' : 'sync',
        exportSeconds: pair.managed.seconds + pair.unmanaged.seconds,
        valid,
        versionChange,
    };
}
