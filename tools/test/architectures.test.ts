/**
 * Spec 009 — due architetture di agent (standard e GitHub Copilot harness).
 *
 * Il formato del package non e' un contratto: ogni architettura scrive chiavi sue in
 * `configuration.json`. Il controllo confronta ogni agent con il baseline **della sua**
 * architettura, quindi un package legittimo non produce avvisi, mentre una chiave davvero
 * fuori posto (o un'architettura mai vista) si segnala ancora.
 */

import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, zipSync } from 'fflate';
import { applyPatch, buildPatchPlan } from '../src/services/patch';
import { readPackage } from '../src/services/package';
import { detectDrift } from '../src/services/compat';
import { DEFAULT_OPTIONS, type FormatFingerprint } from '../src/types';
import { packageFiles, type AgentSpec, type PackageSpec } from './helpers/fixture';
import { cartesian } from './helpers/combinatorics';
import { expectedName } from './helpers/oracle';

const agent = (i: number, over: Partial<AgentSpec> = {}): AgentSpec => ({
    schema: `ava_a${i}`, name: `agent${i} [DEV]`, publishOnImport: null, topics: 1, ...over,
});
const harness = (i: number, over: Partial<AgentSpec> = {}) => agent(i, { architecture: 'harness', ...over });

const zipOf = (spec: PackageSpec, mutate?: (f: Record<string, Uint8Array>) => void) => {
    const files = packageFiles(spec);
    mutate?.(files);
    return zipSync(files);
};
const setConfig = (schema: string, edit: (cfg: Record<string, unknown>) => void) =>
    (f: Record<string, Uint8Array>) => {
        const path = `bots/${schema}/configuration.json`;
        const cfg = JSON.parse(strFromU8(f[path]!)) as Record<string, unknown>;
        edit(cfg);
        f[path] = strToU8(JSON.stringify(cfg, null, 2));
    };
const drift = (spec: PackageSpec, mutate?: (f: Record<string, Uint8Array>) => void) =>
    readPackage(zipOf(spec, mutate)).drift.map(d => d.what);

const HARNESS = 'configuration.json keys (GitHub Copilot harness agent)';
const STANDARD = 'configuration.json keys (standard agent)';

describe('nessun falso allarme: ogni combinazione di architettura, canali e publishOnImport', () => {
    const perAgent = [['standard', 'harness'] as const, [true, false], [null, true, false]] as const;
    for (const n of [1, 2, 3]) {
        it(`${n} agent`, () => {
            const dims = Array.from({ length: n }, () => perAgent).flat() as unknown as readonly (readonly unknown[])[];
            let count = 0;
            for (const combo of cartesian(dims)) {
                const agents = Array.from({ length: n }, (_, i) => agent(i + 1, {
                    architecture: combo[i * 3] as 'standard' | 'harness',
                    connected: combo[i * 3 + 1] as boolean,
                    publishOnImport: combo[i * 3 + 2] as boolean | null,
                }));
                const pkg = readPackage(zipOf({ agents }));
                const where = JSON.stringify(agents.map(a => [a.architecture, a.connected, a.publishOnImport]));
                expect(pkg.drift, `scostamenti spuri: ${where}`).toEqual([]);
                expect(pkg.nameOccurrences.filter(o => !o.expected), `occorrenze spurie: ${where}`).toEqual([]);
                count++;
            }
            expect(count).toBe(dims.reduce((k, d) => k * d.length, 1));
        });
    }

    it('le chiavi si raggruppano per architettura e restano unite nell\'elenco generale', () => {
        const pkg = readPackage(zipOf({ agents: [agent(1), harness(2)] }));
        const by = pkg.fingerprint.configurationByArchitecture!;
        expect(Object.keys(by).sort()).toEqual(['CLICopilotRecognizer', 'GenerativeAIRecognizer']);
        expect(by.CLICopilotRecognizer).toContain('agentSettings');
        expect(by.GenerativeAIRecognizer).not.toContain('agentSettings');
        expect(pkg.fingerprint.configurationKeys).toEqual([...new Set([...by.CLICopilotRecognizer!, ...by.GenerativeAIRecognizer!])].sort());
    });
});

describe('gli elementi si leggono da tutti i file, non dal primo', () => {
    it('un harness davanti a un agent standard non toglie <name> dai componenti', () => {
        for (const agents of [[harness(1), agent(2)], [agent(1), harness(2)]]) {
            const pkg = readPackage(zipOf({ agents }));
            expect(pkg.fingerprint.botComponentElements).toContain('name');
            expect(pkg.fingerprint.botComponentElements).toContain('parentbotid');
        }
    });
});

describe('rete di sicurezza: ogni architettura ha il suo baseline', () => {
    it('agent harness senza una chiave obbligatoria → segnalata', () => {
        expect(drift({ agents: [harness(1)] }, setConfig('ava_a1', c => { delete c.agentSettings; })))
            .toEqual([`${HARNESS}: disappeared "agentSettings"`]);
    });

    it('agent harness con una chiave sconosciuta → segnalata, col nome dell\'architettura', () => {
        expect(drift({ agents: [harness(1)] }, setConfig('ava_a1', c => { c.newThing = 1; })))
            .toEqual([`${HARNESS}: appeared "newThing"`]);
    });

    it('le chiavi dell\'harness NON sono accettate in un agent standard (il baseline non si mescola)', () => {
        expect(drift({ agents: [agent(1)] }, setConfig('ava_a1', c => { c.agentSettings = {}; })))
            .toEqual([`${STANDARD}: appeared "agentSettings"`]);
    });

    it('una chiave di un agent standard non e\' accettata in un harness', () => {
        expect(drift({ agents: [harness(1)] }, setConfig('ava_a1', c => { c.gPTSettings = {}; })))
            .toEqual([`${HARNESS}: appeared "gPTSettings"`]);
    });

    it('in un package misto si segnala solo l\'architettura che si scosta', () => {
        expect(drift({ agents: [agent(1), harness(2)] }, setConfig('ava_a2', c => { c.newThing = 1; })))
            .toEqual([`${HARNESS}: appeared "newThing"`]);
        expect(drift({ agents: [agent(1), harness(2)] }, setConfig('ava_a1', c => { c.newThing = 1; })))
            .toEqual([`${STANDARD}: appeared "newThing"`]);
    });

    it('un\'architettura mai vista: UNA riga che lo dice, non una per chiave', () => {
        const out = drift({ agents: [agent(1), harness(2)] }, setConfig('ava_a2', c => {
            c.recognizer = { $kind: 'BrandNewRecognizer' };
        }));
        expect(out).toHaveLength(1);
        expect(out[0]).toContain('unknown agent architecture "BrandNewRecognizer"');
    });

    it('senza recognizer l\'architettura e\' sconosciuta, non standard per caso', () => {
        const out = drift({ agents: [agent(1)] }, setConfig('ava_a1', c => { delete c.recognizer; }));
        expect(out).toHaveLength(1);
        expect(out[0]).toContain('unknown agent architecture "(none)"');
    });

    it('un recognizer che non e\' un oggetto vale come sconosciuto', () => {
        for (const bad of ['text', 5, null, [], {}, { $kind: '' }, { $kind: 5 }]) {
            const out = drift({ agents: [agent(1)] }, setConfig('ava_a1', c => { c.recognizer = bad; }));
            expect(out, JSON.stringify(bad)).toHaveLength(1);
            expect(out[0]).toContain('unknown agent architecture "(none)"');
        }
    });
});

describe('confronto con il packaging precedente, per architettura', () => {
    const fp = (spec: PackageSpec, mutate?: (f: Record<string, Uint8Array>) => void): FormatFingerprint =>
        readPackage(zipOf(spec, mutate)).fingerprint;
    const previousDrift = (actual: FormatFingerprint, previous: FormatFingerprint) =>
        detectDrift(actual, previous).filter(d => d.against === 'previous').map(d => d.what);

    it('stesso package → nessuna differenza', () => {
        const a = fp({ agents: [agent(1), harness(2)] });
        expect(previousDrift(a, fp({ agents: [agent(1), harness(2)] }))).toEqual([]);
    });

    it('una chiave nuova in un\'architettura → segnalata per quella architettura', () => {
        const prev = fp({ agents: [agent(1), harness(2)] });
        const now = fp({ agents: [agent(1), harness(2)] }, setConfig('ava_a2', c => { c.newThing = 1; }));
        expect(previousDrift(now, prev)).toEqual([`${HARNESS}: appeared "newThing"`]);
    });

    it('un\'architettura che prima non c\'era → una riga', () => {
        const out = previousDrift(fp({ agents: [agent(1), harness(2)] }), fp({ agents: [agent(1)] }));
        expect(out).toHaveLength(1);
        expect(out[0]).toContain('CLICopilotRecognizer');
    });

    it('una registrazione vecchia, senza chiavi per architettura, non produce rumore', () => {
        const now = fp({ agents: [agent(1), harness(2)] });
        const old = { ...fp({ agents: [agent(1)] }) };
        delete (old as Partial<FormatFingerprint>).configurationByArchitecture;
        expect(previousDrift(now, old)).toEqual([]);
    });
});

describe('il rename su un agent harness', () => {
    it('cambia solo <name> (e publishOnImport se richiesto); il resto resta identico', () => {
        const spec: PackageSpec = { agents: [agent(1), harness(2, { name: 'agent2 [DEV] GITHUB' })] };
        const pkg = readPackage(zipOf(spec));
        const plan = buildPatchPlan(pkg, 'UAT', ['ava_a1', 'ava_a2'], DEFAULT_OPTIONS);
        const { files } = applyPatch(pkg, plan);
        const before = packageFiles(spec);
        const changed = Object.keys(before).filter(p => strFromU8(files[p]!) !== strFromU8(before[p]!));
        expect(changed.sort()).toEqual(['bots/ava_a1/bot.xml', 'bots/ava_a2/bot.xml']);
        expect(strFromU8(files['bots/ava_a2/bot.xml']!)).toContain(`<name>${expectedName('agent2 [DEV] GITHUB', 'UAT', true)}</name>`);
        expect(strFromU8(files['bots/ava_a2/bot.xml']!)).toContain('<template>cliagent-1.0.0</template>');
    });

    it('con publishOnImport forzato tocca solo la chiave, anche in un harness', () => {
        const spec: PackageSpec = { agents: [harness(1, { publishOnImport: false })] };
        const pkg = readPackage(zipOf(spec));
        const plan = buildPatchPlan(pkg, 'UAT', ['ava_a1'], { ...DEFAULT_OPTIONS, publishOnImport: 'force-true' });
        const { files } = applyPatch(pkg, plan);
        const cfg = JSON.parse(strFromU8(files['bots/ava_a1/configuration.json']!)) as Record<string, unknown>;
        expect(cfg.publishOnImport).toBe(true);
        expect(cfg.recognizer).toEqual({ $kind: 'CLICopilotRecognizer' });
        expect(Object.keys(cfg).sort()).toEqual(Object.keys(JSON.parse(strFromU8(packageFiles(spec)['bots/ava_a1/configuration.json']!))).sort());
    });

    it('senza componente GPT il nome sta in un solo posto: nessuna occorrenza sconosciuta', () => {
        const pkg = readPackage(zipOf({ agents: [harness(1)] }));
        expect(pkg.nameOccurrences.filter(o => !o.expected)).toEqual([]);
        expect(pkg.nameOccurrences.filter(o => o.willBePatched)).toHaveLength(1);
    });
});
