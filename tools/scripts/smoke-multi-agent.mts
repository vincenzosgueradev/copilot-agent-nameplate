/**
 * Smoke check del caso a piu' agent nella stessa solution (FR-023, FR-076, FR-096).
 *
 *   npx tsx scripts/smoke-multi-agent.mts <zip>
 *
 * Con un export a **due agent** (quello vero) li usa cosi' come sono. Con un export a un
 * agent ne clona uno, per coprire almeno il percorso del patch. Verifica che:
 *  - con entrambi selezionati ricevano lo stesso suffisso;
 *  - escludendone uno, quello escluso resti byte-identico e `agentOutcomes` lo dichiari;
 *  - un agent creato gia' con il suffisso (il suo componente GPT porta `[DEV]`) non produca
 *    occorrenze impreviste ne' scostamenti di formato spuri;
 *  - un display name in un posto davvero sconosciuto venga ancora segnalato.
 */

import { readFileSync } from 'node:fs';
import { unzipSync, zipSync } from 'fflate';
import { DOMParser as XmlDomParser } from '@xmldom/xmldom';

(globalThis as unknown as { DOMParser: unknown }).DOMParser = XmlDomParser;

const { readPackage, splitSuffix } = await import('../src/services/package.js');
const { buildPatchPlan, applyPatch, agentOutcomes } = await import('../src/services/patch.js');
const { DEFAULT_OPTIONS } = await import('../src/types.js');

const zipPath = process.argv[2];
if (!zipPath) { console.error('uso: tsx scripts/smoke-multi-agent.mts <zip>'); process.exit(2); }

const dec = new TextDecoder(), enc = new TextEncoder();
const fail = (m: string): never => { console.error(`FALLITO — ${m}`); process.exit(1); };
const nameRe = /<name>[^<]*<\/name>/;
const files = unzipSync(new Uint8Array(readFileSync(zipPath)));
const botPaths = Object.keys(files).filter(p => /^bots\/[^/]+\/bot\.xml$/.test(p)).sort();

if (botPaths.length === 1) {
    // Un solo agent: ne clono un secondo, con il nome gia' suffissato come lo crea Copilot Studio
    const src = botPaths[0]!;
    const schema = src.split('/')[1]!;
    const clone = 'ava_agenteTool2';
    files[`bots/${clone}/bot.xml`] = enc.encode(
        dec.decode(files[src]!).replace(`schemaname="${schema}"`, `schemaname="${clone}"`)
            .replace(nameRe, '<name>agenteTool2 [DEV]</name>'));
    files[`bots/${clone}/configuration.json`] = files[`bots/${schema}/configuration.json`]!;
    console.log('export a un agent: ne ho clonato un secondo');
} else {
    // Export gia' patchato: riporto i display name allo stato in cui Dataverse li ha esportati,
    // cioe' quello del componente GPT dell'agent (creato con lo stesso nome intero)
    for (const bot of botPaths) {
        const schema = bot.split('/')[1]!;
        const gpt = `botcomponents/${schema}.gpt.default/botcomponent.xml`;
        const gptName = files[gpt] ? nameRe.exec(dec.decode(files[gpt]))?.[0] : undefined;
        const current = nameRe.exec(dec.decode(files[bot]!))?.[0];
        if (gptName && splitSuffix(gptName.replace(/<\/?name>/g, '')).currentSuffix && gptName !== current) {
            files[bot] = enc.encode(dec.decode(files[bot]!).replace(nameRe, gptName));
            console.log(`ripristinato il nome originale di ${schema}: ${gptName}`);
        }
    }
}

const pkg = readPackage(zipSync(files));
if (pkg.agents.length < 2) fail(`attesi almeno 2 agent, trovati ${pkg.agents.length}`);
console.log('agent:', pkg.agents.map(a => a.name).join(' | '));

// 1. suffisso uniforme
const all = pkg.agents.map(a => a.schemaName);
const planAll = buildPatchPlan(pkg, 'UAT', all, DEFAULT_OPTIONS);
const names = planAll.filter(c => c.element === 'name').map(c => c.after);
console.log('tutti selezionati :', names.join(' | '));
if (!names.every(n => n.endsWith(' [UAT]')) || names.length !== all.length) fail('suffisso non uniforme');

// 2. esclusione: l'agent escluso resta com'e' e il manifest lo dichiara
const keep = all[0]!;
const planOne = buildPatchPlan(pkg, 'UAT', all.slice(1), DEFAULT_OPTIONS);
const out = agentOutcomes(pkg, planOne);
console.log('uno escluso       :', out.map(o => `${o.schemaName}${o.excluded ? ' (escluso)' : ` -> ${o.after}`}`).join(' | '));
const kept = out.find(o => o.schemaName === keep)!;
if (!kept.excluded || kept.after !== kept.before) fail("l'agent escluso non risulta invariato");
const { patchedPaths } = applyPatch(pkg, planOne);
if (patchedPaths.some(p => p.includes(`/${keep}/`))) fail("l'agent escluso e' stato toccato");

// 2b. publishOnImport per agent (FR-090a): l'eccezione di un agent batte il valore per tutti
const [a1, a2] = pkg.agents as [typeof pkg.agents[number], typeof pkg.agents[number]];
const publishChanges = (plan: ReturnType<typeof buildPatchPlan>) =>
    plan.filter(c => c.element === 'publishOnImport');
const opposite = (v: boolean | null) => v === true ? 'force-false' as const : 'force-true' as const;

// valore per tutti = "lascia", eccezione solo su a2 che cambia il suo valore
const t1 = publishChanges(buildPatchPlan(pkg, 'UAT', all,
    { ...DEFAULT_OPTIONS, publishByAgent: { [a2.schemaName]: opposite(a2.publishOnImport) } }));
console.log(`eccezione su a2    : ${t1.map(c => `${c.file} -> ${c.after}`).join(' | ')}`);
if (t1.length !== 1 || t1[0]!.file !== a2.file.replace(/bot\.xml$/, 'configuration.json')) {
    fail("un'eccezione su un agent deve cambiare solo quell'agent");
}

// valore per tutti che cambierebbe a1, ma a1 ha l'eccezione "lascia": a1 non si tocca
const t2 = publishChanges(buildPatchPlan(pkg, 'UAT', all,
    { ...DEFAULT_OPTIONS, publishOnImport: opposite(a1.publishOnImport),
      publishByAgent: { [a1.schemaName]: 'keep' } }));
console.log(`a1 "lascia", gli altri seguono: ${t2.map(c => `${c.file} -> ${c.after}`).join(' | ') || 'nessun cambio'}`);
if (t2.some(c => c.file === a1.file.replace(/bot\.xml$/, 'configuration.json'))) {
    fail("l'agent con l'eccezione \"lascia\" e' stato toccato");
}

// un agent escluso non riceve nemmeno il suo publishOnImport
const t3 = publishChanges(buildPatchPlan(pkg, 'UAT', [a2.schemaName],
    { ...DEFAULT_OPTIONS, publishOnImport: opposite(a1.publishOnImport) }));
if (t3.some(c => c.file.includes(`/${a1.schemaName}/`))) fail("un agent escluso ha ricevuto publishOnImport");

// 2c. fino in fondo: valori diversi per agent, scritti nello zip e riletti da un package nuovo
{
    const { buildZip, verifyZip } = await import('../src/services/rezip.js');
    const want = { [a1.schemaName]: 'force-false', [a2.schemaName]: 'force-true' } as const;
    const plan = buildPatchPlan(pkg, 'UAT', all, { ...DEFAULT_OPTIONS, publishByAgent: want });
    const applied = applyPatch(pkg, plan);
    const zip = buildZip(applied.files);
    const expectedNames: Record<string, string> = {};
    for (const c of plan) if (c.element === 'name') expectedNames[c.file] = c.after;
    const v = verifyZip(zip, pkg, expectedNames, applied.patchedPaths,
        { publish: Object.fromEntries(plan.filter(c => c.element === 'publishOnImport').map(c => [c.file, c.after === 'true'])) });
    if (!v.archiveReadable || !v.entryCountMatches || !v.patchedValuesConfirmed) {
        fail('lo zip con publish diversi per agent non supera la verifica');
    }
    const back = readPackage(zip);
    const got = Object.fromEntries(back.agents.map(a => [a.schemaName, a.publishOnImport]));
    console.log(`riletto dallo zip : ${a1.schemaName}=${got[a1.schemaName]} | ${a2.schemaName}=${got[a2.schemaName]}`);
    if (got[a1.schemaName] !== false || got[a2.schemaName] !== true) {
        fail('i publishOnImport riletti dallo zip non corrispondono a quelli scelti per agent');
    }
    // il resto della configurazione di ogni agent non si e' mosso: solo publishOnImport
    for (const a of pkg.agents) {
        const path = a.file.replace(/bot\.xml$/, 'configuration.json');
        const before = JSON.parse(dec.decode(files[path]!)) as Record<string, unknown>;
        const after = JSON.parse(dec.decode(applied.files[path]!)) as Record<string, unknown>;
        const diff = [...new Set([...Object.keys(before), ...Object.keys(after)])]
            .filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
        if (diff.some(k => k !== 'publishOnImport')) fail(`${path}: cambiate altre chiavi: ${diff.join(', ')}`);
    }
    console.log('scritto nello zip : valori per agent corretti, nessun\'altra chiave cambiata, verifica ok');
}

// 3. nessun falso allarme sul caso reale
const unexpected = pkg.nameOccurrences.filter(o => !o.expected);
console.log(`occorrenze nome   : ${pkg.nameOccurrences.length} trovate, ${unexpected.length} impreviste`);
if (unexpected.length) fail(`occorrenze impreviste: ${unexpected.map(o => o.file).join(', ')}`);
const spurious = pkg.drift.filter(d => /channels|isLightweightBot/.test(d.what));
console.log(`scostamenti       : ${pkg.drift.length} (${spurious.length} su channels/isLightweightBot)`);
if (spurious.length) fail(`scostamenti spuri: ${spurious.map(d => d.what).join('; ')}`);

// 4. la rete di sicurezza funziona ancora: un nome in un posto sconosciuto va segnalato
const topic = Object.keys(files).find(p => /^botcomponents\/[^/]+\.topic\.[^/]+\/botcomponent\.xml$/.test(p));
if (!topic) fail('nessun topic su cui provare il caso negativo');
const poisoned = { ...files };
poisoned[topic!] = enc.encode(dec.decode(files[topic!]!).replace(nameRe, `<name>${pkg.agents[0]!.name}</name>`));
const probe = readPackage(zipSync(poisoned));
const caught = probe.nameOccurrences.filter(o => !o.expected && o.file === topic);
console.log(`caso negativo     : ${caught.length} occorrenza imprevista segnalata in ${topic}`);
if (caught.length !== 1) fail('un nome in un posto sconosciuto non e\' stato segnalato');

console.log('OK — suffisso uniforme, esclusione e publish per agent rispettati, nessun falso allarme, rete di sicurezza attiva');
