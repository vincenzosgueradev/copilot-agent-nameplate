# Piano 015 — Guida sulle solution managed

## Approccio
Solo schermata, nessun dato nuovo. Il tipo di solution (`Solution.isManaged`, `exportable`) e il nome della connessione (`state.connectionName`) sono già in memoria.

- `app.ts`: `listNoticeKind(filter, counts)` decide quale nota (regola unica, vedi tabella in `spec.md`); `renderListNotice` la scrive in `#solutions-notice` e la nasconde quando non serve; è chiamata da `renderTypeFilter`, che gira a ogni cambio di filtro o di dati. `renderSolutionsTable` aggiunge `title` alle righe managed e la classe `is-managed` solo nella vista All. `notExportableBannerHtml` riscritto (FR-001).
- `index.html`: contenitore `#solutions-notice` (nascosto) tra i filtri e la tabella.
- `styles.css`: `.list-note`, `.data-row.is-managed`.
- Il nome dell'ambiente passa sempre da `escapeHtml`.

## File toccati
`src/app.ts`, `src/index.html`, `src/styles.css`, `test/ui.managed.test.ts`, `test/helpers/ui-harness.ts` (terzo parametro di `boot`: nome della connessione), `scripts/mutation-check.mjs`.

## Fuori dal piano
Package, patch, Dataverse, storico, manifest: invariati.
