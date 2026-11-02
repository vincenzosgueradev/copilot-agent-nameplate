# Piano 018 — Schermate sobrie e pipeline viva

## Approccio
Quattro blocchi, ognuno verificato e committato da solo.
- **A. Revisione sobria**: `renderReviewStep` perde tabella e selettore; `reviewWarningsHtml` dà gli avvisi per ogni Target. `targetsSummaryHtml` si toglie (non serve più).
- **B. Popup**: `askConfirm` (`services/ui.ts`) riceve `icon`; `confirmVersionWrite` usa righe con icona (ambiente, solution, versione) e note con icona; la tabella dei package resta, con l'icona dell'archivio sul file. Nuove icone in `icons.ts` + `styles.css` (maschere su griglia 16x16, tratto 1.5).
- **C. Pipeline**: `packProgressHtml` produce passi numerati con linea di avanzamento; `styles.css` ha le animazioni, spente con `prefers-reduced-motion`.
- **D. Pulizia**: passata su Suffix, Anteprima, Controlli, Risultato; ogni frase tolta va in `research.md`.

## File toccati
`src/app.ts`, `src/services/ui.ts`, `src/icons.ts`, `src/styles.css`; test: `ui.review.test.ts` (nuovo) e quelli che leggevano la tabella della revisione; `scripts/mutation-check.mjs`.

## Fuori dal piano
Package, manifest, storico, Dataverse, impostazioni salvate.
