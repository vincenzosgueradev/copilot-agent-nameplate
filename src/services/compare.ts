/**
 * Confronto fra due archivi dello stesso export (spec 016, FR-013).
 *
 * Due Target partono dagli stessi byte, quindi i loro zip devono differire **solo** dove la patch
 * ha scritto: il nome di un agent (`bots/<schema>/bot.xml`) e, se scelto, `publishOnImport`
 * (`bots/<schema>/configuration.json`). Qualunque altra differenza non e' attesa e rende il
 * risultato non valido. Il confronto e' di ogni Target contro il primo, non a coppie: la differenza
 * fra due Target qualsiasi e' l'unione delle due liste.
 */

import { unzipSync } from 'fflate';

export type DifferenceKind = 'agent-name' | 'publish-on-import';

export interface ArchiveDifference {
    path: string;
    kind: DifferenceKind;
}

export interface TargetComparison {
    /** Il Target di riferimento (il primo spuntato). */
    against: string;
    /** Le entry diverse e attese, con la loro natura. */
    differing: ArchiveDifference[];
    /** Le entry presenti in entrambi e identiche byte per byte. */
    identicalEntries: number;
    /** Le entry diverse (o presenti in uno solo) che nessuna patch ha scritto: se ce ne sono, il risultato non e' valido. */
    unexpected: string[];
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

/** Che cosa significa una differenza in quel percorso, o `null` se nessuna patch scrive li'. */
export function differenceKind(path: string): DifferenceKind | null {
    if (/^bots\/[^/]+\/bot\.xml$/.test(path)) return 'agent-name';
    if (/^bots\/[^/]+\/configuration\.json$/.test(path)) return 'publish-on-import';
    return null;
}

/**
 * Confronta lo zip di un Target con quello di riferimento. `patchedPaths` sono le entry che la
 * patch di ciascuno dei due ha riscritto: solo li' una differenza e' attesa.
 */
export function compareArchives(
    reference: { bytes: Uint8Array; patchedPaths: readonly string[] },
    other: { bytes: Uint8Array; patchedPaths: readonly string[] },
    against: string,
): TargetComparison {
    const a = unzipSync(reference.bytes);
    const b = unzipSync(other.bytes);
    const allowed = new Set([...reference.patchedPaths, ...other.patchedPaths]);

    const differing: ArchiveDifference[] = [];
    const unexpected: string[] = [];
    let identicalEntries = 0;

    for (const path of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const x = a[path];
        const y = b[path];
        if (x && y && sameBytes(x, y)) { identicalEntries++; continue; }
        const kind = differenceKind(path);
        if (x && y && kind && allowed.has(path)) differing.push({ path, kind });
        else unexpected.push(path);
    }
    differing.sort((p, q) => p.path.localeCompare(q.path));
    unexpected.sort();
    return { against, differing, identicalEntries, unexpected };
}
