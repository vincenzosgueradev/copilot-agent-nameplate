/**
 * Lettura del package, impronta del formato, occorrenze del nome, errori di formato.
 *
 * Per ogni controllo ci sono sia il caso che deve passare in silenzio (nessun falso allarme)
 * sia quello che deve essere segnalato (la rete di sicurezza di FR-096 funziona ancora).
 */

import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { applyPatch, buildName, buildPatchPlan, bumpVersion } from '../src/services/patch';
import { PackageFormatError, readPackage, splitSuffix } from '../src/services/package';
import { DEFAULT_OPTIONS } from '../src/types';
import { packageFiles, type AgentSpec, type PackageSpec } from './helpers/fixture';
import { cartesian } from './helpers/combinatorics';
import { baseOf, expectedName, expectedVersion, suffixOf } from './helpers/oracle';

const agent = (i: number, over: Partial<AgentSpec> = {}): AgentSpec => ({
    schema: `ava_a${i}`, name: `agent${i} [DEV]`, publishOnImport: null, topics: 1, ...over,
});

const zipOf = (spec: PackageSpec, mutate?: (f: Record<string, Uint8Array>) => void) => {
    const files = packageFiles(spec);
    mutate?.(files);
    return zipSync(files);
};

describe('impronta del formato: nessun falso allarme su package legittimi', () => {
    // Tutte le combinazioni di: quanti agent, quali sono collegati a un canale, nome del
    // componente GPT (base o intero), publishOnImport presente o assente
    for (const n of [1, 2, 3]) {
        it(`${n} agent: ogni combinazione di collegato / GPT / publish`, () => {
            const perAgent = [[true, false], ['base', 'full'] as const, [null, true, false]] as const;
            const dims = Array.from({ length: n }, () => perAgent).flat() as unknown as readonly (readonly unknown[])[];
            let count = 0;
            for (const combo of cartesian(dims)) {
                const agents = Array.from({ length: n }, (_, i) => {
                    const connected = combo[i * 3] as boolean;
                    const gpt = combo[i * 3 + 1] as 'base' | 'full';
                    const publish = combo[i * 3 + 2] as boolean | null;
                    const a = agent(i + 1, { connected, publishOnImport: publish });
                    if (gpt === 'full') a.gptName = a.name;
                    return a;
                });
                const pkg = readPackage(zipOf({ agents }));
                const where = JSON.stringify(agents);
                expect(pkg.drift, `scostamenti spuri: ${where}`).toEqual([]);
                expect(pkg.nameOccurrences.filter(o => !o.expected), `occorrenze spurie: ${where}`).toEqual([]);
                count++;
            }
            expect(count).toBe(dims.reduce((k, d) => k * d.length, 1));
        });
    }

    it('agent con lo stesso nome nella stessa solution: nessun posto sconosciuto', () => {
        for (const name of ['same', 'same [DEV]']) {
            const pkg = readPackage(zipOf({ agents: [agent(1, { name }), agent(2, { name })] }));
            expect(pkg.nameOccurrences.filter(o => !o.expected)).toEqual([]);
        }
    });

    it('le chiavi di formato si leggono da tutti gli agent, in qualunque ordine', () => {
        // a1 senza canali (mai collegato), a2 completo, e viceversa: stesso esito
        const a = readPackage(zipOf({ agents: [agent(1, { connected: false }), agent(2)] }));
        const b = readPackage(zipOf({ agents: [agent(1), agent(2, { connected: false })] }));
        expect(a.fingerprint.configurationKeys).toEqual(b.fingerprint.configurationKeys);
        expect(a.fingerprint.configurationKeys).toContain('channels');
    });

    it('una chiave sparisce solo se manca in TUTTI gli agent', () => {
        const pkg = readPackage(zipOf({ agents: [agent(1, { connected: false }), agent(2, { connected: false })] }));
        // channels e isLightweightBot sono opzionali: assenti ovunque non e' uno scostamento
        expect(pkg.drift).toEqual([]);
        expect(pkg.fingerprint.configurationKeys).not.toContain('channels');
    });
});

describe('rete di sicurezza: un display name in un posto sconosciuto va segnalato', () => {
    const display = 'agent1 [DEV]';
    const unknownPlaces: [string, (f: Record<string, Uint8Array>) => void, string][] = [
        ['<name> di un topic', f => {
            f['botcomponents/ava_a1.topic.Topic1/botcomponent.xml'] = strToU8(
                '<botcomponent schemaname="x"><name>agent1 [DEV]</name></botcomponent>');
        }, 'botcomponents/ava_a1.topic.Topic1/botcomponent.xml'],
        ['<description> di un componente', f => {
            f['botcomponents/ava_a1.topic.Topic1/botcomponent.xml'] = strToU8(
                '<botcomponent schemaname="x"><description>agent1 [DEV]</description></botcomponent>');
        }, 'botcomponents/ava_a1.topic.Topic1/botcomponent.xml'],
        ['valore JSON in un file nuovo', f => {
            f['bots/ava_a1/extra.json'] = strToU8('{"displayName": "agent1 [DEV]"}');
        }, 'bots/ava_a1/extra.json'],
        ['<name> di un file in una cartella sconosciuta', f => {
            f['strange/item.xml'] = strToU8('<item><name>agent1 [DEV]</name></item>');
        }, 'strange/item.xml'],
    ];
    for (const [label, mutate, file] of unknownPlaces) {
        it(`segnala: ${label}`, () => {
            const pkg = readPackage(zipOf({ agents: [agent(1)] }, mutate));
            const unexpected = pkg.nameOccurrences.filter(o => !o.expected);
            expect(unexpected.map(o => o.file), label).toEqual([file]);
            expect(unexpected[0]!.value).toBe(display);
        });
    }

    it('non segnala una semplice sottostringa del nome', () => {
        const pkg = readPackage(zipOf({ agents: [agent(1)] }, f => {
            f['botcomponents/ava_a1.topic.Topic1/botcomponent.xml'] = strToU8(
                '<botcomponent schemaname="x"><name>agent1 [DEV] extended</name><description>the agent1 [DEV] one</description></botcomponent>');
        }));
        expect(pkg.nameOccurrences.filter(o => !o.expected)).toEqual([]);
    });
});

describe('errori di formato: ci si ferma, non si indovina', () => {
    it('package senza agent', () => {
        expect(() => readPackage(zipOf({ agents: [] }))).toThrow(PackageFormatError);
    });
    it('senza solution.xml', () => {
        expect(() => readPackage(zipOf({ agents: [agent(1)] }, f => { delete f['solution.xml']; })))
            .toThrow(PackageFormatError);
    });
    it('bot.xml senza <name>', () => {
        expect(() => readPackage(zipOf({ agents: [agent(1)] }, f => {
            f['bots/ava_a1/bot.xml'] = strToU8('<bot schemaname="ava_a1"><language>1033</language></bot>');
        }))).toThrow(PackageFormatError);
    });
    it('bot.xml con due <name>: la patch si rifiuta di scegliere', () => {
        const pkg = readPackage(zipOf({ agents: [agent(1)] }, f => {
            f['bots/ava_a1/bot.xml'] = strToU8(
                '<bot schemaname="ava_a1"><name>agent1 [DEV]</name><name>second</name></bot>');
        }));
        const plan = buildPatchPlan(pkg, 'UAT', ['ava_a1'], DEFAULT_OPTIONS);
        expect(() => applyPatch(pkg, plan)).toThrow(PackageFormatError);
    });
    it('configuration.json illeggibile: publishOnImport "non specificato", niente crash', () => {
        const pkg = readPackage(zipOf({ agents: [agent(1)] }, f => {
            f['bots/ava_a1/configuration.json'] = strToU8('{ not json');
        }));
        expect(pkg.agents[0]!.publishOnImport).toBeNull();
        expect(pkg.agents[0]!.channels).toEqual([]);
    });
    it('configuration.json che non e\' un oggetto non produce chiavi', () => {
        for (const body of ['[]', '42', 'null', '"text"']) {
            const pkg = readPackage(zipOf({ agents: [agent(1)] }, f => {
                f['bots/ava_a1/configuration.json'] = strToU8(body);
            }));
            expect(pkg.fingerprint.configurationKeys, body).toEqual([]);
        }
    });
});

describe('inventario del package', () => {
    it('componenti di tutti gli agent sono "dell\'agent", le altre cartelle no', () => {
        const pkg = readPackage(zipOf({
            agents: [agent(1), agent(2), agent(3)], extraFolders: ['workflows/', 'canvasapps/', 'weird/'], withEnvVar: true,
        }));
        const byPath = Object.fromEntries(pkg.inventory.map(c => [c.path, c]));
        expect(byPath['bots/']!.relatedToSelectedAgent).toBe(true);
        expect(byPath['botcomponents/']!.relatedToSelectedAgent).toBe(true);
        expect(byPath['workflows/']!.relatedToSelectedAgent).toBe(false);
        expect(byPath['canvasapps/']!.kind).toBe('Canvas app');
        expect(byPath['weird/']!.kind).toMatch(/^Sconosciuto/);
        expect(byPath['bots/']!.count).toBe(3);
        expect(pkg.suffixVariable?.schemaName).toBe('ava_Suffix');
    });
    it('un componente di un agent che non c\'e\' tra quelli del package rende la cartella "extra"', () => {
        const pkg = readPackage(zipOf({ agents: [agent(1)] }, f => {
            f['botcomponents/other_x.topic.Foo/botcomponent.xml'] = strToU8('<botcomponent/>');
        }));
        expect(pkg.inventory.find(c => c.path === 'botcomponents/')!.relatedToSelectedAgent).toBe(false);
    });
});

describe('suffisso e versione: casi limite', () => {
    const TRICKY = [
        'alpha', 'alpha [DEV]', 'alpha[DEV]', '[DEV]', ' [DEV]', 'alpha [DEV] ', 'alpha [DEV][UAT]',
        'alpha []', 'alpha [é]', 'alpha [a b]', 'alpha [[x]', 'alpha [x]]', 'alpha  [DEV]',
        'a [b] [c] [d]', 'alpha [exactlytwentycharsxx]', 'alpha [exactlytwentyonecharsxx]', '',
        'alpha\t[DEV]', 'alpha [dev]', 'Ünï [DEV]',
    ];
    it('splitSuffix e buildName coincidono con l\'oracolo su nomi insoliti', () => {
        for (const name of TRICKY) {
            expect(splitSuffix(name).baseName, `base di "${name}"`).toBe(baseOf(name));
            expect(splitSuffix(name).currentSuffix, `suffisso di "${name}"`).toBe(suffixOf(name));
            for (const suffix of ['', 'UAT', '  X  ', 'a&b']) {
                expect(buildName(name, suffix), `"${name}" + "${suffix}"`).toBe(expectedName(name, suffix, true));
            }
        }
    });
    it('suffisso con soli spazi equivale a nessun suffisso', () => {
        expect(buildName('alpha [DEV]', '   ')).toBe('alpha');
        expect(buildName('alpha', '   ')).toBe('alpha');
    });
    it('bumpVersion coincide con l\'oracolo', () => {
        for (const v of ['1.0.0.2', '1.0.0.9', '1.0.0.99', '1', '9', '2.5', '1.0.x', 'abc', '1.0.0.0']) {
            expect(bumpVersion(v), v).toBe(expectedVersion(v, true));
        }
        expect(bumpVersion('1.0.0.9')).toBe('1.0.0.10');
        expect(bumpVersion('1.0.x')).toBe('1.0.x');
    });
});
