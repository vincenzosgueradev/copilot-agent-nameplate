/**
 * Legge un file sorgente del tool come testo.
 *
 * Serve per i controlli strutturali sul CSS: Vitest sostituisce i file `.css` con una stringa
 * vuota, anche con `?raw`, quindi li si legge dal disco. Non si usa `new URL(.., import.meta.url)`
 * perche' Vite lo riscrive come riferimento a una risorsa. I test partono dalla cartella `agent-nameplate/`.
 */
import { readFileSync } from 'node:fs';

export const readSource = (relativeToSrc: string): string =>
    readFileSync(`${process.cwd()}/src/${relativeToSrc}`, 'utf8');
