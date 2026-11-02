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
    ['patch.ts', 'src/services/patch.ts', 'if (agent.publishOnImport !== target) {', 'if (true) {', 'publishOnImport scritto anche quando non cambia'],
    ['patch.ts', 'src/services/patch.ts', "return agent.currentSuffix ? 'suffix-changed' : 'suffix-added';", "return agent.currentSuffix ? 'suffix-added' : 'suffix-changed';", 'stati del piano invertiti'],
    ['patch.ts', 'src/services/patch.ts', 'after.length > TEAMS_NAME_LIMIT', 'after.length >= TEAMS_NAME_LIMIT', 'limite dei 30 caratteri sbagliato di uno'],
    ['patch.ts', 'src/services/patch.ts', 'excluded: !change,', 'excluded: false,', 'gli agent esclusi non risultano esclusi'],
    ['patch.ts', 'src/services/patch.ts', "cfg.publishOnImport = change.after === 'true';", 'cfg.publishOnImport = true;', 'publishOnImport scritto sempre true'],
    // ── package.ts / types.ts: lettura
    ['types.ts', 'src/types.ts', 'export const SUFFIX_MAX = 20;', 'export const SUFFIX_MAX = 10;', 'lunghezza massima del suffisso riconosciuto'],
    ['package.ts', 'src/services/package.ts', "publishOnImport = typeof cfg.publishOnImport === 'boolean' ? cfg.publishOnImport : null;", 'publishOnImport = true;', 'publishOnImport letto sempre true'],
    ['package.ts', 'src/services/package.ts', 'names.every(n => belongsToAgent(files, n, agentSchemas))', 'names.every(n => belongsToAgent(files, n, agentSchemas.slice(0, 1)))', "inventario guarda solo il primo agent"],
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
    ['app.ts', 'src/app.ts', 'nextBtn.disabled = selectedAgents().length === 0 || versionIssue() !== null;', 'nextBtn.disabled = versionIssue() !== null;', 'Next resta acceso senza agent selezionati'],
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
    ['app.ts', 'src/app.ts', '<td colspan="4" class="foot-cell">', '<td colspan="2" class="foot-cell">', 'il toggle "per tutti" non e\' sotto la colonna dei toggle'],
    ['app.ts', 'src/app.ts', '<table class="data-table data-table--fill">', '<table class="data-table">', 'la tabella non usa tutta la larghezza'],
    ['app.ts', 'src/app.ts', '<td class="cell-strong cell-nowrap">${escapeHtml(r.next)}</td>', '<td class="cell-strong">${escapeHtml(r.next)}</td>', 'il nome risultante puo\' andare a capo'],
    ['app.ts', 'src/app.ts', '${sol && sol.exportable ? `', '${sol ? `', 'il rename e\' offerto anche su una solution managed'],
    ['app.ts', 'src/app.ts', 'agents: agentOutcomes(pkg, r.plan),', 'agents: [],', 'lo storico non registra gli agent'],
    ['app.ts', 'src/app.ts', 'if (btn.dataset.publish) {', 'if (false) {', 'il toggle di un agent non fa niente'],
    ['app.ts', 'src/app.ts', '<span class="agent-name">${escapeHtml(a.name)}</span>', '<span class="agent-name">${a.name}</span>', 'il nome dell\'agent non e\' sfuggito (HTML)'],
    // ── revisione, artefatti, avanzamento, anteprima per agent (v1.1.0)
    ['app.ts', 'src/app.ts', /(<div class=")stack(">\r?\n\s+<section class="panel">\r?\n\s+<div class="panel-head">\r?\n\s+<h3 class="panel-heading">\$\{icon\('pencil', 'icon--head'\)\}Rename)/, '$1two-col$2', 'v1.1.0: i pannelli della revisione tornano affiancati'],
    ['styles.css', 'src/styles.css', /(\.art-desc \{)/, '$1 max-width: 78ch;', 'v1.1.0: le descrizioni degli artefatti hanno una larghezza massima'],
    ['styles.css', 'src/styles.css', '.art-body { flex: 1; min-width: 0; }', '.art-body { min-width: 0; }', 'v1.1.0: il testo degli artefatti non riempie la riga'],
    ['packaging.ts', 'src/services/packaging.ts', 'const PHASE_PAUSE_MS = 700;', 'const PHASE_PAUSE_MS = 0;', 'v1.1.0: nessuna pausa tra le fasi'],
    ['packaging.ts', 'src/services/packaging.ts', /(onProgress\?\.\('reading the packages…'\);)\s*await pause\(onProgress\);/, '$1', 'v1.1.0: nessuna pausa dopo la lettura dei package'],
    ['app.ts', 'src/app.ts', '.filter(x => x.changes.length)', '.filter(() => true)', 'v1.1.0: blocco anche per gli agent senza cambi'],
    ['app.ts', 'src/app.ts', '<p class="note-version" id="version-note">${r.versionChange.changed', '<p class="note-version" id="version-note">${false', 'v1.1.0: la nota sulla versione alzata non compare'],
    ['app.ts', 'src/app.ts', '.localeCompare(nameOf(y.agent.schemaName, y.agent.name)));', '.localeCompare(nameOf(y.agent.schemaName, y.agent.name)) * -1);', 'v1.1.0: blocchi in ordine inverso'],
    ['app.ts', 'src/app.ts', "scrollToTop(document.getElementById('main-content') ?? els.welcomeScreen);", '', 'ogni schermata eredita lo scorrimento della precedente'],
    ['app.ts', 'src/app.ts', "const SCROLLERS = '.step-panel, #solutions-table-container, .panel-table';", "const SCROLLERS = '#solutions-table-container';", 'si resetta solo l\'elenco, non gli step'],
    ['app.ts', 'src/app.ts', "el => { el.scrollTop = 0; }", "el => { el.scrollTop = el.scrollTop; }", 'lo scorrimento non viene azzerato'],
    ['styles.css', 'src/styles.css', '.data-table--fill .toggle-group--sm { display: flex; width: 100%; }', '.data-table--fill .toggle-group--sm { display: inline-flex; }', 'il toggle torna a raggrupparsi a sinistra'],
    ['styles.css', 'src/styles.css', '.data-table--fill .toggle-group--sm .toggle-btn { flex: 1;', '.data-table--fill .toggle-group--sm .toggle-btn { flex: 0;', 'i pulsanti del toggle non si dividono la larghezza'],
    ['app.ts', 'src/app.ts', '<col style="width:68px"><col style="width:28%"><col style="width:96px"><col style="width:28%"><col>', '<col style="width:68px"><col style="width:8%"><col style="width:96px"><col style="width:8%"><col>', 'colonne troppo strette'],
    ['app.ts', 'src/app.ts', '<strong>Update</strong>, which never removes components.', '<strong>Update</strong>, which keeps things tidy.', 'v1.1.0: il testo non dice che Update non rimuove nulla'],
    ['app.ts', 'src/app.ts', '<em>Update</em> and <em>Stage for upgrade</em> keep them.', '', 'v1.1.0: il testo non avverte su Update e Stage for upgrade'],
    ['app.ts', 'src/app.ts', '<strong>Upgrade</strong> (the default): agents you', '<strong>Update</strong> (the default): agents you', 'v1.1.0: il testo consiglia Update invece di Upgrade'],
    // ── la revisione non si contraddice sulla scrittura in DEV
    ['app.ts', 'src/app.ts', '? `<strong>The only change to Dataverse is the solution version</strong>', '? `<strong>Nothing is written to Dataverse</strong>', 'revisione: dice "Nothing is written to Dataverse" anche quando scrive la versione'],
    ['app.ts', 'src/app.ts', ': `<strong>Nothing is written to Dataverse</strong>: the', ': `<strong>The only change to Dataverse is the solution version</strong>: the', 'revisione: dice che scrive la versione anche quando non lo fa'],
    // ── l'icona del marketplace: percorso relativo a dist
    ['package.json', 'package.json', '"icon": "logo.svg"', '"icon": "dist/logo.svg"', 'icona: percorso relativo al pacchetto invece che a dist (il marketplace mostra la scatola)'],
    ['icona: un colore', 'src/public/logo.svg', 'stroke="currentColor" stroke-width="4"', 'stroke="#1f2328" stroke-width="4"', 'icona: un colore fisso al posto di currentColor (il marketplace la mostra come quadrato)'],
    ['icona: un colore', 'src/public/logo.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" fill="none"', '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" fill="#e4e9fb"', 'icona: uno sfondo pieno invece di un contorno'],
    ['icona: un colore', 'src/index.html', 'src="./logo-color.svg"', 'src="./logo.svg"', 'icona: la intestazione usa il logo a un colore e diventa nero sul tema scuro'],
    ['README: link completi', 'README.md', '](https://github.com/vincenzosgueradev/copilot-agent-nameplate/blob/main/SECURITY.md)', '](SECURITY.md)', 'README: un link relativo non si apre sul marketplace'],
    // ── la versione si alza in DEV, non nello zip (FR-073)
    ['solutionVersion.ts', 'src/services/solutionVersion.ts', 'if (cmp === 0) return { from, to, changed: false };', '', 'v1.1.0: la stessa versione viene riscritta'],
    ['solutionVersion.ts', 'src/services/solutionVersion.ts', 'if (cmp < 0) {', 'if (false) {', 'v1.1.0: si scrive anche una versione piu\' bassa di DEV'],
    ['solutionVersion.ts', 'src/services/solutionVersion.ts', 'if (row.ismanaged === true) {', 'if (false) {', 'v1.1.0: si tocca una solution managed'],
    ['solutionVersion.ts', 'src/services/solutionVersion.ts', "if (String(after.version ?? '') !== to) {", 'if (false) {', 'v1.1.0: la rilettura dopo la scrittura non c\'e\''],
    ['solutionVersion.ts', 'src/services/solutionVersion.ts', 'if (d !== 0) return d;', 'return d;', 'v1.1.0: il confronto si ferma al primo segmento'],
    ['solutionVersion.ts', 'src/services/solutionVersion.ts', 'String(Number(parts[parts.length - 1]) + 1)', 'String(Number(parts[parts.length - 1]) + 2)', 'v1.1.0: la proposta salta un numero'],
    ['solutionVersion.ts', 'src/services/solutionVersion.ts', 'if (compareVersions(candidate, current) <= 0) {', 'if (compareVersions(candidate, current) < 0) {', 'v1.1.0: la stessa versione risulta valida'],
    ['solutionVersion.ts', 'src/services/solutionVersion.ts', 'const VERSION_RE = /^\\d+\\.\\d+\\.\\d+\\.\\d+$/;', 'const VERSION_RE = /^\\d+\\.\\d+\\.\\d+$/;', 'v1.1.0: bastano tre numeri'],
    ['packaging.ts', 'src/services/packaging.ts', 'if (options.newVersion) {', 'if (false) {', 'v1.1.0: la versione non viene mai scritta in DEV'],
    ['packaging.ts', 'src/services/packaging.ts', 'version: options.newVersion ?? undefined', 'version: undefined', 'v1.1.0: la verifica non controlla la versione dello zip'],
    ['app.ts', 'src/app.ts', "state.options.newVersion = state.raiseVersion && !versionIssue() ? chosenVersion().trim() : null;", 'state.options.newVersion = null;', 'v1.1.0: la schermata non passa mai la versione'],
    ['app.ts', 'src/app.ts', "'Choose a valid new version below to continue.'", "''", 'v1.1.0: nessun invito a correggere la versione'],
    ['app.ts', 'src/app.ts', 'nextBtn.disabled = selectedAgents().length === 0 || versionIssue() !== null;', 'nextBtn.disabled = selectedAgents().length === 0;', 'v1.1.0: Next acceso con una versione non valida'],
    ['app.ts', 'src/app.ts', '(state.options.newVersion ?? state.versionFrom ?? sol.version)', 'sol.version', 'v1.1.0: i nomi degli archivi non portano la versione nuova'],
    ['app.ts', 'src/app.ts', "(raise ? [VERSION_PHASE, ...PACK_PHASES] : [...PACK_PHASES])", '[...PACK_PHASES]', 'v1.1.0: manca la fase "Raise the version in DEV"'],
    ['app.ts', 'src/app.ts', "if (!state.versionFrom || (!state.packaging && !state.versionTouched)) state.versionFrom = sol.version;", "if (!state.versionFrom) state.versionFrom = sol.version;", 'v1.1.0: la versione di partenza non si rilegge'],
    ['app.ts', 'src/app.ts', 'versionChange: r.versionChange,', 'versionChange: null,', 'v1.1.0: lo storico non registra la versione'],
    ['agentCards.ts', 'src/services/agentCards.ts', "|| !value.startsWith(PNG_SIGNATURE)", "", "v1.1.0 (008): un JPEG o un testo diventano \"icona\""],
    ['agentCards.ts', 'src/services/agentCards.ts', "if (!value || value.length > MAX_ICON_CHARS) return null;", "if (!value) return null;", "v1.1.0 (008): nessun limite alla lunghezza dell'icona"],
    ['agentCards.ts', 'src/services/agentCards.ts', "if (!BASE64_RE.test(value) ||", "if (false ||", "v1.1.0 (008): caratteri fuori dall'alfabeto base64 accettati"],
    ['agentCards.ts', 'src/services/agentCards.ts', "if (hit) out.set(a.id, hit); else missing.push(a);", "missing.push(a);", "v1.1.0 (008): la cache viene ignorata"],
    ['agentCards.ts', 'src/services/agentCards.ts', "hit.modifiedOn === agent.modifiedOn", "true", "v1.1.0 (008): un agent modificato non si rilegge"],
    ['agentCards.ts', 'src/services/agentCards.ts', "for (const a of missing) out.set(a.id, EMPTY);", "throw err;", "v1.1.0 (008): una lettura fallita rompe la schermata"],
    ['app.ts', 'src/app.ts', "void loadCards(agents, seq);", "void loadCards(state.agents, seq);", "v1.1.0 (008): si leggono gli agent di tutto l'environment"],
    ['app.ts', 'src/app.ts', "void loadCards(agents, seq);", "", "v1.1.0 (008): icone e descrizioni non vengono mai lette"],
    ['compat.ts', "src/services/compat.ts", "const profile = profiles.find(p => p.recognizer === recognizer);", "const profile = profiles[0];", "v1.1.0 (009): ogni agent si confronta col baseline standard"],
    ['compat.ts', "src/services/compat.ts", "profile.keys, keys, 'baseline', profile.optionalKeys", "profile.keys, keys, 'baseline'", "v1.1.0 (009): le chiavi opzionali del profilo non contano"],
    ['compat.ts', "src/services/compat.ts", "if (typeof kind === 'string' && kind) return kind;", "if (typeof kind === 'string') return kind;", "v1.1.0 (009): un recognizer vuoto vale come architettura"],
    ['compat.ts', "src/services/compat.ts", "for (const p of Object.keys(files)) if (re.test(p)) for", "for (const p of Object.keys(files).filter(q => re.test(q)).slice(0, 1)) for", "v1.1.0 (009): gli elementi si leggono solo dal primo file"],
    ['compat.ts', "src/services/compat.ts", "if (!previous.configurationByArchitecture || !actual.configurationByArchitecture) return [];", "if (!actual.configurationByArchitecture) return [];", "v1.1.0 (009): una registrazione vecchia produce rumore"],
    ['compat.ts', "src/services/compat.ts", "if (!profile) {", "if (!profile && false) {", "v1.1.0 (009): un'architettura sconosciuta non viene segnalata"],
    ['agentCards.ts', "src/services/agentCards.ts", "value.startsWith('cliagent-')", "value.includes('cliagent')", "v1.1.0 (010): un nome che contiene cliagent diventa harness"],
    ['agentCards.ts', "src/services/agentCards.ts", "if (value.startsWith('default-')) return 'standard';", "if (value.startsWith('default-')) return 'unknown';", "v1.1.0 (010): lo standard non si riconosce"],
    ['agentCards.ts', "src/services/agentCards.ts", "if (typeof raw !== 'string') return 'unknown';\n    const value", "if (typeof raw !== 'string') return 'standard';\n    const value", "v1.1.0 (010): un template assente vale come standard"],
    ['agentCards.ts', "src/services/agentCards.ts", "const value = raw.trim().toLowerCase();", "const value = raw;", "v1.1.0 (010): spazi e maiuscole cambiano il tipo"],
    ['agentCards.ts', "src/services/agentCards.ts", "const EMPTY: AgentCard = { iconDataUri: null, kind: 'unknown' };", "const EMPTY: AgentCard = { iconDataUri: null, kind: 'standard' };", "v1.1.0 (010): una lettura fallita dichiara tutti standard"],
    ['agentCards.ts', "src/services/agentCards.ts", "                <attribute name=\"template\"/>\n", "", "v1.1.0 (010): la colonna template non viene letta"],
    ['agentCards.ts', "src/services/agentCards.ts", "kind: agentKindOf(templateOf.get(a.id)),", "kind: 'standard',", "v1.1.0 (010): il tipo non dipende dal template"],
    ['app.ts', "src/app.ts", "harness: 'GitHub Copilot harness',", "harness: '',", "v1.1.0 (010): l'icona harness non ha etichetta"],
    ['app.ts', "src/app.ts", "el.outerHTML = agentKindHtml(el.dataset.cardKind ?? '');", "void 0;", "v1.1.0 (010): il tipo non si riempie dopo la lettura"],
    ['app.ts', "src/app.ts", /<th>Agent<\/th>\s*<th>Agent type<\/th>/, "<th>Agent</th><th>Type</th>", "v1.1.0 (010): la colonna ha un altro titolo"],
    ['app.ts', "src/app.ts", "{ label: 'Version', value: pkg.version },", "{ label: 'Versione', value: pkg.version },", "v1.1.0 (011): un'etichetta in italiano"],
    ['app.ts', "src/app.ts", /\? '<span class="chip chip--muted">Managed<\/span>'/, "? '<span class=\"chip chip--muted\">Unmanaged</span>'", "v1.1.0 (011): una solution managed non lo dice"],
    ['app.ts', "src/app.ts", "{ label: 'Entries', value: String(pkg.entries.length) },", "{ label: 'Entry', value: String(pkg.entries.length) },", "v1.1.0 (011): etichetta dell'anteprima diversa dalle altre"],
    ['app.ts', "src/app.ts", "label: 'Checks', step: 'verify'", "label: 'Verifica', step: 'verify'", "v1.1.0 (011): il percorso non usa il nome del passo"],
    ['app.ts', "src/app.ts", "<dd${s.title ? ` title=\"${escapeHtml(s.title)}\"` : ''}>${escapeHtml(s.value)}", "<dd${s.title ? ` title=\"${escapeHtml(s.title)}\"` : ''}>${s.value}", "v1.1.0 (011): il valore di una tile diventa HTML"],
    ['app.ts', "src/app.ts", /\{ label: 'Agents', value: String\(agents\) \},\s*\]\);/, "{ label: 'Agents', value: String(agents) }, { label: 'Managed', value: String(counts.managed) }]);", "v1.1.0 (011): il conteggio managed si ripete nelle tile"],
    // ── packaging.ts: il collegamento
    ['packaging.ts', 'src/services/packaging.ts', "expected.publish![c.file] = c.after === 'true';", 'expected.publish![c.file] = true;', 'la verifica riceve publishOnImport sbagliato'],
    // ── pins.ts / app.ts: pin delle solution (012)
    ['pins.ts', 'src/services/pins.ts', 'return [...pinned, ...rest];', 'return [...rest, ...pinned];', 'pin: le fissate vanno in fondo'],
    ['pins.ts', 'src/services/pins.ts', '(isPinned(item) ? pinned : rest).push(item);', 'rest.push(item);', 'pin: il pin viene ignorato'],
    ['pins.ts', 'src/services/pins.ts', 'return [...pinned, ...rest];', 'return [...pinned, ...rest].reverse();', 'pin: ordine dentro i gruppi si inverte'],
    ['pins.ts', 'src/services/pins.ts', 'return parse(raw)[environment] ?? [];', 'return Object.values(parse(raw)).flat();', 'pin: i pin valgono in ogni ambiente'],
    ['pins.ts', 'src/services/pins.ts', /if \(next\.length\) map\[environment\] = next;\s+else delete map\[environment\];/, 'map[environment] = next;', 'pin: ultimo pin lascia una chiave vuota'],
    ['pins.ts', 'src/services/pins.ts', "(current.includes(uniqueName) ? current : [...current, uniqueName])", '[...current, uniqueName]', 'pin: duplicati nell elenco'],
    ['pins.ts', 'src/services/pins.ts', "names.filter((n): n is string => typeof n === 'string')", 'names as string[]', 'pin: valori non stringa accettati'],
    ['pins.ts', 'src/services/pins.ts', 'queue = run.catch(() => {});', 'queue = run;', 'pin: un errore blocca le scritture successive'],
    ['app.ts', 'src/app.ts', "ev.stopPropagation();                 // il pin non apre la solution", '', 'pin: il click sul pin apre la solution'],
    ['app.ts', 'src/app.ts', 'return pinFirst(sorted, s => state.pins.includes(s.uniqueName));', 'return sorted;', 'pin: la lista non usa i pin'],
    ['app.ts', 'src/app.ts', 'state.pins = await readPins(conn.name);', '', 'pin: i pin non si leggono all avvio'],
    ['app.ts', 'src/app.ts', "    setPinned(state.connectionName, uniqueName, on).catch(", "    Promise.resolve().catch(", 'pin: il pin non si salva'],
    // ── app.ts: avviso "nessun suffisso" (013) e limite dei pin (012)
    ['app.ts', 'src/app.ts', "if (state.suffix.trim() === '' && !(await confirmNoSuffix())) return;", "if (state.suffix === '' && !(await confirmNoSuffix())) return;", 'nosuffix: gli spazi non contano come vuoto'],
    ['app.ts', 'src/app.ts', "if (state.suffix.trim() === '' && !(await confirmNoSuffix())) return;", "if (!(await confirmNoSuffix())) return;", 'nosuffix: l avviso compare anche con un suffisso'],
    ['app.ts', 'src/app.ts', "if (state.suffix.trim() === '' && !(await confirmNoSuffix())) return;", "", 'nosuffix: nessun avviso'],
    ['app.ts', 'src/app.ts', "if (state.suffix.trim() === '' && !(await confirmNoSuffix())) return;", "if (state.suffix.trim() === '') await confirmNoSuffix();", 'nosuffix: annullare va avanti lo stesso'],
    ['app.ts', 'src/app.ts', "return state.pins.filter(n => known.has(n)).length >= MAX_PINS;", "return false;", 'pin: nessun limite'],
    ['package.ts', 'src/services/package.ts', '? agentSchemas.includes(parent)', '? true', 'inventario: il padre estraneo conta come dell agent'],
    ['package.ts', 'src/services/package.ts', '? agentSchemas.includes(parent)', '? agentSchemas.some(s => component.startsWith(`${s}.`))', 'inventario: il parentbotid e ignorato, vale il nome'],
    ['package.ts', 'src/services/package.ts', ': agentSchemas.some(s => component.startsWith(`${s}.`));', ': true;', 'inventario: senza padre ogni componente e dell agent'],
    // ── spec 014: conferma della scrittura in DEV
    ['conferma', 'src/app.ts', 'if (state.options.newVersion && !(await confirmVersionWrite(sol))) return;', 'if (false) return;', 'la scrittura in DEV parte senza conferma'],
    ['conferma', 'src/app.ts', 'if (state.options.newVersion && !(await confirmVersionWrite(sol))) return;', 'if (!(await confirmVersionWrite(sol))) return;', 'conferma chiesta anche senza scrittura'],
    ['conferma', 'src/app.ts', 'if (state.options.newVersion && !(await confirmVersionWrite(sol))) return;', 'if (state.options.newVersion && (await confirmVersionWrite(sol))) return;', 'conferma con risposta invertita'],
    ['conferma', 'src/headless.ts', 'options.newVersion && input.confirmVersionWrite !== true', 'false', 'headless scrive la versione senza consenso'],
    ['conferma', 'src/headless.ts', 'options.newVersion && input.confirmVersionWrite !== true', 'options.newVersion && !input.confirmVersionWrite', 'headless accetta un consenso non booleano'],
    ['conferma', 'src/app.ts', '<code>${escapeHtml(state.versionFrom)}</code> <span class="warn-arrow">', '<code></code> <span class="warn-arrow">', 'il dialog non dice la versione di partenza'],
    ['avviso formato', 'src/services/compat.ts', "return drift.filter(d => d.what === 'bot.xml elements: disappeared \"name\"');", 'return drift;', 'ogni scostamento di formato viene mostrato'],
    ['avviso formato', 'src/services/compat.ts', "return drift.filter(d => d.what === 'bot.xml elements: disappeared \"name\"');", 'return [];', 'la mancanza di <name> non viene mai segnalata'],
    ['avviso formato', 'src/app.ts', '${notableDrift.length ? `', '${pkg.drift.length ? `', 'la sezione formato usa tutto lo scostamento'],
    // ── spec 014: tema e dialog
    ['tema', 'src/app.ts', "set(theme === 'light')", 'set(true)', 'il tema resta sempre chiaro'],
    ['tema', 'src/app.ts', "set(theme === 'light')", 'set(false)', 'il tema resta sempre scuro'],
    ['tema', 'src/app.ts', "if (payload.event === 'settings:updated') applyTheme();", 'void 0;', 'il tema non si rilegge al cambio impostazioni'],
    ['tema', 'src/app.ts', "if (payload.event === 'settings:updated') applyTheme();", 'applyTheme();', 'il tema si rilegge a ogni evento'],
    ['tema', 'src/styles.css', '--color-text-muted: #6b6b6b;', '--color-text-muted: #c0c0c0;', 'testo secondario illeggibile nel tema chiaro'],
    ['tema', 'src/styles.css', '--color-surface: #ffffff;', '--color-surface: #252526;', 'superficie scura nel tema chiaro'],
    ['dialog url', 'src/app.ts', "state.connectionUrl = conn.url ?? '';", "state.connectionUrl = '';", 'il dialog non nomina URL ambiente'],
    ['dialog url', 'src/app.ts', '<strong>one property of one solution</strong>', '<strong>the solution</strong>', 'il dialog non dice lo scope'],
    // ── spec 015: guida sulle solution managed
    ['managed', 'src/app.ts', "if (filter === 'unmanaged' || counts.managed === 0) return null;", 'if (counts.managed === 0) return null;', 'managed: la nota compare anche nella vista Unmanaged'],
    ['managed', 'src/app.ts', "if (filter === 'unmanaged' || counts.managed === 0) return null;", "if (filter === 'unmanaged') return null;", 'managed: la nota compare senza solution managed'],
    ['managed', 'src/app.ts', "if (counts.unmanaged === 0) return 'downstream';", "if (false) return 'downstream';", 'managed: un ambiente solo managed non lo dice'],
    ['managed', 'src/app.ts', "return filter === 'managed' ? 'managed-view' : null;", "return 'managed-view';", 'managed: la nota del filtro Managed compare anche in All'],
    ['managed', 'src/app.ts', "return filter === 'managed' ? 'managed-view' : null;", 'return null;', 'managed: con unmanaged presenti la vista Managed non spiega'],
    ['managed', 'src/app.ts', "if (!kind) { host.hidden = true; host.innerHTML = ''; return; }", 'if (!kind) { return; }', 'managed: la nota resta quando cambia il filtro'],
    ['managed', 'src/app.ts', "const env = state.connectionName ? `<strong>${escapeHtml(state.connectionName)}</strong>` : 'This environment';", "const env = state.connectionName ? `<strong>${state.connectionName}</strong>` : 'This environment';", 'managed: il nome dell\'ambiente diventa HTML'],
    ['managed', 'src/app.ts', "const env = state.connectionName ? `<strong>${escapeHtml(state.connectionName)}</strong>` : 'This environment';", "const env = 'This environment';", 'managed: la nota non nomina l\'ambiente'],
    ['managed', 'src/app.ts', "${s.isManaged && showType ? ' is-managed' : ''}", "${s.isManaged ? ' is-managed' : ''}", 'managed: la riga si spegne anche fuori dalla vista All'],
    ['managed', 'src/app.ts', "${s.isManaged && showType ? ' is-managed' : ''}", "${showType ? ' is-managed' : ''}", 'managed: anche le unmanaged risultano spente'],
    ['managed', 'src/app.ts', "${s.isManaged ? ' title=\"Managed:", "${!s.isManaged ? ' title=\"Managed:", 'managed: il tooltip sta sulle unmanaged'],
    ['managed', 'src/app.ts', "const env = state.connectionName ? ` in <strong>${escapeHtml(state.connectionName)}</strong>` : '';", "const env = '';", 'managed: il banner non nomina l\'ambiente'],
    ['managed', 'src/app.ts', "const env = state.connectionName ? ` in <strong>${escapeHtml(state.connectionName)}</strong>` : '';", "const env = state.connectionName ? ` in <strong>${state.connectionName}</strong>` : '';", 'managed: il nome nel banner diventa HTML'],
    ['managed', 'src/app.ts', "const orphansInView = effectiveFilter() !== 'managed';", 'const orphansInView = true;', 'managed: gli agent senza solution compaiono nella vista Managed'],
    ['managed', 'src/app.ts', "const orphansInView = effectiveFilter() !== 'managed';", "const orphansInView = effectiveFilter() === 'unmanaged';", 'managed: gli agent senza solution spariscono dalla vista All'],
    ['managed', 'src/app.ts', "const orphansInView = effectiveFilter() !== 'managed';", "const orphansInView = effectiveFilter() !== 'unmanaged';", 'managed: gli agent senza solution spariscono dalla vista Unmanaged'],
    ['managed', 'src/app.ts', "    if (sol.exportable) return '';\n    const env", "    const env", 'managed: il banner compare anche su una solution esportabile'],
    // ── spec 016: lista dei Target (servizio)
    ['targets', 'src/services/targets.ts', 'if (clean.length > SUFFIX_MAX)', 'if (clean.length >= SUFFIX_MAX)', 'targets: il limite dei 20 caratteri e\' sbagliato di uno'],
    ['targets', 'src/services/targets.ts', String.raw`/[[\]\\/:*?"<>|`, String.raw`/[\]\\/:*?"<>|`, 'targets: la parentesi quadra aperta e\' ammessa nel nome'],
    ['targets', 'src/services/targets.ts', 't.name.toLowerCase() === clean.toLowerCase()', 't.name === clean', 'targets: i doppioni con altre maiuscole sono ammessi'],
    ['targets', 'src/services/targets.ts', 'i !== exceptIndex && ', '', 'targets: rinominare in se stesso risulta un doppione'],
    ['targets', 'src/services/targets.ts', 'from >= out.length || to >= out.length', 'from > out.length || to > out.length', 'targets: lo spostamento oltre la fine corrompe la lista'],
    ['targets', 'src/services/targets.ts', 'if (!Array.isArray(raw)) return null;', 'if (!Array.isArray(raw)) return [];', 'targets: un valore illeggibile vale lista vuota invece dei preset'],
    ['targets', 'src/services/targets.ts', "PUBLISH_MODES.find(m => m === publishOnImport) ?? 'keep'", "PUBLISH_MODES.find(m => m === publishOnImport) ?? 'force-true'", 'targets: un publish non valido diventa force-true'],
    ['targets', 'src/services/targets.ts', 'if (validateTargetName(clean, out) !== null) continue;', '', 'targets: la lettura accetta doppioni e nomi vietati'],
    ['targets', 'src/services/targets.ts', 'if (renamed && renamed.from !== renamed.to) {', 'if (false) {', 'targets: le spunte non seguono la rinomina'],
    ['targets', 'src/services/targets.ts', 'return list.filter(t => wanted.has(t.name)).map(t => t.name);', 'return [...names].filter(n => list.some(t => t.name === n));', 'targets: le spunte non seguono l\'ordine della lista'],
    ['targets', 'src/services/targets.ts', 'if (Object.keys(mine).length) all[environment] = mine;', 'all[environment] = mine;', 'targets: l\'ultima spunta lascia una chiave vuota'],
    ['targets', 'src/services/targets.ts', 'queue = run.catch(() => {});', 'queue = run;', 'targets: un errore blocca le scritture successive'],
    ['targets', 'src/services/targets.ts', 'if (parsed) return parsed;', 'if (parsed && parsed.length) return parsed;', 'targets: una lista vuota torna ai preset'],
    ['targets', 'src/services/targets.ts', "'DEV', 'TEST', 'UAT', 'STAGING', 'PREPROD', 'PROD'", "'DEV', 'UAT', 'STAGING', 'PREPROD', 'PROD'", 'targets: manca un preset'],
    ['targets', 'src/services/targets.ts', '{ name: name.trim(), publishOnImport }]', '{ name, publishOnImport }]', 'targets: il nome aggiunto non viene ripulito'],
    ['targets', 'src/services/targets.ts', "map[environment] = list.map(t => ({ name: t.name, publishOnImport: t.publishOnImport }));", "map['*'] = list.map(t => ({ name: t.name, publishOnImport: t.publishOnImport }));", 'targets: la lista vale per ogni ambiente'],
    ['targets', 'src/services/targets.ts', 'names.map(n => (n === from ? to : n))', 'names.map(n => (n === from ? n : n))', 'targets: la rinomina non cambia le spunte'],
    // ── spec 016: motore a piu' Target e confronto fra archivi
    ['confronto', 'src/services/compare.ts', 'if (x && y && kind && allowed.has(path)) differing.push', 'if (x && y && kind) differing.push', 'confronto: una differenza non scritta da nessuna patch risulta attesa'],
    ['confronto', 'src/services/compare.ts', 'if (x && y && kind && allowed.has(path)) differing.push', 'if (x && y && allowed.has(path)) differing.push', 'confronto: un file che la patch non scrive mai risulta atteso'],
    ['confronto', 'src/services/compare.ts', 'if (x && y && sameBytes(x, y)) { identicalEntries++; continue; }', 'if (x && y) { identicalEntries++; continue; }', 'confronto: ogni entry risulta identica'],
    ['confronto', 'src/services/compare.ts', String.raw`/^bots\/[^/]+\/bot\.xml$/`, String.raw`/^bots\/[^/]+\/bot\.xml/`, 'confronto: bot.xml.bak vale come bot.xml'],
    ['confronto', 'src/services/compare.ts', String.raw`/^bots\/[^/]+\/configuration\.json$/`, String.raw`/^bots\/.+\/configuration\.json$/`, 'confronto: un percorso annidato vale come configuration.json'],
    ['confronto', 'src/services/compare.ts', 'new Set([...reference.patchedPaths, ...other.patchedPaths])', 'new Set([...other.patchedPaths])', 'confronto: conta solo la patch del secondo Target'],
    ['confronto', 'src/services/compare.ts', 'differing.sort((p, q) => p.path.localeCompare(q.path));', '', 'confronto: le differenze non sono in ordine'],
    ['confronto', 'src/services/compare.ts', 'return { against, differing, identicalEntries, unexpected };', "return { against: '', differing, identicalEntries, unexpected };", 'confronto: il Target di riferimento non e\' nominato'],
    ['motore', 'src/services/packaging.ts', "if (!targets.length) throw new Error('At least one target is needed.');", 'if (false) throw new Error();', 'motore: nessun Target viene accettato'],
    ['motore', 'src/services/packaging.ts', 'if (seen.has(key)) throw', 'if (false) throw', 'motore: due Target con lo stesso nome vengono accettati'],
    ['motore', 'src/services/packaging.ts', 'const key = t.name.trim().toLowerCase();', 'const key = t.name;', 'motore: i nomi doppi con altre maiuscole o spazi passano'],
    ['motore', 'src/services/packaging.ts', "            publishOnImport: target.publishOnImport,\n", "", 'motore: il publish del Target viene ignorato'],
    ['motore', 'src/services/packaging.ts', 'compareArchives(first.managed, managed, first.target.name)', 'compareArchives(first.managed, first.managed, first.target.name)', 'motore: il confronto e\' del primo Target con se stesso'],
    ['motore', 'src/services/packaging.ts', 'const first = results[0];', 'const first = results[results.length - 1];', 'motore: il riferimento e\' l\'ultimo Target invece del primo'],
    ['motore', 'src/services/packaging.ts', '            && !(comparison?.unexpected.length);', '            && true;', 'motore: una differenza inattesa non rende non valido il Target'],
    ['motore', 'src/services/packaging.ts', 'const valid = results.every(r => r.valid);', 'const valid = results.some(r => r.valid);', 'motore: basta un Target valido per dire valido il giro'],
    ['motore', 'src/services/packaging.ts', "[{ name: suffix, publishOnImport: options.publishOnImport }]", "[{ name: suffix, publishOnImport: 'keep' }]", 'motore: runPackaging ignora il publish di partenza'],
    ['motore', 'src/services/packaging.ts', "        valid,\n        versionChange,\n    };\n}\n\n/**\n * Un Target visto", "        valid: true,\n        versionChange,\n    };\n}\n\n/**\n * Un Target visto", 'motore: il giro risulta sempre valido'],
    // ── spec 016: artifact set, manifest v2 e storico
    ['artefatti', 'src/services/artifacts.ts', 'if (names.length > 3) return', 'if (names.length > 4) return', 'artefatti: il conteggio dei Target nel nome della cartella parte tardi'],
    ['artefatti', 'src/services/artifacts.ts', "names.map(n => safeForPath(n) || 'no suffix').join(', ')", "names.map(n => safeForPath(n)).join(', ')", 'artefatti: un Target senza suffisso lascia le parentesi vuote nella cartella'],
    ['artefatti', 'src/services/artifacts.ts', "const suffixTag = tr.target.name.trim() || 'nosuffix';", "const suffixTag = tr.target.name || 'nosuffix';", 'artefatti: gli spazi finiscono nel nome del file'],
    ['artefatti', 'src/services/artifacts.ts', "    if (options.keepSourceArtifacts) {\n        const first", "    if (true) {\n        const first", 'artefatti: gli export originali si scrivono anche con le copie extra spente'],
    ['artefatti', 'src/services/artifacts.ts', "            ...(f.target !== undefined ? { target: f.target } : {}),\n", "", 'artefatti: i file non dicono a quale Target appartengono'],
    ['artefatti', 'src/services/artifacts.ts', 'manifestVersion: 2,', 'manifestVersion: 1,', 'artefatti: la versione del formato del manifest'],
    ['artefatti', 'src/services/artifacts.ts', 'sharedFiles: files.filter(f => f.target === undefined).map(fileEntry),', 'sharedFiles: files.map(fileEntry),', 'artefatti: ogni file risulta comune a tutti i Target'],
    ['artefatti', 'src/services/artifacts.ts', 'comparison: tr.comparison\n', 'comparison: false\n', 'artefatti: il confronto non va nel manifest'],
    ['artefatti', 'src/services/artifacts.ts', 'against: tr.comparison.against,', "against: '',", 'artefatti: il confronto non nomina il riferimento'],
    ['artefatti', 'src/services/artifacts.ts', '            order,\n', '            order: 0,\n', 'artefatti: tutti i Target hanno ordine 0'],
    ['artefatti', 'src/services/artifacts.ts', 'suffix: tr.target.name.trim(),', 'suffix: tr.target.name,', 'artefatti: il suffisso del manifest non e\' ripulito'],
    ['artefatti', 'src/services/artifacts.ts', 'publishByAgent: tr.target.publishByAgent ?? options.publishByAgent ?? {},', 'publishByAgent: {},', 'artefatti: le eccezioni per agent non vanno nel manifest'],
    ['artefatti', 'src/services/artifacts.ts', 'warnAboutDialogs(planned.length);', 'warnAboutDialogs(1);', 'artefatti: il numero di salvataggi annunciato e\' sbagliato'],
    ['artefatti', 'src/services/artifacts.ts', ".join(' + ')", ".join(', ')", 'artefatti: lo storico unisce i nomi con una virgola'],
    ['artefatti', 'src/services/artifacts.ts', '            publishOnImport: first.target.publishOnImport,', '', 'artefatti: lo storico non riporta il publish del primo Target'],
    ['artefatti', 'src/services/artifacts.ts', "status: written.complete ? 'ok' : 'failed',", "status: 'ok',", 'artefatti: un salvataggio incompleto risulta ok nello storico'],
    ['artefatti', 'src/services/artifacts.ts', '            valid: tr.valid,\n', '            valid: true,\n', 'artefatti: lo storico dice sempre valido un Target'],
    ['artefatti', 'src/services/packaging.ts', "    if (!t) throw new Error(`No target at position ${index}.`);", "    if (!t) return r.targets[0] as never;", 'artefatti: una posizione inesistente non da errore'],
    ['artefatti', 'src/services/packaging.ts', "        valid: r.valid,\n        versionChange: r.versionChange,\n    };\n}\n\n/**\n * Un solo suffisso", "        valid: t.valid,\n        versionChange: r.versionChange,\n    };\n}\n\n/**\n * Un solo suffisso", 'artefatti: la vista dice valido un Target anche se il giro non lo e\''],
    // -- spec 016: schermata dei Target
    ['schermata', 'src/app.ts', "return state.targets.filter(t => state.selectedTargets.includes(t.name));", "return state.targets.filter(() => true);", "schermata: tutti i Target risultano spuntati"],
    ['schermata', 'src/app.ts', "return list.find(t => t.name === state.activeTargetName) ?? list[0] ?? null;", "return list.find(t => t.name === state.activeTargetName) ?? list[list.length - 1] ?? null;", "schermata: il Target mostrato di default e' l'ultimo"],
    ['schermata', 'src/app.ts', "    return state.publishByTarget.get(target)?.[schemaName]\n        ?? state.targets.find(t => t.name === target)?.publishOnImport ?? 'keep';", "    return state.targets.find(t => t.name === target)?.publishOnImport\n        ?? state.publishByTarget.get(target)?.[schemaName] ?? 'keep';", "schermata: il default del Target batte l'eccezione dell'agent"],
    ['schermata', 'src/app.ts', "if (state.selectionFor !== sol.uniqueName) {", "if (false) {", "schermata: le spunte salvate non si rileggono"],
    ['schermata', 'src/app.ts', "saveSelection(state.connectionName, sol.uniqueName, selectedTargetList()", "saveSelection(state.connectionName, 'x', selectedTargetList()", "schermata: le spunte si salvano sotto un'altra solution"],
    ['schermata', 'src/app.ts', "nextBtn.disabled = selectedTargetList().length === 0 || noAgents || versionIssue() !== null;", "nextBtn.disabled = noAgents || versionIssue() !== null;", "schermata: Next resta acceso senza Target spuntati"],
    ['schermata', 'src/app.ts', "state.selectedTargets = [...state.selectedTargets, name.trim()];", "state.selectedTargets = [...state.selectedTargets];", "schermata: un Target aggiunto non viene spuntato"],
    ['schermata', 'src/app.ts', "state.selectedTargets = state.selectedTargets.map(n => (n === from ? to : n));", "state.selectedTargets = state.selectedTargets;", "schermata: rinominare fa perdere la spunta"],
    ['schermata', 'src/app.ts', "state.selectedTargets = state.selectedTargets.filter(n => n !== gone);", "state.selectedTargets = state.selectedTargets;", "schermata: un Target rimosso resta spuntato"],
    ['schermata', 'src/app.ts', "persistTargets({ from, to });", "persistTargets();", "schermata: rinominare non porta con se' le spunte salvate"],
    ['schermata', 'src/app.ts', "addEmptyBtn.hidden = state.targets.some(t => t.name === '');", "addEmptyBtn.hidden = false;", "schermata: si puo' aggiungere piu' volte il Target senza suffisso"],
    ['schermata', 'src/app.ts', "if (selectedTargetList().some(t => t.name.trim() === '') && !(await confirmNoSuffix())) return;", "if (selectedTargetList().length > 0 && !(await confirmNoSuffix())) return;", "schermata: l'avviso del suffisso vuoto compare sempre"],
    ['schermata', 'src/app.ts', "runs.map(r => [r.name, r.publishOnImport, [...(r.agents ?? [])].sort(), r.publishByAgent]), state.options]);", "runs.map(r => [[...(r.agents ?? [])].sort(), r.publishByAgent]), state.options]);", "schermata: cambiare i Target non invalida il package preparato"],
    ['schermata', 'src/app.ts', "const result = await runPackagingTargets(sol.uniqueName, runs, [], state.options, setProgress)", "const result = await runPackagingTargets(sol.uniqueName, runs.slice(0, 1), [], state.options, setProgress)", "schermata: il giro usa solo il primo Target"],
    ['schermata', 'src/app.ts', "return state.options.keepSourceArtifacts ? n * 2 + 2 : n;", "return state.options.keepSourceArtifacts ? n * 2 : n;", "schermata: il conteggio degli archivi dimentica gli originali"],
    ['schermata', 'src/app.ts', "return labels.length > 1 ? [{ target: tr.target.name, labels }] : [];", "return [];", "schermata: i nomi misti non chiedono conferma"],
    ['schermata', 'src/app.ts', "const several = (state.packaging?.targets.length ?? 1) > 1;", "const several = false;", "schermata: la conferma dei nomi misti non dice in quale Target"],
    ['schermata', 'src/app.ts', "${deploys.length > 1 ? `", "${false ? `", "schermata: il risultato non elenca un archivio per Target"],
    ['schermata', 'src/app.ts', "    return Math.max(0, multi.targets.findIndex(t => t.target.name === name));", "    return 0;", "schermata: anteprima e controlli mostrano sempre il primo Target"],
    ['schermata', 'src/app.ts', "c.differing.filter(d => d.kind === 'agent-name').length", "c.differing.filter(d => d.kind === 'publish-on-import').length", "schermata: la tabella dei Target scambia nomi e publish"],
    ['schermata', 'src/app.ts', "state.targets = moveTarget(state.targets, i, i - 1);", "state.targets = moveTarget(state.targets, i, i + 1);", "schermata: il pulsante su sposta in giu'"],
    ['schermata', 'src/app.ts', "state.targetNotice = `Not saved, the list lasts only until you close the tool: ${describeError(err)}`;", "state.targetNotice = '';", "schermata: un salvataggio fallito non lo dice"],
    ['schermata', 'src/app.ts', "if (list.length < 2) return '';\n    const active = activeTarget();\n    return `<div class=\"segmented target-switch\"", "if (list.length < 1) return '';\n    const active = activeTarget();\n    return `<div class=\"segmented target-switch\"", "schermata: il selettore compare anche con un Target solo"],
    ['schermata', 'src/app.ts', "if (problem) { complain(problem); return; }", "if (false) { complain(problem); return; }", "schermata: si aggiunge un Target con un nome non valido"],
    ['schermata', 'src/app.ts', "if (problem) { complain(problem); el.value = target.name; return; }", "if (false) { complain(problem); el.value = target.name; return; }", "schermata: si rinomina in un nome non valido"],
    ['schermata', 'src/app.ts', "if (!newInput.value.trim()) { complain('Type a name for the target.'); return; }", "if (false) { complain('Type a name for the target.'); return; }", "schermata: Add con il campo vuoto crea un Target senza suffisso"],
    // -- spec 016 D8: agent e publish per Target
    ["motore", "src/services/packaging.ts", "target.agents ?? selectedAgents, targetOptions", "selectedAgents, targetOptions", "motore: D8: i Target usano sempre gli agent condivisi"],
    ["motore", "src/services/packaging.ts", "target.agents ?? selectedAgents, targetOptions", "target.agents ?? [], targetOptions", "motore: D8: un Target senza agent propri non rinomina nulla"],
    ["motore", "src/services/packaging.ts", "publishByAgent: target.publishByAgent ?? options.publishByAgent,", "publishByAgent: options.publishByAgent,", "motore: D8: l'eccezione del Target e' ignorata"],
    ["motore", "src/services/packaging.ts", "publishByAgent: target.publishByAgent ?? options.publishByAgent,", "publishByAgent: { ...options.publishByAgent, ...target.publishByAgent },", "motore: D8: le eccezioni condivise si sommano a quelle del Target"],
    ["motore", "src/services/packaging.ts", "publishByAgent: target.publishByAgent ?? options.publishByAgent,", "publishByAgent: target.publishByAgent || undefined,", "motore: D8: senza eccezioni proprie non valgono quelle condivise"],
    ["artefatti", "src/services/artifacts.ts", "publishByAgent: tr.target.publishByAgent ?? options.publishByAgent ?? {},", "publishByAgent: options.publishByAgent ?? {},", "artefatti: D8: il manifest riporta le eccezioni condivise e non quelle del Target"],
    ["artefatti", "src/services/artifacts.ts", "publishByAgent: first.target.publishByAgent ?? options.publishByAgent,", "publishByAgent: options.publishByAgent,", "artefatti: D8: lo storico riporta le eccezioni condivise e non quelle del primo Target"],
    // -- spec 016 D8: la schermata con agent e publish per Target
    ['schermata', "src/app.ts", "return solutionAgents().filter(a => !out?.has(a.id));", "return solutionAgents();", "schermata: D8 UI: gli agent esclusi di un Target non contano"],
    ['schermata', "src/app.ts", "?? state.targets.find(t => t.name === target)?.publishOnImport ?? 'keep';", "?? 'keep';", "schermata: D8 UI: il default di publish del Target non vale per gli agent"],
    ['schermata', "src/app.ts", "state.publishByTarget.set(target, { ...(state.publishByTarget.get(target) ?? {}), [schemaName]: mode });", "state.publishByTarget.set('', { ...(state.publishByTarget.get('') ?? {}), [schemaName]: mode });", "schermata: D8 UI: il publish per agent finisce sempre sullo stesso Target"],
    ['schermata', "src/app.ts", "agents: selectedAgents(t.name).map(a => a.schemaName),", "agents: selectedAgents().map(a => a.schemaName),", "schermata: D8 UI: il giro usa gli agent del Target mostrato per tutti"],
    ['schermata', "src/app.ts", "publishByAgent: { ...(state.publishByTarget.get(t.name) ?? {}) },", "publishByAgent: {},", "schermata: D8 UI: il giro ignora le eccezioni di publish per agent"],
    ['schermata', "src/app.ts", "runs.map(r => [r.name, r.publishOnImport, [...(r.agents ?? [])].sort(), r.publishByAgent]), state.options]);", "runs.map(r => [r.name, r.publishOnImport, r.publishByAgent]), state.options]);", "schermata: D8 UI: cambiare gli agent di un Target non invalida il package preparato"],
    ['schermata', "src/app.ts", "if (map.has(from)) { map.set(to, map.get(from)); map.delete(from); }", "if (map.has(from)) { map.delete(from); }", "schermata: D8 UI: rinominare un Target gli fa perdere le scelte"],
    ['schermata', "src/app.ts", "if (gone !== undefined) { state.excludedByTarget.delete(gone); state.publishByTarget.delete(gone); }", "", "schermata: D8 UI: un Target rimosso lascia le sue scelte a chi riprende il nome"],
    ['schermata', "src/app.ts", "const noAgents = selectedTargetList().some(t => selectedAgents(t.name).length === 0);", "const noAgents = false;", "schermata: D8 UI: Next resta acceso con un Target senza agent"],
    ['schermata', "src/app.ts", "            if ((el as HTMLInputElement).checked) out.delete(el.dataset.agent!);\n            else out.add(el.dataset.agent!);", "            out.delete(el.dataset.agent!);", "schermata: D8 UI: togliere la spunta a un agent non lo esclude"],
    ['schermata', "src/app.ts", "setAllAgents(owner, sel.dataset.select === 'all');", "setAllAgents(owner, true);", "schermata: D8 UI: Deselect all seleziona"],
    ['schermata', "src/app.ts", "setAllAgents(target, (el as HTMLInputElement).checked);", "setAllAgents(target, true);", "schermata: D8 UI: la casella dell'intestazione seleziona sempre"],
    ['schermata', "src/app.ts", "for (const a of selectedAgents(owner.name)) setPublishMode(owner.name, a.schemaName, toggle.dataset.publishAll as PublishMode);", "for (const a of selectedAgents()) setPublishMode(owner.name, a.schemaName, toggle.dataset.publishAll as PublishMode);", "schermata: D8 UI: «per tutti» usa gli agent del Target mostrato"],
    ['schermata', "src/app.ts", "const picked = selectedAgents('');", "const picked = selectedAgents();", "schermata: D8 UI: l'avviso del suffisso vuoto usa gli agent del Target mostrato"],
    ['schermata', "src/app.ts", "        state.excludedByTarget.clear();\n        state.publishByTarget.clear();\n        state.options.publishByAgent = {};\n        resetVersionPlan();\n        state.selectedTargets = [];", "        state.publishByTarget.clear();\n        state.options.publishByAgent = {};\n        resetVersionPlan();\n        state.selectedTargets = [];", "schermata: D8 UI: cambiando solution le esclusioni restano"],
    ['schermata', "src/app.ts", ".filter(a => state.excludedByTarget.get(activeSuffix())?.has(a.id))", ".filter(a => false)", "schermata: D8 UI: la revisione non elenca gli agent lasciati com'erano"],
    ['schermata', "src/app.ts", "${mixed.length > 1 ? mixedSuffixHtml(mixed, target.name) : ''}`;", "${mixed.length > 1 ? mixedSuffixHtml(mixed) : ''}`;", "schermata: D8 UI: l'avviso dei nomi misti elenca gli agent del Target sbagliato"],
    ['schermata', "src/app.ts", "${on ? `<div class=\"target-agents\" data-agents-for=\"${i}\">${agentRowsHtml(t)}</div>` : ''}", "<div class=\"target-agents\" data-agents-for=\"${i}\">${agentRowsHtml(t)}</div>", "schermata: D8 UI: la tabella compare anche per i Target non spuntati"],
    ['schermata', "src/app.ts", "const out = state.excludedByTarget.get(name);\n    return solutionAgents().filter(a =>\n        out?.has(a.id) &&", "const out = state.excludedByTarget.get('');\n    return solutionAgents().filter(a =>\n        out?.has(a.id) &&", "schermata: D8 UI: i nomi misti guardano le esclusioni del Target senza suffisso"],
    // -- spec 016 D9: publish del Target a pulsanti, Restore, riepilogo nei popup
    ["targets", "src/services/targets.ts", "return DEFAULT_TARGET_NAMES.filter(n => !have.has(n.toLowerCase()));", "return DEFAULT_TARGET_NAMES.filter(n => have.has(n.toLowerCase()));", "targets: D9: i preset mancanti sono quelli presenti"],
    ["targets", "src/services/targets.ts", "const have = new Set(list.map(t => t.name.toLowerCase()));", "const have = new Set(list.map(t => t.name));", "targets: D9: il ripristino distingue le maiuscole"],
    ["targets", "src/services/targets.ts", "return [...list, ...missingPresets(list).map(", "return [...missingPresets(list).map(", "targets: D9: il ripristino mette i preset in testa e perde la lista"],
    ["targets", "src/services/targets.ts", "missingPresets(list).map(name => ({ name, publishOnImport: 'keep' as PublishMode }))];", "missingPresets(list).map(name => ({ name, publishOnImport: 'force-true' as PublishMode }))];", "targets: D9: i preset ripristinati partono con un publish diverso"],
    ["schermata", "src/app.ts", "            state.publishByTarget.delete(owner.name);\n            persistTargets();", "            persistTargets();", "schermata: D9 UI: cambiare il publish del Target lascia le eccezioni degli agent"],
    ["schermata", "src/app.ts", "restoreBtn.disabled = missingPresets(state.targets).length === 0;", "restoreBtn.disabled = false;", "schermata: D9 UI: Restore resta acceso con la lista completa"],
    ["schermata", "src/app.ts", "        state.targets = restoreDefaults(state.targets);", "        state.targets = state.targets;", "schermata: D9 UI: Restore non rimette nulla"],
    ["schermata", "src/app.ts", "if (new Set(modes).size <= 1) return PUBLISH_LABELS[modes[0] ?? 'keep'];", "if (true) return PUBLISH_LABELS[modes[0] ?? 'keep'];", "schermata: D9 UI: il riepilogo non dice mai «Mixed»"],
    ["schermata", "src/app.ts", "<td>${selectedAgents(t.name).length} of ${total}</td>", "<td>${selectedAgents().length} of ${total}</td>", "schermata: D9 UI: il riepilogo conta gli agent del Target mostrato"],
    ["schermata", "src/app.ts", "<td><code>${escapeHtml(packageFileName(sol, t.name, 'managed'))}</code></td>", "<td><code>${escapeHtml(packageFileName(sol, t.name, 'unmanaged'))}</code></td>", "schermata: D9 UI: il riepilogo indica l'unmanaged da importare"],
    ["schermata", "src/app.ts", "    const several = selectedTargetList().length > 1;\n    const picked = selectedAgents('');", "    const several = false;\n    const picked = selectedAgents('');", "schermata: D9 UI: il dialogo del suffisso vuoto non elenca i Target"],
    ["schermata", "src/app.ts", "            ${selectedTargetList().length > 1 ? `\n            <p>Then it exports", "            ${selectedTargetList().length > 0 ? `\n            <p>Then it exports", "schermata: D9 UI: il dialogo della versione parla di piu' package anche con uno solo"],
    ["schermata", "src/app.ts", "        wide: several,\n", "        wide: false,\n", "schermata: D9 UI: il dialogo del suffisso vuoto resta stretto con la tabella"],
    ["schermata", "src/app.ts", "        wide: selectedTargetList().length > 1,\n", "        wide: false,\n", "schermata: D9 UI: il dialogo della versione resta stretto con la tabella"],
];

const only = process.argv[2];
const originals = new Map();
const restore = () => { for (const [file, text] of originals) writeFileSync(at(file), text); originals.clear(); };
process.on('SIGINT', () => { restore(); process.exit(130); });
process.on('SIGTERM', () => { restore(); process.exit(143); });

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
