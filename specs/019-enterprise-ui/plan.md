# Piano 019 — Interfaccia enterprise

## Approccio
Quattro blocchi, ognuno verificato e committato da solo.
- **A. Stepper**: `stepperHtml` aggiunge `aria-current` e la classe `done` sulla linea; `styles.css` ridisegna cerchi, anello, bagliore e riempimento della linea.
- **B. Sezioni**: `data-panel` (id) e `data-info` (testo) sui `<section class="panel">`; `decoratePanels(container)` aggiunge il chevron e l'icona info all'intestazione e gestisce clic e tastiera; `state.collapsedPanels` conserva lo stato nella sessione.
- **C. Diff**: nuovo `services/diff.ts`, puro e senza I/O: `diffLines(a, b)` produce righe affiancate con numeri, pezzi evidenziati e righe di salto; `diffViewHtml` le disegna in due modi (split e unified). `changeGroupsHtml` mette il diff e la tabella in due schede per agent; i testi dei file arrivano da `applyPatch`.
- **D. Aspetto**: ritocco di riquadri, tessere e diff; tema chiaro.

## File toccati
`src/app.ts`, `src/services/diff.ts` (nuovo), `src/icons.ts`, `src/styles.css`, `src/index.html` (se serve); test: `diff.service.test.ts` (nuovo), `ui.stepper.test.ts`, `ui.panels.test.ts`, `ui.diff.test.ts` (nuovi) e quelli che leggevano la tabella; `scripts/mutation-check.mjs`.

## Fuori dal piano
Package, manifest, storico, Dataverse, impostazioni salvate.
