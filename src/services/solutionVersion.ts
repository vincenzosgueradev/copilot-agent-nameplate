/// <reference types="@pptb/types" />

/**
 * La versione della solution sorgente (FR-073, FR-073b, FR-067a).
 *
 * **L'unica scrittura su Dataverse che il tool fa.** Alza il campo `version` della solution
 * *unmanaged* nell'environment di sviluppo, prima dell'export, come fa il maker dal pannello di
 * export e come fanno `pac solution online-version` e i Build Tools. Non tocca componenti di una
 * managed solution, quindi non crea unmanaged layer (research §16).
 *
 * Perche' in DEV e non dentro lo zip: se solo l'artefatto cambia, DEV resta indietro, il giro
 * successivo riproduce un numero gia' distribuito e l'Upgrade fallisce con *"The import solution
 * must have a higher version than the existing solution it is upgrading"*.
 */

import { getOne, queryAll } from './dataverse';

/** Letto al momento dell'uso, non all'import: i test sostituiscono l'oggetto. */
const api = () => globalThis.dataverseAPI;

/** `major.minor.build.revision`: quattro numeri (Microsoft: *Understanding version numbers for updates*). */
const VERSION_RE = /^\d+\.\d+\.\d+\.\d+$/;

export function isValidVersion(v: string): boolean {
    return VERSION_RE.test(v.trim());
}

/** Negativo se `a < b`, 0 se uguali, positivo se `a > b`. Confronto numerico, segmento per segmento. */
export function compareVersions(a: string, b: string): number {
    const pa = a.trim().split('.').map(Number);
    const pb = b.trim().split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d !== 0) return d;
    }
    return 0;
}

/** Incrementa l'ultimo segmento: `1.0.0.2` → `1.0.0.3`. Una versione che non e' tale resta com'e'. */
export function nextVersion(version: string): string {
    if (!isValidVersion(version)) return version;
    const parts = version.trim().split('.');
    parts[parts.length - 1] = String(Number(parts[parts.length - 1]) + 1);
    return parts.join('.');
}

/** Perche' una versione scelta non va bene, o `null` se va bene. */
export function versionProblem(candidate: string, current: string): string | null {
    if (!candidate.trim()) return 'Enter a version.';
    if (!isValidVersion(candidate)) return 'Use four numbers separated by dots, for example 1.0.0.3.';
    if (compareVersions(candidate, current) <= 0) {
        return `It must be higher than the version in DEV (${current}).`;
    }
    return null;
}

export interface VersionChange {
    from: string;
    to: string;
    /** `false` se in DEV c'era gia' `to`: un tentativo precedente era riuscito, non si riscrive. */
    changed: boolean;
}

/** Apice raddoppiato: l'unico escape che OData chiede dentro una stringa tra apici. */
const odataString = (s: string) => s.replace(/'/g, "''");

/**
 * Porta la versione della solution unmanaged `uniqueName` a `newVersion`, e la rilegge.
 *
 * - stessa versione gia' presente: non scrive, prosegue (un tentativo precedente era riuscito);
 * - versione piu' alta in DEV (qualcuno l'ha alzata nel frattempo): si ferma;
 * - solution managed: si ferma, non e' esportabile e non si tocca;
 * - dopo la scrittura rilegge: se non e' quello che si e' scritto, si ferma prima di esportare.
 */
export async function raiseSolutionVersion(uniqueName: string, newVersion: string): Promise<VersionChange> {
    if (!isValidVersion(newVersion)) {
        throw new Error(`"${newVersion}" is not a valid version: use four numbers separated by dots.`);
    }
    const to = newVersion.trim();

    const rows = await queryAll(
        `solutions?$select=solutionid,version,ismanaged&$filter=uniquename eq '${odataString(uniqueName)}'`);
    if (rows.length !== 1) {
        throw new Error(`Expected one solution named "${uniqueName}", found ${rows.length}.`);
    }
    const row = rows[0]!;
    if (row.ismanaged === true) {
        throw new Error(`"${uniqueName}" is managed: its version cannot be raised here.`);
    }
    const from = String(row.version ?? '');
    const cmp = compareVersions(to, from);
    if (cmp === 0) return { from, to, changed: false };
    if (cmp < 0) {
        throw new Error(`DEV is already at ${from}, higher than ${to}. Someone raised it in the meantime: `
            + 'go back, reload the list and choose a higher version.');
    }

    await api().update('solution', String(row.solutionid), { version: to });

    const after = await getOne(`solutions(${String(row.solutionid)})?$select=version`);
    if (String(after.version ?? '') !== to) {
        throw new Error(`The version of "${uniqueName}" in DEV reads ${String(after.version)} after writing ${to}. `
            + 'The export was not started.');
    }
    return { from, to, changed: true };
}
