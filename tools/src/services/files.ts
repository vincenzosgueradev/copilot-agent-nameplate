/// <reference types="@pptb/types" />

/**
 * Scrittura su disco locale.
 *
 * **Vincolo della piattaforma**: `FileSystemAPI` non sa scrivere byte. Espone `readBinary` ma
 * non la controparte in scrittura; `writeText` codifica UTF-8 e corromperebbe uno zip; `saveFile`
 * apre **sempre** un dialog di salvataggio. Un artifact set ha fino a quattro archivi: per quella
 * strada sarebbero quattro dialog di fila, e il percorso proposto non regge i separatori misti,
 * tanto che i file finivano accanto alla cartella invece che dentro.
 *
 * **Nemmeno la shell e' una via d'uscita**: il terminale rifiuta gli interpreti e ogni
 * decodificatore base64 — `powershell`, `pwsh`, `cmd`, `certutil`, `node`, `python`, `perl` sono
 * tutti nella lista dei comandi bloccati ("Shell interpreters and privilege-escalation tools are
 * not allowed"). Scrivere byte senza passare dal dialog, con questa piattaforma, non si puo'.
 *
 * Resta quindi `saveFile`, un dialog per archivio, con il percorso in forma nativa perche' il
 * dialog lo risolva davvero. La sonda su `writeBinary` resta: se una versione di PPTB la
 * introdurra', quella strada e' preferibile e viene presa senza altre modifiche.
 */

import { log } from './log';

const fs = globalThis.toolboxAPI.fileSystem;
const term = globalThis.toolboxAPI.terminal;

/** `true` quando l'implementazione espone una scrittura binaria diretta. */
export function hasDirectBinaryWrite(): boolean {
    return typeof (fs as unknown as { writeBinary?: unknown }).writeBinary === 'function';
}

const isWindows = /win/i.test(globalThis.navigator?.userAgent ?? 'win');

/** Su Windows i comandi vogliono i backslash; i percorsi qui nascono con `/`. */
function nativePath(p: string): string {
    return isWindows ? p.replace(/\//g, '\\') : p;
}

/** Apice singolo raddoppiato: e' come PowerShell e le shell POSIX scappano l'apice. */
const quote = (p: string) => `'${nativePath(p).replace(/'/g, "''")}'`;

/** Un solo terminale nascosto per la sessione, creato alla prima necessita'. */
let termId: string | null = null;
async function shellId(): Promise<string> {
    if (termId) return termId;
    const t = await term.create({ name: 'Agent Rename Manager', visible: false });
    termId = t.id;
    return t.id;
}

/**
 * Apre la cartella nel file manager del sistema.
 *
 * `utils` espone solo appunti e notifiche, quindi non c'e' una via diretta: si passa dal
 * terminale. Funziona perche' `explorer` non e' fra i comandi bloccati, mentre `start` e `open`
 * lo sono: su macOS e Linux questo pulsante non ha una strada e il chiamante lo gestisce.
 * `explorer` esce con codice 1 anche quando riesce, percio' l'esito non viene controllato.
 */
export async function openFolder(path: string): Promise<void> {
    if (!isWindows) throw new Error('apertura della cartella non disponibile su questa piattaforma');
    await term.execute(await shellId(), `explorer ${quote(path)}`);
}

export async function ensureDirectory(path: string): Promise<void> {
    await fs.createDirectory(path);
}

/** `true` se il percorso esiste gia'. Serve a non sovrascrivere un artifact set (FR-074). */
export async function pathExists(path: string): Promise<boolean> {
    return fs.exists(path);
}

export async function selectFolder(title: string): Promise<string | null> {
    return fs.selectPath({ type: 'folder', title, buttonLabel: 'Usa questa cartella' });
}

export async function writeText(path: string, content: string): Promise<void> {
    await fs.writeText(path, content);
}

/**
 * Scrive byte su disco, senza chiedere nulla all'utente.
 *
 * Il temporaneo `.b64` sta accanto alla destinazione, non nella cartella temporanea di sistema:
 * cosi' resta dentro i percorsi a cui il tool ha gia' accesso, e se il comando fallisce il file
 * e' li' a dire cosa e' rimasto a meta'.
 *
 * `ReadAllText`/`WriteAllBytes` prendono percorsi letterali: `Get-Content` avrebbe trattato le
 * quadre di `[UAT]` come classe di caratteri e non avrebbe trovato il file.
 */
export async function writeBinary(path: string, bytes: Uint8Array): Promise<string | null> {
    const direct = (fs as unknown as {
        writeBinary?: (p: string, c: unknown) => Promise<void>;
    }).writeBinary;
    if (typeof direct === 'function') {
        await direct(path, bytes);
        return path;
    }

    // `defaultPath` con separatori misti non si risolve su Windows: il dialog ripiegava
    // sull'ultima cartella usata, ed e' cosi' che gli archivi finivano accanto alla cartella
    // dell'operazione invece che dentro.
    return fs.saveFile(nativePath(path), bytes,
        [{ name: 'Solution package', extensions: ['zip'] }]);
}

/** Avvisa una volta sola, perché il fallback si nota: un dialog per archivio. */
let warned = false;
export function warnAboutDialogs(count: number): void {
    if (warned || hasDirectBinaryWrite()) return;
    warned = true;
    log(`PPTB non espone una scrittura binaria e non consente a un tool di invocare una shell: `
        + `verranno chiesti ${count} salvataggi, uno per archivio. Il percorso è già compilato.`,
        'warning');
}

/** Chiude il terminale nascosto. Chiamata a fine sessione: un terminale orfano resta aperto. */
export async function disposeShell(): Promise<void> {
    if (!termId) return;
    try { await term.close(termId); } catch { /* gia' chiuso */ }
    termId = null;
}

/** Salva un oggetto come JSON indentato tramite il dialog. */
export async function saveJsonFile(fileName: string, data: unknown): Promise<string | null> {
    return fs.saveFile(fileName, JSON.stringify(data, null, 2));
}

/** Salva testo così com'è (CSV del log, manifest già serializzato, ...). */
export async function saveTextFile(fileName: string, text: string): Promise<string | null> {
    return fs.saveFile(fileName, text);
}
