/// <reference types="@pptb/types" />

/**
 * PPTB dichiara le sue API su `window`. I servizi usano `globalThis`, che nel renderer è
 * lo stesso oggetto ma esiste anche dove `window` non c'è — il contesto headless, dove la
 * documentazione PPTB dice che la Web API è raggiungibile «via globalThis».
 *
 * Senza queste dichiarazioni TypeScript non trova le API su `globalThis` e l'inferenza
 * dei callback si perde per strada.
 */

declare global {
    // eslint-disable-next-line no-var
    var toolboxAPI: typeof window.toolboxAPI;
    // eslint-disable-next-line no-var
    var dataverseAPI: typeof window.dataverseAPI;
}

export {};
