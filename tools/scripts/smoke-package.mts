/**
 * Smoke check della catena di packaging, su un export **reale**.
 *
 *   npx tsx scripts/smoke-package.ts <percorso-zip> [suffisso]
 *
 * Non è un test automatico nel senso della spec (la validazione è quella di quickstart.md):
 * è il controllo dell'invariante che regge tutto, cioè che il patch tocchi **un solo
 * elemento** e lasci ogni altra entry byte-identica (SC-008). Gira in Node, quindi serve un
 * DOMParser: `@xmldom/xmldom`, solo come devDependency, mai nel bundle.
 */

import { readFileSync } from 'node:fs';
import { DOMParser as XmlDomParser } from '@xmldom/xmldom';

// Il codice del tool gira nel browser e usa DOMParser globale.
(globalThis as unknown as { DOMParser: unknown }).DOMParser = XmlDomParser;

const { readPackage } = await import('../src/services/package.js');
const { buildPatchPlan, applyPatch } = await import('../src/services/patch.js');
const { buildZip, verifyZip, describeVerification } = await import('../src/services/rezip.js');
const { DEFAULT_OPTIONS } = await import('../src/types.js');

const zipPath = process.argv[2];
const suffix = process.argv[3] ?? 'UAT';
if (!zipPath) {
    console.error('uso: tsx scripts/smoke-package.ts <percorso-zip> [suffisso]');
    process.exit(2);
}

const bytes = new Uint8Array(readFileSync(zipPath));
console.log(`archivio: ${zipPath} (${bytes.length} byte)\n`);

const pkg = readPackage(bytes);
console.log(`solution : ${pkg.uniqueName} v${pkg.version} · managed=${pkg.managed}`);
console.log(`publisher: ${pkg.publisherUniqueName} (${pkg.publisherPrefix})`);
console.log(`entry    : ${pkg.entries.length}`);
console.log(`impronta : SolutionPackageVersion=${pkg.fingerprint.solutionPackageVersion} · `
    + `bot.xml [${pkg.fingerprint.botElements.join(', ')}]`);
console.log('\nagent nel package:');
for (const a of pkg.agents) {
    console.log(`  ${a.schemaName}`);
    console.log(`     nome            : ${JSON.stringify(a.name)}`);
    console.log(`     base / suffisso : ${JSON.stringify(a.baseName)} / ${JSON.stringify(a.currentSuffix)}`);
    console.log(`     publishOnImport : ${a.publishOnImport === null ? 'non specificato' : a.publishOnImport}`);
    console.log(`     canali          : ${a.channels.join(', ') || '—'}`);
}

console.log('\ninventario:');
for (const c of pkg.inventory) {
    console.log(`  ${c.path.padEnd(34)} ${c.kind.padEnd(22)} ${String(c.count).padStart(3)}`
        + `  ${c.relatedToSelectedAgent ? '' : '← oltre all\'agent'}`);
}

console.log('\noccorrenze del display name:');
for (const o of pkg.nameOccurrences) {
    console.log(`  ${o.expected ? 'attesa    ' : 'IMPREVISTA'} ${o.file} ${o.locator} = ${JSON.stringify(o.value)}`);
}

const selected = pkg.agents.map(a => a.schemaName);
const options = {
    ...DEFAULT_OPTIONS,
    bumpVersion: process.argv.includes('--bump'),
    publishOnImport: process.argv.includes('--publish=false') ? 'force-false' as const
        : process.argv.includes('--publish=true') ? 'force-true' as const
        : 'keep' as const,
};
const plan = buildPatchPlan(pkg, suffix, selected, options);
console.log(`\npatch plan (suffisso ${JSON.stringify(suffix)}):`);
for (const c of plan) {
    console.log(`  ${c.file}`);
    console.log(`     <${c.element}>  ${JSON.stringify(c.before)} → ${JSON.stringify(c.after)}  [${c.state}]`
        + (c.exceedsTeamsLimit ? '  ⚠ oltre 30 caratteri' : ''));
}

const { files, patchedPaths } = applyPatch(pkg, plan);
const produced = buildZip(files);

const expectedNames: Record<string, string> = {};
for (const c of plan) if (c.element === 'name') expectedNames[c.file] = c.after;

const v = verifyZip(produced, pkg, expectedNames, patchedPaths);
const expectedIdentical = pkg.entries.length - patchedPaths.length;

console.log('\nrisultato:');
console.log(`  file patchati   : ${patchedPaths.join(', ') || '—'}`);
console.log(`  zip prodotto    : ${produced.length} byte (l'originale ne ha ${bytes.length}: `
    + `il compressore e' diverso, e per questo la verifica NON guarda le dimensioni)`);
console.log(`  verifica        : ${describeVerification(v, expectedIdentical)}`);

const ok = v.archiveReadable && v.entryCountMatches && v.patchedValuesConfirmed
    && v.byteIdenticalEntries === expectedIdentical;
console.log(`\n${ok ? 'OK — invariante rispettata' : 'FALLITO — invariante violata'}`);
process.exit(ok ? 0 : 1);
