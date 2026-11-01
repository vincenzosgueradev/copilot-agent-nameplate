/**
 * Spec 016 (Fase 2) — il motore a piu' Target: `runPackagingTargets`.
 *
 * Matrice: Target spuntati (1, 2, 3) x un Target senza suffisso (si/no) x publish on import dei Target
 * (uguale/diverso) x agent escluso (nessuno/uno) x eccezione di publish per agent (nessuna/una) = 48 casi.
 * L'oracolo e' scritto dalla spec (FR-006, FR-008, FR-009, FR-010, FR-013, D5, D7), senza usare
 * funzioni di `src/`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strFromU8 } from 'fflate';
import { DEFAULT_OPTIONS, type PackagingOptions, type PublishMode, type Target } from '../src/types';

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

/** Per forzare un confronto inatteso senza costruire uno zip che lo provochi. */
const forced = vi.hoisted(() => ({ byTarget: new Map<string, { unexpected: string[] }>() }));
vi.mock('../src/services/compare', async importOriginal => {
    const actual = await importOriginal<typeof import('../src/services/compare')>();
    return {
        ...actual,
        compareArchives: (...args: Parameters<typeof actual.compareArchives>) => {
            const real = actual.compareArchives(...args);
            return { ...real, ...(forced.byTarget.get(args[2]) ?? {}) };
        },
    };
});

import { runPackaging, runPackagingTargets } from '../src/services/packaging';
import { readPackage } from '../src/services/package';
import { makePackage, packageFiles, readEntries, type AgentSpec, type PackageSpec } from './helpers/fixture';
import { installFakeDev, makeDev, type FakeDev } from './helpers/fake-dev';
import { expectedName, expectedPublish, effectiveMode } from './helpers/oracle';

const START = '1.0.0.2';
const NEW_VERSION = '1.0.0.3';

const AGENTS = [
    { name: 'alpha [DEV]', publish: null as boolean | null },
    { name: 'beta', publish: true as boolean | null },
    { name: 'gamma [UAT]', publish: false as boolean | null },
];
const schemaOf = (i: number) => `ava_a${i + 1}`;
const dec = (b: Uint8Array | undefined) => (b ? strFromU8(b) : '');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function specFor(managed: boolean, version: string): PackageSpec {
    const agents: AgentSpec[] = AGENTS.map((a, i) => ({
        schema: schemaOf(i), name: a.name, publishOnImport: a.publish, connected: true, topics: 1,
    }));
    return { version, managed, agents };
}

function newDev(): FakeDev {
    const dev = makeDev([{ id: 'sol-1', unique: 'testSolution', version: START }]);
    installFakeDev(dev);
    return dev;
}

beforeEach(() => { source.make = () => new Uint8Array(); source.exports = 0; forced.byTarget.clear(); });

interface Case {
    n: 1 | 2 | 3;
    emptyTarget: boolean;
    publishDiffers: boolean;
    excludeBeta: boolean;
    exception: boolean;
}

const POOL = ['UAT', 'PROD', 'HOTFIX'];
const DIFFERENT: PublishMode[] = ['keep', 'force-true', 'force-false'];

function targetsFor(c: Case): Target[] {
    return POOL.slice(0, c.n).map((name, i) => ({
        name: c.emptyTarget && i === c.n - 1 ? '' : name,
        publishOnImport: c.publishDiffers ? DIFFERENT[i]! : 'force-true',
    }));
}

const CASES: Case[] = [];
for (const n of [1, 2, 3] as const) {
    for (const emptyTarget of [false, true]) {
        for (const publishDiffers of [false, true]) {
            for (const excludeBeta of [false, true]) {
                for (const exception of [false, true]) {
                    CASES.push({ n, emptyTarget, publishDiffers, excludeBeta, exception });
                }
            }
        }
    }
}

/** Dopo la patch, per un Target: nome e publish attesi di ogni agent (FR-023, FR-090a, D5, D7). */
function expectedFor(c: Case, target: Target) {
    return AGENTS.map((a, i) => {
        const selected = !(c.excludeBeta && i === 1);
        // D7: l'eccezione dell'agent (qui solo sull'agent 0) batte il default del Target
        const perAgent: PublishMode | undefined = c.exception && i === 0 ? 'force-false' : undefined;
        return {
            name: expectedName(a.name, target.name, selected),
            publish: expectedPublish(a.publish, effectiveMode(perAgent, target.publishOnImport), selected),
        };
    });
}

function optionsFor(c: Case): PackagingOptions {
    return {
        ...DEFAULT_OPTIONS,
        newVersion: NEW_VERSION,
        publishOnImport: 'keep',   // il default che conta e' quello del Target
        publishByAgent: c.exception ? { [schemaOf(0)]: 'force-false' } : {},
    };
}

const selectedFor = (c: Case) => AGENTS.flatMap((_, i) => (c.excludeBeta && i === 1 ? [] : [schemaOf(i)]));
const label = (c: Case) => `${c.n} target${c.emptyTarget ? ' (l\'ultimo senza suffisso)' : ''}, `
    + `publish ${c.publishDiffers ? 'diverso' : 'uguale'}, ${c.excludeBeta ? 'beta escluso' : 'nessun escluso'}, `
    + `${c.exception ? 'eccezione su alpha' : 'nessuna eccezione'}`;

function installSource(dev: FakeDev) {
    // L'export legge la versione che DEV ha NEL MOMENTO in cui parte
    source.make = managed => {
        dev.events.push('export');
        return makePackage(specFor(managed, dev.versionOf('testSolution')));
    };
}

describe('matrice del motore a piu\' Target (48 casi)', () => {
    for (const c of CASES) {
        it(label(c), async () => {
            const dev = newDev();
            installSource(dev);
            const targets = targetsFor(c);
            const r = await runPackagingTargets('testSolution', targets, selectedFor(c), optionsFor(c));

            // FR-008, FR-009: un solo export (due letture: managed e unmanaged), una sola scrittura di versione, prima dell'export
            expect(source.exports, 'exportPair chiamato una volta').toBe(1);
            expect(dev.writes.map(w => w.version), 'versione scritta una volta').toEqual([NEW_VERSION]);
            expect(dev.events).toEqual([`write testSolution ${NEW_VERSION}`, 'export', 'export']);
            expect(r.versionChange).toEqual({ from: START, to: NEW_VERSION, changed: true });

            // FR-010: ogni Target verificato; il risultato e' valido solo se lo sono tutti
            expect(r.valid).toBe(true);
            expect(r.targets.map(t => t.target.name)).toEqual(targets.map(t => t.name));
            expect(r.targets.every(t => t.valid)).toBe(true);

            const original = packageFiles(specFor(true, NEW_VERSION));
            const originalUn = packageFiles(specFor(false, NEW_VERSION));

            r.targets.forEach((tr, ti) => {
                const exp = expectedFor(c, targets[ti]!);
                for (const [kind, built, orig] of [['managed', tr.managed, original], ['unmanaged', tr.unmanaged, originalUn]] as const) {
                    const produced = readEntries(built.bytes);
                    expect(Object.keys(produced).sort(), `${kind} #${ti}: elenco entry`).toEqual(Object.keys(orig).sort());
                    for (const path of Object.keys(orig)) {
                        const was = orig[path]!;
                        const now = produced[path]!;
                        const bot = /^bots\/([^/]+)\/bot\.xml$/.exec(path);
                        const cfg = /^bots\/([^/]+)\/configuration\.json$/.exec(path);
                        if (bot) {
                            const i = Number(bot[1]!.replace('ava_a', '')) - 1;
                            expect(dec(now), `${kind} #${ti} ${path}`).toBe(
                                dec(was).replace(/<name>[^<]*<\/name>/, `<name>${esc(exp[i]!.name)}</name>`));
                        } else if (cfg) {
                            const i = Number(cfg[1]!.replace('ava_a', '')) - 1;
                            if (exp[i]!.publish !== AGENTS[i]!.publish) {
                                expect(JSON.parse(dec(now)), `${kind} #${ti} ${path}`).toEqual(
                                    { ...(JSON.parse(dec(was)) as object), publishOnImport: exp[i]!.publish });
                            } else {
                                expect(now, `${kind} #${ti} ${path}: invariata`).toEqual(was);
                            }
                        } else {
                            expect(now, `${kind} #${ti} ${path}: byte-identica`).toEqual(was);
                        }
                    }
                }
                // riletto come farebbe un import
                readPackage(tr.managed.bytes).agents.forEach(a => {
                    const i = Number(a.schemaName.replace('ava_a', '')) - 1;
                    expect(a.name, `#${ti} nome riletto di ${a.schemaName}`).toBe(exp[i]!.name);
                    expect(a.publishOnImport, `#${ti} publish riletto di ${a.schemaName}`).toBe(exp[i]!.publish);
                });
            });

            // FR-013: il primo e' il riferimento; gli altri differiscono solo nei nomi e nel publish
            expect(r.targets[0]!.comparison).toBeNull();
            const total = Object.keys(original).length;
            const first = expectedFor(c, targets[0]!);
            r.targets.slice(1).forEach((tr, k) => {
                const other = expectedFor(c, targets[k + 1]!);
                const expectedDiff: { path: string; kind: string }[] = [];
                AGENTS.forEach((_, i) => {
                    if (first[i]!.name !== other[i]!.name) expectedDiff.push({ path: `bots/${schemaOf(i)}/bot.xml`, kind: 'agent-name' });
                    if (first[i]!.publish !== other[i]!.publish) expectedDiff.push({ path: `bots/${schemaOf(i)}/configuration.json`, kind: 'publish-on-import' });
                });
                expectedDiff.sort((p, q) => p.path.localeCompare(q.path));
                expect(tr.comparison, `confronto di #${k + 1}`).toEqual({
                    against: targets[0]!.name, differing: expectedDiff,
                    identicalEntries: total - expectedDiff.length, unexpected: [],
                });
            });
        });
    }
});

describe('un Target solo equivale a runPackaging (FR-006)', () => {
    it('stesso contenuto, stesso piano, stessa versione scritta', async () => {
        for (const c of CASES.filter(x => x.n === 1)) {
            const devA = newDev();
            installSource(devA);
            const multi = await runPackagingTargets('testSolution', targetsFor(c), selectedFor(c), optionsFor(c));
            const devB = newDev();
            installSource(devB);
            const one = await runPackaging('testSolution', targetsFor(c)[0]!.name, selectedFor(c),
                { ...optionsFor(c), publishOnImport: targetsFor(c)[0]!.publishOnImport });
            const t = multi.targets[0]!;
            expect(readEntries(t.managed.bytes), label(c)).toEqual(readEntries(one.managed.bytes));
            expect(readEntries(t.unmanaged.bytes), label(c)).toEqual(readEntries(one.unmanaged.bytes));
            expect(t.plan, label(c)).toEqual(one.plan);
            expect(devA.writes.map(w => w.version)).toEqual(devB.writes.map(w => w.version));
            expect(multi.valid && one.valid).toBe(true);
        }
    });
});

describe('negativi', () => {
    const opts: PackagingOptions = { ...DEFAULT_OPTIONS, newVersion: NEW_VERSION };
    const all = AGENTS.map((_, i) => schemaOf(i));

    it('nessun Target: rifiutato, senza esportare e senza scrivere la versione', async () => {
        const dev = newDev();
        installSource(dev);
        await expect(runPackagingTargets('testSolution', [], all, opts)).rejects.toThrow(/At least one target/);
        expect(source.exports).toBe(0);
        expect(dev.writes).toEqual([]);
    });

    it('due Target con lo stesso nome (anche con altre maiuscole o spazi): rifiutato prima di toccare DEV', async () => {
        for (const pair of [['UAT', 'UAT'], ['UAT', 'uat'], ['UAT', ' UAT '], ['', '  ']]) {
            const dev = newDev();
            installSource(dev);
            await expect(runPackagingTargets('testSolution',
                pair.map(name => ({ name, publishOnImport: 'keep' as PublishMode })), all, opts))
                .rejects.toThrow(/same name/);
            expect(source.exports).toBe(0);
            expect(dev.writes).toEqual([]);
        }
    });

    it('un Target con una differenza inattesa rende non valido il risultato, e solo quel Target', async () => {
        const dev = newDev();
        installSource(dev);
        forced.byTarget.set('UAT', { unexpected: ['solution.xml'] });   // vale per i confronti di PROD e di HOTFIX, entrambi col primo (UAT)
        const targets: Target[] = ['UAT', 'PROD', 'HOTFIX'].map(name => ({ name, publishOnImport: 'keep' as PublishMode }));
        const r = await runPackagingTargets('testSolution', targets, all, opts);
        expect(r.valid).toBe(false);
        expect(r.targets.map(t => t.valid)).toEqual([true, false, false]);
        expect(r.targets[1]!.comparison!.unexpected).toEqual(['solution.xml']);
    });

    it('senza differenze inattese tutti i Target sono validi', async () => {
        const dev = newDev();
        installSource(dev);
        const targets: Target[] = ['UAT', 'PROD', 'HOTFIX'].map(name => ({ name, publishOnImport: 'keep' as PublishMode }));
        const r = await runPackagingTargets('testSolution', targets, all, opts);
        expect(r.valid).toBe(true);
        expect(r.targets.map(t => t.valid)).toEqual([true, true, true]);
        expect(r.targets.slice(1).every(t => t.comparison!.unexpected.length === 0)).toBe(true);
    });

    it('senza versione da alzare nessuna scrittura in DEV, con tre Target', async () => {
        const dev = newDev();
        installSource(dev);
        const targets: Target[] = ['UAT', 'PROD', 'HOTFIX'].map(name => ({ name, publishOnImport: 'keep' as PublishMode }));
        const r = await runPackagingTargets('testSolution', targets, all, { ...DEFAULT_OPTIONS, newVersion: null });
        expect(dev.writes).toEqual([]);
        expect(r.versionChange).toBeNull();
        expect(source.exports).toBe(1);
    });

    it('la versione e\' scritta in DEV una volta sola anche con tre Target (FR-009)', async () => {
        const dev = newDev();
        installSource(dev);
        const targets: Target[] = ['UAT', 'PROD', 'HOTFIX'].map(name => ({ name, publishOnImport: 'keep' as PublishMode }));
        await runPackagingTargets('testSolution', targets, all, opts);
        expect(dev.writes.length).toBe(1);
        // e ogni zip porta quella versione
        const r = await runPackagingTargets('testSolution', targets, all, opts);
        for (const t of r.targets) expect(readPackage(t.managed.bytes).version).toBe(NEW_VERSION);
    });
});
