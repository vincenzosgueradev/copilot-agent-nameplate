/**
 * Diff riga per riga, affiancato, come l'editor di diff di un IDE (spec 019, FR-008).
 *
 * Puro e senza I/O: prende due testi e restituisce righe pronte da disegnare. Le modifiche di un
 * patch sono poche e i file piccoli, quindi si tolgono prefisso e suffisso comuni e si fa una LCS a
 * programmazione dinamica solo sul pezzo in mezzo; se e' enorme si ripiega su «tutto sostituito».
 */

export type DiffKind = 'context' | 'changed' | 'removed' | 'added' | 'gap';

export interface DiffRow {
    kind: DiffKind;
    /** Numero di riga (da 1) nel file originale; `null` dove la riga non esiste a sinistra. */
    oldNo: number | null;
    /** Numero di riga (da 1) nel file patchato; `null` dove la riga non esiste a destra. */
    newNo: number | null;
    oldText: string;
    newText: string;
    /** Il tratto che differisce dentro la riga, `[da, a)`, solo per `changed`. */
    oldSpan: [number, number] | null;
    newSpan: [number, number] | null;
    /** Quante righe uguali salta, solo per `gap`. */
    skipped: number;
}

export interface FileDiff {
    file: string;
    rows: DiffRow[];
    /** Righe aggiunte e tolte, contate sul file intero (anche quelle non mostrate). */
    added: number;
    removed: number;
    /** Righe di modifica non mostrate perche' oltre il limite. */
    hidden: number;
}

export interface DiffOptions {
    /** Righe uguali mostrate intorno a ogni modifica. Di partenza `CONTEXT_LINES`. */
    context?: number;
    /** Quante righe di modifica al massimo. Di partenza `MAX_CHANGED_LINES`. */
    maxChanged?: number;
}

export const CONTEXT_LINES = 3;
export const MAX_CHANGED_LINES = 80;
/** Oltre questo prodotto di righe la LCS costerebbe troppo: si ripiega su «tutto sostituito». */
export const MAX_CELLS = 4_000_000;

/** Le righe di un testo. `\r\n` e `\n` sono uguali, e il `\n` finale non crea una riga vuota. */
export function splitLines(text: string): string[] {
    if (text === '') return [];
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    return lines;
}

type Op = { t: 'eq' | 'del' | 'ins'; a: number; b: number };

/** Lo script di modifica: per ogni riga, se e' uguale, tolta o aggiunta. */
function editScript(a: string[], b: string[]): Op[] {
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    let s = 0;
    while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;

    const ops: Op[] = [];
    for (let i = 0; i < p; i++) ops.push({ t: 'eq', a: i, b: i });

    const n = a.length - p - s;
    const m = b.length - p - s;
    if (n * m <= MAX_CELLS) {
        // dp[i][j] = lunghezza della LCS tra a[p+i..] e b[p+j..]
        const w = m + 1;
        const dp = new Uint32Array((n + 1) * w);
        for (let i = n - 1; i >= 0; i--) {
            for (let j = m - 1; j >= 0; j--) {
                dp[i * w + j] = a[p + i] === b[p + j]
                    ? dp[(i + 1) * w + j + 1]! + 1
                    : Math.max(dp[(i + 1) * w + j]!, dp[i * w + j + 1]!);
            }
        }
        let i = 0;
        let j = 0;
        while (i < n && j < m) {
            if (a[p + i] === b[p + j]) { ops.push({ t: 'eq', a: p + i, b: p + j }); i++; j++; }
            else if (dp[(i + 1) * w + j]! >= dp[i * w + j + 1]!) { ops.push({ t: 'del', a: p + i, b: -1 }); i++; }
            else { ops.push({ t: 'ins', a: -1, b: p + j }); j++; }
        }
        while (i < n) { ops.push({ t: 'del', a: p + i, b: -1 }); i++; }
        while (j < m) { ops.push({ t: 'ins', a: -1, b: p + j }); j++; }
    } else {
        for (let i = 0; i < n; i++) ops.push({ t: 'del', a: p + i, b: -1 });
        for (let j = 0; j < m; j++) ops.push({ t: 'ins', a: -1, b: p + j });
    }

    for (let k = 0; k < s; k++) ops.push({ t: 'eq', a: a.length - s + k, b: b.length - s + k });
    return ops;
}

const isWord = (c: string | undefined): boolean => c !== undefined && /[A-Za-z0-9_]/.test(c);

/**
 * Il tratto che differisce tra due righe: toglie prefisso e suffisso comuni e si allarga ai
 * confini di parola, cosi' `[DEV]` → `[UAT]` evidenzia `DEV` e `UAT`, non una lettera.
 */
export function inlineSpans(oldText: string, newText: string): { oldSpan: [number, number]; newSpan: [number, number] } {
    let p = 0;
    while (p < oldText.length && p < newText.length && oldText[p] === newText[p]) p++;
    let s = 0;
    while (s < oldText.length - p && s < newText.length - p
        && oldText[oldText.length - 1 - s] === newText[newText.length - 1 - s]) s++;

    let start = p;
    if (isWord(oldText[start - 1]) && (isWord(oldText[start]) || isWord(newText[start]))) {
        while (start > 0 && isWord(oldText[start - 1])) start--;
    }
    let endOld = oldText.length - s;
    let endNew = newText.length - s;
    if (isWord(oldText[endOld]) && (isWord(oldText[endOld - 1]) || isWord(newText[endNew - 1]))) {
        while (isWord(oldText[endOld])) { endOld++; endNew++; }
    }
    return { oldSpan: [start, endOld], newSpan: [start, endNew] };
}

/** Il testo diviso nel tratto evidenziato: prima, dentro, dopo. */
export function sliceBySpan(text: string, span: [number, number] | null): { before: string; mid: string; after: string } {
    if (!span) return { before: text, mid: '', after: '' };
    return { before: text.slice(0, span[0]), mid: text.slice(span[0], span[1]), after: text.slice(span[1]) };
}

const row = (kind: DiffKind, r: Partial<DiffRow>): DiffRow => ({
    kind, oldNo: null, newNo: null, oldText: '', newText: '', oldSpan: null, newSpan: null, skipped: 0, ...r,
});

/** Il confronto tra due testi, con il contesto intorno a ogni modifica e i salti sulle righe uguali. */
export function diffLines(oldText: string, newText: string, options: DiffOptions = {}): { rows: DiffRow[]; added: number; removed: number; hidden: number } {
    const context = options.context ?? CONTEXT_LINES;
    const maxChanged = options.maxChanged ?? MAX_CHANGED_LINES;
    const a = splitLines(oldText);
    const b = splitLines(newText);
    const ops = editScript(a, b);

    // Le righe affiancate: una serie di tolte e aggiunte consecutive si abbina riga per riga
    const all: DiffRow[] = [];
    let k = 0;
    while (k < ops.length) {
        const op = ops[k]!;
        if (op.t === 'eq') {
            all.push(row('context', { oldNo: op.a + 1, newNo: op.b + 1, oldText: a[op.a]!, newText: b[op.b]! }));
            k++;
            continue;
        }
        const dels: number[] = [];
        const inss: number[] = [];
        while (k < ops.length && ops[k]!.t !== 'eq') {
            const cur = ops[k]!;
            if (cur.t === 'del') dels.push(cur.a); else inss.push(cur.b);
            k++;
        }
        const pairs = Math.min(dels.length, inss.length);
        for (let q = 0; q < pairs; q++) {
            const oi = dels[q]!;
            const ni = inss[q]!;
            const { oldSpan, newSpan } = inlineSpans(a[oi]!, b[ni]!);
            all.push(row('changed', { oldNo: oi + 1, newNo: ni + 1, oldText: a[oi]!, newText: b[ni]!, oldSpan, newSpan }));
        }
        for (let q = pairs; q < dels.length; q++) all.push(row('removed', { oldNo: dels[q]! + 1, oldText: a[dels[q]!]! }));
        for (let q = pairs; q < inss.length; q++) all.push(row('added', { newNo: inss[q]! + 1, newText: b[inss[q]!]! }));
    }

    const changeRows = all.filter(r => r.kind !== 'context');
    const removed = changeRows.filter(r => r.oldNo !== null).length;
    const added = changeRows.filter(r => r.newNo !== null).length;
    if (!changeRows.length) return { rows: [], added: 0, removed: 0, hidden: 0 };

    // Il contesto: si tengono le righe uguali entro `context` righe da una modifica
    const keep = all.map(() => false);
    all.forEach((r, i) => {
        if (r.kind === 'context') return;
        keep[i] = true;
        for (let d = 1; d <= Math.min(context, all.length); d++) {
            if (i - d >= 0 && all[i - d]!.kind === 'context') keep[i - d] = true;
            if (i + d < all.length && all[i + d]!.kind === 'context') keep[i + d] = true;
        }
    });
    // Un salto che nasconderebbe una sola riga non ha senso: si mostra la riga
    const rows: DiffRow[] = [];
    let i = 0;
    while (i < all.length) {
        if (keep[i]) { rows.push(all[i]!); i++; continue; }
        let j = i;
        while (j < all.length && !keep[j]) j++;
        if (j - i === 1) rows.push(all[i]!);
        else rows.push(row('gap', { skipped: j - i }));
        i = j;
    }

    // Il limite: si mostrano le prime `maxChanged` righe di modifica, il resto e' riassunto
    let seen = 0;
    const shown: DiffRow[] = [];
    for (const r of rows) {
        if (r.kind !== 'context' && r.kind !== 'gap') {
            if (seen >= maxChanged) break;
            seen++;
        }
        shown.push(r);
    }
    return { rows: shown, added, removed, hidden: changeRows.length - seen };
}

/** Il diff di un file, con il suo nome. */
export function fileDiff(file: string, oldText: string, newText: string, options?: DiffOptions): FileDiff {
    return { file, ...diffLines(oldText, newText, options) };
}
