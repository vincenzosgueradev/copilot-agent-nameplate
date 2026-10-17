/**
 * `npm run test:full` imposta `TEST_FULL=1` e abilita le matrici esaustive (minuti).
 * Il default (`npm test`) usa la copertura di tutte le coppie + campioni (decine di secondi).
 *
 * Si legge `process` tramite `globalThis` perche' il tsconfig del tool non include i tipi di
 * Node, e non vale la pena aggiungerli solo per una variabile d'ambiente.
 */
export const FULL =
    (globalThis as { process?: { env: Record<string, string | undefined> } })
        .process?.env.TEST_FULL === '1';
