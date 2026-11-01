/**
 * Spec 016 (Fase 2) — confronto fra gli zip di due Target (FR-013).
 * Oracolo: due zip dello stesso export differiscono solo dove la patch ha scritto, cioe' nel nome di un
 * agent (bots/<schema>/bot.xml) e in publishOnImport (bots/<schema>/configuration.json); ogni altra
 * differenza e' inattesa.
 */
import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { compareArchives, differenceKind } from '../src/services/compare';

const u8 = (s: string) => new TextEncoder().encode(s);
const zip = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, u8(v)])));
const BASE = {
    'bots/a/bot.xml': '<name>alpha [UAT]</name>',
    'bots/a/configuration.json': '{"x":1}',
    'solution.xml': '<v>1</v>',
};
const cmp = (a: Record<string, string>, b: Record<string, string>, pa: string[] = [], pb: string[] = []) =>
    compareArchives({ bytes: zip(a), patchedPaths: pa }, { bytes: zip(b), patchedPaths: pb }, 'UAT');

describe('differenceKind: dove una differenza e\' attesa', () => {
    const cases: [string, 'agent-name' | 'publish-on-import' | null][] = [
        ['bots/ava_a1/bot.xml', 'agent-name'],
        ['bots/ava_a1/configuration.json', 'publish-on-import'],
        ['bots/a/sub/bot.xml', null],
        ['bots/a/sub/configuration.json', null],
        ['bots/a/configuration.json.bak', null],
        ['bots/configuration.json', null],
        ['xbots/a/bot.xml', null],
        ['bots/a/bot.xml.bak', null],
        ['bots/bot.xml', null],
        ['solution.xml', null],
        ['customizations.xml', null],
        ['botcomponents/x/data', null],
        ['bots/a/BOT.XML', null],
    ];
    for (const [path, kind] of cases) it(`${path} -> ${kind ?? 'nessuna'}`, () => expect(differenceKind(path)).toBe(kind));
});

describe('compareArchives', () => {
    it('zip identici: nessuna differenza, tutte le entry identiche', () => {
        expect(cmp(BASE, BASE)).toEqual({ against: 'UAT', differing: [], identicalEntries: 3, unexpected: [] });
    });

    it('il nome di un agent cambiato dove la patch ha scritto: atteso', () => {
        const other = { ...BASE, 'bots/a/bot.xml': '<name>alpha [PROD]</name>' };
        expect(cmp(BASE, other, ['bots/a/bot.xml'], ['bots/a/bot.xml'])).toEqual({
            against: 'UAT', differing: [{ path: 'bots/a/bot.xml', kind: 'agent-name' }], identicalEntries: 2, unexpected: [],
        });
    });

    it('publishOnImport cambiato dove la patch ha scritto: atteso', () => {
        const other = { ...BASE, 'bots/a/configuration.json': '{"x":1,"publishOnImport":true}' };
        const r = cmp(BASE, other, [], ['bots/a/configuration.json']);
        expect(r.differing).toEqual([{ path: 'bots/a/configuration.json', kind: 'publish-on-import' }]);
        expect(r.unexpected).toEqual([]);
    });

    it('basta che UNO dei due abbia patchato quel percorso', () => {
        const other = { ...BASE, 'bots/a/bot.xml': '<name>alpha</name>' };
        expect(cmp(BASE, other, ['bots/a/bot.xml'], []).unexpected).toEqual([]);
        expect(cmp(BASE, other, [], ['bots/a/bot.xml']).unexpected).toEqual([]);
    });

    it('una differenza in bot.xml che nessuna patch ha scritto e\' inattesa', () => {
        const other = { ...BASE, 'bots/a/bot.xml': '<name>alpha [PROD]</name>' };
        const r = cmp(BASE, other, [], []);
        expect(r.unexpected).toEqual(['bots/a/bot.xml']);
        expect(r.differing).toEqual([]);
    });

    it('una differenza in un file che la patch non scrive mai e\' inattesa, anche se elencata come patchata', () => {
        const other = { ...BASE, 'solution.xml': '<v>2</v>' };
        expect(cmp(BASE, other, ['solution.xml'], ['solution.xml']).unexpected).toEqual(['solution.xml']);
        expect(cmp(BASE, other).unexpected).toEqual(['solution.xml']);
    });

    it('un\'entry presente in uno solo e\' inattesa, in entrambi i versi', () => {
        const more = { ...BASE, 'extra.xml': 'x' };
        expect(cmp(BASE, more).unexpected).toEqual(['extra.xml']);
        expect(cmp(more, BASE).unexpected).toEqual(['extra.xml']);
    });

    it('un bot.xml presente in uno solo e\' inattesa anche se patchata', () => {
        const more = { ...BASE, 'bots/b/bot.xml': '<name>b</name>' };
        const r = cmp(BASE, more, [], ['bots/b/bot.xml']);
        expect(r.unexpected).toEqual(['bots/b/bot.xml']);
        expect(r.differing).toEqual([]);
    });

    it('piu\' differenze: attese e inattese insieme, in ordine alfabetico', () => {
        const a = { ...BASE, 'bots/b/bot.xml': '<name>b</name>', 'bots/b/configuration.json': '{}' };
        const b = { ...a, 'bots/b/bot.xml': '<name>b [X]</name>', 'bots/a/bot.xml': '<name>z</name>',
            'bots/b/configuration.json': '{"publishOnImport":false}', 'solution.xml': '<v>9</v>' };
        const r = cmp(a, b, ['bots/b/bot.xml'], ['bots/b/bot.xml', 'bots/b/configuration.json', 'bots/a/bot.xml']);
        expect(r.differing).toEqual([
            { path: 'bots/a/bot.xml', kind: 'agent-name' },
            { path: 'bots/b/bot.xml', kind: 'agent-name' },
            { path: 'bots/b/configuration.json', kind: 'publish-on-import' },
        ]);
        expect(r.unexpected).toEqual(['solution.xml']);
        expect(r.identicalEntries).toBe(1);
    });

    it('le differenze e le inattese escono in ordine alfabetico anche se nello zip stanno in un altro ordine', () => {
        const a = { 'zzz.xml': '1', 'bots/z/bot.xml': '<name>z</name>', 'aaa.xml': '1', 'bots/a/bot.xml': '<name>a</name>' };
        const b = { 'zzz.xml': '2', 'bots/z/bot.xml': '<name>Z</name>', 'aaa.xml': '2', 'bots/a/bot.xml': '<name>A</name>' };
        const r = cmp(a, b, ['bots/z/bot.xml', 'bots/a/bot.xml']);
        expect(r.differing.map(d => d.path)).toEqual(['bots/a/bot.xml', 'bots/z/bot.xml']);
        expect(r.unexpected).toEqual(['aaa.xml', 'zzz.xml']);
    });

    it('identicalEntries conta solo le entry presenti in entrambi e uguali', () => {
        const other = { ...BASE, 'bots/a/bot.xml': '<name>q</name>', 'new.xml': 'n' };
        const r = cmp(BASE, other, [], ['bots/a/bot.xml']);
        expect(r.identicalEntries).toBe(2);
    });

    it('il nome del riferimento si riporta com\'e\'', () => {
        expect(compareArchives({ bytes: zip(BASE), patchedPaths: [] }, { bytes: zip(BASE), patchedPaths: [] }, 'Mio Target').against)
            .toBe('Mio Target');
    });

    it('non modifica gli ingressi', () => {
        const pa = ['bots/a/bot.xml'];
        const other = { ...BASE, 'bots/a/bot.xml': '<name>q</name>' };
        cmp(BASE, other, pa, pa);
        expect(pa).toEqual(['bots/a/bot.xml']);
    });
});
