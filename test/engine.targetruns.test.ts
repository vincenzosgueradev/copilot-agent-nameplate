/**
 * Spec 016 D8 — ogni Target porta i **suoi** agent e le **sue** eccezioni di publish.
 *
 * Matrice: 3 Target (UAT, PROD, HOTFIX), per ognuno un insieme di agent (tutti / senza beta / solo
 * gamma) = 27 combinazioni; l'eccezione di publish su alpha c'e' o no a seconda del Target e della
 * combinazione. L'oracolo e' scritto dalla spec (FR-006, FR-013, D7, D8), senza funzioni di `src/`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strFromU8 } from 'fflate';
import { DEFAULT_OPTIONS, type PackagingOptions, type PublishMode, type TargetRun } from '../src/types';

const source = vi.hoisted(() => ({ make: (_managed: boolean): Uint8Array => new Uint8Array(), exports: 0 }));
vi.mock('../src/services/export', () => ({
    exportPair: async () => {
        source.exports++;
        return {
            managed: { bytes: source.make(true), mode: 'sync' as const, seconds: 0 },
            unmanaged: { bytes: source.make(false), mode: 'sync' as const, seconds: 0 },
        };
    },
}));

import { runPackagingTargets } from '../src/services/packaging';
import { readPackage } from '../src/services/package';
import { makePackage, packageFiles, readEntries, type AgentSpec, type PackageSpec } from './helpers/fixture';
import { installFakeDev, makeDev } from './helpers/fake-dev';
import { effectiveMode, expectedName, expectedPublish } from './helpers/oracle';

const NEW_VERSION = '1.0.0.3';
const AGENTS = [
    { name: 'alpha [DEV]', publish: null as boolean | null },
    { name: 'beta', publish: true as boolean | null },
    { name: 'gamma [UAT]', publish: false as boolean | null },
];
const schemaOf = (i: number) => `ava_a${i + 1}`;
const dec = (b: Uint8Array | undefined) => (b ? strFromU8(b) : '');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function specFor(managed: boolean, version = '1.0.0.2'): PackageSpec {
    const agents: AgentSpec[] = AGENTS.map((a, i) => ({
        schema: schemaOf(i), name: a.name, publishOnImport: a.publish, connected: true, topics: 1,
    }));
    return { version, managed, agents };
}

beforeEach(() => {
    source.exports = 0;
    const dev = makeDev([{ id: 'sol-1', unique: 'testSolution', version: '1.0.0.2' }]);
    installFakeDev(dev);
    // L'export legge la versione che DEV ha nel momento in cui parte (il motore la alza prima)
    source.make = managed => makePackage(specFor(managed, dev.versionOf('testSolution')));
});

const NAMES = ['UAT', 'PROD', 'HOTFIX'];
const SETS: { label: string; agents: number[] }[] = [
    { label: 'tutti', agents: [0, 1, 2] },
    { label: 'senza beta', agents: [0, 2] },
    { label: 'solo gamma', agents: [2] },
];
const MODES: PublishMode[] = ['keep', 'force-true', 'force-false'];

interface Combo { sets: number[]; exceptions: boolean[]; }
const COMBOS: Combo[] = [];
for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) {
    const k = COMBOS.length;
    COMBOS.push({ sets: [a, b, c], exceptions: [0, 1, 2].map(i => (k + i) % 2 === 0) });
}

function runsFor(combo: Combo): TargetRun[] {
    return NAMES.map((name, i) => ({
        name,
        publishOnImport: MODES[i]!,
        agents: SETS[combo.sets[i]!]!.agents.map(schemaOf),
        publishByAgent: combo.exceptions[i] ? { [schemaOf(0)]: 'force-false' as PublishMode } : {},
    }));
}

/** Dopo la patch, per un Target: nome e publish attesi di ogni agent (FR-023, D7, D8). */
function expectedFor(combo: Combo, ti: number) {
    return AGENTS.map((a, i) => {
        const selected = SETS[combo.sets[ti]!]!.agents.includes(i);
        const perAgent: PublishMode | undefined = combo.exceptions[ti] && i === 0 ? 'force-false' : undefined;
        return {
            name: expectedName(a.name, NAMES[ti]!, selected),
            publish: expectedPublish(a.publish, effectiveMode(perAgent, MODES[ti]!), selected),
        };
    });
}

const opts: PackagingOptions = { ...DEFAULT_OPTIONS, newVersion: NEW_VERSION, publishOnImport: 'keep' };

describe('agent e publish per Target (27 combinazioni)', () => {
    for (const [k, combo] of COMBOS.entries()) {
        const label = NAMES.map((n, i) => `${n}: ${SETS[combo.sets[i]!]!.label}${combo.exceptions[i] ? '+eccezione' : ''}`).join(' | ');
        it(`#${k} ${label}`, async () => {
            const r = await runPackagingTargets('testSolution', runsFor(combo), ['ava_a1', 'ava_a2', 'ava_a3'], opts);

            expect(source.exports, 'un solo export').toBe(1);
            expect(r.valid, 'ogni Target valido').toBe(true);
            const original = packageFiles(specFor(true, NEW_VERSION));

            r.targets.forEach((tr, ti) => {
                const exp = expectedFor(combo, ti);
                const produced = readEntries(tr.managed.bytes);
                for (const path of Object.keys(original)) {
                    const bot = /^bots\/([^/]+)\/bot\.xml$/.exec(path);
                    const cfg = /^bots\/([^/]+)\/configuration\.json$/.exec(path);
                    if (bot) {
                        const i = Number(bot[1]!.replace('ava_a', '')) - 1;
                        expect(dec(produced[path]), `#${ti} ${path}`).toBe(
                            dec(original[path]).replace(/<name>[^<]*<\/name>/, `<name>${esc(exp[i]!.name)}</name>`));
                    } else if (cfg) {
                        const i = Number(cfg[1]!.replace('ava_a', '')) - 1;
                        if (exp[i]!.publish !== AGENTS[i]!.publish) {
                            expect(JSON.parse(dec(produced[path])), `#${ti} ${path}`).toEqual(
                                { ...(JSON.parse(dec(original[path])) as object), publishOnImport: exp[i]!.publish });
                        } else {
                            expect(produced[path], `#${ti} ${path}: invariata`).toEqual(original[path]);
                        }
                    } else {
                        expect(produced[path], `#${ti} ${path}: byte-identica`).toEqual(original[path]);
                    }
                }
                readPackage(tr.managed.bytes).agents.forEach(a => {
                    const i = Number(a.schemaName.replace('ava_a', '')) - 1;
                    expect(a.name, `#${ti} nome di ${a.schemaName}`).toBe(exp[i]!.name);
                    expect(a.publishOnImport, `#${ti} publish di ${a.schemaName}`).toBe(exp[i]!.publish);
                });
            });

            // FR-013: col primo Target differiscono solo i nomi e il publish dove la patch scrive
            r.targets.slice(1).forEach((tr, k2) => {
                const first = expectedFor(combo, 0);
                const other = expectedFor(combo, k2 + 1);
                const diff: { path: string; kind: string }[] = [];
                AGENTS.forEach((_, i) => {
                    if (first[i]!.name !== other[i]!.name) diff.push({ path: `bots/${schemaOf(i)}/bot.xml`, kind: 'agent-name' });
                    if (first[i]!.publish !== other[i]!.publish) diff.push({ path: `bots/${schemaOf(i)}/configuration.json`, kind: 'publish-on-import' });
                });
                diff.sort((p, q) => p.path.localeCompare(q.path));
                expect(tr.comparison!.differing, `confronto #${k2 + 1}`).toEqual(diff);
                expect(tr.comparison!.unexpected, `inattese #${k2 + 1}`).toEqual([]);
            });
        });
    }
});

describe('agent e publish per Target: casi limite e negativi', () => {
    it('un Target senza `agents` usa gli agent condivisi del giro', async () => {
        const r = await runPackagingTargets('testSolution',
            [{ name: 'UAT', publishOnImport: 'keep' }, { name: 'PROD', publishOnImport: 'keep', agents: ['ava_a1'] }],
            ['ava_a2', 'ava_a3'], opts);
        const names = (i: number) => readPackage(r.targets[i]!.managed.bytes).agents.map(a => a.name);
        expect(names(0)).toEqual(['alpha [DEV]', 'beta [UAT]', 'gamma [UAT]']);
        expect(names(1)).toEqual(['alpha [PROD]', 'beta', 'gamma [UAT]']);
    });

    it('un Target con `agents` vuoto non rinomina nulla ed e\' valido', async () => {
        const r = await runPackagingTargets('testSolution',
            [{ name: 'UAT', publishOnImport: 'keep', agents: [] }, { name: 'PROD', publishOnImport: 'keep', agents: ['ava_a1'] }],
            ['ava_a1', 'ava_a2', 'ava_a3'], opts);
        expect(readPackage(r.targets[0]!.managed.bytes).agents.map(a => a.name)).toEqual(['alpha [DEV]', 'beta', 'gamma [UAT]']);
        expect(r.targets[0]!.plan.filter(c => c.state !== 'no-change')).toEqual([]);
        expect(r.valid).toBe(true);
    });

    it('un Target senza `publishByAgent` usa le eccezioni condivise; con `{}` non ne ha nessuna', async () => {
        const shared: PackagingOptions = { ...opts, publishByAgent: { ava_a1: 'force-false' } };
        const r = await runPackagingTargets('testSolution', [
            { name: 'UAT', publishOnImport: 'force-true' },
            { name: 'PROD', publishOnImport: 'force-true', publishByAgent: {} },
        ], ['ava_a1', 'ava_a2', 'ava_a3'], shared);
        const publish = (i: number) => readPackage(r.targets[i]!.managed.bytes).agents.map(a => a.publishOnImport);
        expect(publish(0), 'condivisa: alpha forzato a no').toEqual([false, true, true]);
        expect(publish(1), 'propria vuota: tutti a si').toEqual([true, true, true]);
    });

    it('l\'eccezione di un Target non passa agli altri', async () => {
        const r = await runPackagingTargets('testSolution', [
            { name: 'UAT', publishOnImport: 'force-true', publishByAgent: { ava_a1: 'force-false' } },
            { name: 'PROD', publishOnImport: 'force-true', publishByAgent: {} },
        ], ['ava_a1', 'ava_a2', 'ava_a3'], opts);
        expect(readPackage(r.targets[0]!.managed.bytes).agents[0]!.publishOnImport).toBe(false);
        expect(readPackage(r.targets[1]!.managed.bytes).agents[0]!.publishOnImport).toBe(true);
    });

    it('lo stesso agent escluso in un Target e incluso in un altro: i nomi seguono il Target', async () => {
        const r = await runPackagingTargets('testSolution', [
            { name: 'UAT', publishOnImport: 'keep', agents: ['ava_a2'] },
            { name: 'PROD', publishOnImport: 'keep', agents: [] },
        ], [], opts);
        expect(readPackage(r.targets[0]!.managed.bytes).agents[1]!.name).toBe('beta [UAT]');
        expect(readPackage(r.targets[1]!.managed.bytes).agents[1]!.name).toBe('beta');
        // il confronto lo dice: differisce solo bot.xml di beta
        expect(r.targets[1]!.comparison!.differing).toEqual([{ path: 'bots/ava_a2/bot.xml', kind: 'agent-name' }]);
    });
});
