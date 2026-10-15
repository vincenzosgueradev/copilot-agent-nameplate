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
 * Qui i byte passano per il disco in base64 — `writeText` non chiede nulla — e un comando di
 * shell li riconverte in binario nella posizione giusta, cancellando il temporaneo. La sonda su
 * `writeBinary` resta: se una versione di PPTB la introdurra', quella strada e' preferibile e
 * viene presa senza altre modifiche.
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

/** Base64 a blocchi: `apply` su un array di centinaia di migliaia di byte sfonda lo stack. */
function toBase64(bytes: Uint8Array): string {
    let s = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(s);
}

/** Un solo terminale nascosto per tutta la sessione, creato alla prima necessita'. */
let termId: string | null = null;
async function shellId(): Promise<string> {
    if (termId) return termId;
    const t = await term.create({ name: 'Agent Rename Manager', visible: false });
    termId = t.id;
    return t.id;
}

async function run(command: string): Promise<void> {
    const r = await term.execute(await shellId(), command);
    if (r.exitCode !== undefined && r.exitCode !== 0) {
        throw new Error(`comando fallito (exit ${r.exitCode}): ${r.error || r.output || ''}`);
    }
}

/**
 * Apre la cartella nel file manager del sistema.
 *
 * `utils` espone solo appunti e notifiche, quindi non c'e' una via diretta: si passa di nuovo
 * dalla shell. `explorer` su Windows esce con codice 1 anche quando riesce, percio' qui l'esito
 * non viene controllato.
 */
export async function openFolder(path: string): Promise<void> {
    const opener = isWindows ? 'explorer'
        : /mac|darwin/i.test(globalThis.navigator?.userAgent ?? '') ? 'open'
        : 'xdg-open';
    await term.execute(await shellId(), `${opener} ${quote(path)}`);
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

    if (!toldAboutShell) {
        toldAboutShell = true;
        log('PPTB non espone una scrittura binaria: gli archivi vengono scritti in base64 e '
            + 'riconvertiti con un comando di shell, senza dialog.', 'info');
    }

    const tmp = `${path}.b64`;
    await fs.writeText(tmp, toBase64(bytes));

    if (isWindows) {
        // `powershell` invocato per nome: cosi' il comando regge sia che la shell del terminale
        // sia cmd sia che sia PowerShell. Niente `$` nella stringa, che la shell esterna
        // espanderebbe prima di passarla.
        await run(`powershell -NoProfile -Command "[IO.File]::WriteAllBytes(${quote(path)},`
            + `[Convert]::FromBase64String([IO.File]::ReadAllText(${quote(tmp)})));`
            + `[IO.File]::Delete(${quote(tmp)})"`);
    } else {
        await run(`base64 -d ${quote(tmp)} > ${quote(path)} && rm ${quote(tmp)}`);
    }
    return path;
}

let toldAboutShell = false;

/** Non serve piu' avvisare di nulla: la scrittura non apre dialog. */
export function warnAboutDialogs(_count: number): void { /* no-op */ }

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
