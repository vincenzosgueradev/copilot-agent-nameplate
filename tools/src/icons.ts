/**
 * Icone.
 *
 * Un'icona e' uno `<span class="icon icon-<nome>">`: la forma arriva da `mask-image` in
 * styles.css, il colore da `background-color: currentColor`, quindi eredita il colore del
 * testo che la contiene e segue il tema senza regole dedicate.
 *
 * Perche' non `<svg>` inline: l'host carica il tool in una webview e gli elementi SVG inline
 * non vengono disegnati. Una maschera CSS e' un normale elemento HTML, quindi non dipende da
 * come l'host tratta l'SVG; il CSP dell'host ammette `data:` in `img-src`.
 *
 * Le forme stanno in styles.css (blocco `.icon-*`), generate su griglia 16x16 con tratto 1.5.
 * Aggiungendo un nome qui va aggiunta la regola corrispondente la'.
 */

export type IconName =
    | 'pencil'
    | 'search'
    | 'close'
    | 'bot'
    | 'github-copilot'
    | 'pin'
    | 'chevron-up'
    | 'chevron-down'
    | 'chevron-left'
    | 'chevron-right'
    | 'panel-right'
    | 'arrow-left'
    | 'arrow-right'
    | 'check'
    | 'refresh'
    | 'minus'
    | 'package'
    | 'history'
    | 'download'
    | 'alert'
    | 'folder'
    | 'archive'
    | 'file-json'
    | 'tag'
    | 'sliders'
    | 'shield'
    | 'send'
    | 'layers'
    | 'unmanaged'
    | 'managed'
    | 'all-solutions';

/** Markup dell'icona, pronto da concatenare in un template string. */
export function icon(name: IconName, cls = ''): string {
    return `<span class="icon icon-${name}${cls ? ' ' + cls : ''}" aria-hidden="true"></span>`;
}
