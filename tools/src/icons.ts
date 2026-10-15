/**
 * Icone SVG inline.
 *
 * Tratto (non riempimento) su `currentColor`: l'icona eredita il colore del testo che la
 * contiene, quindi segue il tema senza regole dedicate. Sostituiscono le emoji, che a
 * seconda del font si rendono come quadratini (FR-053).
 *
 * Griglia 16x16, stroke 1.5, estremi arrotondati: un unico set coerente in tutta l'app.
 */

export type IconName =
    | 'pencil'
    | 'search'
    | 'close'
    | 'bot'
    | 'chevron-up'
    | 'chevron-down'
    | 'arrow-left'
    | 'arrow-right'
    | 'check'
    | 'refresh'
    | 'minus'
    | 'package'
    | 'history'
    | 'download'
    | 'alert';

const PATHS: Record<IconName, string> = {
    'pencil': '<path d="M10.6 2.6a1.8 1.8 0 0 1 2.8 2.8L5.6 13.2 2 14l.8-3.6z"/>',
    'search': '<circle cx="7" cy="7" r="4.5"/><path d="M10.4 10.4 14 14"/>',
    'close': '<path d="M4 4l8 8M12 4l-8 8"/>',
    'bot': '<rect x="2.75" y="5.75" width="10.5" height="7.5" rx="2"/><path d="M8 5.75V3.5"/><circle cx="8" cy="2.5" r="1.1"/><path d="M5.9 9.2v.9M10.1 9.2v.9"/>',
    'chevron-up': '<path d="M4 10l4-4 4 4"/>',
    'chevron-down': '<path d="M4 6l4 4 4-4"/>',
    'arrow-left': '<path d="M13 8H3M6.5 4.5 3 8l3.5 3.5"/>',
    'arrow-right': '<path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5"/>',
    'check': '<path d="M3.5 8.5 6.5 11.5 12.5 4.5"/>',
    'refresh': '<path d="M13.5 8a5.5 5.5 0 1 1-1.7-3.95"/><path d="M13.6 2.2v3.1h-3.1"/>',
    'minus': '<path d="M4 8h8"/>',
    'package': '<path d="M8 1.75 14 5v6l-6 3.25L2 11V5z"/><path d="M2 5l6 3.25L14 5M8 8.25V14.5"/>',
    'history': '<path d="M2.6 8a5.4 5.4 0 1 0 1.7-3.9"/><path d="M2.4 2.2v3.1h3.1"/><path d="M8 5v3.2l2.2 1.3"/>',
    'download': '<path d="M8 2.5v7.5M5 7.5 8 10.5l3-3"/><path d="M2.75 12.5h10.5"/>',
    'alert': '<path d="M8 2.6 14.5 13.4h-13z"/><path d="M8 6.6v3M8 11.3v.01"/>',
};

/**
 * SVG inline pronto da concatenare in un template string.
 *
 * `xmlns` e' obbligatorio: senza, un passaggio per un serializzatore XML (l'host carica il
 * tool in un iframe via srcdoc) mette l'elemento nel namespace HTML invece che in quello SVG,
 * e il risultato e' un elemento che non disegna nulla. `width`/`height` espliciti fanno da
 * riserva se il CSS non arriva; le classi `icon--*` li sovrascrivono comunque.
 */
export function icon(name: IconName, cls = ''): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" class="icon${cls ? ' ' + cls : ''}"`
        + ` width="16" height="16" viewBox="0 0 16 16" fill="none"`
        + ` stroke="currentColor" stroke-width="1.5" stroke-linecap="round"`
        + ` stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}
