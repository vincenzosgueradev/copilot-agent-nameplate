/**
 * Spec 008 — icona e descrizione dell'agent.
 *
 * Il valore arriva da Dataverse e finisce nella schermata: la validazione e' il confine di
 * sicurezza (FR-002, FR-003), quindi si prova con una matrice di ingressi buoni e cattivi.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { clearCardCache, isValidIcon, loadAgentCards, normalizeDescription, MAX_ICON_CHARS } from '../src/services/agentCards';

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

describe('normalizeDescription — matrice', () => {
    const cases: [string, unknown, string | null][] = [
        ['null', null, null], ['undefined', undefined, null], ['vuota', '', null], ['soli spazi', ' \t\r\n ', null],
        ['testo semplice', 'agente per utenti', 'agente per utenti'],
        ['spazi attorno', '  ciao  ', 'ciao'],
        ['a capo e tabulazioni', 'riga uno\r\nriga\tdue', 'riga uno riga due'],
        ['spazi multipli', 'a    b', 'a b'],
        ['HTML resta testo', '<b>x</b> & "y"', '<b>x</b> & "y"'],
        ['emoji', 'ciao 🙂', 'ciao 🙂'],
        ['numero', 5, null],
    ];
    for (const [label, raw, want] of cases) {
        it(label, () => expect(normalizeDescription(raw)).toBe(want));
    }

    it('2000 caratteri restano interi, di piu\' si tagliano con i puntini', () => {
        expect(normalizeDescription('a'.repeat(2000))).toBe('a'.repeat(2000));
        const cut = normalizeDescription('a'.repeat(2001))!;
        expect(cut.length).toBe(2000);
        expect(cut.endsWith('…')).toBe(true);
    });
});

// ── lettura ──────────────────────────────────────────────────────────────────

interface Reads { bot: string[][]; component: string[][] }

/** Un DEV finto per le due letture FetchXML: registra gli id chiesti. */
function fakeApi(opts: {
    bots: Record<string, { icon?: string; modifiedon?: string }>;
    components: { schemaname: string; description?: string | null }[];
    fail?: 'bot' | 'component';
}): Reads {
    const reads: Reads = { bot: [], component: [] };
    const api = (globalThis as unknown as { dataverseAPI: Record<string, unknown> }).dataverseAPI;
    api.fetchXmlQuery = async (xml: string) => {
        const ids = Array.from(xml.matchAll(/<value>([^<]*)<\/value>/g)).map(m => m[1]!);
        if (/entity name="bot"/.test(xml)) {
            reads.bot.push(ids);
            if (opts.fail === 'bot') throw new Error('403 forbidden');
            return { value: ids.filter(id => opts.bots[id]).map(id => ({
                botid: id, iconbase64: opts.bots[id]!.icon ?? null, modifiedon: opts.bots[id]!.modifiedon ?? 'm1',
            })) };
        }
        reads.component.push(ids);
        if (opts.fail === 'component') throw new Error('403 forbidden');
        return { value: opts.components };
    };
    return reads;
}

const agent = (n: number, modifiedOn = 'm1') => ({ id: `id-${n}`, schemaName: `ava_a${n}`, modifiedOn });

describe('loadAgentCards', () => {
    beforeEach(() => clearCardCache());

    it('una lettura per tabella, solo per gli agent chiesti', async () => {
        const reads = fakeApi({
            bots: { 'id-1': { icon: PNG }, 'id-2': {}, 'id-9': { icon: PNG } },
            components: [{ schemaname: 'ava_a1.gpt.default', description: 'uno' }],
        });
        const cards = await loadAgentCards([agent(1), agent(2)]);
        expect(reads.bot).toEqual([['id-1', 'id-2']]);
        expect(reads.component).toEqual([['id-1', 'id-2']]);
        expect(cards.get('id-1')).toEqual({ iconDataUri: PREFIX + PNG, description: 'uno' });
        expect(cards.get('id-2')).toEqual({ iconDataUri: null, description: null });
    });

    it('sceglie il componente GPT dell\'agent giusto: ne' + ' ignora altri, altri agent, nomi simili', async () => {
        fakeApi({
            bots: { 'id-1': {}, 'id-2': {} },
            components: [
                { schemaname: 'ava_a1.topic.Greeting', description: 'di un topic' },
                { schemaname: 'ava_a1.gpt.default', description: 'giusta' },
                { schemaname: 'ava_a10.gpt.default', description: 'di un altro agent' },
                { schemaname: 'ava_a2.gpt.other', description: 'non e il default' },
            ],
        });
        const cards = await loadAgentCards([agent(1), agent(2)]);
        expect(cards.get('id-1')!.description).toBe('giusta');
        expect(cards.get('id-2')!.description).toBeNull();
    });

    it('descrizione vuota o assente → nessuna descrizione', async () => {
        fakeApi({ bots: { 'id-1': {}, 'id-2': {} }, components: [
            { schemaname: 'ava_a1.gpt.default', description: '   ' }, { schemaname: 'ava_a2.gpt.default' }] });
        const cards = await loadAgentCards([agent(1), agent(2)]);
        expect(cards.get('id-1')!.description).toBeNull();
        expect(cards.get('id-2')!.description).toBeNull();
    });

    it('riaprire non rilegge; un agent modificato si rilegge da solo', async () => {
        const reads = fakeApi({ bots: { 'id-1': { icon: PNG }, 'id-2': {} }, components: [] });
        await loadAgentCards([agent(1), agent(2)]);
        await loadAgentCards([agent(1), agent(2)]);
        expect(reads.bot).toHaveLength(1);
        await loadAgentCards([agent(1), agent(2, 'm2')]);
        expect(reads.bot).toEqual([['id-1', 'id-2'], ['id-2']]);
    });

    it('nessun agent → nessuna lettura', async () => {
        const reads = fakeApi({ bots: {}, components: [] });
        expect((await loadAgentCards([])).size).toBe(0);
        expect(reads.bot).toHaveLength(0);
        expect(reads.component).toHaveLength(0);
    });

    for (const fail of ['bot', 'component'] as const) {
        it(`lettura fallita (${fail}): nessuna eccezione, carte vuote, niente in cache`, async () => {
            const reads = fakeApi({ bots: { 'id-1': { icon: PNG } }, components: [], fail });
            const cards = await loadAgentCards([agent(1)]);
            expect(cards.get('id-1') ?? { iconDataUri: null, description: null })
                .toEqual({ iconDataUri: null, description: null });
            await loadAgentCards([agent(1)]);
            expect(reads.bot.length + reads.component.length).toBeGreaterThan(fail === 'bot' ? 1 : 2);
        });
    }

    it('icona non valida → carta senza icona, ma la descrizione resta', async () => {
        fakeApi({ bots: { 'id-1': { icon: '/9j/4AAQ' } }, components: [{ schemaname: 'ava_a1.gpt.default', description: 'd' }] });
        expect((await loadAgentCards([agent(1)])).get('id-1')).toEqual({ iconDataUri: null, description: 'd' });
    });
});
