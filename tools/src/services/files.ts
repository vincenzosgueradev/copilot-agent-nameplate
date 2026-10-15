/// <reference types="@pptb/types" />

/**
 * Scrittura su disco locale.
 *
 * **Vincolo della piattaforma**: `FileSystemAPI` espone `writeText` (solo testo) e `saveFile`
 * (che apre un dialog). Non esiste, nei tipi pubblicati, una scrittura **binaria diretta**.
 * Un artifact set ha fino a quattro archivi: salvarli con `saveFile` significherebbe quattro
 * dialog di fila.
 *
 * Qui si tenta una `writeBinary` se l'implementazione la espone a runtime, e si ripiega su
 * `saveFile` altrimenti, dicendolo. La sonda non è un trucco: è l'unico modo di sfruttare una
 * capacità che potrebbe esserci senza dipendere da qualcosa che i tipi non garantiscono.
 */

import { log } from './log';

const fs = globalThis.toolboxAPI.fileSystem;

/** `true` quando l'implementazione espone una scrittura binaria diretta. */
export function hasDirectBinaryWrite(): boolean {
    return typeof (fs as unknown as { writeBinary?: unknown }).writeBinary === 'function';
}

export async function ensureDirectory(path: string): Promise<void> {
    await fs.createDirectory(path);
}

export async function selectFolder(title: string): Promise<string | null> {
    return fs.selectPath({ type: 'folder', title, buttonLabel: 'Usa questa cartella' });
}

export async function writeText(path: string, content: string): Promise<void> {
    await fs.writeText(path, content);
}

/**
 * Scrive byte su disco. Con la scrittura diretta disponibile non chiede nulla; altrimenti
 * apre il dialog di salvataggio, già compilato con il percorso di destinazione.
 *
 * Ritorna il percorso effettivo, o `null` se l'utente annulla il dialog.
 */
export async function writeBinary(path: string, bytes: Uint8Array): Promise<string | null> {
    const direct = (fs as unknown as {
        writeBinary?: (p: string, c: unknown) => Promise<void>;
    }).writeBinary;
    if (typeof direct === 'function') {
        await direct(path, bytes);
        return path;
    }
    return fs.saveFile(path, bytes, [{ name: 'Solution package', extensions: ['zip'] }]);
}

/** Avvisa una volta sola, perché il fallback si nota: un dialog per archivio. */
let warned = false;
export function warnAboutDialogs(count: number): void {
    if (warned || hasDirectBinaryWrite()) return;
    warned = true;
    log(`PPTB non espone una scrittura binaria diretta: verranno chiesti ${count} salvataggi, `
        + 'uno per archivio. Il percorso è già compilato.', 'warning');
}

/** Salva un oggetto come JSON indentato tramite il dialog. */
export async function saveJsonFile(fileName: string, data: unknown): Promise<string | null> {
    return fs.saveFile(fileName, JSON.stringify(data, null, 2));
}

/** Salva testo così com'è (CSV del log, manifest già serializzato, ...). */
export async function saveTextFile(fileName: string, text: string): Promise<string | null> {
    return fs.saveFile(fileName, text);
}
