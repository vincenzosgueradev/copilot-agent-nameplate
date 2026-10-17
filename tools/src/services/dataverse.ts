/// <reference types="@pptb/types" />

/**
 * Accesso a Dataverse — **sola lettura**.
 *
 * Questo modulo NON espone alcun metodo di scrittura, ed è deliberato. L'unica scrittura che il
 * tool fa, la versione della solution unmanaged in DEV prima dell'export (FR-067a), vive a parte in
 * `solutionVersion.ts`, cosi' resta una sola, visibile e dichiarata in spec. Il motivo: un `UPDATE` su un
 * componente che proviene da una managed solution crea un *unmanaged layer* nell'environment
 * di destinazione, che da quel momento vince su ogni upgrade successivo della solution
 * (FR-067, SC-010). Il rename avviene nel package, mai sui record.
 *
 * Se un giorno serve una scrittura, va discussa in spec prima che in codice.
 */

const dataverse = globalThis.dataverseAPI;

/** Una riga generica restituita dalla Web API. */
export type Row = Record<string, unknown>;

/**
 * Query OData con `$select` esplicito, seguendo `@odata.nextLink` fino in fondo.
 * Dataverse pagina a 5000 record: senza questo, le liste lunghe si troncano in silenzio.
 */
export async function queryAll(path: string): Promise<Row[]> {
    const rows: Row[] = [];
    let next: string | null = path;
    while (next) {
        const res = (await dataverse.queryData(next)) as {
            value?: Row[];
            '@odata.nextLink'?: string;
        };
        if (res.value) rows.push(...res.value);
        next = res['@odata.nextLink'] ?? null;
    }
    return rows;
}

/** FetchXML, per le query che OData non esprime bene (filtri `in` su molti id). */
export async function fetchXml(xml: string): Promise<Row[]> {
    const res = (await dataverse.fetchXmlQuery(xml)) as { value?: Row[] };
    return res.value ?? [];
}

/**
 * Azione unbound della Web API (`ExportSolution`, `ExportSolutionAsync`,
 * `DownloadSolutionExportData`).
 *
 * Non è una scrittura sui dati: l'export produce un file e non modifica l'environment.
 */
export async function callAction(name: string, parameters: Record<string, unknown>): Promise<Row> {
    return await dataverse.execute({
        operationName: name,
        operationType: 'action',
        parameters,
    });
}

/**
 * Traduce un errore di Dataverse in un messaggio che dice **cosa fare** (FR-018).
 * I privilegi mancanti sono il caso più frequente: l'export richiede almeno System Customizer.
 */
export function describeError(err: unknown): string {
    const text = String(err);
    if (/privilege|unauthorized|403|forbidden/i.test(text)) {
        return `Not enough permissions. Exporting a solution needs at least the role ` +
            `System Customizer sull'environment. Dettaglio: ${text}`;
    }
    if (/does not exist|not found|404/i.test(text)) {
        return `Record not found: it may have been deleted since the list was last refreshed ` +
            `. Detail: ${text}`;
    }
    return text;
}

/** Legge un singolo record (`entityset(<id>)?$select=...`), che non torna dentro `value`. */
export async function getOne(path: string): Promise<Row> {
    return (await dataverse.queryData(path)) as Row;
}
