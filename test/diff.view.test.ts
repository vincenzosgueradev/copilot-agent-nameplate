// @vitest-environment jsdom
/**
 * Spec 019 (blocco C) — il diff disegnato: split e unified, numeri, segni, tratto evidenziato, testo mai HTML.
 * Oracolo scritto dalla spec (FR-008, FR-010, FR-012).
 */
import { describe, expect, it } from 'vitest';
import { fileDiff } from '../src/services/diff';
import { diffViewHtml } from '../src/services/diffView';

const lines = (n: number): string[] => Array.from({ length: n }, (_, i) => `l${i + 1}`);
const BEFORE = lines(10).map(l => (l === 'l5' ? '<name>agent1 [DEV]</name>' : l)).join('\n');
const AFTER = lines(10).map(l => (l === 'l5' ? '<name>agent1 [UAT]</name>' : l)).join('\n');

const dom = (html: string) => { const el = document.createElement('div'); el.innerHTML = html; return el; };
const cell = (el: Element) => el.textContent!.replace(/\s+/g, ' ').trim();

describe('split: due colonne', () => {
    const view = dom(diffViewHtml(fileDiff('bots/ava_a1/bot.xml', BEFORE, AFTER), 'split'));
    const rows = Array.from(view.querySelectorAll('tbody tr'));

    it('intestazione col nome del file e i conteggi', () => {
        expect(cell(view.querySelector('.diff-file')!)).toBe('bots/ava_a1/bot.xml');
        expect(cell(view.querySelector('.diff-add')!)).toBe('+1');
        expect(cell(view.querySelector('.diff-del')!)).toBe('−1');
        expect(view.querySelector('.diff')!.getAttribute('data-file')).toBe('bots/ava_a1/bot.xml');
        expect(view.querySelector('.diff')!.classList.contains('diff--split')).toBe(true);
    });
    it('una riga per riga affiancata: contesto, il cambio, il salto', () => {
        expect(rows.map(r => r.className.replace('diff-row ', ''))).toEqual([
            'diff-row--context', 'diff-row--context', 'diff-row--context', 'diff-row--context', 'diff-row--changed',
            'diff-row--context', 'diff-row--context', 'diff-row--context', 'diff-row--gap']);
    });
    it('la riga cambiata ha 4 celle: numero, sinistra rossa, numero, destra verde', () => {
        const tds = Array.from(rows[4]!.querySelectorAll('td'));
        expect(tds.map(t => t.className)).toEqual(['diff-no', 'diff-code diff-code--old', 'diff-no', 'diff-code diff-code--new']);
        expect([cell(tds[0]!), cell(tds[2]!)]).toEqual(['5', '5']);
        expect(cell(tds[1]!)).toContain('<name>agent1 [DEV]</name>');
        expect(cell(tds[3]!)).toContain('<name>agent1 [UAT]</name>');
    });
    it('i segni − e + stanno nelle celle cambiate, non in quelle di contesto', () => {
        expect(rows[4]!.querySelector('.diff-code--old .diff-mark')!.textContent).toBe('−');
        expect(rows[4]!.querySelector('.diff-code--new .diff-mark')!.textContent).toBe('+');
        expect(rows[0]!.querySelectorAll('.diff-code--old, .diff-code--new').length).toBe(0);
        expect(rows[0]!.querySelector('.diff-mark')!.textContent).toBe('');
    });
    it('il tratto che cambia e\' evidenziato da una parte e dall\'altra', () => {
        expect(Array.from(rows[4]!.querySelectorAll('mark.diff-hl')).map(m => m.textContent)).toEqual(['DEV', 'UAT']);
        expect(view.querySelectorAll('mark.diff-hl').length).toBe(2);
    });
    it('le righe di contesto hanno i numeri e lo stesso testo a destra e a sinistra', () => {
        const tds = Array.from(rows[0]!.querySelectorAll('td'));
        expect([cell(tds[0]!), cell(tds[1]!), cell(tds[2]!), cell(tds[3]!)]).toEqual(['1', 'l1', '1', 'l1']);
    });
    it('il salto dice quante righe nasconde', () => {
        expect(cell(rows[8]!)).toBe('2 unchanged lines');
        expect(rows[8]!.querySelector('td')!.getAttribute('colspan')).toBe('4');
    });
    it('la tabella ha il suo nome per chi usa uno screen reader', () => {
        expect(view.querySelector('table')!.getAttribute('aria-label')).toBe('Changes in bots/ava_a1/bot.xml');
    });
});

describe('righe tolte e aggiunte: un lato vuoto', () => {
    it('una riga aggiunta ha il lato sinistro vuoto, una tolta il destro', () => {
        const added = dom(diffViewHtml(fileDiff('f', 'a\nc', 'a\nb\nc', { context: Infinity }), 'split'));
        const row = added.querySelector('.diff-row--added')!;
        expect(row.querySelectorAll('.diff-code--empty').length).toBe(1);
        expect(cell(row.querySelectorAll('td')[0]!)).toBe('');
        expect(cell(row.querySelectorAll('td')[2]!)).toBe('2');
        const removed = dom(diffViewHtml(fileDiff('f', 'a\nb\nc', 'a\nc', { context: Infinity }), 'split'));
        const r2 = removed.querySelector('.diff-row--removed')!;
        expect(r2.querySelectorAll('td')[3]!.className).toContain('diff-code--empty');
        expect(cell(r2.querySelectorAll('td')[0]!)).toBe('2');
    });
});

describe('unified: una colonna di codice', () => {
    const view = dom(diffViewHtml(fileDiff('f.xml', BEFORE, AFTER), 'unified'));
    const rows = Array.from(view.querySelectorAll('tbody tr'));

    it('la riga cambiata diventa due righe: la tolta sopra, l\'aggiunta sotto', () => {
        expect(rows.length).toBe(10);
        const old = rows[4]!; const neu = rows[5]!;
        expect(old.querySelector('.diff-code--old')).not.toBeNull();
        expect(neu.querySelector('.diff-code--new')).not.toBeNull();
        expect(Array.from(old.querySelectorAll('td')).map(cell)).toEqual(['5', '', '−<name>agent1 [DEV]</name>']);
        expect(Array.from(neu.querySelectorAll('td')).map(cell)).toEqual(['', '5', '+<name>agent1 [UAT]</name>']);
    });
    it('ha due colonne di numeri e una di codice, e la classe del modo', () => {
        expect(view.querySelectorAll('colgroup col').length).toBe(3);
        expect(view.querySelector('.diff')!.classList.contains('diff--unified')).toBe(true);
        expect(rows[0]!.querySelectorAll('td').length).toBe(3);
    });
    it('il tratto evidenziato c\'e\' anche qui, il salto copre tre colonne', () => {
        expect(Array.from(view.querySelectorAll('mark.diff-hl')).map(m => m.textContent)).toEqual(['DEV', 'UAT']);
        expect(rows[rows.length - 1]!.querySelector('td')!.getAttribute('colspan')).toBe('3');
    });
    it('una riga solo tolta o solo aggiunta resta una riga', () => {
        const only = dom(diffViewHtml(fileDiff('f', 'a\nb', 'a', { context: Infinity }), 'unified'));
        expect(only.querySelectorAll('tbody tr').length).toBe(2);
    });
});

describe('il contenuto dei file e\' sempre testo (FR-012)', () => {
    const evil = '<img src=x onerror=alert(1)> & "q" \'s\'';
    for (const mode of ['split', 'unified'] as const) {
        it(`${mode}: ne' le righe ne' il nome del file creano elementi`, () => {
            const view = dom(diffViewHtml(fileDiff('<b>f</b>.xml', 'a', evil), mode));
            expect(view.querySelector('img')).toBeNull();
            expect(view.querySelector('b')).toBeNull();
            expect(view.textContent).toContain(evil);
            expect(view.textContent).toContain('<b>f</b>.xml');
        });
    }
    it('anche il tratto evidenziato e\' testo', () => {
        const view = dom(diffViewHtml(fileDiff('f', 'x <b>a</b>', 'x <i>a</i>'), 'split'));
        expect(view.querySelector('b, i')).toBeNull();
    });
});

describe('senza modifiche e oltre il limite', () => {
    it('nessuna modifica: una frase e nessuna tabella', () => {
        const view = dom(diffViewHtml(fileDiff('f', 'same', 'same'), 'split'));
        expect(cell(view.querySelector('.diff-empty')!)).toBe('This file does not change.');
        expect(view.querySelector('table')).toBeNull();
        expect(cell(view.querySelector('.diff-add')!)).toBe('+0');
    });
    it('oltre il limite una riga dice quante righe di modifica mancano', () => {
        const many = dom(diffViewHtml(fileDiff('f', lines(100).join('\n'), lines(100).map(l => `m${l}`).join('\n'), { context: 0 }), 'split'));
        expect(cell(many.querySelector('.diff-row--more')!)).toBe('20 more changed lines');
        const one = dom(diffViewHtml(fileDiff('f', lines(81).join('\n'), lines(81).map(l => `m${l}`).join('\n'), { context: 0 }), 'split'));
        expect(cell(one.querySelector('.diff-row--more')!)).toBe('1 more changed line');
        const none = dom(diffViewHtml(fileDiff('f', 'a', 'b'), 'split'));
        expect(none.querySelector('.diff-row--more')).toBeNull();
    });
    it('un cambio senza tratto da evidenziare non ha il tag mark', () => {
        const view = dom(diffViewHtml(fileDiff('f', '', 'a'), 'split'));
        expect(view.querySelector('mark')).toBeNull();
    });
});
