/**
 * Smoke check del caso a due agent nella stessa solution (FR-023, FR-076).
 *
 *   npx tsx scripts/smoke-multi-agent.mts <zip-con-un-agent>
 *
 * Parte da un export reale con un agent, ne clona uno aggiungendo un secondo agent `[DEV]`
 * (stessa struttura, schemaname diverso), e verifica che:
 *  - con entrambi selezionati ricevano lo stesso suffisso;
 *  - escludendone uno, quello escluso resti byte-identico e `agentOutcomes` lo dichiari.
 */

import { readFileSync } from 'node:fs';
import { unzipSync, zipSync } from 'fflate';
import { DOMParser as XmlDomParser } from '@xmldom/xmldom';

(globalThis as unknown as { DOMParser: unknown }).DOMParser = XmlDomParser;

const { readPackage } = await import('../src/services/package.js');
const { buildPatchPlan, applyPatch, agentOutcomes } = await import('../src/services/patch.js');
const { DEFAULT_OPTIONS } = await import('../src/types.js');

const zipPath = process.argv[2];
if (!zipPath) { console.error('uso: tsx scripts/smoke-multi-agent.mts <zip>'); process.exit(2); }

const dec = new TextDecoder(), enc = new TextEncoder();
const files = unzipSync(new Uint8Array(readFileSync(zipPath)));
const src = Object.keys(files).find(p => /^bots\/[^/]+\/bot\.xml$/.test(p))!;
const schema = src.split('/')[1]!;
const clone = 'ava_agenteTool2';

// Secondo agent: bot.xml e configuration.json copiati, nome base e suffisso `[DEV]`
files[`bots/${clone}/bot.xml`] = enc.encode(
    dec.decode(files[src]!).replace(`schemaname="${schema}"`, `schemaname="${clone}"`)
        .replace(/<name>[^<]*<\/name>/, '<name>agenteTool2 [DEV]</name>'));
files[`bots/${clone}/configuration.json`] = files[`bots/${schema}/configuration.json`]!;

const pkg = readPackage(zipSync(files));
const fail = (m: string) => { console.error(`FALLITO — ${m}`); process.exit(1); };
if (pkg.agents.length !== 2) fail(`attesi 2 agent, trovati ${pkg.agents.length}`);

const all = pkg.agents.map(a => a.schemaName);
const planAll = buildPatchPlan(pkg, 'UAT', all, DEFAULT_OPTIONS);
const names = planAll.filter(c => c.element === 'name').map(c => c.after).sort();
console.log('entrambi selezionati:', names.join(' | '));
if (names.join() !== 'agenteTool1 [UAT],agenteTool2 [UAT]') fail('nomi inattesi con entrambi selezionati');

const planOne = buildPatchPlan(pkg, 'UAT', [clone], DEFAULT_OPTIONS);
const out = agentOutcomes(pkg, planOne);
console.log('uno escluso        :', out.map(o => `${o.schemaName}: ${o.after}${o.excluded ? ' (escluso)' : ''}`).join(' | '));
const kept = out.find(o => o.schemaName === schema)!;
if (!kept.excluded || kept.after !== kept.before) fail('l\'agent escluso non risulta invariato');

const { patchedPaths } = applyPatch(pkg, planOne);
if (patchedPaths.some(p => p.includes(schema))) fail('l\'agent escluso e\' stato toccato');
console.log('OK — suffisso uniforme, esclusione rispettata, escluso byte-identico');
