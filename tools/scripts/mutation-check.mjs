/**
 * Controllo per mutazione: rompe il codice di proposito, un difetto alla volta, e verifica che
 * la suite di test se ne accorga.
 *
 *   npm run test:mutation
 *
 * Una suite che passa non dimostra niente se non fallirebbe davanti a un difetto vero. Qui ogni
 * mutazione e' un difetto realistico (un confronto invertito, un controllo saltato, una chiave
 * ignorata): se la suite resta verde, quel difetto sarebbe passato inosservato e serve un test.
 *
 * Ogni file viene ripristinato dal contenuto originale tenuto in memoria, anche se si preme
 * Ctrl+C: non si usa git, cosi' le modifiche non committate non vanno perse.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const at = p => join(root, p);

/** `from` puo' essere una stringa o una RegExp; la prima occorrenza viene sostituita. */
const MUTATIONS = [
    // ── patch.ts: il piano
    ['patch.ts', 'src/services/patch.ts', "return options.publishByAgent?.[schemaName] ?? options.publishOnImport;", 'return options.publishOnImport;', "l'eccezione per agent viene ignorata"],
    ['patch.ts', 'src/services/patch.ts', 'const clean = suffix.trim();', 'const clean = suffix;', 'il suffisso non viene ripulito'],
    ['patch.ts', 'src/services/patch.ts', 'if (!selected.includes(agent.schemaName)) continue;', 'if (false) continue;', 'gli agent esclusi vengono rinominati'],
    ['patch.ts', 'src/services/patch.ts', 'if (options.bumpVersion) {', 'if (false) {', 'il bump di versione non parte'],
    ['patch.ts', 'src/services/patch.ts', 'if (agent.publishOnImport !== target) {', 'if (true) {', 'publishOnImport scritto anche quando non cambia'],
    ['patch.ts', 'src/services/patch.ts', "return agent.currentSuffix ? 'suffix-changed' : 'suffix-added';", "return agent.currentSuffix ? 'suffix-added' : 'suffix-changed';", 'stati del piano invertiti'],
    ['patch.ts', 'src/services/patch.ts', 'after.length > TEAMS_NAME_LIMIT', 'after.length >= TEAMS_NAME_LIMIT', 'limite dei 30 caratteri sbagliato di uno'],
    ['patch.ts', 'src/services/patch.ts', 'excluded: !change,', 'excluded: false,', 'gli agent esclusi non risultano esclusi'],
    ['patch.ts', 'src/services/patch.ts', "cfg.publishOnImport = change.after === 'true';", 'cfg.publishOnImport = true;', 'publishOnImport scritto sempre true'],
    // ── package.ts / types.ts: lettura
    ['types.ts', 'src/types.ts', 'export const SUFFIX_MAX = 20;', 'export const SUFFIX_MAX = 10;', 'lunghezza massima del suffisso riconosciuto'],
    ['package.ts', 'src/services/package.ts', "publishOnImport = typeof cfg.publishOnImport === 'boolean' ? cfg.publishOnImport : null;", 'publishOnImport = true;', 'publishOnImport letto sempre true'],
    ['package.ts', 'src/services/package.ts', 'names.every(n => agentSchemas.some(s => n.startsWith(`${s}.`)))', 'names.every(n => n.startsWith(`${agentSchemas[0]}.`))', "inventario guarda solo il primo agent"],
    // ── compat.ts: formato e occorrenze
    ['compat.ts', 'src/services/compat.ts', 'const isKnownBase = isKnownBaseNameHolder(path) && tag === \'name\';', 'const isKnownBase = false;', 'componente GPT non piu\' un posto noto'],
    ['compat.ts', 'src/services/compat.ts', 'expected: isOwnName || isKnownBase || isOtherAgentName,', 'expected: isOwnName || isKnownBase,', 'nome di un altro agent segnalato come sconosciuto'],
    ['compat.ts', 'src/services/compat.ts', 'expected: isOwnName || isKnownBase || isOtherAgentName,', 'expected: true,', 'la rete di sicurezza non segnala mai nulla'],
    ['compat.ts', 'src/services/compat.ts', 'if (!content.includes(displayName)) continue;', 'continue;', 'nessuna occorrenza viene mai cercata'],
    ['compat.ts', 'src/services/compat.ts', /if \(!\/\^bots\\\/\[\^\/\]\+\\\/configuration\\\.json\$\/\.test\(path\)\) continue;/, 'if (keySet.size || !/^bots\\/[^/]+\\/configuration\\.json$/.test(path)) continue;', 'chiavi di formato lette solo dal primo agent'],
    ['baseline', 'src/baseline/package-format.json', /"deferredProvisioning",\s*"channels",\s*"isLightweightBot"/, '"deferredProvisioning"', 'channels e isLightweightBot non piu\' opzionali'],
    // ── rezip.ts: la verifica
    ['rezip.ts', 'src/services/rezip.ts', 'result.entryCountMatches = Object.keys(files).length === original.entries.length;', 'result.entryCountMatches = true;', 'la verifica non conta le entry'],
    ['rezip.ts', 'src/services/rezip.ts', 'return actual === expected;', 'return true;', 'la verifica non controlla i nomi'],
    ['rezip.ts', 'src/services/rezip.ts', 'result.patchedValuesConfirmed && publishOk && versionOk', 'result.patchedValuesConfirmed && versionOk', 'la verifica non controlla publishOnImport'],
    ['rezip.ts', 'src/services/rezip.ts', 'result.patchedValuesConfirmed && publishOk && versionOk', 'result.patchedValuesConfirmed && publishOk', 'la verifica non controlla la versione'],
    ['rezip.ts', 'src/services/rezip.ts', 'if (a.length !== b.length) return false;', '', 'confronto byte con lunghezze diverse'],
    ['rezip.ts', 'src/services/rezip.ts', '&& v.byteIdenticalEntries === expectedEntries;', ';', 'le entry intatte non vengono contate'],
    // ── app.ts: la schermata
    ['app.ts', 'src/app.ts', 'for (const a of selectedAgents()) setPublishMode(a.schemaName, btn.dataset.publishAll as PublishMode);', 'for (const a of solutionAgents()) setPublishMode(a.schemaName, btn.dataset.publishAll as PublishMode);', '"all" tocca anche gli agent esclusi'],
    ['app.ts', 'src/app.ts', 'nextBtn.disabled = selectedAgents().length === 0;', 'nextBtn.disabled = false;', 'Next resta acceso senza agent selezionati'],
    ['app.ts', 'src/app.ts', 'PUBLISH_LABELS[publishModeFor(state.options, r.agent.schemaName)]', "'Leave as is'", 'la revisione mostra sempre "Leave as is"'],
    ['app.ts', 'src/app.ts', 'const changedEntries = pkg.entries.length - r.managed.expectedIdenticalEntries;', 'const changedEntries = 1;', 'il banner dice sempre "1 entry"'],
    ['app.ts', 'src/app.ts', 'if (mixed.length > 1) {', 'if (false) {', 'nessuna conferma sui suffissi misti'],
    ['app.ts', 'src/app.ts', 'const chosen = selectedAgents().map(a => a.schemaName);', 'const chosen = solutionAgents().map(a => a.schemaName);', 'il package include gli agent esclusi'],
    ['app.ts', 'src/app.ts', 'if (state.browsingSolutionId !== solutionId) {', 'if (false) {', 'cambiando solution lo stato non si azzera'],
    ['app.ts', 'src/app.ts', 'state.options.publishByAgent = {};', '', 'cambiando solution i publish per agent restano'],
    ['app.ts', 'src/app.ts', 'if (box.checked) state.excludedAgents.delete(box.dataset.agent!);', 'if (!box.checked) state.excludedAgents.delete(box.dataset.agent!);', 'la spunta di un agent fa il contrario'],
    ['app.ts', 'src/app.ts', 'state.highlightAgentId = highlightAgentId;', "state.highlightAgentId = '';", 'la ricerca non evidenzia l\'agent'],
    ['app.ts', 'src/app.ts', '<tfoot>', '<tbody>', 'le azioni globali non stanno piu\' nel piede della tabella'],
    ['app.ts', 'src/app.ts', "common === m ? ' is-active' : ''", "false ? ' is-active' : ''", 'il toggle "per tutti" non resta acceso'],
    ['app.ts', 'src/app.ts', 'chosen.every(a => publishModeFor(state.options, a.schemaName) === first)', 'true', 'il toggle "per tutti" si accende anche con valori misti'],
    ['app.ts', 'src/app.ts', '<td colspan="3" class="foot-cell">', '<td colspan="2" class="foot-cell">', 'il toggle "per tutti" non e\' sotto la colonna dei toggle'],
    ['app.ts', 'src/app.ts', '<table class="data-table data-table--fill">', '<table class="data-table">', 'la tabella non usa tutta la larghezza'],
    ['app.ts', 'src/app.ts', '<td class="cell-strong cell-nowrap">${escapeHtml(r.next)}</td>', '<td class="cell-strong">${escapeHtml(r.next)}</td>', 'il nome risultante puo\' andare a capo'],
    ['app.ts', 'src/app.ts', '${sol && sol.exportable ? `', '${sol ? `', 'il rename e\' offerto anche su una solution managed'],
    ['app.ts', 'src/app.ts', 'agents: agentOutcomes(pkg, r.plan),', 'agents: [],', 'lo storico non registra gli agent'],
    ['app.ts', 'src/app.ts', 'if (btn.dataset.publish) {', 'if (false) {', 'il toggle di un agent non fa niente'],
    ['app.ts', 'src/app.ts', 'title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</td>', 'title="${escapeHtml(a.name)}">${a.name}</td>', 'il nome dell\'agent non e\' sfuggito (HTML)'],
    // ── revisione, artefatti, avanzamento, anteprima per agent (v1.1.0)
    ['app.ts', 'src/app.ts', /(<div class=")stack(">\r?\n\s+<section class="panel">\r?\n\s+<div class="panel-head">\r?\n\s+<h3 class="panel-heading">\$\{icon\('pencil', 'icon--head'\)\}Rename)/, '$1two-col$2', 'v1.1.0: i pannelli della revisione tornano affiancati'],
    ['styles.css', 'src/styles.css', /(\.art-desc \{)/, '$1 max-width: 78ch;', 'v1.1.0: le descrizioni degli artefatti hanno una larghezza massima'],
    ['styles.css', 'src/styles.css', '.art-body { flex: 1; min-width: 0; }', '.art-body { min-width: 0; }', 'v1.1.0: il testo degli artefatti non riempie la riga'],
    ['packaging.ts', 'src/services/packaging.ts', 'const PHASE_PAUSE_MS = 700;', 'const PHASE_PAUSE_MS = 0;', 'v1.1.0: nessuna pausa tra le fasi'],
    ['packaging.ts', 'src/services/packaging.ts', /(onProgress\?\.\('reading the packages…'\);)\s*await pause\(onProgress\);/, '$1', 'v1.1.0: nessuna pausa dopo la lettura dei package'],
    ['app.ts', 'src/app.ts', '.filter(x => x.changes.length)', '.filter(() => true)', 'v1.1.0: blocco anche per gli agent senza cambi'],
    ['app.ts', 'src/app.ts', "const solutionChanges = r.plan.filter(c => c.element === 'Version');", 'const solutionChanges: PatchChange[] = [];', 'v1.1.0: il blocco della solution non compare'],
    ['app.ts', 'src/app.ts', '.localeCompare(nameOf(y.agent.schemaName, y.agent.name)));', '.localeCompare(nameOf(y.agent.schemaName, y.agent.name)) * -1);', 'v1.1.0: blocchi in ordine inverso'],
    // ── packaging.ts: il collegamento
    ['packaging.ts', 'src/services/packaging.ts', "expected.publish![c.file] = c.after === 'true';", 'expected.publish![c.file] = true;', 'la verifica riceve publishOnImport sbagliato'],
];

const only = process.argv[2];
const originals = new Map();
const restore = () => { for (const [file, text] of originals) writeFileSync(at(file), text); originals.clear(); };
process.on('SIGINT', () => { restore(); process.exit(130); });

const results = [];
for (const [, file, from, to, why] of MUTATIONS) {
    if (only && !file.includes(only) && !why.includes(only)) continue;
    const original = readFileSync(at(file), 'utf8');
    const match = typeof from === 'string' ? original.includes(from) : from.test(original);
    if (!match) { results.push({ why, file, status: 'ANCORA NON TROVATA' }); continue; }

    originals.set(file, original);
    try {
        writeFileSync(at(file), original.replace(from, to));
        const run = spawnSync('npx', ['vitest', 'run', '--bail', '1'], { cwd: root, shell: true, encoding: 'utf8' });
        results.push({ why, file, status: run.status === 0 ? 'SOPRAVVISSUTA' : 'scoperta' });
    } finally {
        restore();
    }
    console.log(`${results.at(-1).status === 'scoperta' ? 'ok  ' : 'KO  '} ${file}: ${why}`);
}

const bad = results.filter(r => r.status !== 'scoperta');
console.log(`\n${results.length - bad.length}/${results.length} difetti scoperti dalla suite`);
if (bad.length) {
    console.log('\nDa sistemare:');
    for (const b of bad) console.log(`  - [${b.status}] ${b.file}: ${b.why}`);
    process.exit(1);
}
