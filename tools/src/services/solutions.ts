/**
 * Lettura di solution e agent dall'environment connesso.
 *
 * Due regole che vengono da errori già pagati (FR-024, FR-025):
 *  1. La lista degli agent si ricava dalla tabella `bot`, mai partendo da `solutioncomponent`:
 *     un fallimento nella risoluzione della solution non deve mai nascondere un agent.
 *  2. `solutioncomponent` si filtra per `objectid` sugli id dei bot già noti, **mai** per un
 *     `componenttype` supposto: un valore sbagliato restituisce zero righe senza errore.
 */

import { fetchXml, queryAll, type Row } from './dataverse';
import { log } from './log';
import type { AgentListItem, Solution } from '../types';

const SYSTEM_SOLUTIONS = new Set(['Default', 'Active', 'Basic']);

/** Escape per i valori interpolati in FetchXML. */
function xmlValue(s: string): string {
    return s.replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/**
 * Contenitori di sistema che non devono comparire fra le solution selezionabili.
 * Si guarda anche il display name: "Common Data Services Default Solution" ha un
 * uniquename generato, quindi il solo uniquename non basta.
 */
export function isSystemSolution(s: Solution): boolean {
    if (SYSTEM_SOLUTIONS.has(s.uniqueName)) return true;
    return /default solution/i.test(s.friendlyName);
}

export interface FetchedData {
    agents: AgentListItem[];
    solutions: Solution[];
}

function toSolution(sol: Row): Solution {
    const pub = sol.publisherid as Row | undefined;
    const isManaged = (sol.ismanaged as boolean) ?? false;
    return {
        solutionId: sol.solutionid as string,
        uniqueName: (sol.uniquename as string) ?? '',
        friendlyName: (sol.friendlyname as string) ?? '',
        isManaged,
        isVisible: (sol.isvisible as boolean) ?? false,
        publisherPrefix: (pub?.customizationprefix as string) ?? 'new',
        publisherName: (pub?.friendlyname as string) ?? '',
        version: (sol.version as string) ?? '',
        createdOn: (sol.createdon as string) ?? '',
        agentCount: 0,
        // Una managed solution non è esportabile: non può essere sorgente di un packaging
        // ("You can't export managed solutions", FR-068).
        exportable: !isManaged,
    };
}

/**
 * Risolve a quale solution appartiene ogni agent. Best effort: un fallimento qui
 * non deve mai far sparire un agent dalla lista.
 */
async function buildSolutionMap(botIds: string[]): Promise<{
    byBotId: Map<string, Solution>;
    bySolutionId: Map<string, Solution>;
    ok: boolean;
}> {
    const byBotId = new Map<string, Solution>();
    const bySolutionId = new Map<string, Solution>();
    let ok = true;
    try {
        const sols = await queryAll(
            'solutions?$select=solutionid,uniquename,friendlyname,ismanaged,isvisible,version,createdon'
            + '&$expand=publisherid($select=customizationprefix,friendlyname)',
        );
        for (const sol of sols) bySolutionId.set(sol.solutionid as string, toSolution(sol));

        const idValues = botIds.map(id => `<value>${xmlValue(id)}</value>`).join('');
        const rows = await fetchXml(`
            <fetch top="5000">
              <entity name="solutioncomponent">
                <attribute name="objectid"/>
                <attribute name="solutionid"/>
                <filter>
                  <condition attribute="objectid" operator="in">${idValues}</condition>
                </filter>
              </entity>
            </fetch>`);

        // Quando un bot sta in più solution, si preferisce quella vera a Default/Active
        for (const row of rows) {
            const botId = row.objectid as string;
            const solId = (row['_solutionid_value'] ?? row.solutionid) as string;
            const sol = bySolutionId.get(solId);
            if (!botId || !sol) continue;
            const existing = byBotId.get(botId);
            if (!existing || isSystemSolution(existing)) byBotId.set(botId, sol);
        }
    } catch (err) {
        ok = false;
        log(`Impossibile risolvere le solution (gli agent restano elencati): ${err}`, 'warning');
    }
    return { byBotId, bySolutionId, ok };
}

/**
 * Elenca gli agent dell'environment e li arricchisce con la solution di appartenenza.
 *
 * `schemaname` è letto perché è la chiave che correla l'agent di Dataverse con la cartella
 * `bots/<schemaname>/` del package: è l'identità del componente e non cambia mai (FR-069).
 */
export async function fetchAgentsAndSolutions(strict: boolean): Promise<FetchedData> {
    const bots = await fetchXml(`
        <fetch>
          <entity name="bot">
            <attribute name="botid"/>
            <attribute name="name"/>
            <attribute name="schemaname"/>
            <attribute name="solutionid"/>
            <attribute name="statecode"/>
            <attribute name="createdon"/>
            <attribute name="modifiedon"/>
            <attribute name="publishedon"/>
            <order attribute="name"/>
          </entity>
        </fetch>`);
    if (!bots.length) return { agents: [], solutions: [] };

    const botIds = bots.map(b => b.botid as string).filter(Boolean);
    const { byBotId, bySolutionId, ok } = await buildSolutionMap(botIds);
    if (strict && !ok) throw new Error('the solution lookup failed');

    const agents = bots.map((b): AgentListItem => {
        const botId = b.botid as string;
        return {
            id: botId,
            name: (b.name as string) ?? '(unnamed)',
            schemaName: (b.schemaname as string) ?? '',
            solution: byBotId.get(botId) ?? bySolutionId.get(b.solutionid as string) ?? null,
            isActive: (b.statecode as number | undefined) !== 1,
            createdOn: (b.createdon as string) ?? '',
            modifiedOn: (b.modifiedon as string) ?? '',
            publishedOn: (b.publishedon as string) ?? '',
        };
    });
    for (const a of agents) {
        if (a.solution) a.solution.agentCount++;
    }
    return { agents, solutions: [...bySolutionId.values()] };
}

/** Una environment variable di tipo String presente nella solution. */
export interface SuffixVariableHint {
    schemaName: string;
    displayName: string;
}

/**
 * Cerca nella solution una environment variable di tipo String.
 *
 * **Sola lettura, e volutamente solo informativa**: il tool non la scrive né in Dataverse né
 * nel package. Serve ad avvisare del rischio di doppio suffisso, perché il nome sui canali
 * deriva già da `bot.name` e un *Channel display name suffix* nativo vi si sommerebbe
 * (`agenteTool1 [UAT] (UAT)`) — FR-089.
 */
export async function findSuffixVariable(solutionId: string): Promise<SuffixVariableHint | null> {
    try {
        const rows = await fetchXml(`
            <fetch top="50">
              <entity name="environmentvariabledefinition">
                <attribute name="schemaname"/>
                <attribute name="displayname"/>
                <filter>
                  <condition attribute="type" operator="eq" value="100000000"/>
                </filter>
                <link-entity name="solutioncomponent" from="objectid" to="environmentvariabledefinitionid">
                  <filter>
                    <condition attribute="solutionid" operator="eq" value="${xmlValue(solutionId)}"/>
                  </filter>
                </link-entity>
              </entity>
            </fetch>`);
        const first = rows[0];
        if (!first) return null;
        return {
            schemaName: (first.schemaname as string) ?? '',
            displayName: (first.displayname as string) ?? '',
        };
    } catch (err) {
        // Informativo: se non si riesce a leggere, non si blocca nulla (FR-089)
        log(`Impossibile verificare le environment variable della solution: ${err}`, 'warning');
        return null;
    }
}
