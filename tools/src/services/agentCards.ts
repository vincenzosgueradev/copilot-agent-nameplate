/// <reference types="@pptb/types" />

/**
 * Icona e descrizione dell'agent (spec 008) — **sola lettura**.
 *
 * L'icona sta in `bot.iconbase64`, la descrizione in `botcomponent.description` del componente
 * `<schema>.gpt.default` (verificato su un export reale, research §2). Il componente si
 * riconosce dal nome e dal genitore, mai da `componenttype` (valori non documentati).
 *
 * Quello che arriva da Dataverse finisce nella schermata, quindi si valida: l'icona diventa un
 * `data:image/png;base64,…` solo se e' davvero un PNG in base64 di lunghezza ammessa; la
 * descrizione e' solo testo e la schermata la scrive con `textContent` o la esce con escape.
 */

import type { AgentCard } from '../types';
import { fetchXml, type Row } from './dataverse';
import { log } from './log';
import { xmlValue } from './solutions';

/** Il limite della colonna `iconbase64`: oltre non puo' essere un valore di Dataverse. */
export const MAX_ICON_CHARS = 136_533;
export const MAX_DESCRIPTION = 2000;

const DATA_PREFIX = 'data:image/png;base64,';
/** I primi byte di ogni PNG (`\x89PNG\r\n\x1a\n`) in base64. */
const PNG_SIGNATURE = 'iVBORw0KGgo';
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/** Il `data:` URI da usare come `src`, oppure `null` se il valore non e' un PNG in base64 valido. */
export function isValidIcon(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    let value = raw.replace(/\s+/g, '');
    if (value.startsWith(DATA_PREFIX)) value = value.slice(DATA_PREFIX.length);
    if (!value || value.length > MAX_ICON_CHARS) return null;
    if (!BASE64_RE.test(value) || !value.startsWith(PNG_SIGNATURE)) return null;
    return DATA_PREFIX + value;
}

/** Testo su una riga, o `null` se non c'e' nulla da mostrare. Non toglie l'HTML: non lo interpreta mai. */
export function normalizeDescription(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text) return null;
    return text.length > MAX_DESCRIPTION ? text.slice(0, MAX_DESCRIPTION - 1) + '…' : text;
}

export interface CardTarget {
    id: string;
    schemaName: string;
    modifiedOn: string;
}

const EMPTY: AgentCard = { iconDataUri: null, description: null };
/** Per sessione: la voce vale finche' `modifiedOn` dell'agent coincide. */
const cache = new Map<string, { modifiedOn: string; card: AgentCard }>();

export function clearCardCache(): void {
    cache.clear();
}

/** La carta gia' letta per questo agent, se ancora valida. */
function cachedCard(agent: CardTarget): AgentCard | null {
    const hit = cache.get(agent.id);
    return hit && hit.modifiedOn === agent.modifiedOn ? hit.card : null;
}

const inValues = (ids: string[]): string => ids.map(id => `<value>${xmlValue(id)}</value>`).join('');

/**
 * Legge le carte degli agent indicati (una sola query per tabella, solo per quelli non in cache).
 * Se la lettura fallisce non lancia: torna cio' che c'e' in cache e scrive un avviso nel log.
 */
export async function loadAgentCards(agents: CardTarget[]): Promise<Map<string, AgentCard>> {
    const out = new Map<string, AgentCard>();
    const missing: CardTarget[] = [];
    for (const a of agents) {
        const hit = cachedCard(a);
        if (hit) out.set(a.id, hit); else missing.push(a);
    }
    if (!missing.length) return out;

    try {
        const ids = missing.map(a => a.id);
        const bots = await fetchXml(`
            <fetch>
              <entity name="bot">
                <attribute name="botid"/>
                <attribute name="iconbase64"/>
                <attribute name="modifiedon"/>
                <filter><condition attribute="botid" operator="in">${inValues(ids)}</condition></filter>
              </entity>
            </fetch>`);
        const components = await fetchXml(`
            <fetch>
              <entity name="botcomponent">
                <attribute name="botcomponentid"/>
                <attribute name="schemaname"/>
                <attribute name="description"/>
                <attribute name="parentbotid"/>
                <filter><condition attribute="parentbotid" operator="in">${inValues(ids)}</condition></filter>
              </entity>
            </fetch>`);

        const iconOf = new Map<string, unknown>();
        for (const row of bots as Row[]) iconOf.set(String(row.botid), row.iconbase64);
        const descriptionOf = new Map<string, unknown>();
        for (const row of components as Row[]) descriptionOf.set(String(row.schemaname), row.description);

        for (const a of missing) {
            const card: AgentCard = {
                iconDataUri: isValidIcon(iconOf.get(a.id)),
                description: normalizeDescription(descriptionOf.get(`${a.schemaName}.gpt.default`)),
            };
            cache.set(a.id, { modifiedOn: a.modifiedOn, card });
            out.set(a.id, card);
        }
    } catch (err) {
        log(`Could not read the agents' icon and description: ${String(err)}. Showing the default icon.`, 'warning');
        for (const a of missing) out.set(a.id, EMPTY);
    }
    return out;
}
