/**
 * Impronta del formato del package e occorrenze del display name.
 *
 * In questa fase il modulo **calcola** e basta. Il confronto con la baseline, gli scostamenti
 * e il blocco sulle occorrenze impreviste arrivano con la Phase 6 (T046 → T050).
 *
 * Perché serve: il formato interno del package non è un contratto documentato da Microsoft.
 * Lo scenario pericoloso non è che `<name>` sparisca — in quel caso ci si ferma e si dice
 * quale file (FR-069) — ma che ne compaia **un secondo**: il patch riuscirebbe lo stesso,
 * incompleto e in silenzio (FR-096, research.md §14).
 */

import baseline from '../baseline/package-format.json';
import type { FormatDrift, FormatFingerprint, NameOccurrence } from '../types';

/** Nomi degli elementi figli diretti della radice di un documento XML. */
function childElementNames(xml: string): string[] {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const root = doc.documentElement;
    if (!root) return [];
    const names = new Set<string>();
    for (const el of Array.from(root.children)) names.add(el.nodeName);
    return [...names].sort();
}

/** Valore di `recognizer.$kind`: identifica l'architettura dell'agent (spec 009). */
export const NO_RECOGNIZER = '(none)';
function architectureOf(config: Record<string, unknown>): string {
    const r = config.recognizer;
    if (r && typeof r === 'object' && !Array.isArray(r)) {
        const kind = (r as { $kind?: unknown }).$kind;
        if (typeof kind === 'string' && kind) return kind;
    }
    return NO_RECOGNIZER;
}

export function computeFingerprint(
    files: Record<string, Uint8Array>,
    text: (path: string) => string,
): FormatFingerprint {
    const solutionXml = text('solution.xml');
    const doc = new DOMParser().parseFromString(solutionXml, 'application/xml');
    const root = doc.documentElement;

    const topLevelPaths = [...new Set(
        Object.keys(files).map(p => (p.includes('/') ? p.slice(0, p.indexOf('/') + 1) : p)),
    )].sort();

    // Come per le chiavi di configuration.json: gli elementi si leggono da **tutti** i file e si
    // uniscono. Un agent harness ha un solo componente, di feedback, senza `<name>`: guardare il
    // primo file trovato darebbe un esito diverso a seconda dell'ordine dello zip.
    const elementsOf = (re: RegExp): string[] => {
        const all = new Set<string>();
        for (const p of Object.keys(files)) if (re.test(p)) for (const n of childElementNames(text(p))) all.add(n);
        return [...all].sort();
    };
    // Le chiavi di configuration.json si leggono da **tutti** gli agent e si uniscono: con piu'
    // agent il primo file dello zip e' un'estrazione arbitraria, e un agent mai collegato a un
    // canale non scrive chiavi che un altro scrive. Una chiave "sparisce" solo se manca ovunque.
    const keySet = new Set<string>();
    const byArchitecture = new Map<string, Set<string>>();
    for (const path of Object.keys(files)) {
        if (!/^bots\/[^/]+\/configuration\.json$/.test(path)) continue;
        try {
            const parsed: unknown = JSON.parse(text(path));
            // Solo un oggetto ha chiavi di configurazione: un array o un valore semplice no
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const arch = architectureOf(parsed as Record<string, unknown>);
                const set = byArchitecture.get(arch) ?? new Set<string>();
                byArchitecture.set(arch, set);
                for (const k of Object.keys(parsed)) { keySet.add(k); set.add(k); }
            }
        } catch {
            // un JSON illeggibile non contribuisce chiavi; l'errore vero esce in readPackage
        }
    }
    const configurationKeys = [...keySet].sort();
    const configurationByArchitecture = Object.fromEntries(
        [...byArchitecture].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, [...v].sort()]));

    return {
        solutionPackageVersion: root?.getAttribute('SolutionPackageVersion') ?? '',
        platformStamps: {
            version: root?.getAttribute('version') ?? '',
            organizationVersion: root?.getAttribute('OrganizationVersion') ?? '',
            serviceabilityVersion: root?.getAttribute('CRMServerServiceabilityVersion') ?? '',
        },
        topLevelPaths,
        botElements: elementsOf(/^bots\/[^/]+\/bot\.xml$/),
        botComponentElements: elementsOf(/^botcomponents\/[^/]+\/botcomponent\.xml$/),
        configurationKeys,
        configurationByArchitecture,
    };
}

/** `botcomponents/<schema>.gpt.default/botcomponent.xml` → `<name>` contiene il nome base. */
function isKnownBaseNameHolder(path: string): boolean {
    return /^botcomponents\/[^/]+\.gpt\.default\/botcomponent\.xml$/.test(path);
}

/**
 * Cerca il display name come **testo esatto di un elemento XML** o **valore esatto di una
 * stringa JSON** — mai come sottostringa.
 *
 * Il perché della distinzione, misurato: il display name esatto compare in **1 entry su 34**,
 * ma lo schemaname compare in **31 su 34**. Una ricerca per sottostringa segnalerebbe mezzo
 * package a ogni esecuzione, e un rename per sostituzione lo distruggerebbe (research.md §14).
 */
export function findNameOccurrences(
    files: Record<string, Uint8Array>,
    text: (path: string) => string,
    displayName: string,
    ownBotPath: string,
): NameOccurrence[] {
    const found: NameOccurrence[] = [];
    if (!displayName) return found;

    for (const path of Object.keys(files)) {
        let content: string;
        try {
            content = text(path);
        } catch {
            continue;   // binario: non contiene testo da confrontare
        }
        if (!content.includes(displayName)) continue;

        if (path.endsWith('.json')) {
            for (const m of content.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)) {
                if (m[1] === displayName) {
                    found.push({
                        file: path, locator: 'valore JSON', value: displayName,
                        expected: false, willBePatched: false,
                    });
                }
            }
            continue;
        }

        // XML: solo il testo completo di un elemento, non un frammento
        for (const m of content.matchAll(/<([a-zA-Z0-9_:]+)(?:\s[^>]*)?>([^<]*)<\/\1>/g)) {
            if (m[2] !== displayName) continue;
            const tag = m[1];
            const isOwnName = path === ownBotPath && tag === 'name';
            // Il nome del componente GPT e' un posto noto, e il tool non lo tocca. Porta il nome
            // base per un agent rinominato dopo la creazione, ma il nome *intero* (suffisso
            // compreso) per uno creato gia' con il suffisso: in entrambi i casi non e' un
            // secondo display name sconosciuto, quindi non va segnalato come anomalia (FR-096)
            const isKnownBase = isKnownBaseNameHolder(path) && tag === 'name';
            // Il bot.xml di un ALTRO agent con lo stesso display name (Copilot Studio ammette nomi
            // duplicati nella stessa solution): e' il nome di quell'agent, non un secondo posto
            // del nostro. Lo patcha il suo controllo; se e' escluso resta com'e' per scelta.
            const isOtherAgentName = /^bots\/[^/]+\/bot\.xml$/.test(path) && tag === 'name';
            found.push({
                file: path,
                locator: `<${tag}>`,
                value: m[2],
                expected: isOwnName || isKnownBase || isOtherAgentName,
                willBePatched: isOwnName,
            });
        }
    }
    return found;
}

// ── Confronto con la baseline e con il packaging precedente (FR-097, FR-098) ──


/**
 * Confronta due elenchi e descrive cosa è comparso o sparito.
 * Volutamente testuale: serve a far leggere all'utente *che cosa* è cambiato, non a essere
 * processato da altro codice.
 */
function diffList(
    label: string,
    before: string[],
    after: string[],
    against: FormatDrift['against'],
    optional: string[] = [],
): FormatDrift[] {
    const out: FormatDrift[] = [];
    for (const x of after) {
        if (!before.includes(x) && !optional.includes(x)) {
            out.push({ against, kind: 'added', what: `${label}: appeared "${x}"`, blocking: false });
        }
    }
    for (const x of before) {
        // Un elemento opzionale e' serializzato solo quando ha un valore: la sua assenza
        // non e' uno scostamento di formato.
        if (!after.includes(x) && !optional.includes(x)) {
            out.push({ against, kind: 'removed', what: `${label}: disappeared "${x}"`, blocking: false });
        }
    }
    return out;
}

function compare(
    ref: {
        solutionPackageVersion: string;
        topLevelPaths: string[];
        botElements: string[];
        botComponentElements: string[];
        platformStamps?: FormatFingerprint['platformStamps'];
        optionalTopLevelPaths?: string[];
        optionalBotComponentElements?: string[];
    },
    actual: FormatFingerprint,
    against: FormatDrift['against'],
): FormatDrift[] {
    const out: FormatDrift[] = [];
    if (ref.solutionPackageVersion && ref.solutionPackageVersion !== actual.solutionPackageVersion) {
        out.push({
            against, kind: 'changed', blocking: false,
            what: `SolutionPackageVersion: ${ref.solutionPackageVersion} → ${actual.solutionPackageVersion}`,
        });
    }
    out.push(...diffList('top-level folders', ref.topLevelPaths, actual.topLevelPaths, against, ref.optionalTopLevelPaths));
    out.push(...diffList('bot.xml elements', ref.botElements, actual.botElements, against));
    out.push(...diffList('botcomponent.xml elements', ref.botComponentElements, actual.botComponentElements, against, ref.optionalBotComponentElements));

    // I timbri di versione cambiano a ogni aggiornamento di Dataverse: si segnalano, mai si bloccano
    if (ref.platformStamps && ref.platformStamps.version !== actual.platformStamps.version) {
        out.push({
            against, kind: 'changed', blocking: false,
            what: `platform version: ${ref.platformStamps.version} → ${actual.platformStamps.version}`,
        });
    }
    return out;
}

const profiles = baseline.configurationJson.profiles;
const archLabel = (recognizer: string) => profiles.find(p => p.recognizer === recognizer)?.label ?? recognizer;

/**
 * Le chiavi di `configuration.json` si confrontano **per architettura** (spec 009): ogni agent
 * col profilo della sua. Un'architettura senza profilo non produce una riga per chiave, ma una
 * sola che dice che non c'e' nulla con cui confrontarla.
 */
function configurationDriftAgainstBaseline(actual: FormatFingerprint): FormatDrift[] {
    const out: FormatDrift[] = [];
    const byArch = actual.configurationByArchitecture ?? {};
    for (const [recognizer, keys] of Object.entries(byArch)) {
        const profile = profiles.find(p => p.recognizer === recognizer);
        if (!profile) {
            out.push({
                against: 'baseline', kind: 'added', blocking: false,
                what: `configuration.json: unknown agent architecture "${recognizer}" — no baseline to compare its keys with (${keys.join(', ')})`,
            });
            continue;
        }
        out.push(...diffList(`configuration.json keys (${profile.label})`, profile.keys, keys, 'baseline', profile.optionalKeys));
    }
    return out;
}

/** Stesso confronto contro l'ultimo packaging; una registrazione senza raggruppamento non si confronta. */
function configurationDriftAgainstPrevious(previous: FormatFingerprint, actual: FormatFingerprint): FormatDrift[] {
    if (!previous.configurationByArchitecture || !actual.configurationByArchitecture) return [];
    const out: FormatDrift[] = [];
    for (const [recognizer, keys] of Object.entries(actual.configurationByArchitecture)) {
        const before = previous.configurationByArchitecture[recognizer];
        if (!before) {
            out.push({
                against: 'previous', kind: 'added', blocking: false,
                what: `configuration.json: agent architecture "${recognizer}" was not in the previous packaging`,
            });
            continue;
        }
        out.push(...diffList(`configuration.json keys (${archLabel(recognizer)})`, before, keys, 'previous'));
    }
    return out;
}

/**
 * Scostamenti rispetto alla baseline distribuita col tool e, se disponibile, all'impronta
 * dell'ultimo packaging della stessa solution.
 *
 * La baseline copre la **prima** esecuzione su un ambiente il cui formato è già cambiato;
 * lo storico evita di risegnalare uno scostamento già visto e accettato.
 */
export function detectDrift(
    actual: FormatFingerprint,
    previous?: FormatFingerprint | null,
): FormatDrift[] {
    const out = compare({
        solutionPackageVersion: baseline.solutionPackageVersion,
        topLevelPaths: baseline.topLevelPaths,
        botElements: baseline.botXml.elements,
        botComponentElements: baseline.botComponentXml.elements,
        optionalTopLevelPaths: baseline.optionalTopLevelPaths,
        optionalBotComponentElements: baseline.botComponentXml.optionalElements,
    }, actual, 'baseline');
    out.push(...configurationDriftAgainstBaseline(actual));

    if (previous) {
        out.push(...compare(previous, actual, 'previous'));
        out.push(...configurationDriftAgainstPrevious(previous, actual));
    }
    return out;
}

/** Numero di occorrenze del display name che la baseline si aspetta: una sola. */
export const EXPECTED_NAME_OCCURRENCES = baseline.expectedDisplayNameOccurrences;
