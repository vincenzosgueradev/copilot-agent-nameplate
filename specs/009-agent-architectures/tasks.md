# Tasks: architetture di agent

- [x] T001 Verificare le due architetture su export reali (research §1)
- [x] T002 Fixture: `AgentSpec.architecture` (harness: niente GPT/topic, componente di feedback)
- [x] T003 Test prima del codice: `architectures.test.ts` (15 falliti su 19 prima dell'implementazione)
- [x] T004 Baseline a profili; `types.ts`; `compat.ts` (raggruppamento, confronto per architettura, elementi uniti)
- [x] T005 Prova sugli export reali 1.0.0.12–.15: nessun avviso
- [x] T006 Mutazioni (009) in `scripts/mutation-check.mjs`: 6/6 scoperte
- [x] T007 Changelog, `specs/README.md`
- [ ] T008 `test:full` e `test:mutation` completi prima del rilascio

## Tracciabilità

| Requisito | Codice | Test |
|---|---|---|
| FR-001 raggruppo per architettura | `compat.ts` `architectureOf`, `computeFingerprint` | `architectures.test.ts` «si raggruppano», «non è un oggetto» |
| FR-002 profilo della sua architettura | `configurationDriftAgainstBaseline` | «NON sono accettate in un agent standard», «non è accettata in un harness», «package misto» |
| FR-003 una riga per architettura sconosciuta | idem | «un'architettura mai vista», «senza recognizer» |
| FR-004 chiavi opzionali | baseline `optionalKeys` | matrice «nessun falso allarme» |
| FR-005 precedente per architettura | `configurationDriftAgainstPrevious` | «confronto con il packaging precedente» |
| FR-006 elementi su tutti i file | `elementsOf` | «gli elementi si leggono da tutti i file» |
| FR-007 rename invariato | — | «il rename su un agent harness» |
| FR-008 nessuna scrittura | — | (nessun codice di scrittura aggiunto) |
