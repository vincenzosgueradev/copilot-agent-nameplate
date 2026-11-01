# Tasks 015
- [x] T001 Nota sopra l'elenco: contenitore, regola, rendering (`index.html`, `styles.css`, `app.ts`)
- [x] T002 Tooltip e attenuazione delle righe managed (`app.ts`, `styles.css`)
- [x] T003 Banner della solution managed riscritto (`app.ts`)
- [x] T004 Test della schermata: matrice mondo × filtro, righe, banner (`test/ui.managed.test.ts`, `ui-harness.ts`)
- [x] T005 Mutazioni (`scripts/mutation-check.mjs`, gruppo `managed:`)
- [ ] T006 Prova a mano del quickstart su UAT e su DEV veri

## Tracciabilità
| Requisito | Codice | Test |
|---|---|---|
| FR-001 banner | `app.ts` (`notExportableBannerHtml`) | «nomina l'ambiente, spiega che è normale e dice cosa fare», «una solution unmanaged non mostra il banner» |
| FR-002 righe managed | `app.ts` (`renderSolutionsTable`), `styles.css` `.is-managed` | «vista All…», «vista Managed…», «vista Unmanaged…», «resta cliccabile» |
| FR-003 nota «a valle» | `app.ts` (`listNoticeKind`, `renderListNotice`) | matrice «mondo × filtro» (righe `only-managed`), «all'avvio…», «la nota dice quale ambiente…» |
| FR-004 nota «managed non sorgente» | `app.ts` (`listNoticeKind`) | matrice (righe `mixed`, `only-unmanaged`), «con unmanaged presenti…», «cambiando filtro…» |
| FR-005 testo, non HTML | `app.ts` (`escapeHtml`) | «il nome dell'ambiente è scritto come testo» (nota e banner) |
| FR-006 nessuna scrittura | — (nessun codice di scrittura aggiunto) | invariati i test «prima del salvataggio non viene scritto nulla» |
