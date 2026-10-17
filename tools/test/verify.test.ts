/**
 * La verifica dello zip prodotto (FR-077, FR-085, FR-095): deve **respingere** gli zip sbagliati,
 * non solo accettare quelli giusti. Un controllo che non ha mai detto di no non dimostra nulla.
 */

import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { applyPatch, buildPatchPlan } from '../src/services/patch';
import { readPackage } from '../src/services/package';
import { buildZip, verificationPassed, verifyZip } from '../src/services/rezip';
import { DEFAULT_OPTIONS } from '../src/types';
import { makePackage } from './helpers/fixture';

/** La versione che l'export porta dopo che il tool l'ha alzata in DEV: la verifica deve ritrovarla. */
const EXPORTED_VERSION = '1.0.0.3';

const SPEC = {
    version: EXPORTED_VERSION,
    agents: [
        { schema: 'ava_a1', name: 'one [DEV]', publishOnImport: null, topics: 1 },
        { schema: 'ava_a2', name: 'two [DEV]', publishOnImport: true, topics: 1 },
    ],
};

/** Un caso completo: piano con nome e publish per agent, e un export che porta la versione alzata in DEV. */
function scenario() {
    const pkg = readPackage(makePackage(SPEC));
    const plan = buildPatchPlan(pkg, 'UAT', ['ava_a1', 'ava_a2'], {
        ...DEFAULT_OPTIONS,
        publishByAgent: { ava_a1: 'force-true', ava_a2: 'force-false' },
    });
    const { files, patchedPaths } = applyPatch(pkg, plan);
    const names: Record<string, string> = {};
    const publish: Record<string, boolean> = {};
    const version: string = EXPORTED_VERSION;
    for (const c of plan) {
        if (c.element === 'name') names[c.file] = c.after;
        if (c.element === 'publishOnImport') publish[c.file] = c.after === 'true';
    }
    const good = buildZip(files);
    const verify = (zip: Uint8Array, over: { names?: typeof names; publish?: typeof publish; version?: string } = {}) =>
        verifyZip(zip, pkg, over.names ?? names, patchedPaths, {
            publish: over.publish ?? publish, version: over.version ?? version,
        });
    return { pkg, plan, files, patchedPaths, names, publish, version, good, verify };
}

const rezip = (files: Record<string, Uint8Array>) => zipSync(files);

describe('verifyZip accetta lo zip giusto', () => {
    it('tutti i controlli passano', () => {
        const s = scenario();
        const v = s.verify(s.good);
        expect(v).toMatchObject({ archiveReadable: true, entryCountMatches: true, patchedValuesConfirmed: true });
        expect(verificationPassed(v, s.pkg.entries.length - s.patchedPaths.length)).toBe(true);
    });
    it('la dimensione del file NON conta (FR-095): un compressore diverso non e\' un errore', () => {
        const s = scenario();
        const other = zipSync(unzipSync(s.good), { level: 0 });
        expect(other.length).not.toBe(s.good.length);
        expect(s.verify(other).patchedValuesConfirmed).toBe(true);
    });
});

describe('verifyZip respinge lo zip sbagliato', () => {
    it('contenuto che non e\' uno zip', () => {
        const s = scenario();
        const v = s.verify(strToU8('this is not a zip archive at all'));
        expect(v.archiveReadable).toBe(false);
        expect(verificationPassed(v, 1)).toBe(false);
    });
    it('zip troncato', () => {
        const s = scenario();
        expect(s.verify(s.good.slice(0, Math.floor(s.good.length / 2))).archiveReadable).toBe(false);
    });
    it('entry mancante', () => {
        const s = scenario();
        const files = unzipSync(s.good);
        delete files['botcomponents/ava_a1.gpt.default/data'];
        const v = s.verify(rezip(files));
        expect(v.entryCountMatches).toBe(false);
        expect(verificationPassed(v, s.pkg.entries.length - s.patchedPaths.length)).toBe(false);
    });
    it('entry in piu\'', () => {
        const s = scenario();
        const files = unzipSync(s.good);
        files['extra.txt'] = strToU8('x');
        expect(s.verify(rezip(files)).entryCountMatches).toBe(false);
    });
    it('un nome sbagliato in bot.xml', () => {
        const s = scenario();
        const files = unzipSync(s.good);
        files['bots/ava_a1/bot.xml'] = strToU8(
            strFromU8(files['bots/ava_a1/bot.xml']!).replace(/<name>[^<]*<\/name>/, '<name>wrong</name>'));
        expect(s.verify(rezip(files)).patchedValuesConfirmed).toBe(false);
    });
    it('bot.xml senza <name>', () => {
        const s = scenario();
        const files = unzipSync(s.good);
        files['bots/ava_a1/bot.xml'] = strToU8('<bot schemaname="ava_a1"></bot>');
        expect(s.verify(rezip(files)).patchedValuesConfirmed).toBe(false);
    });
    it('publishOnImport diverso da quello previsto per quell\'agent', () => {
        const s = scenario();
        const files = unzipSync(s.good);
        const cfg = JSON.parse(strFromU8(files['bots/ava_a1/configuration.json']!)) as Record<string, unknown>;
        cfg.publishOnImport = false;                       // il piano diceva true
        files['bots/ava_a1/configuration.json'] = strToU8(JSON.stringify(cfg));
        expect(s.verify(rezip(files)).patchedValuesConfirmed).toBe(false);
    });
    it('publishOnImport scambiato tra due agent', () => {
        const s = scenario();
        const files = unzipSync(s.good);
        const set = (path: string, v: boolean) => {
            const cfg = JSON.parse(strFromU8(files[path]!)) as Record<string, unknown>;
            cfg.publishOnImport = v;
            files[path] = strToU8(JSON.stringify(cfg));
        };
        set('bots/ava_a1/configuration.json', false);
        set('bots/ava_a2/configuration.json', true);
        expect(s.verify(rezip(files)).patchedValuesConfirmed).toBe(false);
    });
    it('publishOnImport mancante dove doveva esserci', () => {
        const s = scenario();
        const files = unzipSync(s.good);
        const cfg = JSON.parse(strFromU8(files['bots/ava_a1/configuration.json']!)) as Record<string, unknown>;
        delete cfg.publishOnImport;
        files['bots/ava_a1/configuration.json'] = strToU8(JSON.stringify(cfg));
        expect(s.verify(rezip(files)).patchedValuesConfirmed).toBe(false);
    });
    it('configuration.json illeggibile', () => {
        const s = scenario();
        const files = unzipSync(s.good);
        files['bots/ava_a1/configuration.json'] = strToU8('{ broken');
        expect(s.verify(rezip(files)).patchedValuesConfirmed).toBe(false);
    });
    it('uno zip che porta una versione diversa da quella scritta in DEV (export vecchio) viene respinto', () => {
        const s = scenario();
        const files = unzipSync(s.good);
        files['solution.xml'] = strToU8(
            strFromU8(files['solution.xml']!).replace(`<Version>${EXPORTED_VERSION}</Version>`, '<Version>1.0.0.2</Version>'));
        expect(s.verify(rezip(files)).patchedValuesConfirmed).toBe(false);
    });
    it('uno zip senza <Version> viene respinto', () => {
        const s = scenario();
        const files = unzipSync(s.good);
        files['solution.xml'] = strToU8(strFromU8(files['solution.xml']!).replace(/<Version>[^<]*<\/Version>/, ''));
        expect(s.verify(rezip(files)).patchedValuesConfirmed).toBe(false);
    });
    it('senza una versione attesa la verifica non la controlla', () => {
        const s = scenario();
        const files = unzipSync(s.good);
        files['solution.xml'] = strToU8(
            strFromU8(files['solution.xml']!).replace(`<Version>${EXPORTED_VERSION}</Version>`, '<Version>7.7.7.7</Version>'));
        const v = verifyZip(rezip(files), s.pkg, s.names, s.patchedPaths, { publish: s.publish });
        expect(v.patchedValuesConfirmed).toBe(true);
    });
    it('versione diversa da quella prevista', () => {
        const s = scenario();
        expect(s.verify(s.good, { version: '9.9.9.9' }).patchedValuesConfirmed).toBe(false);
    });
    it('un\'entry non patchata alterata non conta come byte-identica', () => {
        const s = scenario();
        const files = unzipSync(s.good);
        files['botcomponents/ava_a2.gpt.default/data'] = strToU8('tampered');
        const v = s.verify(rezip(files));
        const expectedIdentical = s.pkg.entries.length - s.patchedPaths.length;
        expect(v.byteIdenticalEntries).toBe(expectedIdentical - 1);
        expect(verificationPassed(v, expectedIdentical)).toBe(false);
    });
    it('un\'entry non patchata con byte in coda (stesso inizio, piu\' lunga) non e\' identica', () => {
        const s = scenario();
        const files = unzipSync(s.good);
        const path = 'botcomponents/ava_a2.gpt.default/data';
        const original = files[path]!;
        const longer = new Uint8Array(original.length + 3);
        longer.set(original);
        longer.set([1, 2, 3], original.length);
        files[path] = longer;
        const v = s.verify(rezip(files));
        const expectedIdentical = s.pkg.entries.length - s.patchedPaths.length;
        expect(v.byteIdenticalEntries).toBe(expectedIdentical - 1);
        expect(verificationPassed(v, expectedIdentical)).toBe(false);
    });
    it('un\'entry non patchata troncata (stesso inizio, piu\' corta) non e\' identica', () => {
        const s = scenario();
        const files = unzipSync(s.good);
        const path = 'botcomponents/ava_a2.gpt.default/data';
        files[path] = files[path]!.slice(0, files[path]!.length - 2);
        const v = s.verify(rezip(files));
        expect(v.byteIdenticalEntries).toBe(s.pkg.entries.length - s.patchedPaths.length - 1);
    });
    it('una entry che doveva essere patchata ma non lo e\' stata', () => {
        const s = scenario();
        const files = unzipSync(s.good);
        files['bots/ava_a2/bot.xml'] = s.pkg.entries.find(e => e.path === 'bots/ava_a2/bot.xml')!.data;
        expect(s.verify(rezip(files)).patchedValuesConfirmed).toBe(false);
    });
});

describe('verificationPassed: tabella di verita\'', () => {
    const base = { archiveReadable: true, entryCountMatches: true, patchedValuesConfirmed: true, byteIdenticalEntries: 5 };
    it('basta un controllo a falso', () => {
        expect(verificationPassed(base, 5)).toBe(true);
        expect(verificationPassed({ ...base, archiveReadable: false }, 5)).toBe(false);
        expect(verificationPassed({ ...base, entryCountMatches: false }, 5)).toBe(false);
        expect(verificationPassed({ ...base, patchedValuesConfirmed: false }, 5)).toBe(false);
        expect(verificationPassed({ ...base, byteIdenticalEntries: 4 }, 5)).toBe(false);
        expect(verificationPassed({ ...base, byteIdenticalEntries: 6 }, 5)).toBe(false);
    });
});
