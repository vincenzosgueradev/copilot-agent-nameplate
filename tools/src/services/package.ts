/**
 * Lettura del solution package.
 *
 * Struttura verificata su export reale il 2026-10-15 (research.md §9):
 *
 *   solution.xml                                  UniqueName, Version, Managed, Publisher
 *   customizations.xml                            vuoto per una solution di soli agent
 *   [Content_Types].xml
 *   bots/<schemaname>/bot.xml                     ← <name> = display name, UNICO punto da patchare
 *   bots/<schemaname>/configuration.json          publishOnImport, channels
 *   botcomponents/<schema>.<tipo>.<nome>/…        botcomponent.xml + data (YAML)
 *   environmentvariabledefinitions/<schema>/…     solo la definizione, mai i valori
 *
 * La lettura usa DOMParser perché è robusta. La **scrittura** non può usarlo: riserializzare
 * normalizzerebbe l'XML e farebbe divergere entry che devono restare byte-identiche (FR-070).
 * Il patch è quindi una sostituzione mirata su stringa, in patch.ts.
 */

import { strFromU8, unzipSync } from 'fflate';
import { computeFingerprint, detectDrift, findNameOccurrences } from './compat';
import { SUFFIX_MAX, type PackageContents, type PackageEntry, type PackagedAgent, type PackagedVariable } from '../types';

const decoder = new TextDecoder('utf-8', { fatal: false });

/** Suffisso riconosciuto: ` [X]` con X di 1–20 caratteri, il formato che il tool scrive (FR-071). */
const SUFFIX_RE = new RegExp(`\\s\\[([^\\]]{1,${SUFFIX_MAX}})\\]$`);

export class PackageFormatError extends Error {
    constructor(message: string, readonly file?: string) {
        super(message);
        this.name = 'PackageFormatError';
    }
}

/** Separa nome base e suffisso corrente leggendo **dal package**, mai da Dataverse (FR-071). */
export function splitSuffix(name: string): { baseName: string; currentSuffix: string | null } {
    const m = SUFFIX_RE.exec(name);
    if (!m) return { baseName: name, currentSuffix: null };
    return { baseName: name.slice(0, m.index), currentSuffix: m[1] };
}

function firstText(xml: string, tag: string): string | null {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const el = doc.getElementsByTagName(tag)[0];
    return el ? (el.textContent ?? '') : null;
}

export function readPackage(bytes: Uint8Array): PackageContents {
    const files = unzipSync(bytes);
    const text = (path: string): string => {
        const data = files[path];
        if (!data) throw new PackageFormatError(`entry mancante nel package: ${path}`, path);
        return decoder.decode(data);
    };

    if (!files['solution.xml']) {
        throw new PackageFormatError('il package non contiene solution.xml');
    }

    // ── solution.xml ────────────────────────────────────────────────────────
    const solutionXml = text('solution.xml');
    const doc = new DOMParser().parseFromString(solutionXml, 'application/xml');
    const manifest = doc.getElementsByTagName('SolutionManifest')[0];
    const pick = (tag: string): string => {
        const el = manifest?.getElementsByTagName(tag)[0];
        return el?.textContent?.trim() ?? '';
    };
    const publisher = manifest?.getElementsByTagName('Publisher')[0];
    const pubPick = (tag: string): string =>
        publisher?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';

    // ── agent ───────────────────────────────────────────────────────────────
    const botPaths = Object.keys(files).filter(p => /^bots\/[^/]+\/bot\.xml$/.test(p)).sort();
    if (!botPaths.length) {
        // Senza agent non c'è niente da rinominare: meglio fermarsi che consegnare una copia
        // identica all'originale spacciata per package patchato
        throw new PackageFormatError('the package holds no agent (no bots/ folder)');
    }

    const agents: PackagedAgent[] = botPaths.map(path => {
        const xml = text(path);
        const name = firstText(xml, 'name');
        if (name === null) {
            // Formato non riconosciuto: ci si ferma indicando il file, senza tentare
            // sostituzioni approssimative (FR-069)
            throw new PackageFormatError(
                `bot.xml non contiene l'elemento <name> nel formato atteso: il formato del package `
                + `may have changed. Check ${path} before proceeding.`, path);
        }
        const schemaName = new DOMParser().parseFromString(xml, 'application/xml')
            .documentElement?.getAttribute('schemaname') ?? '';
        const { baseName, currentSuffix } = splitSuffix(name);

        const configPath = path.replace(/bot\.xml$/, 'configuration.json');
        let publishOnImport: boolean | null = null;
        let channels: string[] = [];
        if (files[configPath]) {
            try {
                const cfg = JSON.parse(text(configPath)) as {
                    publishOnImport?: boolean;
                    channels?: { channelId?: string }[];
                };
                // `null` = campo assente, cioè "non specificato": 28 agent su 40 nell'environment
                // di riferimento, e il default all'import non è documentato (FR-090)
                publishOnImport = typeof cfg.publishOnImport === 'boolean' ? cfg.publishOnImport : null;
                channels = (cfg.channels ?? []).map(c => c.channelId ?? '').filter(Boolean);
            } catch {
                publishOnImport = null;
            }
        }
        return { schemaName, file: path, name, baseName, currentSuffix, publishOnImport, channels };
    });

    // ── environment variable (sola lettura, FR-089) ─────────────────────────
    const varPath = Object.keys(files).find(
        p => /^environmentvariabledefinitions\/[^/]+\/environmentvariabledefinition\.xml$/.test(p));
    let suffixVariable: PackagedVariable | null = null;
    if (varPath) {
        const xml = text(varPath);
        const schemaName = new DOMParser().parseFromString(xml, 'application/xml')
            .documentElement?.getAttribute('schemaname') ?? '';
        suffixVariable = {
            schemaName,
            file: varPath,
            type: firstText(xml, 'type') ?? '',
            defaultValue: firstText(xml, 'defaultvalue'),
        };
    }

    // ── entry ───────────────────────────────────────────────────────────────
    // Nessun compressType né timestamp: l'archivio viene ricostruito creando entry nuove
    // (FR-077), e solo il contenuto delle entry conta per la verifica (FR-095).
    const entries: PackageEntry[] = Object.keys(files).sort().map(path => ({
        path, data: files[path]!, patched: false,
    }));

    const fingerprint = computeFingerprint(files, text);
    const nameOccurrences = agents.flatMap(a =>
        findNameOccurrences(files, text, a.name, a.file));

    return {
        bytes,
        entries,
        uniqueName: pick('UniqueName'),
        version: pick('Version'),
        managed: pick('Managed') === '1',
        publisherUniqueName: pubPick('UniqueName'),
        publisherPrefix: pubPick('CustomizationPrefix'),
        agents,
        suffixVariable,
        inventory: buildInventory(files, agents.map(a => a.schemaName)),
        fingerprint,
        drift: detectDrift(fingerprint),
        nameOccurrences,
        exportMode: 'sync',     // sovrascritto dal chiamante con l'esito reale
        exportSeconds: 0,
    };
}

/**
 * Inventario del package: che cosa viaggia oltre all'agent.
 *
 * L'artefatto è la **solution intera** e all'import viaggia tutto. Qui si raggruppa per
 * cartella di primo livello; la classificazione fine e la conferma esplicita arrivano con
 * la Phase 8 (T060 → T063).
 */
function buildInventory(files: Record<string, Uint8Array>, agentSchemas: string[]) {
    const KIND: Record<string, string> = {
        'bots/': 'Agent',
        'botcomponents/': 'Agent component',
        'workflows/': 'Cloud flow',
        'environmentvariabledefinitions/': 'Environment variable',
        'connectionreferences/': 'Connection reference',
        'canvasapps/': 'Canvas app',
        'roles/': 'Security role',
        'entities/': 'Table',
    };
    const groups = new Map<string, string[]>();
    for (const path of Object.keys(files)) {
        if (!path.includes('/')) continue;             // solution.xml, customizations.xml, ...
        const top = path.slice(0, path.indexOf('/') + 1);
        const name = path.split('/')[1] ?? '';
        const list = groups.get(top) ?? [];
        if (name && !list.includes(name)) list.push(name);
        groups.set(top, list);
    }
    return [...groups.entries()].map(([path, names]) => ({
        path,
        // Una cartella che il tool non riconosce si mostra comunque, con il suo nome: ometterla
        // significherebbe non far vedere all'utente qualcosa che all'import viaggia lo stesso
        // (FR-092)
        kind: KIND[path] ?? `Sconosciuto (${path.replace(/\/$/, '')})`,
        componentType: path === 'bots/' ? 10212 : path === 'botcomponents/' ? 10213 : null,
        count: names.length,
        names,
        relatedToSelectedAgent: path === 'bots/'
            || (path === 'botcomponents/'
                && names.every(n => belongsToAgent(files, n, agentSchemas))),
    }));
}

/**
 * Un componente e' dell'agent che il suo `parentbotid` indica. Il prefisso del nome vale solo
 * se il padre manca: alcuni componenti creati da Copilot Studio (es.
 * `Default_FeedbackCollectionBotSettings_*`) non portano il nome dell'agent ma ne dipendono.
 */
function belongsToAgent(files: Record<string, Uint8Array>, component: string, agentSchemas: string[]): boolean {
    const xml = files[`botcomponents/${component}/botcomponent.xml`];
    const parent = xml
        ? /<parentbotid>\s*<schemaname>([^<]*)<\/schemaname>/.exec(strFromU8(xml))?.[1]?.trim()
        : undefined;
    return parent
        ? agentSchemas.includes(parent)
        : agentSchemas.some(s => component.startsWith(`${s}.`));
}
