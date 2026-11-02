# Piano 017 — Target «Production»

## Approccio
`Target` (`types.ts`) riceve il campo opzionale `production?: boolean`. Le funzioni pure di `services/targets.ts` lo gestiscono (leggere, rinominare, impostare, riconoscere «produzione senza suffisso»). `app.ts` mostra la casella sulla riga senza nome, e `confirmNoSuffix` scatta solo se tra i target spuntati ce n'è uno senza nome **non** marcato.

## File toccati
- `src/types.ts`: `Target.production`.
- `src/services/targets.ts`: `isProductionTarget`, `setTargetProduction`; `renameTarget` azzera; `parseTargets` e `saveTargets` leggono/scrivono il campo.
- `src/app.ts`: casella nella riga (`data-target-production`), gestore `change`, condizione di Review, etichetta nella tabella, testo di aiuto.
- `src/styles.css`: la casella nella riga.
- `test/targets.service.test.ts`, `test/ui.production.test.ts`, `test/helpers/ui-harness.ts`, `scripts/mutation-check.mjs`.

## Fuori dal piano
Nessuna modifica a package, patch, manifest o Dataverse.
