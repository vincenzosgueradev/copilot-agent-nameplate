/**
 * Spec 008 — icona dell'agent.
 *
 * Il valore arriva da Dataverse e finisce nella schermata: la validazione e' il confine di
 * sicurezza (FR-002, FR-003), quindi si prova con una matrice di ingressi buoni e cattivi.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { agentKindOf, clearCardCache, isValidIcon, loadAgentCards, MAX_ICON_CHARS } from '../src/services/agentCards';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PREFIX = 'data:image/png;base64,';

describe('isValidIcon — matrice', () => {
    const good: [string, string][] = [
        ['PNG buono', PNG],
        ['con spazi attorno', `  ${PNG}  `],
        ['con a capo dentro', `${PNG.slice(0, 40)}\r\n${PNG.slice(40)}`],
        ['con prefisso data:', PREFIX + PNG],
    ];
    for (const [label, raw] of good) {
        it(`valida: ${label}`, () => expect(isValidIcon(raw)).toBe(PREFIX + PNG));
    }

    const bad: [string, unknown][] = [
        ['null', null], ['undefined', undefined], ['numero', 5], ['vuota', ''], ['solo spazi', '   \n '],
        ['JPEG', '/9j/4AAQSkZJRgABAQEASABIAAD/'], ['GIF', 'R0lGODlhAQABAAAAACw='],
        ['SVG', 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4='],
        ['testo', 'non e una immagine'],
        ['firma PNG ma carattere fuori alfabeto', PNG.slice(0, 30) + '<script>' + PNG.slice(30)],
        ['firma PNG con virgolette (uscita dall\'attributo)', PNG + '" onerror="x'],
        ['prefisso di un altro tipo', 'data:image/jpeg;base64,' + PNG],
        ['oltre il limite', 'iVBORw0KGgo' + 'A'.repeat(MAX_ICON_CHARS)],
    ];
    for (const [label, raw] of bad) {
        it(`rifiutata: ${label}`, () => expect(isValidIcon(raw)).toBeNull());
    }

    it('al limite esatto passa, un carattere oltre no', () => {
        const at = 'iVBORw0KGgo' + 'A'.repeat(MAX_ICON_CHARS - 11);
        expect(at.length).toBe(MAX_ICON_CHARS);
        expect(isValidIcon(at)).toBe(PREFIX + at);
        expect(isValidIcon(at + 'A')).toBeNull();
    });

    it('il risultato e\' sempre un data URI PNG e non contiene caratteri che escono da un attributo', () => {
        for (const raw of [PNG, PREFIX + PNG, ` ${PNG} `]) {
            const out = isValidIcon(raw)!;
            expect(out.startsWith(PREFIX)).toBe(true);
            expect(/["'<>\s]/.test(out)).toBe(false);
        }
    });
});

// ── lettura ──────────────────────────────────────────────────────────────────

interface Reads { bot: string[][] }

/** Un DEV finto per le due letture FetchXML: registra gli id chiesti. */
function fakeApi(opts: {
    bots: Record<string, { icon?: string; modifiedon?: string; template?: string | null }>;
    fail?: 'bot';
}): Reads {
    const reads: Reads = { bot: [] };
    const api = (globalThis as unknown as { dataverseAPI: Record<string, unknown> }).dataverseAPI;
    api.fetchXmlQuery = async (xml: string) => {
        const ids = Array.from(xml.matchAll(/<value>([^<]*)<\/value>/g)).map(m => m[1]!);
        if (/entity name="bot"/.test(xml)) {
            reads.bot.push(ids);
            if (opts.fail === 'bot') throw new Error('403 forbidden');
            return { value: ids.filter(id => opts.bots[id]).map(id => ({
                botid: id, iconbase64: opts.bots[id]!.icon ?? null, modifiedon: opts.bots[id]!.modifiedon ?? 'm1',
                template: opts.bots[id]!.template === undefined ? 'default-2.1.0' : opts.bots[id]!.template,
            })) };
        }
        throw new Error('query non prevista: ' + xml.slice(0, 80));
    };
    return reads;
}

const agent = (n: number, modifiedOn = 'm1') => ({ id: `id-${n}`, schemaName: `ava_a${n}`, modifiedOn });

describe('loadAgentCards', () => {
    beforeEach(() => clearCardCache());

    it('una sola lettura, solo per gli agent chiesti', async () => {
        const reads = fakeApi({ bots: { 'id-1': { icon: PNG }, 'id-2': {}, 'id-9': { icon: PNG } } });
        const cards = await loadAgentCards([agent(1), agent(2)]);
        expect(reads.bot).toEqual([['id-1', 'id-2']]);
        expect(cards.get('id-1')).toEqual({ iconDataUri: PREFIX + PNG, kind: 'standard' });
        expect(cards.get('id-2')).toEqual({ iconDataUri: null, kind: 'standard' });
    });

    it('riaprire non rilegge; un agent modificato si rilegge da solo', async () => {
        const reads = fakeApi({ bots: { 'id-1': { icon: PNG }, 'id-2': {} } });
        await loadAgentCards([agent(1), agent(2)]);
        await loadAgentCards([agent(1), agent(2)]);
        expect(reads.bot).toHaveLength(1);
        await loadAgentCards([agent(1), agent(2, 'm2')]);
        expect(reads.bot).toEqual([['id-1', 'id-2'], ['id-2']]);
    });

    it('nessun agent → nessuna lettura', async () => {
        const reads = fakeApi({ bots: {} });
        expect((await loadAgentCards([])).size).toBe(0);
        expect(reads.bot).toHaveLength(0);
    });

    it('lettura fallita: nessuna eccezione, carta senza icona, niente in cache', async () => {
        const reads = fakeApi({ bots: { 'id-1': { icon: PNG } }, fail: 'bot' });
        const cards = await loadAgentCards([agent(1)]);
        expect(cards.get('id-1')).toEqual({ iconDataUri: null, kind: 'unknown' });
        await loadAgentCards([agent(1)]);
        expect(reads.bot).toHaveLength(2);
    });

    it('icona non valida → carta senza icona', async () => {
        fakeApi({ bots: { 'id-1': { icon: '/9j/4AAQ' } } });
        expect((await loadAgentCards([agent(1)])).get('id-1')).toEqual({ iconDataUri: null, kind: 'standard' });
    });
});

// ── il tipo di agent (spec 010) ──────────────────────────────────────────────

/** L'oracolo: scritto dalla spec, non dal codice. */
const kindOracle = (raw: unknown): 'harness' | 'standard' | 'unknown' => {
    if (typeof raw !== 'string') return 'unknown';
    const v = raw.trim().toLowerCase();
    if (/^cliagent-/.test(v)) return 'harness';
    if (/^default-/.test(v)) return 'standard';
    return 'unknown';
};

describe('agentKindOf — matrice (FR-002, FR-003)', () => {
    const inputs: unknown[] = [
        'cliagent-1.0.0', 'default-2.1.0', 'cliagent-9.9.9', 'default-9.9', 'cliagent-', 'default-',
        'CLIAGENT-1.0.0', 'Default-2.1.0', '  cliagent-1.0.0  ', '\tdefault-2.1.0\n',
        'cliagent', 'default', 'cliagent1.0.0', 'xcliagent-1.0.0', 'cliagent_1.0.0', 'declarative-1.0.0',
        'weird', '', '   ', null, undefined, 5, {}, [], ['cliagent-1.0.0'],
    ];
    for (const raw of inputs) {
        it(`${JSON.stringify(raw)} → ${kindOracle(raw)}`, () => expect(agentKindOf(raw)).toBe(kindOracle(raw)));
    }

    it('il tipo non dipende da altro che dal template (nome e schema non contano)', () => {
        // la funzione prende solo il valore: un nome che contiene "cliagent-" non e' un input possibile
        expect(agentKindOf('default-2.1.0')).toBe('standard');
        expect(agentKindOf('weird cliagent-1.0.0')).toBe('unknown');
    });
});

describe('il tipo letto con la carta (FR-005, FR-006)', () => {
    beforeEach(() => clearCardCache());

    it('ogni agent ha il tipo del suo template, nella stessa lettura', async () => {
        const reads = fakeApi({ bots: {
            'id-1': { template: 'default-2.1.0' }, 'id-2': { template: 'cliagent-1.0.0' },
            'id-3': { template: 'weird' }, 'id-4': { template: null },
        } });
        const cards = await loadAgentCards([agent(1), agent(2), agent(3), agent(4)]);
        expect([1, 2, 3, 4].map(n => cards.get(`id-${n}`)!.kind)).toEqual(['standard', 'harness', 'unknown', 'unknown']);
        expect(reads.bot).toHaveLength(1);
    });

    it('una lettura fallita da tipo sconosciuto, mai standard', async () => {
        fakeApi({ bots: { 'id-1': { template: 'default-2.1.0' } }, fail: 'bot' });
        expect((await loadAgentCards([agent(1)])).get('id-1')!.kind).toBe('unknown');
    });

    it('la query chiede la colonna template', async () => {
        const api = (globalThis as unknown as { dataverseAPI: Record<string, unknown> }).dataverseAPI;
        fakeApi({ bots: { 'id-1': {} } });
        const inner = api.fetchXmlQuery as (xml: string) => Promise<unknown>;
        let seen = '';
        api.fetchXmlQuery = async (xml: string) => { seen = xml; return inner(xml); };
        await loadAgentCards([agent(1)]);
        expect(seen).toContain('<attribute name="template"/>');
    });
});
