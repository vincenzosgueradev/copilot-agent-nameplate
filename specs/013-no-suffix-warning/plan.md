# Piano 013 — Avviso "nessun suffisso"

## Approccio
Nessun dialogo nuovo: si estende `askConfirm` (`services/ui.ts`) con due opzioni, `warning` (variante di colore) e `cancelLabel`. Il click su Review nel passo Suffix (`app.ts`) controlla `state.suffix.trim()`; se vuoto chiama `confirmNoSuffix()`, che costruisce il corpo del dialogo dagli agent selezionati, e naviga solo se l'utente conferma.

## File toccati
- `tools/src/services/ui.ts`: opzioni `warning`, `cancelLabel`.
- `tools/src/app.ts`: `confirmNoSuffix()` e il gestore di `#next-btn` del passo Suffix.
- `tools/src/styles.css`: `.dialog--warning`, `.warn-*`.
- `tools/test/ui.nosuffix.test.ts`, `tools/test/helpers/ui-harness.ts` (`next()` conferma l'avviso, `nextRaw()` no), `tools/scripts/mutation-check.mjs`.

## Fuori dal piano
Nessuna modifica a package, patch o Dataverse: cambia solo il momento in cui si chiede conferma.
