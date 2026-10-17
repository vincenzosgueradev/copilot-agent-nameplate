/**
 * Generatori di combinazioni per i test a matrice.
 *
 * - `cartesian`: tutte le combinazioni, quando lo spazio e' piccolo.
 * - `allPairs`: un insieme ridotto in cui **ogni coppia di valori di due parametri qualunque**
 *   compare almeno una volta. Quando lo spazio completo e' troppo grande, e' il compromesso
 *   standard: la maggior parte dei difetti dipende da una o due variabili che interagiscono.
 * - `seeded`: campionamento riproducibile, per aggiungere casi oltre le coppie.
 */

/** Generatore pseudo-casuale con seme (mulberry32): stesso seme, stessa sequenza. */
export function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Prodotto cartesiano di piu' liste di valori. */
export function* cartesian<T>(dims: readonly (readonly T[])[]): Generator<T[]> {
    const idx = dims.map(() => 0);
    if (dims.some(d => d.length === 0)) return;
    for (;;) {
        yield dims.map((d, i) => d[idx[i]!]!);
        let k = dims.length - 1;
        while (k >= 0) {
            idx[k]!++;
            if (idx[k]! < dims[k]!.length) break;
            idx[k] = 0;
            k--;
        }
        if (k < 0) return;
    }
}

/** Numero di combinazioni del prodotto cartesiano. */
export const cartesianSize = (dims: readonly (readonly unknown[])[]): number =>
    dims.reduce((n, d) => n * d.length, 1);

/**
 * Righe (indici di valore per parametro) che coprono tutte le coppie di valori di tutti i
 * parametri. Algoritmo greedy: a ogni passo, tra molti candidati casuali, si sceglie quello
 * che copre piu' coppie ancora scoperte.
 */
export function allPairs(sizes: readonly number[], seed = 1, candidates = 60): number[][] {
    const rand = rng(seed);
    const n = sizes.length;
    const key = (i: number, vi: number, j: number, vj: number) => `${i}:${vi}|${j}:${vj}`;
    const uncovered = new Set<string>();
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            for (let a = 0; a < sizes[i]!; a++) {
                for (let b = 0; b < sizes[j]!; b++) uncovered.add(key(i, a, j, b));
            }
        }
    }
    const rows: number[][] = [];
    const gain = (row: number[]) => {
        let g = 0;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) if (uncovered.has(key(i, row[i]!, j, row[j]!))) g++;
        }
        return g;
    };
    while (uncovered.size > 0) {
        let best: number[] | null = null;
        let bestGain = -1;
        for (let c = 0; c < candidates; c++) {
            const row = sizes.map(s => Math.floor(rand() * s));
            const g = gain(row);
            if (g > bestGain) { bestGain = g; best = row; }
        }
        // Se i candidati casuali non coprono nulla, se ne costruisce uno su una coppia scoperta
        if (bestGain <= 0) {
            const [first] = uncovered;
            const [l, r] = first!.split('|') as [string, string];
            const [i, vi] = l.split(':').map(Number) as [number, number];
            const [j, vj] = r.split(':').map(Number) as [number, number];
            best = sizes.map(s => Math.floor(rand() * s));
            best[i] = vi;
            best[j] = vj;
        }
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) uncovered.delete(key(i, best![i]!, j, best![j]!));
        }
        rows.push(best!);
    }
    return rows;
}

/** Tutti i sottoinsiemi (anche il vuoto) di una lista. */
export function subsets<T>(items: readonly T[]): T[][] {
    const out: T[][] = [];
    for (let mask = 0; mask < 1 << items.length; mask++) {
        out.push(items.filter((_, i) => mask & (1 << i)));
    }
    return out;
}
