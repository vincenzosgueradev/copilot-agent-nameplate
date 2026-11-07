import { describe, expect, it } from 'vitest';
import { fileDiff, indentJson } from '../src/services/diff';

describe('diff dei JSON: stessa indentazione sui due lati', () => {
    const min = '{"a":1,"b":{"c":[1,2]},"publishOnImport":false}';
    const pretty = '{\n  "a": 1,\n  "b": { "c": [1, 2] },\n  "publishOnImport": true\n}';

    it('minificato contro rientrato: cambia solo la riga vera', () => {
        const d = fileDiff('bots/x/configuration.json', min, pretty);
        expect(d.added).toBe(1);
        expect(d.removed).toBe(1);
    });

    it('contenuto uguale ma formattato diversamente: nessuna differenza', () => {
        const d = fileDiff('a.json', min, JSON.stringify(JSON.parse(min), null, 4));
        expect(d.added + d.removed).toBe(0);
    });

    it('negativo: un .json non valido resta com\'e\' e un file non json non si tocca', () => {
        expect(indentJson('{rotto')).toBe('{rotto');
        const d = fileDiff('a.txt', '{"a":1}', '{\n "a": 1\n}');
        expect(d.added + d.removed).toBeGreaterThan(0);
    });

    it('l\'ordine delle chiavi e i valori non cambiano; il BOM non rompe', () => {
        expect(indentJson('\uFEFF{"z":1,"a":2}')).toBe('{\n  "z": 1,\n  "a": 2\n}');
    });
});
