/**
 * Spec 016 (Fase 3) — l'artifact set con piu' Target, il manifest v2 e il record di storico.
 * Oracolo scritto dalla spec e da `contracts/manifest-v2.md`: una cartella, uno zip managed per Target,
 * gli export originali una volta, un manifest con `targets[]`, un solo record di storico.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS, type PackagingOptions, type PublishMode, type Target } from '../src/types';

const source = vi.hoisted(() => ({ make: (_managed: boolean): Uint8Array => new Uint8Array() }));
vi.mock('../src/services/export', () => ({
    exportPair: async () => ({
        managed: { bytes: source.make(true), mode: 'sync' as const, seconds: 1.25 },
        unmanaged: { bytes: source.make(false), mode: 'sync' as const, seconds: 0.75 },
    }),
}));

/** Un disco finto: tiene i byte scritti, nell'ordine, e puo' rifiutare un salvataggio o dire che la cartella c'e'. */
const disk = vi.hoisted(() => ({
    writes: [] as { kind: 'binary' | 'text'; path: string; data: Uint8Array | string }[],
    dirs: [] as string[],
    existing: new Set<string>(),
    cancel: new Set<string>(),
    warned: [] as number[],
}));
vi.mock('../src/services/files', () => ({
    ensureDirectory: async (p: string) => { disk.dirs.push(p); },
    pathExists: async (p: string) => disk.existing.has(p),
    writeBinary: async (p: string, bytes: Uint8Array) => {
        if ([...disk.cancel].some(c => p.endsWith(c))) return null;
        disk.writes.push({ kind: 'binary', path: p, data: bytes });
        return p;
    },
    writeText: async (p: string, text: string) => { disk.writes.push({ kind: 'text', path: p, data: text }); },
    warnAboutDialogs: (n: number) => { disk.warned.push(n); },
}));

import { OverwriteDeclined, buildHistoryRecord, sha256, writeArtifactSet } from '../src/services/artifacts';
import { runPackagingTargets, type MultiPackagingResult } from '../src/services/packaging';
import { makePackage } from './helpers/fixture';
import { installFakeDev, makeDev } from './helpers/fake-dev';

const AGENTS = [
    { name: 'alpha [DEV]', publish: null as boolean | null },
    { name: 'beta', publish: true as boolean | null },
];

beforeEach(() => {
    disk.writes = []; disk.dirs = []; disk.existing.clear(); disk.cancel.clear(); disk.warned = [];
    installFakeDev(makeDev([{ id: 's', unique: 'testSolution', version: '1.0.0.2' }]));
    source.make = managed => makePackage({
        version: '1.0.0.2', managed,
        agents: AGENTS.map((a, i) => ({ schema: `ava_a${i + 1}`, name: a.name, publishOnImport: a.publish, connected: true, topics: 1 })),
    });
});

const t = (name: string, publishOnImport: PublishMode = 'keep'): Target => ({ name, publishOnImport });
const OPTS: PackagingOptions = { ...DEFAULT_OPTIONS };

async function run(targets: Target[], options: PackagingOptions = OPTS): Promise<MultiPackagingResult> {
    return runPackagingTargets('testSolution', targets, ['ava_a1', 'ava_a2'], options);
}
const input = (result: MultiPackagingResult, options: PackagingOptions = OPTS) => ({
    result, options, sourceEnvironmentUrl: 'DEV', user: 'me', confirmations: [],
});
const names = (written: { set: { files: { fileName: string }[] } }) => written.set.files.map(f => f.fileName).sort();

interface Mf {
    manifestVersion: number; operationId: string; options: Record<string, unknown>;
    sharedFiles: { fileName: string; role: string; sha256: string }[];
    targets: { name: string; suffix: string; order: number; options: { publishOnImport: string; publishByAgent: object };
        agents: unknown[]; files: { fileName: string; role: string; sha256: string; warning?: string }[];
        comparison: null | { against: string; differing: { path: string; kind: string }[]; identicalEntries: number; unexpected?: unknown } }[];
    [k: string]: unknown;
}

describe('cartella e file: Target × copie extra (FR-012)', () => {
    const LISTS: [string, Target[], string][] = [
        ['uno', [t('UAT')], ' [UAT]'],
        ['uno senza suffisso', [t('')], ' [no suffix]'],
        ['due', [t('UAT'), t('PROD')], ' [UAT, PROD]'],
        ['tre con uno senza suffisso', [t('UAT'), t('PROD'), t('')], ' [UAT, PROD, no suffix]'],
        ['quattro: si conta', [t('A'), t('B'), t('C'), t('D')], ' [4 targets]'],
    ];
    for (const [label, targets, tag] of LISTS) {
        for (const keep of [false, true]) {
            it(`${label}, copie extra ${keep ? 'accese' : 'spente'}`, async () => {
                const options = { ...OPTS, keepSourceArtifacts: keep };
                const written = await writeArtifactSet('C:\\out', input(await run(targets, options), options));

                // la cartella: una sola, con le etichette (fino a tre) o il conteggio
                expect(written.set.folderName.startsWith(`testSolution 1.0.0.2${tag} - `), written.set.folderName).toBe(true);
                expect(disk.dirs).toEqual([written.set.folderPath]);

                // i file: uno zip managed per Target; con le copie extra anche l'unmanaged per Target e gli originali una volta
                const wanted = targets.flatMap(x => {
                    const tag2 = x.name.trim() || 'nosuffix';
                    return [`testSolution_1_0_0_2_managed_${tag2}.zip`, ...(keep ? [`testSolution_1_0_0_2_unmanaged_${tag2}.zip`] : [])];
                });
                if (keep) wanted.push('source_managed.zip', 'source_unmanaged.zip');
                expect(names(written)).toEqual(wanted.sort());
                expect(written.complete).toBe(true);

                // i dialog di salvataggio annunciati: tanti quanti gli archivi
                expect(disk.warned).toEqual([wanted.length]);

                // il manifest, scritto per ultimo
                expect(disk.writes.at(-1)!.kind).toBe('text');
                expect(disk.writes.filter(w => w.kind === 'text').length).toBe(1);
                const mf = JSON.parse(disk.writes.at(-1)!.data as string) as Mf;
                expect(mf.manifestVersion).toBe(2);
                expect(mf.targets.map(x => x.name)).toEqual(targets.map(x => x.name));
                expect(mf.targets.map(x => x.order)).toEqual(targets.map((_, i) => i));
                expect(mf.sharedFiles.map(f => f.fileName).sort()).toEqual(keep ? ['source_managed.zip', 'source_unmanaged.zip'] : []);
                for (const target of mf.targets) {
                    const tag2 = target.suffix || 'nosuffix';
                    expect(target.files.map(f => f.fileName).sort(), `file di ${target.name}`).toEqual(
                        [`testSolution_1_0_0_2_managed_${tag2}.zip`, ...(keep ? [`testSolution_1_0_0_2_unmanaged_${tag2}.zip`] : [])].sort());
                    expect(target.files.filter(f => f.role === 'deploy').length).toBe(1);
                    expect(target.files.filter(f => f.role === 'source').every(f => !!f.warning)).toBe(true);
                }
            });
        }
    }
});

describe('manifest v2: contenuto (contracts/manifest-v2.md)', () => {
    it('niente dei campi del formato 1.x a livello alto; opzioni comuni sopra, per Target sotto', async () => {
        const options = { ...OPTS, newVersion: '1.0.0.2', keepSourceArtifacts: true, publishByAgent: { ava_a1: 'force-false' as PublishMode } };
        await writeArtifactSet('C:\\out', input(await run([t('UAT', 'force-true'), t('PROD', 'keep')], options), options));
        const mf = JSON.parse(disk.writes.at(-1)!.data as string) as Mf;
        for (const gone of ['suffix', 'agents', 'files']) expect(Object.keys(mf), `campo tolto: ${gone}`).not.toContain(gone);
        expect(mf.options).toEqual({ newVersion: '1.0.0.2', keepSourceArtifacts: true });
        expect(mf.targets[0]!.options).toEqual({ publishOnImport: 'force-true', publishByAgent: { ava_a1: 'force-false' } });
        expect(mf.targets[1]!.options).toEqual({ publishOnImport: 'keep', publishByAgent: { ava_a1: 'force-false' } });
        for (const kept of ['operationId', 'timestamp', 'user', 'notice', 'source', 'export', 'versionChange', 'fingerprint', 'drift', 'nameOccurrences', 'confirmations']) {
            expect(Object.keys(mf), `campo che resta: ${kept}`).toContain(kept);
        }
    });

    it('il confronto: il primo Target e\' il riferimento, gli altri dicono solo nomi e publish', async () => {
        const result = await run([t('UAT'), t('PROD', 'force-true')]);
        await writeArtifactSet('C:\\out', input(result));
        const mf = JSON.parse(disk.writes.at(-1)!.data as string) as Mf;
        expect(mf.targets[0]!.comparison).toBeNull();
        const cmp = mf.targets[1]!.comparison!;
        expect(cmp.against).toBe('UAT');
        expect(cmp.differing.every(d => d.kind === 'agent-name' || d.kind === 'publish-on-import')).toBe(true);
        expect(cmp.differing.length).toBeGreaterThan(0);
        expect(cmp).not.toHaveProperty('unexpected');
        expect(cmp.identicalEntries).toBe(result.targets[1]!.comparison!.identicalEntries);
    });

    it('gli hash nel manifest sono quelli dei byte scritti, e due Target con la stessa versione si distinguono', async () => {
        await writeArtifactSet('C:\\out', input(await run([t('UAT'), t('PROD')])));
        const mf = JSON.parse(disk.writes.at(-1)!.data as string) as Mf;
        for (const target of mf.targets) {
            for (const f of target.files) {
                const w = disk.writes.find(x => x.path.endsWith(f.fileName))!;
                expect(f.sha256, f.fileName).toBe(await sha256(w.data as Uint8Array));
            }
        }
        expect(mf.targets[0]!.files[0]!.sha256).not.toBe(mf.targets[1]!.files[0]!.sha256);
    });

    it('un Target senza suffisso: nome e suffisso vuoti, il file usa nosuffix', async () => {
        await writeArtifactSet('C:\\out', input(await run([t('UAT'), t('')])));
        const mf = JSON.parse(disk.writes.at(-1)!.data as string) as Mf;
        expect(mf.targets[1]).toMatchObject({ name: '', suffix: '' });
        expect(mf.targets[1]!.files[0]!.fileName).toBe('testSolution_1_0_0_2_managed_nosuffix.zip');
    });

    it('lo stesso Target scritto con spazi attorno: il nome del file e il suffisso sono ripuliti', async () => {
        await writeArtifactSet('C:\\out', input(await run([t(' UAT ')])));
        const mf = JSON.parse(disk.writes.at(-1)!.data as string) as Mf;
        expect(mf.targets[0]!.suffix).toBe('UAT');
        expect(mf.targets[0]!.files[0]!.fileName).toBe('testSolution_1_0_0_2_managed_UAT.zip');
    });
});

describe('negativi', () => {
    it('un salvataggio annullato a meta\': il set e\' incompleto e il manifest elenca solo i file scritti', async () => {
        disk.cancel.add('_managed_PROD.zip');
        const written = await writeArtifactSet('C:\\out', input(await run([t('UAT'), t('PROD')])));
        expect(written.complete).toBe(false);
        expect(names(written)).toEqual(['testSolution_1_0_0_2_managed_UAT.zip']);
        const mf = JSON.parse(disk.writes.at(-1)!.data as string) as Mf;
        expect(mf.targets[0]!.files.length).toBe(1);
        expect(mf.targets[1]!.files).toEqual([]);
    });

    it('la cartella esiste e non si conferma: nulla viene scritto', async () => {
        const probe = await writeArtifactSet('C:\\out', input(await run([t('UAT')])));
        disk.existing.add(probe.set.folderPath);
        disk.writes = []; disk.dirs = [];
        await expect(writeArtifactSet('C:\\out', input(await run([t('UAT')])))).rejects.toBeInstanceOf(OverwriteDeclined);
        expect(disk.writes).toEqual([]);
        expect(disk.dirs).toEqual([]);
    });

    it('la cartella esiste e si conferma: si scrive', async () => {
        const probe = await writeArtifactSet('C:\\out', input(await run([t('UAT')])));
        disk.existing.add(probe.set.folderPath);
        disk.writes = [];
        const written = await writeArtifactSet('C:\\out', { ...input(await run([t('UAT')])), confirmOverwrite: async () => true });
        expect(written.complete).toBe(true);
        expect(disk.writes.length).toBeGreaterThan(0);
    });

    it('i caratteri che Windows rifiuta non entrano nel nome della cartella', async () => {
        const written = await writeArtifactSet('C:\\out', input(await run([t('A:B')])));
        expect(written.set.folderName).not.toMatch(/[:*?"<>|]/);
    });
});

describe('record di storico: uno per operazione (FR-014)', () => {
    async function record(targets: Target[], extra: Partial<{ complete: boolean }> = {}) {
        const options = { ...OPTS, keepSourceArtifacts: true };
        const result = await run(targets, options);
        const written = await writeArtifactSet('C:\\out', input(result, options));
        if (extra.complete === false) written.complete = false;
        return { rec: buildHistoryRecord({ written, result, options, user: 'me', sourceEnvironmentUrl: 'DEV', confirmations: [] }), written, result };
    }

    it('un solo record con un elemento per Target, con i suoi file e il suo esito', async () => {
        const { rec, written } = await record([t('UAT', 'force-true'), t('PROD')]);
        expect(rec.id).toBe(written.set.folderName);
        expect(rec.targets!.map(x => x.name)).toEqual(['UAT', 'PROD']);
        expect(rec.targets!.map(x => x.publishOnImport)).toEqual(['force-true', 'keep']);
        expect(rec.targets!.every(x => x.valid)).toBe(true);
        expect(rec.targets![0]!.files.map(f => f.fileName).sort()).toEqual(
            ['testSolution_1_0_0_2_managed_UAT.zip', 'testSolution_1_0_0_2_unmanaged_UAT.zip']);
        expect(rec.files.length).toBe(written.set.files.length);
        expect(rec.status).toBe('ok');
    });

    it('i campi di sempre sono quelli del primo Target, cosi\' i record nuovi si leggono come i vecchi', async () => {
        const { rec, result } = await record([t('UAT', 'force-true'), t('PROD')]);
        expect(rec.suffix).toBe('UAT + PROD');
        expect(rec.options.publishOnImport).toBe('force-true');
        expect(rec.verification).toEqual({ managed: result.targets[0]!.managed.verification, unmanaged: result.targets[0]!.unmanaged.verification });
        expect(rec.agents.map(a => a.after)).toEqual(['alpha [UAT]', 'beta [UAT]']);
    });

    it('un Target solo: il suffisso com\'e\' (anche vuoto, come prima)', async () => {
        expect((await record([t('UAT')])).rec.suffix).toBe('UAT');
        expect((await record([t('')])).rec.suffix).toBe('');
    });

    it('piu\' Target con uno senza suffisso: si legge "no suffix"', async () => {
        expect((await record([t('UAT'), t('')])).rec.suffix).toBe('UAT + no suffix');
    });

    it('uno dei Target non valido resta non valido nel record', async () => {
        const options = { ...OPTS, keepSourceArtifacts: false };
        const result = await run([t('UAT'), t('PROD'), t('HOTFIX')], options);
        result.targets[1]!.valid = false;
        const written = await writeArtifactSet('C:\out', input(result, options));
        const rec = buildHistoryRecord({ written, result, options, user: 'me', sourceEnvironmentUrl: 'DEV', confirmations: [] });
        expect(rec.targets!.map(x => x.valid)).toEqual([true, false, true]);
    });

    it('un salvataggio incompleto: stato failed', async () => {
        expect((await record([t('UAT')], { complete: false })).rec.status).toBe('failed');
    });

    it('il record non porta byte, solo nomi e hash', async () => {
        const { rec } = await record([t('UAT'), t('PROD')]);
        const dump = JSON.stringify(rec);
        expect(dump.length).toBeLessThan(20000);
        expect(dump).not.toContain('"bytes"');
    });
});
