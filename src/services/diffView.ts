/**
 * Il diff disegnato: due colonne (split) o una (unified), con numeri di riga, rosso e verde, e il
 * tratto che cambia evidenziato (spec 019, FR-008, FR-010, FR-012).
 *
 * Il contenuto dei file e' sempre testo: si fa l'escape di ogni carattere prima di metterlo nel
 * markup, quindi un file con `<img onerror=…>` resta una riga di testo.
 */

import { sliceBySpan, type DiffRow, type FileDiff } from './diff';

export type DiffMode = 'split' | 'unified';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string): string => s.replace(/[&<>"']/g, c => ESCAPES[c]!);

/** Il testo di una riga con il suo tratto evidenziato. */
function code(text: string, span: [number, number] | null): string {
    const { before, mid, after } = sliceBySpan(text, span);
    if (!mid) return esc(text);
    return `${esc(before)}<mark class="diff-hl">${esc(mid)}</mark>${esc(after)}`;
}

const no = (n: number | null): string => `<td class="diff-no">${n ?? ''}</td>`;

function splitRow(r: DiffRow): string {
    if (r.kind === 'gap') {
        return `<tr class="diff-row diff-row--gap"><td colspan="4"><span class="diff-gap-text">${r.skipped} unchanged lines</span></td></tr>`;
    }
    const left = r.oldNo === null
        ? '<td class="diff-code diff-code--empty"></td>'
        : `<td class="diff-code${r.kind === 'context' ? '' : ' diff-code--old'}"><span class="diff-mark" aria-hidden="true">${r.kind === 'context' ? '' : '−'}</span>${code(r.oldText, r.oldSpan)}</td>`;
    const right = r.newNo === null
        ? '<td class="diff-code diff-code--empty"></td>'
        : `<td class="diff-code${r.kind === 'context' ? '' : ' diff-code--new'}"><span class="diff-mark" aria-hidden="true">${r.kind === 'context' ? '' : '+'}</span>${code(r.newText, r.newSpan)}</td>`;
    return `<tr class="diff-row diff-row--${r.kind}">${no(r.oldNo)}${left}${no(r.newNo)}${right}</tr>`;
}

function unifiedRows(r: DiffRow): string {
    if (r.kind === 'gap') {
        return `<tr class="diff-row diff-row--gap"><td colspan="3"><span class="diff-gap-text">${r.skipped} unchanged lines</span></td></tr>`;
    }
    if (r.kind === 'context') {
        return `<tr class="diff-row diff-row--context">${no(r.oldNo)}${no(r.newNo)}<td class="diff-code"><span class="diff-mark" aria-hidden="true"></span>${esc(r.oldText)}</td></tr>`;
    }
    const out: string[] = [];
    if (r.oldNo !== null) {
        out.push(`<tr class="diff-row diff-row--${r.kind}">${no(r.oldNo)}${no(null)}<td class="diff-code diff-code--old"><span class="diff-mark" aria-hidden="true">−</span>${code(r.oldText, r.oldSpan)}</td></tr>`);
    }
    if (r.newNo !== null) {
        out.push(`<tr class="diff-row diff-row--${r.kind}">${no(null)}${no(r.newNo)}<td class="diff-code diff-code--new"><span class="diff-mark" aria-hidden="true">+</span>${code(r.newText, r.newSpan)}</td></tr>`);
    }
    return out.join('');
}

/** Il diff di un file: intestazione col nome e i conteggi, poi la tabella. Senza modifiche, una frase. */
export function diffViewHtml(diff: FileDiff, mode: DiffMode): string {
    const stat = `<span class="diff-stat"><span class="diff-add">+${diff.added}</span><span class="diff-del">−${diff.removed}</span></span>`;
    const head = `<div class="diff-head"><span class="diff-file">${esc(diff.file)}</span>${stat}</div>`;
    if (!diff.rows.length) {
        return `<div class="diff diff--${mode}" data-file="${esc(diff.file)}">${head}<p class="diff-empty">This file does not change.</p></div>`;
    }
    const cols = mode === 'split'
        ? '<colgroup><col class="c-no"><col class="c-code"><col class="c-no"><col class="c-code"></colgroup>'
        : '<colgroup><col class="c-no"><col class="c-no"><col class="c-code"></colgroup>';
    const body = diff.rows.map(mode === 'split' ? splitRow : unifiedRows).join('');
    const more = diff.hidden > 0
        ? `<tr class="diff-row diff-row--more"><td colspan="${mode === 'split' ? 4 : 3}"><span class="diff-gap-text">${diff.hidden} more changed ${diff.hidden === 1 ? 'line' : 'lines'}</span></td></tr>`
        : '';
    return `
        <div class="diff diff--${mode}" data-file="${esc(diff.file)}">${head}
            <div class="diff-scroll">
                <table class="diff-table" aria-label="Changes in ${esc(diff.file)}">${cols}<tbody>${body}${more}</tbody></table>
            </div>
        </div>`;
}
