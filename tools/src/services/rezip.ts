/**
 * Ricostruzione dell'archivio e verifica di ciò che è stato prodotto.
 *
 * Due trappole già pagate, entrambe misurate (research.md §9 e §13):
 *
 *  1. Le entry vanno **ricreate**, mai clonate dall'header dell'entry sorgente: l'offset
 *     originale si porta dietro e l'archivio risulta illeggibile
 *     (`Overlapped entries … possible zip bomb`). `zipSync` di fflate ricrea per costruzione.
 *  2. La verifica confronta le **entry una per una** e **mai la dimensione del file**: il
 *     rezip produce 31.469 byte contro i 32.544 dell'originale a parità di contenuto, perché
 *     il compressore non è lo stesso. Un controllo sulle dimensioni darebbe un falso allarme
 *     a ogni esecuzione (FR-095).
 */

import { unzipSync, zipSync } from 'fflate';
import type { PackageContents, VerificationResult } from '../types';

const decoder = new TextDecoder('utf-8', { fatal: false });

/** Costruisce lo zip dalla mappa dei file. */
export function buildZip(files: Record<string, Uint8Array>): Uint8Array {
    return zipSync(files, { level: 6 });
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

/**
 * Riapre l'archivio prodotto e controlla che sia davvero quello che ci aspettiamo (FR-077).
 *
 * `expectedNames` mappa il percorso di ogni `bot.xml` al nome che deve contenere: è la verifica
 * che il patch sia finito dove doveva, non solo che il file sia leggibile. Ci entra anche un
 * agent lasciato invariato, perché confermare un nome che non doveva cambiare è comunque utile.
 *
 * `patchedPaths` è un'altra cosa: sono le entry **davvero riscritte**, le uniche da escludere
 * dal conteggio byte-identiche. Tenerle separate evita di contare come "patchata" una entry che
 * il piano menzionava ma non ha toccato — errore trovato dal primo smoke check su suffisso
 * invariato.
 */
export function verifyZip(
    produced: Uint8Array,
    original: PackageContents,
    expectedNames: Record<string, string>,
    patchedPaths: string[],
): VerificationResult {
    const result: VerificationResult = {
        archiveReadable: false,
        entryCountMatches: false,
        patchedValuesConfirmed: false,
        byteIdenticalEntries: 0,
    };

    let files: Record<string, Uint8Array>;
    try {
        files = unzipSync(produced);
    } catch {
        return result;   // non si riapre: tutto il resto è irrilevante
    }
    result.archiveReadable = true;
    result.entryCountMatches = Object.keys(files).length === original.entries.length;

    const originalByPath = new Map(original.entries.map(e => [e.path, e.data]));
    const patched = new Set(patchedPaths);
    for (const [path, data] of Object.entries(files)) {
        if (patched.has(path)) continue;
        const before = originalByPath.get(path);
        if (before && sameBytes(before, data)) result.byteIdenticalEntries++;
    }

    result.patchedValuesConfirmed = Object.entries(expectedNames).every(([path, expected]) => {
        const data = files[path];
        if (!data) return false;
        const m = /<name>([^<]*)<\/name>/.exec(decoder.decode(data));
        if (!m) return false;
        // Il confronto è sul testo deserializzato: nel file l'XML può essere sfuggito
        const actual = m[1]!
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        return actual === expected;
    });

    return result;
}

/** `true` solo se ogni controllo è passato: basta un `false` e lo zip non è utilizzabile. */
export function verificationPassed(v: VerificationResult, expectedEntries: number): boolean {
    return v.archiveReadable
        && v.entryCountMatches
        && v.patchedValuesConfirmed
        && v.byteIdenticalEntries === expectedEntries;
}

export function describeVerification(v: VerificationResult, expectedEntries: number): string {
    const parts = [
        v.archiveReadable ? 'archive readable' : 'archive NOT readable',
        v.entryCountMatches ? 'entry count matches' : 'entry count DIFFERS',
        v.patchedValuesConfirmed ? 'patched values confirmed' : 'patched values NOT confirmed',
        `${v.byteIdenticalEntries}/${expectedEntries} unpatched entries byte-identical`,
    ];
    return parts.join(' · ');
}
