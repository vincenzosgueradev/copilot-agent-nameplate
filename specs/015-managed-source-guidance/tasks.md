# Tasks 015
- [x] T001 Nota sopra l'elenco: contenitore, regola, rendering (`index.html`, `styles.css`, `app.ts`)
- [x] T002 Tooltip e attenuazione delle righe managed (`app.ts`, `styles.css`)
- [x] T003 Banner della solution managed riscritto (`app.ts`)
- [x] T004 Test della schermata: matrice mondo × filtro, righe, banner (`test/ui.managed.test.ts`, `ui-harness.ts`)
- [x] T005 Mutazioni (`scripts/mutation-check.mjs`, gruppo `managed:`)
- [x] T007 La riga degli agent senza solution non compare nella vista Managed (FR-007): test scritti prima e falliti, poi correzione (`app.ts`, `ui.managed.test.ts`, mutazioni)
- [x] T006 Prova a mano del quickstart su UAT e su DEV veri (2026-11-01): banner e nota su UAT in tema scuro e chiaro, vista Managed su DEV. Trovato e corretto FR-007 (agent orfani) e il testo sulle schede di PPTB. Non visto con gli occhi: righe managed attenuate nella vista All (DEV non ha managed); coperte solo dai test.

## Tracciabilità
| Requisito | Codice | Test |
|---|---|---|
| FR-001 banner | `app.ts` (`notExportableBannerHtml`) | «nomina l'ambiente, spiega che è normale e dice cosa fare», «una solution unmanaged non mostra il banner» |
| FR-002 righe managed | `app.ts` (`renderSolutionsTable`), `styles.css` `.is-managed` | «vista All…», «vista Managed…», «vista Unmanaged…», «resta cliccabile» |
| FR-003 nota «a valle» | `app.ts` (`listNoticeKind`, `renderListNotice`) | matrice «mondo × filtro» (righe `only-managed`), «all'avvio…», «la nota dice quale ambiente…» |
| FR-004 nota «managed non sorgente» | `app.ts` (`listNoticeKind`) | matrice (righe `mixed`, `only-unmanaged`), «con unmanaged presenti…», «cambiando filtro…» |
| FR-005 testo, non HTML | `app.ts` (`escapeHtml`) | «il nome dell'ambiente è scritto come testo» (nota e banner) |
| FR-007 niente agent orfani nella vista Managed | `app.ts` (`orphansInView`) | matrice «filtro × riga orfana», «0 managed: dice che non ce ne sono», «ricerca», «ambiente a valle» |
| FR-006 nessuna scrittura | — (nessun codice di scrittura aggiunto) | invariati i test «prima del salvataggio non viene scritto nulla» |
