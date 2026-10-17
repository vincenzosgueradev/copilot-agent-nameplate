/**
 * L'oracolo: che cosa DEVE succedere, scritto dalla spec e non copiando il codice.
 *
 * Se questo file e il motore sbagliano nello stesso modo il test non se ne accorge, per questo
 * ogni regola qui rimanda al requisito da cui discende e resta volutamente ingenua: nessuna
 * funzione condivisa con `src/`.
 */

import type { PublishMode } from '../../src/types';

/** FR-071: un suffisso e' ` [X]` in coda, X di 1-20 caratteri. */
const SUFFIX_AT_END = /\s\[([^\]]{1,20})\]$/;

export function baseOf(name: string): string {
    return name.replace(SUFFIX_AT_END, '');
}

export function suffixOf(name: string): string | null {
    const m = SUFFIX_AT_END.exec(name);
    return m ? m[1]! : null;
}

/** FR-023, FR-071: il nome dopo il rename. Non selezionato = invariato. */
export function expectedName(name: string, suffix: string, selected: boolean): string {
    if (!selected) return name;
    const clean = suffix.trim();
    return clean ? `${baseOf(name)} [${clean}]` : baseOf(name);
}

/** Stato atteso di una riga del piano. */
export function expectedNameState(
    name: string, suffix: string,
): 'no-change' | 'suffix-removed' | 'suffix-changed' | 'suffix-added' {
    const after = expectedName(name, suffix, true);
    if (after === name) return 'no-change';
    if (!suffix.trim()) return 'suffix-removed';
    return suffixOf(name) !== null ? 'suffix-changed' : 'suffix-added';
}

/** FR-090, FR-090a: l'eccezione dell'agent batte il valore di partenza. */
export function effectiveMode(
    perAgent: PublishMode | undefined, fallback: PublishMode,
): PublishMode {
    return perAgent ?? fallback;
}

/** `publishOnImport` dopo la patch. Escluso o "lascia" = com'era. */
export function expectedPublish(
    initial: boolean | null, mode: PublishMode, selected: boolean,
): boolean | null {
    if (!selected || mode === 'keep') return initial;
    return mode === 'force-true';
}

/** FR-023a: i suffissi distinti che gli agent avranno dopo il rename. */
export function distinctSuffixes(
    agents: { name: string; selected: boolean }[], suffix: string,
): string[] {
    const clean = suffix.trim();
    return [...new Set(agents.map(a => a.selected ? clean : (suffixOf(a.name) ?? '')))];
}
