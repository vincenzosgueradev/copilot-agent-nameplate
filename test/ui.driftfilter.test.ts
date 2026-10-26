// @vitest-environment jsdom
/**
 * Spec 014 — l'avviso sul formato compare solo se manca cio' che il tool modifica.
 * Oracolo: la decisione dell'utente (26 ott 2026): chiavi o cartelle nuove non cambiano il
 * risultato, quindi non si mostrano; restano nel log e nel manifest.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { relevantDrift } from '../src/services/compat';
import type { FormatDrift } from '../src/types';
import { boot, type UiWorld } from './helpers/ui-harness';

afterEach(() => { vi.useRealTimers(); });

const d = (what: string, kind: FormatDrift['kind'] = 'added', against: FormatDrift['against'] = 'baseline'): FormatDrift =>
    ({ against, kind, what, blocking: false });

describe('relevantDrift: solo cio\' che il tool tocca', () => {
    it('manca <name> in bot.xml → rilevante', () => {
        const x = d('bot.xml elements: disappeared "name"', 'removed');
        expect(relevantDrift([x])).toEqual([x]);
    });
    it.each([
        ['chiave nuova in configuration.json', d('configuration.json keys (standard agent): appeared "categories"')],
        ['chiave sparita in configuration.json', d('configuration.json keys (standard agent): disappeared "settings"', 'removed')],
        ['publishOnImport assente', d('configuration.json keys (standard agent): disappeared "publishOnImport"', 'removed')],
        ['elemento nuovo in bot.xml', d('bot.xml elements: appeared "displayname"')],
        ['altro elemento sparito da bot.xml', d('bot.xml elements: disappeared "language"', 'removed')],
        ['name sparito da botcomponent.xml', d('botcomponent.xml elements: disappeared "name"', 'removed')],
        ['cartella nuova', d('top-level folders: appeared "x"')],
        ['timbro di versione', d('platform version: 1 → 2', 'changed')],
        ['architettura sconosciuta', d('configuration.json: unknown agent architecture "X" — no baseline')],
        ['name "apparso" in bot.xml', d('bot.xml elements: appeared "name"')],
    ])('%s → non rilevante', (_label, x) => {
        expect(relevantDrift([x])).toEqual([]);
    });
    it('in un elenco misto tiene solo quello rilevante', () => {
        const keep = d('bot.xml elements: disappeared "name"', 'removed', 'previous');
        expect(relevantDrift([d('top-level folders: appeared "x"'), keep, d('platform version: 1 → 2', 'changed')])).toEqual([keep]);
    });
    it('elenco vuoto → vuoto', () => { expect(relevantDrift([])).toEqual([]); });
});

describe('schermata: uno scostamento innocuo non si mostra', () => {
    const WORLD: UiWorld = {
        solutions: [{ unique: 'S1' }],
        agents: [{ name: 'agent1', schema: 'ava_a1', solution: 'S1', publish: null }],
        extraFolders: ['brandnew'],
    };
    it('il package ha uno scostamento ma la sezione "Package format" non compare', async () => {
        const ui = await boot(WORLD);
        await ui.openSolution('S1');
        await ui.startRename();
        await ui.typeSuffix('UAT');
        await ui.next();
        await ui.buildPackage();
        await ui.toVerify();
        expect(ui.verifyText()).not.toContain('Package format');
        expect(ui.verifyText()).not.toContain('brandnew');
        expect(ui.doc.getElementById('log-entries')?.textContent ?? ui.doc.body.textContent).toContain('brandnew');
    });
});
