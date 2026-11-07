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

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const at = p => join(root, p);

/** `from` puo' essere una stringa o una RegExp; la prima occorrenza viene sostituita. */
const MUTATIONS = [
    // ── riscritte sul codice di oggi (selezione per Target, spec 018/019)
    ["app.ts", "src/app.ts", "if (selectedTargetList().some(needsNoSuffixWarning) && !(await confirmNoSuffix(sol))) return;", "if (!(await confirmNoSuffix(sol))) return;", "nosuffix: l'avviso compare anche con un suffisso"],
    ["app.ts", "src/app.ts", "if (selectedTargetList().some(needsNoSuffixWarning) && !(await confirmNoSuffix(sol))) return;", "", "nosuffix: nessun avviso"],
    ["app.ts", "src/app.ts", "if (selectedTargetList().some(needsNoSuffixWarning) && !(await confirmNoSuffix(sol))) return;", "if (selectedTargetList().some(needsNoSuffixWarning)) await confirmNoSuffix(sol);", "nosuffix: annullare va avanti lo stesso"],
    ["targets.ts", "src/services/targets.ts", "t.name.trim() === '' && !isProductionTarget(t)", "t.name === '' && !isProductionTarget(t)", "nosuffix: gli spazi non contano come vuoto"],
    ["app.ts", "src/app.ts", "${mixed.length > 1 ? mixedSuffixHtml(mixed, target.name) : ''}", "", "suffissi misti: nessun avviso nella scheda del Target"],
    ["app.ts", "src/app.ts", "if (mixed.length > 1) out.push(mixedSuffixHtml(mixed, t.name));", "", "suffissi misti: nessun avviso nel dialogo di conferma"],
    ["app.ts", "src/app.ts", "p.hidden = folded || p.dataset.pane !== want;", "p.hidden = folded || p.dataset.pane === want;", "diffui: i pannelli delle schede sono invertiti"],
    ["app.ts", "src/app.ts", "${!closed && tab === 'table' ? '' : ' hidden'}>", " hidden>", "diffui: la scheda Table non si apre"],
    ["app.ts", "src/app.ts", "${deploys.length > 1 ? 'To import, one managed archive per environment'", "${false ? 'To import, one managed archive per environment'", "schermata: il risultato non elenca un archivio per Target"],
    ["stepper", "src/styles.css", ".stepper-item.active { color: var(--color-text-strong); font-weight: 400; font-size: var(--fs-md); }", ".stepper-item.active { color: var(--color-text-strong); font-weight: 400; font-size: inherit; }", "stepper: l'etichetta corrente non e' in evidenza"],
    // ── diff.ts (spec 019)
    ['diff', 'src/services/diff.ts', "if (lines[lines.length - 1] === '') lines.pop();", "", 'diff: il \\n finale crea una riga vuota'],
    ['diff', 'src/services/diff.ts', "text.replace(/\\r\\n/g, '\\n')", "text", 'diff: CRLF e LF risultano diversi'],
    ['diff', 'src/services/diff.ts', "while (p < a.length && p < b.length && a[p] === b[p]) p++;", "", 'diff: il prefisso comune non si toglie'],
    ['diff', 'src/services/diff.ts', "dp[(i + 1) * w + j]! >= dp[i * w + j + 1]!", "dp[(i + 1) * w + j]! < dp[i * w + j + 1]!", 'diff: la LCS sceglie il ramo sbagliato'],
    ['diff', 'src/services/diff.ts', "if (n * m <= MAX_CELLS) {", "if (false) {", 'diff: la LCS non viene mai usata'],
    ['diff', 'src/services/diff.ts', "const pairs = Math.min(dels.length, inss.length);", "const pairs = 0;", 'diff: tolte e aggiunte non si abbinano'],
    ['diff', 'src/services/diff.ts', "if (j - i === 1) rows.push(all[i]!);", "if (false) rows.push(all[i]!);", 'diff: un salto nasconde una sola riga'],
    ['diff', 'src/services/diff.ts', "if (seen >= maxChanged) break;", "", 'diff: il limite di righe non vale'],
    ['diff', 'src/services/diff.ts', "hidden: changeRows.length - seen", "hidden: 0", 'diff: le righe nascoste non si contano'],
    ['diff', 'src/services/diff.ts', "const removed = changeRows.filter(r => r.oldNo !== null).length;", "const removed = changeRows.filter(r => r.kind === 'removed').length;", 'diff: le righe cambiate non contano come tolte'],
    ['diff', 'src/services/diff.ts', "while (start > 0 && isWord(oldText[start - 1])) start--;", "", 'diff: il tratto non si allarga alla parola (inizio)'],
    ['diff', 'src/services/diff.ts', "while (isWord(oldText[endOld])) { endOld++; endNew++; }", "", 'diff: il tratto non si allarga alla parola (fine)'],
    ['diff', 'src/services/diff.ts', "if (file.toLowerCase().endsWith('.json'))", "if (false)", 'diff: i JSON non si rientrano'],
    ['diff', 'src/services/diff.ts', "text.replace(/^﻿/, '')", "text", 'diff: il BOM rompe il JSON'],
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
    ["app.ts", "src/app.ts", "<td>${escapeHtml(publishSummary(t.name))}</td>", "<td>Leave as is</td>", "la revisione mostra sempre \"Leave as is\""],
    ['app.ts', 'src/app.ts', 'const changedEntries = pkg.entries.length - r.managed.expectedIdenticalEntries;', 'const changedEntries = 1;', 'il banner dice sempre "1 entry"'],
    ['app.ts', 'src/app.ts', 'if (state.browsingSolutionId !== solutionId) {', 'if (false) {', 'cambiando solution lo stato non si azzera'],
    ['app.ts', 'src/app.ts', 'state.options.publishByAgent = {};', '', 'cambiando solution i publish per agent restano'],
    ['app.ts', 'src/app.ts', 'state.highlightAgentId = highlightAgentId;', "state.highlightAgentId = '';", 'la ricerca non evidenzia l\'agent'],
    ['app.ts', 'src/app.ts', '<tfoot>', '<tbody>', 'le azioni globali non stanno piu\' nel piede della tabella'],
    ['app.ts', 'src/app.ts', "common === m ? ' is-active' : ''", "false ? ' is-active' : ''", 'il toggle "per tutti" non resta acceso'],
    ['app.ts', 'src/app.ts', '<td colspan="4" class="foot-cell">', '<td colspan="2" class="foot-cell">', 'il toggle "per tutti" non e\' sotto la colonna dei toggle'],
    ['app.ts', 'src/app.ts', '<table class="data-table data-table--fill">', '<table class="data-table">', 'la tabella non usa tutta la larghezza'],
    ["app.ts", "src/app.ts", " cell-nowrap\" title=\"${escapeHtml(next)}\">", "\" title=\"${escapeHtml(next)}\">", "il nome risultante puo' andare a capo"],
    ['app.ts', 'src/app.ts', '${sol && sol.exportable ? `', '${sol ? `', 'il rename e\' offerto anche su una solution managed'],
    ['app.ts', 'src/app.ts', '<span class="agent-name">${escapeHtml(a.name)}</span>', '<span class="agent-name">${a.name}</span>', 'il nome dell\'agent non e\' sfuggito (HTML)'],
    // ── revisione, artefatti, avanzamento, anteprima per agent (v1.1.0)
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
    ["app.ts", "src/app.ts", "? '<strong>The only change to Dataverse is the solution version</strong>", "? '<strong>Nothing is written to Dataverse</strong>", "revisione: dice \"Nothing is written to Dataverse\" anche quando scrive la versione"],
    ["app.ts", "src/app.ts", ": '<strong>Nothing is written to Dataverse</strong>: the artifacts", ": '<strong>The only change to Dataverse is the solution version</strong>: the artifacts", "revisione: dice che scrive la versione anche quando non lo fa"],
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
    ['app.ts', 'src/app.ts', '(state.options.newVersion ?? state.versionFrom ?? sol.version)', 'sol.version', 'v1.1.0: i nomi degli archivi non portano la versione nuova'],
    ['app.ts', 'src/app.ts', "(raise ? [VERSION_PHASE, ...PACK_PHASES] : [...PACK_PHASES])", '[...PACK_PHASES]', 'v1.1.0: manca la fase "Raise the version in DEV"'],
    ['app.ts', 'src/app.ts', "if (!state.versionFrom || (!state.packaging && !state.versionTouched)) state.versionFrom = sol.version;", "if (!state.versionFrom) state.versionFrom = sol.version;", 'v1.1.0: la versione di partenza non si rilegge'],
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
    ['app.ts', "src/app.ts", "harness: 'Microsoft Copilot harness',", "harness: '',", "v1.1.0 (010): l'icona harness non ha etichetta"],
    ['app.ts', "src/app.ts", "    back.disabled = true;", "", "v1.1.5 (019): Back resta attivo mentre si esporta"],
    ['app.ts', "src/app.ts", "for (const t of selectedTargetList()) foldedAgentLists.add(t.name);", "void 0;", "v1.1.5 (019): Collapse all non ripiega nulla"],
    ['app.ts', "src/app.ts", "foldedAgentLists.clear();", "void 0;", "v1.1.5 (019): Expand all non riapre nulla"],
    ['app.ts', "src/app.ts", "harness: 'MCH',", "harness: 'GCH',", "v1.1.5 (019): la sigla del tipo harness cambia"],
    ['app.ts', "src/app.ts", "el.outerHTML = agentKindHtml(el.dataset.cardKind ?? '');", "void 0;", "v1.1.0 (010): il tipo non si riempie dopo la lettura"],
    ['app.ts', "src/app.ts", /<th>Agent<\/th>\s*<th>Agent type<\/th>/, "<th>Agent</th><th>Type</th>", "v1.1.0 (010): la colonna ha un altro titolo"],
    ['app.ts', "src/app.ts", "{ label: 'Version', value: pkg.version },", "{ label: 'Versione', value: pkg.version },", "v1.1.0 (011): un'etichetta in italiano"],
    ['app.ts', "src/app.ts", /\? '<span class="chip chip--muted">Managed<\/span>'/, "? '<span class=\"chip chip--muted\">Unmanaged</span>'", "v1.1.0 (011): una solution managed non lo dice"],
    ['app.ts', "src/app.ts", "{ label: 'Entries', value: String(pkg.entries.length) },", "{ label: 'Entry', value: String(pkg.entries.length) },", "v1.1.0 (011): etichetta dell'anteprima diversa dalle altre"],
    ['app.ts', "src/app.ts", "label: 'Checks', step: 'verify'", "label: 'Verifica', step: 'verify'", "v1.1.0 (011): il percorso non usa il nome del passo"],
    ['app.ts', "src/app.ts", "<dd${s.title ? ` title=\"${escapeHtml(s.title)}\"` : ''}>${escapeHtml(s.value)}", "<dd${s.title ? ` title=\"${escapeHtml(s.title)}\"` : ''}>${s.value}", "v1.1.0 (011): il valore di una tile diventa HTML"],
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
    ['targets', 'src/services/targets.ts', 'out.splice(at < 0 ? out.length : at, 0,', 'out.splice(out.length, 0,', 'targets: Restore defaults rimette i preset in coda invece che al loro posto'],
    ['schermata', 'src/styles.css', '.dialog--wide .dialog-body { max-height: calc(100vh - 190px); overflow-x: hidden; }', '.dialog--wide .dialog-body { max-height: 400px; }', 'schermata: il dialogo largo torna a 400px con barre di scorrimento'],
    ['schermata', 'src/styles.css', '.data-table.confirm-targets td { white-space: normal;', '.data-table.confirm-targets td { white-space: nowrap;', 'schermata: il nome del file non va a capo e allarga la tabella'],
    ["production", "src/app.ts", "selectedTargetList().some(needsNoSuffixWarning)", "selectedTargetList().some(t => t.name.trim() === '')", "production: l'avviso scatta anche per il Target marcato"],
    ["production", "src/services/targets.ts", "t.production === true && t.name.trim() === ''", "t.production === true", "production: un valore su un Target con nome conta come produzione"],
    ["production", "src/services/targets.ts", "t.name.trim() === '' && !isProductionTarget(t)", "t.name.trim() === ''", "production: il Target marcato serve ancora l'avviso"],
    ["production", "src/services/targets.ts", "return clean ? { ...rest, name: clean } : { ...t, name: clean };", "return { ...t, name: clean };", "production: rinominare con un nome non toglie la marcatura"],
    ["production", "src/services/targets.ts", "return clean ? { ...rest, name: clean } : { ...t, name: clean };", "return { ...rest, name: clean };", "production: un nome vuoto toglie la marcatura"],
    ["production", "src/services/targets.ts", "production === true && clean === ''", "production === true", "production: un valore salvato su un Target con nome e' riletto"],
    ["production", "src/services/targets.ts", "production === true && clean === ''", "false", "production: la marcatura salvata non si rilegge"],
    ["production", "src/services/targets.ts", "map[environment] = list.map(t => (isProductionTarget(t)", "map[environment] = list.map(t => (false", "production: la marcatura non si salva"],
    ["production", "src/services/targets.ts", "return production && !t.name.trim() ? { ...rest, production: true } : rest;", "return production ? { ...rest, production: true } : rest;", "production: un Target con nome si puo' marcare"],
    ["production", "src/services/targets.ts", "return production && !t.name.trim() ? { ...rest, production: true } : rest;", "return { ...rest, production: true };", "production: la casella non si puo' smarcare"],
    ["production", "src/app.ts", "state.targets = setTargetProduction(state.targets, i, (el as HTMLInputElement).checked);", "setTargetProduction(state.targets, i, (el as HTMLInputElement).checked);", "production: la casella non fa nulla"],
    ["production", "src/app.ts", "${t.name.trim() ? '' : `<label class=\"check target-prod\"", "${false ? '' : `<label class=\"check target-prod\"", "production: la casella compare anche sui Target con un nome"],
    ["production", "src/app.ts", "${isProductionTarget(t) ? 'checked' : ''}", "${''}", "production: la casella non mostra lo stato salvato"],
    ["production", "src/app.ts", "tick <strong>Production</strong>", "tick <strong>it</strong>", "production: il testo non spiega la casella"],
    ["review", "src/app.ts", "        if (long) {", "        if (false) {", "review: l'avviso sui 30 caratteri non compare"],
    ["review", "src/app.ts", "if (mixed.length > 1) out.push(mixedSuffixHtml(mixed, t.name));", "if (false) out.push(mixedSuffixHtml(mixed, t.name));", "review: l'avviso sui suffissi misti non compare"],
    ["review", "src/app.ts", "if (agents.every((a, i) => next[i] === a.name)) {", "if (false) {", "review: l'avviso «nessun cambio» non compare"],
    ["review", "src/app.ts", "next.filter(n => n.length > TEAMS_NAME_LIMIT).length", "next.filter(n => n.length >= TEAMS_NAME_LIMIT).length", "review: il limite dei 30 caratteri e' sbagliato di uno"],
    ["review", "src/app.ts", "const who = several ? `<strong>${escapeHtml(targetLabel(t.name))}</strong> ` : '';", "const who = '';", "review: l'avviso non dice di quale Target parla"],
    ["review", "src/app.ts", "${long === 1 ? '1 name is' : `${long} names are`}", "${`${long} names are`}", "review: il singolare dell'avviso e' sbagliato"],
    ["review", "src/app.ts", "                    ${targetsOverviewHtml(sol)}", "", "review: la tabella dei package non compare"],
    ["production", "src/styles.css", ".target-actions { margin-left: auto;", ".target-actions { margin-left: 0;", "production: i pulsanti di ordine non stanno piu' a destra"],
    ["polish", "src/services/ui.ts", "(opts.warning || opts.danger ? 'alert' : 'info')", "'info'", "polish: il popup di avviso ha l'icona di un popup semplice"],
    ["polish", "src/services/ui.ts", "icon(opts.icon ?? ", "icon(", "polish: l'icona scelta dal popup viene ignorata"],
    ["polish", "src/app.ts", "        icon: 'upload',\n", "", "polish: il popup della versione non sceglie la sua icona"],
    ["polish", "src/app.ts", "<dt>Environment</dt>", "<dt>Env</dt>", "polish: la riga dell'ambiente perde l'etichetta"],
    ["polish", "src/app.ts", "${icon('undo', 'icon--sm')}", "", "polish: la nota su come tornare indietro perde l'icona"],
    ["polish", "src/app.ts", "${icon('archive', 'icon--archive icon--xs')}<code>${escapeHtml(packageFileName(sol, t.name, 'managed'))}</code>", "<code>${escapeHtml(packageFileName(sol, t.name, 'managed'))}</code>", "polish: il file nella tabella dei package perde l'icona"],
    ["polish", "src/app.ts", "data-step=\"${i + 1}\"", "data-step=\"${i}\"", "polish: i passi della pipeline non partono da 1"],
    ["polish", "src/app.ts", "const mark = state === 'done' ? icon('check', 'icon--xs') : '';\n        return `<li class=\"ph ph--${state}\">", "const mark = '';\n        return `<li class=\"ph ph--${state}\">", "polish: il passo fatto non ha la spunta"],
    ["polish", "src/app.ts", "const state = i < phase ? 'done' : i === phase ? 'running' : 'todo';\n        const mark = state === 'done' ? icon('check', 'icon--xs') : '';\n        return `<li class=\"ph ph--${state}\">", "const state = i <= phase ? 'done' : i === phase ? 'running' : 'todo';\n        const mark = state === 'done' ? icon('check', 'icon--xs') : '';\n        return `<li class=\"ph ph--${state}\">", "polish: il passo in corso risulta gia' fatto"],
    ["polish", "src/styles.css", "    transform: scale(1.35);", "    transform: scale(1);", "polish: il passo in corso non si ingrandisce"],
    ["polish", "src/styles.css", ".ph--done .ph-dot::before { content: none; }", ".ph--done .ph-dot::before { content: attr(data-step); }", "polish: il numero resta accanto alla spunta"],
    ["polish", "src/styles.css", ".ph-dot::before { content: attr(data-step); }", ".ph-dot::before { content: ''; }", "polish: i passi non hanno il numero"],
    ["polish", "src/styles.css", "    animation: ph-ring 1.6s ease-out infinite;", "    animation: none;", "polish: il passo in corso non pulsa"],
    ["polish", "src/styles.css", "    .ph--running .ph-dot { animation: none; }\n", "    .ph--running .ph-dot { }\n", "polish: con meno animazioni il passo in corso pulsa lo stesso"],
    ["polish", "src/styles.css", "    flex: none; width: 32px; height: 32px; border-radius: 50%;", "    flex: none; width: 32px; height: 32px; border-radius: 4px;", "polish: l'icona del popup non sta in un cerchio"],
    ["polish", "src/styles.css", ".icon-info {", ".icon-info-x {", "polish: l'icona info non ha la sua forma"],
    ["polish", "src/index.html", "id=\"confirm-icon\" class=\"dialog-icon\"", "id=\"confirm-icon\" class=\"x\"", "polish: il popup non ha il posto per l'icona"],
    ["lean", "src/app.ts", "<span class=\"panel-sub\">tick the targets to build for</span>", "<span class=\"panel-sub\">tick the environments to build for; under each one, choose its agents and publish option</span>", "lean: il sottotitolo dei Target torna lungo"],
    ["lean", "src/app.ts", "<span class=\"foot-label\">Set for all ticked agents</span>", "<span class=\"hint\">Publish on import carries the new name to Teams and Microsoft 365 Copilot.</span><span class=\"foot-label\">Set for all ticked agents</span>", "lean: la frase sul publish torna sotto ogni tabella di agent"],
    ["lean", "src/app.ts", "The list is remembered for this environment.", "Drag the handle or use the arrows to reorder. The list is remembered for this environment.", "lean: torna la frase sul trascinamento"],
    ["lean", "src/app.ts", "Tick at least one to continue.</p>", "Tick at least one to continue. To move a solution unchanged between environments, use the native solution export or your ALM pipeline. This tool exists to rename agents: with none ticked there is nothing to build at all.</p>", "lean: «Nothing to rename» torna lungo"],
    ["lean", "src/app.ts", "'The one to import into UAT or PROD. Managed: no unmanaged layer.'],", "'The only one to import into UAT or PROD. Being managed, it creates no unmanaged layer in the target environment, which is the very problem this flow removes.'],", "lean: la descrizione del file managed torna lunga"],
    ["lean", "src/app.ts", "'The original unmanaged export, untouched.'],", "'The original unmanaged export: an untouched snapshot of the solution as it stood in the source environment, kept next to the patched one.'],", "lean: la descrizione del source unmanaged torna lunga"],
    ["lean", "src/app.ts", "What gets changed</h3>", "What gets changed</h3><span class=\"panel-sub\">grouped by agent</span>", "lean: il sottotitolo «grouped by agent» torna"],
    ["lean", "src/app.ts", "            icon: 'tag',\n", "", "lean: il popup dei suffissi diversi perde l'icona"],
    ["lean", "src/app.ts", "            icon: 'search',\n", "", "lean: il popup dei nomi inattesi perde l'icona"],
    ["lean", "src/app.ts", "            icon: 'package',\n", "", "lean: il popup dei componenti extra perde l'icona"],
    ["lean", "src/app.ts", "                icon: 'folder',\n", "", "lean: il popup della cartella esistente perde l'icona"],
    ["lean", "src/app.ts", "        icon: 'download',\n", "", "lean: il popup dell'esportazione del log perde l'icona"],
    ["lean", "src/app.ts", "Checks</h3>\n                <div id=\"target-switch-host\">", "Checks</h3><span class=\"panel-sub\">managed and unmanaged side by side</span>\n                <div id=\"target-switch-host\">", "lean: il sottotitolo «side by side» torna"],
    ["lean", "src/app.ts", "Package contents</h3>", "Package contents</h3><span class=\"panel-sub\">what travels on import</span>", "lean: il sottotitolo «what travels on import» torna"],
    ["production", "src/app.ts", "return state.targets.some(isProductionTarget) ? 'PROD' : 'no suffix';", "return 'no suffix';", "production: alias: il Target Production non si chiama PROD"],
    ["production", "src/app.ts", "return state.targets.some(isProductionTarget) ? 'PROD' : 'no suffix';", "return state.targets.length ? 'PROD' : 'no suffix';", "production: alias: ogni Target senza nome si chiama PROD"],
    ["production", "src/app.ts", "isProductionTarget(t) ? 'no suffix' : 'removes the suffix'", "'removes the suffix'", "production: alias: la tabella dice che il Target Production toglie il suffisso"],
    ["stepper", "src/app.ts", "const current = n === active ? ' aria-current=\"step\"' : '';", "const current = '';", "stepper: il passo corrente non ha aria-current"],
    ["stepper", "src/app.ts", "i + 1 < active ? ' done' : ''", "i < active ? ' done' : ''", "stepper: la linea si riempie un passo troppo presto"],
    ["stepper", "src/app.ts", "const mark = n < active ? icon('check') : String(n);", "const mark = String(n);", "stepper: i passi fatti non hanno la spunta"],
    ["stepper", "src/styles.css", "    transform: scale(1.25);\n    background: var(--color-primary);", "    transform: scale(1);\n    background: var(--color-primary);", "stepper: il cerchio corrente non e' piu' grande"],
    ["stepper", "src/styles.css", ".stepper-line.done::after { transform: scaleX(1); }", ".stepper-line.done::after { transform: scaleX(0); }", "stepper: la linea fatta resta vuota"],
    ["stepper", "src/styles.css", "box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-primary) 28%, transparent),", "box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-primary) 28%, transparent),", "stepper: il cerchio corrente non ha l'anello"],
    ["stepper", "src/styles.css", "    transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);\n}\n.stepper-line.done", "    transition: none;\n}\n.stepper-line.done", "stepper: la linea non si riempie con una transizione"],
    ["stepper", "src/styles.css", "    .stepper-dot, .stepper-item, .stepper-line::after { transition: none; }", "    .stepper-dot, .stepper-item, .stepper-line::after { }", "stepper: con meno animazioni le transizioni restano"],
    ["panels", "src/app.ts", "        if (!seenPanels.has(id)) {", "        if (true) {", "panels: il «ripiegato di partenza» vale a ogni visita"],
    ["panels", "src/app.ts", "            if (panel.dataset.collapsed === '1') collapsedPanels.add(id);\n", "", "panels: nessun riquadro parte ripiegato"],
    ["panels", "src/app.ts", "            if (collapsedPanels.has(id)) collapsedPanels.delete(id); else collapsedPanels.add(id);", "            collapsedPanels.add(id);", "panels: un riquadro ripiegato non si riapre"],
    ["panels", "src/app.ts", "closest('button, a, input, label, select, textarea, .segmented, .switch')", "closest('input')", "panels: i controlli nell'intestazione ripiegano il riquadro"],
    ["panels", "src/app.ts", "        info.setAttribute('aria-controls', `info-${id}`);\n", "", "panels: l'info non e' collegata alla sua striscia"],
    ["panels", "src/app.ts", "        bar.hidden = true;\n", "        bar.hidden = false;\n", "panels: la striscia info parte aperta"],
    ["panels", "src/app.ts", "toggle.setAttribute('aria-expanded', String(!closed));", "toggle.setAttribute('aria-expanded', String(closed));", "panels: aria-expanded del chevron e' invertito"],
    ["panels", "src/app.ts", "`${closed ? 'Expand' : 'Collapse'} ${title}`", "`${closed ? 'Collapse' : 'Expand'} ${title}`", "panels: l'etichetta del chevron e' invertita"],
    ["panels", "src/app.ts", "        if (end) end.classList.add('panel-head-end');\n", "", "panels: i controlli a destra non vengono spinti a destra"],
    ["panels", "src/app.ts", "        head.insertBefore(toggle, head.firstChild);", "        head.appendChild(toggle);", "panels: il chevron non e' il primo elemento"],
    ["panels", "src/app.ts", "lead.insertAdjacentElement('afterend', info);", "lead.insertAdjacentElement('beforebegin', info);", "panels: l'icona info sta prima del titolo"],
    ["panels", "src/app.ts", "    decoratePanels(els.stepVerify);\n", "", "panels: i controlli non hanno riquadri ripiegabili"],
    ["panels", "src/app.ts", "    decoratePanels(els.stepReview);\n", "", "panels: la revisione non ha riquadri ripiegabili"],
    ["panels", "src/app.ts", "    decoratePanels(els.stepSuffix);\n", "", "panels: il passo Suffix non ha riquadri ripiegabili"],
    ["panels", "src/app.ts", "        decoratePanels(panels);\n", "", "panels: l'anteprima non ha riquadri ripiegabili"],
    ["panels", "src/app.ts", "data-collapsed=\"${extra.length ? '0' : '1'}\"", "data-collapsed=\"1\"", "panels: Package contents e' ripiegato anche con componenti extra"],
    ["panels", "src/app.ts", "The version and the files chosen in the previous step, and whether anything is written to Dataverse.", "The version.", "panels: la spiegazione delle opzioni e' troppo corta"],
    ["panels", "src/styles.css", ".panel--collapsed > :not(.panel-head) { display: none; }", ".panel--collapsed > :not(.panel-head) { display: block; }", "panels: un riquadro ripiegato mostra ancora il contenuto"],
    ["panels", "src/styles.css", ".panel-infobar[hidden] { display: none; }", ".panel-infobar[hidden] { display: flex; }", "panels: la striscia info nascosta si vede"],
    ["panels", "src/styles.css", ".panel-toggle[aria-expanded=\"false\"] .icon { transform: rotate(-90deg); }", ".panel-toggle[aria-expanded=\"false\"] .icon { transform: rotate(0deg); }", "panels: il chevron non ruota"],
    ["panels", "src/styles.css", "gap: 10px; cursor: pointer; user-select: none; }", "gap: 10px; cursor: default; user-select: none; }", "panels: l'intestazione non sembra cliccabile"],
    ["panels", "src/styles.css", ".panel-head-end { margin-left: auto; }", ".panel-head-end { margin-left: 0; }", "panels: i controlli a destra restano a sinistra"],
    ["panels", "src/app.ts", "    decoratePanels(els.stepResult);\n", "", "panels: il risultato non ha riquadri ripiegabili"],
    ["diff", "src/services/diff.ts", "if (lines[lines.length - 1] === '') lines.pop();", "", "diff: l'a capo finale crea una riga vuota"],
    ["diff", "src/services/diff.ts", "if (a[p + i] === b[p + j]) { ops.push({ t: 'eq'", "if (a[p + i] !== b[p + j]) { ops.push({ t: 'eq'", "diff: le righe diverse risultano uguali"],
    ["diff", "src/services/diff.ts", "oldNo: op.a + 1, newNo: op.b + 1", "oldNo: op.a, newNo: op.b", "diff: i numeri di riga partono da 0"],
    ["diff", "src/services/diff.ts", "const pairs = Math.min(dels.length, inss.length);", "const pairs = 0;", "diff: le righe tolte e aggiunte non si affiancano"],
    ["diff", "src/services/diff.ts", "if (isWord(oldText[start - 1]) && (isWord(oldText[start]) || isWord(newText[start]))) {", "if (false) {", "diff: il tratto evidenziato non si allarga a sinistra alla parola"],
    ["diff", "src/services/diff.ts", "while (isWord(oldText[endOld])) { endOld++; endNew++; }", "while (false) { endOld++; endNew++; }", "diff: il tratto evidenziato non si allarga a destra alla parola"],
    ["diff", "src/services/diff.ts", "if (j - i === 1) rows.push(all[i]!);", "if (false) rows.push(all[i]!);", "diff: un salto di una sola riga nasconde la riga"],
    ["diff", "src/services/diff.ts", "if (i - d >= 0 && all[i - d]!.kind === 'context') keep[i - d] = true;", "if (false) keep[i - d] = true;", "diff: il contesto prima della modifica non si vede"],
    ["diff", "src/services/diff.ts", "if (i + d < all.length && all[i + d]!.kind === 'context') keep[i + d] = true;", "if (false) keep[i + d] = true;", "diff: il contesto dopo la modifica non si vede"],
    ["diff", "src/services/diff.ts", "if (seen >= maxChanged) break;", "if (seen > maxChanged) break;", "diff: il limite delle righe di modifica e' sbagliato di uno"],
    ["diff", "src/services/diff.ts", "hidden: changeRows.length - seen", "hidden: changeRows.length", "diff: le righe nascoste oltre il limite sono contate male"],
    ["diff", "src/services/diff.ts", "const added = changeRows.filter(r => r.newNo !== null).length;", "const added = changeRows.length;", "diff: le righe aggiunte sono contate male"],
    ["diff", "src/services/diff.ts", "const context = options.context ?? CONTEXT_LINES;", "const context = options.context ?? 1;", "diff: il contesto di partenza non e' di tre righe"],
    ["diff", "src/services/diff.ts", "export const MAX_CHANGED_LINES = 80;", "export const MAX_CHANGED_LINES = 81;", "diff: il limite di partenza non e' di 80 righe"],
    ["diff", "src/services/diff.ts", "if (!changeRows.length) return { rows: [], added: 0, removed: 0, hidden: 0 };", "", "diff: due testi uguali producono righe"],
    ["diff", "src/services/diff.ts", "if (!span) return { before: text, mid: '', after: '' };", "if (!span) return { before: '', mid: text, after: '' };", "diff: senza tratto tutta la riga risulta evidenziata"],
    ["diff", "src/services/diff.ts", "for (let k = 0; k < s; k++) ops.push({ t: 'eq', a: a.length - s + k, b: b.length - s + k });", "", "diff: il suffisso comune sparisce dal confronto"],
    ["diff", "src/services/diff.ts", "a[a.length - 1 - s] === b[b.length - 1 - s]", "a[a.length - 1 - s] !== b[b.length - 1 - s]", "diff: il suffisso comune si calcola al contrario"],
    ["diff", "src/services/diffView.ts", "'<': '&lt;'", "'<': '<'", "diff: il testo dei file non fa l'escape del <"],
    ["diff", "src/services/diffView.ts", "<span class=\"diff-file\">${esc(diff.file)}</span>", "<span class=\"diff-file\">${diff.file}</span>", "diff: il nome del file non fa l'escape"],
    ["diff", "src/services/diffView.ts", "<td colspan=\"4\"><span class=\"diff-gap-text\">${r.skipped} unchanged lines</span></td>", "<td colspan=\"3\"><span class=\"diff-gap-text\">${r.skipped} unchanged lines</span></td>", "diff: il salto non copre le quattro colonne"],
    ["diff", "src/services/diffView.ts", "if (!diff.rows.length) {", "if (false) {", "diff: un file senza modifiche mostra una tabella vuota"],
    ["diff", "src/services/diffView.ts", "${diff.hidden === 1 ? 'line' : 'lines'}", "${'lines'}", "diff: il singolare delle righe nascoste e' sbagliato"],
    ["diff", "src/services/diffView.ts", "return `${esc(before)}<mark class=\"diff-hl\">${esc(mid)}</mark>${esc(after)}`;", "return `${esc(before)}<span class=\"diff-hl\">${esc(mid)}</span>${esc(after)}`;", "diff: il tratto evidenziato non e' un mark"],
    ["diff", "src/services/diffView.ts", "if (!mid) return esc(text);", "", "diff: un tratto vuoto produce un mark vuoto"],
    ["diff", "src/services/diffView.ts", "aria-label=\"Changes in ${esc(diff.file)}\"", "aria-label=\"Changes\"", "diff: la tabella non dice di quale file parla"],
    ["diff", "src/services/diffView.ts", "if (r.oldNo !== null) {\n        out.push(", "if (false) {\n        out.push(", "diff: nel modo unified le righe tolte spariscono"],
    ["diff", "src/services/diff.ts", "text.replace(/\\r\\n/g, '\\n').split('\\n')", "text.split('\\n')", "diff: CRLF e LF non sono lo stesso testo"],
    ["diffui", "src/app.ts", "try { patched = applyPatch(pkg, r.plan).files; }", "try { patched = applyPatch(pkg, []).files; }", "diffui: il diff confronta il file con se stesso"],
    ["diffui", "src/app.ts", "[...new Set(changes.map(c => c.file))].sort();", "[...new Set(changes.map(c => c.file))].sort().reverse();", "diffui: i file del diff non sono in ordine"],
    ["diffui", "src/app.ts", "decode(patched![f])), diffMode)).join('');", "decode(patched![f])), 'split')).join('');", "diffui: il diff non segue il modo Split / Unified"],
    ["diffui", "src/app.ts", "const tab = changeTabs.get(key) ?? 'diff';", "const tab = changeTabs.get(key) ?? 'table';", "diffui: la scheda di partenza e' Table"],
    ["diffui", "src/app.ts", "            changeTabs.set(group.dataset.group ?? '', want);\n", "", "diffui: la scheda scelta non si conserva"],
    ["diffui", "src/app.ts", "b.setAttribute('aria-selected', String(on));", "b.setAttribute('aria-selected', String(!on));", "diffui: aria-selected delle schede e' invertito"],
    ["diffui", "src/app.ts", "diffMode = btn.dataset.diffMode === 'unified' ? 'unified' : 'split';", "diffMode = 'split';", "diffui: Unified non si attiva"],
    ["diffui", "src/app.ts", "diffMode = btn.dataset.diffMode === 'unified' ? 'unified' : 'split';\n            if (state.packaging) renderPreviewResult(", "diffMode = btn.dataset.diffMode === 'unified' ? 'unified' : 'split';\n            if (false) renderPreviewResult(", "diffui: cambiare modo non ridisegna il diff"],
    ["diffui", "src/app.ts", "const toolbar = perAgent.length ? `", "const toolbar = false ? `", "diffui: la barra Split / Unified non compare"],
    ["diffui", "src/app.ts", "aria-pressed=\"${diffMode === 'split'}\"", "aria-pressed=\"${diffMode === 'unified'}\"", "diffui: aria-pressed del pulsante Split e' invertito"],
    ["diffui", "src/app.ts", "fileDiff(f, decode(pkg.entries.find(e => e.path === f)?.data), decode(patched![f]))", "fileDiff(f, decode(patched![f]), decode(pkg.entries.find(e => e.path === f)?.data))", "diffui: prima e dopo sono scambiati"],
    ["diffui", "src/app.ts", "<div class=\"change-tabs\" role=\"tablist\" aria-label=\"View\">", "<div class=\"change-tabs\" role=\"list\" aria-label=\"View\">", "diffui: le schede non hanno il ruolo tablist"],
    ["diffui", "src/styles.css", ".change-pane[hidden] { display: none; }", ".change-pane[hidden] { display: block; }", "diffui: il pannello nascosto si vede"],
    ["diffui", "src/styles.css", ".diff-code--old { background: var(--diff-del-bg); }", ".diff-code--old { background: var(--diff-add-bg); }", "diffui: le righe tolte sono verdi"],
    ["diffui", "src/styles.css", ".diff-code--new { background: var(--diff-add-bg); }", ".diff-code--new { background: var(--diff-del-bg); }", "diffui: le righe aggiunte sono rosse"],
    ["diffui", "src/styles.css", ".diff-code--old .diff-hl { background: var(--diff-del-hl);", ".diff-code--old .diff-hl { background: var(--diff-add-hl);", "diffui: il tratto tolto e' evidenziato di verde"],
    ["diffui", "src/styles.css", ".diff-code { position: relative; padding: 0 12px 0 24px; white-space: pre;", ".diff-code { position: relative; padding: 0 12px 0 24px; white-space: normal;", "diffui: il codice del diff va a capo"],
    ["diffui", "src/styles.css", ".diff-scroll { overflow-x: auto; }", ".diff-scroll { overflow-x: visible; }", "diffui: una riga lunga allarga la pagina"],
    ["diffui", "src/styles.css", "    --diff-add-bg: rgba(30, 150, 70, 0.11);", "    --diff-add-bg: rgba(60, 190, 100, 0.15);", "diffui: il verde del tema chiaro e' come quello scuro"],
    ["diffui", "src/styles.css", "    --diff-add-hl: rgba(60, 190, 100, 0.34);", "    --diff-add-hl: rgba(60, 190, 100, 0.42);", "diffui: il tratto verde evidenziato del tema scuro e' troppo forte per il testo"],
    ["diffui", "src/styles.css", "    --diff-del-fg: #b3261e;", "    --diff-del-fg: #e57373;", "diffui: il conteggio rosso del tema chiaro non si legge"],
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
    ["targets", "src/services/targets.ts", "map[environment] = list.map(t => (isProductionTarget(t)", "map['*'] = list.map(t => (isProductionTarget(t)", "targets: la lista vale per ogni ambiente"],
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
    ["schermata", "src/app.ts", "selectedTargetList().some(needsNoSuffixWarning)", "selectedTargetList().length > 0", "schermata: l'avviso del suffisso vuoto compare sempre"],
    ['schermata', 'src/app.ts', "runs.map(r => [r.name, r.publishOnImport, [...(r.agents ?? [])].sort(), r.publishByAgent]), state.options]);", "runs.map(r => [[...(r.agents ?? [])].sort(), r.publishByAgent]), state.options]);", "schermata: cambiare i Target non invalida il package preparato"],
    ['schermata', 'src/app.ts', "const result = await runPackagingTargets(sol.uniqueName, runs, [], state.options, setProgress)", "const result = await runPackagingTargets(sol.uniqueName, runs.slice(0, 1), [], state.options, setProgress)", "schermata: il giro usa solo il primo Target"],
    ['schermata', 'src/app.ts', "return state.options.keepSourceArtifacts ? n * 2 + 2 : n;", "return state.options.keepSourceArtifacts ? n * 2 : n;", "schermata: il conteggio degli archivi dimentica gli originali"],
    ['schermata', 'src/app.ts', "return labels.length > 1 ? [{ target: tr.target.name, labels }] : [];", "return [];", "schermata: i nomi misti non chiedono conferma"],
    ['schermata', 'src/app.ts', "const several = (state.packaging?.targets.length ?? 1) > 1;", "const several = false;", "schermata: la conferma dei nomi misti non dice in quale Target"],
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
    ['schermata', "src/app.ts", "${mixed.length > 1 ? mixedSuffixHtml(mixed, target.name) : ''}`;", "${mixed.length > 1 ? mixedSuffixHtml(mixed) : ''}`;", "schermata: D8 UI: l'avviso dei nomi misti elenca gli agent del Target sbagliato"],
    ['schermata', "src/app.ts", "const out = state.excludedByTarget.get(name);\n    return solutionAgents().filter(a =>\n        out?.has(a.id) &&", "const out = state.excludedByTarget.get('');\n    return solutionAgents().filter(a =>\n        out?.has(a.id) &&", "schermata: D8 UI: i nomi misti guardano le esclusioni del Target senza suffisso"],
    // -- spec 016 D9: publish del Target a pulsanti, Restore, riepilogo nei popup
    ["targets", "src/services/targets.ts", "return DEFAULT_TARGET_NAMES.filter(n => !have.has(n.toLowerCase()));", "return DEFAULT_TARGET_NAMES.filter(n => have.has(n.toLowerCase()));", "targets: D9: i preset mancanti sono quelli presenti"],
    ["targets", "src/services/targets.ts", "const have = new Set(list.map(t => t.name.toLowerCase()));", "const have = new Set(list.map(t => t.name));", "targets: D9: il ripristino distingue le maiuscole"],
    ["targets", "src/services/targets.ts", "    const out = [...list];\n    const rank", "    const out: Target[] = [];\n    const rank", "targets: D9: il ripristino mette i preset in testa e perde la lista"],
    ["targets", "src/services/targets.ts", "0, { name, publishOnImport: 'keep' as PublishMode });", "0, { name, publishOnImport: 'force-true' as PublishMode });", "targets: D9: i preset ripristinati partono con un publish diverso"],
    ["schermata", "src/app.ts", "            state.publishByTarget.delete(owner.name);\n            persistTargets();", "            persistTargets();", "schermata: D9 UI: cambiare il publish del Target lascia le eccezioni degli agent"],
    ["schermata", "src/app.ts", "restoreBtn.disabled = missingPresets(state.targets).length === 0;", "restoreBtn.disabled = false;", "schermata: D9 UI: Restore resta acceso con la lista completa"],
    ["schermata", "src/app.ts", "        state.targets = restoreDefaults(state.targets);", "        state.targets = state.targets;", "schermata: D9 UI: Restore non rimette nulla"],
    ["schermata", "src/app.ts", "if (new Set(modes).size <= 1) return PUBLISH_LABELS[modes[0] ?? 'keep'];", "if (true) return PUBLISH_LABELS[modes[0] ?? 'keep'];", "schermata: D9 UI: il riepilogo non dice mai «Mixed»"],
    ["schermata", "src/app.ts", "<td>${selectedAgents(t.name).length} of ${total}</td>", "<td>${selectedAgents().length} of ${total}</td>", "schermata: D9 UI: il riepilogo conta gli agent del Target mostrato"],
    ["schermata", "src/app.ts", "<code>${escapeHtml(packageFileName(sol, t.name, 'managed'))}</code></td>", "<code>${escapeHtml(packageFileName(sol, t.name, 'unmanaged'))}</code></td>", "schermata: D9 UI: il riepilogo indica l'unmanaged da importare"],
    ["schermata", "src/app.ts", "    const several = selectedTargetList().length > 1;\n    const picked = selectedAgents('');", "    const several = false;\n    const picked = selectedAgents('');", "schermata: D9 UI: il dialogo del suffisso vuoto non elenca i Target"],
    ["schermata", "src/app.ts", "${n > 1 ? `\n            <p class=\"dlg-note\">", "${n > 0 ? `\n            <p class=\"dlg-note\">", "schermata: D9 UI: il dialogo della versione parla di piu' package anche con uno solo"],
    ["schermata", "src/app.ts", "        wide: several,\n", "        wide: false,\n", "schermata: D9 UI: il dialogo del suffisso vuoto resta stretto con la tabella"],
    ["schermata", "src/app.ts", "        wide: n > 1,\n", "        wide: false,\n", "schermata: D9 UI: il dialogo della versione resta stretto con la tabella"],
    // ── fold (spec 019, blocco D): elenchi ripiegabili, stepper, storico
    ["fold", "src/app.ts", "    const fold = agents.length > FOLD_AFTER;", "    const fold = agents.length >= FOLD_AFTER;", "fold: due agent hanno gia' l'intestazione che ripiega"],
    ["fold", "src/app.ts", "const FOLD_AFTER = 2;", "const FOLD_AFTER = 3;", "fold: la soglia sale a tre agent"],
    ["fold", "src/app.ts", "if (foldedAgentLists.has(owner.name)) foldedAgentLists.delete(owner.name); else foldedAgentLists.add(owner.name);", "foldedAgentLists.add(owner.name);", "fold: un elenco ripiegato non si riapre"],
    ["fold", "src/app.ts", "const closed = fold && foldedAgentLists.has(t.name);", "const closed = false;", "fold: lo stato ripiegato si perde al ridisegno"],
    ["fold", "src/app.ts", "const picked = agents.length - excludedOf(t.name).size;", "const picked = agents.length;", "fold: il conteggio ignora gli agent tolti"],
    ["fold", "src/app.ts", "const foldable = perAgent.length > FOLD_AFTER;", "const foldable = perAgent.length >= FOLD_AFTER;", "fold: l'anteprima ripiega gia' con due agent"],
    ["fold", "src/app.ts", "const closed = foldable && foldedChanges.has(key);", "const closed = false;", "fold: l'anteprima perde lo stato ripiegato al ridisegno"],
    ["fold", "src/app.ts", "p.hidden = closed || p.dataset.pane !== tab;", "p.hidden = p.dataset.pane !== tab;", "fold: il pulsante non nasconde le schede dell'agent"],
    ["fold", "src/app.ts", "p.hidden = folded || p.dataset.pane !== want;", "p.hidden = p.dataset.pane !== want;", "fold: cambiare scheda riapre un agent ripiegato"],
    ["fold", "src/app.ts", "        await clearHistory();", "        void 0;", "fold: Clear all non svuota lo storico"],
    [
        "fold", "src/app.ts", /(title: `Clear all[\s\S]*?\}\);\s*)if \(!ok\) return;/, "$1", "fold: Clear all cancella anche se si annulla",
    ],
    ["fold", "src/services/history.ts", "await mutate(() => []);", "await mutate(list => list.slice(1));", "fold: Clear all lascia una voce"],
    ["fold", "src/app.ts", "<span class=\"chip chip--muted\" id=\"history-count\">${list.length} ${list.length === 1 ? 'entry' : 'entries'}</span>", "<span class=\"chip chip--muted\" id=\"history-count\">${list.length} entries</span>", "fold: il conteggio dello storico non gestisce il singolare"],
    ["fold", "src/app.ts", ".split(' + ')", ".split(',')", "fold: i Target dello storico non sono chip separati"],
    ["fold", "src/app.ts", "return n > FOLD_AFTER\n", "return n > 99\n", "fold: gli agent dello storico non si ripiegano"],
    ["fold", "src/styles.css", ".step-header-row { padding-top: 14px; }", ".step-header-row { padding-top: 0; }", "fold: il cerchio dello stepper e' tagliato in alto"],
    ["fold", "src/styles.css", "padding: 12px 20px 12px 14px; }", "padding: 6px 4px; }", "fold: lo stepper non ha spazio per il bagliore"],
];

const only = process.argv.slice(2).find(a => !a.startsWith('--'));
const originals = new Map();
const restore = () => { for (const [file, text] of originals) writeFileSync(at(file), text); originals.clear(); };
process.on('SIGINT', () => { restore(); process.exit(130); });
process.on('SIGTERM', () => { restore(); process.exit(143); });

// Quali mutazioni girano, e l'avanzamento: un contatore, il tempo stimato e un file leggibile in ogni momento
// `chunk:K/N` prende il blocco K di N delle mutazioni di src/app.ts (le piu' numerose): blocchi esatti, senza buchi ne' doppioni
const chunk = /^chunk:(\d+)\/(\d+)$/.exec(only ?? '');
const appOnly = MUTATIONS.filter(([, file]) => file === 'src/app.ts');
const chunkSet = chunk
    ? new Set(appOnly.slice(Math.floor((Number(chunk[1]) - 1) * appOnly.length / Number(chunk[2])), Math.floor(Number(chunk[1]) * appOnly.length / Number(chunk[2]))))
    : null;
let todo = MUTATIONS.filter(m => chunkSet ? chunkSet.has(m) : (!only || m[1].includes(only) || m[4].includes(only)));

// `--changed-since=<ref>`: salta le mutazioni su codice identico alla versione gia' rilasciata (gia' verificato allora).
// Vale per ogni file di src: una mutazione resta solo se il testo che altera non esisteva (uguale) in <ref>,
// o se il file non esisteva. Cosi' si provano soltanto le funzioni toccate o nuove.
const since = process.argv.find(a => a.startsWith('--changed-since='))?.slice('--changed-since='.length);
if (since) {
    const lf = (text) => text.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
    const oldFiles = new Map();
    const oldText = (file) => {
        if (!oldFiles.has(file)) {
            const shown = spawnSync('git', ['show', `${since}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
            oldFiles.set(file, shown.status === 0 ? lf(shown.stdout) : null);
        }
        return oldFiles.get(file);
    };
    if (spawnSync('git', ['rev-parse', '--verify', `${since}^{commit}`], { cwd: root }).status !== 0) { console.error(`--changed-since: ${since} non e' un commit o un tag`); process.exit(2); }
    const before = todo.length;
    todo = todo.filter((m) => {
        const old = oldText(m[1]);
        if (old === null) return true;
        return !(typeof m[2] === 'string' ? old.includes(lf(m[2])) : m[2].test(old));
    });
    console.log(`--changed-since=${since}: ${before - todo.length} mutazioni su codice invariato saltate, ${todo.length} da provare`);
}
const progressFile = at('test-results/mutation-progress.txt');
const started = Date.now();
const fmt = ms => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
// Quale file di test ha scoperto ogni mutazione l'ultima volta: tiene le esecuzioni successive corte
const killersFile = at('test-results/mutation-killers.json');
let killers = {};
try { killers = JSON.parse(readFileSync(killersFile, 'utf8')); } catch { /* la prima volta non c'e' */ }
const saveKillers = () => { try { mkdirSync(dirname(killersFile), { recursive: true }); writeFileSync(killersFile, JSON.stringify(killers, null, 1)); } catch { /* e' solo un aiuto */ } };
const runSuite = files => spawnSync('npx', ['vitest', 'run', '--bail', '1', ...files], { cwd: root, shell: true, encoding: 'utf8' });

const results = [];
const writeProgress = (done) => {
    const survived = results.filter(r => r.status === 'SOPRAVVISSUTA').length;
    const stale = results.filter(r => r.status === 'ANCORA NON TROVATA').length;
    const elapsed = Date.now() - started;
    const eta = done ? (elapsed / done) * (todo.length - done) : 0;
    const text = `${done}/${todo.length} fatte, ${results.filter(r => r.status === 'scoperta').length} scoperte, ${survived} sopravvissute, ${stale} obsolete; `
        + `trascorsi ${fmt(elapsed)}, mancano circa ${fmt(eta)}; rimaste ${todo.length - done}
`;
    try { mkdirSync(dirname(progressFile), { recursive: true }); writeFileSync(progressFile, text); } catch { /* il file e' solo un aiuto */ }
    return text.trim();
};
console.log(`${todo.length} mutazioni da provare${only ? ` (filtro: ${only})` : ''}. Avanzamento anche in test-results/mutation-progress.txt
`);

for (const [, file, from, to, why] of todo) {
    const original = readFileSync(at(file), 'utf8');
    const match = typeof from === 'string' ? original.includes(from) : from.test(original);
    if (!match) {
        results.push({ why, file, status: 'ANCORA NON TROVATA' });
        console.log(`[${results.length}/${todo.length}] OBS ${file}: ${why}`);
        writeProgress(results.length);
        continue;
    }

    originals.set(file, original);
    try {
        writeFileSync(at(file), original.replace(from, to));
        // Prima solo il file di test che l'ha scoperta l'ultima volta (pochi secondi); l'intera suite solo se non basta
        let killed = false;
        const known = killers[why];
        if (known) killed = runSuite([known]).status !== 0;
        if (!killed) {
            const full = runSuite([]);
            killed = full.status !== 0;
            const failed = /FAIL\s+(test\/[^\s>]+\.test\.ts)/.exec(`${full.stdout}
${full.stderr}`);
            if (killed && failed && killers[why] !== failed[1]) { killers[why] = failed[1]; saveKillers(); }
        }
        results.push({ why, file, status: killed ? 'scoperta' : 'SOPRAVVISSUTA' });
    } finally {
        restore();
    }
    const tag = results.at(-1).status === 'scoperta' ? 'ok ' : 'KO ';
    console.log(`[${results.length}/${todo.length}] ${tag} ${file}: ${why}`);
    console.log(`        ${writeProgress(results.length)}`);
}

const bad = results.filter(r => r.status !== 'scoperta');
console.log(`\n${results.length - bad.length}/${results.length} difetti scoperti dalla suite (${fmt(Date.now() - started)})`);
if (bad.length) {
    console.log('\nDa sistemare:');
    for (const b of bad) console.log(`  - [${b.status}] ${b.file}: ${b.why}`);
    process.exit(1);
}
